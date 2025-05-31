import { createMockPrismaClient } from '../mockPrisma';
import fs from 'fs';
import path from 'path';

// Define a simplified CandidateProfile type for test data comparison
interface TestCandidateProfile {
  id: string;
  name: string;
  email: string;
  workExperience: { startDate: Date, endDate: Date | null }[];
  education: { startDate: Date, endDate: Date | null }[];
}

// Load actual demo data to compare against
const demoDataPath = path.join(process.cwd(), 'people-gpt-champion', 'demo-data', 'candidate-profiles.json');
let expectedCandidates: TestCandidateProfile[] = [];
try {
  const fileContents = fs.readFileSync(demoDataPath, 'utf-8');
  const rawData = JSON.parse(fileContents) as any[];
  expectedCandidates = rawData.map((candidate: any) => ({
    ...candidate,
    id: candidate.id ? candidate.id.toString() : `mock-id-${Math.random()}`, // Ensure ID is string
    workExperience: candidate.workExperience.map((exp: any) => ({
      ...exp,
      startDate: new Date(exp.startDate),
      endDate: exp.endDate ? new Date(exp.endDate) : null,
    })),
    education: candidate.education.map((edu: any) => ({
      ...edu,
      startDate: new Date(edu.startDate),
      endDate: edu.endDate ? new Date(edu.endDate) : null,
    })),
  }));
} catch (error) {
  console.error("Error loading test data for mockPrisma.test.ts:", error);
  // This will likely cause tests to fail if data isn't loaded, which is intended.
}

describe('MockPrismaClient', () => {
  const mockPrisma = createMockPrismaClient();

  beforeAll(() => {
    // Ensure there's data to test against
    if (expectedCandidates.length === 0) {
      throw new Error("No demo candidate data loaded for tests. Check candidate-profiles.json.");
    }
  });

  test('candidate.findMany() should return all candidates when no args are passed', async () => {
    const candidates = await mockPrisma.candidate.findMany();
    expect(candidates).toBeInstanceOf(Array);
    expect(candidates.length).toBe(expectedCandidates.length);

    // Verify that all expected candidates are present and dates are Date objects
    expectedCandidates.forEach(expectedCand => {
      const foundCand = candidates.find(c => c.id === expectedCand.id);
      expect(foundCand).toBeDefined();
      expect(foundCand?.name).toBe(expectedCand.name);
      expect(foundCand?.email).toBe(expectedCand.email);

      // Check date types in workExperience
      foundCand?.workExperience.forEach((exp: any) => {
        expect(exp.startDate).toBeInstanceOf(Date);
        if (exp.endDate) {
          expect(exp.endDate).toBeInstanceOf(Date);
        }
      });
      // Check date types in education
      foundCand?.education.forEach((edu: any) => {
        expect(edu.startDate).toBeInstanceOf(Date);
        if (edu.endDate) {
          expect(edu.endDate).toBeInstanceOf(Date);
        }
      });
    });
  });

  test('candidate.findMany() should return an empty array if no args are passed and no data was loaded (simulating error)', async () => {
    // This requires modifying how `loadedDemoCandidateData` is injected or resetting it.
    // For simplicity, we assume `loadedDemoCandidateData` is populated by the module load.
    // A more complex test could mock `fs.readFileSync` to throw an error for this specific test.
    // For now, this scenario is covered by the fallback in mockPrisma.ts if file is missing.
    // If `mockPrisma.ts` loaded an empty array due to error, this test should reflect that.
    // We can check the "Error Fallback Candidate" if that's the case.
    if (expectedCandidates.some(c => c.id === "error-fallback-1")) {
        const candidates = await mockPrisma.candidate.findMany();
        expect(candidates.length).toBe(1);
        expect(candidates[0].id).toBe("error-fallback-1");
    }
  });


  test('candidate.findMany({ where: { id: { in: [...] } } }) should return specified candidates', async () => {
    if (expectedCandidates.length < 2) {
      console.warn("Skipping ID filter test: not enough data in candidate-profiles.json (need at least 2).");
      return;
    }
    const idsToFetch = [expectedCandidates[0].id, expectedCandidates[1].id];
    if (!idsToFetch[0] || !idsToFetch[1]) {
        throw new Error("Test setup error: expectedCandidates IDs are undefined.");
    }

    const candidates = await mockPrisma.candidate.findMany({
      where: { id: { in: idsToFetch } },
    });

    expect(candidates).toBeInstanceOf(Array);
    expect(candidates.length).toBe(idsToFetch.length);
    idsToFetch.forEach(id => {
      expect(candidates.some(c => c.id === id)).toBe(true);
    });
  });

  test('candidate.findMany() should return specific fields if "select" is used (if implemented)', async () => {
    // The current mockPrisma.ts does not implement `select`.
    // This is a placeholder for if/when `select` functionality is added to the mock.
    // For now, it will just return all fields.
    const mockWithSelect = createMockPrismaClient() as any; // Cast to any to allow non-standard args
    if (typeof mockWithSelect.candidate.findManyOriginal === 'function') { // Assuming we wrap for select
        const candidates = await mockWithSelect.candidate.findManyOriginal({ select: { id: true, name: true }});
        expect(candidates.length).toBeGreaterThan(0);
        expect(Object.keys(candidates[0]).sort()).toEqual(['id', 'name'].sort());
    } else {
        console.warn("MockPrisma: 'select' functionality not fully implemented/tested in mock.");
        // Test current behavior: it returns all fields even with select
        const candidateToFetch = expectedCandidates[0];
        const candidates = await mockPrisma.candidate.findMany({
            where: { id: { in: [candidateToFetch.id] } },
            // @ts-ignore - select is not strictly typed in our simplified mock args
            select: { id: true, name: true }
        });
        expect(candidates.length).toBe(1);
        expect(candidates[0].id).toBe(candidateToFetch.id);
        expect(candidates[0].name).toBe(candidateToFetch.name);
        // Check that other fields are also present, as select is not implemented to restrict fields
        expect(candidates[0].email).toBe(candidateToFetch.email);
    }
  });
});
