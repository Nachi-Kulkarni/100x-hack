import { createMocks, RequestMethod } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import deleteHandler from '../delete'; // Adjust path to your delete.ts handler
import { getServerSession } from 'next-auth/next';
import { PrismaClient, Role } from '@prisma/client';
import { createAuditLog } from '../../../../lib/auditLog'; // Adjust path
import { GdprActionDetailsSchema } from '../../../../lib/schemas'; // Adjust path
import { z } from 'zod';

// Mock next-auth
jest.mock('next-auth/next');
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;

// Mock Prisma client
const mockTransaction = jest.fn();
jest.mock('@prisma/client', () => {
  const originalModule = jest.requireActual('@prisma/client');
  return {
    ...originalModule,
    PrismaClient: jest.fn().mockImplementation(() => ({
      $transaction: mockTransaction, // Mock the $transaction method
      auditLog: {
        updateMany: jest.fn(),
      },
      user: {
        delete: jest.fn(),
      },
      $disconnect: jest.fn(),
    })),
  };
});
const prismaMock = new PrismaClient() as jest.Mocked<PrismaClient>;

// Mock createAuditLog
jest.mock('../../../../lib/auditLog');
const mockCreateAuditLog = createAuditLog as jest.MockedFunction<typeof createAuditLog>;


describe('/api/gdpr/delete API Endpoint', () => {
  const mockUserId = 'user-cuid-to-delete-123';

  beforeEach(() => {
    jest.clearAllMocks();
    // Default successful transaction
    mockTransaction.mockImplementation(async (callback) => {
      // Simulate the operations within the transaction callback
      const txMock = {
        auditLog: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        user: { delete: jest.fn().mockResolvedValue({ id: mockUserId }) },
      };
      return await callback(txMock);
    });
  });

  test('should return 401 if user is not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST' });
    await deleteHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual(
      expect.objectContaining({ message: 'Unauthorized: Not logged in or user ID missing.' })
    );
  });

  test('should return 200 and success message for an authenticated user, auditing and performing deletion', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: mockUserId, email: 'delete@example.com' },
      expires: 'never',
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'POST' });
    await deleteHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(JSON.parse(res._getData())).toEqual({
      message: 'User data deletion process initiated successfully.',
      userId: mockUserId,
    });

    // Verify audit log call for the deletion request
    expect(mockCreateAuditLog).toHaveBeenCalledTimes(1);
    const expectedAuditDetails: z.infer<typeof GdprActionDetailsSchema> = {
        targetUserId: mockUserId,
        actionType: "USER_DATA_DELETION_REQUEST",
    };
    expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        userId: mockUserId,
        action: "USER_DATA_DELETION_REQUEST",
        details: expect.objectContaining(expectedAuditDetails),
        entity: "User",
        entityId: mockUserId,
    }));

    // Verify transaction was called
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // Access the mock implementations from the transaction callback
    const transactionCallback = mockTransaction.mock.calls[0][0];
    const txPrisma = {
        auditLog: { updateMany: (prismaMock.auditLog.updateMany as jest.Mock) },
        user: { delete: (prismaMock.user.delete as jest.Mock) }
    };
    // We cannot directly test the calls inside the callback this way unless we re-execute it or inspect deeper.
    // A simpler way is to ensure the mocks passed to the transaction were called.
    // However, the current setup re-mocks them inside the transaction.
    // Alternative: check if the main prismaMock methods were called if transaction isn't deeply mocked.
    // For this setup, we'll rely on the transaction mock being called.
    // To test the operations *within* the transaction, the mock of $transaction would need to
    // actually execute the callback with correctly mocked `tx` argument methods.

    // Let's refine the transaction mock to allow checking calls on tx methods
    const mockTxAuditLogUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const mockTxUserDelete = jest.fn().mockResolvedValue({ id: mockUserId });
    mockTransaction.mockImplementationOnce(async (callback) => {
        return await callback({
            auditLog: { updateMany: mockTxAuditLogUpdateMany },
            user: { delete: mockTxUserDelete },
        });
    });

    // Re-run with refined mock for this specific test part if needed, or structure beforeEach carefully.
    // For simplicity, assuming the above call to deleteHandler already used this refined mock if placed in beforeEach or if this is the first test using it.
    // If not, this test would need to re-run deleteHandler(req,res) after setting up this specific mockTransaction.
    // To be robust, let's re-run for this specific check:
    await deleteHandler(req, res); // This will use the mockTransaction set just above if it's the first.
                                    // Or, better, ensure the mock is set before this test runs.

    expect(mockTxAuditLogUpdateMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: { userId: null },
    });
    expect(mockTxUserDelete).toHaveBeenCalledWith({
        where: { id: mockUserId },
    });
  });

  test('should return 404 if user to delete is not found during transaction', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: mockUserId, email: 'notfound@example.com' },
      expires: 'never',
    });
    // Simulate Prisma's P2025 error for "Record to delete not found"
    mockTransaction.mockImplementationOnce(async (callback) => {
        const txMock = {
            auditLog: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, // Assume audit logs might not exist or user has none
            user: { delete: jest.fn().mockRejectedValue({ code: 'P2025' }) }, // Simulate user.delete failing
        };
        return await callback(txMock).catch(err => { throw err; }); // Propagate the error
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
