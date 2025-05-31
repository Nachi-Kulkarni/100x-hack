import type { NextApiRequest, NextApiResponse } from 'next';
import { rateLimiter, runMiddleware } from '../../../lib/rateLimit'; // Adjust path as needed

// Configure the rate limiter: e.g., 5 attempts per minute from the same IP
const loginRateLimiter = rateLimiter({
  windowSeconds: 60, // 1 minute
  maxRequests: 5,    // 5 requests
  keyPrefix: 'login_attempt',
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') { // Allow GET if it's just a link/redirect page
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    // Apply the rate limiter middleware
    await runMiddleware(req, res, loginRateLimiter);
  } catch (error: any) {
    // If runMiddleware rejects (e.g. rate limit exceeded), it will have already sent a response.
    // We might log it here if needed, but typically no further action is required from this handler.
    console.warn('Rate limit exceeded for initiate-signin:', req.ip || req.headers['x-forwarded-for']);
    // The response is already handled by the rateLimiter if it's a 429 error.
    // If it's another error from runMiddleware itself, it might need handling.
    if (!res.headersSent) {
      // This case should ideally not be reached if rateLimiter handles its response.
      return res.status(500).json({ message: 'Error in rate limiting middleware.'});
    }
    return; // Stop further processing
  }

  // If rate limit is not exceeded, proceed with the "initiation"
  // In a real scenario, this might record an attempt, or prepare something.
  // For this demo, it just confirms the action can proceed.
  // It could also redirect to the actual NextAuth.js sign-in page:
  // res.redirect(307, '/api/auth/signin'); // Example redirect

  res.status(200).json({
    message: 'Sign-in process can be initiated. Please proceed to the actual sign-in page/method.',
    note: 'This is a conceptual rate-limited endpoint before hitting the main NextAuth sign-in flow.',
    signInPage: '/api/auth/signin' // Inform client where to go next
  });
}
