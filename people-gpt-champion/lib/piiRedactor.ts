import { Candidate } from '@prisma/client'; // Assuming Candidate type is available

// Define a type for the data we expect, which might be a partial Candidate or a specific interface
interface CandidatePIIData {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  // Include other fields that might be present and should be passed through
  [key: string]: any;
}

// A more specific type for the returned object if we want to ensure PII fields are strings
interface RedactedCandidate extends Omit<CandidatePIIData, 'email' | 'phone' | 'address'> {
  email?: string;
  phone?: string;
  address?: string;
}

const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Redacts PII fields (email, phone, address) from a candidate object.
 * @param candidate The candidate data object.
 * @returns A new candidate object with PII fields redacted.
 */
export function redactCandidatePII(candidate: CandidatePIIData): RedactedCandidate {
  const redactedCandidate = { ...candidate };

  if (redactedCandidate.email) {
    redactedCandidate.email = REDACTED_PLACEHOLDER;
  }
  if (redactedCandidate.phone) {
    redactedCandidate.phone = REDACTED_PLACEHOLDER;
  }
  if (redactedCandidate.address) {
    redactedCandidate.address = REDACTED_PLACEHOLDER;
  }

  return redactedCandidate;
}

/**
 * More sophisticated email redaction (example - replace username part).
 * This is an alternative that could be used if needed.
 */
export function redactEmailAdvanced(email: string | null | undefined): string {
  if (!email) return REDACTED_PLACEHOLDER;
  const parts = email.split('@');
  if (parts.length === 2) {
    return `${REDACTED_PLACEHOLDER}@${parts[1]}`;
  }
  return REDACTED_PLACEHOLDER;
}
