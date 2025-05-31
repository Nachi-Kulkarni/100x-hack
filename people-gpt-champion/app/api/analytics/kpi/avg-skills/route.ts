// people-gpt-champion/app/api/analytics/kpi/avg-skills/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();

export async function GET() {
  try {
    const candidates = await prisma.candidate.findMany({
      select: { skills: true },
    });
    if (candidates.length === 0) {
      return NextResponse.json({ average: 0 });
    }
    let totalSkills = 0;
    candidates.forEach(candidate => {
      const skills = candidate.skills as unknown as string[];
      if (Array.isArray(skills)) {
        totalSkills += skills.length;
      }
    });
    const average = parseFloat((totalSkills / candidates.length).toFixed(1));
    return NextResponse.json({ average });
  } catch (error) {
    console.error('Error fetching average skills:', error);
    return NextResponse.json({ message: 'Error fetching average skills' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
