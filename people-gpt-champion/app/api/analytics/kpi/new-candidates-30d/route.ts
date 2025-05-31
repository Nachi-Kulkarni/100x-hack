// people-gpt-champion/app/api/analytics/kpi/new-candidates-30d/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function GET() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const count = await prisma.candidate.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    });
    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error fetching new candidates:', error);
    return NextResponse.json({ message: 'Error fetching new candidates' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
