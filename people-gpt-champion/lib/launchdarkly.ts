import * as LDClient from 'launchdarkly-node-server-sdk';

let ldClient: LDClient.LDClient | null = null;

// Define a type for your feature flags
// This helps with type safety when checking flags.
export interface AppFlags {
  streamingSearch: boolean;
  multiChannelOutreach: boolean;
  // Add other flags here as they are defined
}

const initializeLaunchDarklyClient = async (): Promise<LDClient.LDClient> => {
  if (!process.env.LAUNCHDARKLY_SDK_KEY) {
    throw new Error('LaunchDarkly SDK key not configured');
  }
  if (ldClient) {
    return ldClient;
  }

  const client = LDClient.init(process.env.LAUNCHDARKLY_SDK_KEY);
  try {
    await client.waitForInitialization();
    console.log('LaunchDarkly client initialized successfully.');
    ldClient = client;
    return ldClient;
  } catch (error) {
    console.error('Error initializing LaunchDarkly client:', error);
    throw error;
  }
};

export const getLaunchDarklyClient = async () => {
  if (ldClient) {
    return ldClient;
  }
  return await initializeLaunchDarklyClient();
};

// Generic function to get a flag value
export const getFeatureFlag = async <K extends keyof AppFlags>(
  flagKey: K,
  user: LDClient.LDUser, // User context is important for targeted rollouts
  defaultValue: AppFlags[K]
): Promise<AppFlags[K]> => {
  const client = await getLaunchDarklyClient();
  // Ensure client is not null, though getLaunchDarklyClient should handle initialization.
  if (!client) {
     console.error('LaunchDarkly client not available.');
     return defaultValue;
  }
  try {
    const value = await client.variation(flagKey as string, user, defaultValue);
    return value as AppFlags[K];
  } catch (error) {
    console.error(`Error getting flag ${flagKey}:`, error);
    return defaultValue;
  }
};

// Example of creating a user context. In a real app, this would be dynamic.
export const createAnonymousUser = (): LDClient.LDUser => ({
  key: 'anonymous', // Or a session ID, or a user ID if logged in
});

// Specific flag example (optional, can be done directly with getFeatureFlag)
// export const isStreamingSearchEnabled = async (user: LDClient.LDUser): Promise<boolean> => {
//   return getFeatureFlag('streamingSearch', user, false); // Default to false
// };

// Remember to close the client when the application shuts down
export const closeLaunchDarklyClient = () => {
  if (ldClient) {
    ldClient.close();
    ldClient = null;
    console.log('LaunchDarkly client closed.');
  }
};
