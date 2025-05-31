// people-gpt-champion/pages/api/__tests__/send-slack-message.test.ts
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../send-slack-message'; // Adjust path
import { sendSlackMessage } from '../../../lib/slack'; // Actual path

// Mock the lib/slack module
jest.mock('../../../lib/slack', () => ({
  sendSlackMessage: jest.fn(),
}));

describe('/api/send-slack-message API Endpoint', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Assume env vars are set for successful cases, test missing ones specifically
    process.env = {
      ...originalEnv,
      SLACK_BOT_TOKEN: 'test-slack-bot-token',
      SLACK_SIGNING_SECRET: 'test-slack-signing-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv; // Restore original env
  });

  describe('POST Requests', () => {
    const validCandidateId = 'clslackcand001';
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    afterEach(() => {
        consoleLogSpy.mockClear();
    });

    afterAll(() => {
        consoleLogSpy.mockRestore();
    });

    it('should send Slack message successfully without candidateId', async () => {
      const mockMessageTimestamp = '1234567890.123456';
      (sendSlackMessage as jest.Mock).mockResolvedValue(mockMessageTimestamp);

      const requestBody = {
        userId: 'U123ABCDEF',
        message: 'Hello from test!',
        // candidateId is omitted
      };
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: requestBody,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.success).toBe(true);
      expect(responseJson.messageId).toBe(mockMessageTimestamp);
      expect(sendSlackMessage).toHaveBeenCalledWith('U123ABCDEF', 'Hello from test!');
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Associated with candidateId:'));
    });

    it('should send Slack message successfully WITH candidateId and log it', async () => {
        const mockMessageTimestamp = '9876543210.654321';
        (sendSlackMessage as jest.Mock).mockResolvedValue(mockMessageTimestamp);

        const requestBodyWithCandidate = {
          userId: 'U678GHIJKL',
          message: 'Personalized test hello!',
          candidateId: validCandidateId,
        };
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: requestBodyWithCandidate,
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        const responseJson = JSON.parse(res._getData());
        expect(responseJson.success).toBe(true);
        expect(responseJson.messageId).toBe(mockMessageTimestamp);
        expect(sendSlackMessage).toHaveBeenCalledWith('U678GHIJKL', 'Personalized test hello!');
        expect(consoleLogSpy).toHaveBeenCalledWith(`Slack message initiated. Associated with candidateId: ${validCandidateId}`);
      });


    it('should return 400 for invalid request body (missing userId)', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: { message: 'Test message without userId' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.success).toBe(false);
      expect(responseJson.error.fieldErrors?.userId).toContain('Slack User ID cannot be empty.');
    });

    it('should return 400 for invalid request body (empty message)', async () => {
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: { userId: 'U123ABCDEF', message: '' }, // Empty message
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
        const responseJson = JSON.parse(res._getData());
        expect(responseJson.success).toBe(false);
        expect(responseJson.error.fieldErrors?.message).toContain('Message cannot be empty.');
      });

    it('should return 400 for invalid candidateId format (if provided)', async () => {
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
            method: 'POST',
            body: {
                userId: 'U123ABCDEF',
                message: 'Test message',
                candidateId: 'invalid-cuid'
            },
          });

          await handler(req, res);

          expect(res._getStatusCode()).toBe(400);
          const responseJson = JSON.parse(res._getData());
          expect(responseJson.success).toBe(false);
          expect(responseJson.error.fieldErrors?.candidateId).toContain('Invalid Candidate ID format.');
    });

    it('should handle errors from sendSlackMessage (e.g., Slack API error)', async () => {
      const slackError = new Error('Slack API failed');
      (sendSlackMessage as jest.Mock).mockRejectedValue(slackError);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: { userId: 'U123ABCDEF', message: 'A message' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.success).toBe(false);
      expect(responseJson.error).toContain(`Failed to send Slack message: ${slackError.message}`);
    });

    it('should handle errors if SLACK_BOT_TOKEN is not set (error from lib/slack.ts)', async () => {
      (sendSlackMessage as jest.Mock).mockImplementation(() => {
        // Simulate the error thrown by getSlackApp() when env var is missing
        throw new Error('SLACK_BOT_TOKEN environment variable is not set.');
      });

      // delete process.env.SLACK_BOT_TOKEN; // This would affect the mock setup too early.
      // Instead, we ensure sendSlackMessage mock throws the specific error.

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: { userId: 'U123ABCDEF', message: 'A message' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.success).toBe(false);
      expect(responseJson.error).toBe('Server configuration error: SLACK_BOT_TOKEN environment variable is not set.');
    });
  });

  it('should return 405 if method is not POST', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});
