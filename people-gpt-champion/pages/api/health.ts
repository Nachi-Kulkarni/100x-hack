import type { NextApiRequest, NextApiResponse } from 'next';
import { HealthQuerySchema, HealthResponseSchema, IHealthResponse } from '../../lib/schemas'; // Adjust path
import { handleZodError, sendErrorResponse, sendSuccessResponse } from '../../lib/apiUtils'; // Adjust path
import { ZodError } from 'zod';

// Example of a more detailed check function (can be expanded)
async function performDatabaseCheck(): Promise<{ status: string; message?: string; durationMs?: number }> {
  const startTime = Date.now();
  // In a real app, you'd import your prisma client and perform a simple query
  // For example: await prisma.$queryRaw`SELECT 1`;
  // Simulating a check here:
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({ status: 'ok', durationMs: Date.now() - startTime });
    }, 50);
  });
}

export default async function handler( // Changed to async
  req: NextApiRequest,
  res: NextApiResponse<IHealthResponse | { message: string; errors?: any }> // Using IApiErrorResponse for errors
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    // Using sendErrorResponse for consistency
    return sendErrorResponse(res, 405, `Method ${req.method} Not Allowed`);
  }

  try {
    const parsedQuery = HealthQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      // ZodError will be caught by the catch block and handled by handleZodError
      throw parsedQuery.error;
    }

    const { quick } = parsedQuery.data;
    const checks: IHealthResponse['checks'] = {};
    let overallStatus: IHealthResponse['status'] = 'ok';

    if (!quick) {
      // Perform more detailed checks if 'quick' is not true
      const dbCheck = await performDatabaseCheck();
      checks['database'] = dbCheck;
      if (dbCheck.status !== 'ok') overallStatus = 'degraded';
      // Add more checks here (e.g., Redis, external services)
    }

    const responsePayload: IHealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: Object.keys(checks).length > 0 ? checks : undefined, // Only include checks if performed
    };

    // Validate final response payload before sending (optional, but good for ensuring consistency)
    const finalValidation = HealthResponseSchema.safeParse(responsePayload);
    if (!finalValidation.success) {
        console.error("Health API response validation failed:", finalValidation.error.flatten());
        // This indicates an issue with how the responsePayload was constructed internally.
        throw new Error("Internal server error: Failed to construct valid health response.");
    }

    return sendSuccessResponse(res, 200, finalValidation.data);

  } catch (error: any) {
    if (error instanceof ZodError) {
      return handleZodError(error, res);
    }
    console.error("Error in health check API:", error);
    // Using sendErrorResponse for other unexpected errors
    return sendErrorResponse(res, 500, error.message || 'An unexpected error occurred during health check.');
  }
}
