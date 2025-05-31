// people-gpt-champion/lib/schemas.ts
import { z } from 'zod';

// Schema for the request body of the search API
export const SearchApiRequestBodySchema = z.object({
  query: z.string().min(1, { message: "Query cannot be empty." }).max(500, { message: "Query is too long." }),
  // Add other potential request parameters here if any, e.g., user ID, filters not in query string
});

// Schema for individual candidate in the response
const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  skills: z.array(z.string()),
  match_score: z.number().min(0).max(1),
  reasoning: z.string(),
  source_url: z.string().url().or(z.literal('#')), // URL or a placeholder '#'
  pinecone_score: z.number().optional(), // Pinecone's original score
});

// Schema for the successful API response
export const SearchApiResponseSchema = z.object({
  candidates: z.array(CandidateSchema).optional(),
  parsedQuery: z.object({
    keywords: z.array(z.string()),
    location: z.string().optional(),
    skills: z.array(z.string()).optional(),
  }).optional(),
  message: z.string().optional(), // For messages like "No candidates found"
});

// Schema for error responses (optional but good practice)
export const ErrorResponseSchema = z.object({
  error: z.string(),
  parsedQuery: z.undefined().optional(), // Ensure parsedQuery is not present in error responses
});
