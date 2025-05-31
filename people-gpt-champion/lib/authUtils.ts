import { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../pages/api/auth/[...nextauth]'; // Adjust path as needed
import { Role } from '@prisma/client'; // Assuming Role enum is exported from prisma

// Define a type for the user object in the session, including the role
interface UserWithRole {
  role?: Role;
  [key: string]: any; // Allow other properties
}

// Define a type for the session object that includes the extended user type
interface SessionWithRole {
  user?: UserWithRole;
  [key: string]: any; // Allow other properties
}

/**
 * A conceptual higher-order function to protect API routes based on user roles.
 *
 * Usage:
 * export default withRoleProtection(handler, Role.ADMIN);
 * export default withRoleProtection(handler, [Role.ADMIN, Role.RECRUITER]);
 *
 * @param handler The NextApiHandler to protect.
 * @param requiredRole The role or array of roles required to access the handler.
 */
export function withRoleProtection(
  handler: NextApiHandler,
  requiredRole: Role | Role[]
): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const session: SessionWithRole | null = await getServerSession(req, res, authOptions);

    if (!session || !session.user) {
      return res.status(401).json({ message: 'Unauthorized: Not logged in' });
    }

    const userRole = session.user.role;
    if (!userRole) {
      return res.status(403).json({ message: 'Forbidden: User role not found' });
    }

    const hasRequiredRole = Array.isArray(requiredRole)
      ? requiredRole.includes(userRole)
      : userRole === requiredRole;

    if (!hasRequiredRole) {
      return res.status(403).json({
        message: `Forbidden: User does not have the required role(s). Required: ${
          Array.isArray(requiredRole) ? requiredRole.join(' or ') : requiredRole
        }. User has: ${userRole}`,
      });
    }

    return handler(req, res);
  };
}

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation'; // Using next/navigation for App Router

/**
 * Custom hook to check if the current user has the required role(s).
 * Optionally redirects if the role is not met.
 *
 * @param requiredRole The role or array of roles required.
 * @param options Optional configuration for redirection.
 */
export function useRequireRole(
  requiredRole: Role | Role[],
  options?: { redirect?: boolean; redirectTo?: string }
) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isLoading = status === 'loading';

  if (isLoading) {
    return { hasRequiredRole: false, isLoading: true, session };
  }

  if (!session || !session.user) {
    if (options?.redirect && !isLoading) {
      router.push(options.redirectTo || '/api/auth/signin'); // Default to signin page
    }
    return { hasRequiredRole: false, isLoading: false, session };
  }

  const userRole = (session.user as any)?.role; // Access role, ensuring type compatibility

  if (!userRole) {
    // Role not present on session user, treat as not having the role
    if (options?.redirect && !isLoading) {
      router.push(options.redirectTo || '/unauthorized'); // Or a specific "role missing" page
    }
    return { hasRequiredRole: false, isLoading: false, session };
  }

  const hasRequiredRole = Array.isArray(requiredRole)
    ? requiredRole.includes(userRole)
    : userRole === requiredRole;

  if (!hasRequiredRole && options?.redirect && !isLoading) {
    router.push(options.redirectTo || '/unauthorized'); // Or a specific "forbidden" page
  }

  return { hasRequiredRole, isLoading: false, session };
}
