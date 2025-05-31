// people-gpt-champion/app/api/analytics/outreach/email-stats/__tests__/route.test.ts

import { GET } from '../route'; // Adjust path as necessary
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  const mPrismaClient = {
    emailOutreach: {
      findMany: jest.fn(),
    },
    $disconnect: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

describe('GET /api/analytics/outreach/email-stats', () => {
  let prismaMock: any; // Type properly if more specific mock structure is defined

  beforeEach(() => {
    prismaMock = new PrismaClient(); // Get the mocked instance
    jest.clearAllMocks(); // Clear mocks before each test
  });

  it('should return correct email outreach stats for a default 30-day period', async () => {
    const mockOutreaches = [
      { sentAt: new Date(), deliveredAt: new Date(), openedAt: new Date(), clickedAt: new Date(), createdAt: new Date() },
      { sentAt: new Date(), deliveredAt: new Date(), openedAt: new Date(), clickedAt: null, createdAt: new Date() },
      { sentAt: new Date(), deliveredAt: new Date(), openedAt: null, clickedAt: null, createdAt: new Date() },
      { sentAt: new Date(), deliveredAt: null, openedAt: null, clickedAt: null, createdAt: new Date() },
      { sentAt: null, deliveredAt: null, openedAt: null, clickedAt: null, createdAt: new Date() }, // Not sent
    ];
    prismaMock.emailOutreach.findMany.mockResolvedValue(mockOutreaches);

    const mockUrl = new URL('http://localhost/api/analytics/outreach/email-stats');
    const mockRequest = new NextRequest(mockUrl.toString());

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(prismaMock.emailOutreach.findMany).toHaveBeenCalledTimes(1);
    // Check that the findMany call includes a date filter, approximately 30 days ago
    expect(prismaMock.emailOutreach.findMany.mock.calls[0][0].where.createdAt.gte).toBeInstanceOf(Date);

    expect(data).toEqual({
      sent: 4, // Based on non-null sentAt
      delivered: 3,
      opened: 2,
      clicked: 1,
      periodDays: 30,
    });
    expect(prismaMock.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('should return correct stats for a custom period (e.g., 7 days)', async () => {
    prismaMock.emailOutreach.findMany.mockResolvedValue([
      { sentAt: new Date(), deliveredAt: new Date(), openedAt: null, clickedAt: null, createdAt: new Date() },
    ]);

    const mockUrl = new URL('http://localhost/api/analytics/outreach/email-stats?period=7d');
    const mockRequest = new NextRequest(mockUrl.toString());

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.periodDays).toBe(7);
    expect(data.sent).toBe(1);
    expect(data.delivered).toBe(1);
    expect(data.opened).toBe(0);
    expect(data.clicked).toBe(0);

    // Verify the date calculation for 7 days (approximate check)
    const expectedStartDate = new Date();
    expectedStartDate.setDate(expectedStartDate.getDate() - 7);
    expectedStartDate.setHours(0,0,0,0);
    const actualStartDate = prismaMock.emailOutreach.findMany.mock.calls[0][0].where.createdAt.gte;
    // Allowing a small difference for the exact moment the test runs vs. the route handler
    expect(Math.abs(actualStartDate.getTime() - expectedStartDate.getTime())).toBeLessThan(100); // Check within 100ms
  });

  it('should handle database errors gracefully', async () => {
    prismaMock.emailOutreach.findMany.mockRejectedValue(new Error('Database error'));

    const mockUrl = new URL('http://localhost/api/analytics/outreach/email-stats');
    const mockRequest = new NextRequest(mockUrl.toString());

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.message).toBe('Error fetching email outreach stats');
    expect(prismaMock.$disconnect).toHaveBeenCalledTimes(1); // Ensure disconnect is called even on error
  });

  it('should return zero counts if no outreach data found', async () => {
    prismaMock.emailOutreach.findMany.mockResolvedValue([]);

    const mockUrl = new URL('http://localhost/api/analytics/outreach/email-stats');
    const mockRequest = new NextRequest(mockUrl.toString());

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      periodDays: 30,
    });
  });

  it('should handle invalid period format by defaulting to 30 days', async () => {
    prismaMock.emailOutreach.findMany.mockResolvedValue([]);

    const mockUrl = new URL('http://localhost/api/analytics/outreach/email-stats?period=invalid');
    const mockRequest = new NextRequest(mockUrl.toString());

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.periodDays).toBe(30); // Defaulted
  });
});
