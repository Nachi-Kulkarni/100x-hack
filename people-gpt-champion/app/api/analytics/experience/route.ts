// people-gpt-champion/app/api/analytics/experience/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client'; // Import Prisma namespace for JsonValue

const prisma = new PrismaClient();

interface WorkExperienceEntry {
  startDate?: string;
  endDate?: string;
  durationInMonths?: number;
  // Add other potential fields if necessary, but keep them optional
  [key: string]: any;
}

// Helper to parse date and calculate duration
const calculateMonths = (startDateStr?: string, endDateStr?: string): number => {
  if (!startDateStr) return 0;

  try {
    const startDate = new Date(startDateStr);
    let endDate;

    if (!endDateStr || endDateStr.toLowerCase() === 'present' || endDateStr.toLowerCase() === 'current') {
      endDate = new Date(); // Use current date for ongoing roles
    } else {
      endDate = new Date(endDateStr);
    }

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return 0; // Invalid date format
    }

    // Calculate difference in months
    let months = (endDate.getFullYear() - startDate.getFullYear()) * 12;
    months -= startDate.getMonth();
    months += endDate.getMonth();
    return months <= 0 ? 0 : months;

  } catch (e) {
    // console.warn(`Could not parse dates: ${startDateStr}, ${endDateStr}`, e);
    return 0;
  }
};

export async function GET() {
  try {
    const candidates = await prisma.candidate.findMany({
      select: {
        workExperience: true,
      },
    });

    const experienceBins = {
      '0-2 Years': 0,
      '3-5 Years': 0,
      '6-8 Years': 0,
      '9-11 Years': 0,
      '12+ Years': 0,
      'Unknown': 0, // For candidates with no parseable experience
    };

    candidates.forEach(candidate => {
      let totalMonthsExperience = 0;
      const experiences = candidate.workExperience as unknown as WorkExperienceEntry[] | null;

      if (Array.isArray(experiences)) {
        experiences.forEach(exp => {
          if (exp.durationInMonths && typeof exp.durationInMonths === 'number' && exp.durationInMonths > 0) {
            totalMonthsExperience += exp.durationInMonths;
          } else if (exp.startDate) {
            totalMonthsExperience += calculateMonths(exp.startDate, exp.endDate);
          }
        });
      }

      if (totalMonthsExperience === 0 && (!experiences || experiences.length === 0)) {
         experienceBins['Unknown']++;
         return;
      }

      const yearsExperience = totalMonthsExperience / 12;

      if (yearsExperience >= 0 && yearsExperience <= 2) {
        experienceBins['0-2 Years']++;
      } else if (yearsExperience > 2 && yearsExperience <= 5) {
        experienceBins['3-5 Years']++;
      } else if (yearsExperience > 5 && yearsExperience <= 8) {
        experienceBins['6-8 Years']++;
      } else if (yearsExperience > 8 && yearsExperience <= 11) {
        experienceBins['9-11 Years']++;
      } else if (yearsExperience > 11) {
        experienceBins['12+ Years']++;
      } else {
        // This case should ideally not be hit if totalMonthsExperience starts at 0
        // and only positive durations are added.
        // Could be for candidates with valid but zero total experience (e.g. only very short internships)
        // For now, let's put them in 0-2 or Unknown if calculation led to negative/NaN (though calculateMonths tries to prevent this)
         experienceBins['0-2 Years']++; // Or 'Unknown' if preferred for truly zero or invalid
      }
    });

    const chartData = Object.entries(experienceBins).map(([years, count]) => ({
      years, // Changed from 'name' to 'years' to match sample data expectation
      count,
    }));

    return NextResponse.json(chartData);
  } catch (error) {
    console.error('Error fetching experience distribution:', error);
    return NextResponse.json({ message: 'Error fetching experience distribution' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
