// people-gpt-champion/pages/api/resend-webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { ResendWebhookEventSchema } from '../../lib/schemas';
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
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  // --- IMPORTANT: Webhook Signature Verification (Placeholder) ---
  // In production, you MUST verify the webhook signature from Resend.
  // This is a simplified placeholder and does not offer real security.
  // Example using Node.js crypto (requires `npm install @types/node` if not already, and proper setup):
  // const signature = req.headers['resend-signature']; // Or the header Resend uses
  // if (!signature) {
  //   return res.status(401).json({ success: false, error: 'Signature missing.' });
  // }
  // try {
  //   const shasum = crypto.createHmac('sha256', RESEND_WEBHOOK_SECRET);
  //   shasum.update(JSON.stringify(req.body)); // Or raw body if needed
  //   const digest = shasum.digest('hex');
  //   if (digest !== signature) {
  //     return res.status(401).json({ success: false, error: 'Invalid signature.' });
  //   }
  // } catch (error) {
  //   console.error('Error during signature verification:', error);
  //   return res.status(400).json({ success: false, error: 'Error verifying signature.' });
  // }
  // For now, we'll skip actual verification for sandbox environment.
  console.warn("Resend webhook signature verification is currently skipped. DO NOT use in production without implementing it.");

  // Validate request body against Zod schema
  const validationResult = ResendWebhookEventSchema.safeParse(req.body);
  if (!validationResult.success) {
    console.error('Invalid Resend webhook payload:', validationResult.error.flatten());
    return res.status(400).json({ success: false, errors: validationResult.error.flatten() });
  }

  const { type, data } = validationResult.data;
  const resendMessageId = data.email_id;
  const eventTimestamp = new Date(data.created_at);

  try {
    const updateData: { status: string; openedAt?: Date; clickedAt?: Date } = {
      status: type, // Default to setting status to the event type, e.g., "email.delivered"
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
        updateData.status = 'clicked'; // Could also be 'opened' if not already set
        updateData.clickedAt = eventTimestamp;
        // If an email is clicked, it implies it was also opened.
        // You might want to set openedAt if it's not already set.
        // This logic can be refined based on desired behavior.
        const currentOutreachForClick = await prisma.emailOutreach.findUnique({
          where: { resendMessageId },
          select: { openedAt: true }
        });
        if (currentOutreachForClick && !currentOutreachForClick.openedAt) {
            updateData.openedAt = eventTimestamp;
        }
        break;
      case 'email.bounced':
        updateData.status = 'bounced';
        break;
      case 'email.complained':
        updateData.status = 'complained';
        break;
      // 'email.sent' is usually the initial state, handled by the send-email API.
      // No specific update needed here unless there's a delay and Resend confirms 'sent' later.
      case 'email.sent':
         // Potentially update if not already 'sent' or to confirm.
         // For now, we assume 'sent' is set by the originating API.
        return res.status(200).json({ success: true, message: `Webhook for event '${type}' received, no specific action taken.` });
      default:
        console.log(`Received unhandled Resend webhook event type: ${type}`);
        return res.status(200).json({ success: true, message: `Webhook event type '${type}' received but not explicitly handled.` });
    }

    const updatedOutreach = await prisma.emailOutreach.update({
      where: { resendMessageId: resendMessageId },
      data: updateData,
    });

    if (!updatedOutreach) {
      // This case should be rare if resendMessageId is always valid from webhooks
      return res.status(404).json({ success: false, error: `EmailOutreach record not found for Resend Message ID: ${resendMessageId}` });
    }

    return res.status(200).json({ success: true, message: `Webhook processed for event '${type}'.` });

  } catch (error: any) {
    console.error(`Error processing Resend webhook for event '${type}', Resend ID '${resendMessageId}':`, error);
    if (error.code === 'P2025') { // Prisma: Record to update not found
      return res.status(404).json({ success: false, error: `EmailOutreach record not found when attempting to update for Resend Message ID: ${resendMessageId}` });
    }
    const errorMessage = error.message || 'An unexpected error occurred.';
    return res.status(500).json({ success: false, error: `Failed to process webhook: ${errorMessage}` });
  } finally {
    await prisma.$disconnect().catch(async (e) => {
      console.error("Failed to disconnect Prisma client", e);
    });
  }
}
