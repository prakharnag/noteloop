/**
 * Document processing pipeline for PDF and Markdown files
 * Extracts text and metadata from documents
 */

import { ProcessedContent } from '@/types';
import { readFile } from 'fs/promises';
import { extractText } from 'unpdf';

/**
 * Process PDF document and extract text
 */
export async function processPDF(filePath: string): Promise<ProcessedContent> {
  try {
    console.log(`[DocumentProcessor] Processing PDF file: ${filePath}`);

    // Read PDF file
    const dataBuffer = await readFile(filePath);

    // Parse PDF using unpdf (requires Uint8Array)
    const { text: textPages, totalPages } = await extractText(new Uint8Array(dataBuffer));

    // Join all pages into a single text string
    const text = textPages.join('\n\n');

    console.log(
      `[DocumentProcessor] PDF parsed. Pages: ${totalPages}, Text length: ${text.length}`
    );

    // Extract text and metadata
    const metadata = {
      pages: totalPages,
      processor: 'unpdf',
      char_count: text.length,
    };

    return {
      text,
      metadata,
    };
  } catch (error) {
    console.error('[DocumentProcessor] Error processing PDF:', error);
    throw new Error(
      `Failed to process PDF file: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Process PDF from buffer
 */
export async function processPDFFromBuffer(
  buffer: Buffer,
  filename: string
): Promise<ProcessedContent> {
  try {
    console.log(`[DocumentProcessor] Processing PDF buffer: ${filename}`);

    // Parse PDF using unpdf (requires Uint8Array)
    const { text: textPages, totalPages } = await extractText(new Uint8Array(buffer));

    // Join all pages into a single text string
    const text = textPages.join('\n\n');

    console.log(`[DocumentProcessor] Extracted text from ${totalPages} pages, total chars: ${text.length}`);

    // Keep original language - no translation during ingestion
    const metadata = {
      pages: totalPages,
      processor: 'unpdf',
      filename,
      char_count: text.length,
    };

    return {
      text,
      metadata,
    };
  } catch (error) {
    console.error('[DocumentProcessor] Error processing PDF buffer:', error);
    throw new Error(
      `Failed to process PDF buffer: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Process Markdown document and extract text
 */
export async function processMarkdown(
  filePath: string
): Promise<ProcessedContent> {
  try {
    console.log(`[DocumentProcessor] Processing Markdown file: ${filePath}`);

    // Read markdown file
    const text = await readFile(filePath, 'utf-8');

    console.log(
      `[DocumentProcessor] Markdown read. Text length: ${text.length}`
    );

    // Extract metadata from frontmatter if present
    const metadata = extractMarkdownMetadata(text);

    return {
      text,
      metadata: {
        processor: 'markdown',
        char_count: text.length,
        ...metadata,
      },
    };
  } catch (error) {
    console.error('[DocumentProcessor] Error processing Markdown:', error);
    throw new Error(
      `Failed to process Markdown file: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Process Markdown from buffer
 */
export async function processMarkdownFromBuffer(
  buffer: Buffer,
  filename: string
): Promise<ProcessedContent> {
  try {
    console.log(`[DocumentProcessor] Processing Markdown buffer: ${filename}`);

    const text = buffer.toString('utf-8');
    const frontmatterMetadata = extractMarkdownMetadata(text);

    // Keep original language - no translation during ingestion
    return {
      text,
      metadata: {
        processor: 'markdown',
        filename,
        char_count: text.length,
        ...frontmatterMetadata,
      },
    };
  } catch (error) {
    console.error(
      '[DocumentProcessor] Error processing Markdown buffer:',
      error
    );
    throw new Error(
      `Failed to process Markdown buffer: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Extract metadata from Markdown frontmatter (YAML)
 * Example:
 * ---
 * title: My Document
 * author: John Doe
 * date: 2024-01-01
 * ---
 */
function extractMarkdownMetadata(text: string): Record<string, any> {
  const metadata: Record<string, any> = {};

  // Check for YAML frontmatter
  const frontmatterMatch = text.match(/^---\n([\s\S]*?)\n---/);

  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const lines = frontmatter.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        metadata[key] = value.trim();
      }
    }
  }

  // Extract first heading as title if no frontmatter title
  if (!metadata.title) {
    const headingMatch = text.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      metadata.title = headingMatch[1];
    }
  }

  return metadata;
}

/**
 * Validate document file format
 */
export function isValidDocumentFile(filename: string): boolean {
  const validExtensions = ['pdf', 'md', 'markdown'];
  const ext = filename.split('.').pop()?.toLowerCase();
  return validExtensions.includes(ext || '');
}

/**
 * Determine document type from filename
 */
export function getDocumentType(
  filename: string
): 'pdf' | 'markdown' | 'unknown' {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  return 'unknown';
}
