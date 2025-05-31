// pages/api/__tests__/search.contract.test.ts
import supertest from 'supertest';
import http from 'http';
import { apiResolver } from 'next/dist/server/api-utils/node/api-resolver';
import searchHandler from '../search'; // Adjust path to your handler
import * as allSchemas from '@/lib/schemas'; // Using namespace import for safety

// Hoisted variables for Prisma mocks
var mockCandidateFindManyRef: jest.Mock;
var mockCandidateCountRef: jest.Mock;
// Add refs for other Prisma methods if used by the search handler, e.g., for logging or complex queries.

jest.mock('@prisma/client', () => {
  const originalModule = jest.requireActual('@prisma/client');
  mockCandidateFindManyRef = jest.fn();
  mockCandidateCountRef = jest.fn();
  return {
    ...originalModule, // Spread original module to get enums like Role, SortOrder etc.
    PrismaClient: jest.fn().mockImplementation(() => ({
      candidate: {
        findMany: mockCandidateFindManyRef,
        count: mockCandidateCountRef,
      },
      // Mock other models/methods if needed by the handler
      $disconnect: jest.fn(),
    })),
    // Overwrite Prisma namespace if specific error types are needed, but keep original enums
    Prisma: {
      ...originalModule.Prisma, // Keep original Prisma namespace contents
      PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
        code: string;
        constructor(message: string, code: string) {
          super(message);
          this.code = code;
          Object.setPrototypeOf(this, PrismaClientKnownRequestError.prototype);
        }
      },
    },
  };
});

// Mock OpenAI (if used by the search handler for query understanding/embedding)
var mockOpenAIChatCompletionsCreateRef = jest.fn();
jest.mock('@/lib/openai', () => ({
  getOpenAIClient: jest.fn(() => ({
    chat: {
      completions: {
        create: mockOpenAIChatCompletionsCreateRef,
      },
    },
  })),
}));

// Mock Pinecone (if used by the search handler for vector search)
var mockPineconeIndexQueryRef = jest.fn();
jest.mock('@/lib/pinecone', () => ({
  getPineconeClient: jest.fn().mockResolvedValue({ // Assuming getPineconeClient is async
    index: jest.fn(() => ({
      query: mockPineconeIndexQueryRef,
    })),
  }),
}));

// Mock next-auth (if search is a protected route or uses session data)
const mockGetServerSession = jest.fn();
jest.mock('next-auth/next', () => ({
  getServerSession: mockGetServerSession,
}));


describe('API Contract Test: /api/search', () => {
  let server: http.Server;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      apiResolver(req, res, {}, searchHandler, { previewModeId: '', previewModeEncryptionKey: '', previewModeSigningKey: '' }, true);
    });
    server.listen(done);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default to an authenticated user with RECRUITER role for most tests
    mockGetServerSession.mockResolvedValue({
      user: { id: 'test-user-id', email: 'test@example.com', role: 'RECRUITER' },
      expires: 'never',
    });
    // Setup default mock implementations for each test
    mockCandidateFindManyRef.mockResolvedValue([]); // Default to returning empty array
    mockCandidateCountRef.mockResolvedValue(0);    // Default to 0 count
    mockOpenAIChatCompletionsCreateRef.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ keywords: ['mocked', 'keywords'], skills: ['mocked_skill'] }) } }]
    });
    mockPineconeIndexQueryRef.mockResolvedValue({ matches: [] }); // Default to no matches
  });

  afterAll((done) => {
    server.close(done);
  });

  it('POST /api/search with valid query should return 200 and valid search response', async () => {
    const mockCandidates = [
      { id: 'c1', name: 'Test Candidate 1', title: 'Engineer', match_score: 0.9, skills: ['ts'], score_breakdown: { skill_match: 0.9, experience_relevance: 0.8, cultural_fit: 0.7 }, percentile_rank: 90, workExperience: [], education: [] },
      { id: 'c2', name: 'Test Candidate 2', title: 'Designer', match_score: 0.8, skills: ['figma'], score_breakdown: { skill_match: 0.8, experience_relevance: 0.8, cultural_fit: 0.7 }, percentile_rank: 80, workExperience: [], education: [] },
    ];
    mockCandidateFindManyRef.mockResolvedValue(mockCandidates);
    mockCandidateCountRef.mockResolvedValue(mockCandidates.length);
    mockPineconeIndexQueryRef.mockResolvedValue({
      matches: mockCandidates.map(c => ({ id: c.id, score: c.match_score }))
    });

    const requestBody = {
      query: 'software engineer typescript',
      weights: { w_skill: 0.5, w_experience: 0.3, w_culture: 0.2 }
    };

    const response = await supertest(server)
      .post('/api/search')
      .send(requestBody)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);

    const parsedBody = allSchemas.SearchApiResponseSchema.safeParse(response.body);
    expect(parsedBody.success).toBe(true);

    if (parsedBody.success) {
      expect(parsedBody.data.candidates).toBeDefined();
      expect(parsedBody.data.candidates?.length).toBe(mockCandidates.length);
      expect(parsedBody.data.parsedQuery).toBeDefined();
    } else {
      console.error("Zod parsing errors for /api/search valid response:", parsedBody.error?.errors);
    }
  });

  it('POST /api/search with empty query should return 400', async () => {
    const requestBody = { query: '' }; // Invalid: empty query

    const response = await supertest(server)
      .post('/api/search')
      .send(requestBody)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json');

    expect(response.status).toBe(400);
    const parsedBody = allSchemas.ErrorResponseSchema.safeParse(response.body);
    expect(parsedBody.success).toBe(true);
    if(parsedBody.success){
        expect(parsedBody.data.error).toContain("Query cannot be empty");
    }
  });

  it('POST /api/search with invalid weights should return 400', async () => {
    const requestBody = {
      query: 'software engineer',
      weights: { w_skill: 1.5, w_experience: 0.3, w_culture: 0.2 } // Invalid: w_skill > 1
    };

    const response = await supertest(server)
      .post('/api/search')
      .send(requestBody)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json');

    expect(response.status).toBe(400);
    const parsedBody = allSchemas.ErrorResponseSchema.safeParse(response.body);
    expect(parsedBody.success).toBe(true);
     if(parsedBody.success){
        expect(parsedBody.data.error).toBeDefined();
        // More specific error message check if available and consistent
    }
  });

  // Example for testing a Pinecone error scenario (if applicable)
  it('POST /api/search should handle Pinecone query error gracefully', async () => {
    mockPineconeIndexQueryRef.mockRejectedValue(new Error('Simulated Pinecone error'));

    const requestBody = { query: 'software engineer' };
    const response = await supertest(server)
      .post('/api/search')
      .send(requestBody)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json');

    expect(response.status).toBe(500); // Or whatever status your error handling returns
    const parsedBody = allSchemas.ErrorResponseSchema.safeParse(response.body);
    expect(parsedBody.success).toBe(true);
    if(parsedBody.success){
       expect(parsedBody.data.error).toContain('Error querying Pinecone');
    }
  });
});
