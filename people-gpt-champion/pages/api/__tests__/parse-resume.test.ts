import { createMocks, RequestMethod } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../parse-resume'; // The API route handler
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { chatCompletionBreaker, getEmbeddingBreaker } from '../../../lib/openai';
import { PrismaClient, Candidate } from '@prisma/client';
import { Buffer } from 'buffer';

// Mock dependencies
jest.mock('multer');
jest.mock('pdf-parse');
jest.mock('mammoth');
jest.mock('../../../lib/openai');
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    candidate: {
      create: jest.fn(),
    },
    $disconnect: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mockPrismaClient) };
});

// Define a type for our mocked file
interface MockFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

const mockPdfParse = pdfParse as jest.Mock;
const mockMammoth = mammoth as jest.Mocked<typeof mammoth>; // Correctly type mocked mammoth
const mockChatCompletionBreaker = chatCompletionBreaker as jest.Mocked<typeof chatCompletionBreaker>;
const mockGetEmbeddingBreaker = getEmbeddingBreaker as jest.Mocked<typeof getEmbeddingBreaker>;

const mockPrisma = new PrismaClient(); // This will be our mocked instance

// Helper to create mock files
const createMockFile = (name: string, type: 'pdf' | 'docx' | 'txt', content: string = 'file content'): MockFile => {
  let mimetype = '';
  if (type === 'pdf') mimetype = 'application/pdf';
  else if (type === 'docx') mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  else mimetype = 'text/plain';

  return {
    originalname: name,
    mimetype: mimetype,
    buffer: Buffer.from(content),
    size: content.length,
  };
};

// Mock multer setup
const mockUpload = multer({ storage: multer.memoryStorage() }) as any; // Use 'any' for simplicity here
const actualMulter = jest.requireActual('multer');
const mockMulterInstance = {
  array: jest.fn().mockImplementation(() => (req, res, cb) => {
    // Simulate multer processing: assign req.files and call cb()
    if (mockUploadMiddlewareError) {
        cb(mockUploadMiddlewareError);
        return;
    }
    req.files = mockReqFiles;
    cb();
  }),
};
(multer as unknown as jest.Mock).mockReturnValue(mockMulterInstance);
let mockReqFiles: MockFile[] | undefined = [];
let mockUploadMiddlewareError: Error | null = null;


describe('API Route: /api/parse-resume', () => {
  let req: ReturnType<typeof createMocks>['req'];
  let res: ReturnType<typeof createMocks>['res'];

  beforeEach(() => {
    jest.clearAllMocks();
    mockReqFiles = []; // Reset mock files for each test
    mockUploadMiddlewareError = null; // Reset multer middleware error

    // Default mock implementations
    mockPdfParse.mockResolvedValue({ text: 'Parsed PDF text' });
    mockMammoth.extractRawText.mockResolvedValue({ value: 'Parsed DOCX text', messages: [] });
    mockChatCompletionBreaker.fire.mockResolvedValue({
      choices: [{ message: {
        content: JSON.stringify({
          personal_info: { name: 'Test User', email: 'test@example.com', phone: '1234567890' },
          work_experience: [],
          education: [],
          skills: ['Skill1'],
          certifications: [],
        })
      }}],
    } as any); // Cast to any to simplify mock structure
    mockGetEmbeddingBreaker.fire.mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] } as any);
    (mockPrisma.candidate.create as jest.Mock).mockImplementation(async (args) => ({
        id: 'test-candidate-id',
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
    }));
  });

  afterEach(async () => {
    // Ensure Prisma client disconnect is called if it was used.
    // This also helps if we ever use a real Prisma client in specific tests.
    await mockPrisma.$disconnect();
  });

  const callHandler = async () => {
    // Need to wrap handler call in a promise to wait for async operations within multer middleware
    return new Promise<void>((resolve, reject) => {
        // Simulate the way Next.js calls the handler, but with multer middleware behavior
        mockMulterInstance.array('resumes', 10)(req, res, async (err) => {
            if (err) {
                // This catches errors thrown by multer middleware itself (e.g., file size limit)
                // Our handler also checks for err, so this is a bit redundant but good for direct multer errors
                if (!res.writableEnded) { // Check if response already sent
                    res.status(400).json({ message: 'File upload error from mock middleware.', error: err.message });
                }
                resolve(); // Resolve promise even on error
                return;
            }
            try {
                await handler(req as NextApiRequest, res as NextApiResponse);
            } catch (e) {
               // Catch any unhandled errors from the handler itself
               if (!res.writableEnded) {
                   res.status(500).json({ message: 'Unhandled exception in handler', error: e.message });
               }
            } finally {
                resolve();
            }
        });
    });
  };


  test('should return 405 if method is not POST', async () => {
    ({ req, res } = createMocks({ method: 'GET' }));
    await handler(req as NextApiRequest, res as NextApiResponse); // No multer for non-POST
    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData().message).toMatch(/Method GET Not Allowed/);
  });

  describe('POST Requests', () => {
    it('should return 400 if no files are uploaded', async () => {
      ({ req, res } = createMocks({ method: 'POST', body: {} })); // body/form-data would be set by multer
      mockReqFiles = []; // Explicitly set no files for multer mock
      await callHandler();
      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().message).toBe('No files uploaded. Please upload one or more files with the field name "resumes".');
    });

    it('should successfully process a single valid PDF file', async () => {
      const mockFile = createMockFile('resume.pdf', 'pdf');
      mockReqFiles = [mockFile];
      ({ req, res } = createMocks({ method: 'POST' }));

      await callHandler();

      expect(res._getStatusCode()).toBe(207);
      const responseData = res._getJSONData();
      expect(responseData.message).toBe('Batch processing complete.');
      expect(responseData.results).toHaveLength(1);
      expect(responseData.results[0].status).toBe('success');
      expect(responseData.results[0].file).toBe('resume.pdf');
      expect(responseData.results[0].candidateId).toBe('test-candidate-id');
      expect(mockPrisma.candidate.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.candidate.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          email: 'test@example.com',
          resumeText: 'Parsed PDF text',
          skills: ['Skill1'],
          vectorEmbedding: Buffer.from(new Float32Array([0.1, 0.2]).buffer),
        }),
      }));
    });

    it('should successfully process a single valid DOCX file', async () => {
        const mockFile = createMockFile('resume.docx', 'docx');
        mockReqFiles = [mockFile];
        ({ req, res } = createMocks({ method: 'POST' }));

        await callHandler();

        expect(res._getStatusCode()).toBe(207);
        const responseData = res._getJSONData();
        expect(responseData.results).toHaveLength(1);
        expect(responseData.results[0].status).toBe('success');
        expect(responseData.results[0].file).toBe('resume.docx');
        expect(mockMammoth.extractRawText).toHaveBeenCalledWith({ buffer: mockFile.buffer });
        expect(mockPrisma.candidate.create).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({
            resumeText: 'Parsed DOCX text',
          }),
        }));
    });

    it('should successfully process a batch of multiple valid files', async () => {
        mockReqFiles = [
            createMockFile('resume1.pdf', 'pdf', 'pdf content 1'),
            createMockFile('resume2.docx', 'docx', 'docx content 2'),
        ];
        ({ req, res } = createMocks({ method: 'POST' }));

        // Mock different outcomes for chat completion for variety, if needed for other tests,
        // but here both succeed with same mock.
        (mockPrisma.candidate.create as jest.Mock)
            .mockImplementationOnce(async (args) => ({ id: 'id1', ...args.data }))
            .mockImplementationOnce(async (args) => ({ id: 'id2', ...args.data }));

        await callHandler();

        expect(res._getStatusCode()).toBe(207);
        const responseData = res._getJSONData();
        expect(responseData.results).toHaveLength(2);
        expect(responseData.results[0].status).toBe('success');
        expect(responseData.results[0].file).toBe('resume1.pdf');
        expect(responseData.results[0].candidateId).toBe('id1');
        expect(responseData.results[1].status).toBe('success');
        expect(responseData.results[1].file).toBe('resume2.docx');
        expect(responseData.results[1].candidateId).toBe('id2');
        expect(mockPrisma.candidate.create).toHaveBeenCalledTimes(2);
    });

    it('should handle multer fileFilter error for invalid file type', async () => {
        // This test relies on the multer mock correctly simulating the fileFilter behavior.
        // The actual fileFilter is part of the `upload` instance in the handler.
        // For this unit test, we'll simulate the error that multer would pass to the callback.
        mockUploadMiddlewareError = new Error('Invalid file type. Only PDF and DOCX files are allowed.');

        // Provide a file that would trigger the error if the actual filter was less directly mocked
        mockReqFiles = [createMockFile('resume.txt', 'txt')];

        ({ req, res } = createMocks({ method: 'POST' }));
        await callHandler(); // callHandler now simulates multer middleware

        expect(res._getStatusCode()).toBe(400);
        // The error message comes from the simulated multer middleware error
        expect(res._getJSONData().message).toBe('File upload error from mock middleware.');
        expect(res._getJSONData().error).toBe('Invalid file type. Only PDF and DOCX files are allowed.');
    });


    it('should return an error for a file if text extraction fails (e.g. pdf-parse error)', async () => {
        const mockFile = createMockFile('corrupt.pdf', 'pdf');
        mockReqFiles = [mockFile];
        mockPdfParse.mockRejectedValueOnce(new Error('PDF parsing failed'));
        ({ req, res } = createMocks({ method: 'POST' }));

        await callHandler();

        expect(res._getStatusCode()).toBe(207);
        const responseData = res._getJSONData();
        expect(responseData.results).toHaveLength(1);
        expect(responseData.results[0].status).toBe('error');
        expect(responseData.results[0].file).toBe('corrupt.pdf');
        expect(responseData.results[0].message).toBe('PDF parsing failed');
    });

    it('should return an error if OpenAI chat completion fails', async () => {
        mockReqFiles = [createMockFile('resume.pdf', 'pdf')];
        mockChatCompletionBreaker.fire.mockRejectedValueOnce(new Error('OpenAI API error'));
        ({ req, res } = createMocks({ method: 'POST' }));

        await callHandler();
        expect(res._getStatusCode()).toBe(207);
        const result = res._getJSONData().results[0];
        expect(result.status).toBe('error');
        expect(result.file).toBe('resume.pdf');
        expect(result.message).toBe('OpenAI API error');
    });

    it('should return an error if OpenAI returns non-JSON content', async () => {
        mockReqFiles = [createMockFile('resume.pdf', 'pdf')];
        mockChatCompletionBreaker.fire.mockResolvedValueOnce({ choices: [{ message: { content: 'This is not JSON' } }] } as any);
        ({ req, res } = createMocks({ method: 'POST' }));

        await callHandler();
        const result = res._getJSONData().results[0];
        expect(result.status).toBe('error');
        expect(result.file).toBe('resume.pdf');
        expect(result.message).toBe('Error parsing JSON response from AI.');
        expect(result.errorDetail).toBe('This is not JSON');
    });

    it('should return an error if Zod validation fails for OpenAI response', async () => {
        mockReqFiles = [createMockFile('resume.pdf', 'pdf')];
        mockChatCompletionBreaker.fire.mockResolvedValueOnce({
            choices: [{ message: { content: JSON.stringify({ personal_info: { name: 'Test Only Name No Email' } }) } }]
        } as any); // Missing email, which is required
        ({ req, res } = createMocks({ method: 'POST' }));

        await callHandler();
        const result = res._getJSONData().results[0];
        expect(result.status).toBe('error');
        expect(result.file).toBe('resume.pdf');
        expect(result.message).toBe('Invalid data format from AI.');
        expect(result.errorDetail).toBeDefined(); // Contains Zod error issues
    });

    it('should return an error if embedding generation fails', async () => {
        mockReqFiles = [createMockFile('resume.pdf', 'pdf')];
        mockGetEmbeddingBreaker.fire.mockRejectedValueOnce(new Error('Embedding API error'));
        ({ req, res } = createMocks({ method: 'POST' }));

        await callHandler();
        const result = res._getJSONData().results[0];
        expect(result.status).toBe('error');
        expect(result.file).toBe('resume.pdf');
        expect(result.message).toBe('Embedding API error');
    });

    it('should return an error if Prisma candidate.create fails with unique constraint', async () => {
        mockReqFiles = [createMockFile('resume.pdf', 'pdf')];
        const prismaError = { code: 'P2002', meta: { target: ['email'] }, message: "Unique constraint failed on the fields: (`email`)" };
        (mockPrisma.candidate.create as jest.Mock).mockRejectedValueOnce(prismaError);
        ({ req, res } = createMocks({ method: 'POST' }));

        await callHandler();
        const result = res._getJSONData().results[0];
        expect(result.status).toBe('error');
        expect(result.file).toBe('resume.pdf');
        expect(result.message).toBe('Candidate with this email already exists.');
    });

    it('should return an error if Prisma candidate.create fails with a generic error', async () => {
        mockReqFiles = [createMockFile('resume.pdf', 'pdf')];
        (mockPrisma.candidate.create as jest.Mock).mockRejectedValueOnce(new Error('Generic DB Error'));
        ({ req, res } = createMocks({ method: 'POST' }));

        await callHandler();
        const result = res._getJSONData().results[0];
        expect(result.status).toBe('error');
        expect(result.file).toBe('resume.pdf');
        expect(result.message).toBe('Generic DB Error');
    });

    it('should handle a mixed batch of success and various failures', async () => {
        mockReqFiles = [
            createMockFile('success.pdf', 'pdf', 'pdf content success'), // Will succeed
            createMockFile('openai_fail.docx', 'docx', 'docx content openai fail'), // OpenAI chat fails
            createMockFile('db_fail.pdf', 'pdf', 'pdf content db fail'), // DB create fails
        ];
        ({ req, res } = createMocks({ method: 'POST' }));

        // Mock behaviors for each file
        // 1. success.pdf (default mocks are for success)
        // 2. openai_fail.docx
        mockChatCompletionBreaker.fire
            .mockResolvedValueOnce({ // For success.pdf
                choices: [{ message: { content: JSON.stringify({ personal_info: { name: 'Success User', email: 'success@example.com' }, skills: [], work_experience: [], education: [] }) } }],
            } as any)
            .mockRejectedValueOnce(new Error('OpenAI Chat Failed for openai_fail.docx')) // For openai_fail.docx
            .mockResolvedValueOnce({ // For db_fail.pdf
                choices: [{ message: { content: JSON.stringify({ personal_info: { name: 'DB Fail User', email: 'dbfail@example.com' }, skills: [], work_experience: [], education: [] }) } }],
            } as any);

        mockGetEmbeddingBreaker.fire
            .mockResolvedValueOnce({ data: [{ embedding: [0.1] }] } as any) // success.pdf
            // No embedding call for openai_fail.docx as it fails before
            .mockResolvedValueOnce({ data: [{ embedding: [0.3] }] } as any); // db_fail.pdf


        (mockPrisma.candidate.create as jest.Mock)
            .mockImplementationOnce(async (args) => ({ id: 'success-id', ...args.data })) // For success.pdf
            // No create call for openai_fail.docx
            .mockRejectedValueOnce(new Error('DB create failed for db_fail.pdf')); // For db_fail.pdf

        await callHandler();

        expect(res._getStatusCode()).toBe(207);
        const responseData = res._getJSONData();
        expect(responseData.results).toHaveLength(3);

        const successResult = responseData.results.find(r => r.file === 'success.pdf');
        expect(successResult.status).toBe('success');
        expect(successResult.candidateId).toBe('success-id');

        const openaiFailResult = responseData.results.find(r => r.file === 'openai_fail.docx');
        expect(openaiFailResult.status).toBe('error');
        expect(openaiFailResult.message).toBe('OpenAI Chat Failed for openai_fail.docx');

        const dbFailResult = responseData.results.find(r => r.file === 'db_fail.pdf');
        expect(dbFailResult.status).toBe('error');
        expect(dbFailResult.message).toBe('DB create failed for db_fail.pdf');

        expect(mockPrisma.candidate.create).toHaveBeenCalledTimes(2); // Once for success, once for db_fail (which then failed)
    });

  });
});
