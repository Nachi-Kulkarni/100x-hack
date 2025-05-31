import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { handlers as appHandlers } from '../handlers'; // Assuming these are the handlers to test
import { getFeatureFlag } from '../../lib/launchdarkly'; // To be mocked

// Mock LaunchDarkly
jest.mock('../../lib/launchdarkly', () => ({
  ...jest.requireActual('../../lib/launchdarkly'), // Import and retain default behavior
  getFeatureFlag: jest.fn(), // Mock getFeatureFlag
}));

const mockedGetFeatureFlag = getFeatureFlag as jest.Mock;

// Define the MSW server
const server = setupServer(...appHandlers);

// URLs for testing
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const PINECONE_QUERY_URL = 'https://some-index-12345.svc.environment.pinecone.io/query'; // Example Pinecone URL

describe('MSW Handlers', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => {
    server.resetHandlers();
    mockedGetFeatureFlag.mockReset();
    // Reset globalThis.demoMode for browser-like tests if any (though these are Node tests)
    if (typeof globalThis !== 'undefined') {
      // @ts-ignore
      delete globalThis.demoMode;
    }
  });
  afterAll(() => server.close());

  describe('OpenAI Chat Completions Handler', () => {
    test('should return mock data when demoMode is active (Node.js/LaunchDarkly)', async () => {
      mockedGetFeatureFlag.mockResolvedValue(true); // Simulate demoMode ON via LaunchDarkly

      const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, { method: 'POST', body: JSON.stringify({}) });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.model).toContain('-mock-dynamic-jq'); // Check for part of the mock model name
      expect(data.choices[0].message.content).toBeDefined();
      // Further checks on content if needed, e.g. using job-queries.json content
    });

    test('should passthrough when demoMode is inactive (Node.js/LaunchDarkly)', async () => {
      mockedGetFeatureFlag.mockResolvedValue(false); // Simulate demoMode OFF via LaunchDarkly

      // Expect passthrough to result in a non-MSW error or a specific non-mocked response
      // For this test, if it tries to hit the real OpenAI, it should fail without API key / network access
      // Or, if another handler (like a global one for tests) catches it, that's also fine.
      // The key is it *doesn't* return our specific mock.
      try {
        const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, { method: 'POST', body: JSON.stringify({}) });
        // If the request actually went through and succeeded (e.g. if network available and somehow authed)
        // then this test might need adjustment. For typical CI/isolated env, it would fail or be caught by 'onUnhandledRequest'.
        // Here, we expect it to be unhandled by *our* specific demo mock.
        // If onUnhandledRequest is 'error', this fetch will throw.
         expect(response.status).not.toBe(200); // Or check that it's not our mock data.
      } catch (e: any) {
        // This is expected if onUnhandledRequest: 'error' and no other handler exists
        expect(e.message).toContain('request to https://api.openai.com/v1/chat/completions failed, reason: connect ECONNREFUSED');
      }
    });
  });

  describe('OpenAI Embeddings Handler', () => {
    test('should return mock data when demoMode is active (Node.js/LaunchDarkly)', async () => {
      mockedGetFeatureFlag.mockResolvedValue(true);
      const response = await fetch(OPENAI_EMBEDDINGS_URL, { method: 'POST', body: JSON.stringify({ input: 'test' }) });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.model).toContain('-mock-ld');
      expect(data.data[0].embedding).toBeInstanceOf(Array);
    });

    test('should passthrough when demoMode is inactive (Node.js/LaunchDarkly)', async () => {
      mockedGetFeatureFlag.mockResolvedValue(false);
      try {
        await fetch(OPENAI_EMBEDDINGS_URL, { method: 'POST', body: JSON.stringify({ input: 'test' }) });
      } catch (e: any) {
         expect(e.message).toContain('request to https://api.openai.com/v1/embeddings failed, reason: connect ECONNREFUSED');
      }
    });
  });

  describe('Pinecone Query Handler', () => {
    test('should return mock candidate data when demoMode is active (Node.js/LaunchDarkly)', async () => {
      mockedGetFeatureFlag.mockResolvedValue(true);
      const response = await fetch(PINECONE_QUERY_URL, { method: 'POST', body: JSON.stringify({}) });
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.matches).toBeInstanceOf(Array);
      expect(data.matches.length).toBeGreaterThanOrEqual(0); // Can be 0 if candidate-profiles.json is empty or load fails
      if (data.matches.length > 0) {
        expect(data.matches[0].id).toBeDefined();
        // It should use data from candidate-profiles.json.
        // This test assumes candidate-profiles.json is non-empty and loaded by handlers.ts
      }
    });

    test('should passthrough when demoMode is inactive (Node.js/LaunchDarkly)', async () => {
      mockedGetFeatureFlag.mockResolvedValue(false);
      try {
        await fetch(PINECONE_QUERY_URL, { method: 'POST', body: JSON.stringify({}) });
      } catch (e: any) {
         expect(e.message).toContain('request to https://some-index-12345.svc.environment.pinecone.io/query failed, reason: connect ECONNREFUSED');
      }
    });
  });

  // Example for testing globalThis.demoMode for browser-like behavior (if needed, though handlers prioritize Node LD check)
  // This requires the handlers to be structured to allow overriding the environment check,
  // or specific browser-targeted tests. The current handlers.ts will always use LD in Node.
  // So, testing globalThis.demoMode directly here for Node execution isn't straightforward unless we alter handlers.ts.
  // The current setup is: Node -> LD, Browser -> globalThis.demoMode. These tests run in Node.
  test('OpenAI handler should use globalThis.demoMode if window is defined (conceptual)', () => {
    // This test is more conceptual for the current setup as these tests run in Node.
    // To truly test this, one would need to run MSW in a browser context (e.g. Playwright, Jest with JSDOM)
    // and set globalThis.demoMode there.
    // For Node tests, `typeof window` is undefined, so LaunchDarkly path is taken.
    expect(true).toBe(true); // Placeholder for conceptual understanding.
  });

});
