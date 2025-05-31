// people-gpt-champion/app/api/analytics/skills/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient, Role } from '@prisma/client'; // Added Role
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../../pages/api/auth/[...nextauth]'; // Adjusted path

const prisma = new PrismaClient();

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user || !session.user.role) {
      return NextResponse.json({ message: 'Unauthorized: Not authenticated' }, { status: 401 });
  }

  const { role } = session.user;
  if (role !== Role.ADMIN && role !== Role.RECRUITER) {
      return NextResponse.json({ message: 'Forbidden: Insufficient permissions' }, { status: 403 });
  }

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
