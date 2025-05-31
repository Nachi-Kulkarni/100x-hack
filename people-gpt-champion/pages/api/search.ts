// In people-gpt-champion/pages/api/search.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmbeddingBreaker, chatCompletionBreaker } from '../../lib/openai'; // Updated imports
import { queryPineconeIndex } from '../../lib/pinecone'; // Already uses breaker internally
import { getCache, setCache } from '../../lib/redis';
import crypto from 'crypto';
import { SearchApiRequestBodySchema, SearchApiResponseSchema, ErrorResponseSchema } from '../../lib/schemas'; // Import Zod schemas
import { z } from 'zod'; // Import Zod for instanceof checks

// These interfaces are still useful for internal logic and type safety within the handler.
// The Zod schemas define the public contract of the API.
interface QueryParameters {
  keywords: string[];
  location?: string;
  skills?: string[];
}

interface Candidate {
  id: string;
  name: string;
  title: string;
  skills: string[];
  match_score: number;
  reasoning: string;
  source_url: string;
  pinecone_score?: number;
}

type Data = {
  candidates?: Candidate[];
  parsedQuery?: QueryParameters;
  error?: string;
  message?: string;
};

const API_OPERATION_TIMEOUT_MS = 20000; // 20 seconds

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data | { error: string; issues?: any[] }> // Update response type for Zod errors
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Validate request body
  const validationResult = SearchApiRequestBodySchema.safeParse(req.body);
  if (!validationResult.success) {
    // Log the detailed validation error for server-side debugging
    console.warn('Request body validation failed:', validationResult.error.issues);
    return res.status(400).json({
      error: "Invalid request body. Ensure 'query' is a non-empty string.",
      // Optionally, you can include issues in the response, but be cautious about exposing too much detail.
      // issues: validationResult.error.issues
    });
  }

  const { query } = validationResult.data; // Use validated data (this is the validated and typed query)

  const cacheKey = `search-v2:${crypto.createHash('md5').update(query.toLowerCase()).digest('hex')}`; // query is now from validated data

  try {
    // 1. Check Cache
    const cachedData = await getCache<Data>(cacheKey);
    if (cachedData) {
      console.log(`Cache hit for query: "${query}" (key: ${cacheKey})`);
      res.setHeader('X-Cache-Status', 'HIT');
      return res.status(200).json(cachedData);
    }
    console.log(`Cache miss for query: "${query}" (key: ${cacheKey})`);
    res.setHeader('X-Cache-Status', 'MISS');

    let operationTimedOut = false;
    let timeoutId: NodeJS.Timeout;

    const timeoutPromise = new Promise<Data>((_, reject) => {
      timeoutId = setTimeout(() => {
        operationTimedOut = true;
        console.error(`Search operation timed out for query: "${query}" after ${API_OPERATION_TIMEOUT_MS / 1000}s`);
        reject(new Error(`Search operation timed out after ${API_OPERATION_TIMEOUT_MS / 1000}s. Please try again later.`));
      }, API_OPERATION_TIMEOUT_MS);
    });

    const searchLogic = async (): Promise<Data> => {
      // 1. Query Understanding (GPT-4)
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

      // 2. Embedding Generation (OpenAI)
      const textToEmbed = parsedQuery.keywords?.length ? parsedQuery.keywords.join(' ') : query;
      if (operationTimedOut) throw new Error("Timeout before embedding generation.");
      const embedding = await getEmbeddingBreaker.fire(textToEmbed);
      if (!embedding || embedding.length === 0) throw new Error('Embedding generation failed.');

      // 3. Vector Retrieval (Pinecone)
      if (operationTimedOut) throw new Error("Timeout before Pinecone query.");
      const pineconeMatches = await queryPineconeIndex(embedding, 20);

      if (pineconeMatches.length === 0) {
        if (operationTimedOut) throw new Error("Timeout before setting cache for no results.");
        const noResultsData: Data = { candidates: [], parsedQuery, message: 'No candidates found matching your query.' };
        await setCache(cacheKey, noResultsData);
        return noResultsData;
      }

      const candidatesForReRanking = pineconeMatches.map(match => ({
        id: match.id,
        pinecone_score: match.score,
        name: match.metadata?.name || 'N/A',
        title: match.metadata?.title || 'N/A',
        skills: Array.isArray(match.metadata?.skills) ? match.metadata.skills : (match.metadata?.skills ? [String(match.metadata.skills)] : []),
        profile_summary: match.metadata?.summary || '',
        source_url: match.metadata?.source_url || '#',
      }));

      // 4. LLM Re-ranking (GPT-4)
      const reRankCandidatesPayload = candidatesForReRanking.map(c => ({
        id: c.id, name: c.name, title: c.title, skills: c.skills,
        profile_summary: c.profile_summary.substring(0, 300)
      }));
      const systemPromptReRank = `
You are a sophisticated AI hiring assistant. Re-rank candidates for the query: "${query.substring(0,100)}"
Candidates: ${JSON.stringify(reRankCandidatesPayload)}
Return JSON array: [{ "id": string, "match_score": number (0.0-1.0), "reasoning": string (brief) }]
Sort by match_score descending. Only include relevant candidates.`;
      const reRankParams = {
        model: 'gpt-4',
        messages: [{ role: 'system', content: systemPromptReRank }],
        response_format: { type: "json_object" as const },
      };
      if (operationTimedOut) throw new Error("Timeout before re-ranking.");
      const chatCompletionReRank = await chatCompletionBreaker.fire(reRankParams);
      const gptResponseReRank = chatCompletionReRank.choices[0]?.message?.content;
      if (!gptResponseReRank) throw new Error('GPT-4 re-ranking failed to return content.');

      let reRankedResults: Array<{ id: string; match_score: number; reasoning: string }>;
      const parsedGptReRankResponse = JSON.parse(gptResponseReRank);
      if (Array.isArray(parsedGptReRankResponse)) {
          reRankedResults = parsedGptReRankResponse;
      } else if (parsedGptReRankResponse.ranked_candidates && Array.isArray(parsedGptReRankResponse.ranked_candidates)) {
          reRankedResults = parsedGptReRankResponse.ranked_candidates;
      } else if (parsedGptReRankResponse.candidates && Array.isArray(parsedGptReRankResponse.candidates)) {
          reRankedResults = parsedGptReRankResponse.candidates;
      }
       else {
          console.warn("Unexpected GPT-4 re-ranking structure:", parsedGptReRankResponse);
          throw new Error('Failed to parse re-ranking results due to unexpected structure.');
      }

      const finalCandidatesMap = new Map(candidatesForReRanking.map(c => [c.id, c]));
      const finalCandidates: Candidate[] = reRankedResults.map(rankedItem => {
        const originalCandidate = finalCandidatesMap.get(rankedItem.id);
        if (!originalCandidate) return null; // Should not happen if GPT is well-behaved
        return {
          ...originalCandidate,
          match_score: rankedItem.match_score,
          reasoning: rankedItem.reasoning,
          id: originalCandidate.id,
          name: originalCandidate.name,
          title: originalCandidate.title,
          skills: originalCandidate.skills,
          source_url: originalCandidate.source_url,
          pinecone_score: originalCandidate.pinecone_score,
        };
      }).filter(Boolean) as Candidate[]; // filter out nulls

      finalCandidates.sort((a, b) => b.match_score - a.match_score);

      if (operationTimedOut) throw new Error("Timeout before setting final cache.");
      const resultData: Data = { candidates: finalCandidates, parsedQuery };
      await setCache(cacheKey, resultData);

      // Optional: Validate successful response before sending (useful for debugging)
      // const responseValidation = SearchApiResponseSchema.safeParse(resultData);
      // if (!responseValidation.success) {
      //   console.error("Successful response validation failed:", responseValidation.error.issues);
      //   // Decide how to handle this. For now, just log.
      //   // In a stricter setup, you might throw an error or return a generic error to the client.
      // }
      return resultData;
    };

    try {
        const result = await Promise.race([searchLogic(), timeoutPromise]);
        clearTimeout(timeoutId!);
        // Assuming `result` aligns with `Data` which should align with `SearchApiResponseSchema`
        res.status(200).json(result);
    } catch (e:any) {
        clearTimeout(timeoutId!);
        if (operationTimedOut) {
            return res.status(504).json({ error: e.message || `Search operation timed out after ${API_OPERATION_TIMEOUT_MS / 1000}s` });
        }
        // Re-throw to be caught by the outer try-catch, which will handle formatting the error response.
        // The outer catch block standardizes error responses.
        throw e;
    }

  } catch (error: any) {
    console.error(`Search API error for query "${query}" (Cache Key: ${cacheKey}):`, error);

    let statusCode = 500;
    let errorMessage = 'An unexpected error occurred processing your search. Please try again later.';

    if (error.code === 'EOPENBREAKER') {
      statusCode = 503;
      errorMessage = `Service temporarily unavailable due to open circuit: ${error.message.substring(0,100)}... Please try again later.`;
    } else if (error.message && error.message.toLowerCase().includes('timed out')) {
      // This catches both our API operation timeout and potentially timeouts from circuit breakers if not caught by EOPENBREAKER
      statusCode = 504;
      errorMessage = error.message;
    } else if (error instanceof z.ZodError) { // Should have been caught earlier, but as a fallback
      statusCode = 400;
      errorMessage = "Invalid data format."; // Generic message for Zod errors caught late
    }

    // Ensures that `parsedQuery` is not part of the error response, aligning with ErrorResponseSchema.
    res.status(statusCode).json({ error: errorMessage });
  }
}
