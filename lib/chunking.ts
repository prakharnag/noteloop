/**
 * Chunking utilities for text content
 * Uses rule-based chunking with fixed sizes and token limits
 */

export interface ChunkConfig {
  maxTokens?: number;
  overlap?: number;
  preserveParagraphs?: boolean;
}

const DEFAULT_CONFIG: Required<ChunkConfig> = {
  maxTokens: 512,
  overlap: 50,
  preserveParagraphs: true,
};

/**
 * Simple token estimation (approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks while maintaining context
 */
export function chunkText(text: string, config: ChunkConfig = {}): string[] {
  const { maxTokens, overlap, preserveParagraphs } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const chunks: string[] = [];

  if (preserveParagraphs) {
    // Split by paragraphs first
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

    let currentChunk = '';

    for (const paragraph of paragraphs) {
      const paragraphTokens = estimateTokens(paragraph);
      const currentTokens = estimateTokens(currentChunk);

      // If paragraph alone exceeds max, split it by sentences
      if (paragraphTokens > maxTokens) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
        for (const sentence of sentences) {
          const sentenceTokens = estimateTokens(sentence);
          const chunkTokens = estimateTokens(currentChunk);

          if (chunkTokens + sentenceTokens <= maxTokens) {
            currentChunk += ' ' + sentence;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = sentence;
          }
        }
      } else if (currentTokens + paragraphTokens <= maxTokens) {
        // Add paragraph to current chunk
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      } else {
        // Start new chunk
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = paragraph;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
  } else {
    // Simple splitting by max tokens
    const words = text.split(/\s+/);
    let currentChunk = '';

    for (const word of words) {
      const testChunk = currentChunk + (currentChunk ? ' ' : '') + word;
      if (estimateTokens(testChunk) <= maxTokens) {
        currentChunk = testChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = word;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }
  }

  // Add overlap between chunks if configured
  if (overlap > 0 && chunks.length > 1) {
    return addOverlap(chunks, overlap);
  }

  return chunks;
}

/**
 * Add overlapping content between chunks for better context continuity
 */
function addOverlap(chunks: string[], overlapTokens: number): string[] {
  const overlappedChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];

    // Add suffix from previous chunk
    if (i > 0) {
      const prevWords = chunks[i - 1].split(/\s+/);
      const overlapWords = prevWords.slice(-overlapTokens);
      chunk = overlapWords.join(' ') + ' ' + chunk;
    }

    overlappedChunks.push(chunk);
  }

  return overlappedChunks;
}

/**
 * Create chunk metadata
 */
export function createChunkMetadata(
  chunkText: string,
  index: number,
  totalChunks: number,
  additionalMetadata: Record<string, any> = {}
): Record<string, any> {
  return {
    chunk_index: index,
    total_chunks: totalChunks,
    char_count: chunkText.length,
    estimated_tokens: estimateTokens(chunkText),
    preview: chunkText.substring(0, 100) + (chunkText.length > 100 ? '...' : ''),
    ...additionalMetadata,
  };
}