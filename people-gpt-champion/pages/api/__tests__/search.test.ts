// people-gpt-champion/pages/api/__tests__/search.test.ts
import { createMocks, RequestMethod } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../search'; // The API handler
import { chatCompletionBreaker, getEmbeddingBreaker } from '../../../lib/openai';
import { queryPineconeIndex } from '../../../lib/pinecone';
import { getCache, setCache } from '../../../lib/redis';
import { SearchApiResponseSchema, CandidateSchema as ZodCandidateSchema } from '../../../lib/schemas';
import { z } from 'zod';
import { PrismaClient, Candidate as PrismaCandidate } from '@prisma/client';

// Mock Prisma Client
const mockPrismaCandidateFindMany = jest.fn();
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    candidate: {
      findMany: mockPrismaCandidateFindMany,
    },
  })),
  // Export other enums or types from Prisma if needed by the module under test
  // For example, if your schema uses Prisma.JsonNull or similar.
}));


// Mock external dependencies
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

type ApiSearchSuccessResponse = z.infer<typeof SearchApiResponseSchema>;
type ApiErrorResponse = { error: string; issues?: z.ZodIssue[] };

// Define a mock Prisma Candidate that aligns with ZodCandidateSchema for testing
// This helps ensure our mock data is consistent with what Prisma might return
// and what our API expects to process and return.
const createMockPrismaCandidate = (id: string, overrides: Partial<PrismaCandidate> = {}): PrismaCandidate => ({
  id,
  name: `Candidate ${id}`,
  title: `Title for ${id}`,
  email: `${id}@example.com`,
  phone: '111-222-3333',
  address: '123 Test St',
  skills: ['SkillA', 'SkillB'], // Prisma might store as string[], or JSON string. API expects string[]
  workExperience: [ // This should be Prisma.JsonValue if schema is Json. For test, make it look like parsed.
    { title: 'Dev', company: 'Tech Corp A', description: 'Developed cool apps with KeywordInDescription', startDate: '2020-01-01', endDate: '2022-01-01' },
  ] as any, // Use 'as any' if type is Prisma.JsonValue, otherwise match actual type
  education: [
    { school: 'Test University', degree: 'BSc', fieldOfStudy: 'Testing', endDate: '2019-12-31' },
  ] as any,
  certifications: ['CertA', 'CertB'],
  raw_resume_text: `Full resume text for Candidate ${id} including soft skills like adaptable and team player.`,
  source_url: `http://example.com/${id}`,
  created_at: new Date(),
  updated_at: new Date(),
  summary: `Summary for ${id}`, // Assuming 'summary' field is used by merge logic for 'profile_summary'
  ...overrides,
});


describe('/api/search handler', () => {
  const mockOpenAIChatFire = chatCompletionBreaker.fire as jest.Mock;
  const mockOpenAIEmbedFire = getEmbeddingBreaker.fire as jest.Mock;
  const mockPineconeQuery = queryPineconeIndex as jest.Mock;
  const mockGetCache = getCache as jest.Mock;
  const mockSetCache = setCache as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCache.mockResolvedValue(null);
    mockSetCache.mockResolvedValue(undefined);
    mockPrismaCandidateFindMany.mockReset(); // Reset prisma mock
  });

  const callHandler = async (body: any, method: RequestMethod = 'POST') => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method, body });
    await handler(req, res); // No ts-ignore needed if handler signature is simpler
    return {
      req,
      res,
      body: res._isJSON() ? res._getJSONData() : res._getData(),
      status: res._getStatusCode()
    };
  };

  test('should return 400 for invalid request body (empty query)', async () => {
    const { status, body } = await callHandler({ query: '', weights: { w_skill: 0.4, w_experience: 0.3, w_culture: 0.3 } });
    expect(status).toBe(400);
    expect(body.error).toContain('Invalid request body');
  });

  test('should return results from cache if available and valid', async () => {
    // Create cachedData that matches the NEW full CandidateSchema structure
    const mockCandidateForCache = createMockPrismaCandidate('cached1');
    const cachedData: ApiSearchSuccessResponse = {
      candidates: [{
        id: mockCandidateForCache.id,
        name: mockCandidateForCache.name,
        title: mockCandidateForCache.title,
        skills: mockCandidateForCache.skills,
        phone: mockCandidateForCache.phone,
        address: mockCandidateForCache.address,
        workExperience: mockCandidateForCache.workExperience as any, // Ensure type matches Zod
        education: mockCandidateForCache.education as any,
        certifications: mockCandidateForCache.certifications,
        raw_resume_text: mockCandidateForCache.raw_resume_text,
        match_score: 0.9,
        skill_match: 0.9, experience_relevance: 0.9, cultural_fit: 0.9,
        score_breakdown: { skill_match: 0.9, experience_relevance: 0.9, cultural_fit: 0.9 },
        percentile_rank: 90,
        reasoning: 'From cache',
        source_url: mockCandidateForCache.source_url,
        pinecone_score: 0.95
      }]
    };
    mockGetCache.mockResolvedValue(cachedData);

    const { status, body } = await callHandler({ query: 'find tester', weights: { w_skill: 0.4, w_experience: 0.3, w_culture: 0.3 } });
    expect(status).toBe(200);
    expect(body).toEqual(cachedData);
    expect(mockOpenAIChatFire).not.toHaveBeenCalled();
    expect(mockPrismaCandidateFindMany).not.toHaveBeenCalled();
  });

  test('should correctly merge Pinecone and Prisma data and skip candidates not in Prisma', async () => {
    mockOpenAIChatFire.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ keywords: ['dev'], skills:[] }) } }] });
    mockOpenAIEmbedFire.mockResolvedValue([0.1,0.1,0.1]);
    mockPineconeQuery.mockResolvedValue([
      { id: 'id1', score: 0.9 },
      { id: 'id-missing', score: 0.88 }
    ]);
    const mockPrismaCand1 = createMockPrismaCandidate('id1');
    mockPrismaCandidateFindMany.mockResolvedValue([mockPrismaCand1]);

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { status, body } = await callHandler({ query: 'dev', weights: { w_skill: 0.5, w_experience: 0.3, w_culture: 0.2 }});

    expect(status).toBe(200);
    const resBody = body as ApiSearchSuccessResponse;
    expect(resBody.candidates).toHaveLength(1);
    expect(resBody.candidates![0].id).toBe('id1');
    expect(resBody.candidates![0].name).toBe(mockPrismaCand1.name);
    expect(resBody.candidates![0].pinecone_score).toBe(0.9);
    expect(mockPrismaCandidateFindMany).toHaveBeenCalledWith({ where: { id: { in: ['id1', 'id-missing'] } } });
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Candidate ID id-missing from Pinecone not found in Prisma. Skipping.'));

    consoleWarnSpy.mockRestore();
  });


  describe('Candidate Scoring and Ranking with Hybrid Data', () => {
    const mockPrismaC1 = createMockPrismaCandidate('c1', { skills: ['React', 'Node'], workExperience: [{ title: 'Senior React Developer', description: 'Worked on React projects', company: 'A', startDate: 's', endDate: 'e' }] });
    const mockPrismaC2 = createMockPrismaCandidate('c2', { skills: [], raw_resume_text: null, workExperience: [] }); // No skills, no text for cultural fit
    const mockPrismaC3 = createMockPrismaCandidate('c3', { skills: ['Java', 'Spring'], workExperience: [{ title: 'Java Developer', description: 'Worked on Java projects with Spring', company: 'B', startDate: 's', endDate: 'e' }] });

    beforeEach(() => {
      mockOpenAIChatFire.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ keywords: ['developer', 'React'], skills: ['React'] }) } }],
      });
      mockOpenAIEmbedFire.mockResolvedValue([0.1, 0.1, 0.1]);
      // Pinecone returns IDs and its own scores
      mockPineconeQuery.mockResolvedValue([
        { id: 'c1', score: 0.9 },
        { id: 'c2', score: 0.8 },
        { id: 'c3', score: 0.85 },
      ]);
      // Prisma returns full data for these IDs
      mockPrismaCandidateFindMany.mockResolvedValue([mockPrismaC1, mockPrismaC2, mockPrismaC3]);
    });

    test('should calculate match_score using refined sub-score functions', async () => {
      const weights = { w_skill: 0.5, w_experience: 0.3, w_culture: 0.2 };
      const { status, body } = await callHandler({ query: 'React developer', weights });

      expect(status).toBe(200);
      const resBody = body as ApiSearchSuccessResponse;
      expect(resBody.candidates).toHaveLength(3);

      const cand1 = resBody.candidates!.find(c => c.id === 'c1');
      expect(cand1!.skill_match).toBeCloseTo(0.1 + 0.8 * (1/1)); // Matched 1 query skill 'React'
      expect(cand1!.experience_relevance).toBeCloseTo(0.7); // Keyword 'React' in title
      // cultural_fit for c1 has raw_resume_text, so 0.4-0.6
      expect(cand1!.cultural_fit).toBeGreaterThanOrEqual(0.4);
      expect(cand1!.cultural_fit).toBeLessThanOrEqual(0.6);


      const cand2 = resBody.candidates!.find(c => c.id === 'c2');
      expect(cand2!.skill_match).toBeCloseTo(0.1); // No skills
      expect(cand2!.experience_relevance).toBeCloseTo(0.1); // No work experience
      expect(cand2!.cultural_fit).toBeCloseTo(0.1); // No text

      const cand3 = resBody.candidates!.find(c => c.id === 'c3');
      expect(cand3!.skill_match).toBeCloseTo(0.1); // Query skill "React", candidate has "Java", "Spring"
      expect(cand3!.experience_relevance).toBeGreaterThanOrEqual(0.5); // "developer" keyword in description
      expect(cand3!.cultural_fit).toBeGreaterThanOrEqual(0.4); // Has raw_resume_text

      resBody.candidates?.forEach(candidate => {
        const calculatedScore = weights.w_skill * candidate.skill_match +
                                weights.w_experience * candidate.experience_relevance +
                                weights.w_culture * candidate.cultural_fit;
        expect(candidate.match_score).toBeCloseTo(calculatedScore, 2);
        // Check new fields are present (optionality handled by Zod schema)
        expect(candidate).toHaveProperty('workExperience');
        expect(candidate).toHaveProperty('education');
      });
    });

    test('should rank candidates by new match_score descending', async () => {
      // Relies on the scores from the previous test with weights { w_skill: 0.5, w_experience: 0.3, w_culture: 0.2 }
      // c1_skill = 0.9, c1_exp = 0.7, c1_cult ~0.5 => c1_score ~ 0.5*0.9 + 0.3*0.7 + 0.2*0.5 = 0.45 + 0.21 + 0.1 = 0.76
      // c2_skill = 0.1, c2_exp = 0.1, c2_cult = 0.1 => c2_score ~ 0.5*0.1 + 0.3*0.1 + 0.2*0.1 = 0.05 + 0.03 + 0.02 = 0.10
      // c3_skill = 0.1, c3_exp = 0.5, c3_cult ~0.5 => c3_score ~ 0.5*0.1 + 0.3*0.5 + 0.2*0.5 = 0.05 + 0.15 + 0.1 = 0.30
      // Expected order: c1, c3, c2
      const { status, body } = await callHandler({ query: 'React developer', weights: { w_skill: 0.5, w_experience: 0.3, w_culture: 0.2 } });
      expect(status).toBe(200);
      const resBody = body as ApiSearchSuccessResponse;
      expect(resBody.candidates).toHaveLength(3);
      expect(resBody.candidates!.map(c => c.id)).toEqual(['c1', 'c3', 'c2']); // Based on above calculation
    });
  });

  describe('Weight Handling and Zod Validation', () => {
    beforeEach(() => {
      mockOpenAIChatFire.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ keywords: ['test'] }) } }] });
      mockOpenAIEmbedFire.mockResolvedValue([0.1,0.1,0.1]);
      mockPineconeQuery.mockResolvedValue([{ id: 'id1', score: 0.8 }]);
      mockPrismaCandidateFindMany.mockResolvedValue([createMockPrismaCandidate('id1')]);
    });
    // These tests remain largely the same as they test Zod on request body
    test('should use default weights if weights are missing', async () => {
      const { status, body } = await callHandler({ query: 'test query without weights' });
      expect(status).toBe(200);
      const resBody = body as ApiSearchSuccessResponse;
      expect(resBody.candidates![0].match_score).toBeDefined();
    });
    // ... other weight validation tests from original file are still valid ...
     test('should return 400 if weights sum is not close to 1 (e.g., 0.5)', async () => {
      const { status, body } = await callHandler({ query: 'test', weights: { w_skill: 0.2, w_experience: 0.2, w_culture: 0.1 } });
      expect(status).toBe(400);
      expect(body.error).toContain('Invalid request body');
      expect(body.issues[0].message).toBe('Weights must sum to approximately 1 (between 0.99 and 1.01).');
    });
  });

  test('should use new cache key "search-v4-hybrid" and include weights', async () => {
    mockOpenAIChatFire.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ keywords: ['test'] }) } }] });
    mockOpenAIEmbedFire.mockResolvedValue([0.1,0.1,0.1]);
    mockPineconeQuery.mockResolvedValue([]); // No candidates from pinecone
    // Prisma findMany won't be called if pinecone is empty, but if it were, it would be empty too.
    mockPrismaCandidateFindMany.mockResolvedValue([]);


    const weights = { w_skill: 0.4, w_experience: 0.3, w_culture: 0.3 };
    const query = 'test query for cache key';
    const expectedCacheKey = `search-v4-hybrid:${crypto.createHash('md5').update(query.toLowerCase() + JSON.stringify(weights)).digest('hex')}`;


    await callHandler({ query, weights });

    expect(mockGetCache).toHaveBeenCalledWith(expectedCacheKey);
    expect(mockSetCache).toHaveBeenCalledWith(expectedCacheKey, expect.anything());
  });

  test('should validate the successful API response against SearchApiResponseSchema', async () => {
    mockOpenAIChatFire.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ keywords: ['developer'], skills:['React'] }) } }] });
    mockOpenAIEmbedFire.mockResolvedValue([0.1,0.1,0.1]);
    mockPineconeQuery.mockResolvedValue([{ id: 'c1', score: 0.9 }]);
    mockPrismaCandidateFindMany.mockResolvedValue([createMockPrismaCandidate('c1', {skills: ['React']})]);

    const safeParseSpy = jest.spyOn(SearchApiResponseSchema, 'safeParse');
    await callHandler({ query: 'developer', weights: { w_skill: 0.5, w_experience: 0.3, w_culture: 0.2 }});
    expect(safeParseSpy).toHaveBeenCalled();
    safeParseSpy.mockRestore();
  });

  // Conceptual tests can remain as skipped.
  describe('Conceptual Tests (Descriptions)', () => {
    test.skip('Percentile Calculation (Client-side in page.tsx) - Test Cases', () => {});
    test.skip('Zod Schema Validation (Direct Schema Tests) - Test Cases', () => {});
  });
});
