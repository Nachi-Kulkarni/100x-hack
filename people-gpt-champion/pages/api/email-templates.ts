// people-gpt-champion/pages/api/email-templates.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { EmailTemplatesApiResponseSchema } from '../../lib/schemas'; // Zod schema for validation

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
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

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

    // Validate the response data with Zod (optional but good practice)
    const validationResult = EmailTemplatesApiResponseSchema.safeParse(activeTemplates);
    if (!validationResult.success) {
        console.error("Data validation error for /api/email-templates response:", validationResult.error.flatten());
        // Decide if to still send data or an error. For now, sending potentially unvalidated data if parsing fails.
        // Or throw: throw new Error("Server data validation failed for email templates.");
    }


    return res.status(200).json(activeTemplates); // Send validated data if validationResult.success, or raw if not strictly enforcing
  } catch (error: any) {
    console.error('Error fetching email templates:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch email templates.', details: error.message });
  } finally {
    await prisma.$disconnect().catch(async (e) => {
      console.error("Failed to disconnect Prisma client", e);
    });
  }
}
