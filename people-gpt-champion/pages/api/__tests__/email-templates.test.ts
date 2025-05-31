// people-gpt-champion/pages/api/__tests__/email-templates.test.ts
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../email-templates'; // Adjust path
import { PrismaClient } from '@prisma/client';

// Mock Prisma Client
const mockPrisma = {
  emailTemplate: {
    findMany: jest.fn(),
  },
  $disconnect: jest.fn(),
};
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

describe('/api/email-templates API Endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET Requests', () => {
    const mockTemplatesData = [
      {
        id: 'tmpl_1',
        name: 'Template Alpha',
        createdAt: new Date(),
        updatedAt: new Date(),
        versions: [
          { id: 'v1a', templateId: 'tmpl_1', subject: 'Sub A1', body: 'Body A1', versionNumber: 1, isArchived: false, createdAt: new Date(), updatedAt: new Date() },
          { id: 'v1b', templateId: 'tmpl_1', subject: 'Sub A2', body: 'Body A2', versionNumber: 2, isArchived: true, createdAt: new Date(), updatedAt: new Date() }, // Archived
        ],
      },
      {
        id: 'tmpl_2',
        name: 'Template Beta',
        createdAt: new Date(),
        updatedAt: new Date(),
        versions: [
          { id: 'v2a', templateId: 'tmpl_2', subject: 'Sub B1', body: 'Body B1', versionNumber: 1, isArchived: false, createdAt: new Date(), updatedAt: new Date() },
        ],
      },
      {
        id: 'tmpl_3', // This template only has archived versions
        name: 'Template Gamma',
        createdAt: new Date(),
        updatedAt: new Date(),
        versions: [
          { id: 'v3a', templateId: 'tmpl_3', subject: 'Sub G1', body: 'Body G1', versionNumber: 1, isArchived: true, createdAt: new Date(), updatedAt: new Date() },
        ],
      }
    ];

    it('should retrieve non-archived email templates and their non-archived versions', async () => {
      mockPrisma.emailTemplate.findMany.mockResolvedValue(mockTemplatesData);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET' });
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseJson = JSON.parse(res._getData());

      // Expected: Template Alpha (with 1 version), Template Beta (with 1 version)
      // Template Gamma should be filtered out because its only version is archived.
      expect(responseJson).toHaveLength(2);
      expect(responseJson[0].id).toBe('tmpl_1');
      expect(responseJson[0].name).toBe('Template Alpha');
      expect(responseJson[0].versions).toHaveLength(1); // Only non-archived version v1a
      expect(responseJson[0].versions[0].id).toBe('v1a');
      expect(responseJson[0].versions[0].isArchived).toBe(false);

      expect(responseJson[1].id).toBe('tmpl_2');
      expect(responseJson[1].versions).toHaveLength(1);
      expect(responseJson[1].versions[0].id).toBe('v2a');

      expect(mockPrisma.emailTemplate.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          versions: {
            where: { isArchived: false },
            orderBy: { versionNumber: 'desc' },
          },
        },
        orderBy: { name: 'asc' },
      });
    });

    it('should return an empty array if no templates are found', async () => {
      mockPrisma.emailTemplate.findMany.mockResolvedValue([]);
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET' });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toEqual([]);
    });

    it('should return an empty array if all templates only have archived versions', async () => {
        const onlyArchivedTemplates = [
            {
                id: 'tmpl_archived_only', name: 'Archived Only Template', createdAt: new Date(), updatedAt: new Date(),
                versions: [ { id: 'v_archived', templateId: 'tmpl_archived_only', subject: 'S', body: 'B', versionNumber: 1, isArchived: true, createdAt: new Date(), updatedAt: new Date() }]
            }
        ];
        mockPrisma.emailTemplate.findMany.mockResolvedValue(onlyArchivedTemplates);
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET' });
        await handler(req, res);
        expect(res._getStatusCode()).toBe(200);
        expect(JSON.parse(res._getData())).toEqual([]);
      });

    it('should handle Prisma errors', async () => {
      const dbError = new Error('Database connection error');
      mockPrisma.emailTemplate.findMany.mockRejectedValue(dbError);
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET' });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData()).error).toBe('Failed to fetch email templates.');
      expect(JSON.parse(res._getData()).details).toBe(dbError.message);
    });
  });

  it('should return 405 if method is not GET', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});
