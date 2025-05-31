// people-gpt-champion/lib/schemas.ts
import { z } from 'zod';

// Schema for the request body of the search API
export const SearchApiRequestBodySchema = z.object({
  query: z.string().min(1, { message: "Query cannot be empty." }).max(500, { message: "Query is too long." }),
  weights: z.object({
    w_skill: z.number().min(0).max(1),
    w_experience: z.number().min(0).max(1),
    w_culture: z.number().min(0).max(1),
  }).refine(data => {
    const sum = data.w_skill + data.w_experience + data.w_culture;
    return sum >= 0.99 && sum <= 1.01;
  }, {
    message: "Weights must sum to approximately 1 (between 0.99 and 1.01).",
  }).optional(), // Making weights optional as per current API logic (defaults if not provided)
  // Add other potential request parameters here if any, e.g., user ID, filters not in query string
});

// Schema for score breakdown
export const ScoreBreakdownSchema = z.object({
  skill_match: z.number().min(0).max(1),
  experience_relevance: z.number().min(0).max(1),
  cultural_fit: z.number().min(0).max(1),
});

// Schema for Work Experience
export const WorkExperienceSchema = z.object({
  title: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(), // Consider z.date() if transformed, keep string for flexibility
  endDate: z.string().optional().nullable(),   // Consider z.date()
  description: z.string().optional().nullable(),
});

// Schema for Education
export const EducationSchema = z.object({
  school: z.string().optional().nullable(),
  degree: z.string().optional().nullable(),
  fieldOfStudy: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(), // Consider z.date()
});

// Schema for individual candidate in the response
// This should align with the Prisma schema and Task 4 definitions
export const CandidateSchema = z.object({
  id: z.string(),
  name: z.string().optional().nullable(), // Name can be null from DB if not enforced
  title: z.string().optional().nullable(), // Title can be null

  // Contact
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),

  // Professional Details
  skills: z.array(z.string()).optional().nullable(), // From Task 4, this is populated. Optional/nullable for safety.
  workExperience: z.array(WorkExperienceSchema).optional().nullable(),
  education: z.array(EducationSchema).optional().nullable(),
  certifications: z.array(z.string()).optional().nullable(),

  // Raw Data
  raw_resume_text: z.string().optional().nullable(),

  // Scoring fields from Task 5 & previous tasks
  match_score: z.number().min(0).max(1),
  skill_match: z.number().min(0).max(1),
  experience_relevance: z.number().min(0).max(1),
  cultural_fit: z.number().min(0).max(1),
  score_breakdown: ScoreBreakdownSchema,
  percentile_rank: z.number().min(0).max(100),
  reasoning: z.string().optional().nullable(), // Reasoning might not always be present

  // Source & Vector DB score
  source_url: z.string().url().or(z.literal('#')).optional().nullable(),
  pinecone_score: z.number().optional(), // Pinecone's original score
});

// Schema for the successful API response
export const SearchApiResponseSchema = z.object({
  candidates: z.array(CandidateSchema).optional(), // CandidateSchema is now exported
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

// Schema for the request body of the generate-outreach API
export const GenerateOutreachRequestBodySchema = z.object({
  template: z.enum(["intro", "job_opp", "follow_up"]),
  vars: z.record(z.string(), z.any()), // Allows any dynamic variables
  tone: z.string().min(1, { message: "Tone cannot be empty." }),
  channel: z.enum(["email", "slack"]),
  candidateId: z.string().cuid({ message: "Invalid Candidate ID format." }).optional(),
  outreachProfile: OutreachProfileResponseSchema.optional(), // Defined earlier
});

// Schema for the email response of the generate-outreach API
export const EmailOutreachResponseSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

// Schema for the Slack response of the generate-outreach API
export const SlackOutreachResponseSchema = z.object({
  message: z.string(),
});

// TypeScript types inferred from the new schemas
export type IGenerateOutreachRequestBody = z.infer<typeof GenerateOutreachRequestBodySchema>;
export type IEmailOutreachResponse = z.infer<typeof EmailOutreachResponseSchema>;
export type ISlackOutreachResponse = z.infer<typeof SlackOutreachResponseSchema>;

// Schema for the request body of the send-email API
export const SendEmailRequestBodySchema = z.object({
  to: z.string().email({ message: "Invalid 'to' email address (recipientEmail)." }),
  templateVersionId: z.string().cuid({ message: "Invalid Template Version ID." }),
  candidateId: z.string().cuid({ message: "Invalid Candidate ID format." }).optional(),
});

// Schema for the success response of the send-email API
export const SendEmailSuccessResponseSchema = z.object({
  success: z.literal(true),
  messageId: z.string(),
});

// TypeScript types inferred from the new email schemas
export type ISendEmailRequestBody = z.infer<typeof SendEmailRequestBodySchema>;
export type ISendEmailSuccessResponse = z.infer<typeof SendEmailSuccessResponseSchema>;

// Schema for the request body of the send-slack-message API
export const SendSlackMessageRequestBodySchema = z.object({
  userId: z.string().min(1, { message: "Slack User ID cannot be empty." }),
  message: z.string().min(1, { message: "Message cannot be empty." }),
  candidateId: z.string().cuid({ message: "Invalid Candidate ID format." }).optional(),
});

// Schema for the success response of the send-slack-message API
export const SendSlackMessageSuccessResponseSchema = z.object({
  success: z.literal(true),
  messageId: z.string(), // Slack's message timestamp (ts)
});

// TypeScript types inferred from the new Slack message schemas
export type ISendSlackMessageRequestBody = z.infer<typeof SendSlackMessageRequestBodySchema>;
export type ISendSlackMessageSuccessResponse = z.infer<typeof SendSlackMessageSuccessResponseSchema>;

// Schemas for Resend Webhook Payloads
// Base for common data, specific event types can extend this if needed.
const ResendWebhookBaseDataSchema = z.object({
  email_id: z.string().cuid2().optional(), // This is the Resend message ID. Optional as not all webhooks might have it.
  created_at: z.string().datetime(), // Timestamp of the event
});

// Specific event types from Resend documentation (ensure these match actual payloads)
// https://resend.com/docs/api-reference/webhooks/event-types
// For example: 'email.sent', 'email.delivered', 'email.opened', 'email.clicked', 'email.bounced', 'email.complained'
export const ResendWebhookEventSchema = z.object({
  type: z.enum([
    'email.sent',
    'email.delivered',
    'email.opened',
    'email.clicked',
    'email.bounced',
    'email.complained',
    // Add other event types as needed
  ]),
  data: z.object({ // Data structure can vary greatly per event type
    email_id: z.string({ message: "Resend message ID (email_id) is required." }), // Expecting this for relevant events
    created_at: z.string().datetime({ message: "Event timestamp (created_at) is required." }),
    // Include other fields from `data` object as needed, e.g.:
    // to: z.array(z.string().email()).optional(), // For sent/delivered
    // subject: z.string().optional(), // For sent/delivered
    // ip_address: z.string().optional(), // For opened/clicked
    // user_agent: z.string().optional(), // For opened/clicked
    // link: z.string().url().optional(), // For clicked
  }).passthrough(), // Allow other fields in `data` but don't validate them strictly yet
});

// TypeScript type for the Resend webhook event
export type IResendWebhookEvent = z.infer<typeof ResendWebhookEventSchema>;

// Schema for the request body of the send-sms API
export const SendSmsRequestBodySchema = z.object({
  to: z.string().regex(/^\+[1-9]\d{1,14}$/, { message: "Invalid 'to' phone number (must be E.164 format)." }),
  body: z.string().min(1, { message: "SMS body cannot be empty." }).max(1600, { message: "SMS body is too long." }), // Max 1600 chars for Twilio
  candidateId: z.string().cuid({ message: "Invalid Candidate ID format." }).optional(),
});

// Schema for the success response of the send-sms API
export const SendSmsSuccessResponseSchema = z.object({
  success: z.literal(true),
  messageSid: z.string(), // Twilio Message SID
});

// TypeScript types inferred from the new SMS schemas
export type ISendSmsRequestBody = z.infer<typeof SendSmsRequestBodySchema>;
export type ISendSmsSuccessResponse = z.infer<typeof SendSmsSuccessResponseSchema>;

// Schema for a single Email Template Version (for API responses)
export const EmailTemplateVersionApiResponseSchema = z.object({
  id: z.string().cuid(),
  templateId: z.string().cuid(),
  subject: z.string(),
  body: z.string(),
  versionNumber: z.number().int(),
  isArchived: z.boolean(),
  createdAt: z.string().datetime(), // Or z.date() if transformed
  updatedAt: z.string().datetime(), // Or z.date()
});

// Schema for a single Email Template including its versions (for API responses)
export const EmailTemplateApiResponseSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  createdAt: z.string().datetime(), // Or z.date()
  updatedAt: z.string().datetime(), // Or z.date()
  versions: z.array(EmailTemplateVersionApiResponseSchema),
});

// Schema for the response of the /api/email-templates route
export const EmailTemplatesApiResponseSchema = z.array(EmailTemplateApiResponseSchema);

// TypeScript types inferred from these schemas
export type IEmailTemplateVersionApiResponse = z.infer<typeof EmailTemplateVersionApiResponseSchema>;
export type IEmailTemplateApiResponse = z.infer<typeof EmailTemplateApiResponseSchema>;
export type IEmailTemplatesApiResponse = z.infer<typeof EmailTemplatesApiResponseSchema>;

// Schema for query parameters for /api/outreach-history
export const OutreachHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(10),
  // Add other filter parameters here if needed, e.g., channel, templateId, dateRange
});

// Schema for a single EmailOutreach record in the history response (including related data)
export const EmailOutreachHistoryItemSchema = z.object({
  id: z.string().cuid(),
  recipientEmail: z.string().email(),
  sentAt: z.string().datetime(), // Or z.date()
  resendMessageId: z.string(),
  status: z.string(),
  openedAt: z.string().datetime().nullable(), // Or z.date().nullable()
  clickedAt: z.string().datetime().nullable(), // Or z.date().nullable()
  templateVersion: z.object({
    id: z.string().cuid(),
    versionNumber: z.number().int(),
    subject: z.string(), // Include subject for display
    template: z.object({
      id: z.string().cuid(),
      name: z.string(), // Template name for display
    }),
  }),
});

// Schema for the response of the /api/outreach-history route
export const OutreachHistoryResponseSchema = z.object({
  data: z.array(EmailOutreachHistoryItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
});

// TypeScript types
export type IOutreachHistoryQuery = z.infer<typeof OutreachHistoryQuerySchema>;
export type IEmailOutreachHistoryItem = z.infer<typeof EmailOutreachHistoryItemSchema>;
export type IOutreachHistoryResponse = z.infer<typeof OutreachHistoryResponseSchema>;

// Schema for the /api/candidate/{id}/outreach-profile response
export const OutreachProfileResponseSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  headline: z.string().optional().nullable(), // e.g., current role or general title
  keySkills: z.array(z.string()).optional(),
  experienceSummary: z.string().optional().nullable(), // Brief textual summary
  educationSummary: z.string().optional().nullable(), // Brief textual summary
});

// TypeScript type inferred from the schema
export type IOutreachProfileResponse = z.infer<typeof OutreachProfileResponseSchema>;

// Zod Schemas for Audit Log details

// Details for user login events
export const LoginActionDetailsSchema = z.object({
  ipAddress: z.string().ip({ version: "v4", message: "Invalid IPv4 address" }).optional().nullable(),
  userAgent: z.string().optional().nullable(),
  // You could add `provider: z.string()` if you want to log the OAuth provider used
});
export type ILoginActionDetails = z.infer<typeof LoginActionDetailsSchema>;

// Details for candidate search events
export const CandidateSearchActionDetailsSchema = z.object({
  query: z.string(),
  filtersApplied: z.any().optional().nullable(), // Could be more specific if filters structure is known
  resultsCount: z.number().int().optional().nullable(),
  weightsUsed: z.object({
    w_skill: z.number().optional().nullable(),
    w_experience: z.number().optional().nullable(),
    w_culture: z.number().optional().nullable(),
  }).optional().nullable(),
});
export type ICandidateSearchActionDetails = z.infer<typeof CandidateSearchActionDetailsSchema>;

// Details for accessing an admin-specific route
export const AdminAccessActionDetailsSchema = z.object({
  route: z.string().startsWith('/', { message: "Route must start with /" }),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]).optional().nullable(),
});
export type IAdminAccessActionDetails = z.infer<typeof AdminAccessActionDetailsSchema>;

// General details schema for actions where only a simple message or note is needed
export const GenericActionDetailsSchema = z.object({
  note: z.string(),
  extraData: z.any().optional().nullable(),
});
export type IGenericActionDetails = z.infer<typeof GenericActionDetailsSchema>;

// Schemas for GDPR API Payloads

// Schema for a single AuditLog entry to be included in the user data export
const AuditLogExportEntrySchema = z.object({
  id: z.string().cuid(),
  createdAt: z.string().datetime(), // Or z.date() if transformed
  action: z.string(),
  details: z.any().optional().nullable(), // Keep as any/JSON for flexibility in export
  entity: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
});

// Schema for the user's own data in the export
const UserExportDataSchema = z.object({
  id: z.string().cuid(),
  email: z.string().email().optional().nullable(),
  name: z.string().optional().nullable(),
  role: z.string(), // Assuming role is always present for an exported user
  image: z.string().url().optional().nullable(),
  emailVerified: z.string().datetime().optional().nullable(), // Or z.date()
  // Add other fields from the User model that should be exported
});

// Schema for the overall structure of the exported user data
export const UserDataExportSchema = z.object({
  userData: UserExportDataSchema,
  auditLogs: z.array(AuditLogExportEntrySchema),
  // Potentially add other related data here, e.g.:
  // queriesMade: z.array(QueryExportEntrySchema),
});
export type IUserDataExport = z.infer<typeof UserDataExportSchema>;


// Schema for details in AuditLog when a GDPR action is performed
export const GdprActionDetailsSchema = z.object({
  targetUserId: z.string().cuid({ message: "Target User ID for GDPR action must be a CUID." }),
  actionType: z.enum(["USER_DATA_EXPORT_REQUEST", "USER_DATA_DELETION_REQUEST"]),
  // Requester info might be redundant if audit log captures acting user, but useful if system performs action
  requesterIpAddress: z.string().ip().optional().nullable(),
});
export type IGdprActionDetails = z.infer<typeof GdprActionDetailsSchema>;

// Schema for /api/health query parameters
export const HealthQuerySchema = z.object({
  quick: z.string().optional().transform(val => val === 'true' || val === '1'), // Coerce "true" or "1" to boolean
});
export type IHealthQuery = z.infer<typeof HealthQuerySchema>;

// Schema for /api/health response
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string().datetime(),
  checks: z.record(z.string(), z.object({
    status: z.string(),
    message: z.string().optional(),
    durationMs: z.number().optional(),
  })).optional().nullable(),
});
export type IHealthResponse = z.infer<typeof HealthResponseSchema>;

// Schema for path parameter validation (e.g., candidate ID)
export const CandidateIdParamSchema = z.object({
  id: z.string().cuid({ message: "Invalid Candidate ID format in path parameter." }),
});
export type ICandidateIdParam = z.infer<typeof CandidateIdParamSchema>;

// Generic error response schema for API routes (can be used with handleZodError)
export const ApiErrorResponseSchema = z.object({
  message: z.string(),
  errors: z.record(z.string(), z.array(z.string()).optional()).optional().nullable(), // For Zod flattened field errors
  details: z.any().optional().nullable(), // For other types of error details
});
export type IApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

// Audit Log Detail Schemas - New Additions
export const CandidateCreateActionDetailsSchema = z.object({
  candidateId: z.string().cuid({ message: "Candidate ID must be a CUID."}),
  source: z.string().optional().nullable(), // e.g., "resume_parse", "manual_entry"
  fileName: z.string().optional().nullable(), // Added fileName
});
export type ICandidateCreateActionDetails = z.infer<typeof CandidateCreateActionDetailsSchema>;

export const OutreachSentDetailsSchema = z.object({
  channel: z.enum(['email', 'sms', 'slack', 'linkedin']), // Add 'linkedin' or others as needed
  recipient: z.string(), // Email address, phone number, Slack User ID
  candidateId: z.string().cuid({ message: "Candidate ID must be a CUID."}).optional().nullable(),
  templateId: z.string().optional().nullable(), // e.g., EmailTemplateVersion ID
  messageId: z.string().optional().nullable(), // e.g., Resend ID, Twilio SID, Slack message_ts
});
export type IOutreachSentDetails = z.infer<typeof OutreachSentDetailsSchema>;

// Schema for individual file processing result in /api/parse-resume
const ResumeProcessResultSchema = z.union([
  z.object({
    status: z.literal('success'),
    file: z.string(),
    candidateId: z.string().cuid(),
    data: CandidateSchema, // Use the existing detailed CandidateSchema
  }),
  z.object({
    status: z.literal('error'),
    file: z.string(),
    message: z.string(),
    errorDetail: z.string().optional().nullable(),
  }),
]);
export type IResumeProcessResult = z.infer<typeof ResumeProcessResultSchema>;

// Schema for the overall response of /api/parse-resume
export const ParseResumeApiResponseSchema = z.object({
  message: z.string(),
  results: z.array(ResumeProcessResultSchema),
});
export type IParseResumeApiResponse = z.infer<typeof ParseResumeApiResponseSchema>;
