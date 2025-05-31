// In people-gpt-champion/pages/api/search.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmbeddingBreaker, chatCompletionBreaker } from '../../lib/openai'; // Updated imports
import { queryPineconeIndex } from '../../lib/pinecone'; // Already uses breaker internally
import { getCache, setCache } from '../../lib/redis';
import crypto from 'crypto';
import { SearchApiRequestBodySchema, SearchApiResponseSchema, ErrorResponseSchema } from '../../lib/schemas'; // Import Zod schemas
import { z } from 'zod'; // Import Zod for instanceof checks
import { PrismaClient, Candidate as PrismaCandidateModel } from '@prisma/client'; // Import Prisma Client

const prisma = new PrismaClient();

// people-gpt-champion/lib/schemas.ts (for reference, not to be changed here)
// export const ScoreBreakdownSchema = z.object({
//   skill_match: z.number().min(0).max(1),
//   experience_relevance: z.number().min(0).max(1),
//   cultural_fit: z.number().min(0).max(1),
// });

// interface Candidate {
//   id: string;
//   name: string;
//   title: string;
//   skills: string[];
//   match_score: number; // This will be the new weighted score
//   skill_match: number; // Individual score
//   experience_relevance: number; // Individual score
//   cultural_fit: number; // Individual score
//   score_breakdown: { // From ScoreBreakdownSchema
//     skill_match: number;
//     experience_relevance: number;
//     cultural_fit: number;
//   };
//   percentile_rank: number; // 0-100
//   reasoning: string;
//   source_url: string;
//   pinecone_score?: number;
// }

// Using the schema type directly for more robustness if it's exported
type Candidate = z.infer<typeof SearchApiResponseSchema>['candidates'][number];


// These interfaces are still useful for internal logic and type safety within the handler.
// The Zod schemas define the public contract of the API.
interface QueryParameters {
  keywords: string[];
  location?: string;
  skills?: string[];
}

// The main Candidate type will be inferred from SearchApiResponseSchema.candidates[number]
// Type for enriched candidate data used by scoring functions
// Assumes structure after merging Prisma data with Pinecone results.
// Prisma types are available via PrismaCandidateModel, WorkExperience, Education from @prisma/client
// but we map them to a consistent structure for scoring.
interface EnrichedCandidateData {
  id: string;
  name: string | null;
  title: string | null;
  skills: string[] | null; // Ensure this is string[] after merge
  workExperience?: PrismaCandidateModel['workExperience'] | null; // Use Prisma's generated type if available and suitable
  education?: PrismaCandidateModel['education'] | null; // Use Prisma's generated type
  raw_resume_text?: string | null;
  // profile_summary is effectively replaced by workExperience descriptions or raw_resume_text
  source_url: string | null;
  pinecone_score?: number;
}


type Data = z.infer<typeof SearchApiResponseSchema>; // Use Zod schema for response type

const API_OPERATION_TIMEOUT_MS = 20000; // 20 seconds

// Refined scoring functions
const calculateSkillMatch = (candidate: EnrichedCandidateData, parsedQuery: QueryParameters): number => {
  const candidateSkills = candidate.skills?.map(s => s.toLowerCase()) || [];
  const querySkills = parsedQuery.skills?.map(s => s.toLowerCase()) || [];

  if (querySkills.length === 0 || candidateSkills.length === 0) {
    return 0.1;
  }

  const matchedSkills = querySkills.filter(qs => candidateSkills.includes(qs));
  const matchCount = matchedSkills.length;

  // Score: 0.1 (base) + up to 0.8 for matching skills
  // Max score of 0.9 to leave room for other factors if this were part of a larger scheme
  const score = 0.1 + 0.8 * (matchCount / querySkills.length);
  return Math.min(score, 0.9); // Ensure it doesn't exceed 0.9
};

const calculateExperienceRelevance = (candidate: EnrichedCandidateData, parsedQuery: QueryParameters): number => {
  const workExperience = candidate.workExperience;
  const keywords = parsedQuery.keywords?.map(k => k.toLowerCase()) || [];

  if (!workExperience || workExperience.length === 0 || keywords.length === 0) {
    return 0.1;
  }

  let relevanceScore = 0.1;
  let keywordInTitle = false;
  let keywordInDescription = false;

  for (const job of workExperience) {
    const title = job.title?.toLowerCase() || '';
    const description = job.description?.toLowerCase() || '';

    for (const keyword of keywords) {
      if (title.includes(keyword)) {
        keywordInTitle = true;
      }
      if (description.includes(keyword)) {
        keywordInDescription = true;
      }
    }
  }

  if (keywordInTitle) {
    relevanceScore = 0.7; // Higher score if keywords match job titles
  } else if (keywordInDescription) {
    relevanceScore = 0.5; // Moderate score if keywords match job descriptions
  }

  return Math.min(relevanceScore, 0.8); // Clamp max score e.g. 0.8
};

const calculateCulturalFit = (candidate: EnrichedCandidateData, parsedQuery: QueryParameters): number => {
  let textContent = candidate.raw_resume_text || "";
  if (!textContent && candidate.workExperience) {
    textContent = candidate.workExperience.map(job => job.description || "").join(" ");
  }

  if (textContent.trim().length > 0) {
    // Basic placeholder: if there's text, give a moderate, slightly randomized score.
    // A real implementation would involve more sophisticated analysis or keywords.
    return 0.4 + Math.random() * 0.2; // Score between 0.4 and 0.6
  }

  return 0.1; // Low score if no relevant text content found
};


export default async function handler(
  req: NextApiRequest,
  // Ensure the response type can handle both success (Data) and Zod validation errors for the request
  res: NextApiResponse<Data | { error: string; issues?: z.ZodIssue[] }>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Validate request body
  const validationResult = SearchApiRequestBodySchema.safeParse(req.body);
  if (!validationResult.success) {
    console.warn('Request body validation failed:', validationResult.error.issues);
    return res.status(400).json({
      error: "Invalid request body.",
      issues: validationResult.error.issues // Send Zod issues to client
    });
  }

  // Use validated data, including weights
  const { query, weights } = validationResult.data;
  const { w_skill, w_experience, w_culture } = weights || { w_skill: 0.4, w_experience: 0.3, w_culture: 0.3 }; // Default weights

  const cacheKey = `search-v4-hybrid:${crypto.createHash('md5').update(query.toLowerCase() + JSON.stringify(weights || {})).digest('hex')}`; // Include weights in cache key

  try {
    // 1. Check Cache
    const cachedData = await getCache<Data>(cacheKey); // Data type is now inferred from SearchApiResponseSchema
    if (cachedData) {
      console.log(`Cache hit for query: "${query}", weights: ${JSON.stringify(weights)} (key: ${cacheKey})`);
      res.setHeader('X-Cache-Status', 'HIT');
      // Validate cached data before returning - ensures schema consistency over time
      const validation = SearchApiResponseSchema.safeParse(cachedData);
      if (validation.success) {
        return res.status(200).json(validation.data);
      } else {
        console.warn(`Invalid data in cache for key ${cacheKey}. Fetching fresh data. Issues:`, validation.error.issues);
        // If cache is invalid, proceed to fetch fresh data (effectively a cache miss)
        res.setHeader('X-Cache-Status', 'STALE_INVALID'); // Custom header for observability
      }
    }
    if (!res.getHeader('X-Cache-Status')) { // If not HIT or STALE_INVALID
        console.log(`Cache miss for query: "${query}", weights: ${JSON.stringify(weights)} (key: ${cacheKey})`);
        res.setHeader('X-Cache-Status', 'MISS');
    }


    let operationTimedOut = false;
    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => { // Changed Promise<Data> to Promise<never>
      timeoutId = setTimeout(() => {
        operationTimedOut = true;
        console.error(`Search operation timed out for query: "${query}" after ${API_OPERATION_TIMEOUT_MS / 1000}s`);
        reject(new Error(`Search operation timed out after ${API_OPERATION_TIMEOUT_MS / 1000}s. Please try again later.`));
      }, API_OPERATION_TIMEOUT_MS);
    });

    const searchLogic = async (): Promise<Data> => { // Return type is Data (inferred from SearchApiResponseSchema)
      // 1. Query Understanding (GPT-4) - Remains the same
      const systemPromptParse = `
You are an intelligent assistant that parses user queries for a candidate search system.
Extract relevant parameters from the user's query and return them as a JSON object.
The JSON object should conform to the following TypeScript interface:
interface QueryParameters {
  keywords: string[]; // Main terms, names, or roles
  location?: string; // Desired location
  skills?: string[]; // Specific skills
}
If a parameter is not mentioned, omit it from the JSON object.
Example: "Find a software engineer in London with React and Node.js skills"
Output: { "keywords": ["software engineer"], "location": "London", "skills": ["React", "Node.js"] }`;
      const parseParams = {
        model: 'gpt-4',
        messages: [{ role: 'system', content: systemPromptParse }, { role: 'user', content: query }],
        response_format: { type: "json_object" as const },
      };
      if (operationTimedOut) throw new Error("Timeout before query parsing.");
      const chatCompletionParse = await chatCompletionBreaker.fire(parseParams);
      const gptResponseParse = chatCompletionParse.choices[0]?.message?.content;
      if (!gptResponseParse) throw new Error('GPT-4 query parsing failed to return content.');
      let parsedQuery: QueryParameters = JSON.parse(gptResponseParse);

      // 2. Embedding Generation (OpenAI) - Remains the same
      const textToEmbed = parsedQuery.keywords?.length ? parsedQuery.keywords.join(' ') : query;
      if (operationTimedOut) throw new Error("Timeout before embedding generation.");
      const embedding = await getEmbeddingBreaker.fire(textToEmbed);
      if (!embedding || embedding.length === 0) throw new Error('Embedding generation failed.');

      // 3. Vector Retrieval (Pinecone) - Remains the same
      if (operationTimedOut) throw new Error("Timeout before Pinecone query.");
      const pineconeMatches = await queryPineconeIndex(embedding, 20); // Fetch top N, e.g., 20

      if (pineconeMatches.length === 0) {
        if (operationTimedOut) throw new Error("Timeout before setting cache for no results.");
        const noResultsData: Data = { candidates: [], parsedQuery, message: 'No candidates found matching your query.' };
        await setCache(cacheKey, noResultsData);
        return noResultsData;
      }

      const pineconeCandidateIds = pineconeMatches.map(match => match.id);

      if (operationTimedOut) throw new Error("Timeout before Prisma query.");
      // Fetch full candidate details from Prisma
      const prismaCandidates = await prisma.candidate.findMany({
        where: { id: { in: pineconeCandidateIds } },
      });
      const prismaCandidatesMap = new Map(prismaCandidates.map(pc => [pc.id, pc]));

      // Merge Pinecone matches with Prisma data
      // The EnrichedCandidateData type is now used for what scoring functions expect.
      const enrichedCandidates: EnrichedCandidateData[] = pineconeMatches.map(match => {
        const prismaData = prismaCandidatesMap.get(match.id);
        if (!prismaData) {
          console.warn(`Candidate ID ${match.id} from Pinecone not found in Prisma. Skipping.`);
          return null;
        }
        // Map Prisma data to EnrichedCandidateData structure
        // Ensure `skills` is string[]. If Prisma stores it as JSON, parse it.
        // For this example, assume prismaData.skills is already string[] or null.
        // Assume prismaData.workExperience and prismaData.education are compatible with Prisma's generated types.
        // Assume prismaData.raw_resume_text exists.
        let candidateSkills: string[] | null = null;
        if (Array.isArray(prismaData.skills)) {
            candidateSkills = prismaData.skills as string[];
        } else if (typeof prismaData.skills === 'string') {
            // Attempt to parse if skills might be stored as a JSON string like "[\"skill1\", \"skill2\"]"
            try {
                const parsedSkills = JSON.parse(prismaData.skills);
                if (Array.isArray(parsedSkills) && parsedSkills.every(s => typeof s === 'string')) {
                    candidateSkills = parsedSkills;
                } else {
                    candidateSkills = [prismaData.skills]; // Fallback to treating it as a single skill string in an array
                }
            } catch (e) {
                 // If not a JSON string, and it's a single skill string, wrap in array. Otherwise, default to empty or null.
                 candidateSkills = prismaData.skills ? [prismaData.skills] : null;
            }
        }


        return {
          id: prismaData.id,
          name: prismaData.name ?? null, // Use ?? for nullish coalescing
          title: prismaData.title ?? null,
          skills: candidateSkills,
          workExperience: (prismaData as any).workExperience ?? null, // Cast if not directly on PrismaCandidateModel or ensure it is
          education: (prismaData as any).education ?? null,
          raw_resume_text: (prismaData as any).raw_resume_text ?? null,
          source_url: prismaData.source_url ?? null,
          pinecone_score: match.score,
        };
      }).filter(Boolean) as EnrichedCandidateData[]; // Filter out nulls

      if (enrichedCandidates.length === 0) {
        if (operationTimedOut) throw new Error("Timeout before setting cache for no (enriched) results.");
        const noResultsData: Data = { candidates: [], parsedQuery, message: 'No enriched candidates found matching your query.' };
        await setCache(cacheKey, noResultsData);
        return noResultsData;
      }

      // 4. New Multi-Factor Scoring (operates on enrichedCandidates)
      const scoredCandidates: Candidate[] = enrichedCandidates.map(cand => {
        // Cast `cand` to `EnrichedCandidateData` if necessary, though it should already conform
        const candidateDataForScoring: EnrichedCandidateData = cand;

        const skill_match = calculateSkillMatch(candidateDataForScoring, parsedQuery);
        const experience_relevance = calculateExperienceRelevance(candidateDataForScoring, parsedQuery);
        const cultural_fit = calculateCulturalFit(candidateDataForScoring, parsedQuery);

        const weighted_score = (w_skill * skill_match) +
                               (w_experience * experience_relevance) +
                               (w_culture * cultural_fit);

        let reasoningParts: string[] = [];
        if (skill_match > 0.65) reasoningParts.push("Strong skill match.");
        else if (skill_match > 0.3) reasoningParts.push("Moderate skill overlap.");
        if (experience_relevance > 0.6) reasoningParts.push("Relevant experience found.");
        else if (experience_relevance > 0.3) reasoningParts.push("Some relevant experience.");
        if (cultural_fit > 0.5) reasoningParts.push("Potential cultural fit indicated.");

        const reasoning = reasoningParts.length > 0 ? reasoningParts.join(' ') : "Overall assessment based on profile.";

        // Assign a random percentile rank (placeholder) - will be replaced by client-side calculation
        const percentile_rank = Math.random() * (95 - 70) + 70;

        // Map back to the final Candidate structure expected by the API response schema
        // This must include all fields from CandidateSchema in lib/schemas.ts
        return {
          id: cand.id,
          name: cand.name ?? 'N/A', // Ensure no nulls for basic fields if schema doesn't allow
          title: cand.title ?? 'N/A',
          skills: cand.skills ?? [], // Ensure skills is an array

          // Contact and other new fields from Prisma, if they exist on cand (EnrichedCandidateData)
          // These would typically come from prismaData and need to be on EnrichedCandidateData
          // For now, they are not explicitly on EnrichedCandidateData, so they'd be undefined
          // and Zod validation for the response would fail if they are not optional/nullable in CandidateSchema.
          // The CandidateSchema in lib/schemas.ts HAS made them optional/nullable.
          phone: (cand as any).phone ?? null,
          address: (cand as any).address ?? null,
          workExperience: (cand as any).workExperience ?? null,
          education: (cand as any).education ?? null,
          certifications: (cand as any).certifications ?? null,
          raw_resume_text: (cand as any).raw_resume_text ?? null,

          match_score: parseFloat(weighted_score.toFixed(3)),
          skill_match: parseFloat(skill_match.toFixed(3)),
          experience_relevance: parseFloat(experience_relevance.toFixed(3)),
          cultural_fit: parseFloat(cultural_fit.toFixed(3)),
          score_breakdown: { // This should match ScoreBreakdownSchema
            skill_match: parseFloat(skill_match.toFixed(3)),
            experience_relevance: parseFloat(experience_relevance.toFixed(3)),
            cultural_fit: parseFloat(cultural_fit.toFixed(3)),
          },
          percentile_rank: parseFloat(percentile_rank.toFixed(2)), // API still sends a placeholder
          reasoning: reasoning,
          source_url: cand.source_url ?? '#',
          pinecone_score: cand.pinecone_score,
        };
      });

      // Sort candidates by the new weighted match_score
      scoredCandidates.sort((a, b) => b.match_score - a.match_score);

      if (operationTimedOut) throw new Error("Timeout before setting final cache.");
      const resultData: Data = { candidates: scoredCandidates, parsedQuery };
      await setCache(cacheKey, resultData);

      // Validate successful response before sending
      const responseValidation = SearchApiResponseSchema.safeParse(resultData);
      if (!responseValidation.success) {
         console.error("API response validation failed. Issues:", responseValidation.error.issues);
         // In a production environment, you might want to throw an error here
         // or return a generic error to the client, rather than potentially sending
         // a malformed response. For now, we'll log and send the (potentially malformed) data.
         // Example: throw new Error("Internal server error: Response data does not match schema.");
      }
      // Return the original resultData even if validation fails, for now.
      // Or, if validation is critical: return responseValidation.success ? responseValidation.data : throw_error_or_default;
      return resultData; // resultData should conform to Data (SearchApiResponseSchema)
    };

    try {
        const result = await Promise.race([searchLogic(), timeoutPromise]);
        clearTimeout(timeoutId!); // Clear timeout once searchLogic resolves or rejects
        // The result should already be validated by SearchApiResponseSchema within searchLogic or by cache check
        res.status(200).json(result);
    } catch (e:any) {
        clearTimeout(timeoutId!); // Ensure timeout is cleared on error too
        if (operationTimedOut) { // Check if the error was due to our timeoutPromise
            return res.status(504).json({ error: e.message || `Search operation timed out after ${API_OPERATION_TIMEOUT_MS / 1000}s` });
        }
        // For other errors, re-throw to be caught by the outer try-catch for standardized error response
        throw e;
    }

  } catch (error: any) {
    // Log error with query and cache key for better debugging context
    console.error(`Search API error for query "${query}", weights: ${JSON.stringify(weights || {})} (Cache Key: ${cacheKey}):`, error);

    let statusCode = 500;
    let errorMessage = 'An unexpected error occurred processing your search. Please try again later.';

    if (error.code === 'EOPENBREAKER') {
      statusCode = 503; // Service Unavailable
      errorMessage = `Service temporarily unavailable due to open circuit: ${error.message.substring(0,100)}... Please try again later.`;
    } else if (error.message && error.message.toLowerCase().includes('timed out')) {
      statusCode = 504; // Gateway Timeout
      errorMessage = error.message; // Use the specific timeout message
    } else if (error instanceof z.ZodError) { // This should ideally be caught by earlier validation
      statusCode = 400; // Bad Request
      errorMessage = "Invalid data format encountered."; // Generic message for Zod errors caught late
      // Consider logging error.issues here for server-side details
    }
    // For other errors, the generic 500 message and status code remain.

    // Ensure that `parsedQuery` is not part of the error response by default,
    // unless specifically handled by ErrorResponseSchema if it were to include it.
    // ErrorResponseSchema defines error: string, and optionally parsedQuery: z.undefined().optional()
    // So, we should not send parsedQuery here.
    res.status(statusCode).json(ErrorResponseSchema.parse({ error: errorMessage }));
  }
}
