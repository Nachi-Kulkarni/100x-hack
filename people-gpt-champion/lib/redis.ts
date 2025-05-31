// people-gpt-champion/lib/redis.ts
import Redis from 'ioredis';

let redisClient: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    throw new Error('Upstash Redis URL (UPSTASH_REDIS_REST_URL) not configured.');
  }
  if (redisClient && redisClient.status === 'ready') { // Check if client is connected
    return redisClient;
  }

  try {
    // For Upstash with ioredis, the URL should be a standard redis:// format.
    // e.g., redis://default:<password>@<host>:<port>
    // If UPSTASH_REDIS_REST_URL is an HTTP URL, @upstash/redis client should be used instead.
    // This implementation assumes UPSTASH_REDIS_REST_URL is ioredis-compatible.
    if (redisClient) { // If client exists but not ready, disconnect first
        redisClient.disconnect();
    }
    redisClient = new Redis(process.env.UPSTASH_REDIS_REST_URL, {
        maxRetriesPerRequest: 3, // Optional: retry commands
        connectTimeout: 10000, // 10 seconds connection timeout
         lazyConnect: true, // Connect on first command
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
      // More robust error handling: invalidate client on critical errors
      if (err.message.includes('WRONGPASS') || err.message.includes('AUTH') || err.message.includes('ECONNREFUSED')) {
        if(redisClient) redisClient.disconnect(); // Disconnect on critical error
        redisClient = null;
      }
    });

    redisClient.on('connect', () => {
        console.log('Connected to Redis successfully.');
    });

    //redisClient.connect().catch(err => console.error('Failed to connect to Redis lazily on init:', err));

    return redisClient;
  } catch (error) {
    console.error('Failed to initialize Redis client:', error);
    if(redisClient) redisClient.disconnect();
    redisClient = null;
    throw error; // Rethrow to indicate failure
  }
};

const CACHE_EXPIRATION_SECONDS = 3600; // 1 hour

export const getCache = async <T>(key: string): Promise<T | null> => {
  try {
    const client = getRedisClient();
    if (!client || client.status !== 'ready') {
        // Attempt to connect if lazyConnect was used and not yet connected
        if (client && client.status === 'connecting'){
            await new Promise(resolve => setTimeout(resolve, 100)); // short delay
            if(client.status !== 'ready') throw new Error('Redis client not ready after short delay.');
        } else if (!client) {
             throw new Error('Redis client not initialized.');
        } else {
            // For any other status that is not 'ready'
            console.warn(`Redis client not ready. Status: ${client.status}. Trying to connect.`);
            await client.connect().catch(e => { throw new Error(`Redis connect failed: ${e.message}`)});
            if(client.status !== 'ready') throw new Error(`Redis client still not ready after explicit connect. Status: ${client.status}`);
        }
    }
    const data = await client.get(key);
    if (data) {
      return JSON.parse(data) as T;
    }
    return null;
  } catch (error) {
    console.error(`Error getting cache for key "${key}":`, error);
    return null; // On error, treat as cache miss
  }
};

export const setCache = async <T>(key: string, value: T, expirationSeconds: number = CACHE_EXPIRATION_SECONDS): Promise<void> => {
  try {
    const client = getRedisClient();
     if (!client || client.status !== 'ready') {
        if (client && client.status === 'connecting'){
            await new Promise(resolve => setTimeout(resolve, 100));
            if(client.status !== 'ready') throw new Error('Redis client not ready for setCache.');
        } else if (!client) {
            throw new Error('Redis client not initialized for setCache.');
        } else {
            console.warn(`Redis client not ready for setCache. Status: ${client.status}. Trying to connect.`);
            await client.connect().catch(e => { throw new Error(`Redis connect failed for setCache: ${e.message}`)});
            if(client.status !== 'ready') throw new Error(`Redis client still not ready for setCache after explicit connect. Status: ${client.status}`);
        }
    }
    await client.set(key, JSON.stringify(value), 'EX', expirationSeconds);
  } catch (error) {
    console.error(`Error setting cache for key "${key}":`, error);
    // Decide if error should be thrown or just logged
  }
};
