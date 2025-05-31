// In people-gpt-champion/lib/openai.ts
import OpenAI from 'openai';
import CircuitBreaker from 'opossum';

// Function to get an OpenAI client instance
const getOpenAIClientInstance = (): OpenAI => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
};

// Generic options for OpenAI circuit breakers
const openaiCircuitOptions: CircuitBreaker.Options = {
  timeout: 15000, // 15s default timeout
  errorThresholdPercentage: 50,
  resetTimeout: 30000, // 30s before trying again
};

// Wrapped function for chat completions
const guardedCreateChatCompletion = async (params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.Completions.ChatCompletion> => {
  const client = getOpenAIClientInstance();
  return client.chat.completions.create(params);
};
export const chatCompletionBreaker = new CircuitBreaker(guardedCreateChatCompletion, { ...openaiCircuitOptions, name: 'OpenAIChatCompletion', timeout: 20000 /* 20s for GPT-4 */ });

// Wrapped function for embeddings
// This replaces the old getEmbedding function
const guardedGetEmbedding = async (text: string): Promise<number[]> => {
  const client = getOpenAIClientInstance();
  const embedding = await client.embeddings.create({
    model: 'text-embedding-3-large',
    input: text,
  });
  if (!embedding.data || embedding.data.length === 0 || !embedding.data[0].embedding) {
    throw new Error('No embedding data returned from OpenAI');
  }
  return embedding.data[0].embedding;
};
export const getEmbeddingBreaker = new CircuitBreaker(guardedGetEmbedding, { ...openaiCircuitOptions, name: 'OpenAIEmbedding', timeout: 5000 /* 5s for embeddings */ });

// Export the original client getter if needed elsewhere, though breakers are preferred
// Renaming to avoid conflict with the old getOpenAIClient if it was structured differently
export { getOpenAIClientInstance as getOpenAIClient };


// The old getEmbedding function is removed as its logic is now inside guardedGetEmbedding.
// The old getOpenAIClient which might have cached the client is replaced by getOpenAIClientInstance
// which returns a new client each time, as circuit breaker manages connections/state.
// If there was an old getChatCompletion, it's also implicitly replaced by using chatCompletionBreaker.fire().
