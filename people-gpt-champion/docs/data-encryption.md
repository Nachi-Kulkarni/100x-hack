# Data Encryption Policy

This document outlines the policy and implementation details for field-level encryption of sensitive data within the People GPT Champion application.

## 1. Encryption/Decryption Process

To protect sensitive candidate information, specific fields are encrypted at rest in the database.

-   **Encrypted Fields:** The following fields in the `Candidate` model are subject to encryption:
    -   `phone` (candidate's phone number)
    -   `resumeText` (full text of the candidate's resume)
    -   `address` (candidate's physical address, if provided)

-   **Encryption Algorithm:** AES-256 is used for encryption, provided by the `crypto-js` library.

-   **Encryption Workflow:**
    -   Encryption is performed by the `encrypt(text: string): string` utility function located in `lib/encryption.ts`.
    -   This function is called *before* data containing sensitive fields is saved to the database. For example, in the `pages/api/parse-resume.ts` API route, when a new candidate is created from a parsed resume, the `phone`, `resumeText`, and `address` fields are encrypted prior to the `prisma.candidate.create()` call.

-   **Decryption Workflow:**
    -   Decryption is performed by the `decrypt(encryptedText: string): string` utility function, also in `lib/encryption.ts`.
    -   This function is called *after* data containing encrypted fields is retrieved from the database and *before* it is used in API responses or server-side business logic that requires the plaintext value. For example, in the `pages/api/search.ts` API route, when candidate data is fetched, these fields are decrypted before being included in the response to the client.

## 2. Key Management

The security of the encrypted data relies heavily on the management of the encryption key.

-   **Encryption Key Variable:** The AES-256 encryption key is read from the `FIELD_ENCRYPTION_KEY` environment variable (i.e., `process.env.FIELD_ENCRYPTION_KEY`).

-   **Key Requirements:**
    -   This key **must** be a strong, randomly generated cryptographic key. For AES-256, this means a 32-byte (256-bit) key.
    -   In production environments, the `FIELD_ENCRYPTION_KEY` **must be kept secret and managed securely**. This typically involves using a dedicated secrets management service (e.g., HashiCorp Vault, AWS Secrets Manager, Google Cloud Secret Manager).
    -   It should **never** be hardcoded into source code or committed to version control for production use.

-   **Development Placeholder:** The `lib/encryption.ts` file contains a hardcoded placeholder key. **This placeholder key is for development and demonstration purposes ONLY and is not secure.** Warnings are logged to the console if this fallback key is used, especially in a production-like environment.

## 3. Impact on Search Functionality

Encrypting data at rest has important implications for search capabilities.

-   **Problem Statement:** Encrypting fields like `resumeText` means that the database cannot perform direct full-text searches or indexing on the encrypted content. Similarly, vector databases (like Pinecone) or external embedding services (like OpenAI) cannot process encrypted text directly; they require plaintext to generate meaningful embeddings or search results.

-   **Keyword Search on Encrypted Fields:**
    *   **Limitation:** Direct keyword search on the full, original `resumeText` (or other encrypted fields like `phone`, `address`) is **not possible** while the data is encrypted at rest in the database.
    *   **Potential Workaround (Not Implemented):** For limited keyword searchability on `resumeText`, a possible strategy (not currently implemented) would be to extract a non-sensitive summary or a list of keywords from the resume *before* encryption. This summary/keyword list could then be stored in a separate, unencrypted field in the database, which could be indexed and searched. This approach involves a trade-off between searchability and data minimization/complexity, as the extracted keywords might themselves reveal sensitive information if not carefully curated.

-   **Vector Search (e.g., Pinecone using OpenAI Embeddings):**
    *   **Process:**
        1.  When a candidate's resume is first processed (e.g., in `pages/api/parse-resume.ts`), the **original, plaintext `resumeText`** is used to generate a vector embedding (e.g., via OpenAI's API).
        2.  This plaintext `resumeText` is held in memory only for the duration of the embedding generation.
        3.  The generated vector embedding is then stored in Pinecone (or another vector database).
        4.  Concurrently, the `resumeText` is **encrypted** using `encrypt()` before being saved to the main application database (Prisma/PostgreSQL).
    *   **Data Flow for Embeddings:** The key point is that the `resumeText` sent to the OpenAI API for embedding generation is always the **plaintext** version. The encrypted version stored in the application's primary database is not sent to OpenAI or Pinecone.
    *   **Search Queries:** When a user performs a semantic search, their search query is converted into an embedding, and this query embedding is used to find similar embeddings in Pinecone. The results from Pinecone are typically IDs of candidates, which are then used to fetch full candidate details (including encrypted fields) from the application database. These fields are then decrypted before being returned to the user.

-   **Overall Limitations:**
    *   Full-text keyword search on the complete, original `resumeText` is not supported due to encryption.
    *   Search functionality primarily relies on:
        *   Searching unencrypted fields in the database (e.g., `name`, `email`, `title`, `skills` if stored unencrypted or as a separate searchable array).
        *   Vector similarity search on embeddings generated from the (decrypted at point of generation) `resumeText`.

This policy ensures that sensitive data is protected at rest while outlining the necessary steps and trade-offs for maintaining search functionality.
