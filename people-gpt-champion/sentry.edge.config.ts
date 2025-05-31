// people-gpt-champion/sentry.edge.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://examplePublicKey@o0.ingest.sentry.io/0", // IMPORTANT: Replace with your actual Sentry DSN

  // Adjust this value in production, or use tracesSampler for finer control
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
