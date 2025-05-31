// people-gpt-champion/lib/slack.ts
import { App, LogLevel } from '@slack/bolt';

// Note: You'll need to set these environment variables in your deployment environment.
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

let app: App | null = null;

/**
 * Initializes and returns the Slack Bolt App instance.
 * Throws an error if Slack environment variables are not set.
 * @returns {App} The initialized Slack Bolt App.
 */
const getSlackApp = (): App => {
  if (!SLACK_BOT_TOKEN) {
    throw new Error('SLACK_BOT_TOKEN environment variable is not set.');
  }
  if (!SLACK_SIGNING_SECRET) {
    throw new Error('SLACK_SIGNING_SECRET environment variable is not set.');
  }

  if (app) {
    return app;
  }

  app = new App({
    token: SLACK_BOT_TOKEN,
    signingSecret: SLACK_SIGNING_SECRET,
    logLevel: LogLevel.INFO, // Adjust log level as needed (e.g., LogLevel.DEBUG for development)
    // Socket Mode can be enabled here if not using HTTP for events
  });

  return app;
};

/**
 * Sends a direct message to a Slack user.
 * @param {string} userId The Slack User ID to send the message to (e.g., "U012AB3CDE").
 * @param {string} messageText The text of the message to send.
 * @returns {Promise<string>} The timestamp (ts) of the sent message, which can serve as a message ID.
 * @throws {Error} If the message fails to send or Slack API returns an error.
 */
export const sendSlackMessage = async (userId: string, messageText: string): Promise<string> => {
  const slackApp = getSlackApp();

  try {
    // First, open a conversation with the user to get the DM channel ID
    // This is necessary because chat.postMessage requires a channel ID, not a user ID for DMs.
    // However, for sending a DM, you can often directly use the user ID as the channel parameter.
    // Slack recommends using conversations.open for clarity and future-proofing if you need the channel ID.
    // For simplicity and common use cases where userId can be used as channel for DMs:
    const result = await slackApp.client.chat.postMessage({
      token: SLACK_BOT_TOKEN, // Bolt's app.client methods usually handle token automatically, but explicit passing is fine
      channel: userId, // For DMs, the user's ID is typically used as the channel ID
      text: messageText,
      // You can add more message formatting here, like blocks:
      // blocks: [
      //   {
      //     "type": "section",
      //     "text": {
      //       "type": "mrkdwn",
      //       "text": messageText
      //     }
      //   }
      // ]
    });

    if (result.ok && result.ts) {
      console.log(`Message sent successfully to user ${userId}. TS: ${result.ts}`);
      return result.ts; // result.ts is the message timestamp, often used as an ID
    } else {
      // Log the full error from Slack if available
      console.error('Slack API error posting message:', result.error || 'Unknown error');
      throw new Error(`Slack API error: ${result.error || 'Failed to send message'}`);
    }
  } catch (error: any) {
    console.error(`Error sending Slack message to user ${userId}:`, error);
    // Re-throw the error to be caught by the calling API route
    // Check if error has a data property for more details from Slack API
    const detailedError = error.data?.error || error.message || 'An unexpected error occurred';
    throw new Error(`Failed to send Slack message: ${detailedError}`);
  }
};

// Export the app instance if direct access is needed elsewhere (e.g., for event handling)
// export { app as slackAppInstance };
// For now, only exporting the send function as per requirements.
