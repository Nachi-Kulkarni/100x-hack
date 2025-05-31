// people-gpt-champion/pages/api/outreach-history.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { OutreachHistoryQuerySchema, OutreachHistoryResponseSchema } from '../../lib/schemas'; // Zod schemas

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
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  // Validate query parameters
  const queryValidation = OutreachHistoryQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return res.status(400).json({ success: false, error: "Invalid query parameters", details: queryValidation.error.flatten() });
  }

  const { page, pageSize } = queryValidation.data;
  const skip = (page - 1) * pageSize;

  try {
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

    return res.status(200).json(responseData);
  } catch (error: any) {
    console.error('Error fetching outreach history:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch outreach history.', details: error.message });
  } finally {
    await prisma.$disconnect().catch(async (e) => {
      console.error("Failed to disconnect Prisma client", e);
    });
  }
}
