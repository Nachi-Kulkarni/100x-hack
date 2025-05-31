// people-gpt-champion/lib/schemas.ts
import { z } from 'zod';

// Schema for the request body of the search API
export const SearchApiRequestBodySchema = z.object({
  query: z.string().min(1, { message: "Query cannot be empty." }).max(500, { message: "Query is too long." }),
  // Add other potential request parameters here if any, e.g., user ID, filters not in query string
});

// Schema for individual candidate in the response
const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  skills: z.array(z.string()),
  match_score: z.number().min(0).max(1),
  reasoning: z.string(),
  source_url: z.string().url().or(z.literal('#')), // URL or a placeholder '#'
  pinecone_score: z.number().optional(), // Pinecone's original score
});

// Schema for the successful API response
export const SearchApiResponseSchema = z.object({
  candidates: z.array(CandidateSchema).optional(),
  parsedQuery: z.object({
    keywords: z.array(z.string()),
    location: z.string().optional(),
    skills: z.array(z.string()).optional(),
  }).optional(),
  message: z.string().optional(), // For messages like "No candidates found"
});

// Schema for error responses (optional but good practice)
export const ErrorResponseSchema = z.object({
  error: z.string(),
  parsedQuery: z.undefined().optional(), // Ensure parsedQuery is not present in error responses
});

// Schemas for validating the JSON structure from OpenAI resume parsing
export const PersonalInfoSchema = z.object({
  name: z.string().min(1, { message: "Name cannot be empty" }),
  email: z.string().email({ message: "Invalid email format" }),
  phone: z.string().optional().nullable(), // .nullable() allows for explicit nulls from OpenAI
  linkedin_url: z.string().url({ message: "Invalid LinkedIn URL format" }).optional().nullable(),
  github_url: z.string().url({ message: "Invalid GitHub URL format" }).optional().nullable(),
  address: z.string().optional().nullable(),
});

export const WorkExperienceSchema = z.object({
  job_title: z.string().min(1, { message: "Job title cannot be empty" }),
  company: z.string().min(1, { message: "Company name cannot be empty" }),
  location: z.string().optional().nullable(),
  start_date: z.string().min(1, { message: "Start date cannot be empty" }),
  end_date: z.string().min(1, { message: "End date cannot be empty (or 'Present')" }),
  responsibilities: z.array(z.string()).optional().nullable(),
});

export const EducationSchema = z.object({
  degree: z.string().min(1, { message: "Degree cannot be empty" }),
  institution: z.string().min(1, { message: "Institution name cannot be empty" }),
  graduation_date: z.string().min(1, { message: "Graduation date cannot be empty" }),
  gpa: z.string().optional().nullable(),
});

export const CertificationSchema = z.object({
  name: z.string().min(1, { message: "Certification name cannot be empty" }),
  issuing_organization: z.string().min(1, { message: "Issuing organization cannot be empty" }),
  date_obtained: z.string().optional().nullable(),
});

export const ParsedResumeSchema = z.object({
  personal_info: PersonalInfoSchema,
  work_experience: z.array(WorkExperienceSchema),
  education: z.array(EducationSchema),
  skills: z.array(z.string()),
  certifications: z.array(CertificationSchema).optional().nullable(),
});

// Example of how to infer TypeScript types from Zod schemas if needed elsewhere
export type IPersonalInfo = z.infer<typeof PersonalInfoSchema>;
export type IWorkExperience = z.infer<typeof WorkExperienceSchema>;
export type IEducation = z.infer<typeof EducationSchema>;
export type ICertification = z.infer<typeof CertificationSchema>;
export type IParsedResume = z.infer<typeof ParsedResumeSchema>;
