# Demo Mode and Offline Capabilities

## Overview

Demo mode provides a way to run the People GPT Champion application with pre-defined mock data, bypassing live calls to external services like OpenAI, Pinecone, and the Supabase/Postgres database via Prisma. This is useful for:

*   **Presentations and Demonstrations:** Showcase application features without relying on live API keys, internet connectivity, or unpredictable AI responses.
*   **Offline Development:** Allow developers to work on UI and frontend features without needing active external services.
*   **Testing:** Facilitate isolated testing of components by providing consistent mock responses for API and database interactions.

## Enabling Demo Mode

Demo mode is primarily controlled by a feature flag named `demoMode` within the LaunchDarkly platform.

*   When the `demoMode` flag is **enabled** in LaunchDarkly, the application automatically switches to using mock data for:
    *   OpenAI API calls (chat completions for query parsing, embeddings).
    *   Pinecone API calls (vector search queries).
    *   Database interactions via Prisma (candidate data).
*   This mock data is sourced from local JSON files.

## Demo Data Files

The JSON files used by the demo mode are located in the `people-gpt-champion/demo-data/` directory.

*   **`candidate-profiles.json`**:
    *   **Purpose:** Stores an array of mock candidate profiles.
    *   **Structure:** Each object in the array should represent a candidate. The structure should align with the `CandidateSchema` defined in `lib/schemas.ts` and the Prisma schema in `prisma/schema.prisma`. This includes fields like `id` (must be a string, unique, and consistent with Pinecone mock expectations), `name`, `title`, `summary`, `skills`, `workExperience`, `education`, etc. Dates should be in ISO 8601 format (e.g., `"2021-01-15T00:00:00.000Z"`).

*   **`job-queries.json`**:
    *   **Purpose:** Stores an array of sample job search queries.
    *   **Structure:** Each object represents a job query that a user might input. This structure is used by the mock OpenAI chat completion handler to simulate the LLM's query parsing step. It should typically include fields like `query` (the raw string), `filters` (object with location, skills, etc.), and `keywords` as expected by the search API and internal `QueryParameters` type.

## MSW (Mock Service Worker) Integration

Mock Service Worker (MSW) is used to intercept and mock HTTP requests to external services like OpenAI and Pinecone.

*   **Node.js Environments (e.g., API Route Tests, Jest):**
    *   In Node.js environments, the MSW request handlers (`people-gpt-champion/mocks/handlers.ts`) respect the `demoMode` feature flag fetched from LaunchDarkly. If the flag is on, mock responses are served. If off, requests are passed through (e.g., to the actual APIs, which may fail in test environments without proper setup but correctly indicates the mock was bypassed).
*   **Browser-Based Development:**
    *   For frontend development or manual testing in the browser where MSW is active (via `mocks/browser.ts`), developers can manually enable or disable the mocks by setting a global variable in the browser's developer console:
        *   `window.demoMode = true;` to force enable mocks.
        *   `window.demoMode = false;` to force disable mocks and allow requests to attempt to reach actual APIs (requires `NEXT_PUBLIC_API_MOCKING="enabled"` to be set for MSW to be active in the browser).
    *   This provides a convenient override without needing to interact with LaunchDarkly during local frontend development.

## Mock Prisma Client

For database interactions (which in this project are managed by Prisma, typically connecting to a Supabase/Postgres database):

*   When `demoMode` (as determined by the LaunchDarkly flag in API routes like `pages/api/search.ts`) is active, a mock Prisma client (`people-gpt-champion/mocks/mockPrisma.ts`) is used instead of the actual Prisma client.
*   This mock client reads its data directly from `people-gpt-champion/demo-data/candidate-profiles.json`, simulating database responses for operations like fetching candidates.

## Maintenance

To update or change the data used in demo mode:

1.  Modify the content of `candidate-profiles.json` to change candidate data. Ensure new candidates have unique string `id`s.
2.  Modify `job-queries.json` to change the predefined search queries used by the OpenAI mock.
3.  No code changes are typically needed in the mocks themselves unless the structure of the demo data or the mock logic needs to be altered.

Ensure that the structure of the data in these JSON files remains consistent with the application's schemas and expectations.
