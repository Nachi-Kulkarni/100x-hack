import { redactCandidatePII } from '../piiRedactor'; // Adjust path as necessary

// Define a type for the test candidate data, similar to CandidatePIIData
interface TestCandidate {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null; // An extra field to ensure it's preserved
  skills?: string[];
}

const REDACTED_PLACEHOLDER = '[REDACTED]';

describe('redactCandidatePII', () => {
  it('should redact email, phone, and address fields', () => {
    const candidate: TestCandidate = {
      id: '123',
      name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '123-456-7890',
      address: '123 Main St, Anytown, USA',
      notes: 'Sensitive notes here.',
      skills: ['ts', 'react']
    };
    const redacted = redactCandidatePII(candidate);
    expect(redacted.email).toBe(REDACTED_PLACEHOLDER);
    expect(redacted.phone).toBe(REDACTED_PLACEHOLDER);
    expect(redacted.address).toBe(REDACTED_PLACEHOLDER);
  });

  it('should not modify other fields', () => {
    const candidate: TestCandidate = {
      id: '123',
      name: 'Jane Doe',
      email: 'jane.doe@example.com',
      notes: 'Important information.',
      skills: ['jest', 'testing']
    };
    const redacted = redactCandidatePII(candidate);
    expect(redacted.id).toBe('123');
    expect(redacted.name).toBe('Jane Doe');
    expect(redacted.notes).toBe('Important information.');
    expect(redacted.skills).toEqual(['jest', 'testing']);
  });

  it('should handle null or undefined PII fields gracefully', () => {
    const candidate: TestCandidate = {
      id: '456',
      name: 'Jim Beam',
      email: null,
      phone: undefined,
      address: 'Some Address', // Will be redacted
      notes: 'No PII in email/phone',
    };
    const redacted = redactCandidatePII(candidate);
    expect(redacted.email).toBeNull(); // Or REDACTED_PLACEHOLDER if we decide to change null to placeholder
    expect(redacted.phone).toBeUndefined(); // Or REDACTED_PLACEHOLDER
    expect(redacted.address).toBe(REDACTED_PLACEHOLDER);
    expect(redacted.name).toBe('Jim Beam');
  });

  it('should handle empty string PII fields', () => {
    const candidate: TestCandidate = {
      id: '789',
      name: 'Jack Daniels',
      email: '',
      phone: '',
      address: '',
      notes: 'Empty PII strings',
    };
    const redacted = redactCandidatePII(candidate);
    // Current implementation replaces non-empty strings. Empty strings are falsy.
    // If empty strings should also become "[REDACTED]", the function needs adjustment.
    // Based on `if (redactedCandidate.email)` etc., empty strings will NOT be replaced.
    expect(redacted.email).toBe('');
    expect(redacted.phone).toBe('');
    expect(redacted.address).toBe('');
  });


  it('should return a new object (immutability)', () => {
    const candidate: TestCandidate = {
      id: '123',
      name: 'Original Name',
      email: 'original@example.com',
    };
    const redacted = redactCandidatePII(candidate);
    expect(redacted).not.toBe(candidate); // Should be a new object instance
    expect(candidate.email).toBe('original@example.com'); // Original object should be unchanged
  });

  it('should handle objects with no PII fields', () => {
    const candidate: TestCandidate = {
      id: '101',
      name: 'No PII Here',
      notes: 'All good.',
      skills: ['communication']
    };
    const redacted = redactCandidatePII(candidate);
    expect(redacted).toEqual(candidate); // Should be effectively a clone if no PII fields to redact
    expect(redacted.email).toBeUndefined();
    expect(redacted.phone).toBeUndefined();
    expect(redacted.address).toBeUndefined();
  });
});
