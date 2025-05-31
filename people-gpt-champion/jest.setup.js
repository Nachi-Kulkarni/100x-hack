// Polyfill for TextEncoder and TextDecoder (must be at the top)
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Polyfill for fetch
// require('whatwg-fetch'); // whatwg-fetch does not polyfill Request, Response, Headers

// Polyfill for fetch, Request, Response, Headers using node-fetch v2
const fetch = require('node-fetch');
if (!global.fetch) {
  global.fetch = fetch;
  global.Request = fetch.Request;
  global.Response = fetch.Response;
  global.Headers = fetch.Headers;
}

import '@testing-library/jest-dom';

// Environment variables for tests (if any were truly global and needed)
// process.env.OPENAI_API_KEY = 'test_openai_key';
// process.env.PINECONE_API_KEY = 'test_pinecone_key';
// process.env.PINECONE_INDEX_NAME = 'test_pinecone_index';
// process.env.UPSTASH_REDIS_REST_URL = 'redis://mock-redis:6379';
// process.env.NODE_ENV = 'test';
