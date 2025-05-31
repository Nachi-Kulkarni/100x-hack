import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]'; // Adjust path
import { PrismaClient } from '@prisma/client';
import { GdprActionDetailsSchema, IApiErrorResponse } from '../../../lib/schemas'; // Adjust path, import IApiErrorResponse
import { createAuditLog } from '../../../lib/auditLog'; // Adjust path
import { z } from 'zod';
import { rateLimiter, runMiddleware } from '../../../lib/rateLimit'; // Import rate limiting
import { sendErrorResponse, sendSuccessResponse } from '../../../lib/apiUtils'; // Import response helpers

const prisma = new PrismaClient();

const gdprDeleteRateLimiter = rateLimiter({
  windowSeconds: 10 * 60, // 10 minutes
  maxRequests: 2,
  keyPrefix: 'gdpr_delete',
});

type SuccessResponse = { message: string; userId: string };
// type ErrorResponse = { message: string; details?: any }; // Replaced by IApiErrorResponse

async function gdprDeleteHandler( // Renamed original handler
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | IApiErrorResponse> // Use IApiErrorResponse
) {
  // Method check handled by default export

  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user || !session.user.id) {
    return res.status(401).json({ message: 'Unauthorized: Not logged in or user ID missing.' });
  }

  const userId = session.user.id;

  try {
    // Log the deletion request attempt BEFORE performing deletion
    const auditDetails: z.infer<typeof GdprActionDetailsSchema> = {
      targetUserId: userId,
      actionType: "USER_DATA_DELETION_REQUEST",
      // requesterIpAddress: req.socket?.remoteAddress || req.headers['x-forwarded-for'] as string, // Basic IP capture
    };
    const parsedAuditDetails = GdprActionDetailsSchema.safeParse(auditDetails);

    await createAuditLog({ // Await this to ensure it's logged before deletion
        userId: userId, // The user performing the action (themselves)
        action: "USER_DATA_DELETION_REQUEST",
        details: parsedAuditDetails.success ? parsedAuditDetails.data : auditDetails,
        entity: "User",
        entityId: userId,
    });
    if (!parsedAuditDetails.success) {
        console.warn("Failed to validate GDPR deletion audit details:", parsedAuditDetails.error);
    }

    // Perform deletion within a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Anonymize/Nullify references in AuditLog
      await tx.auditLog.updateMany({
        where: { userId: userId },
        data: { userId: null }, // Set userId to null
      });

      // Consider other tables:
      // If User had direct relations to Candidate (e.g., as creator/owner)
      // await tx.candidate.updateMany({
      //   where: { createdByUserId: userId }, // Example field
      //   data: { createdByUserId: null }, // Or to a generic "deleted_user_id"
      // });
      // If User had relations to Account or Session (NextAuth specific, handled by cascade usually)
      // By default, Prisma adapter for NextAuth sets up cascade deletes for Account and Session
      // when a User is deleted. So, explicit deletion/anonymization for these might not be needed
      // if the User record itself is deleted.

      // 2. Delete the user's record from the User table
      // This will also cascade delete related Accounts and Sessions due to schema relations
      await tx.user.delete({
        where: { id: userId },
      });
    });

    sendSuccessResponse(res, 200, { message: 'User data deletion process initiated successfully.', userId });

  } catch (error: any) {
    console.error(`Error during data deletion for user ${userId}:`, error);
    if (error.code === 'P2025') { // Prisma error code for "Record to delete not found."
        return sendErrorResponse(res, 404, 'User not found or already deleted.');
    }
    sendErrorResponse(res, 500, 'An error occurred while processing your data deletion request.', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuccessResponse | IApiErrorResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return sendErrorResponse(res, 405, `Method ${req.method} Not Allowed`);
  }

  try {
    await runMiddleware(req, res, gdprDeleteRateLimiter);
  } catch (error: any) {
    if (error.message.includes("Too Many Requests")) {
      console.warn(`Rate limit exceeded for GDPR delete from IP: ${req.ip || req.headers['x-forwarded-for']}`);
    } else {
      console.error("Error in GDPR delete rate limiting middleware:", error);
    }
    return;
  }

  return gdprDeleteHandler(req, res);
}
