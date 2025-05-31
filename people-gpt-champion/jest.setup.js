// people-gpt-champion/jest.setup.js

// Used for __tests__/testing-library.js
// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Global mocks or setups from feat/core-search-api
// e.g., environment variables for tests
process.env.OPENAI_API_KEY = 'test_openai_key';
process.env.PINECONE_API_KEY = 'test_pinecone_key';
process.env.PINECONE_INDEX_NAME = 'test_pinecone_index';
process.env.UPSTASH_REDIS_REST_URL = 'redis://mock-redis:6379'; // Dummy for tests

// Add any other environment variables your application might need during tests
// For example, if your code checks for NODE_ENV:
process.env.NODE_ENV = 'test';
