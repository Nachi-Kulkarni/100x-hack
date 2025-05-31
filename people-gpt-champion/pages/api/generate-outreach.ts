import type { NextApiRequest, NextApiResponse } from 'next';
import {
  GenerateOutreachRequestBodySchema,
  EmailOutreachResponseSchema,
  SlackOutreachResponseSchema,
  IOutreachProfileResponse, // For type hinting
  OutreachProfileResponseSchema, // For validating provided profile and fetched profile
  IApiErrorResponse, // For error responses
  IEmailOutreachResponse, // For success response typing
  ISlackOutreachResponse // For success response typing
} from '../../lib/schemas';
import { rateLimiter, runMiddleware } from '../../lib/rateLimit';
import { withRoleProtection } from '../../lib/authUtils';
import { Role, PrismaClient, Prisma } from '@prisma/client'; // PrismaClient already imported, added Prisma for types
// import { OpenAI } from '../../lib/openai';
import { chatCompletionBreaker } from '../../lib/openai';
import { handleZodError, sendErrorResponse, sendSuccessResponse } from '../../lib/apiUtils'; // Standard helpers
import { ZodError } from 'zod'; // To catch Zod errors

const prisma = new PrismaClient();

// Configure the rate limiter for the generate-outreach API
const outreachApiRateLimiter = rateLimiter({
  windowSeconds: 60, // 1 minute
  maxRequests: 5,    // 5 requests per minute per IP
  keyPrefix: 'generate_outreach_api',
});

// Helper types for JSON data transformation (consistent with outreach-profile API)
interface ResumeSkill { // These could be moved to a shared types file if used elsewhere
  skill: string;
  level?: string;
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
 * Fetches and transforms candidate data into an OutreachProfile structure.
 */
async function getResolvedOutreachProfileHelper(candidateId: string): Promise<IOutreachProfileResponse | null> {
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      return null;
    }

    let headline = candidate.title || '';
    let keySkills: string[] = [];

    if (candidate.skills) {
        const skillsData = candidate.skills as any;
        if (Array.isArray(skillsData)) {
            keySkills = skillsData.slice(0, 5).map((s: any) => {
                if (typeof s === 'string') return s;
                if (s && typeof s.skill === 'string') return s.skill;
                if (s && typeof s.name === 'string') return s.name;
                return null;
            }).filter(Boolean) as string[];
        } else if (typeof skillsData === 'object' && skillsData !== null) { // Basic handling for object structure
            if (Array.isArray(skillsData.technical)) keySkills.push(...skillsData.technical.slice(0,3).map(String));
            if (Array.isArray(skillsData.other)) keySkills.push(...skillsData.other.slice(0,2).map(String));
            keySkills = keySkills.filter(Boolean);
        }
    }

    let experienceSummary = '';
    if (candidate.workExperience && Array.isArray(candidate.workExperience) && candidate.workExperience.length > 0) {
      const experiences = candidate.workExperience as ResumeExperience[];
      const recentExperiences = experiences.slice(0, 2);
      experienceSummary = recentExperiences
        .map(exp => `${exp.job_title || 'N/A'} at ${exp.company || 'N/A'}`)
        .join('; ');
      if (!headline && experiences[0]?.job_title) { // If no candidate.title, use latest job title
        headline = experiences[0].job_title;
      }
    }

    let educationSummary = '';
    if (candidate.education && Array.isArray(candidate.education) && candidate.education.length > 0) {
      const educations = candidate.education as ResumeEducation[];
      const firstEducation = educations[0]; // Take the first one for summary
      educationSummary = `${firstEducation.degree || 'N/A'} from ${firstEducation.institution || 'N/A'}`;
    }

    const profileData: IOutreachProfileResponse = {
      id: candidate.id,
      name: candidate.name || 'N/A',
      email: candidate.email,
      phone: candidate.phone,
      headline: headline || null,
      keySkills: keySkills.length > 0 ? keySkills : undefined,
      experienceSummary: experienceSummary || null,
      educationSummary: educationSummary || null,
    };

    const validation = OutreachProfileResponseSchema.safeParse(profileData);
    if (!validation.success) {
        console.error("Server-side validation failed for fetched outreach profile in generate-outreach:", validation.error.flatten());
        throw new Error("Failed to correctly transform candidate data for outreach profile.");
    }
    return validation.data;

  } catch (error) {
    console.error(`Error in getResolvedOutreachProfileHelper for candidateId ${candidateId}:`, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2023') {
        throw new Error("Invalid data format in database for candidate ID when fetching profile.");
    }
    throw error;
  }
}


/**
 * @swagger
 * /api/generate-outreach:
 *   post:
 *     summary: Generates outreach content using OpenAI GPT-4.
 *     description: |
 *       This endpoint generates personalized outreach content (email or Slack message)
 *       based on a provided template, dynamic variables, tone, and channel.
 *       Optionally, `candidateId` or a full `outreachProfile` can be provided for deeper personalization.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenerateOutreachRequestBody'
 *     responses:
 *       '200':
 *         description: Successfully generated outreach content.
 *         content:
 *           application/json:
 *             oneOf:
 *               - $ref: '#/components/schemas/EmailOutreachResponse'
 *               - $ref: '#/components/schemas/SlackOutreachResponse'
 *       '400':
 *         description: Bad Request - Invalid input data or profile transformation error.
 *       '404':
 *         description: Not Found - Candidate not found when `candidateId` is provided.
 *       '500':
 *         description: Internal Server Error.
 *       '503':
 *         description: Service Unavailable - OpenAI is overloaded or down.
 * components:
 *  schemas:
 *    GenerateOutreachRequestBody: # Ensure your central OpenAPI spec is updated
 *      type: object
 *      required:
 *        - template
 *        - vars
 *        - tone
 *        - channel
 *      properties:
 *        template:
 *          type: string
 *          enum: [intro, job_opp, follow_up]
 *        vars:
 *          type: object
 *          description: Key-value pairs for template personalization.
 *        tone:
 *          type: string
 *          description: Desired tone of the message (e.g., formal, casual).
 *        channel:
 *          type: string
 *          enum: [email, slack]
 *        candidateId:
 *          type: string
 *          format: cuid
 *          description: Optional CUID of the candidate to personalize the outreach for.
 *        outreachProfile:
 *          $ref: '#/components/schemas/OutreachProfileResponse'
 *          description: Optional pre-fetched outreach profile of the candidate.
 *    OutreachProfileResponse: # Must match definition in lib/schemas.ts
 *      type: object
 *      properties:
 *        id: { type: "string", format: "cuid" }
 *        name: { type: "string" }
 *        email: { type: "string", format: "email", nullable: true }
 *        phone: { type: "string", nullable: true }
 *        headline: { type: "string", nullable: true }
 *        keySkills: { type: "array", items: { type: "string" }, nullable: true }
 *        experienceSummary: { type: "string", nullable: true }
 *        educationSummary: { type: "string", nullable: true }
 *    EmailOutreachResponse:
 *      type: object
 *      properties:
 *        subject: { type: "string" }
 *        body: { type: "string" }
 *    SlackOutreachResponse:
 *      type: object
 *      properties:
 *        message: { type: "string" }
 */
async function generateOutreachHandler(
  req: NextApiRequest,
  res: NextApiResponse<IEmailOutreachResponse | ISlackOutreachResponse | IApiErrorResponse>
) {
  // Role and RateLimit are handled by wrappers. Method check by outer handler.
  try {
    // Validate request body
    const validationResult = GenerateOutreachRequestBodySchema.safeParse(req.body);
    if (!validationResult.success) {
      throw validationResult.error; // Caught by ZodError handler below
    }
    const { template, vars, tone, channel, candidateId } = validationResult.data;
    let { outreachProfile: providedOutreachProfile } = validationResult.data;

    let resolvedOutreachProfile: IOutreachProfileResponse | null | undefined = providedOutreachProfile;

    if (candidateId && !resolvedOutreachProfile) {
        resolvedOutreachProfile = await getResolvedOutreachProfileHelper(candidateId);
        if (!resolvedOutreachProfile) {
          return sendErrorResponse(res, 404, 'Candidate not found for the provided candidateId.');
        }
    }

    let systemPrompt = "You are an expert at crafting outreach messages. Follow the user's instructions carefully regarding channel, tone, and variables. Output *only* valid JSON that strictly adheres to the requested format.";
    let userPrompt = `Generate a ${channel} message for the purpose of "${template}".\n`;

    if (resolvedOutreachProfile) {
        userPrompt += `\nThe message should be highly personalized for: ${resolvedOutreachProfile.name}.\n`;
        if (resolvedOutreachProfile.headline) userPrompt += `Their current headline/role is: ${resolvedOutreachProfile.headline}.\n`;
        if (resolvedOutreachProfile.keySkills && resolvedOutreachProfile.keySkills.length > 0) {
            userPrompt += `Key skills to consider mentioning or alluding to: ${resolvedOutreachProfile.keySkills.join(', ')}.\n`;
        }
        if (resolvedOutreachProfile.experienceSummary) {
            userPrompt += `Summary of their experience: ${resolvedOutreachProfile.experienceSummary}.\n`;
        }
        // Education summary might be too much detail for some outreach, can be omitted or made optional in prompt
        // if (resolvedOutreachProfile.educationSummary) {
        //     userPrompt += `Their education includes: ${resolvedOutreachProfile.educationSummary}.\n`;
        // }
    }

    userPrompt += `\nThe tone should be ${tone}.\n`;
    if (vars && Object.keys(vars).length > 0) {
        userPrompt += `\nIncorporate these dynamic variables into the message (prioritizing candidate-specific details if they seem to overlap or conflict with these generic vars):\n`;
        for (const [key, value] of Object.entries(vars)) {
          userPrompt += `- ${key}: ${value}\n`;
        }
    } else {
        userPrompt += `\nNo additional generic dynamic variables were provided for this request.\n`;
    }

    const nameForPrompt = resolvedOutreachProfile?.name || (vars?.name as string) || 'Candidate';

    if (channel === 'email') {
      userPrompt += `\nGenerate a subject line (keep it concise, ideally under 10 words) and a body for the email.`;
      userPrompt += `\nReturn a single JSON object with two keys: "subject" and "body". For example: {"subject": "Regarding Your Profile", "body": "Dear ${nameForPrompt}, ..."}`;
    } else { // slack
      userPrompt += `\nGenerate a direct message for Slack.`;
      userPrompt += `\nReturn a single JSON object with one key: "message". For example: {"message": "Hi ${nameForPrompt}, I came across your profile..."}`;
    }

    // console.log("----PROMPT-----\n", userPrompt, "\n------------"); // For debugging

    const completion = await chatCompletionBreaker.fire({
      model: "gpt-4-turbo", // Using a potentially faster/cheaper GPT-4 variant
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }, // Enforce JSON output
      temperature: 0.7, // Adjust for creativity vs. precision
      // max_tokens: can be set if needed, but JSON mode might handle length well.
    });

    const generatedText = completion.choices[0]?.message?.content;

    if (!generatedText) {
      console.error("OpenAI response content is null or undefined. Full completion:", completion);
      return sendErrorResponse(res, 500, 'OpenAI did not return content.');
    }

    const parsedContent = JSON.parse(generatedText); // Can throw if not JSON

    if (channel === 'email') {
      const validation = EmailOutreachResponseSchema.safeParse(parsedContent);
      if (!validation.success) {
        console.error("OpenAI response did not match EmailOutreachResponseSchema. Errors:", validation.error.flatten(), "Raw content:", generatedText);
        return sendErrorResponse(res, 500, 'OpenAI response validation failed for email structure.', validation.error.flatten());
      }
      return sendSuccessResponse(res, 200, validation.data);
    } else { // slack
      const validation = SlackOutreachResponseSchema.safeParse(parsedContent);
      if (!validation.success) {
        console.error("OpenAI response did not match SlackOutreachResponseSchema. Errors:", validation.error.flatten(), "Raw content:", generatedText);
        return sendErrorResponse(res, 500, 'OpenAI response validation failed for Slack structure.', validation.error.flatten());
      }
      return sendSuccessResponse(res, 200, validation.data);
    }

  } catch (error: any) {
    if (error instanceof ZodError) {
      return handleZodError(error, res);
    }
    if (error instanceof SyntaxError) { // From JSON.parse()
        console.error("Error parsing OpenAI JSON response:", error.message, "Raw content:", generatedText); // generatedText might be out of scope here
        return sendErrorResponse(res, 500, 'Error processing OpenAI response: Malformed JSON.');
    }
    if (error.name === 'CircuitBreakerError') {
      console.error('Circuit breaker is open for OpenAI:', error.message);
      return sendErrorResponse(res, 503, 'Service unavailable. OpenAI is currently overloaded or down. Please try again later.');
    }
    // Catch errors from getResolvedOutreachProfileHelper
    if (error.message.includes("Candidate not found") ||
        error.message.includes("Invalid data format") ||
        error.message.includes("Failed to correctly transform")) {
        return sendErrorResponse(res, error.message.includes("Candidate not found") ? 404 : 500, error.message);
    }
    console.error('Error generating outreach content:', error.message, error.stack);
    return sendErrorResponse(res, 500, 'Internal Server Error', error.message);
  } finally {
    await prisma.$disconnect().catch(async (e) => {
      console.error("Failed to disconnect Prisma client", e);
    });
  }
}

// Apply rate limiting first, then role protection
const protectedHandler = withRoleProtection(generateOutreachHandler, [Role.ADMIN, Role.RECRUITER]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Apply rate limiter first
  try {
    await runMiddleware(req, res, outreachApiRateLimiter);
  } catch (error: any) {
    // Rate limiter already sent response if it's a 429, or an error during its execution
    // Log if needed, but don't send another response from here.
    if (error.message.includes("Too Many Requests")) {
        console.warn(`Rate limit exceeded for generate-outreach API from IP: ${req.ip || req.headers['x-forwarded-for']}`);
    } else {
        console.error("Error in generate-outreach rate limiting middleware (outer handler):", error);
    }
    return;
  }
  // If rate limiter passes, proceed to the role-protected handler
  return protectedHandler(req, res);
}
