// people-gpt-champion/pages/api/__tests__/generate-outreach.test.ts
import { createMocks, RequestMethod } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../generate-outreach'; // Adjust path as necessary
import { chatCompletionBreaker } from '../../../lib/openai'; // Actual path to module
import { GenerateOutreachRequestBodySchema } from '../../../lib/schemas'; // For checking validation errors if needed

import { PrismaClient, Candidate } from '@prisma/client'; // Import Candidate for mocking

// Mock the OpenAI library
jest.mock('../../../lib/openai', () => ({
  chatCompletionBreaker: {
    fire: jest.fn(),
  },
}));

// Mock Prisma Client
const mockPrisma = {
  candidate: {
    findUnique: jest.fn(),
  },
  $disconnect: jest.fn(),
};
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
        code: string;
        constructor(message: string, code: string) {
          super(message);
          this.code = code;
          this.name = 'PrismaClientKnownRequestError';
        }
      }
  }
}));


// Mock the Zod schema directly if we want to spy on it,
// but usually it's better to test its effects (i.e., if validation fails, API returns 400)
// jest.mock('../../../lib/schemas', () => ({
//   ...jest.requireActual('../../../lib/schemas'), // Import and retain default behavior
//   GenerateOutreachRequestBodySchema: {
//     safeParse: jest.fn().mockReturnValue({ success: true, data: {} }), // Default mock
//   },
// }));


describe('/api/generate-outreach API Endpoint', () => {
  const mockOpenAISuccessResponseEmail = {
    choices: [{ message: { content: JSON.stringify({ subject: 'Test Subject', body: 'Test Body' }) } }],
  };
  const mockOpenAISuccessResponseSlack = {
    choices: [{ message: { content: JSON.stringify({ message: 'Test Slack Message' }) } }],
  };
  const validCandidateId = 'clgenoutreach00001';
  const mockCandidateProfileData = { // This is IOutreachProfileResponse structure
    id: validCandidateId,
    name: 'Candidate Name',
    email: 'candidate@example.com',
    headline: 'Experienced Developer',
    keySkills: ['TypeScript', 'Node.js'],
    experienceSummary: '5 years as a dev',
    educationSummary: 'CS Degree',
  };
   // This is the Prisma Candidate model structure
   const mockPrismaCandidate: Partial<Candidate> = {
    id: validCandidateId,
    name: 'Candidate Name',
    email: 'candidate@example.com',
    title: 'Experienced Developer',
    skills: JSON.stringify(['TypeScript', 'Node.js', 'React']),
    workExperience: JSON.stringify([{ job_title: 'Experienced Developer', company: 'Comp', start_date: '2019', end_date: 'Present' }]),
    education: JSON.stringify([{ degree: 'CS Degree', institution: 'Uni' }]),
  };


  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockPrisma.candidate.findUnique.mockReset(); // Ensure Prisma mocks are reset
  });

  describe('POST Requests - Generic Content (No Candidate Data)', () => {
    it('should generate email content successfully', async () => {
      (chatCompletionBreaker.fire as jest.Mock).mockResolvedValue(mockOpenAISuccessResponseEmail);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          template: 'intro',
          vars: { name: 'Test User' },
          tone: 'formal',
          channel: 'email',
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.subject).toBe('Test Subject');
      expect(responseJson.body).toBe('Test Body');
      expect(chatCompletionBreaker.fire).toHaveBeenCalledTimes(1);
      // You could also inspect the arguments passed to chatCompletionBreaker.fire
      // expect(chatCompletionBreaker.fire).toHaveBeenCalledWith(expect.objectContaining({
      //   messages: expect.arrayContaining([
      //     expect.objectContaining({ role: 'user', content: expect.stringContaining('generate a email message') })
      //   ])
      // }));
    });

    it('should generate Slack message content successfully', async () => {
      (chatCompletionBreaker.fire as jest.Mock).mockResolvedValue(mockOpenAISuccessResponseSlack);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          template: 'job_opp',
          vars: { role: 'Developer' },
          tone: 'casual',
          channel: 'slack',
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.message).toBe('Test Slack Message');
      expect(chatCompletionBreaker.fire).toHaveBeenCalledTimes(1);
    });

    it('should return 400 for invalid request body (missing template)', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          // template: 'missing', // template is missing
          vars: { name: 'Test' },
          tone: 'formal',
          channel: 'email',
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.errors).toBeDefined();
      expect(responseJson.errors.fieldErrors?.template).toContain("Required");
    });

    it('should return 400 for invalid channel type', async () => {
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: {
            template: 'intro',
            vars: { name: 'Test' },
            tone: 'formal',
            channel: 'invalid_channel', // Invalid channel
          },
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
        const responseJson = JSON.parse(res._getData());
        expect(responseJson.errors).toBeDefined();
        expect(responseJson.errors.fieldErrors?.channel).toBeDefined();
      });

    it('should handle OpenAI API errors gracefully (e.g., circuit breaker open or API failure)', async () => {
      const errorMessage = 'OpenAI API is unavailable';
      (chatCompletionBreaker.fire as jest.Mock).mockRejectedValue(new Error(errorMessage));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          template: 'follow_up',
          vars: {},
          tone: 'friendly',
          channel: 'email',
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.message).toBe('Internal Server Error');
      expect(responseJson.error).toContain(errorMessage); // Check if the original error message is included
    });

    it('should return 500 if OpenAI response content is null', async () => {
        (chatCompletionBreaker.fire as jest.Mock).mockResolvedValue({ choices: [{ message: { content: null } }] });

        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: {
            template: 'intro',
            vars: { name: 'Test User' },
            tone: 'formal',
            channel: 'email',
          },
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(500);
        const responseJson = JSON.parse(res._getData());
        expect(responseJson.error).toBe('OpenAI did not return content.');
      });

    it('should return 500 if OpenAI response is not valid JSON for email', async () => {
      (chatCompletionBreaker.fire as jest.Mock).mockResolvedValue({ choices: [{ message: { content: "This is not JSON" } }] });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          template: 'intro',
          vars: { name: 'Test User' },
          tone: 'formal',
          channel: 'email',
        },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.error).toBe('Error processing OpenAI response: Malformed JSON.');
    });

    it('should return 500 if OpenAI response JSON does not match email schema', async () => {
        (chatCompletionBreaker.fire as jest.Mock).mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ wrong_field: 'data' }) } }] });

        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: {
            template: 'intro',
            vars: { name: 'Test User' },
            tone: 'formal',
            channel: 'email',
          },
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(500);
        const responseJson = JSON.parse(res._getData());
        expect(responseJson.error).toBe('OpenAI response validation failed for email.');
      });
  });

  describe('POST Requests - Personalized Content (With Candidate Data)', () => {
    it('should generate personalized email when outreachProfile is provided directly', async () => {
        (chatCompletionBreaker.fire as jest.Mock).mockResolvedValue(mockOpenAISuccessResponseEmail);
        const requestBody = {
          template: 'intro',
          vars: { company: 'NewCo' },
          tone: 'friendly',
          channel: 'email',
          outreachProfile: mockCandidateProfileData,
        };

        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: requestBody,
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        expect(chatCompletionBreaker.fire).toHaveBeenCalledTimes(1);
        const openAICallArgs = (chatCompletionBreaker.fire as jest.Mock).mock.calls[0][0];
        const userPrompt = openAICallArgs.messages.find((m: any) => m.role === 'user').content;

        expect(userPrompt).toContain(mockCandidateProfileData.name);
        expect(userPrompt).toContain(mockCandidateProfileData.headline);
        expect(userPrompt).toContain(mockCandidateProfileData.keySkills![0]);
        expect(userPrompt).toContain(mockCandidateProfileData.experienceSummary);
      });

    it('should generate personalized email when candidateId is provided (fetches profile)', async () => {
      mockPrisma.candidate.findUnique.mockResolvedValue(mockPrismaCandidate as Candidate);
      (chatCompletionBreaker.fire as jest.Mock).mockResolvedValue(mockOpenAISuccessResponseEmail);

      const requestBody = {
        template: 'job_opp',
        vars: { jobTitle: 'Senior Engineer' },
        tone: 'formal',
        channel: 'email',
        candidateId: validCandidateId,
      };

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: requestBody,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockPrisma.candidate.findUnique).toHaveBeenCalledWith({ where: { id: validCandidateId } });
      expect(chatCompletionBreaker.fire).toHaveBeenCalledTimes(1);
      const openAICallArgs = (chatCompletionBreaker.fire as jest.Mock).mock.calls[0][0];
      const userPrompt = openAICallArgs.messages.find((m: any) => m.role === 'user').content;

      expect(userPrompt).toContain(mockPrismaCandidate.name);
      // Check for transformed data based on getResolvedOutreachProfileHelper logic
      expect(userPrompt).toContain(mockPrismaCandidate.title); // Headline would be derived from title
      expect(userPrompt).toContain('TypeScript'); // A skill from mockPrismaCandidate.skills
      expect(userPrompt).toContain('Experienced Developer at Comp'); // Experience summary
    });

    it('should return 404 if candidateId is provided but candidate not found', async () => {
      mockPrisma.candidate.findUnique.mockResolvedValue(null); // Candidate not found

      const requestBody = {
        template: 'intro',
        vars: {},
        tone: 'casual',
        channel: 'email',
        candidateId: 'nonexistent-cuid',
      };

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: requestBody,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(JSON.parse(res._getData()).message).toBe('Candidate not found for the provided candidateId.');
      expect(chatCompletionBreaker.fire).not.toHaveBeenCalled();
    });

    it('should handle errors during profile fetching for candidateId', async () => {
        const dbError = new Error("DB connection error during profile fetch");
        mockPrisma.candidate.findUnique.mockRejectedValue(dbError);

        const requestBody = {
          template: 'intro',
          vars: {},
          tone: 'casual',
          channel: 'email',
          candidateId: validCandidateId,
        };

        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: requestBody,
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(500);
        expect(JSON.parse(res._getData()).message).toContain('Error fetching candidate profile');
        expect(chatCompletionBreaker.fire).not.toHaveBeenCalled();
      });
  });

  it('should return 405 if method is not POST', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: 'GET', // Invalid method
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData().message).toBe('Method GET Not Allowed');
  });
});
