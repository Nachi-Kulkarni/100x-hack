// people-gpt-champion/pages/api/send-sms.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { SendSmsRequestBodySchema } from '../../lib/schemas';
import { sendSms } from '../../lib/twilio';
import { getFeatureFlag, createAnonymousUser } from '../../lib/launchdarkly'; // Assuming user context might be basic for API routes initially

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
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  // Feature Flag Check
  try {
    // For server-side API routes, user context might be simple (e.g., system user or anonymous)
    // or could be derived from auth tokens if available.
    const ldUser = createAnonymousUser(); // Or derive a more specific user context
    const isTwilioSmsEnabled = await getFeatureFlag('twilio-sms-outreach', ldUser, false);

    if (!isTwilioSmsEnabled) {
      console.log("Attempt to use send-sms API while 'twilio-sms-outreach' flag is disabled.");
      return res.status(501).json({ success: false, error: 'SMS functionality is currently disabled.' });
    }
  } catch (ldError: any) {
    console.error('LaunchDarkly error in /api/send-sms:', ldError);
    // Fail gracefully if LD check fails, perhaps default to disabled or log and continue if appropriate
    return res.status(500).json({ success: false, error: 'Error checking feature flag status.' });
  }

  // Validate request body
  const validationResult = SendSmsRequestBodySchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({ success: false, error: validationResult.error.flatten() });
  }

  const { to, body, candidateId } = validationResult.data; // Added candidateId

  if (candidateId) {
    console.log(`SMS message initiated. Associated with candidateId: ${candidateId}`);
    // Note: No database persistence for SMS messages in this current implementation.
    // If an SmsOutreach table existed, candidateId would be stored there.
  }

  try {
    // TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER are expected to be set as env vars
    // and are used by getTwilioClient() in lib/twilio.ts.
    // sendSms will throw if these are not configured.
    const messageSid = await sendSms(to, body);

    return res.status(200).json({ success: true, messageSid: messageSid });

  } catch (error: any) {
    console.error(`Error in /api/send-sms for recipient ${to}:`, error);
    const errorMessage = error.message || 'An unexpected error occurred while sending the SMS.';
    // Check for specific configuration errors from lib/twilio.ts
    if (errorMessage.includes('environment variable is not set')) {
      return res.status(500).json({ success: false, error: `Server configuration error: ${errorMessage}` });
    }
    return res.status(500).json({ success: false, error: `Failed to send SMS: ${errorMessage}` });
  }
}
