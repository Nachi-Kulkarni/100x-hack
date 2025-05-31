// people-gpt-champion/pages/api/__tests__/send-email.test.ts
import { createMocks, RequestMethod } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../send-email'; // Adjust path as necessary
import { sendEmail as resendSendEmail } from '../../../lib/resend'; // Actual path
import { PrismaClient } from '@prisma/client';

// Mock Resend
jest.mock('../../../lib/resend', () => ({
  sendEmail: jest.fn(),
}));

// Mock Prisma Client
const mockPrisma = {
  emailTemplateVersion: {
    findUnique: jest.fn(),
  },
  emailOutreach: {
    create: jest.fn(),
  },
  $disconnect: jest.fn(),
};
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

describe('/api/send-email API Endpoint', () => {
  const mockTemplateVersion = {
    id: 'cltestversion001',
    subject: 'Test Subject from DB',
    body: '<p>Test Body from DB</p>',
    isArchived: false,
  };
  const mockResendSuccessResponse = { id: 'resend-message-id-123' };
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, RESEND_FROM_EMAIL: 'test@example.com' };
  });

  afterEach(() => {
    process.env = originalEnv; // Restore original environment variables
  });

  describe('POST Requests', () => {
    const validCandidateId = 'clsendemailcand01';
    it('should send email successfully and create outreach record without candidateId', async () => {
      mockPrisma.emailTemplateVersion.findUnique.mockResolvedValue(mockTemplateVersion);
      (resendSendEmail as jest.Mock).mockResolvedValue(mockResendSuccessResponse);
      mockPrisma.emailOutreach.create.mockResolvedValue({ id: 'outreach-id-456' });

      const requestBody = {
        to: 'recipient@example.com',
        templateVersionId: 'cltestversion001',
        // candidateId is omitted
      };
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: requestBody,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.success).toBe(true);
      expect(responseJson.messageId).toBe(mockResendSuccessResponse.id);

      expect(mockPrisma.emailTemplateVersion.findUnique).toHaveBeenCalledWith({
        where: { id: 'cltestversion001' },
      });
      expect(resendSendEmail).toHaveBeenCalledWith({
        to: 'recipient@example.com',
        from: 'test@example.com',
        subject: mockTemplateVersion.subject,
        html: mockTemplateVersion.body,
      });
      expect(mockPrisma.emailOutreach.create).toHaveBeenCalledWith({
        data: {
          templateVersionId: 'cltestversion001',
          recipientEmail: 'recipient@example.com',
          resendMessageId: mockResendSuccessResponse.id,
          status: 'sent',
          // candidateId should not be present here
        },
      });
       // Check that candidateId was NOT in the call to create
       const createCallArgs = mockPrisma.emailOutreach.create.mock.calls[0][0].data;
       expect(createCallArgs.candidateId).toBeUndefined();
    });

    it('should send email successfully and create outreach record WITH candidateId', async () => {
        mockPrisma.emailTemplateVersion.findUnique.mockResolvedValue(mockTemplateVersion);
        (resendSendEmail as jest.Mock).mockResolvedValue(mockResendSuccessResponse);
        mockPrisma.emailOutreach.create.mockResolvedValue({ id: 'outreach-id-789' });

        const requestBodyWithCandidate = {
          to: 'another@example.com',
          templateVersionId: 'cltestversion001',
          candidateId: validCandidateId,
        };
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: requestBodyWithCandidate,
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        expect(mockPrisma.emailOutreach.create).toHaveBeenCalledWith({
          data: {
            templateVersionId: 'cltestversion001',
            recipientEmail: 'another@example.com',
            resendMessageId: mockResendSuccessResponse.id,
            status: 'sent',
            candidateId: validCandidateId, // Verify candidateId is passed
          },
        });
      });


    it('should return 404 if template version not found', async () => {
      mockPrisma.emailTemplateVersion.findUnique.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: { to: 'recipient@example.com', templateVersionId: 'nonexistent-id' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(JSON.parse(res._getData()).error).toBe('Email template version not found.');
    });

    it('should return 404 if template version is archived', async () => {
      mockPrisma.emailTemplateVersion.findUnique.mockResolvedValue({ ...mockTemplateVersion, isArchived: true });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: { to: 'recipient@example.com', templateVersionId: 'cltestversion001' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(404);
      expect(JSON.parse(res._getData()).error).toBe('Email template version is archived and cannot be used.');
    });

    it('should return 400 for invalid request body (e.g., invalid email)', async () => {
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: { to: 'invalid-email', templateVersionId: 'cltestversion001' },
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
        const responseJson = JSON.parse(res._getData());
        expect(responseJson.error.fieldErrors?.to).toContain("Invalid 'to' email address (recipientEmail).");
      });

    it('should return 400 for invalid templateVersionId (not CUID)', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: { to: 'recipient@example.com', templateVersionId: 'not-a-cuid' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.error.fieldErrors?.templateVersionId).toContain("Invalid Template Version ID.");
    });

    it('should return 400 for invalid candidateId format (if provided)', async () => {
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: {
            to: 'recipient@example.com',
            templateVersionId: 'cltestversion001',
            candidateId: 'invalid-cuid-format'
          },
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
        const responseJson = JSON.parse(res._getData());
        expect(responseJson.error.fieldErrors?.candidateId).toContain("Invalid Candidate ID format.");
      });


    it('should handle Resend API errors', async () => {
      mockPrisma.emailTemplateVersion.findUnique.mockResolvedValue(mockTemplateVersion);
      const resendError = new Error('Resend API Failed');
      (resendSendEmail as jest.Mock).mockRejectedValue(resendError);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: { to: 'recipient@example.com', templateVersionId: 'cltestversion001' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData()).error).toContain(`Failed to process request: ${resendError.message}`);
      expect(mockPrisma.emailOutreach.create).not.toHaveBeenCalled();
    });

    it('should return 500 if RESEND_FROM_EMAIL is not set', async () => {
      delete process.env.RESEND_FROM_EMAIL; // Remove the env var

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: { to: 'recipient@example.com', templateVersionId: 'cltestversion001' },
      });

      await handler(req, res);
      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData()).error).toBe('Server configuration error: From email not set.');
    });

    it('should handle Prisma errors during outreach creation', async () => {
        mockPrisma.emailTemplateVersion.findUnique.mockResolvedValue(mockTemplateVersion);
        (resendSendEmail as jest.Mock).mockResolvedValue(mockResendSuccessResponse);
        const prismaError = new Error('Prisma DB error');
        mockPrisma.emailOutreach.create.mockRejectedValue(prismaError);

        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: { to: 'recipient@example.com', templateVersionId: 'cltestversion001' },
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(500);
        expect(JSON.parse(res._getData()).error).toContain(`Failed to process request: ${prismaError.message}`);
      });
  });

  it('should return 405 if method is not POST', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});
