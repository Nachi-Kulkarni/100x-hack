import { createMocks, RequestMethod } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../initiate-signin'; // Adjust path
import { getRedisClient } from '../../../lib/redis'; // Adjust path

// Mock ioredis used by rateLimit.ts
let mockRedisStore = {};
const mockRedis = {
  incr: jest.fn((key) => {
    mockRedisStore[key] = (mockRedisStore[key] || 0) + 1;
    return Promise.resolve(mockRedisStore[key]);
  }),
  expire: jest.fn((key, seconds) => {
    // For simplicity, we don't simulate actual expiry here,
    // but we can check if it's called.
    return Promise.resolve(1); // 1 means expiry was set
  }),
  ttl: jest.fn((key) => {
    // Simulate TTL, e.g., always return the window if key exists
    return Promise.resolve(mockRedisStore[key] ? 60 : -2); // -2 if key doesn't exist
  }),
  status: 'ready', // Simulate a ready client
  connect: jest.fn().mockResolvedValue(undefined), // Mock connect method
};

jest.mock('../../../lib/redis', () => ({
  getRedisClient: jest.fn(() => mockRedis),
}));


describe('/api/auth/initiate-signin API Endpoint with Rate Limiting', () => {
  const ipAddress = '123.123.123.123';
  const rateLimitOptions = { // Matching what's in initiate-signin.ts
    windowSeconds: 60,
    maxRequests: 5,
  };

  beforeEach(() => {
    // Reset mocks and store before each test
    mockRedisStore = {};
    mockRedis.incr.mockClear();
    mockRedis.expire.mockClear();
    mockRedis.ttl.mockClear();
    (getRedisClient as jest.Mock).mockClear();
    (getRedisClient as jest.Mock).mockReturnValue(mockRedis); // Ensure it returns the mock
  });

  test('should allow requests within the limit', async () => {
    for (let i = 0; i < rateLimitOptions.maxRequests; i++) {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST', // or GET, depending on what your handler allows
        socket: { remoteAddress: ipAddress }, // Simulate IP
        headers: { 'x-forwarded-for': ipAddress } // Common way to get IP
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200);
      expect(mockRedis.incr).toHaveBeenCalledWith(`login_attempt:${ipAddress}`);
      if (i === 0) { // Expire should be called only on the first request of the window
        expect(mockRedis.expire).toHaveBeenCalledWith(`login_attempt:${ipAddress}`, rateLimitOptions.windowSeconds);
      }
    }
    expect(mockRedis.incr).toHaveBeenCalledTimes(rateLimitOptions.maxRequests);
    expect(mockRedis.expire).toHaveBeenCalledTimes(1); // Called once for the window
  });

  test('should return 429 Too Many Requests when limit is exceeded', async () => {
    // First, make requests up to the limit
    for (let i = 0; i < rateLimitOptions.maxRequests; i++) {
      mockRedisStore[`login_attempt:${ipAddress}`] = i; // Pre-fill store a bit
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        socket: { remoteAddress: ipAddress },
         headers: { 'x-forwarded-for': ipAddress }
      });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(200); // These should pass
    }

    // The (maxRequests + 1)-th request should fail
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: 'POST',
      socket: { remoteAddress: ipAddress },
      headers: { 'x-forwarded-for': ipAddress }
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(429);
    expect(JSON.parse(res._getData()).message).toContain('Too Many Requests');
    expect(res._getHeaders()['retry-after']).toBeDefined();
    expect(mockRedis.ttl).toHaveBeenCalledWith(`login_attempt:${ipAddress}`);
  });

  test('should allow request again after the window has passed (conceptually)', async () => {
    // Simulate exceeding the limit
    mockRedisStore[`login_attempt:${ipAddress}`] = rateLimitOptions.maxRequests + 1;

    const { req: reqOverLimit, res: resOverLimit } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST', socket: { remoteAddress: ipAddress }, headers: { 'x-forwarded-for': ipAddress }
    });
    await handler(reqOverLimit, resOverLimit);
    expect(resOverLimit._getStatusCode()).toBe(429);

    // Reset the store for that key to simulate time passing (window expired)
    delete mockRedisStore[`login_attempt:${ipAddress}`];
    // Or more accurately:
    // mockRedis.incr.mockImplementationOnce(key => {
    //   mockRedisStore[key] = 1; // Reset count for this key
    //   return Promise.resolve(1);
    // });


    const { req: reqAfterWindow, res: resAfterWindow } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST', socket: { remoteAddress: ipAddress }, headers: { 'x-forwarded-for': ipAddress }
    });
    await handler(reqAfterWindow, resAfterWindow);

    expect(resAfterWindow._getStatusCode()).toBe(200);
    expect(mockRedis.incr).toHaveBeenCalledWith(`login_attempt:${ipAddress}`);
    expect(mockRedis.expire).toHaveBeenCalledWith(`login_attempt:${ipAddress}`, rateLimitOptions.windowSeconds);
  });

   test('should pass through if Redis client is not ready or fails', async () => {
    (getRedisClient as jest.Mock).mockImplementationOnce(() => ({ ...mockRedis, status: 'end' })); // Simulate not ready

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST', socket: { remoteAddress: ipAddress }, headers: { 'x-forwarded-for': ipAddress }
    });
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200); // Should pass through
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Rate limiter: Redis client not ready"));
    consoleWarnSpy.mockRestore();

    // Simulate getRedisClient() throwing an error
    (getRedisClient as jest.Mock).mockImplementationOnce(() => { throw new Error("Redis unavailable"); });
    const { req: req2, res: res2 } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST', socket: { remoteAddress: ipAddress }, headers: { 'x-forwarded-for': ipAddress }
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await handler(req2, res2);
    expect(res2._getStatusCode()).toBe(200); // Should pass through
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Rate limiter: Failed to get/reinitialize Redis client"), expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

});
