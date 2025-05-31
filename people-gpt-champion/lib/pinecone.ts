// In people-gpt-champion/lib/pinecone.ts
import { Pinecone, Index, QueryResponse as PineconeQueryResponse } from '@pinecone-database/pinecone'; // Renamed QueryResponse to avoid conflict
import CircuitBreaker from 'opossum';

let pineconeClient: Pinecone | null = null;
let pineconeIndexCache: Index | null = null; // Cache the index object

const getPineconeClientInstance = (): Pinecone => {
  if (!process.env.PINECONE_API_KEY) {
    throw new Error('Pinecone API key (PINECONE_API_KEY) not configured');
  }
  if (pineconeClient) {
    return pineconeClient;
  }
  pineconeClient = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  return pineconeClient;
};

export const getPineconeIndex = (): Index => {
  if (pineconeIndexCache) {
    return pineconeIndexCache;
  }
  if (!process.env.PINECONE_INDEX_NAME) {
    throw new Error('Pinecone index name (PINECONE_INDEX_NAME) not configured.');
  }
  const client = getPineconeClientInstance();
  const indexName = process.env.PINECONE_INDEX_NAME;
  pineconeIndexCache = client.Index(indexName);
  return pineconeIndexCache;
};

// Options for Pinecone circuit breaker
const pineconeCircuitOptions: CircuitBreaker.Options = {
  timeout: 10000, // 10s for Pinecone query
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  name: 'PineconeQuery',
};

// Original function to be wrapped
// Note: The parameters must be passed as a single object for Opossum to correctly type them if generic,
// or explicitly typed as in the example. Here, we'll pass them as separate args to fire()
const originalQueryPinecone = async (embedding: number[], topK: number): Promise<PineconeQueryResponse> => {
  const index = getPineconeIndex(); // This ensures index is initialized
  return index.query({
    vector: embedding,
    topK,
    includeMetadata: true,
  });
};

// Create circuit breaker for Pinecone queries
const queryPineconeBreaker = new CircuitBreaker(originalQueryPinecone, pineconeCircuitOptions);

// Updated queryPineconeIndex to use the breaker
export const queryPineconeIndex = async (embedding: number[], topK: number): Promise<any[]> => {
  try {
    // Opossum's .fire() method takes arguments that match the wrapped function's parameters
    const queryResponse = await queryPineconeBreaker.fire(embedding, topK);
    return queryResponse.matches || [];
  } catch (error: any) {
    console.error('Error querying Pinecone index (via breaker):', error.message);
    if (error.code === 'EOPENBREAKER') {
      console.warn('Pinecone circuit breaker is open.');
      // Potentially re-throw a more specific error or a custom error
      // to be handled by the API layer for a 503 response.
    }
    throw error; // Re-throw the error to be caught by the caller
  }
};

// Export the original client getter if needed elsewhere, though getPineconeIndex is more direct for operations.
// Renaming to avoid conflict if old getPineconeClient existed with different caching.
export { getPineconeClientInstance as getPineconeClient };
