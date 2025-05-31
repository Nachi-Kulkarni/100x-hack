import { http, HttpResponse, passthrough } from 'msw'
import { getFeatureFlag, createAnonymousUser } from '../lib/launchdarkly' // Adjusted path
import fs from 'fs';
import path from 'path';

// This global variable is now primarily for browser-based MSW manual override.
declare global {
  var demoMode: boolean | undefined;
}

const OPENAI_API_BASE_URL = 'https://api.openai.com'

// --- Loading Candidate Profiles for Pinecone ---
interface CandidateProfileForPinecone {
  id: string;
  name: string;
  title: string;
  summary: string;
  // Add other fields if Pinecone metadata needs them
}
let pineconeDemoCandidates: CandidateProfileForPinecone[] = [];
const candidateProfilesPath = path.join(process.cwd(), 'people-gpt-champion', 'demo-data', 'candidate-profiles.json');

try {
  if (typeof window === 'undefined') { // Only attempt fs operations in Node.js
    const fileContents = fs.readFileSync(candidateProfilesPath, 'utf-8');
    // Assuming candidate-profiles.json contains all necessary fields for CandidateProfileForPinecone
    // and that IDs are consistent with what Prisma mock expects/uses.
    const rawCandidates = JSON.parse(fileContents) as any[];
    pineconeDemoCandidates = rawCandidates.map((candidate, index) => ({
      // Ensure 'id' is a string. This is critical for consistency.
      // If candidate-profiles.json does not have 'id', this will need adjustment,
      // or the file itself needs to be updated to include IDs.
      id: candidate.id ? candidate.id.toString() : `mock-pinecone-id-${index + 1}`,
      name: candidate.name,
      title: candidate.title,
      summary: candidate.summary,
      // Map other fields if your Pinecone metadata includes them
    }));
    console.log(`MSW Handlers: Successfully loaded ${pineconeDemoCandidates.length} candidates for Pinecone mock.`);
  }
} catch (error: any) {
  console.error(`MSW Handlers: Error loading candidate-profiles.json for Pinecone mock from ${candidateProfilesPath}:`, error.message);
  pineconeDemoCandidates = [{ id: "error-pinecone-fallback-1", name: "Error Fallback", title: "N/A", summary: "Could not load demo data" }];
}

// --- Loading Job Queries for OpenAI ---
interface JobQuery {
  query: string;
  filters?: {
    location?: string;
    minExperience?: number;
    skills?: string[];
    title?: string;
    education?: { degree?: string };
  };
  // other fields from job-queries.json
  keywords?: string[]; // Assuming this might be part of the structure for OpenAI mock
}
let demoJobQueries: JobQuery[] = [];
const jobQueriesPath = path.join(process.cwd(), 'people-gpt-champion', 'demo-data', 'job-queries.json');

try {
  if (typeof window === 'undefined') { // Only attempt fs operations in Node.js
    const fileContents = fs.readFileSync(jobQueriesPath, 'utf-8');
    demoJobQueries = JSON.parse(fileContents) as JobQuery[];
    console.log(`MSW Handlers: Successfully loaded ${demoJobQueries.length} job queries for OpenAI mock.`);
  }
} catch (error: any) {
  console.error(`MSW Handlers: Error loading job-queries.json for OpenAI mock from ${jobQueriesPath}:`, error.message);
  // Keep demoJobQueries empty or provide a fallback if needed
}

const defaultOpenAIMockContent = {
  keywords: ['default engineer', 'default skill'],
  filters: { experience: 3, location: 'Default Location' },
};

// Helper function to determine demo mode status (Node.js only)
async function isDemoModeActiveNode(): Promise<boolean> {
  if (typeof process !== 'undefined' && process.env.LAUNCHDARKLY_SDK_KEY) {
    const ldUser = createAnonymousUser();
    const flagStatus = await getFeatureFlag('demoMode', ldUser, false);
    return flagStatus;
  }
  return false;
}


export const handlers = [
  http.get('/api/test', () => {
    return HttpResponse.json({ message: 'MSW is working!' })
  }),

  // Handler for OpenAI Chat Completions
  http.post(`${OPENAI_API_BASE_URL}/v1/chat/completions`, async ({ request }) => {
    let currentDemoMode = false;
    if (typeof window === 'undefined') {
      currentDemoMode = await isDemoModeActiveNode();
      if (currentDemoMode) console.log('MSW (Node): OpenAI Chat Completions using LaunchDarkly demoMode ON');
    } else {
      currentDemoMode = globalThis.demoMode === true;
      if (currentDemoMode) console.log('MSW (Browser): OpenAI Chat Completions using globalThis.demoMode ON');
    }

    if (currentDemoMode) {
      let gptMockContent = defaultOpenAIMockContent;
      if (typeof window === 'undefined' && demoJobQueries.length > 0) {
        // Use the first job query from the loaded file for Node.js environment
        const firstQuery = demoJobQueries[0];
        // Construct content based on the job query structure.
        // This assumes QueryParameters interface in search.ts expects { keywords, location, skills }
        // and job-queries.json provides these or similar.
        gptMockContent = {
          keywords: firstQuery.keywords || (firstQuery.query ? [firstQuery.query.split(" ")[0]] : ['parsed_keyword']), // Simplistic keyword extraction
          location: firstQuery.filters?.location,
          skills: firstQuery.filters?.skills,
          // Ensure all parts of QueryParameters are potentially covered
          ...(firstQuery.filters || {}) // Spread other filters if they match
        };
        console.log('MSW (Node): OpenAI mock using dynamic job query:', gptMockContent);
      } else if (typeof window !== 'undefined' && demoJobQueries.length > 0) {
        // Potentially could also make job queries available to browser MSW if needed,
        // but fs.readFileSync won't work directly in browser.
        // For now, browser uses default or a simpler mock.
        console.log('MSW (Browser): OpenAI mock using default content as job-queries.json not directly loaded.');
      }


      return HttpResponse.json({
        id: 'chatcmpl-mock-dynamic-jq',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-3.5-turbo-mock-dynamic-jq',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify(gptMockContent),
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 50, total_tokens: 60 },
      });
    }
    return passthrough();
  }),

  // Handler for OpenAI Embeddings (no changes to its data source for this task)
  http.post(`${OPENAI_API_BASE_URL}/v1/embeddings`, async ({ request }) => {
    let currentDemoMode = false;
    if (typeof window === 'undefined') {
      currentDemoMode = await isDemoModeActiveNode();
      if (currentDemoMode) console.log('MSW (Node): OpenAI Embeddings using LaunchDarkly demoMode ON');
    } else {
      currentDemoMode = globalThis.demoMode === true;
      if (currentDemoMode) console.log('MSW (Browser): OpenAI Embeddings using globalThis.demoMode ON');
    }

    if (currentDemoMode) {
      return HttpResponse.json({
        object: 'list',
        data: [ { object: 'embedding', embedding: Array(1536).fill(0).map((_, i) => Math.random() * (i % 2 === 0 ? 1 : -1) * 0.03), index: 0 } ],
        model: 'text-embedding-ada-002-mock-ld',
        usage: { prompt_tokens: 5, total_tokens: 5 },
      });
    }
    return passthrough();
  }),

  // Handler for Pinecone Query
  http.post(/^https:\/\/.*\.pinecone\.io\/query$/, async ({ request }) => {
    let currentDemoMode = false;
    if (typeof window === 'undefined') {
      currentDemoMode = await isDemoModeActiveNode();
      if (currentDemoMode) console.log('MSW (Node): Pinecone Query using LaunchDarkly demoMode ON');
    } else {
      currentDemoMode = globalThis.demoMode === true;
      if (currentDemoMode) console.log('MSW (Browser): Pinecone Query using globalThis.demoMode ON');
    }

    if (currentDemoMode) {
      // Use candidates loaded from JSON file for Node.js environment
      const candidatesToUse = (typeof window === 'undefined' && pineconeDemoCandidates.length > 0)
        ? pineconeDemoCandidates
        : [{ id: "browser-fallback-1", name: "Browser Fallback Candidate", title: "N/A", summary: "Using fallback for browser MSW" }]; // Fallback for browser or if load failed

      const mockMatches = candidatesToUse.slice(0, 5).map((candidate, index) => ({
        id: candidate.id,
        score: 0.95 - (index * 0.05),
        metadata: { name: candidate.name, title: candidate.title, summary: candidate.summary },
      }));
      return HttpResponse.json({ matches: mockMatches, namespace: '' });
    }
    return passthrough();
  }),
];
