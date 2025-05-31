# GDPR Compliance Features

This document outlines the features implemented in the People GPT Champion application to support General Data Protection Regulation (GDPR) compliance, specifically focusing on the rights of access and erasure (right to be forgotten).

## 1. Data Export (Right of Access)

Users have the right to request a copy of their personal data processed by the application.

-   **API Endpoint:** `GET /api/gdpr/export`
-   **Authentication:** Required. The endpoint only allows an authenticated user to export their *own* data.
-   **Process:**
    1.  User makes an authenticated GET request to the endpoint.
    2.  The system retrieves the user's ID from their active session.
    3.  An audit log entry is created for the data export request (`USER_DATA_EXPORT_REQUEST`).
    4.  The system fetches the user's details from the `User` table and all associated `AuditLog` entries.
-   **Exported Data Fields:**
    *   **From `User` model:**
        *   `id`
        *   `name`
        *   `email`
        *   `emailVerified` (timestamp of email verification)
        *   `image` (URL of profile image)
        *   `role` (assigned user role, e.g., USER, RECRUITER, ADMIN)
        *   `createdAt` (timestamp of account creation - *Note: This field is not explicitly on the NextAuth User model by default, but Prisma models often have it. Assuming it's available.*)
        *   `updatedAt` (timestamp of last account update - *Note: Similar to createdAt.*)
    *   **From `AuditLog` model (associated with the user):**
        *   `id`
        *   `createdAt` (timestamp of the audit log event)
        *   `action` (type of action performed)
        *   `details` (JSON object with action-specific details)
        *   `entity` (type of entity related to the action, if any)
        *   `entityId` (ID of the entity instance, if any)
-   **Format:** The data is returned as a single JSON object. The API sets the `Content-Disposition` header to `attachment; filename="user_data_export_{userId}.json"` to suggest a file download to the client.
-   **PII Coverage:** The exported data includes all directly identifying information stored about the user's account and a comprehensive log of actions they have performed or that have affected their account directly, as recorded in the audit logs.

## 2. Data Deletion (Right to Erasure / Right to be Forgotten)

Users have the right to request the deletion of their personal data.

-   **API Endpoint:** `POST /api/gdpr/delete`
-   **Authentication:** Required. The endpoint only allows an authenticated user to request the deletion of their *own* account and associated data.
-   **User Identity Verification:** User identity is verified by requiring an active authenticated session. The deletion operation is performed on the `User` record associated with the `userId` from the authenticated session token.
-   **Deletion Process:**
    1.  User makes an authenticated POST request to the endpoint.
    2.  The system retrieves the user's ID from their active session.
    3.  An audit log entry is created *before* deletion occurs, recording the deletion request (`USER_DATA_DELETION_REQUEST`).
    4.  The following operations are performed within a database transaction (Prisma `prisma.$transaction`) to ensure atomicity:
        *   **Anonymization of `AuditLog` Entries:** For all `AuditLog` records where the `userId` matches the requesting user, the `userId` field is updated to `null`. The audit log entries themselves are retained for system integrity, security auditing, and to maintain a record of past events without direct attribution to the deleted user.
        *   **Deletion of `User` Record:** The user's record is permanently deleted from the `User` table.
        *   **Associated NextAuth.js Data:** Records in the `Account` and `Session` tables (used by NextAuth.js for OAuth account linking and session management) that are related to the deleted `User` are expected to be handled by Prisma's cascade deletion rules. The standard NextAuth.js Prisma adapter schema typically defines these relations with `onDelete: Cascade`.
-   **Associated Data (User-Generated Content - Out of Scope for Self-Serve Deletion):**
    *   Data that may have been created *by* the user but is not directly *part of* their user account (e.g., `Candidate` records they uploaded if they are a Recruiter, `EmailOutreach` history they initiated, `Query` records they created) is **not automatically deleted or anonymized** by this self-serve deletion process.
    *   Properly handling such associated data requires more complex business logic, such as deciding on reassigning ownership, determining if the data should be deleted based on its nature (e.g., if it's company data vs. personal data), or anonymizing a `creatorId` field if one exists on those models. These actions are considered **out of scope** for the current GDPR self-serve deletion feature and would typically require administrative intervention or more specific feature development.
    *   If a user's PII is part of a `Candidate` record they created (e.g., a Recruiter adding themselves as a test candidate), they would need to manage that `Candidate` data separately or request its deletion through other administrative means if such become available.
-   **Confirmation/Notification:**
    *   The API provides an immediate JSON response indicating the success or failure of the deletion attempt (e.g., `{"message": "User data deletion process initiated successfully."}`).
    *   Further confirmation mechanisms (e.g., an email notification to the user confirming deletion) are **out of scope** for the current implementation.

This GDPR compliance feature set aims to provide users with control over their personal data in line with regulatory requirements. Further enhancements may be developed as needed.
