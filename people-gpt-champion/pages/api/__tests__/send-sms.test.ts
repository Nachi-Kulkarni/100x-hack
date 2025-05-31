// people-gpt-champion/pages/api/__tests__/send-sms.test.ts
import { createMocks } from 'node-mocks-http';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '../send-sms'; // Adjust path
import { sendSms } from '../../../lib/twilio';
import { getFeatureFlag, createAnonymousUser } from '../../../lib/launchdarkly';

// Mock lib/twilio
jest.mock('../../../lib/twilio', () => ({
  sendSms: jest.fn(),
}));

// Mock lib/launchdarkly
jest.mock('../../../lib/launchdarkly', () => ({
  getFeatureFlag: jest.fn(),
  createAnonymousUser: jest.fn(() => ({ key: 'test-user' })), // Mock user context
}));

describe('/api/send-sms API Endpoint', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Assume env vars are set for successful cases, test missing ones specifically
    process.env = {
      ...originalEnv,
      TWILIO_ACCOUNT_SID: 'test-sid',
      TWILIO_AUTH_TOKEN: 'test-auth-token',
      TWILIO_PHONE_NUMBER: '+1234567890',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('POST Requests', () => {
    const validCandidateId = 'clsmsvalidcand01';
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    afterEach(() => { // Use afterEach to clear spy after each test within this describe block
        consoleLogSpy.mockClear();
    });

    afterAll(() => { // Restore console.log after all tests in this file/describe block are done
        consoleLogSpy.mockRestore();
    });

    it('should send SMS successfully without candidateId when feature flag is enabled', async () => {
      (getFeatureFlag as jest.Mock).mockResolvedValue(true); // Flag enabled
      const mockMessageSid = 'SMxxxxxxxxxxxxxxx';
      (sendSms as jest.Mock).mockResolvedValue(mockMessageSid);

      const requestBody = {
        to: '+19876543210',
        body: 'Test SMS'
        // candidateId omitted
      };
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: requestBody,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(JSON.parse(res._getData())).toEqual({ success: true, messageSid: mockMessageSid });
      expect(getFeatureFlag).toHaveBeenCalledWith('twilio-sms-outreach', { key: 'test-user' }, false);
      expect(sendSms).toHaveBeenCalledWith('+19876543210', 'Test SMS');
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Associated with candidateId:'));
    });

    it('should send SMS successfully WITH candidateId and log it, when feature flag is enabled', async () => {
        (getFeatureFlag as jest.Mock).mockResolvedValue(true); // Flag enabled
        const mockMessageSid = 'SMzzzzzzzzzzzzzzz';
        (sendSms as jest.Mock).mockResolvedValue(mockMessageSid);

        const requestBodyWithCandidate = {
          to: '+19876543211',
          body: 'Personalized Test SMS',
          candidateId: validCandidateId,
        };
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: requestBodyWithCandidate,
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(200);
        expect(JSON.parse(res._getData())).toEqual({ success: true, messageSid: mockMessageSid });
        expect(sendSms).toHaveBeenCalledWith('+19876543211', 'Personalized Test SMS');
        expect(consoleLogSpy).toHaveBeenCalledWith(`SMS message initiated. Associated with candidateId: ${validCandidateId}`);
      });


    it('should return 501 if feature flag is disabled', async () => {
      (getFeatureFlag as jest.Mock).mockResolvedValue(false); // Flag disabled

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: { to: '+19876543210', body: 'Test SMS' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(501);
      expect(JSON.parse(res._getData())).toEqual({ success: false, error: 'SMS functionality is currently disabled.' });
      expect(sendSms).not.toHaveBeenCalled();
    });

    it('should return 500 if LaunchDarkly check fails', async () => {
        (getFeatureFlag as jest.Mock).mockRejectedValue(new Error('LD SDK error'));

        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: { to: '+19876543210', body: 'Test SMS' },
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(500);
        expect(JSON.parse(res._getData())).toEqual({ success: false, error: 'Error checking feature flag status.' });
      });

    it('should return 400 for invalid request body (invalid phone number)', async () => {
      (getFeatureFlag as jest.Mock).mockResolvedValue(true);
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: { to: '12345', body: 'Test SMS' }, // Invalid phone
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const responseJson = JSON.parse(res._getData());
      expect(responseJson.error.fieldErrors?.to).toContain("Invalid 'to' phone number (must be E.164 format).");
    });

    it('should return 400 for invalid request body (empty body)', async () => {
        (getFeatureFlag as jest.Mock).mockResolvedValue(true);
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
          method: 'POST',
          body: { to: '+19876543210', body: '' }, // Empty body
        });

        await handler(req, res);

        expect(res._getStatusCode()).toBe(400);
        const responseJson = JSON.parse(res._getData());
        expect(responseJson.error.fieldErrors?.body).toContain('SMS body cannot be empty.');
      });

    it('should return 400 for invalid candidateId format (if provided)', async () => {
        (getFeatureFlag as jest.Mock).mockResolvedValue(true);
        const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
            method: 'POST',
            body: {
                to: '+19876543210',
                body: 'Test SMS',
                candidateId: 'invalid-cuid'
            },
          });

          await handler(req, res);

          expect(res._getStatusCode()).toBe(400);
          const responseJson = JSON.parse(res._getData());
          expect(responseJson.error.fieldErrors?.candidateId).toContain("Invalid Candidate ID format.");
    });

    it('should handle errors from sendSms (Twilio API error)', async () => {
      (getFeatureFlag as jest.Mock).mockResolvedValue(true);
      const twilioError = new Error('Twilio API Failed');
      (sendSms as jest.Mock).mockRejectedValue(twilioError);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: { to: '+19876543210', body: 'Test SMS' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData()).error).toContain(`Failed to send SMS: ${twilioError.message}`);
    });

    it('should handle errors if TWILIO_ACCOUNT_SID is not set', async () => {
      (getFeatureFlag as jest.Mock).mockResolvedValue(true);
      // Simulate error thrown by lib/twilio.ts's getTwilioClient()
      (sendSms as jest.Mock).mockImplementation(() => {
        throw new Error('TWILIO_ACCOUNT_SID environment variable is not set.');
      });
      // delete process.env.TWILIO_ACCOUNT_SID; // Not needed due to mockImplementation above

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: { to: '+19876543210', body: 'Test SMS' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(JSON.parse(res._getData()).error).toBe('Server configuration error: TWILIO_ACCOUNT_SID environment variable is not set.');
    });
  });

  it('should return 405 if method is not POST', async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({ method: 'GET' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});
