# Audit Log Details Documentation

This document provides details on the structured information stored in the `details` JSON field of `AuditLog` records for specific actions. Understanding these details can be crucial for monitoring, debugging, and compliance.

## Common Audit Log Fields

Each audit log entry typically contains:

-   `id`: Unique identifier for the log entry.
-   `createdAt`: Timestamp of when the log entry was created.
-   `userId`: Identifier of the user who performed the action (nullable if system action or unauthenticated).
-   `action`: A string code representing the type of action performed (e.g., "USER_LOGIN", "CANDIDATE_SEARCH").
-   `entity`: (Optional) The type of entity involved (e.g., "Candidate", "User").
-   `entityId`: (Optional) The unique identifier of the specific entity instance.
-   `details`: A JSON object containing action-specific information.

## Action-Specific Details

Below are the details for commonly logged actions:

### 1. `USER_LOGIN`

-   **Description**: Logged when a user successfully signs into the application.
-   **Zod Schema**: `LoginActionDetailsSchema`
-   **Typical `details` fields**:
    -   `provider` (string, optional): The OAuth provider used for sign-in (e.g., "google", "github"). This is captured from the NextAuth.js `account` object during the `signIn` event.
    -   `ipAddress` (string, IP v4, optional, nullable): The IP address of the user, if captured. *Note: Capturing IP addresses accurately can be complex due to proxies and requires careful handling under privacy regulations. This is not robustly implemented in the NextAuth `signIn` event handler currently.*
    -   `userAgent` (string, optional, nullable): The user agent string from the client's browser, if captured. *Note: Similar to IP address, this is not robustly implemented in the NextAuth `signIn` event handler currently.*

### 2. `CANDIDATE_SEARCH`

-   **Description**: Logged when a user performs a candidate search.
-   **Zod Schema**: `CandidateSearchActionDetailsSchema`
-   **Typical `details` fields**:
    -   `query` (string): The raw search query string entered by the user.
    -   `filtersApplied` (any, optional, nullable): Any filters applied to the search (e.g., location, specific skills not in the main query string). The structure of this object can vary based on the filter implementation. Currently, this is often logged as `null` as advanced filter objects are not deeply integrated into the search logging.
    -   `resultsCount` (integer, optional, nullable): The number of candidate results returned by the search.
    -   `weightsUsed` (object, optional, nullable): The scoring weights applied to the search, if applicable.
        -   `w_skill` (number, optional, nullable)
        -   `w_experience` (number, optional, nullable)
        -   `w_culture` (number, optional, nullable)

### 3. `USER_DATA_EXPORT_REQUEST`

-   **Description**: Logged when a user requests an export of their own data (GDPR compliance).
-   **Zod Schema**: `GdprActionDetailsSchema` (filtered for this action type)
-   **Typical `details` fields**:
    -   `targetUserId` (string, CUID): The ID of the user whose data was requested for export. This will be the same as the `userId` performing the action.
    *   `actionType` (enum string): Will be `"USER_DATA_EXPORT_REQUEST"`.
    -   `requesterIpAddress` (string, IP, optional, nullable): The IP address of the user making the export request, if captured. *Note: IP capture is not robustly implemented.*

### 4. `CANDIDATE_CREATE`

-   **Description**: Logged when a new candidate profile is created in the system.
-   **Zod Schema**: `CandidateCreateActionDetailsSchema`
-   **Typical `details` fields**:
    -   `candidateId` (string, CUID): The ID of the newly created candidate.
    -   `source` (string, optional, nullable): The source from which the candidate was created (e.g., "resume_parse:cv_filename.pdf", "manual_entry").

### 5. `OUTREACH_SENT`

-   **Description**: Logged when an outreach message (email, SMS, Slack) is sent.
-   **Zod Schema**: `OutreachSentDetailsSchema`
-   **Typical `details` fields**:
    -   `channel` (enum string): The channel used for outreach (e.g., "email", "sms", "slack").
    -   `recipient` (string): The identifier of the recipient (e.g., email address, phone number, Slack User ID).
    -   `candidateId` (string, CUID, optional, nullable): The ID of the candidate the outreach was for, if applicable.
    -   `templateId` (string, optional, nullable): The ID of the template used (e.g., `EmailTemplateVersion` ID for emails).
    -   `messageId` (string, optional, nullable): The unique identifier of the message from the sending service (e.g., Resend ID for emails, Twilio Message SID for SMS, Slack message timestamp `ts`).

---

This documentation should be kept up-to-date as new auditable actions are added or the details captured for existing actions evolve. Accurate and detailed audit logs are essential for security, compliance, and operational insights.
