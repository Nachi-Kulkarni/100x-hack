// people-gpt-champion/app/api/analytics/skills/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const candidates = await prisma.candidate.findMany({
      select: {
        skills: true,
      },
    });

    const skillCounts: { [skill: string]: number } = {};

    candidates.forEach(candidate => {
      const skills = candidate.skills as unknown as string[]; // Assuming skills is an array of strings
      if (Array.isArray(skills)) {
        skills.forEach(skill => {
          if (typeof skill === 'string' && skill.trim() !== '') {
            const normalizedSkill = skill.trim().toLowerCase();
            skillCounts[normalizedSkill] = (skillCounts[normalizedSkill] || 0) + 1;
          }
        });
      }
    });

    // Convert to array format suitable for charts
    const chartData = Object.entries(skillCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count); // Sort by count descending

    return NextResponse.json(chartData);
  } catch (error) {
    console.error('Error fetching skills distribution:', error);
    return NextResponse.json({ message: 'Error fetching skills distribution' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
