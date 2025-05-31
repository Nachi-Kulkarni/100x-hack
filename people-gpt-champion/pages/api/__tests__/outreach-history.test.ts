// people-gpt-champion/pages/api/__tests__/outreach-history.test.ts
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../outreach-history'; // Adjust path
import { PrismaClient } from '@prisma/client';

// Mock Prisma Client
const mockPrisma = {
  emailOutreach: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
  $disconnect: jest.fn(),
};
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

describe('/api/outreach-history API Endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock $transaction to execute the findMany and count mocks
    mockPrisma.$transaction.mockImplementation(async (transactionArgs: any[]) => {
      const results = [];
      if (transactionArgs[0]) results.push(await mockPrisma.emailOutreach.findMany(transactionArgs[0]));
      if (transactionArgs[1]) results.push(await mockPrisma.emailOutreach.count(transactionArgs[1]));
      return results;
    });
  });

  describe('GET Requests', () => {
    const mockOutreachData = [
      {
        id: 'outreach_1',
        recipientEmail: 'test1@example.com',
        sentAt: new Date(),
        resendMessageId: 'resend_1',
        status: 'opened',
        openedAt: new Date(),
        clickedAt: null,
        templateVersion: {
          id: 'tv_1',
          versionNumber: 1,
          subject: 'Subject 1',
          template: { id: 'tmpl_a', name: 'Template Alpha' },
        },
      },
      {
        id: 'outreach_2',
        recipientEmail: 'test2@example.com',
        sentAt: new Date(),
        resendMessageId: 'resend_2',
        status: 'sent',
        openedAt: null,
        clickedAt: null,
        templateVersion: {
          id: 'tv_2',
          versionNumber: 2,
          subject: 'Subject 2',
          template: { id: 'tmpl_b', name: 'Template Beta' },
        },
      },
    ];

    it('should retrieve outreach history with default pagination', async () => {
      mockPrisma.emailOutreach.findMany.mockResolvedValue(mockOutreachData);
      mockPrisma.emailOutreach.count.mockResolvedValue(mockOutreachData.length);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET', query: {} });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.data).toHaveLength(mockOutreachData.length);
      expect(responseJson.total).toBe(mockOutreachData.length);
      expect(responseJson.page).toBe(1);
      expect(responseJson.pageSize).toBe(10);
      expect(responseJson.totalPages).toBe(1); // Math.ceil(2/10) = 1

      expect(mockPrisma.emailOutreach.findMany).toHaveBeenCalledWith(expect.objectContaining({
        skip: 0,
        take: 10,
        orderBy: { sentAt: 'desc' },
        include: expect.any(Object), // Check for include if needed
      }));
      expect(mockPrisma.emailOutreach.count).toHaveBeenCalledTimes(1);
    });

    it('should retrieve outreach history with custom pagination (page 2, pageSize 1)', async () => {
      mockPrisma.emailOutreach.findMany.mockResolvedValue([mockOutreachData[1]]); // Second item for page 2
      mockPrisma.emailOutreach.count.mockResolvedValue(mockOutreachData.length); // Total is still 2

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
        query: { page: '2', pageSize: '1' },
      });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.data).toHaveLength(1);
      expect(responseJson.data[0].id).toBe('outreach_2');
      expect(responseJson.total).toBe(mockOutreachData.length);
      expect(responseJson.page).toBe(2);
      expect(responseJson.pageSize).toBe(1);
      expect(responseJson.totalPages).toBe(2); // Math.ceil(2/1) = 2

      expect(mockPrisma.emailOutreach.findMany).toHaveBeenCalledWith(expect.objectContaining({
        skip: 1, // (2-1)*1
        take: 1,
      }));
    });

    it('should return 400 for invalid page parameter (e.g., not a number)', async () => {
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'GET',
          query: { page: 'abc', pageSize: '10' },
        });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(400);
        const responseJson = JSON.parse(res._getData());
        expect(responseJson.error).toBe("Invalid query parameters");
        expect(responseJson.details.fieldErrors?.page).toBeDefined();
      });

    it('should return 400 for invalid pageSize parameter (e.g., too large)', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
        query: { page: '1', pageSize: '200' }, // Assuming max 100
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.details.fieldErrors?.pageSize).toContain('Number must be less than or equal to 100');
    });

    it('should correctly populate related template/version data', async () => {
      mockPrisma.emailOutreach.findMany.mockResolvedValue([mockOutreachData[0]]);
      mockPrisma.emailOutreach.count.mockResolvedValue(1);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET', query: {} });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseJson = JSON.parse(res._getData());
      const firstItem = responseJson.data[0];
      expect(firstItem.templateVersion.id).toBe('tv_1');
      expect(firstItem.templateVersion.versionNumber).toBe(1);
      expect(firstItem.templateVersion.subject).toBe('Subject 1');
      expect(firstItem.templateVersion.template.id).toBe('tmpl_a');
      expect(firstItem.templateVersion.template.name).toBe('Template Alpha');
    });

    it('should handle Prisma errors', async () => {
      const dbError = new Error('Database query failed');
      // mockPrisma.emailOutreach.findMany.mockRejectedValue(dbError); // This would be for non-transactional
      mockPrisma.$transaction.mockRejectedValue(dbError); // For transactional

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET', query: {} });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData()).error).toBe('Failed to fetch outreach history.');
      expect(JSON.parse(res._getData()).details).toBe(dbError.message);
    });
  });

  it('should return 405 if method is not GET', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});
