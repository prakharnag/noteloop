/**
 * Vector embedding generation using OpenAI embeddings API
 */

import OpenAI from 'openai';

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generate embedding for a single text chunk
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await getOpenAIClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      encoding_format: 'float',
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('[Embeddings] Error generating embedding:', error);
    throw new Error(
      `Failed to generate embedding: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Generate embeddings for multiple text chunks in batch
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  try {
    // OpenAI allows batch processing
    // Split into batches (max 2048 inputs per request, but we use 100 for safety)
    const batchSize = 100;
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      console.log(
        `[Embeddings] Generating embeddings for batch ${Math.floor(i / batchSize) + 1} (${
          batch.length
        } chunks)`
      );

      const response = await getOpenAIClient().embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
        encoding_format: 'float',
      });

      embeddings.push(...response.data.map((item) => item.embedding));
    }

    return embeddings;
  } catch (error) {
    console.error('[Embeddings] Error generating batch embeddings:', error);
    throw new Error(
      `Failed to generate batch embeddings: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}
