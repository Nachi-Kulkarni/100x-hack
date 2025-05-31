// people-gpt-champion/pages/api/outreach-history.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Role } from '@prisma/client'; // Import Role
import {
    OutreachHistoryQuerySchema,
    OutreachHistoryResponseSchema,
    IOutreachHistoryResponse, // Import type for response
    IApiErrorResponse         // Import type for error response
} from '../../lib/schemas';
import { handleZodError, sendErrorResponse, sendSuccessResponse } from '../../lib/apiUtils';
import { withRoleProtection } from '../../lib/authUtils';
import { ZodError } from 'zod';

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/outreach-history:
 *   get:
 *     summary: Retrieves email outreach history with pagination.
 *     description: Fetches a paginated list of email outreach attempts, including details about the template used.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page.
 *     responses:
 *       '200':
 *         description: A paginated list of email outreach records.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OutreachHistoryResponse'
 *               # This should align with OutreachHistoryResponseSchema
 *       '400':
 *         description: Bad Request - Invalid query parameters.
 *       '500':
 *         description: Internal Server Error.
 * components: # For Swagger documentation purposes
 *   schemas:
 *     EmailOutreachHistoryItem: # Defined in lib/schemas.ts via Zod
 *       type: object
 *       properties:
 *         id: { type: "string", format: "cuid" }
 *         recipientEmail: { type: "string", format: "email" }
 *         sentAt: { type: "string", format: "date-time" }
 *         resendMessageId: { type: "string" }
 *         status: { type: "string" }
 *         openedAt: { type: "string", format: "date-time", nullable: true }
 *         clickedAt: { type: "string", format: "date-time", nullable: true }
 *         templateVersion:
 *           type: object
 *           properties:
 *             id: { type: "string", format: "cuid" }
 *             versionNumber: { type: "integer" }
 *             subject: { type: "string" }
 *             template:
 *               type: object
 *               properties:
 *                 id: { type: "string", format: "cuid" }
 *                 name: { type: "string" }
 *     OutreachHistoryResponse: # Defined in lib/schemas.ts via Zod
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/EmailOutreachHistoryItem'
 *         total: { type: "integer" }
 *         page: { type: "integer" }
 *         pageSize: { type: "integer" }
 *         totalPages: { type: "integer" }
 */
async function outreachHistoryHandler(
  req: NextApiRequest,
  res: NextApiResponse<IOutreachHistoryResponse | IApiErrorResponse>
) {
  // Method and role checks handled by withRoleProtection wrapper

  try {
    // Validate query parameters
    const queryValidation = OutreachHistoryQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      throw queryValidation.error; // Caught by ZodError handler
    }
    const { page, pageSize } = queryValidation.data;
    const skip = (page - 1) * pageSize;

    const [outreaches, total] = await prisma.$transaction([
      prisma.emailOutreach.findMany({
        skip: skip,
        take: pageSize,
        orderBy: {
          sentAt: 'desc', // Most recent first
        },
        include: {
          templateVersion: {
            select: {
              id: true,
              versionNumber: true,
              subject: true, // Include subject for display
              template: { // Include parent template for its name
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.emailOutreach.count(), // Get total count for pagination
    ]);

    const totalPages = Math.ceil(total / pageSize);

    const responseData = {
      data: outreaches,
      total,
      page,
      pageSize,
      totalPages,
    };

    // Optional: Validate response data with Zod schema before sending
    // const responseValidation = OutreachHistoryResponseSchema.safeParse(responseData);
    // if (!responseValidation.success) {
    //   console.error("Data validation error for /api/outreach-history response:", responseValidation.error.flatten());
    //   // Handle error, maybe return 500 or log extensively
    // }

    // Validate final response data before sending
    const finalResponseValidation = OutreachHistoryResponseSchema.safeParse(responseData);
    if (!finalResponseValidation.success) {
        console.error("Data validation error for /api/outreach-history response:", finalResponseValidation.error.flatten());
        return sendErrorResponse(res, 500, "Failed to prepare outreach history: internal data validation error.", finalResponseValidation.error.flatten());
    }

    return sendSuccessResponse(res, 200, finalResponseValidation.data);
  } catch (error: any) {
    if (error instanceof ZodError) {
      return handleZodError(error, res);
    }
    console.error('Error fetching outreach history:', error);
    return sendErrorResponse(res, 500, 'Failed to fetch outreach history.', error.message);
  } finally {
    await prisma.$disconnect().catch(async (e) => {
      console.error("Failed to disconnect Prisma client", e);
    });
  }
}

export default withRoleProtection(outreachHistoryHandler, [Role.ADMIN, Role.RECRUITER]);
