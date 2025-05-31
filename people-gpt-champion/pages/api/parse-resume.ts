import type { NextApiRequest, NextApiResponse } from 'next';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { PrismaClient, Candidate, Role } from '@prisma/client'; // Role already imported
import { Buffer } from 'buffer';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

import { chatCompletionBreaker, getEmbeddingBreaker } from '../../../lib/openai';
import {
  ParsedResumeSchema,
  IParsedResume,
  CandidateCreateActionDetailsSchema,
  ParseResumeApiResponseSchema, // Import for response validation
  IParseResumeApiResponse,      // Import for type
  IApiErrorResponse             // For error response type
} from '../../../lib/schemas';
import { encrypt } from '../../../lib/encryption';
import { withRoleProtection } from '../../../lib/authUtils';
import { sendErrorResponse, sendSuccessResponse, handleZodError } from '../../../lib/apiUtils'; // Import sendSuccessResponse
import { createAuditLog } from '../../../lib/auditLog';
import { ZodError, z } from 'zod'; // Import ZodError
import { rateLimiter, runMiddleware } from '../../../lib/rateLimit';

export const config = {
  api: {
    bodyParser: false,
  },
};

const prisma = new PrismaClient();

type ProcessResult =
  | { status: 'success'; file: string; candidateId: string; data: Candidate }
  | { status: 'error'; file: string; message: string; errorDetail?: string };

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES_PER_REQUEST = 10;

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF and DOCX files are allowed.'), false);
  }
};

// Allow up to 10 files with field name 'resumes'
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).array('resumes', MAX_FILES_PER_REQUEST);


const buildOpenAIPrompt = (resumeText: string): string => {
  return `
    Please parse the following resume text and return a JSON object containing the extracted information.
    The JSON object should strictly follow this structure:
    {
      "personal_info": {
        "name": "string",
        "email": "string",
        "phone": "string" (optional, use null if not found),
        "linkedin_url": "string" (optional, use null if not found),
        "github_url": "string" (optional, use null if not found),
        "address": "string" (optional, use null if not found)
      },
      "work_experience": [
        {
          "job_title": "string",
          "company": "string",
          "location": "string" (optional, use null if not found),
          "start_date": "string" (YYYY-MM-DD or Month YYYY),
          "end_date": "string" (YYYY-MM-DD, Month YYYY, or 'Present'),
          "responsibilities": ["string"]
        }
      ],
      "education": [
        {
          "degree": "string",
          "institution": "string",
          "graduation_date": "string" (YYYY-MM-DD or Month YYYY),
          "gpa": "string" (optional, use null if not found)
        }
      ],
      "skills": ["string"],
      "certifications": [
        {
          "name": "string",
          "issuing_organization": "string",
          "date_obtained": "string" (YYYY-MM-DD or Month YYYY, optional, use null if not found)
        }
      ]
    }

    If any optional field is not present in the resume, please set its value to null.
    For dates, try to infer the format or provide it as found. 'start_date', 'end_date', 'graduation_date', 'date_obtained' should be strings.
    'responsibilities' and 'skills' should be arrays of strings. If no items are found for these arrays, use an empty array [].

    Resume Text:
    ---
    ${resumeText}
    ---

    Return ONLY the JSON object. Do not include any other text or explanations before or after the JSON.
  `;
};

async function processResumeFile(file: Express.Multer.File): Promise<ProcessResult> {
  const originalFilename = file.originalname;
  try {
    let rawResumeText = '';
    if (file.mimetype === 'application/pdf') {
      const data = await pdfParse(file.buffer);
      rawResumeText = data.text;
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const { value } = await mammoth.extractRawText({ buffer: file.buffer });
      rawResumeText = value;
    } else {
      // Should be caught by multer's fileFilter, but as a safeguard
      return { status: 'error', file: originalFilename, message: 'Unsupported file type processed.' };
    }

    if (!rawResumeText.trim()) {
      return { status: 'error', file: originalFilename, message: 'Uploaded file is empty or could not be read.' };
    }

    const prompt = buildOpenAIPrompt(rawResumeText);
    let aiContent: string;

    const openAIResponse = await chatCompletionBreaker.fire({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4-turbo-preview',
      response_format: { type: 'json_object' },
    });

    if (!openAIResponse || !openAIResponse.choices || !openAIResponse.choices[0] || !openAIResponse.choices[0].message) {
      return { status: 'error', file: originalFilename, message: 'Invalid response structure from OpenAI API for chat completion' };
    }
    aiContent = openAIResponse.choices[0].message.content;
    if (!aiContent) {
      return { status: 'error', file: originalFilename, message: 'Empty content in OpenAI API chat completion response' };
    }

    let jsonFromAI;
    try {
      jsonFromAI = JSON.parse(aiContent);
    } catch (jsonError) {
      console.error(`Error parsing JSON from OpenAI for ${originalFilename}:`, jsonError);
      return { status: 'error', file: originalFilename, message: 'Error parsing JSON response from AI.', errorDetail: aiContent };
    }

    const validationResult = ParsedResumeSchema.safeParse(jsonFromAI);
    if (!validationResult.success) {
      console.error(`Zod validation errors for ${originalFilename}:`, validationResult.error.issues);
      return { status: 'error', file: originalFilename, message: 'Invalid data format from AI.', errorDetail: JSON.stringify(validationResult.error.issues) };
    }
    const validatedData: IParsedResume = validationResult.data;

    let embeddingArray: number[];
    const embeddingResponse = await getEmbeddingBreaker.fire(rawResumeText);
    if (!embeddingResponse || !embeddingResponse.data || !embeddingResponse.data[0] || !embeddingResponse.data[0].embedding) {
      return { status: 'error', file: originalFilename, message: 'Invalid response structure from OpenAI API for embeddings' };
    }
    embeddingArray = embeddingResponse.data[0].embedding;
    const embeddingBuffer = Buffer.from(new Float32Array(embeddingArray).buffer);

    // Encrypt sensitive fields
    const encryptedPhone = validatedData.personal_info.phone
      ? encrypt(validatedData.personal_info.phone)
      : null;
    const encryptedResumeText = rawResumeText ? encrypt(rawResumeText) : null;
    // Encrypt address if it exists and is part of validatedData
    const encryptedAddress = validatedData.personal_info.address
      ? encrypt(validatedData.personal_info.address)
      : null;

    const newCandidate = await prisma.candidate.create({
      data: {
        name: validatedData.personal_info.name,
        email: validatedData.personal_info.email, // Email left unencrypted for now
        phone: encryptedPhone,
        address: encryptedAddress, // Store encrypted address
        linkedinUrl: validatedData.personal_info.linkedin_url, // Not encrypting URLs for this example
        githubUrl: validatedData.personal_info.github_url,   // Not encrypting URLs for this example
        resumeText: encryptedResumeText,
        skills: validatedData.skills as any, // Assuming skills are not PII needing encryption here
        workExperience: validatedData.work_experience as any, // Assuming not PII for this example
        education: validatedData.education as any, // Assuming not PII
        certifications: validatedData.certifications as any, // Assuming not PII
        vectorEmbedding: embeddingBuffer, // Vector embedding of the original (unencrypted) resume text
      },
    });
    return { status: 'success', file: originalFilename, candidateId: newCandidate.id, data: newCandidate };

  } catch (error) {
    console.error(`Error processing file ${originalFilename}:`, error);
    let errorMessage = 'An unexpected error occurred during processing.';
    if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
      errorMessage = 'Candidate with this email already exists.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    return { status: 'error', file: originalFilename, message: errorMessage, errorDetail: error.toString() };
  }
}

// This is the core logic of your handler after multer and any other middleware.
async function parseResumeRouteLogic(
  req: NextApiRequest & { files?: Express.Multer.File[] },
  res: NextApiResponse<IParseResumeApiResponse | IApiErrorResponse>
) {
  // Role check is handled by withRoleProtection
  // Method check (POST) is handled by the main exported handler

  try {
    const session = await getServerSession(req, res, authOptions);
    const currentUserId = session?.user?.id;

    // Using a new Promise to handle multer's callback structure within async/await
    await new Promise<void>((resolve, reject) => {
      upload(req as any, res as any, async (err: any) => {
        if (err) {
          // Handle multer errors (e.g., file size, file type)
          console.error("Multer error:", err);
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              sendErrorResponse(res, 400, `File size exceeds the limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
            } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
              sendErrorResponse(res, 400, `Too many files uploaded. Maximum is ${MAX_FILES_PER_REQUEST}. Ensure field name is 'resumes'.`);
            } else {
              sendErrorResponse(res, 400, `File upload error: ${err.message}`);
            }
          } else { // Other errors from multer or middleware before it
            sendErrorResponse(res, 400, `File upload error: ${err.message}`);
          }
          return reject(err); // Reject the promise to stop further processing in the try block
        }

        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
          sendErrorResponse(res, 400, 'No files uploaded. Please upload one or more files with the field name "resumes".');
          return reject(new Error('No files uploaded.'));
        }
        const files = req.files;

        try {
          const processingPromises = files.map(async (file) => {
            const result = await processResumeFile(file);
            if (result.status === 'success' && currentUserId) {
              try {
                const auditDetails: z.infer<typeof CandidateCreateActionDetailsSchema> = {
                  candidateId: result.candidateId,
                  source: `resume_parse`, // Simplified source
                  fileName: file.originalname,
                };
                const parsedAuditDetails = CandidateCreateActionDetailsSchema.safeParse(auditDetails);
                if (parsedAuditDetails.success) {
                  await createAuditLog({
                    userId: currentUserId,
                    action: "CANDIDATE_CREATE",
                    entity: "Candidate",
                    entityId: result.candidateId,
                    details: parsedAuditDetails.data,
                  });
                } else {
                  console.warn("Failed to validate CANDIDATE_CREATE audit details:", parsedAuditDetails.error.flatten(), file.originalname);
                }
              } catch (auditError) {
                console.error("Error creating audit log for CANDIDATE_CREATE:", auditError, file.originalname);
              }
            }
            return result;
          });

          const results = await Promise.allSettled(processingPromises);

          const responsePayloadResults = results.map(settledResult => {
            if (settledResult.status === 'fulfilled') {
              return settledResult.value;
            } else {
              console.error("Unexpected error in Promise.allSettled for parse-resume:", settledResult.reason);
              const filename = (settledResult.reason as any)?.file || 'unknown_file';
              return { status: 'error', file: filename, message: 'Unhandled exception during processing.', errorDetail: settledResult.reason?.toString() } as ProcessResult;
            }
          });

          const apiResponseData: IParseResumeApiResponse = {
            message: 'Batch processing complete.',
            results: responsePayloadResults,
          };

          // Validate final response
          const finalValidation = ParseResumeApiResponseSchema.safeParse(apiResponseData);
          if (!finalValidation.success) {
            console.error("ParseResumeApiResponseSchema validation failed:", finalValidation.error.flatten());
            sendErrorResponse(res, 500, "Internal server error: Failed to construct valid API response.", finalValidation.error.flatten());
            return reject(new Error("Response validation failed"));
          }

          // Use 207 Multi-Status for batch operations where outcomes can vary
          // sendSuccessResponse uses res.status().json(), which is fine for 207 too.
          sendSuccessResponse(res, 207, finalValidation.data);
          resolve();

        } catch (processingError) {
            // Catch errors from inside the Promise.allSettled loop or subsequent logic
            console.error("Error during file processing logic:", processingError);
            sendErrorResponse(res, 500, "An error occurred during file processing.");
            reject(processingError);
        }
      });
    });
  } catch (error: any) {
    // This catch block will now primarily handle errors from the new Promise rejection,
    // or if getServerSession fails before the promise/upload is invoked.
    // Multer errors are handled inside the promise now.
    console.error("Outer error in parseResumeRouteLogic:", error);
    if (!res.headersSent) { // Ensure response isn't already sent by Multer error handling
        sendErrorResponse(res, 500, error.message || "An unexpected error occurred.");
    }
  }
}



const parseResumeRateLimiter = rateLimiter({
  windowSeconds: 15 * 60, // 15 minutes
  maxRequests: 5, // Max 5 overall requests (batches of files)
  keyPrefix: 'parse_resume',
});

const protectedParseResumeHandler = withRoleProtection(parseResumeRouteLogic, [Role.ADMIN, Role.RECRUITER]);

export default async function handler(
  req: NextApiRequest & { files?: Express.Multer.File[] }, // Ensure NextApiRequest is correctly typed for multer
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return sendErrorResponse(res, 405, `Method ${req.method} Not Allowed`);
  }

  try {
    await runMiddleware(req, res, parseResumeRateLimiter);
  } catch (error: any) {
    if (error.message.includes("Too Many Requests")) {
      console.warn(`Rate limit exceeded for parse-resume from IP: ${req.ip || req.headers['x-forwarded-for']}`);
    } else {
      console.error("Error in parse-resume rate limiting middleware:", error);
    }
    return; // Response already sent by rate limiter or error handler
  }

  // If rate limiter passes, proceed to the role-protected handler
  return protectedParseResumeHandler(req, res);
}


process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
