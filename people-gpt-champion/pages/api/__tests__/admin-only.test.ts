import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../admin-only'; // Adjust path to your admin-only.ts handler
import { getServerSession } from 'next-auth/next';
import { createAuditLog } from '../../../lib/auditLog'; // Adjust path
import { Role } from '@prisma/client';

// Mock next-auth
jest.mock('next-auth/next');
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;

// Mock createAuditLog
jest.mock('../../../lib/auditLog'); // Adjust path as necessary
const mockCreateAuditLog = createAuditLog as jest.MockedFunction<typeof createAuditLog>;

describe('/api/admin-only API Endpoint', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockGetServerSession.mockReset();
    mockCreateAuditLog.mockReset();
  });

  test('should return 401 if user is not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null); // No session

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: 'GET',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({ message: 'Unauthorized: Not logged in' });
    expect(mockCreateAuditLog).not.toHaveBeenCalled();
  });

  test('should return 403 if user is authenticated but not an ADMIN', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user123', name: 'Test User', email: 'test@example.com', role: Role.USER },
      expires: 'never',
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: 'GET',
      url: '/api/admin-only', // For audit log details
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual(
      expect.objectContaining({ message: 'Forbidden: You do not have admin privileges.', userRole: Role.USER })
    );
    expect(mockCreateAuditLog).not.toHaveBeenCalled(); // Or called with ADMIN_ACCESS_DENIED if implemented
  });

  test('should return 403 if user session is missing role', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'user123', name: 'Test User', email: 'test@example.com' } as any, // Role missing
      expires: 'never',
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: 'GET',
      url: '/api/admin-only',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(JSON.parse(res._getData())).toEqual(
      expect.objectContaining({ message: 'Forbidden: You do not have admin privileges.', userRole: "No role found" })
    );
    expect(mockCreateAuditLog).not.toHaveBeenCalled();
  });


  test('should return 200 and success message for ADMIN user, and call audit log', async () => {
    const adminUser = { id: 'admin123', name: 'Admin User', email: 'admin@example.com', role: Role.ADMIN };
    mockGetServerSession.mockResolvedValue({
      user: adminUser,
      expires: 'never',
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: 'GET',
      url: '/api/admin-only', // For audit log details
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({ message: 'Success: You have admin access!', user: adminUser });

    expect(mockCreateAuditLog).toHaveBeenCalledTimes(1);
    expect(mockCreateAuditLog).toHaveBeenCalledWith({
      userId: adminUser.id,
      action: "ADMIN_ACCESS",
      details: { route: '/api/admin-only', method: 'GET' }, // Assuming Zod schema validation passes for this
    });
  });

  test('should handle audit log failure gracefully for ADMIN user', async () => {
    const adminUser = { id: 'admin123', name: 'Admin User', email: 'admin@example.com', role: Role.ADMIN };
    mockGetServerSession.mockResolvedValue({
      user: adminUser,
      expires: 'never',
    });
    mockCreateAuditLog.mockRejectedValueOnce(new Error("Audit log DB error")); // Simulate audit log failure

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: 'GET',
      url: '/api/admin-only',
    });

    // Spy on console.warn if your audit log details validation failure logs a warning
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200); // Still returns 200 as audit log is secondary
    expect(JSON.parse(res._getData())).toEqual({ message: 'Success: You have admin access!', user: adminUser });

    expect(mockCreateAuditLog).toHaveBeenCalledTimes(1);
    // You could check if console.warn was called if the audit log validation failed,
    // but here we are mocking the createAuditLog itself to throw an error.
    // The actual createAuditLog has its own try/catch.

    consoleWarnSpy.mockRestore();
  });
});
