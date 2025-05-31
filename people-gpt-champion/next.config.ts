import type { NextConfig } from "next";

const CSP_NONCE_HEADER = 'X-CSP-Nonce'; // Example, if using nonce

// Base CSP: very restrictive
// For a real app, this needs careful tuning based on actual resources, CDNs, inline scripts/styles, etc.
// Next.js specific needs:
// - 'unsafe-eval' is often needed for development due to how Next.js handles HMR and JS bundles.
// - 'unsafe-inline' might be needed for certain inline styles or scripts if not using nonces/hashes.
// - Image sources need to be specified (e.g., 'self', data:, specific CDNs like lh3.googleusercontent.com for Google auth images).
// - Connect sources for API calls, WebSockets, etc.
const cspDirectives = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-eval'", "'unsafe-inline'"], // Unsafe for dev, tighten in prod
  "style-src": ["'self'", "'unsafe-inline'"], // Unsafe for inline styles, tighten in prod
  "img-src": ["'self'", "data:", "https:", "lh3.googleusercontent.com", "*.googleusercontent.com", "avatars.githubusercontent.com"], // Allow self, data URIs, any HTTPS, and Google/GitHub profile pics
  "font-src": ["'self'", "https: data:"], // Allow self, HTTPS fonts, data URIs
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"], // Restrict where forms can submit to
  "frame-ancestors": ["'none'"], // Prevents clickjacking. Use 'self' or specific origins if framing is needed.
  "upgrade-insecure-requests": [], // Add the directive without a value
  // "block-all-mixed-content": [], // Consider adding for HTTPS pages to block HTTP content
  // Other directives to consider: connect-src, media-src, prefetch-src, worker-src, frame-src
};

// Function to convert CSP object to string
function cspObjectToString(directives: Record<string, string[] | string>): string {
  return Object.entries(directives)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        // For directives like upgrade-insecure-requests that don't have a value part
        if (value.length === 0) return key;
        return `${key} ${value.join(' ')}`;
      }
      return `${key} ${value}`; // Should not happen with current structure but good for flexibility
    })
    .join('; ');
}
const contentSecurityPolicy = cspObjectToString(cspDirectives);

const nextConfig: NextConfig = {
  /* other config options here */
  async headers() {
    return [
      {
        // Apply these headers to all routes in your application.
        source: '/:path*', // Matches all paths
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            // value: 'SAMEORIGIN', // Use 'DENY' if no framing needed, or CSP frame-ancestors
            // CSP frame-ancestors is generally preferred over X-Frame-Options.
            // If both are present, frame-ancestors typically takes precedence.
            // For this exercise, we'll keep X-Frame-Options as well for broader browser support,
            // though modern browsers prioritize frame-ancestors.
            value: 'SAMEORIGIN',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            // Example: deny common sensitive features by default. Customize as needed.
            // e.g., camera=(), microphone=(), geolocation=(), payment=()
            // For more granular control: camera=(self), microphone=(self "https://example.com")
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
          // Example for X-XSS-Protection, though it's largely superseded by CSP
          // {
          //   key: 'X-XSS-Protection',
          //   value: '1; mode=block', // Deprecated in many modern browsers, CSP is better
          // },
        ],
      },
    ];
  },
};

export default nextConfig;
