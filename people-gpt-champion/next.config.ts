import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
  // Your existing Next.js config options here...
  // reactStrictMode: true, // Example option - add if not present or keep if present
};

// Determine if the app is running on Vercel (common for Next.js apps)
const isVercel = !!process.env.VERCEL_URL;

export default withSentryConfig(
  nextConfig,
  {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    // Suppresses source map uploading logs during build
    silent: true,
    org: process.env.SENTRY_ORG, // Automatically picked up by Sentry CLI if logged in or set in env
    project: process.env.SENTRY_PROJECT, // Automatically picked up by Sentry CLI if logged in or set in env
    // Optional: Provide a Sentry auth token if not logged in to Sentry CLI
    // authToken: process.env.SENTRY_AUTH_TOKEN,
  },
  {
    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload source maps to Sentry
    widenClientFileUpload: true,

    // Transpiles SDK to be compatible with IE11 (increases bundle size)
    transpileClientSDK: false,

    // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers (increases server load)
    tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles
    hideSourceMaps: true,

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors.
    // See the following for more information:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/vercel-cron-monitors/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
  }
);
