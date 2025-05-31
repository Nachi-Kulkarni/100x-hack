import { createMocks, RequestMethod } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import deleteHandler from '../delete'; // Adjust path to your delete.ts handler
import { getServerSession } from 'next-auth/next';
import { PrismaClient, Role } from '@prisma/client';
import { createAuditLog } from '../../../../lib/auditLog'; // Adjust path
import { GdprActionDetailsSchema } from '../../../../lib/schemas'; // Adjust path
import { z } from 'zod';

// Mock next-auth
jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(), // Default mock for getServerSession
}));
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;

// Declare hoisted refs for mock functions
var mockAuditLogUpdateManyRef: jest.Mock;
var mockUserDeleteRef: jest.Mock;
var mockTransactionRef: jest.Mock;

jest.mock('@prisma/client', () => {
  // Create new jest.fn() instances and assign them to the hoisted refs
  mockAuditLogUpdateManyRef = jest.fn();
  mockUserDeleteRef = jest.fn();
  mockTransactionRef = jest.fn(async (callback) => {
    // Simulate the callback with the mocked methods
    await callback({
      auditLog: { updateMany: mockAuditLogUpdateManyRef },
      user: { delete: mockUserDeleteRef },
    });
    return { count: 1 }; // Example transaction result
  });

  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      $transaction: mockTransactionRef,
      // Add direct mocks for other methods if used by the handler outside transactions
      user: { delete: mockUserDeleteRef },
      auditLog: { updateMany: mockAuditLogUpdateManyRef },
      $disconnect: jest.fn(),
    })),
    Prisma: { // Mock Prisma namespace if error types or enums are used
      PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
        code: string;
        constructor(message: string, code: string) {
          super(message);
          this.code = code;
          Object.setPrototypeOf(this, PrismaClientKnownRequestError.prototype);
        }
      },
      // Add other Prisma enums if needed
      // e.g. Role: originalModule.Role (if originalModule is accessible and needed)
    },
  };
});

// Mock createAuditLog
jest.mock('../../../../lib/auditLog');
const mockCreateAuditLog = createAuditLog as jest.MockedFunction<typeof createAuditLog>;


describe('/api/gdpr/delete API Endpoint', () => {
  const mockUserId = 'user-cuid-to-delete-123';

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset and re-configure mock implementations for each test
    mockGetServerSession.mockResolvedValue({ // Default session for most tests
      user: { id: mockUserId, email: 'delete@example.com', role: 'ADMIN' }, // Assuming ADMIN for GDPR ops
      expires: 'never',
    });
    mockAuditLogUpdateManyRef.mockResolvedValue({ count: 1 });
    mockUserDeleteRef.mockResolvedValue({ id: mockUserId });
    mockTransactionRef.mockImplementation(async (callback) => {
      await callback({
        auditLog: { updateMany: mockAuditLogUpdateManyRef },
        user: { delete: mockUserDeleteRef },
      });
      return { count: 1 };
    });
  });

  test('should return 401 if user is not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null); // Override session for this test
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST' });
    await deleteHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual(
      expect.objectContaining({ message: 'Unauthorized: Not logged in or user ID missing.' })
    );
  });

  test('should return 200 and success message for an authenticated user, auditing and performing deletion', async () => {
    // mockGetServerSession is already set up in beforeEach for a valid admin session

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST' });
    // The handler will use req.session.user.id if session is directly on req,
    // or it relies on getServerSession internally. Our mock handles getServerSession.
    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      message: 'User data deletion process initiated successfully.',
      userId: mockUserId, // Assuming the handler uses the ID from the session for the response
    });

    // Verify audit log call for the deletion request
    expect(mockCreateAuditLog).toHaveBeenCalledTimes(1);
    const expectedAuditDetails: z.infer<typeof GdprActionDetailsSchema> = {
        targetUserId: mockUserId, // This should be the ID from the session
        actionType: "USER_DATA_DELETION_REQUEST",
    };
    expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        userId: mockUserId, // Actor ID from session
        action: "USER_DATA_DELETION_REQUEST",
        details: expect.objectContaining(expectedAuditDetails),
        entity: "User",
        entityId: mockUserId, // Target entity ID
    }));

    // Verify transaction was called
    expect(mockTransactionRef).toHaveBeenCalledTimes(1);

    // Check calls to the functions used inside the transaction
    expect(mockAuditLogUpdateManyRef).toHaveBeenCalledWith({ // Corrected to Ref
        where: { userId: mockUserId },
        data: { userId: null },
    });
    expect(mockUserDeleteRef).toHaveBeenCalledWith({ // Corrected to Ref
        where: { id: mockUserId },
    });
  });

  test('should return 404 if user to delete is not found during transaction', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: mockUserId, email: 'notfound@example.com' },
      expires: 'never',
    });

    // Simulate Prisma's P2025 error for "Record to delete not found"
    // by having the user.delete mock (passed to transaction) throw the specific error
    if (mockUserDeleteRef) mockUserDeleteRef.mockRejectedValue({ code: 'P2025' });
    if (mockTransactionRef) mockTransactionRef.mockImplementationOnce(async (callback) => {
        try {
            return await callback({ // The callback will use the globally mocked mockUserDeleteRef
                auditLog: { updateMany: mockAuditLogUpdateManyRef },
                user: { delete: mockUserDeleteRef },
            });
        } catch (err) {
            // This catch is important if the callback itself might throw before prisma ops
            throw err;
        }
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST' });
    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(JSON.parse(res._getData())).toEqual(expect.objectContaining({ message: 'User not found or already deleted.' }));
  });

  test('should return 405 if method is not POST', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET' });
    await deleteHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});
