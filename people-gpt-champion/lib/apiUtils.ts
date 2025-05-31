import { ZodError } from 'zod';
import type { NextApiResponse } from 'next';
import type { IApiErrorResponse } from './schemas'; // Assuming IApiErrorResponse is exported from schemas.ts

/**
 * Handles ZodError instances and sends a standardized 400 Bad Request response.
 *
 * @param error The ZodError instance.
 * @param res The NextApiResponse object to send the response.
 * @returns A NextApiResponse object with the error details.
 */
export function handleZodError(
  error: ZodError,
  res: NextApiResponse<IApiErrorResponse> // Type the response with the schema
): void {
  const responsePayload: IApiErrorResponse = {
    message: 'Validation failed. Please check your input.',
    errors: error.flatten().fieldErrors as { [key: string]: string[] }, // Ensure type compatibility
  };
  res.status(400).json(responsePayload);
}

/**
 * Sends a generic error response.
 *
 * @param res The NextApiResponse object.
 * @param statusCode The HTTP status code for the error.
 * @param message The primary error message.
 * @param details Optional additional details or structured error information.
 */
export function sendErrorResponse(
  res: NextApiResponse<IApiErrorResponse>,
  statusCode: number,
  message: string,
  details?: any
): void {
  const responsePayload: IApiErrorResponse = {
    message,
    details,
  };
  res.status(statusCode).json(responsePayload);
}

/**
 * Sends a success response.
 *
 * @param res The NextApiResponse object.
 * @param statusCode The HTTP status code for success (usually 200 or 201).
 * @param data The data to be sent in the response body.
 */
export function sendSuccessResponse<T>(
  res: NextApiResponse<T>,
  statusCode: number,
  data: T
): void {
  res.status(statusCode).json(data);
}
