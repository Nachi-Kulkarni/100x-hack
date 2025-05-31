import type { NextApiRequest, NextApiResponse } from 'next';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { PrismaClient, Candidate } from '@prisma/client';
import { Buffer } from 'buffer';

import { chatCompletionBreaker, getEmbeddingBreaker } from '../../../lib/openai';
import { ParsedResumeSchema, IParsedResume } from '../../../lib/schemas';

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

    const newCandidate = await prisma.candidate.create({
      data: {
        name: validatedData.personal_info.name,
        email: validatedData.personal_info.email,
        phone: validatedData.personal_info.phone,
        address: validatedData.personal_info.address,
        linkedinUrl: validatedData.personal_info.linkedin_url,
        githubUrl: validatedData.personal_info.github_url,
        resumeText: rawResumeText,
        skills: validatedData.skills as any,
        workExperience: validatedData.work_experience as any,
        education: validatedData.education as any,
        certifications: validatedData.certifications as any,
        vectorEmbedding: embeddingBuffer,
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


export default async function handler(
  req: NextApiRequest & { files?: Express.Multer.File[] }, // Multer adds `files` property
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    upload(req as any, res as any, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'One or more files are too large.', error: `File size exceeds the limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB.` });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ message: `Too many files uploaded. Maximum is ${MAX_FILES_PER_REQUEST}. Ensure field name is 'resumes'.`});
        }
        return res.status(400).json({ message: 'File upload error.', error: err.message });
      } else if (err) {
        return res.status(400).json({ message: 'File upload error.', error: err.message });
      }

      const files = req.files;
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded. Please upload one or more files with the field name "resumes".' });
      }

      const processingPromises = files.map(file => processResumeFile(file));
      const results = await Promise.allSettled(processingPromises);

      const responsePayload = results.map(result => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          // Promise.allSettled should not lead here for errors within processResumeFile as it catches them.
          // This would be for unexpected errors in processResumeFile not returning a ProcessResult.
          console.error("Unexpected error in Promise.allSettled:", result.reason);
          // Attempt to get filename if possible, might not be available if error is early
          const filename = result.reason?.file || 'unknown_file';
          return { status: 'error', file: filename, message: 'Unhandled exception during processing.', errorDetail: result.reason?.toString() } as ProcessResult;
        }
      });

      // Use 207 Multi-Status for batch operations where outcomes can vary
      res.status(207).json({
        message: 'Batch processing complete.',
        results: responsePayload,
      });
    });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }
}

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
