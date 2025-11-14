/**
 * Pinecone vector database integration
 * Stores and retrieves vector embeddings with metadata
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { EMBEDDING_DIMENSIONS } from './embeddings';

// Initialize Pinecone client
let pineconeClient: Pinecone | null = null;

export function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error('PINECONE_API_KEY is not set');
    }

    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
  }

  return pineconeClient;
}

// Index name for the second brain
export const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'second-brain';

/**
 * Get or create Pinecone index
 */
export async function getOrCreateIndex() {
  const pinecone = getPineconeClient();

  try {
    // Check if index exists
    const indexes = await pinecone.listIndexes();
    const indexExists = indexes.indexes?.some((idx) => idx.name === INDEX_NAME);

    if (!indexExists) {
      console.log(`[Pinecone] Creating index: ${INDEX_NAME}`);
      await pinecone.createIndex({
        name: INDEX_NAME,
        dimension: EMBEDDING_DIMENSIONS,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      });

      // Wait for index to be ready
      console.log('[Pinecone] Waiting for index to be ready...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    return pinecone.index(INDEX_NAME);
  } catch (error) {
    console.error('[Pinecone] Error getting/creating index:', error);
    throw error;
  }
}

export interface ChunkMetadata extends Record<string, any> {
  user_id: string;
  document_id: string;
  chunk_index: number;
  source_type: 'audio' | 'pdf' | 'markdown';
  created_at: string;
  ingested_at: string;
  tags: string[];
  title: string;
  text?: string; // Optional: store original text for debugging
}

/**
 * Upsert vectors to Pinecone
 */
export async function upsertVectors(
  vectors: Array<{
    id: string;
    values: number[];
    metadata: ChunkMetadata;
  }>
) {
  try {
    const index = await getOrCreateIndex();

    console.log(`[Pinecone] Upserting ${vectors.length} vectors...`);

    // Pinecone accepts batches of up to 100 vectors
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await index.upsert(batch);
    }

    console.log('[Pinecone] Vectors upserted successfully');
  } catch (error) {
    console.error('[Pinecone] Error upserting vectors:', error);
    throw new Error(
      `Failed to upsert vectors: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Query Pinecone for similar vectors
 */
export async function queryVectors(
  queryVector: number[],
  options: {
    topK?: number;
    filter?: Record<string, any>;
    includeMetadata?: boolean;
  } = {}
) {
  try {
    const index = await getOrCreateIndex();

    const { topK = 10, filter, includeMetadata = true } = options;

    console.log(`[Pinecone] Querying for top ${topK} similar vectors...`);

    const results = await index.query({
      vector: queryVector,
      topK,
      filter,
      includeMetadata,
    });

    console.log(`[Pinecone] Found ${results.matches.length} matches`);

    return results.matches;
  } catch (error) {
    console.error('[Pinecone] Error querying vectors:', error);
    throw new Error(
      `Failed to query vectors: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Delete vectors by IDs
 */
export async function deleteVectors(ids: string[]) {
  try {
    const index = await getOrCreateIndex();

    console.log(`[Pinecone] Deleting ${ids.length} vectors...`);

    await index.deleteMany(ids);

    console.log('[Pinecone] Vectors deleted successfully');
  } catch (error) {
    console.error('[Pinecone] Error deleting vectors:', error);
    throw new Error(
      `Failed to delete vectors: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Delete all vectors for a specific document
 */
export async function deleteDocumentVectors(documentId: string) {
  try {
    const index = await getOrCreateIndex();

    console.log(`[Pinecone] Deleting vectors for document: ${documentId}`);

    await index.deleteMany({
      filter: { document_id: { $eq: documentId } },
    });

    console.log('[Pinecone] Document vectors deleted successfully');
  } catch (error) {
    console.error('[Pinecone] Error deleting document vectors:', error);
    throw new Error(
      `Failed to delete document vectors: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}
