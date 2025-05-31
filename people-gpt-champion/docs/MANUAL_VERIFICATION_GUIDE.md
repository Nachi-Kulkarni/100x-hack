# Manual Verification Guide

This document outlines the manual verification steps required for several key features of the People GPT Champion application. These tests typically require interaction with a running instance of the application, access to external services (like Sentry), and potentially direct database inspection.

## 1. Sentry Error Reporting Verification

**Objective:** Ensure client-side errors are correctly reported to the configured Sentry dashboard.

**Prerequisites:**
- The application must be running.
- The Sentry DSN must be correctly configured in `sentry.client.config.ts`, `sentry.edge.config.ts`, and `sentry.server.config.ts`. (The AI has set this to the DSN provided by the user: `https://ace9c7e365d7b7a23b5c9bafe459409a@o4509419049254912.ingest.us.sentry.io/4509419052597248`).
- Access to the Sentry dashboard associated with the DSN.

**Steps:**
1.  Navigate to the main page of the application (`/`).
2.  Locate and click the "Throw Client-Side Test Error" button (found in the "Sentry Test Area" on `app/page.tsx`).
3.  Open your Sentry dashboard.
4.  Verify that a new error event, corresponding to the "Sentry Test Error - Client Side - ..." message, appears in the dashboard. Check the details of the error in Sentry (stack trace, tags, etc.).

**Expected Result:** The test error is captured and displayed correctly in the Sentry dashboard.

## 2. Authentication and RBAC Testing

**Objective:** Verify user login via different providers and ensure Role-Based Access Control (RBAC) restricts API access and influences UI elements correctly.

**Prerequisites:**
- Application is running.
- OAuth credentials for Google and GitHub are correctly configured in environment variables (e.g., `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_ID`, `GITHUB_SECRET`).
- Test user accounts with different roles (e.g., `ADMIN`, `RECRUITER`, `USER`) available or creatable in the database.

**2.1. Test User Logins:**
1.  Navigate to the application's login interface.
2.  Attempt to log in using the "Sign in with Google" button. Complete the Google authentication flow.
    *   **Expected:** Successful login, redirection to the application, user session created.
3.  Log out.
4.  Attempt to log in using the "Sign in with GitHub" button. Complete the GitHub authentication flow.
    *   **Expected:** Successful login, redirection to the application, user session created.

**2.2. Test API Access Restriction (`/api/admin-only`):**
1.  **With Non-Admin Role (e.g., `USER` or `RECRUITER`):**
    *   Log in as a user who does NOT have the `ADMIN` role.
    *   Attempt to access the `/api/admin-only` endpoint (e.g., using `curl` with the session cookie, or by typing the URL into a browser if it were a GET request, though it might be POST/PUT etc.).
    *   **Expected:** HTTP 403 Forbidden error.
2.  **With Admin Role:**
    *   Log in as a user who HAS the `ADMIN` role.
    *   Attempt to access the `/api/admin-only` endpoint.
    *   **Expected:** HTTP 200 OK success response. An audit log for `ADMIN_ACCESS` should also be created.

**2.3. Test UI Elements Based on Role (on `app/page.tsx`):**
1.  **As Unauthenticated User:**
    *   Navigate to the main page (`/`).
    *   **Expected:** "Admin Controls" section, resume upload, "Access Candidate Database", and "Perform Advanced Action" buttons should be hidden or disabled as per their logic. Sign-in button should be visible.
2.  **As `USER` Role:**
    *   Log in as a `USER`. Navigate to `/`.
    *   **Expected:** "Admin Controls" and resume upload hidden. "Perform Advanced Action" button disabled. Other elements visible/enabled as appropriate for a basic user.
3.  **As `RECRUITER` Role:**
    *   Log in as a `RECRUITER`. Navigate to `/`.
    *   **Expected:** "Admin Controls" and resume upload hidden. "Initiate Outreach" button might be disabled (as per example logic in `app/page.tsx`). "Access Candidate Database" and "Perform Advanced Action" should be enabled/visible.
4.  **As `ADMIN` Role:**
    *   Log in as an `ADMIN`. Navigate to `/`.
    *   **Expected:** "Admin Controls" section and resume upload functionality are visible and operational. All relevant buttons like "Initiate Outreach", "Access Candidate Database", "Perform Advanced Action" are enabled.

## 3. GDPR API Endpoint Testing

**Objective:** Verify the functionality of GDPR data export and deletion APIs.

**(These test cases are also detailed in `people-gpt-champion/docs/GDPR_API_Test_Cases.md`)**

**3.1. Test GDPR Data Export (`GET /api/gdpr/export`)**
*   **Prerequisites:**
    *   User is logged in.
    *   Obtain session credentials (e.g., cookie) for the authenticated user.
*   **Steps:**
    1.  Make a GET request to `/api/gdpr/export` with the user's session credentials (e.g., using `curl` or Postman).
*   **Expected Results:**
    *   HTTP Status Code: 200 OK.
    *   `Content-Type` Header: `application/json`.
    *   `Content-Disposition` Header: `attachment; filename="user_data_export_{USER_ID}.json"`.
    *   Response Body: A JSON object containing `userData` (for the logged-in user) and their `auditLogs`.
    *   Database: A new `USER_DATA_EXPORT_REQUEST` record in the `AuditLog` table.

**3.2. Test GDPR Data Deletion (`POST /api/gdpr/delete`)**
*   **Prerequisites:**
    *   User is logged in (preferably a dedicated test user for this destructive action).
    *   Obtain session credentials.
*   **Steps:**
    1.  Make a POST request to `/api/gdpr/delete` with the user's session credentials.
*   **Expected Results:**
    *   HTTP Status Code: 200 OK.
    *   Response Body: JSON `{ "message": "User data deletion process initiated successfully.", "userId": "{USER_ID}" }`.
    *   Database:
        1.  A new `USER_DATA_DELETION_REQUEST` record in `AuditLog` (created *before* deletion).
        2.  The `User` record for `{USER_ID}` is deleted.
        3.  Related `Account` and `Session` records are deleted (due to schema cascades).
        4.  In `AuditLog`, records previously associated with `{USER_ID}` now have `userId` as `null`.

---
Remember to replace placeholders like `{USER_ID}` with actual data during testing.
```
