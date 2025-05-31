// people-gpt-champion/app/api/analytics/education/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client'; // Import Prisma for JsonValue

const prisma = new PrismaClient();

interface EducationEntry {
  degree?: string;
  level?: string; // Prefer this if available
  // Add other potential fields if necessary, but keep them optional
  [key: string]: any;
}

// Simple normalization - can be expanded
const normalizeEducationLevel = (level?: string, degree?: string): string => {
  const target = (level || degree || 'Unknown').trim().toLowerCase();

  if (target.includes('bachelor') || target.startsWith('bs') || target.startsWith('b.s')) return "Bachelor's";
  if (target.includes('master') || target.startsWith('ms') || target.startsWith('m.s') || target.startsWith('mba')) return "Master's";
  if (target.includes('phd') || target.includes('doctorate')) return "PhD";
  if (target.includes('associate')) return "Associate's";
  if (target.includes('high school') || target.includes('ged')) return "High School/GED";
  if (target === 'unknown' || target === '') return 'Unknown';

  // For anything else, maybe return a capitalized version or keep as is if sufficiently common
  // For now, let's return a capitalized version of the input if not unknown
  const firstChar = (level || degree || 'Unknown').charAt(0).toUpperCase();
  const rest = (level || degree || 'Unknown').slice(1).toLowerCase();
  return `${firstChar}${rest}`;
};

export async function GET() {
  try {
    const candidates = await prisma.candidate.findMany({
      select: {
        education: true,
      },
    });

    const educationCounts: { [level: string]: number } = {};

    candidates.forEach(candidate => {
      const educationHistory = candidate.education as unknown as EducationEntry[] | null;
      let highestLevelProcessedForCandidate = ''; // Track to avoid double counting if multiple same-level degrees

      if (Array.isArray(educationHistory) && educationHistory.length > 0) {
        // One approach: count each listed education. Another: count highest per candidate.
        // For this dashboard, let's count distinct education "mentions" or "degrees obtained".
        // A more sophisticated approach might be to determine the *highest* degree for each candidate.
        // For now, let's assume each entry in education array is a distinct qualification to be counted.

        const processedLevelsForCandidate = new Set<string>();

        educationHistory.forEach(edu => {
          const normalizedLevel = normalizeEducationLevel(edu.level, edu.degree);
          // To count each candidate once per *normalized level*
          if (normalizedLevel !== 'Unknown') {
            processedLevelsForCandidate.add(normalizedLevel);
          }
        });

        if (processedLevelsForCandidate.size === 0 && educationHistory.length > 0) {
            // If all entries resulted in 'Unknown' but there were entries.
            educationCounts['Unknown'] = (educationCounts['Unknown'] || 0) + 1;
        } else {
            processedLevelsForCandidate.forEach(level => {
                 educationCounts[level] = (educationCounts[level] || 0) + 1;
            });
        }

      } else {
        educationCounts['Not Specified'] = (educationCounts['Not Specified'] || 0) + 1;
      }
    });

    // Ensure 'Unknown' and 'Not Specified' are distinct if both can occur.
    // 'Not Specified' means the education field was empty/null.
    // 'Unknown' means there were education entries, but they couldn't be normalized to a known category.


    const chartData = Object.entries(educationCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value); // Sort by value descending

    return NextResponse.json(chartData);
  } catch (error) {
    console.error('Error fetching education breakdown:', error);
    return NextResponse.json({ message: 'Error fetching education breakdown' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
