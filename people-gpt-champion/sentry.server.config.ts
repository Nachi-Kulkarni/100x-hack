// people-gpt-champion/sentry.server.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://ace9c7e365d7b7a23b5c9bafe459409a@o4509419049254912.ingest.us.sentry.io/4509419052597248", // IMPORTANT: Replace with your actual Sentry DSN

  // Adjust this value in production, or use tracesSampler for finer control
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: process.env.NODE_ENV === 'development',
});
