import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]'; // Path to your NextAuth options
import { Role } from '@prisma/client'; // Import Role enum
import { createAuditLog } from '../../lib/auditLog'; // Adjust path as necessary
import { AdminAccessActionDetailsSchema } from '../../lib/schemas'; // Adjust path
import { z } from 'zod';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user) {
    return res.status(401).json({ message: 'Unauthorized: Not logged in' });
  }

  // Type assertion for session.user to include 'role'
  // This relies on the session callback being correctly configured
  const userRole = (session.user as { role?: Role; id?: string }).role; // Add id for logging
  const userId = (session.user as { id?: string }).id;

  if (userRole === Role.ADMIN) {
    if (userId) {
      const auditDetails: z.infer<typeof AdminAccessActionDetailsSchema> = {
        route: req.url || "/api/admin-only", // req.url might be undefined
        method: req.method as any, // req.method is string | undefined
      };
      // Validate details
      const parsedAuditDetails = AdminAccessActionDetailsSchema.safeParse(auditDetails);
      if(parsedAuditDetails.success){
        await createAuditLog({
          userId: userId,
          action: "ADMIN_ACCESS",
          details: parsedAuditDetails.data,
        });
      } else {
        console.warn("Failed to validate admin access audit details:", parsedAuditDetails.error);
        await createAuditLog({ // Log with raw details or handle error
          userId: userId,
          action: "ADMIN_ACCESS",
          details: auditDetails,
        });
      }
    }
    res.status(200).json({ message: 'Success: You have admin access!', user: session.user });
  } else {
    // Optionally log denied access attempts, though this could be noisy
    // if (userId) {
    //   await createAuditLog({
    //     userId: userId,
    //     action: "ADMIN_ACCESS_DENIED",
    //     details: { route: req.url || "/api/admin-only", attemptedRole: userRole || "No role found" },
    //   });
    // }
    res.status(403).json({ message: 'Forbidden: You do not have admin privileges.', userRole: userRole || "No role found" });
  }
}
