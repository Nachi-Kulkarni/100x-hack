import { Pinecone } from '@pinecone-database/pinecone';

let pineconeClient: Pinecone | null = null;

const getPineconeClient = async (): Promise<Pinecone> => {
  if (!process.env.PINECONE_API_KEY) {
    throw new Error('Pinecone API key (PINECONE_API_KEY) not configured');
  }

  // For Pinecone client v3.x and later, environment is not directly used in client instantiation.
  // The full index host is used when connecting to an index.
  // We'll check for PINECONE_HOST as a general configuration for the service.
  if (!process.env.PINECONE_HOST) {
    throw new Error('Pinecone host (PINECONE_HOST) not configured. This should be your full index host URL.');
  }

  if (pineconeClient) {
    return pineconeClient;
  }

  pineconeClient = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
    // The 'environment' parameter is deprecated/removed in recent client versions.
    // The full host for an index is typically specified when calling `pinecone.index(INDEX_NAME)`.
    // For example, some methods might take `host` directly, or it's part of the index name string.
  });

  return pineconeClient;
};

// Example of how you might get a specific index using the client
// Note: The exact method to specify the host can vary slightly between minor client versions.
// Refer to the official Pinecone documentation for the installed client version.
// const getPineconeIndex = async (indexNameFromEnvOrArg: string) => {
//   const client = await getPineconeClient();
//
//   if (!process.env.PINECONE_INDEX_NAME && !indexNameFromEnvOrArg) {
//     throw new Error('Pinecone index name not provided via environment or argument.');
//   }
//   const indexName = process.env.PINECONE_INDEX_NAME || indexNameFromEnvOrArg;
//
//   if (!process.env.PINECONE_HOST) { // This should be the full host for the specific index
//      throw new Error('Pinecone index host (PINECONE_HOST) not configured for index operations.');
//   }
//
//   // For client v3+, you often pass the full host directly when getting an index object.
//   // The method might be simply `client.index(indexName)` if the host was configured globally
//   // or if the indexName itself is the fully qualified host name.
//   // More commonly, you might need to specify the host if it's not inferred.
//   // Example: return client.index(indexName, process.env.PINECONE_HOST);
//   // Or, if the client is configured to use a specific host already:
//   // return client.index(indexName);
//   // For now, let's assume the host is specified when getting the index:
//   return client.Index(indexName, process.env.PINECONE_HOST);
//   // IMPORTANT: The actual method might be client.index(indexName) and the host is implicit
//   // or client.index({ host: process.env.PINECONE_HOST }).
//   // This part needs to be carefully checked against the installed client version's API.
//   // The example `client.Index(indexName, process.env.PINECONE_HOST)` is a placeholder.
//   // A common pattern is: `const index = pinecone.Index(PINECONE_INDEX_NAME, PINECONE_HOST_URL_FOR_THAT_INDEX);`
//   // Or `const index = pinecone.index(PINECONE_INDEX_NAME);` and the host is resolved.
//   // Let's use a safer approach that is more common with recent versions:
//   // Assuming PINECONE_HOST is the full URL to the index.
//   return client.index(process.env.PINECONE_HOST);

// };


export { getPineconeClient };

// TODO: Add functions for upserting, querying vectors, etc.
// Remember that the Pinecone index needs to be created with the correct dimensions
// (e.g., 1536 for OpenAI's text-embedding-ada-002).
