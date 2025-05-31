import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]'; // Adjust path to your NextAuth options
import { PrismaClient } from '@prisma/client'; // Removed unused AuditLog, User
import { UserDataExportSchema, GdprActionDetailsSchema, IApiErrorResponse } from '../../../lib/schemas'; // Adjust path
import { createAuditLog } from '../../../lib/auditLog'; // Adjust path
import { z } from 'zod';
import { rateLimiter, runMiddleware } from '../../../lib/rateLimit'; // Import rate limiting
import { sendErrorResponse, sendSuccessResponse } from '../../../lib/apiUtils'; // Import response helpers


const prisma = new PrismaClient();

const gdprExportRateLimiter = rateLimiter({
  windowSeconds: 5 * 60, // 5 minutes
  maxRequests: 3,
  keyPrefix: 'gdpr_export',
});

type ExportData = z.infer<typeof UserDataExportSchema>;
// type ErrorResponse = { message: string; details?: any }; // Replaced by IApiErrorResponse

async function gdprExportHandler( // Renamed original handler
  req: NextApiRequest,
  res: NextApiResponse<ExportData | IApiErrorResponse> // Use IApiErrorResponse
) {
  // Method check is now handled by the default export

  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user || !session.user.id) {
    return res.status(401).json({ message: 'Unauthorized: Not logged in or user ID missing.' });
  }

  const userId = session.user.id;

  try {
    // Log the export request attempt
    const auditDetails: z.infer<typeof GdprActionDetailsSchema> = {
      targetUserId: userId,
      actionType: "USER_DATA_EXPORT_REQUEST",
      // requesterIpAddress: req.socket?.remoteAddress || req.headers['x-forwarded-for'] as string, // Basic IP capture
    };
    const parsedAuditDetails = GdprActionDetailsSchema.safeParse(auditDetails);
    if (parsedAuditDetails.success) {
        await createAuditLog({
            userId: userId, // The user performing the action
            action: "USER_DATA_EXPORT_REQUEST",
            details: parsedAuditDetails.data,
            entity: "User",
            entityId: userId,
        });
    } else {
        console.warn("Failed to validate GDPR export audit details:", parsedAuditDetails.error);
        // Log with raw details or handle more gracefully
        await createAuditLog({
            userId: userId,
            action: "USER_DATA_EXPORT_REQUEST",
            details: auditDetails, // Log raw if parse fails
            entity: "User",
            entityId: userId,
        });
    }


    // Retrieve user data
    const userData = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!userData) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Retrieve audit logs for the user
    const auditLogs = await prisma.auditLog.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' }, // Optional: order them
    });

    // Prepare the data for export
    const exportData: ExportData = {
      userData: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role, // Role enum will be stringified
        image: userData.image,
        emailVerified: userData.emailVerified?.toISOString() || null,
      },
      auditLogs: auditLogs.map(log => ({
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        action: log.action,
        details: log.details, // Assuming details is already Prisma.JsonValue
        entity: log.entity,
        entityId: log.entityId,
      })),
    };

    // Validate the final export data structure (optional but good practice)
    const validationResult = UserDataExportSchema.safeParse(exportData);
    if (!validationResult.success) {
        console.error("UserDataExportSchema validation failed:", validationResult.error);
        // Decide how to handle: return error, or return data anyway if validation is for strictness
        return res.status(500).json({ message: "Error formatting user data for export.", details: validationResult.error.issues });
    }

    res.setHeader('Content-Disposition', `attachment; filename="user_data_export_${userId}.json"`);
    // Using sendSuccessResponse for consistency, though setHeader needs to be handled carefully
    res.setHeader('Content-Disposition', `attachment; filename="user_data_export_${userId}.json"`);
    sendSuccessResponse(res, 200, validationResult.data);

  } catch (error: any) { // Added type any for error
    console.error('Error during data export:', error);
    sendErrorResponse(res, 500, 'An error occurred while processing your data export request.', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ExportData | IApiErrorResponse>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return sendErrorResponse(res, 405, `Method ${req.method} Not Allowed`);
  }

  try {
    await runMiddleware(req, res, gdprExportRateLimiter);
  } catch (error: any) {
    // Rate limiter already sent response or it's an internal error in middleware
    if (error.message.includes("Too Many Requests")) {
      console.warn(`Rate limit exceeded for GDPR export from IP: ${req.ip || req.headers['x-forwarded-for']}`);
    } else {
      console.error("Error in GDPR export rate limiting middleware:", error);
    }
    return;
  }

  return gdprExportHandler(req, res);
}
