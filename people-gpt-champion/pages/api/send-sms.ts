// people-gpt-champion/pages/api/send-sms.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Role } from '@prisma/client'; // Import Role
import {
    SendSmsRequestBodySchema,
    SendSmsSuccessResponseSchema, // For typing success response
    IApiErrorResponse,            // For typing error response
    OutreachSentDetailsSchema     // For audit log details
} from '../../lib/schemas';
import { sendSms } from '../../lib/twilio';
import { getFeatureFlag, createAnonymousUser } from '../../lib/launchdarkly';
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
 * /api/send-sms:
 *   post:
 *     summary: Sends an SMS message using Twilio, if feature flagged.
 *     description: |
 *       Accepts a recipient phone number (E.164 format), message body, and an optional candidate ID.
 *       The SMS sending functionality is controlled by the 'twilio-sms-outreach' feature flag.
 *       If the flag is disabled, the endpoint will return a 501 Not Implemented error.
 *       The candidate ID is for future logging/tracking; currently, SMS sends are not persisted to the database by this API.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendSmsRequestBody'
 *             # Properties: to (string, phone), body (string), candidateId (string, cuid, optional)
 *     responses:
 *       '200':
 *         description: SMS sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SendSmsSuccessResponse'
 *       '400':
 *         description: Bad Request - Invalid input data.
 *       '403':
 *         description: Forbidden - SMS functionality is disabled by feature flag (deprecated, use 501).
 *       '501':
 *         description: Not Implemented - SMS functionality is currently disabled via feature flag.
 *       '500':
 *         description: Internal Server Error - Failed to send SMS or configuration issue.
 * components:
 *   schemas:
 *     SendSmsRequestBody:
 *       type: object
 *       required:
 *         - to
 *         - body
 *       properties:
 *         to:
 *           type: string
 *           format: phone
 *           pattern: "^\+[1-9]\d{1,14}$" # E.164 format
 *           description: Recipient phone number in E.164 format.
 *         body:
 *           type: string
 *           description: The content of the SMS message.
 *         candidateId:
 *           type: string
 *           format: cuid
 *           description: Optional ID of the candidate this SMS is related to.
 *     SendSmsSuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         messageSid:
 *           type: string
 *           description: The Twilio Message SID.
 *           example: "SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 */
async function sendSmsHandler(
  req: NextApiRequest,
  res: NextApiResponse // Typed as <SendSmsSuccessResponseSchema (inferred) | IApiErrorResponse>
) {
  // Method and role checks handled by wrappers

  try {
    const session = await getServerSession(req, res, authOptions); // Get session for audit logging
    const currentUserId = session?.user?.id;

    // Feature Flag Check
    const ldUser = createAnonymousUser(); // User context for LD might need to be enhanced if roles affect flags
    const isTwilioSmsEnabled = await getFeatureFlag('twilio-sms-outreach', ldUser, false);

    if (!isTwilioSmsEnabled) {
      console.log("Attempt to use send-sms API while 'twilio-sms-outreach' flag is disabled.");
      return sendErrorResponse(res, 501, 'SMS functionality is currently disabled.');
    }

    // Validate request body
    const validationResult = SendSmsRequestBodySchema.safeParse(req.body);
    if (!validationResult.success) {
      throw validationResult.error; // Caught by ZodError handler
    }
    const { to, body, candidateId } = validationResult.data;

    if (candidateId) {
      console.log(`SMS message initiated. Associated with candidateId: ${candidateId}`);
      // Note: No database persistence for SMS messages in this current implementation.
    }

    const messageSid = await sendSms(to, body);

    // Audit log the successful SMS send
    if (currentUserId) {
      const auditDetails: z.infer<typeof OutreachSentDetailsSchema> = {
        channel: "sms",
        recipient: to, // Phone number
        candidateId: candidateId || null,
        messageId: messageSid,
      };
      const parsedAuditDetails = OutreachSentDetailsSchema.safeParse(auditDetails);
      if (parsedAuditDetails.success) {
        await createAuditLog({
          userId: currentUserId,
          action: "OUTREACH_SENT",
          entity: "SmsMessage",
          entityId: messageSid, // Using Twilio SID as entityId
          details: parsedAuditDetails.data,
        });
      } else {
        console.warn("Failed to validate OUTREACH_SENT (sms) audit details:", parsedAuditDetails.error);
      }
    }

    return sendSuccessResponse(res, 200, { success: true, messageSid: messageSid });

  } catch (error: any) {
    if (error instanceof ZodError) {
      return handleZodError(error, res);
    }
    // Handle LaunchDarkly error specifically if needed, or let it fall through
    if (error.message && error.message.includes('LaunchDarkly')) { // Basic check
        console.error('LaunchDarkly error in /api/send-sms:', error);
        return sendErrorResponse(res, 500, 'Error checking feature flag status.');
    }
    console.error(`Error in /api/send-sms for recipient ${req.body?.to}:`, error);
    const errorMessage = error.message || 'An unexpected error occurred while sending the SMS.';
    if (errorMessage.includes('environment variable is not set')) { // Twilio config error
      return sendErrorResponse(res, 500, `Server configuration error: ${errorMessage}`);
    }
    return sendErrorResponse(res, 500, `Failed to send SMS: ${errorMessage}`);
  }
}


const sendSmsRateLimiter = rateLimiter({
  windowSeconds: 10 * 60, // 10 minutes
  maxRequests: 5,
  keyPrefix: 'send_sms',
});

const protectedSendSmsHandler = withRoleProtection(sendSmsHandler, [Role.ADMIN, Role.RECRUITER]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return sendErrorResponse(res, 405, `Method ${req.method} Not Allowed`);
  }

  try {
    await runMiddleware(req, res, sendSmsRateLimiter);
  } catch (error: any) {
    if (error.message.includes("Too Many Requests")) {
      console.warn(`Rate limit exceeded for send-sms from IP: ${req.ip || req.headers['x-forwarded-for']}`);
    } else {
      console.error("Error in send-sms rate limiting middleware:", error);
    }
    return;
  }

  return protectedSendSmsHandler(req, res);
}
