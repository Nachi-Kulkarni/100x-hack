// people-gpt-champion/app/api/analytics/outreach/email-stats/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const periodParam = searchParams.get('period'); // e.g., "30d", "7d", "90d"

    let daysToLookBack = 30; // Default to 30 days
    if (periodParam) {
      const match = periodParam.match(/^(\d+)d$/);
      if (match && match[1]) {
        daysToLookBack = parseInt(match[1], 10);
      }
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToLookBack);
    startDate.setHours(0, 0, 0, 0); // Start of the day

    // Fetch relevant outreach records created within the period
    const outreaches = await prisma.emailOutreach.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
        // We are interested in emails that have at least been sent or attempted to be sent
        // So, we might filter out statuses like "queued" or "draft" if not relevant for these stats
        // However, for calculating rates, it's often better to get all that were *intended* for the period
        // and then count statuses. The current logic counts events based on timestamps.
      },
      select: {
        sentAt: true,
        deliveredAt: true,
        openedAt: true,
        clickedAt: true,
        // status: true // Can be used if timestamps are not exclusively relied upon
      },
    });

    let sentCount = 0;
    let deliveredCount = 0;
    let openedCount = 0;
    let clickedCount = 0;

    outreaches.forEach(outreach => {
      if (outreach.sentAt) sentCount++;
      if (outreach.deliveredAt) deliveredCount++;
      // For opened and clicked, we are counting unique events per email.
      // If an email is opened multiple times, openedAt stores the *first* open.
      if (outreach.openedAt) openedCount++;
      if (outreach.clickedAt) clickedCount++;
    });

    // Alternative: using status field if it's more reliable or if timestamps aren't always set
    // This depends heavily on how the webhooks update these fields.
    // For example:
    // const outreachesByStatus = await prisma.emailOutreach.groupBy({
    //   by: ['status'],
    //   where: { createdAt: { gte: startDate } },
    //   _count: { status: true },
    // });
    // Then map counts from `outreachesByStatus`

    return NextResponse.json({
      sent: sentCount,
      delivered: deliveredCount,
      opened: openedCount,
      clicked: clickedCount,
      periodDays: daysToLookBack, // Include the period in the response for clarity
    });

  } catch (error) {
    console.error('Error fetching email outreach stats:', error);
    return NextResponse.json(
      { message: 'Error fetching email outreach stats' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
