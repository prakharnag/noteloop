/**
 * Async background processor for documents
 * Processes uploaded files in the background without blocking the API
 */

import { processAudio } from './audio';
import { processPDF, processMarkdown } from './document';
import { chunkText } from '@/lib/chunking';
import { generateEmbeddings } from '@/lib/vectordb/embeddings';
import { upsertVectors } from '@/lib/vectordb/pinecone';
import { createChunks, getSupabaseClient } from '@/lib/db/supabase';
import { downloadFile } from '@/lib/storage/supabase-storage';
import type { SourceType } from '@/types';

export async function processDocumentAsync(
  documentId: string,
  filePath: string,
  sourceType: SourceType,
  userId: string
): Promise<void> {
  console.log(`[AsyncProcessor] Starting background processing for document: ${documentId}`);

  try {
    // Step 1: Download file from Supabase Storage
    console.log(`[AsyncProcessor] Downloading file from storage: ${filePath}`);
    const fileBuffer = await downloadFile(filePath);

    // Step 2: Process the file based on type
    console.log(`[AsyncProcessor] Processing ${sourceType} file...`);
    let processedContent;

    if (sourceType === 'audio') {
      // For audio, we need to save to temp file first (Whisper API requires file path)
      const { writeFile, unlink } = await import('fs/promises');
      const tmpPath = `/tmp/${documentId}-audio`;
      await writeFile(tmpPath, fileBuffer);

      try {
        processedContent = await processAudio(tmpPath);
        await unlink(tmpPath); // Clean up
      } catch (error) {
        await unlink(tmpPath); // Clean up on error
        throw error;
      }
    } else if (sourceType === 'pdf') {
      processedContent = await (await import('./document')).processPDFFromBuffer(
        fileBuffer,
        filePath.split('/').pop() || 'document.pdf'
      );
    } else {
      processedContent = await (await import('./document')).processMarkdownFromBuffer(
        fileBuffer,
        filePath.split('/').pop() || 'document.md'
      );
    }

    // Step 3: Chunk the content
    console.log('[AsyncProcessor] Chunking content...');
    const chunks = chunkText(processedContent.text, {
      maxTokens: 512,
      overlap: 50,
      preserveParagraphs: true,
    });

    console.log(`[AsyncProcessor] Created ${chunks.length} chunks`);

    // Step 4: Generate embeddings
    console.log('[AsyncProcessor] Generating embeddings...');
    const embeddings = await generateEmbeddings(chunks);

    // Step 5: Get document info
    const supabase = getSupabaseClient();
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Step 6: Create chunk records
    const chunkRecords = chunks.map((chunkText, index) => ({
      document_id: documentId,
      chunk_index: index,
      chunk_text: chunkText,
      embedding_id: `${documentId}-${index}`,
      processed_flag: true,
      metadata: {
        char_count: chunkText.length,
        ...processedContent.metadata,
      },
    }));

    console.log('[AsyncProcessor] Saving chunks to database...');
    await createChunks(chunkRecords);

    // Step 7: Upload vectors to Pinecone
    const vectors = embeddings.map((embedding, index) => ({
      id: `${documentId}-${index}`,
      values: embedding,
      metadata: {
        user_id: userId,
        document_id: documentId,
        chunk_index: index,
        source_type: sourceType,
        created_at: document.created_at,
        ingested_at: document.ingested_at,
        tags: document.tags,
        title: document.title,
      },
    }));

    console.log('[AsyncProcessor] Uploading vectors to Pinecone...');
    await upsertVectors(vectors);

    // Step 8: Update document with processing complete tag
    await supabase
      .from('documents')
      .update({
        tags: [...document.tags.filter(t => t !== 'processing'), 'completed']
      })
      .eq('id', documentId);

    console.log(`[AsyncProcessor] Successfully completed processing for document: ${documentId}`);

  } catch (error) {
    console.error(`[AsyncProcessor] Error processing document ${documentId}:`, error);

    // Mark document as failed
    const supabase = getSupabaseClient();
    await supabase
      .from('documents')
      .update({
        tags: ['failed']
      })
      .eq('id', documentId);

    throw error;
  }
}
