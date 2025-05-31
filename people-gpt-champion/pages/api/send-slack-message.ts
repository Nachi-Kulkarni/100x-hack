// people-gpt-champion/pages/api/send-slack-message.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Role } from '@prisma/client'; // Import Role
import {
    SendSlackMessageRequestBodySchema,
    SendSlackMessageSuccessResponseSchema, // For typing success response
    IApiErrorResponse,                     // For typing error response
    OutreachSentDetailsSchema             // For audit log details
} from '../../lib/schemas';
import { sendSlackMessage } from '../../lib/slack';
import { withRoleProtection } from '../../lib/authUtils';
import { handleZodError, sendErrorResponse, sendSuccessResponse } from '../../lib/apiUtils';
import { createAuditLog } from '../../lib/auditLog'; // Import createAuditLog
import { getServerSession } from 'next-auth/next';   // For getting userId
import { authOptions } from '../auth/[...nextauth]'; // For getting userId
import { ZodError } from 'zod';
import { z } from 'zod'; // For inferring type for audit log details
import { rateLimiter, runMiddleware } from '../../lib/rateLimit'; // Import rate limiting

/**
 * @swagger
 * /api/send-slack-message:
 *   post:
 *     summary: Sends a direct message to a Slack user.
 *     description: |
 *       Accepts a Slack User ID, a message, and an optional candidate ID.
 *       Sends a DM via Slack. The candidate ID is for future logging/tracking purposes
 *       as this API currently does not persist Slack messages to the database.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendSlackMessageRequestBody'
 *             # Properties: userId (string), message (string), candidateId (string, cuid, optional)
 *     responses:
 *       '200':
 *         description: Slack message sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SendSlackMessageSuccessResponse'
 *               # Placeholder - ensure this is defined in your OpenAPI/Swagger spec
 *       '400':
 *         description: Bad Request - Invalid input data.
 *       '500':
 *         description: Internal Server Error - Failed to send Slack message.
 * components: # Added for placeholder purposes for Swagger UI
 *  schemas:
 *    SendSlackMessageRequestBody:
 *      type: object
 *      required:
 *        - userId
 *        - message
 *      properties:
 *        userId:
 *          type: string
 *          description: The Slack User ID (e.g., U012AB3CDE).
 *        message:
 *          type: string
 *          description: The content of the message to send.
 *        candidateId:
 *          type: string
 *          format: cuid
 *          description: Optional ID of the candidate this Slack message is related to.
 *    SendSlackMessageSuccessResponse:
 *      type: object
 *      properties:
 *        success:
 *          type: boolean
 *          example: true
 *        messageId:
 *          type: string
 *          description: The Slack message timestamp (ts).
 *          example: "1605896877.000800"
 */
async function sendSlackMessageHandler(
  req: NextApiRequest,
  res: NextApiResponse // Typed as <SendSlackMessageSuccessResponseSchema (inferred) | IApiErrorResponse>
) {
  // Method and role checks handled by wrappers

  try {
    const session = await getServerSession(req, res, authOptions); // Get session for audit logging
    const currentUserId = session?.user?.id;

    // Validate request body
    const validationResult = SendSlackMessageRequestBodySchema.safeParse(req.body);
    if (!validationResult.success) {
      throw validationResult.error; // Caught by ZodError handler
    }
    const { userId: recipientSlackId, message, candidateId } = validationResult.data;

    if (candidateId) {
      console.log(`Slack message initiated. Associated with candidateId: ${candidateId}`);
      // Note: No database persistence for Slack messages in this current implementation.
    }

    const messageTimestamp = await sendSlackMessage(recipientSlackId, message);

    // Audit log the successful Slack message send
    if (currentUserId) {
      const auditDetails: z.infer<typeof OutreachSentDetailsSchema> = {
        channel: "slack",
        recipient: recipientSlackId, // Slack User ID
        candidateId: candidateId || null,
        messageId: messageTimestamp,
      };
      const parsedAuditDetails = OutreachSentDetailsSchema.safeParse(auditDetails);
      if (parsedAuditDetails.success) {
        await createAuditLog({
          userId: currentUserId,
          action: "OUTREACH_SENT",
          entity: "SlackMessage",
          entityId: messageTimestamp, // Using Slack message_ts as entityId
          details: parsedAuditDetails.data,
        });
      } else {
        console.warn("Failed to validate OUTREACH_SENT (slack) audit details:", parsedAuditDetails.error);
      }
    }

    return sendSuccessResponse(res, 200, { success: true, messageId: messageTimestamp });

  } catch (error: any) {
    if (error instanceof ZodError) {
      return handleZodError(error, res);
    }
    console.error(`Error in /api/send-slack-message for user ${req.body?.userId}:`, error);
    const errorMessage = error.message || 'An unexpected error occurred while sending the Slack message.';
    if (errorMessage.includes('SLACK_BOT_TOKEN') || errorMessage.includes('SLACK_SIGNING_SECRET')) {
      return sendErrorResponse(res, 500, `Server configuration error: ${errorMessage}`);
    }
    return sendErrorResponse(res, 500, `Failed to send Slack message: ${errorMessage}`);
  }
}


const sendSlackMessageRateLimiter = rateLimiter({
  windowSeconds: 5 * 60, // 5 minutes
  maxRequests: 10,
  keyPrefix: 'send_slack_message',
});

const protectedSendSlackMessageHandler = withRoleProtection(sendSlackMessageHandler, [Role.ADMIN, Role.RECRUITER]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return sendErrorResponse(res, 405, `Method ${req.method} Not Allowed`);
  }

  try {
    await runMiddleware(req, res, sendSlackMessageRateLimiter);
  } catch (error: any) {
    if (error.message.includes("Too Many Requests")) {
      console.warn(`Rate limit exceeded for send-slack-message from IP: ${req.ip || req.headers['x-forwarded-for']}`);
    } else {
      console.error("Error in send-slack-message rate limiting middleware:", error);
    }
    return;
  }

  return protectedSendSlackMessageHandler(req, res);
}
