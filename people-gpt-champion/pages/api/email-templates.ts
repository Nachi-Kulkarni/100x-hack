// people-gpt-champion/pages/api/email-templates.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Role } from '@prisma/client'; // Import Role
import { EmailTemplatesApiResponseSchema, IEmailTemplatesApiResponse, IApiErrorResponse } from '../../lib/schemas'; // Zod schema for validation
import { sendSuccessResponse, sendErrorResponse } from '../../lib/apiUtils'; // API response helpers
import { withRoleProtection } from '../../lib/authUtils'; // Import withRoleProtection

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/email-templates:
 *   get:
 *     summary: Retrieves all non-archived email templates with their non-archived versions.
 *     description: Fetches email templates to be used in UI selectors, for composing outreach messages.
 *     responses:
 *       '200':
 *         description: A list of email templates with their versions.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EmailTemplatesApiResponse'
 *               # This should align with the Zod schema EmailTemplatesApiResponseSchema
 *       '500':
 *         description: Internal Server Error.
 * components: # For Swagger documentation purposes
 *   schemas:
 *     EmailTemplateVersionApiResponse: # Defined in lib/schemas.ts via Zod
 *       type: object
 *       properties:
 *         id: { type: "string", format: "cuid" }
 *         templateId: { type: "string", format: "cuid" }
 *         subject: { type: "string" }
 *         body: { type: "string" }
 *         versionNumber: { type: "integer" }
 *         isArchived: { type: "boolean" }
 *         createdAt: { type: "string", format: "date-time" }
 *         updatedAt: { type: "string", format: "date-time" }
 *     EmailTemplateApiResponse: # Defined in lib/schemas.ts via Zod
 *       type: object
 *       properties:
 *         id: { type: "string", format: "cuid" }
 *         name: { type: "string" }
 *         createdAt: { type: "string", format: "date-time" }
 *         updatedAt: { type: "string", format: "date-time" }
 *         versions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/EmailTemplateVersionApiResponse'
 *     EmailTemplatesApiResponse: # Defined in lib/schemas.ts via Zod
 *       type: array
 *       items:
 *         $ref: '#/components/schemas/EmailTemplateApiResponse'
 */
async function emailTemplatesHandler(
  req: NextApiRequest,
  res: NextApiResponse<IEmailTemplatesApiResponse | IApiErrorResponse> // Use specific types
) {
  // Method check already handled by withRoleProtection or done before this handler normally
  // if (req.method !== 'GET') {
  //   res.setHeader('Allow', ['GET']);
  //   return sendErrorResponse(res, 405, `Method ${req.method} Not Allowed`);
  // }
  // Session and role check is handled by withRoleProtection

  try {
    const templates = await prisma.emailTemplate.findMany({
      where: {
        // No direct "isArchived" field on EmailTemplate itself in the current schema,
        // so we filter based on versions. If a template has no non-archived versions,
        // it might also be considered 'effectively archived' for selection purposes.
        // For now, just fetching all templates and filtering their versions.
      },
      include: {
        versions: {
          where: {
            isArchived: false, // Only include non-archived versions
          },
          orderBy: {
            versionNumber: 'desc', // Or createdAt: 'desc'
          },
        },
      },
      orderBy: {
        name: 'asc', // Order templates by name
      },
    });

    // Optionally, filter out templates that have no non-archived versions
    const activeTemplates = templates.filter(t => t.versions.length > 0);

    // Validate the response data with Zod
    const validationResult = EmailTemplatesApiResponseSchema.safeParse(activeTemplates);
    if (!validationResult.success) {
        console.error("Data validation error for /api/email-templates response:", validationResult.error.flatten());
        // If server-side data structure is invalid, it's a server error.
        return sendErrorResponse(res, 500, "Failed to prepare email templates: internal data validation failed.", validationResult.error.flatten());
    }

    return sendSuccessResponse(res, 200, validationResult.data);
  } catch (error: any) {
    console.error('Error fetching email templates:', error);
    return sendErrorResponse(res, 500, 'Failed to fetch email templates.', error.message);
  } finally {
    await prisma.$disconnect().catch(async (e) => {
      console.error("Failed to disconnect Prisma client", e);
    });
  }
}

export default withRoleProtection(emailTemplatesHandler, [Role.ADMIN, Role.RECRUITER]);
