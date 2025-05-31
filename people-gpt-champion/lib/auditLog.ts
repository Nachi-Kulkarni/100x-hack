import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Define a more specific type for what we expect for audit log creation
// This helps ensure that callers provide the correct data structure.
export interface AuditLogData {
  userId?: string | null; // Optional: Not all actions might have a user (e.g., system actions)
  action: string; // e.g., "USER_LOGIN", "CANDIDATE_SEARCH"
  entity?: string | null; // e.g., "Candidate", "Query", "User"
  entityId?: string | null; // The ID of the entity involved
  details?: Prisma.InputJsonValue | null; // Flexible JSON details
}

/**
 * Creates an audit log entry in the database.
 *
 * @param data The data for the audit log entry.
 *             Includes userId (optional), action (required),
 *             entity (optional), entityId (optional), and details (optional).
 */
export async function createAuditLog(data: AuditLogData): Promise<void> {
  try {
    // Ensure userId is explicitly null if undefined, as Prisma expects null for optional relations not set
    const auditDataForPrisma = {
      ...data,
      userId: data.userId === undefined ? null : data.userId,
      entity: data.entity === undefined ? null : data.entity,
      entityId: data.entityId === undefined ? null : data.entityId,
      details: data.details === undefined ? null : data.details,
    };

    await prisma.auditLog.create({
      data: auditDataForPrisma,
    });
    // console.log('Audit log created:', auditDataForPrisma.action); // Optional: for debugging
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Depending on the application's needs, you might want to:
    // - Throw the error to be handled by the caller
    // - Send to an external error tracking service
    // - Silently fail if audit logging is non-critical (as done here by just logging)
  }
}
