// people-gpt-champion/lib/__mocks__/redis.ts
const Redis = jest.fn().mockImplementation(() => ({
  connect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  on: jest.fn(),
  quit: jest.fn().mockResolvedValue(undefined),
  // Add other methods used by your application here if they are called
  // For example, if 'exists', 'expire', 'incr', etc., are used:
  // exists: jest.fn().mockResolvedValue(0),
  // expire: jest.fn().mockResolvedValue(0),
  // incr: jest.fn().mockResolvedValue(0),
  // hgetall: jest.fn().mockResolvedValue({}),
  // zadd: jest.fn().mockResolvedValue(0),
  // zrange: jest.fn().mockResolvedValue([]),
}));

export default Redis;
