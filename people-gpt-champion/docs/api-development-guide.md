# API Development Guide

This guide provides essential conventions and best practices for developing API routes in the People GPT Champion application. Adhering to these guidelines helps maintain consistency, robustness, and security.

## 1. Request Input Validation

All API routes **must** validate incoming request data. This includes:

-   **Query Parameters:** For `GET` requests or any route that accepts query parameters, `req.query` must be parsed and validated using an appropriate Zod schema.
-   **Path Parameters:** For dynamic routes (e.g., `/api/candidate/[id]`), path parameters (which are part of `req.query`) must be validated, typically for format and presence (e.g., ensuring an ID is a CUID).
-   **Request Body:** For `POST`, `PUT`, `PATCH` requests, `req.body` must be parsed and validated using an appropriate Zod schema.
    -   For `application/json` content types, parse `req.body` directly.
    -   For `multipart/form-data` (e.g., file uploads in `pages/api/parse-resume.ts`), Zod validation should be applied to the structured data extracted *after* initial parsing by libraries like `multer`.

**Implementation:**
-   Use the `safeParse` method from Zod for validation.
-   If validation fails (`!result.success`), use the `handleZodError(result.error, res)` utility from `lib/apiUtils.ts` to send a standardized 400 Bad Request response with structured error details. This function automatically calls `res.status(400).json(...)`.

```typescript
// Example: Body Validation
import { SomeRequestBodySchema } from '../../lib/schemas';
import { handleZodError, sendErrorResponse, sendSuccessResponse } from '../../lib/apiUtils';
import { ZodError } from 'zod';

// ...
try {
  const validationResult = SomeRequestBodySchema.safeParse(req.body);
  if (!validationResult.success) {
    throw validationResult.error; // Will be caught by ZodError instance check
  }
  const { validatedData } = validationResult.data;
  // ... proceed with validatedData
} catch (error: any) {
  if (error instanceof ZodError) {
    return handleZodError(error, res);
  }
  // ... other error handling
  return sendErrorResponse(res, 500, 'An unexpected error occurred.');
}
```

## 2. Response Handling

Standardized response handlers should be used for consistency in API responses. These are available in `lib/apiUtils.ts`.

-   **Successful Responses:**
    -   Use `sendSuccessResponse(res: NextApiResponse, statusCode: number, data: T)` for all successful responses.
    -   The `data` object provided should conform to a pre-defined Zod schema that describes the structure of the API response (e.g., `SomeApiResponseSchema`).
    -   While direct parsing of the outgoing `data` with its Zod schema (e.g., `SomeApiResponseSchema.parse(responseData)`) before sending is not strictly enforced at runtime in all routes (to avoid performance overhead of double serialization for complex objects), the type `T` of the `data` argument **must** be compatible with `z.infer<typeof SomeApiResponseSchema>`. It is highly recommended to perform a `safeParse` on the response data during development or if the data construction is complex to ensure adherence to the contract.

-   **Error Responses:**
    -   **Zod Validation Errors:** Handled by `handleZodError` as described above.
    -   **Other Server-Side Errors:** Use `sendErrorResponse(res: NextApiResponse, statusCode: number, message: string, details?: any)` for all other types of errors (e.g., database errors, external service failures, unexpected exceptions). This ensures a consistent error response format.

```typescript
// Example: Success Response
// const responseData: IMySuccessResponse = { /* ... data conforming to MySuccessResponseSchema ... */ };
// return sendSuccessResponse(res, 200, responseData);

// Example: General Error Response
// return sendErrorResponse(res, 500, "Failed to connect to external service.");
```

## 3. Security Considerations

-   **Authentication & Authorization (RBAC):** Secure endpoints using NextAuth.js for session management and the `withRoleProtection` higher-order function for role-based access control. Refer to `lib/authUtils.ts`.
-   **Rate Limiting:** Apply rate limiting to sensitive or resource-intensive endpoints using the `rateLimiter` middleware from `lib/rateLimit.ts`.
-   **Data Encryption:** Follow guidelines in `docs/data-encryption.md` for handling sensitive fields.

By following these practices, we can build more reliable, secure, and maintainable API endpoints.
