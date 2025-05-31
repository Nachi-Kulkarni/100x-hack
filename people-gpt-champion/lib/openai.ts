import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  if (openaiClient) {
    return openaiClient;
  }

  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  return openaiClient;
};

export { getOpenAIClient };

// TODO: Add functions for specific GPT-4 interactions, e.g., chat completions.
// Example:
// export const getChatCompletion = async (messages: OpenAI.Chat.ChatCompletionMessageParam[]) => {
//   const client = getOpenAIClient();
//   try {
//     const completion = await client.chat.completions.create({
//       model: 'gpt-4', // Or a specific version like gpt-4-turbo-preview
//       messages: messages,
//     });
//     return completion.choices[0]?.message?.content;
//   } catch (error) {
//     console.error('Error getting chat completion:', error);
//     throw error;
//   }
// };
