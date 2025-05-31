// people-gpt-champion/pages/api/candidate/[id]/__tests__/outreach-profile.test.ts
import { createMocks, RequestMethod } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../outreach-profile'; // Adjust path to the handler
import { PrismaClient, Candidate } from '@prisma/client'; // Import Candidate type for mocking

// Mock Prisma Client
const mockPrisma = {
  candidate: {
    findUnique: jest.fn(),
  },
  $disconnect: jest.fn(),
};
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
  Prisma: { // Mock Prisma namespace for error types if needed, e.g. PrismaClientKnownRequestError
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

describe('/api/candidate/{id}/outreach-profile API Endpoint', () => {
  const validCandidateId = 'cltestcuid000000000000'; // Example CUID

  const mockCandidateData: Partial<Candidate> = {
    id: validCandidateId,
    name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+1234567890',
    title: 'Senior Software Engineer',
    skills: JSON.stringify(['JavaScript', 'TypeScript', 'React', 'Node.js', 'GraphQL', 'AWS']), // Example skills JSON
    workExperience: JSON.stringify([ // Example work experience JSON
      { job_title: 'Senior Software Engineer', company: 'Tech Solutions Inc.', start_date: '2020-01-01', end_date: 'Present' },
      { job_title: 'Software Engineer', company: 'Innovate LLC', start_date: '2018-06-01', end_date: '2019-12-31' },
    ]),
    education: JSON.stringify([ // Example education JSON
      { degree: 'B.S. Computer Science', institution: 'State University', graduation_date: '2018-05-01' },
    ]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET Requests', () => {
    it('should retrieve and transform candidate profile successfully', async () => {
      mockPrisma.candidate.findUnique.mockResolvedValue(mockCandidateData as Candidate);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
        query: { id: validCandidateId },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseJson = JSON.parse(res._getData());

      expect(responseJson.id).toBe(validCandidateId);
      expect(responseJson.name).toBe('John Doe');
      expect(responseJson.email).toBe('john.doe@example.com');
      expect(responseJson.phone).toBe('+1234567890');
      expect(responseJson.headline).toBe('Senior Software Engineer'); // Derived from title or recent job
      expect(responseJson.keySkills).toEqual(['JavaScript', 'TypeScript', 'React', 'Node.js', 'GraphQL']); // Top 5
      expect(responseJson.experienceSummary).toBe('Senior Software Engineer at Tech Solutions Inc.; Software Engineer at Innovate LLC');
      expect(responseJson.educationSummary).toBe('B.S. Computer Science from State University');
    });

    it('should return 404 if candidate not found', async () => {
      mockPrisma.candidate.findUnique.mockResolvedValue(null);
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
        query: { id: 'clnotfound000000000000' },
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(404);
      expect(JSON.parse(res._getData()).error).toBe('Candidate not found.');
    });

    it('should return 400 for invalid candidate ID format', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
        query: { id: 'invalid-id' },
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
      expect(JSON.parse(res._getData()).error).toBe('Invalid Candidate ID format.');
    });

    it('should handle Prisma client errors during fetch', async () => {
      const dbError = new Error('Database unavailable');
      mockPrisma.candidate.findUnique.mockRejectedValue(dbError);
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
        query: { id: validCandidateId },
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData()).error).toBe('Failed to fetch outreach profile.');
      expect(JSON.parse(res._getData()).details).toBe(dbError.message);
    });

    it('should handle candidates with missing optional data gracefully', async () => {
      const minimalCandidate: Partial<Candidate> = {
        id: validCandidateId,
        name: 'Jane Minimal',
        email: 'jane.minimal@example.com',
        phone: null, // Missing phone
        title: null, // Missing title
        skills: null, // Missing skills
        workExperience: null, // Missing work experience
        education: null, // Missing education
      };
      mockPrisma.candidate.findUnique.mockResolvedValue(minimalCandidate as Candidate);
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
        query: { id: validCandidateId },
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.name).toBe('Jane Minimal');
      expect(responseJson.headline).toBeNull();
      expect(responseJson.keySkills).toBeUndefined(); // Optional fields become undefined if empty/null after transform
      expect(responseJson.experienceSummary).toBeNull();
      expect(responseJson.educationSummary).toBeNull();
    });

    it('should handle candidate with skills as an object', async () => {
        const candidateWithObjectSkills: Partial<Candidate> = {
          ...mockCandidateData,
          skills: JSON.stringify({ technical: ['Go', 'Rust'], soft: ['Agile'] }),
        };
        mockPrisma.candidate.findUnique.mockResolvedValue(candidateWithObjectSkills as Candidate);
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'GET',
          query: { id: validCandidateId },
        });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        const responseJson = JSON.parse(res._getData());
        expect(responseJson.keySkills).toEqual(['Go', 'Rust', 'Agile']);
      });
  });

  it('should return 405 if method is not GET', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: 'POST', // Invalid method
      query: { id: validCandidateId },
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});
