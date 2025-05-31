import fs from 'fs';
import path from 'path';

// Define a type for the candidate structure, matching candidate-profiles.json
// This helps with type safety when reading and processing the JSON data.
// Note: This should align with how Prisma expects dates (as Date objects).
interface CandidateProfile {
  id: string; // Assuming candidate-profiles.json will now have IDs
  name: string;
  title: string;
  summary: string;
  email: string;
  phone: string;
  location: string;
  skills: string[];
  workExperience: WorkExperience[];
  education: Education[];
  urls: string[];
  // Add any other fields that are present in your JSON and needed by Prisma
}

interface WorkExperience {
  title: string;
  company: string;
  location: string;
  startDate: string | Date; // JSON will have string, Prisma expects Date
  endDate?: string | Date | null;
  description: string;
}

interface Education {
  institution: string;
  degree: string;
  startDate: string | Date; // JSON will have string, Prisma expects Date
  endDate?: string | Date | null;
  gpa?: number | null;
}


let loadedDemoCandidateData: CandidateProfile[] = [];
const demoDataPath = path.join(process.cwd(), 'people-gpt-champion', 'demo-data', 'candidate-profiles.json');

try {
  // Read and parse the demo data when the module is loaded.
  // This makes it available synchronously to createMockPrismaClient,
  // and file is read only once per module load.
  const fileContents = fs.readFileSync(demoDataPath, 'utf-8');
  const rawData = JSON.parse(fileContents) as any[]; // Assuming raw data matches CandidateProfile structure or needs mapping

  // It's crucial that candidate-profiles.json contains an "id" field for each candidate
  // that matches the IDs used by Pinecone (e.g., "1", "2", "3").
  // If not, this mapping needs to create them or assume they exist.
  // For this example, we assume `candidate-profiles.json` now includes `id`.
  loadedDemoCandidateData = rawData.map((candidate, index) => ({
    ...candidate,
    // Ensure 'id' is a string. If not present in JSON, assign one.
    // This part is critical for consistency with Pinecone IDs.
    // For now, we assume candidate-profiles.json provides an `id` field.
    // If your JSON profiles don't have IDs, you'd need to add them or generate them consistently.
    // e.g., id: candidate.id || (index + 1).toString(),
    id: candidate.id ? candidate.id.toString() : `mock-prisma-id-${index + 1}`,


    // Convert date strings to Date objects for Prisma compatibility
    workExperience: candidate.workExperience.map((exp: WorkExperience) => ({
      ...exp,
      startDate: new Date(exp.startDate),
      endDate: exp.endDate ? new Date(exp.endDate) : null,
    })),
    education: candidate.education.map((edu: Education) => ({
      ...edu,
      startDate: new Date(edu.startDate),
      endDate: edu.endDate ? new Date(edu.endDate) : null,
    })),
  }));
  console.log(`Mock Prisma: Successfully loaded ${loadedDemoCandidateData.length} candidates from JSON.`);
} catch (error: any) {
  console.error(`Mock Prisma: Error loading candidate-profiles.json from ${demoDataPath}:`, error.message);
  // Fallback to an empty array or a default minimal mock if file loading fails
  loadedDemoCandidateData = [{
    id: "error-fallback-1",
    name: "Error Fallback Candidate",
    title: "N/A",
    summary: "Could not load demo data.",
    email: "error@example.com",
    phone: "N/A",
    location: "N/A",
    skills: [],
    workExperience: [],
    education: [],
    urls: []
  }];
}


// Type for the arguments of findMany, simplified for our needs
interface FindManyCandidateArgs {
  where?: {
    id?: {
      in?: string[];
    };
    // Add other filter conditions if needed by search.ts
  };
  // Add other Prisma arguments like select, include, take, skip if needed
}

export function createMockPrismaClient() {
  // console.log("Mock Prisma Client Created. Using data loaded from JSON.");

  return {
    candidate: {
      findMany: async (args?: FindManyCandidateArgs) => {
        // console.log("Mock Prisma: candidate.findMany called with args:", JSON.stringify(args, null, 2));

        let candidatesToReturn = [...loadedDemoCandidateData]; // Use a copy

        if (args?.where?.id?.in) {
          const idsToFilter = args.where.id.in;
          candidatesToReturn = candidatesToReturn.filter(candidate => idsToFilter.includes(candidate.id));
        }

        // TODO: Implement other filtering logic from args.where if necessary

        // console.log("Mock Prisma: candidate.findMany returning:", candidatesToReturn.length, "candidates");
        // Simulate Prisma's async behavior and ensure data structure matches Prisma's typical output
        return Promise.resolve(candidatesToReturn.map(c => ({
          ...c,
          // Dates are already transformed to Date objects when loadedDemoCandidateData was populated.
          // Prisma also often returns other fields like createdAt, updatedAt if they exist in the model.
          // The mock should add these if the consuming code expects them. For now, keeping it simple.
        })));
      },
      // Add other mock methods for `candidate` if needed by search.ts or other API routes
      // e.g., findUnique, create, update, delete
    },
    // Add other models
  };
}

export type MockPrismaClient = ReturnType<typeof createMockPrismaClient>;
