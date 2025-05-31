import { createMocks, RequestMethod } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import exportHandler from '../export'; // Adjust path to your export.ts handler
import { getServerSession } from 'next-auth/next';
import { PrismaClient, User, AuditLog, Role } from '@prisma/client'; // Import Role
import { createAuditLog } from '../../../../lib/auditLog'; // Adjust path
import { UserDataExportSchema, IUserDataExport, GdprActionDetailsSchema } from '../../../../lib/schemas'; // Adjust path
import { z } from 'zod';

// Mock next-auth
jest.mock('next-auth/next');
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;

// Mock Prisma client
jest.mock('@prisma/client', () => {
  const originalModule = jest.requireActual('@prisma/client');
  return {
    ...originalModule,
    PrismaClient: jest.fn().mockImplementation(() => ({
      user: {
        findUnique: jest.fn(),
      },
      auditLog: {
        findMany: jest.fn(),
      },
      $disconnect: jest.fn(),
    })),
  };
});
const prismaMock = new PrismaClient() as jest.Mocked<PrismaClient>;

// Mock createAuditLog
jest.mock('../../../../lib/auditLog');
const mockCreateAuditLog = createAuditLog as jest.MockedFunction<typeof createAuditLog>;

describe('/api/gdpr/export API Endpoint', () => {
  const mockUserId = 'user-cuid-123';
  const mockUser: User = {
    id: mockUserId,
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: new Date(),
    image: 'https://example.com/avatar.jpg',
    role: Role.USER, // Use actual Role enum value
    // Add other User fields as defined in your Prisma schema if they are exported
    // For example, if you added createdAt/updatedAt to User model for export:
    // createdAt: new Date(),
    // updatedAt: new Date(),
  };

  const mockAuditLogs: AuditLog[] = [
    {
      id: 'audit-cuid-1',
      userId: mockUserId,
      action: 'USER_LOGIN',
      details: { ip: '127.0.0.1' }, // Prisma.JsonValue
      entity: null,
      entityId: null,
      createdAt: new Date(),
    },
    {
      id: 'audit-cuid-2',
      userId: mockUserId,
      action: 'CANDIDATE_SEARCH',
      details: { query: 'Software Engineer' }, // Prisma.JsonValue
      entity: 'SearchQuery',
      entityId: 'query-cuid-456',
      createdAt: new Date(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return 401 if user is not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET' });
    await exportHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual(
      expect.objectContaining({ message: 'Unauthorized: Not logged in or user ID missing.' })
    );
  });

  test('should return 200 and export data for an authenticated user', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: mockUserId, email: mockUser.email }, // Session user object
      expires: 'never',
    });
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prismaMock.auditLog.findMany as jest.Mock).mockResolvedValue(mockAuditLogs);

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET' });
    await exportHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getHeaders()['content-disposition']).toContain(`attachment; filename="user_data_export_${mockUserId}.json"`);

    const responseData = JSON.parse(res._getData()) as IUserDataExport;

    // Validate against Zod schema (good practice)
    const validation = UserDataExportSchema.safeParse(responseData);
    expect(validation.success).toBe(true);

    expect(responseData.userData.id).toBe(mockUser.id);
    expect(responseData.userData.email).toBe(mockUser.email);
    expect(responseData.userData.role).toBe(mockUser.role);
    expect(responseData.auditLogs.length).toBe(mockAuditLogs.length);
    expect(responseData.auditLogs[0].action).toBe(mockAuditLogs[0].action);

    // Verify audit log call for the export action itself
    expect(mockCreateAuditLog).toHaveBeenCalledTimes(1);
    const expectedAuditDetails: z.infer<typeof GdprActionDetailsSchema> = {
        targetUserId: mockUserId,
        actionType: "USER_DATA_EXPORT_REQUEST",
    };
    // Check if the actual call matches, allowing for potential ipAddress field
     expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        userId: mockUserId,
        action: "USER_DATA_EXPORT_REQUEST",
        details: expect.objectContaining(expectedAuditDetails), // Use objectContaining for details
        entity: "User",
        entityId: mockUserId,
    }));
  });

  test('should return 404 if user data not found', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: mockUserId, email: 'notfound@example.com' },
      expires: 'never',
    });
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null); // Simulate user not found

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET' });
    await exportHandler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(JSON.parse(res._getData())).toEqual(expect.objectContaining({ message: 'User not found.' }));
  });

  test('should return 405 if method is not GET', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST' });
    await exportHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});
