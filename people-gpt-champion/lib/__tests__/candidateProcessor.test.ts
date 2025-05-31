import { processInternalCandidateData, IRawInternalCandidateData } from '../candidateProcessor'; // Adjust path
import { CandidateSchema } from '../schemas'; // To verify parts of the output against main schema
import { ZodError } from 'zod';

describe('Internal Candidate Processor', () => {
  const validRawData: IRawInternalCandidateData = {
    fullName: "Jane Doe",
    contactEmail: "jane.doe@example.com",
    yearsOfExperience: 5,
    primarySkills: ["TypeScript", "React", "Node.js"],
    linkedinProfileUrl: "https://www.linkedin.com/in/janedoe",
  };

  test('should process valid raw data and return structured output', () => {
    const processedData = processInternalCandidateData(validRawData);

    // Check against the specific output schema of the processor
    expect(processedData.id).toBeDefined();
    expect(typeof processedData.id).toBe('string');
    // Prisma CUIDs are 25 chars long, but uuid v4 based one used in mock is 32 (after replace) or 36.
    // Let's check length if we used the substring method for CUID-like ID.
    // Our mock CUID is: cuidV4().replace(/-/g, '').substring(0,25)
    expect(processedData.id.length).toBe(25);


    expect(processedData.name).toBe(validRawData.fullName);
    expect(processedData.email).toBe(validRawData.contactEmail);
    expect(processedData.skills).toEqual(validRawData.primarySkills);
    expect(processedData.title).toBe(`${validRawData.primarySkills[0]} Developer`); // Example derived field
    expect(new Date(processedData.processedTimestamp).toString()).not.toBe('Invalid Date');

    // Optionally, check if the output (or parts of it) is compatible with the main CandidateSchema
    // This is useful if ProcessedCandidateOutputSchema is a subset or transformation
    const candidateSchemaCheck = CandidateSchema.pick({
      id: true, name: true, email: true, skills: true, title: true
    }).safeParse(processedData);
    expect(candidateSchemaCheck.success).toBe(true);
  });

  test('should throw ZodError for invalid raw data - missing required fields', () => {
    const invalidData = {
      // fullName is missing
      contactEmail: "john.doe@example.com",
      yearsOfExperience: 2,
      primarySkills: ["Java"],
    };
    expect(() => processInternalCandidateData(invalidData)).toThrow(ZodError);
    try {
      processInternalCandidateData(invalidData);
    } catch (e: any) {
      expect(e.errors[0].path).toContain('fullName');
      expect(e.errors[0].message).toBe('Full name cannot be empty.');
    }
  });

  test('should throw ZodError for invalid raw data - incorrect type', () => {
    const invalidData = {
      ...validRawData,
      yearsOfExperience: "five", // Incorrect type
    };
    expect(() => processInternalCandidateData(invalidData)).toThrow(ZodError);
    try {
      processInternalCandidateData(invalidData);
    } catch (e: any) {
      expect(e.errors[0].path).toContain('yearsOfExperience');
      expect(e.errors[0].message).toBe('Expected number, received string');
    }
  });

  test('should throw ZodError for invalid raw data - failed validation rule (e.g., email format)', () => {
    const invalidData = {
      ...validRawData,
      contactEmail: "not-an-email", // Invalid email format
    };
    expect(() => processInternalCandidateData(invalidData)).toThrow(ZodError);
     try {
      processInternalCandidateData(invalidData);
    } catch (e: any) {
      expect(e.errors[0].path).toContain('contactEmail');
      expect(e.errors[0].message).toBe('Invalid email address.');
    }
  });

  test('should throw ZodError for invalid raw data - empty skills array', () => {
    const invalidData = {
      ...validRawData,
      primarySkills: [], // Empty array, but schema requires min(1)
    };
    expect(() => processInternalCandidateData(invalidData)).toThrow(ZodError);
    try {
      processInternalCandidateData(invalidData);
    } catch (e: any) {
      expect(e.errors[0].path).toContain('primarySkills');
      expect(e.errors[0].message).toBe('At least one primary skill is required.');
    }
  });

  // Test for the output validation failing (internal logic error)
  // This requires mocking parts of the internal logic or schema to force an invalid output.
  // For simplicity, this specific test case might be omitted if it overly complicates the setup,
  // as it's testing the internal consistency of `processInternalCandidateData` rather than just input validation.
  // However, a conceptual example:
  // test('should throw Error if processed data does not match output schema', () => {
  //   // Modify a value after processing to make it fail output validation
  //   const dataWithInvalidProcessedName = { ...validRawData };
  //   // This would require either a more complex setup to intercept and modify data,
  //   // or making the internal `processedData` fail its schema.
  //   // e.g., if ProcessedCandidateOutputSchema required `name` to be min 5 chars,
  //   // and we processed `fullName: "Joe"`
  //   expect(() => {
  //     // somehow force processedData.name to be too short before output validation
  //   }).toThrow("Internal data processing failed to produce valid output.");
  // });
});
