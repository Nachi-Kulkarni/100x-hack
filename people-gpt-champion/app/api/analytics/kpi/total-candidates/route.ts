// people-gpt-champion/app/api/analytics/kpi/total-candidates/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function GET() {
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
