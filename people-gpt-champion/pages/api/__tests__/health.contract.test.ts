// pages/api/__tests__/health.contract.test.ts
import supertest from 'supertest';
import http from 'http';
import { apiResolver } from 'next/dist/server/api-utils/node/api-resolver'; // For Pages Router
import handler from '../health'; // Adjust path to your handler
import { HealthResponseSchema } from '@/lib/schemas'; // Adjust path

// Mock any deep dependencies if needed. For health, maybe Prisma.
// For this initial test, we assume the health check might not have deep DB dependencies,
// or they are handled by existing Jest mocks if they are triggered.
// If the actual health handler *does* interact with Prisma, a mock similar to other tests might be needed:
// jest.mock('@prisma/client', () => ({
//   PrismaClient: jest.fn(() => ({
//     $connect: jest.fn().mockResolvedValue(undefined),
//     $disconnect: jest.fn().mockResolvedValue(undefined),
//     // Add any other methods your health check might use, e.g. for a simple query:
//     // _queryRaw: jest.fn().mockResolvedValue([{ result: 1 }]),
//     // $queryRawUnsafe: jest.fn().mockResolvedValue([{ result: 1 }]),
//   })),
// }));


describe('API Contract Test: /api/health', () => {
  let server: http.Server;

  beforeAll((done) => {
    // Create a test server that uses our API handler
    server = http.createServer((req, res) => {
      // For basic GET requests without query params, an empty query object is usually fine.
      // If your handler relies on specific query parameters, you might need to parse them here.
      // Example for req.query: const query = new URL(req.url || '', `http://${req.headers.host}`).searchParams;
      // For apiResolver, the query object is passed as the third argument.
      apiResolver(req, res, {}, handler, { previewModeId: '', previewModeEncryptionKey: '', previewModeSigningKey: '' }, true);
    });
    server.listen(done);
  });

  afterAll((done) => {
    server.close(done);
  });

  it('GET /api/health should return 200 and valid health response', async () => {
    const response = await supertest(server).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);

    // Validate the response body against the Zod schema
    const parsedBody = HealthResponseSchema.safeParse(response.body);
    expect(parsedBody.success).toBe(true);

    if (parsedBody.success) { // Type guard for parsedBody.data
      expect(parsedBody.data.status).toBe('ok');
      expect(parsedBody.data.timestamp).toBeDefined();
      // Further checks on parsedBody.data.checks can be added if schema is more specific
    } else {
      // Optionally log Zod errors if parsing fails, for debugging
      // console.error("Zod parsing errors:", parsedBody.error.errors);
    }
  });

  it('POST /api/health should return 405 Method Not Allowed', async () => {
    const response = await supertest(server).post('/api/health').send({});
    expect(response.status).toBe(405);
    // Optionally, check the Allow header or response body for error message
    expect(response.headers['allow']).toBe('GET');
    expect(response.body).toEqual({ message: 'Method POST Not Allowed' }); // Corrected key from 'error' to 'message'
  });
});
