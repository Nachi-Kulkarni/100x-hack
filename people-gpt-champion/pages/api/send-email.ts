// people-gpt-champion/pages/api/send-email.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { SendEmailRequestBodySchema } from '../../lib/schemas';
import { sendEmail, EmailOptions } from '../../lib/resend';

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/send-email:
 *   post:
 *     summary: Sends an email using Resend based on a template version.
 *     description: |
 *       Accepts a recipient email, a template version ID, and an optional candidate ID.
 *       Fetches the template, sends the email via Resend, and logs the outreach attempt,
 *       linking it to the candidate if their ID is provided.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendEmailRequestBody'
 *             # Properties: to (string, email), templateVersionId (string, cuid), candidateId (string, cuid, optional)
 *     responses:
 *       '200':
 *         description: Email sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SendEmailSuccessResponse'
 *               # Placeholder - ensure this is defined in your OpenAPI/Swagger spec
 *       '400':
 *         description: Bad Request - Invalid input data.
 *       '404':
 *         description: Not Found - Template version not found or is archived.
 *       '500':
 *         description: Internal Server Error - Failed to send email or database issue.
 * components: # Added for placeholder purposes for Swagger UI
 *  schemas:
 *    SendEmailRequestBody: # Ensure your central OpenAPI spec reflects this change
 *      type: object
 *      required:
 *        - to
 *        - templateVersionId
 *      properties:
 *        to:
 *          type: string
 *          format: email
 *          description: The recipient's email address.
 *        templateVersionId:
 *          type: string
 *          format: cuid
 *          description: ID of the EmailTemplateVersion to use.
 *        candidateId:
 *          type: string
 *          format: cuid
 *          description: Optional ID of the candidate this email is for.
 *    SendEmailSuccessResponse:
 *      type: object
 *      properties:
 *        success:
 *          type: boolean
 *          example: true
 *        messageId:
 *          type: string
 *          example: "00000000-0000-0000-0000-000000000000"
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
  const validationResult = SendEmailRequestBodySchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({ success: false, error: validationResult.error.flatten() });
  }

  // Data now contains `to` (for recipientEmail), `templateVersionId`, and optionally `candidateId`
  const { to: recipientEmail, templateVersionId, candidateId } = validationResult.data;

  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!fromEmail) {
    console.error('RESEND_FROM_EMAIL environment variable is not set.');
    return res.status(500).json({ success: false, error: 'Server configuration error: From email not set.' });
  }

  try {
    // 1. Fetch the template version from the database
    const templateVersion = await prisma.emailTemplateVersion.findUnique({
      where: { id: templateVersionId },
    });

    if (!templateVersion) {
      return res.status(404).json({ success: false, error: 'Email template version not found.' });
    }
    if (templateVersion.isArchived) {
      return res.status(404).json({ success: false, error: 'Email template version is archived and cannot be used.' });
    }

    const { subject, body } = templateVersion; // Fetched from DB

    // 2. Send the email using Resend
    const emailOptions: EmailOptions = {
      to: recipientEmail, // Use 'to' from request for recipient
      from: fromEmail,
      subject,          // Use subject from fetched template
      html: body,            // Use body from fetched template
    };

    const resendResponse = await sendEmail(emailOptions);

    if (!resendResponse || !resendResponse.id) {
      console.error('Resend response did not include an ID, or data was null/undefined.');
      // This indicates an issue with the Resend call itself or its response format not matching expectations.
      return res.status(500).json({ success: false, error: 'Failed to send email due to an issue with the email provider response.' });
    }

    const resendMessageId = resendResponse.id;

    // 3. Create EmailOutreach record in the database
    const outreachData: any = {
      templateVersionId: templateVersionId,
      recipientEmail: recipientEmail,
      resendMessageId: resendMessageId,
      status: 'sent', // Initial status
      // sentAt is defaulted by Prisma schema
    };

    if (candidateId) {
      outreachData.candidateId = candidateId;
    }

    await prisma.emailOutreach.create({
      data: outreachData,
    });

    // Return success response with the Resend message ID
    return res.status(200).json({ success: true, messageId: resendMessageId });

  } catch (error: any) {
    console.error('Error processing /api/send-email:', error);
    // Check for specific Prisma errors, e.g., record not found for relation if templateVersionId was invalid for the create step
    if (error.code === 'P2025') {
        return res.status(404).json({ success: false, error: 'Database error: Referenced template version not found for outreach log creation.' });
    }
    const errorMessage = error.message || 'An unexpected error occurred while processing the request.';
    return res.status(500).json({ success: false, error: `Failed to process request: ${errorMessage}` });
  } finally {
    // Ensure Prisma client is disconnected after each request
    await prisma.$disconnect().catch(async (e) => {
      console.error("Failed to disconnect Prisma client", e);
      // Optionally, handle or log this more formally if needed
    });
  }
}
