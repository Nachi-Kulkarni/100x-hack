// people-gpt-champion/pages/api/send-slack-message.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { SendSlackMessageRequestBodySchema } from '../../lib/schemas';
import { sendSlackMessage } from '../../lib/slack';

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
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  // Validate request body
  const validationResult = SendSlackMessageRequestBodySchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({ success: false, error: validationResult.error.flatten() });
  }

  const { userId, message, candidateId } = validationResult.data; // Added candidateId

  if (candidateId) {
    console.log(`Slack message initiated. Associated with candidateId: ${candidateId}`);
    // Note: No database persistence for Slack messages in this current implementation.
    // If a SlackOutreach table existed, candidateId would be stored there.
  }

  try {
    // The SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET are expected to be set as environment variables
    // and are used internally by getSlackApp() in lib/slack.ts
    // If they are not set, sendSlackMessage will throw an error which is caught below.
    const messageTimestamp = await sendSlackMessage(userId, message);

    // If sendSlackMessage was successful, it returns the message timestamp (ts)
    return res.status(200).json({ success: true, messageId: messageTimestamp });

  } catch (error: any) {
    console.error(`Error in /api/send-slack-message for user ${userId}:`, error);
    const errorMessage = error.message || 'An unexpected error occurred while sending the Slack message.';
    // Check if the error is due to missing environment variables from lib/slack.ts
    if (errorMessage.includes('SLACK_BOT_TOKEN environment variable is not set') ||
        errorMessage.includes('SLACK_SIGNING_SECRET environment variable is not set')) {
      return res.status(500).json({ success: false, error: `Server configuration error: ${errorMessage}` });
    }
    return res.status(500).json({ success: false, error: `Failed to send Slack message: ${errorMessage}` });
  }
}
