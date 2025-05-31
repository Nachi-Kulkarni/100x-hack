// people-gpt-champion/pages/api/send-email.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Role } from '@prisma/client'; // Import Role
// Updated SendEmailRequestBodySchema will be imported from schemas, so remove direct def here if it exists
// We will define the new schema in lib/schemas.ts as per the plan,
// but for now, let's adjust the import assuming it's moved or to be updated there.
// For this step, we will define it inline then plan to move it.
// import { SendEmailRequestBodySchema, ... } from '../../lib/schemas';
import {
    // SendEmailRequestBodySchema, // We will redefine this below for now
    SendEmailSuccessResponseSchema, // For typing success response
    IApiErrorResponse,             // For typing error response
    OutreachSentDetailsSchema      // For audit log details
} from '../../lib/schemas';
import { sendEmail, EmailOptions } from '../../lib/resend';
import { withRoleProtection } from '../../lib/authUtils';
import { handleZodError, sendErrorResponse, sendSuccessResponse } from '../../lib/apiUtils';
import { createAuditLog } from '../../lib/auditLog'; // Import createAuditLog
import { getServerSession } from 'next-auth/next';   // For getting userId
import { authOptions } from '../auth/[...nextauth]'; // For getting userId
import { ZodError, z } from 'zod'; // Combined z import
// For inferring type for audit log details // z is already imported
import { rateLimiter, runMiddleware } from '../../lib/rateLimit'; // Import rate limiting

// Define the new schema here as per the plan for this file
// Later, this definition might be moved to '../../lib/schemas.ts'
export const SendEmailRequestBodySchema = z.object({
  to: z.string().email(),
  candidateId: z.string().cuid().optional(),
  templateVersionId: z.string().cuid().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.templateVersionId && (data.subject || data.body)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cannot provide both templateVersionId and subject/body.",
    });
  }
  if (!data.templateVersionId && (!data.subject || !data.body)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Must provide either templateVersionId or both subject and body.",
    });
  }
});


const prisma = new PrismaClient();

const sendEmailRateLimiter = rateLimiter({
  windowSeconds: 5 * 60, // 5 minutes
  maxRequests: 10,
  keyPrefix: 'send_email',
});

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
async function sendEmailHandler(
  req: NextApiRequest,
  res: NextApiResponse // Type will be <SendEmailSuccessResponseSchema (or inferred type) | IApiErrorResponse>
) {
  // Method and role checks are handled by withRoleProtection or the main export default

  try {
    const session = await getServerSession(req, res, authOptions); // Get session for audit logging
    const currentUserId = session?.user?.id;

    // Validate request body
    const validationResult = SendEmailRequestBodySchema.safeParse(req.body);
    if (!validationResult.success) {
      throw validationResult.error; // Caught by ZodError handler
    }
    // Destructure new fields: reqSubject and reqBody
    const { to: recipientEmail, templateVersionId, candidateId, subject: reqSubject, body: reqBody } = validationResult.data;

    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!fromEmail) {
      console.error('RESEND_FROM_EMAIL environment variable is not set.');
      return sendErrorResponse(res, 500, 'Server configuration error: From email not set.');
    }

    let emailSubject: string;
    let emailBody: string;

    if (templateVersionId) {
      // 1. Fetch the template version from the database
      const templateVersion = await prisma.emailTemplateVersion.findUnique({
        where: { id: templateVersionId },
      });

      if (!templateVersion) {
        return sendErrorResponse(res, 404, 'Email template version not found.');
      }
      if (templateVersion.isArchived) {
        return sendErrorResponse(res, 400, 'Email template version is archived and cannot be used.');
      }
      emailSubject = templateVersion.subject;
      emailBody = templateVersion.body;
    } else if (reqSubject && reqBody) {
      // Use subject and body from request for AI/custom emails
      emailSubject = reqSubject;
      emailBody = reqBody;
    } else {
      // This should be caught by Zod superRefine, but as a safeguard
      return sendErrorResponse(res, 400, 'Invalid request: Must provide templateVersionId or both subject and body.');
    }

    // 2. Send the email using Resend
    const emailOptions: EmailOptions = {
      to: recipientEmail,
      from: fromEmail,
      subject: emailSubject,
      html: emailBody,
    };

    const resendResponse = await sendEmail(emailOptions);

    if (!resendResponse || !resendResponse.id) {
      console.error('Resend response did not include an ID, or data was null/undefined.');
      return sendErrorResponse(res, 500, 'Failed to send email due to an issue with the email provider response.');
    }
    const resendMessageId = resendResponse.id;

    // 3. Create EmailOutreach record in the database
    const outreachData: any = {
      recipientEmail: recipientEmail,
      resendMessageId: resendMessageId,
      status: 'sent', // Initial status
      // sentAt is defaulted by Prisma schema
      // templateVersionId is now optional, so add it conditionally or pass as is (null/undefined if not present)
      templateVersionId: templateVersionId,
    };

    if (candidateId) {
      outreachData.candidateId = candidateId;
    }

    await prisma.emailOutreach.create({
      data: outreachData,
    });

    // Audit log the successful email send
    if (currentUserId) {
      const auditDetails: z.infer<typeof OutreachSentDetailsSchema> = {
        channel: "email",
        recipient: recipientEmail,
        candidateId: candidateId || null, // Ensure null if undefined
        templateId: templateVersionId || null, // Pass null if templateVersionId is not available
        messageId: resendMessageId,
        // subject and body could be added to audit log if necessary for AI emails
      };
      const parsedAuditDetails = OutreachSentDetailsSchema.safeParse(auditDetails);
      if (parsedAuditDetails.success) {
        await createAuditLog({
          userId: currentUserId,
          action: "OUTREACH_SENT",
          entity: "EmailOutreach",
          entityId: resendMessageId, // Using Resend ID as entityId for this log
          details: parsedAuditDetails.data,
        });
      } else {
        console.warn("Failed to validate OUTREACH_SENT (email) audit details:", parsedAuditDetails.error);
      }
    }

    return sendSuccessResponse(res, 200, { success: true, messageId: resendMessageId });

  } catch (error: any) {
    if (error instanceof ZodError) {
      return handleZodError(error, res);
    }
    console.error('Error processing /api/send-email:', error);
    if (error.code === 'P2025') { // Prisma's "Record to update not found"
        return sendErrorResponse(res, 404, 'Database error: Referenced template version not found for outreach log creation.');
    }
    return sendErrorResponse(res, 500, `Failed to process request: ${error.message || 'An unexpected error occurred'}`);
  } finally {
    await prisma.$disconnect().catch(async (e) => {
      console.error("Failed to disconnect Prisma client", e);
    });
  }
}

const protectedSendEmailHandler = withRoleProtection(sendEmailHandler, [Role.ADMIN, Role.RECRUITER]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return sendErrorResponse(res, 405, `Method ${req.method} Not Allowed`);
  }

  try {
    await runMiddleware(req, res, sendEmailRateLimiter);
  } catch (error: any) {
    if (error.message.includes("Too Many Requests")) {
      console.warn(`Rate limit exceeded for send-email from IP: ${req.ip || req.headers['x-forwarded-for']}`);
    } else {
      console.error("Error in send-email rate limiting middleware:", error);
    }
    return;
  }

  return protectedSendEmailHandler(req, res);
}
