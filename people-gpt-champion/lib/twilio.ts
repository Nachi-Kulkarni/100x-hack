// people-gpt-champion/lib/twilio.ts
import twilio from 'twilio';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER; // Or TWILIO_MESSAGING_SERVICE_SID

let twilioClient: twilio.Twilio | null = null;

/**
 * Initializes and returns the Twilio client instance.
 * Throws an error if Twilio environment variables are not set.
 * @returns {twilio.Twilio} The initialized Twilio client.
 */
const getTwilioClient = (): twilio.Twilio => {
  if (!TWILIO_ACCOUNT_SID) {
    throw new Error('TWILIO_ACCOUNT_SID environment variable is not set.');
  }
  if (!TWILIO_AUTH_TOKEN) {
    throw new Error('TWILIO_AUTH_TOKEN environment variable is not set.');
  }
  if (!TWILIO_PHONE_NUMBER) { // Check for sender number/service SID
    throw new Error('TWILIO_PHONE_NUMBER (or TWILIO_MESSAGING_SERVICE_SID) environment variable is not set.');
  }

  if (twilioClient) {
    return twilioClient;
  }

  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return twilioClient;
};

/**
 * Sends an SMS message using Twilio.
 * @param {string} to The recipient's phone number in E.164 format (e.g., "+1234567890").
 * @param {string} body The text of the message to send.
 * @returns {Promise<string>} The SID of the sent message.
 * @throws {Error} If the message fails to send or Twilio API returns an error.
 */
export const sendSms = async (to: string, body: string): Promise<string> => {
  const client = getTwilioClient();

  try {
    const message = await client.messages.create({
      body: body,
      from: TWILIO_PHONE_NUMBER, // This can be a Twilio phone number or a Messaging Service SID
      to: to,
    });

    if (message.sid) {
      console.log(`SMS sent successfully to ${to}. Message SID: ${message.sid}`);
      return message.sid;
    } else {
      // This case should be unlikely if the API call itself doesn't throw an error,
      // but good to have a fallback.
      console.error('Twilio API error: Message SID not found in response.', message);
      throw new Error('Twilio API error: Failed to send SMS (SID missing).');
    }
  } catch (error: any) {
    console.error(`Error sending SMS to ${to} via Twilio:`, error);
    // Twilio errors often have a `message` and `code` property.
    const errorMessage = error.message || 'An unexpected error occurred with Twilio.';
    // Consider logging error.code as well if available.
    throw new Error(`Failed to send SMS: ${errorMessage}`);
  }
};

// Export the client getter if direct access is needed elsewhere (though unlikely for this setup)
// export { getTwilioClient };
