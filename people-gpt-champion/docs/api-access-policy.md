# API Access Policy

This document outlines the access control policies for various API endpoints within the People GPT Champion application, primarily based on user roles.

## User Roles

-   **USER**: Basic authenticated user. (Currently, this role has limited direct API access, primarily for GDPR actions on their own data).
-   **RECRUITER**: Users involved in recruitment activities. Can access most candidate and outreach-related APIs.
-   **ADMIN**: Administrators with full access to all APIs, including user management and system settings (if those were implemented).

## API Endpoint Protection

The following table details the protection status and required roles for key API endpoints. Access to all protected routes requires a valid authentication session.

| API Endpoint                               | Method | Required Role(s)        | Notes                                                                 |
| :----------------------------------------- | :----- | :---------------------- | :-------------------------------------------------------------------- |
| `/api/auth/initiate-signin`                | GET/POST| Public (Rate Limited)   | Conceptual endpoint for initiating sign-in.                         |
| `/api/auth/[...nextauth]`                  | ANY    | N/A (NextAuth handled)  | Authentication managed by NextAuth.js.                                |
| `/api/admin-only`                          | GET    | `ADMIN`                 | Specific endpoint for admin-only functions.                         |
| `/api/candidate/{id}/outreach-profile`     | GET    | `ADMIN`, `RECRUITER`    | Access candidate summary for outreach.                                |
| `/api/email-templates`                     | GET    | `ADMIN`, `RECRUITER`    | List available email templates.                                       |
| `/api/generate-outreach`                   | POST   | `ADMIN`, `RECRUITER`    | Generate outreach messages (Rate Limited).                            |
| `/api/gdpr/delete`                         | POST   | Authenticated User (Own Data) | User can delete their own data.                                   |
| `/api/gdpr/export`                         | GET    | Authenticated User (Own Data) | User can export their own data.                                     |
| `/api/health`                              | GET    | Public                  | System health check.                                                  |
| `/api/outreach-history`                    | GET    | `ADMIN`, `RECRUITER`    | View outreach history.                                                |
| `/api/parse-resume`                        | POST   | `ADMIN`, `RECRUITER`    | Upload and parse resumes.                                             |
| `/api/resend-webhook`                      | POST   | N/A (Webhook Security)  | Secured by Resend webhook signature (implementation pending/verified separately). |
| `/api/search`                              | POST   | `ADMIN`, `RECRUITER`    | Search for candidates (Rate Limited).                                 |
| `/api/send-email`                          | POST   | `ADMIN`, `RECRUITER`    | Send emails to candidates.                                            |
| `/api/send-slack-message`                  | POST   | `ADMIN`, `RECRUITER`    | Send Slack messages.                                                  |
| `/api/send-sms`                            | POST   | `ADMIN`, `RECRUITER`    | Send SMS messages (Feature Flagged).                                  |

## Notes on Protection Mechanisms

-   **Role-Based Access Control (RBAC):** Implemented using the `withRoleProtection` higher-order function, which checks the authenticated user's session and role against the required roles for the endpoint.
-   **Authentication:** Most routes (except purely public ones or webhooks) require a valid session token, handled by `getServerSession` from NextAuth.js.
-   **Rate Limiting:** Applied to resource-intensive or sensitive publicly accessible endpoints (e.g., `initiate-signin`, `search`, `generate-outreach`) to prevent abuse.
-   **Webhook Security:** Webhook endpoints like `/api/resend-webhook` should be secured using signature verification specific to the webhook provider.
-   **GDPR Routes:** These routes have specific logic to ensure users can only access or request deletion of their *own* data, based on their authenticated session.

This policy is subject to review and updates as the application evolves.

## Role Assignment

-   Currently, new users who sign up via Google or GitHub are assigned the default role of `USER` upon account creation in the database.
-   The `role` field on the `User` model in `prisma/schema.prisma` defaults to `USER`.
-   Mechanisms for administrators to change user roles (e.g., promoting a `USER` to a `RECRUITER` or `ADMIN`) are not part of the current application features. This would require a separate admin interface and API endpoints, which can be considered for future development.
