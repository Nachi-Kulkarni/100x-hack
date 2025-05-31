import { createMocks, RequestMethod } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../health'; // Adjust path to your health.ts handler
import { IHealthResponse, IApiErrorResponse } from '../../../lib/schemas'; // Adjust path

describe('/api/health API Endpoint', () => {
  test('should return 200 OK with valid status for a GET request (no query params)', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse<IHealthResponse>>({
      method: 'GET',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData()) as IHealthResponse;
    expect(responseData.status).toBe('ok');
    expect(new Date(responseData.timestamp).toString()).not.toBe('Invalid Date');
    expect(responseData.checks).toBeUndefined(); // No detailed checks by default
  });

  test('should return 200 OK with detailed checks when quick is not true', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse<IHealthResponse>>({
      method: 'GET',
      query: {
        quick: 'false', // Or any string that is not 'true' or '1'
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData()) as IHealthResponse;
    expect(responseData.status).toBe('ok'); // Assuming db check is mocked/passes
    expect(responseData.checks).toBeDefined();
    expect(responseData.checks?.database?.status).toBe('ok');
  });

  test('should correctly parse quick=true query parameter', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse<IHealthResponse>>({
      method: 'GET',
      query: {
        quick: 'true',
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData()) as IHealthResponse;
    expect(responseData.status).toBe('ok');
    expect(responseData.checks).toBeUndefined();
  });

  test('should correctly parse quick=1 query parameter', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse<IHealthResponse>>({
      method: 'GET',
      query: {
        quick: '1',
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const responseData = JSON.parse(res._getData()) as IHealthResponse;
    expect(responseData.status).toBe('ok');
    expect(responseData.checks).toBeUndefined();
  });


  test('should return 405 for non-GET requests', async () => {
    const methods: RequestMethod[] = ['POST', 'PUT', 'DELETE', 'PATCH'];
    for (const method of methods) {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse<IApiErrorResponse>>({
        method,
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(405);
      expect(JSON.parse(res._getData()).message).toBe(`Method ${method} Not Allowed`);
    }
  });

  // This test is for demonstrating Zod validation on query parameters,
  // but HealthQuerySchema currently only has `quick: z.string().optional().transform(...)`.
  // A direct type violation (e.g., quick as an object) is hard to simulate as req.query values are always strings or array of strings.
  // The transform handles various string inputs. If we had another param like `checkName: z.string().min(3)`,
  // we could test `checkName=""` or `checkName="a"`.
  // For now, we'll assume the Zod transform logic in HealthQuerySchema itself is tested by Zod,
  // and the API correctly passes req.query to it.
  // If the schema was `z.object({ count: z.coerce.number() })`, we could pass `count="abc"` to fail coercion.

  // Let's imagine a different schema temporarily for a better Zod failure test example on query:
  // If HealthQuerySchema was: HealthQuerySchema = z.object({ specificCheck: z.string().min(3) })
  // test('should return 400 if a required query param fails Zod validation', async () => {
  //   const { req, res } = createMocks<NextApiRequest, NextApiResponse<IApiErrorResponse>>({
  //     method: 'GET',
  //     query: {
  //       specificCheck: 'a', // Too short
  //     },
  //   });

  //   await handler(req, res); // Assuming handler uses HealthQuerySchema.parse() or safeParse()

  //   expect(res._getStatusCode()).toBe(400);
  //   const responseData = JSON.parse(res._getData()) as IApiErrorResponse;
  //   expect(responseData.message).toBe('Validation failed. Please check your input.');
  //   expect(responseData.errors).toHaveProperty('specificCheck');
  //   expect(responseData.errors?.specificCheck?.[0]).toContain('String must contain at least 3 character(s)');
  // });

  // Since `quick` is optional and transforms, it won't easily fail validation in a way that `handleZodError`
  // would be triggered by `req.query` structure alone unless Zod itself throws an unexpected error during transform.
  // The schema is designed to be robust for `quick`.
});
