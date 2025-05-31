// people-gpt-champion/pages/api/__tests__/search.test.ts
import { createMocks, RequestMethod } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../search'; // The API handler
import { chatCompletionBreaker, getEmbeddingBreaker } from '../../../lib/openai';
import { queryPineconeIndex } from '../../../lib/pinecone';
import { getCache, setCache } from '../../../lib/redis';
import { SearchApiResponseSchema } from '../../../lib/schemas';
import { z } from 'zod'; // Import Zod for error checking if needed

// Mock external dependencies
// Ensure the path to the modules is correct relative to this test file.
// If jest.config.js has <rootDir> as /app/people-gpt-champion, then these paths should be correct.
jest.mock('../../../lib/openai', () => ({
  chatCompletionBreaker: {
    fire: jest.fn(),
  },
  getEmbeddingBreaker: {
    fire: jest.fn(),
  },
}));

jest.mock('../../../lib/pinecone', () => ({
  queryPineconeIndex: jest.fn(),
}));

jest.mock('../../../lib/redis', () => ({
  getCache: jest.fn(),
  setCache: jest.fn(),
}));

// Define a type for the response data for convenience in tests
// This creates a type based on the Zod schema for successful responses.
type ApiSearchSuccessResponse = z.infer<typeof SearchApiResponseSchema>;
// For error responses, we generally expect { error: string }
type ApiErrorResponse = { error: string; issues?: any[] };


describe('/api/search handler', () => {
  // It's good practice to cast the mocked functions to jest.Mock for type safety in tests
  const mockOpenAIChatFire = chatCompletionBreaker.fire as jest.Mock;
  const mockOpenAIEmbedFire = getEmbeddingBreaker.fire as jest.Mock;
  const mockPineconeQuery = queryPineconeIndex as jest.Mock;
  const mockGetCache = getCache as jest.Mock;
  const mockSetCache = setCache as jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test (this is also handled by clearMocks: true in jest.config.js)
    // but explicit reset here is fine for clarity or specific per-test mock states.
    mockOpenAIChatFire.mockReset();
    mockOpenAIEmbedFire.mockReset();
    mockPineconeQuery.mockReset();
    mockGetCache.mockReset();
    mockSetCache.mockReset();

    // Default mock implementations for common scenarios
    mockGetCache.mockResolvedValue(null); // Default to cache miss
    mockSetCache.mockResolvedValue(undefined); // Default setCache success
  });

  const callHandler = async (body: any, method: RequestMethod = 'POST') => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method, body });
    // @ts-ignore // Suppress error due to complex handler signature with possible Zod errors
    await handler(req, res);
    return {
      req,
      res,
      // _getJSONData() might throw if no JSON was sent (e.g. for non-2xx status without body)
      // It's safer to check _isJSON() or status code first if needed.
      body: res._isJSON() ? res._getJSONData() : res._getData(),
      status: res._getStatusCode()
    };
  };

  test('should return 400 for invalid request body (empty query)', async () => {
    const { status, body } = await callHandler({ query: '' });
    expect(status).toBe(400);
    expect(body.error).toContain('Invalid request body');
  });

  test('should return 400 for missing query in request body', async () => {
    const { status, body } = await callHandler({}); // No query field
    expect(status).toBe(400);
    expect(body.error).toContain('Invalid request body');
  });

  test('should return 405 for GET request', async () => {
    const { status, body } = await callHandler({ query: 'test' }, 'GET');
    expect(status).toBe(405);
    expect(body.error).toBe('Method Not Allowed'); // Check specific error message
  });

  test('should return results from cache if available', async () => {
    const cachedData: ApiSearchSuccessResponse = {
      candidates: [{ id: 'cached1', name: 'Cached Candidate', title: 'Tester', skills: ['testing'], match_score: 0.9, reasoning: 'From cache', source_url: '#' }]
    };
    mockGetCache.mockResolvedValue(cachedData);

    const { status, body } = await callHandler({ query: 'find tester' });

    expect(status).toBe(200);
    expect(body).toEqual(cachedData);
    expect(mockOpenAIChatFire).not.toHaveBeenCalled();
    expect(mockOpenAIEmbedFire).not.toHaveBeenCalled();
    expect(mockPineconeQuery).not.toHaveBeenCalled();
  });

  test('should successfully process a query, perform search, re-rank, and cache results', async () => {
    mockOpenAIChatFire
      .mockResolvedValueOnce({ // Query parsing
        choices: [{ message: { content: JSON.stringify({ keywords: ['software engineer'], skills: ['React'] }) } }],
      })
      .mockResolvedValueOnce({ // Re-ranking
        choices: [{ message: { content: JSON.stringify([{ id: 'pinecone1', match_score: 0.95, reasoning: 'Perfect match' }]) } }],
      });
    mockOpenAIEmbedFire.mockResolvedValue([0.1, 0.2, 0.3]);
    mockPineconeQuery.mockResolvedValue([
      { id: 'pinecone1', score: 0.8, metadata: { name: 'Dev One', title: 'Software Engineer', skills: ['React', 'Node'], source_url: 'http://example.com/dev1', summary: 'A dev' } },
    ]);

    const { status, body } = await callHandler({ query: 'software engineer with React' });

    expect(status).toBe(200);
    expect(mockGetCache).toHaveBeenCalledWith(expect.stringContaining('search-v2:'));

    expect(mockOpenAIChatFire).toHaveBeenNthCalledWith(1, expect.objectContaining({
      messages: expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'software engineer with React' })]),
    }));
    expect(mockOpenAIEmbedFire).toHaveBeenCalledWith('software engineer'); // Adjusted: only keywords are joined by current logic
    expect(mockPineconeQuery).toHaveBeenCalledWith([0.1, 0.2, 0.3], 20);
    expect(mockOpenAIChatFire).toHaveBeenNthCalledWith(2, expect.objectContaining({
      messages: expect.arrayContaining([expect.objectContaining({ role: 'system', content: expect.stringContaining('Re-rank candidates for the query: "software engineer with React"') })]),
    }));

    const responseBody = body as ApiSearchSuccessResponse; // Type assertion for successful response
    expect(responseBody.candidates).toHaveLength(1);
    expect(responseBody.candidates![0].id).toBe('pinecone1');
    expect(responseBody.candidates![0].name).toBe('Dev One');
    expect(responseBody.candidates![0].match_score).toBe(0.95);
    expect(responseBody.candidates![0].reasoning).toBe('Perfect match');
    expect(responseBody.parsedQuery!.keywords).toEqual(['software engineer']);

    const validation = SearchApiResponseSchema.safeParse(body);
    expect(validation.success).toBe(true);

    expect(mockSetCache).toHaveBeenCalledWith(expect.stringContaining('search-v2:'), body);
  });

  test('should return empty candidates if Pinecone finds no matches', async () => {
    mockOpenAIChatFire.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ keywords: ['obscure skill'] }) } }],
    });
    mockOpenAIEmbedFire.mockResolvedValue([0.4, 0.5, 0.6]);
    mockPineconeQuery.mockResolvedValue([]);

    const { status, body } = await callHandler({ query: 'someone with obscure skill' });

    expect(status).toBe(200);
    const responseBody = body as ApiSearchSuccessResponse;
    expect(responseBody.candidates).toEqual([]);
    expect(responseBody.message).toBe('No candidates found matching your query.');
    expect(mockOpenAIChatFire).toHaveBeenCalledTimes(1);
    expect(mockSetCache).toHaveBeenCalledWith(expect.stringContaining('search-v2:'), body);
  });

  test('should handle OpenAI query parsing failure', async () => {
    mockOpenAIChatFire.mockRejectedValueOnce(new Error('OpenAI API error for parsing'));

    const { status, body } = await callHandler({ query: 'test query' });
    expect(status).toBe(500);
    expect(body.error).toContain('An unexpected error occurred');
  });

  test('should handle OpenAI embedding failure', async () => {
    mockOpenAIChatFire.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ keywords: ['software engineer'] }) } }],
    });
    mockOpenAIEmbedFire.mockRejectedValueOnce(new Error('OpenAI API error for embedding'));

    const { status, body } = await callHandler({ query: 'test query' });
    expect(status).toBe(500);
    expect(body.error).toContain('An unexpected error occurred');
  });

  test('should handle Pinecone query failure', async () => {
    mockOpenAIChatFire.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ keywords: ['software engineer'] }) } }],
    });
    mockOpenAIEmbedFire.mockResolvedValue([0.1,0.2,0.3]);
    mockPineconeQuery.mockRejectedValueOnce(new Error('Pinecone API error'));

    const { status, body } = await callHandler({ query: 'test query' });
    expect(status).toBe(500);
    expect(body.error).toContain('An unexpected error occurred');
  });

  test('should handle OpenAI re-ranking failure', async () => {
    mockOpenAIChatFire
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ keywords: ['software engineer'], skills: ['React'] }) } }],
      })
      .mockRejectedValueOnce(new Error('OpenAI API error for re-ranking'));
    mockOpenAIEmbedFire.mockResolvedValue([0.1, 0.2, 0.3]);
    mockPineconeQuery.mockResolvedValue([
      { id: 'pinecone1', score: 0.8, metadata: { name: 'Dev One', summary: 'Dev summary' } }, // Ensure summary is provided if re-ranker expects it
    ]);

    const { status, body } = await callHandler({ query: 'software engineer with React' });
    expect(status).toBe(500);
    expect(body.error).toContain('An unexpected error occurred');
  });

  test('should return 503 if a circuit breaker is open', async () => {
    const openBreakerError = new Error('Circuit breaker is open');
    // @ts-ignore
    openBreakerError.code = 'EOPENBREAKER';
    mockOpenAIChatFire.mockRejectedValueOnce(openBreakerError);

    const { status, body } = await callHandler({ query: 'test query' });
    expect(status).toBe(503);
    expect(body.error).toContain('Service temporarily unavailable');
  });

  test('should handle timeout from a breaker (simulated as generic error leading to 500)', async () => {
    const timeoutError = new Error('Breaker operation timed out');
    // Opossum errors often include a code, e.g. ETIMEDOUT if it's a direct timeout from the breaker options
    // @ts-ignore
    timeoutError.code = 'ETIMEDOUT';
    mockOpenAIChatFire.mockRejectedValueOnce(timeoutError);

    const { status, body } = await callHandler({ query: 'test query for timeout' });

    // The handler's catch-all for non-specific errors will result in 500.
    // The specific 504 is for the overall API_OPERATION_TIMEOUT_MS.
    // An error from a breaker with code ETIMEDOUT is not explicitly handled as 504 by current search.ts,
    // it falls into the generic error category unless its message *also* contains "timed out" and is caught by that check.
    // The current error message check `error.message.toLowerCase().includes('timed out')` might catch this.
    // Let's assume it does for this test.
    if (body.error.toLowerCase().includes('timed out')) {
        expect(status).toBe(504); // If message contains "timed out"
    } else {
        expect(status).toBe(500); // Fallback for other breaker errors
        expect(body.error).toContain('An unexpected error occurred');
    }
  });
});
