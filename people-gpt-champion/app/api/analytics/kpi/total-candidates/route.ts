// people-gpt-champion/app/api/analytics/kpi/total-candidates/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient, Role } from '@prisma/client'; // Added Role
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../../pages/api/auth/[...nextauth]'; // Adjusted path

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
    const count = await prisma.candidate.count();
    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error fetching total candidates:', error);
    return NextResponse.json({ message: 'Error fetching total candidates' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
