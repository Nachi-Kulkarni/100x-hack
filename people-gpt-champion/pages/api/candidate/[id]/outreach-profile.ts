// people-gpt-champion/pages/api/candidate/[id]/outreach-profile.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Prisma } from '@prisma/client';
import { OutreachProfileResponseSchema } from '../../../lib/schemas'; // Zod schema for response validation
import { z } from 'zod';

const prisma = new PrismaClient();

// Helper schema for CUID validation
const CuidSchema = z.string().cuid({ message: "Invalid Candidate ID format." });

// Define types for JSON fields if they are consistently structured
// These are examples based on common resume parsing structures. Adjust as needed.
interface ResumeSkill {
  skill: string;
  level?: string; // example, if your skills JSON has more structure
}
interface ResumeExperience {
  job_title?: string;
  company?: string;
  start_date?: string;
  end_date?: string;
  responsibilities?: string[];
}
interface ResumeEducation {
  degree?: string;
  institution?: string;
  graduation_date?: string;
}


/**
 * @swagger
 * /api/candidate/{id}/outreach-profile:
 *   get:
 *     summary: Retrieves a summarized outreach profile for a specific candidate.
 *     description: Fetches candidate data and transforms it into a concise profile suitable for outreach planning.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: cuid
 *         description: The CUID of the candidate.
 *     responses:
 *       '200':
 *         description: The candidate's outreach profile.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OutreachProfileResponse'
 *       '400':
 *         description: Bad Request - Invalid candidate ID format.
 *       '404':
 *         description: Not Found - Candidate with the given ID not found.
 *       '500':
 *         description: Internal Server Error.
 * components: # For Swagger documentation purposes
 *   schemas:
 *     OutreachProfileResponse: # Defined in lib/schemas.ts via Zod
 *       type: object
 *       properties:
 *         id: { type: "string", format: "cuid" }
 *         name: { type: "string" }
 *         email: { type: "string", format: "email", nullable: true }
 *         phone: { type: "string", nullable: true }
 *         headline: { type: "string", nullable: true }
 *         keySkills: { type: "array", items: { type: "string" }, nullable: true }
 *         experienceSummary: { type: "string", nullable: true }
 *         educationSummary: { type: "string", nullable: true }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const candidateIdValidation = CuidSchema.safeParse(req.query.id);
  if (!candidateIdValidation.success) {
    return res.status(400).json({ success: false, error: "Invalid Candidate ID format.", details: candidateIdValidation.error.flatten() });
  }
  const candidateId = candidateIdValidation.data;

  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      // No explicit includes for related models like CandidateProfile, CandidateSkill etc.
      // as these are not in the provided schema. Will use JSON fields from Candidate.
    });

    if (!candidate) {
      return res.status(404).json({ success: false, error: 'Candidate not found.' });
    }

    // Transform data (simple transformations for now)
    let headline = candidate.title || ''; // Use existing title field as a starting point

    let keySkills: string[] = [];
    if (candidate.skills && typeof candidate.skills === 'object' && !Array.isArray(candidate.skills) ) {
        // Assuming skills might be an object like { "technical": ["JS", "Python"], "soft": ["Communication"] }
        // Or if it's an array of strings directly from a simpler resume parser:
        // This part needs to be robust based on actual JSON structure of `candidate.skills`
        // For now, let's assume it's an array of strings or objects with a 'skill' property.
        const skillsData = candidate.skills as any; // Cast to any to handle unknown JSON structure
        if (Array.isArray(skillsData)) {
            keySkills = skillsData.slice(0, 5).map((s: any) => (typeof s === 'string' ? s : s?.skill || s?.name)).filter(Boolean) as string[];
        } else if (typeof skillsData === 'object' && skillsData !== null) {
            // If it's an object, try to extract from known properties
            if (Array.isArray(skillsData.technical)) keySkills.push(...skillsData.technical.slice(0,3));
            if (Array.isArray(skillsData.soft)) keySkills.push(...skillsData.soft.slice(0,2));
            keySkills = keySkills.filter(Boolean);
        }
    } else if (Array.isArray(candidate.skills)) { // If skills is already Prisma.JsonArray of strings
        keySkills = (candidate.skills as string[]).slice(0,5);
    }


    let experienceSummary = '';
    if (candidate.workExperience && Array.isArray(candidate.workExperience) && candidate.workExperience.length > 0) {
      const experiences = candidate.workExperience as ResumeExperience[]; // Cast to known type
      const recentExperiences = experiences.slice(0, 2); // Take first 2 for summary
      experienceSummary = recentExperiences
        .map(exp => `${exp.job_title || 'N/A'} at ${exp.company || 'N/A'}`)
        .join('; ');
      if (!headline && experiences[0]?.job_title) { // If no candidate.title, use latest job title
        headline = experiences[0].job_title;
      }
    }

    let educationSummary = '';
    if (candidate.education && Array.isArray(candidate.education) && candidate.education.length > 0) {
      const educations = candidate.education as ResumeEducation[]; // Cast to known type
      const firstEducation = educations[0];
      educationSummary = `${firstEducation.degree || 'N/A'} from ${firstEducation.institution || 'N/A'}`;
    }

    const profileData: IOutreachProfileResponse = {
      id: candidate.id,
      name: candidate.name || 'N/A', // Ensure name is provided
      email: candidate.email, // Already string
      phone: candidate.phone, // Already string?
      headline: headline || null,
      keySkills: keySkills.length > 0 ? keySkills : undefined, // make undefined if empty for optional field
      experienceSummary: experienceSummary || null,
      educationSummary: educationSummary || null,
    };

    // Validate final data against Zod schema before sending
    const responseValidation = OutreachProfileResponseSchema.safeParse(profileData);
    if (!responseValidation.success) {
      console.error("Server data validation error for outreach profile:", responseValidation.error.flatten());
      // This indicates an issue with data transformation or schema definition mismatch
      return res.status(500).json({ success: false, error: "Error validating profile data on server." });
    }

    return res.status(200).json(responseValidation.data);

  } catch (error: any) {
    console.error(`Error fetching outreach profile for candidate ${candidateId}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2023') {
        // Error P2023: Inconsistent column data (e.g. invalid CUID format in DB, though less likely for ID)
        return res.status(400).json({ success: false, error: "Invalid data format in database for candidate ID."});
    }
    return res.status(500).json({ success: false, error: 'Failed to fetch outreach profile.', details: error.message });
  } finally {
    await prisma.$disconnect().catch(async (e) => {
      console.error("Failed to disconnect Prisma client", e);
    });
  }
}
