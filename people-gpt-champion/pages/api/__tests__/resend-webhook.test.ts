// people-gpt-champion/pages/api/__tests__/resend-webhook.test.ts
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../resend-webhook'; // Adjust path
import { PrismaClient } from '@prisma/client';

// Mock Prisma Client
const mockPrisma = {
  emailOutreach: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $disconnect: jest.fn(),
};
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

// Mock environment variable for webhook secret (though not fully testing signature)
const originalEnv = process.env;

describe('/api/resend-webhook API Endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, RESEND_WEBHOOK_SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('POST Requests', () => {
    const mockEmailOutreachRecord = {
      id: 'outreach-123',
      resendMessageId: 'resend-msg-abc',
      status: 'sent',
      openedAt: null,
      clickedAt: null,
    };

    it('should handle "email.opened" event and update outreach record', async () => {
      mockPrisma.emailOutreach.findUnique.mockResolvedValue(mockEmailOutreachRecord); // For the check before updating clickedAt
      mockPrisma.emailOutreach.update.mockResolvedValue({ ...mockEmailOutreachRecord, status: 'opened', openedAt: new Date() });

      const eventPayload = {
        type: 'email.opened',
        data: {
          email_id: 'resend-msg-abc',
          created_at: new Date().toISOString(),
        },
      };
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: eventPayload,
        headers: {
          // Placeholder for signature, actual verification logic is complex to mock here
          // 'resend-signature': 'mocked-signature-if-verification-was-real'
        }
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData()).message).toBe("Webhook processed for event 'email.opened'.");
      expect(mockPrisma.emailOutreach.update).toHaveBeenCalledWith({
        where: { resendMessageId: 'resend-msg-abc' },
        data: {
          status: 'opened',
          openedAt: expect.any(Date),
        },
      });
    });

    it('should handle "email.clicked" event and update outreach record', async () => {
      mockPrisma.emailOutreach.findUnique.mockResolvedValue({ ...mockEmailOutreachRecord, openedAt: new Date() }); // Assume already opened
      mockPrisma.emailOutreach.update.mockResolvedValue({ ...mockEmailOutreachRecord, status: 'clicked', clickedAt: new Date() });

      const eventPayload = {
        type: 'email.clicked',
        data: { email_id: 'resend-msg-abc', created_at: new Date().toISOString() },
      };
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST', body: eventPayload });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(mockPrisma.emailOutreach.update).toHaveBeenCalledWith({
        where: { resendMessageId: 'resend-msg-abc' },
        data: {
          status: 'clicked',
          clickedAt: expect.any(Date),
          // openedAt might also be set here if it wasn't already by an 'opened' event
        },
      });
    });

    it('should set openedAt if not already set on "email.clicked" event', async () => {
        mockPrisma.emailOutreach.findUnique.mockResolvedValue(mockEmailOutreachRecord); // openedAt is null
        mockPrisma.emailOutreach.update.mockResolvedValue({
          ...mockEmailOutreachRecord,
          status: 'clicked',
          openedAt: expect.any(Date), // should be set
          clickedAt: expect.any(Date)
        });

        const eventPayload = {
          type: 'email.clicked',
          data: { email_id: 'resend-msg-abc', created_at: new Date().toISOString() },
        };
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST', body: eventPayload });
        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        expect(mockPrisma.emailOutreach.update).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({
            openedAt: expect.any(Date), // Check that openedAt is now being set
            clickedAt: expect.any(Date),
          }),
        }));
      });

    it('should handle "email.delivered" event', async () => {
      mockPrisma.emailOutreach.update.mockResolvedValue({ ...mockEmailOutreachRecord, status: 'delivered' });
      const eventPayload = {
        type: 'email.delivered',
        data: { email_id: 'resend-msg-abc', created_at: new Date().toISOString() },
      };
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST', body: eventPayload });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(mockPrisma.emailOutreach.update).toHaveBeenCalledWith({
        where: { resendMessageId: 'resend-msg-abc' },
        data: { status: 'delivered' },
      });
    });

    it('should return 400 for invalid payload structure (missing type)', async () => {
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: { data: { email_id: 'resend-msg-abc', created_at: new Date().toISOString() } }, // 'type' is missing
        });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(400);
        expect(JSON.parse(res._getData()).errors.fieldErrors?.type).toContain('Required');
      });

    it('should return 404 if resendMessageId is not found', async () => {
      mockPrisma.emailOutreach.update.mockRejectedValue({ code: 'P2025' }); // Prisma error for record not found
      const eventPayload = {
        type: 'email.opened',
        data: { email_id: 'unknown-resend-id', created_at: new Date().toISOString() },
      };
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST', body: eventPayload });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(404);
      expect(JSON.parse(res._getData()).error).toContain('EmailOutreach record not found');
    });

    it('should acknowledge webhook signature verification placeholder', async () => {
      // This test mainly checks that the console.warn is present if we could spy on console.
      // For now, just ensure the flow continues past the placeholder.
      mockPrisma.emailOutreach.update.mockResolvedValue(mockEmailOutreachRecord);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const eventPayload = {
        type: 'email.delivered', // Any valid event
        data: { email_id: 'resend-msg-abc', created_at: new Date().toISOString() },
      };
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST', body: eventPayload });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200); // Indicates flow proceeded
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Resend webhook signature verification is currently skipped"));
      consoleWarnSpy.mockRestore();
    });

    it('should return 200 for unhandled event types', async () => {
        const eventPayload = {
          type: 'email.sent', // Or any other type not explicitly case handled for DB update
          data: { email_id: 'resend-msg-abc', created_at: new Date().toISOString() },
        };
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST', body: eventPayload });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(JSON.parse(res._getData()).message).toContain("no specific action taken");
        expect(mockPrisma.emailOutreach.update).not.toHaveBeenCalled();
      });
  });

  it('should return 405 if method is not POST', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});
