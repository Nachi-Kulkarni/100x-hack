# API Rate Limiting

To ensure fair usage, maintain system stability, and protect against abuse, several API endpoints in the People GPT Champion application are rate-limited. This document outlines the routes subject to rate limiting and their default configurations.

## Rate Limiting Mechanism

-   Rate limiting is primarily based on the client's IP address.
-   A fixed window counter algorithm is used, implemented with Redis via the `ioredis` client.
-   When a rate limit is exceeded for a given IP address, the API will respond with an HTTP `429 Too Many Requests` status code. The response will also include a `Retry-After` header indicating how many seconds to wait before attempting another request.

## Rate-Limited Endpoints and Default Configurations

The following table lists the API routes that have rate limiting applied, along with their default limits:

| API Endpoint                        | Default Window    | Max Requests per Window | Key Prefix Used     |
| :---------------------------------- | :---------------- | :---------------------- | :------------------ |
| `/api/auth/initiate-signin`         | 1 minute          | 5 requests              | `login_attempt`     |
| `/api/search`                       | 1 minute          | 10 requests             | `search_api`        |
| `/api/generate-outreach`            | 1 minute          | 5 requests              | `generate_outreach_api` |
| `/api/gdpr/export`                  | 5 minutes         | 3 requests              | `gdpr_export`       |
| `/api/gdpr/delete`                  | 10 minutes        | 2 requests              | `gdpr_delete`       |
| `/api/parse-resume`                 | 15 minutes        | 5 requests              | `parse_resume`      |
| `/api/send-email`                   | 5 minutes         | 10 requests             | `send_email`        |
| `/api/send-slack-message`           | 5 minutes         | 10 requests             | `send_slack_message`|
| `/api/send-sms`                     | 10 minutes        | 5 requests              | `send_sms`          |

**Note on `/api/parse-resume`:** The rate limit for `/api/parse-resume` applies to the number of API calls made, not the number of individual files that can be included in a single batch upload (which is controlled by `MAX_FILES_PER_REQUEST` in the route itself).

## Configuration in Production

These default rate limits are currently set directly in the code within each API route's handler file when initializing the `rateLimiter` middleware.

For production environments, it is **highly recommended** to make these configurations dynamic. This can be achieved by:

1.  Reading limit values (window duration and max requests) from environment variables.
2.  Storing configurations in a central configuration service or database.

Dynamic configuration allows for easier adjustments to rate limits in response to traffic patterns, system load, or security concerns without requiring code changes and redeployments.

## Future Considerations

-   **User-Specific Rate Limiting:** For authenticated users, rate limiting could be made more sophisticated by keying on `session.user.id` in addition to, or instead of, IP address for certain routes. This would provide fairer limits per user rather than per IP, which can be shared (e.g., NAT, VPNs).
-   **Dynamic Blocklisting/Allowlisting:** More advanced systems might include dynamic IP or user blocklisting based on behavior.
-   **Granular Limits:** Different limits could be applied based on user roles or subscription tiers if such concepts are introduced.

This rate limiting strategy provides a foundational layer of protection for the application's API endpoints.
