# Test Cases for GDPR API Endpoints

This document outlines test cases for the GDPR compliance API endpoints: `/api/gdpr/export` and `/api/gdpr/delete`. These tests are intended for manual verification.

## Notes for Tester:

*   Replace `{USER_ID}` with the actual ID of the user being tested.
*   Use tools like `curl`, Postman, or a similar API testing tool for making these requests.
*   Verify database changes by querying the database directly (e.g., using Prisma Studio or a SQL client).
*   Ensure you handle authentication correctly for the requests. This typically involves:
    *   Logging in as the target user via the application UI.
    *   Obtaining the session cookie (e.g., `next-auth.session-token` or similar, depending on the auth setup) from your browser's developer tools.
    *   Including this cookie in the headers of your API requests. For `curl`, this might look like `curl -H "Cookie: next-auth.session-token=YOUR_COOKIE_VALUE" ...`.

---

## Test Case 1: GDPR Data Export

*   **Endpoint:** `GET /api/gdpr/export`
*   **Description:** Verifies that a logged-in user can successfully export their data.
*   **Prerequisites:**
    *   User is logged in to the application.
    *   Tester has obtained the active session credentials (e.g., session cookie) for the authenticated user.

*   **Steps (Manual Simulation):**
    1.  Using an API testing tool, make a `GET` request to the `/api/gdpr/export` endpoint.
    2.  Include the authenticated user's session credentials (e.g., cookie) in the request headers.

*   **Expected Results:**
    *   **HTTP Status Code:** `200 OK`.
    *   **`Content-Type` Header:** Should be `application/json`.
    *   **`Content-Disposition` Header:** Should be `attachment; filename="user_data_export_{USER_ID}.json"` (where `{USER_ID}` is the actual ID of the user).
    *   **Response Body:** The response should be a JSON object containing the user's data. The structure should be similar to:
        ```json
        {
          "userData": {
            "id": "{USER_ID}",
            "email": "user@example.com",
            "name": "Test User",
            "role": "USER", // Or other role
            "image": null, // Or URL to image
            "emailVerified": null // Or timestamp
            // Any other fields from the User model that are included in the export
          },
          "auditLogs": [
            // An array of audit log objects associated with this user
            // Example:
            // {
            //   "id": "log_id",
            //   "action": "USER_LOGIN",
            //   "timestamp": "YYYY-MM-DDTHH:mm:ss.sssZ",
            //   "userId": "{USER_ID}",
            //   "details": { ... }
            // },
            // ... more logs
          ]
          // Potentially other related data as defined by the API endpoint's implementation
        }
        ```
    *   **Database Verification (Post-Request):**
        1.  Query the `AuditLog` table (or its equivalent).
        2.  Verify that a new audit log record has been created for this data export request.
        3.  The new audit log should have:
            *   `action`: `USER_DATA_EXPORT_REQUEST` (or the specific action string used by the application).
            *   `userId`: `{USER_ID}`.
            *   `details`: Optionally, details about the export if logged.

---

## Test Case 2: GDPR Data Deletion

*   **Endpoint:** `POST /api/gdpr/delete`
*   **Description:** Verifies that a logged-in user can successfully initiate the deletion of their data.
*   **Caution:** This is a destructive action. It is highly recommended to perform this test using a dedicated test user account that can be easily recreated or whose loss will not impact other testing activities.

*   **Prerequisites:**
    *   User (preferably a dedicated test user) is logged in to the application.
    *   Tester has obtained the active session credentials (e.g., session cookie) for the authenticated user.

*   **Steps (Manual Simulation):**
    1.  Using an API testing tool, make a `POST` request to the `/api/gdpr/delete` endpoint.
    2.  Include the authenticated user's session credentials (e.g., cookie) in the request headers.
    3.  The request body is typically empty for this type of POST request, unless the API specifically requires parameters.

*   **Expected Results:**
    *   **HTTP Status Code:** `200 OK`.
    *   **Response Body:** The response should be a JSON object confirming the initiation of the deletion process. The structure should be similar to:
        ```json
        {
          "message": "User data deletion process initiated successfully.",
          "userId": "{USER_ID}"
        }
        ```
    *   **Database Verification (Post-Request):**
        1.  **Audit Log (Pre-Deletion Record):**
            *   Query the `AuditLog` table.
            *   Verify that a new audit log record was created *before* the actual data deletion occurred.
            *   This log should have:
                *   `action`: `USER_DATA_DELETION_REQUEST` (or the specific action string).
                *   `userId`: `{USER_ID}` (the ID of the user *before* they were deleted).
        2.  **User Table:**
            *   Query the `User` table (or its equivalent).
            *   Verify that the record for the user with `id = {USER_ID}` has been deleted.
        3.  **Related Data (Cascading Deletes):**
            *   Query related tables such as `Account`, `Session` (or equivalents that link to the `User` table with foreign keys and cascading delete rules).
            *   Verify that records associated with `{USER_ID}` in these tables have also been deleted. This depends on the database schema's referential integrity rules (e.g., `onDelete: Cascade`).
        4.  **Audit Log (Post-Deletion Update - Anonymization):**
            *   Query the `AuditLog` table again.
            *   Verify that any audit log records that *previously* belonged to `{USER_ID}` now have their `userId` field set to `null` (or anonymized in another way as per the application's design). This is to maintain a record of actions while disassociating them from the deleted user.

---
