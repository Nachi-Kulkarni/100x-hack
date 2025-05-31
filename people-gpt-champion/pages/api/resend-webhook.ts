// people-gpt-champion/pages/api/resend-webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { ResendWebhookEventSchema, IApiErrorResponse } from '../../lib/schemas'; // Added IApiErrorResponse
import { handleZodError, sendErrorResponse, sendSuccessResponse } from '../../lib/apiUtils'; // Standard helpers
import { ZodError } from 'zod';
// import crypto from 'crypto'; // For actual signature verification

const prisma = new PrismaClient();

// TODO: Store this in an environment variable for production
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || 'your-webhook-secret-placeholder';

/**
 * @swagger
 * /api/resend-webhook:
 *   post:
 *     summary: Handles incoming webhooks from Resend.
 *     description: |
 *       Receives event notifications from Resend (e.g., email delivered, opened, clicked),
 *       verifies the webhook signature (placeholder), and updates the status
 *       of the corresponding EmailOutreach record in the database.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResendWebhookEvent' # Placeholder
 *     responses:
 *       '200':
 *         description: Webhook received and processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Webhook processed."
 *       '400':
 *         description: Bad Request - Invalid payload or signature verification failed.
 *       '401':
 *         description: Unauthorized - Signature verification failed.
 *       '404':
 *         description: Not Found - Corresponding EmailOutreach record not found.
 *       '500':
 *         description: Internal Server Error.
 * components: # For Swagger documentation purposes
 *   schemas:
 *     ResendWebhookEvent: # This should align with ResendWebhookEventSchema in lib/schemas.ts
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: ['email.sent', 'email.delivered', 'email.opened', 'email.clicked', 'email.bounced', 'email.complained']
 *         data:
 *           type: object
 *           properties:
 *             email_id:
 *               type: string
 *               description: The Resend message ID.
 *             created_at:
 *               type: string
 *               format: date-time
 *               description: Timestamp of the event.
 *           # Other properties may exist in data depending on the event type
 */
// Define a simple success response type for webhooks
type WebhookSuccessResponse = { success: boolean; message: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WebhookSuccessResponse | IApiErrorResponse>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return sendErrorResponse(res, 405, `Method ${req.method} Not Allowed`);
  }

  // --- IMPORTANT: Webhook Signature Verification (Placeholder) ---
  // Skipping actual verification for this exercise.
  console.warn("Resend webhook signature verification is currently skipped. DO NOT use in production without implementing it.");
  // if (!verifySignature(req)) { // Replace with actual verification logic
  //   return sendErrorResponse(res, 401, 'Invalid webhook signature.');
  // }

  try {
    // Validate request body against Zod schema
    const validationResult = ResendWebhookEventSchema.safeParse(req.body);
    if (!validationResult.success) {
      // Use handleZodError for consistent Zod error responses
      return handleZodError(validationResult.error, res);
    }

    const { type, data } = validationResult.data;
    const resendMessageId = data.email_id;
    const eventTimestamp = new Date(data.created_at);

    const updateData: { status: string; openedAt?: Date; clickedAt?: Date } = {
      status: type, // Default to setting status to the event type
    };

    switch (type) {
      case 'email.delivered':
        updateData.status = 'delivered';
        break;
      case 'email.opened':
        updateData.status = 'opened';
        updateData.openedAt = eventTimestamp;
        break;
      case 'email.clicked':
        updateData.status = 'clicked';
        updateData.clickedAt = eventTimestamp;
        const currentOutreachForClick = await prisma.emailOutreach.findUnique({
          where: { resendMessageId },
          select: { openedAt: true }
        });
        if (currentOutreachForClick && !currentOutreachForClick.openedAt) {
            updateData.openedAt = eventTimestamp; // Also mark as opened if clicked
        }
        break;
      case 'email.bounced':
        updateData.status = 'bounced';
        break;
      case 'email.complained':
        updateData.status = 'complained';
        break;
      case 'email.sent':
        // Usually 'sent' is the initial state. No specific update needed here unless logic changes.
        return sendSuccessResponse(res, 200, { success: true, message: `Webhook for event '${type}' received, no specific action taken.` });
      default:
        console.log(`Received unhandled Resend webhook event type: ${type}`);
        return sendSuccessResponse(res, 200, { success: true, message: `Webhook event type '${type}' received but not explicitly handled.` });
    }

    const updatedOutreach = await prisma.emailOutreach.update({
      where: { resendMessageId: resendMessageId },
      data: updateData,
    });

    // No need to check !updatedOutreach if using Prisma, as update throws P2025 if record not found.
    return sendSuccessResponse(res, 200, { success: true, message: `Webhook processed for event '${type}'.` });

  } catch (error: any) {
    if (error instanceof ZodError) { // Should be caught by safeParse, but as a safeguard
        return handleZodError(error, res);
    }
    console.error(`Error processing Resend webhook for event '${req.body?.type}', Resend ID '${req.body?.data?.email_id}':`, error);
    if (error.code === 'P2025') { // Prisma: Record to update not found
      return sendErrorResponse(res, 404, `EmailOutreach record not found for Resend Message ID: ${req.body?.data?.email_id}`);
    }
    return sendErrorResponse(res, 500, 'Failed to process webhook.', error.message);
  } finally {
    await prisma.$disconnect().catch(async (e) => {
      console.error("Failed to disconnect Prisma client", e);
    });
  }
}
