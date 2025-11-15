/**
 * Async background processor for documents
 * Processes uploaded files in the background without blocking the API
 */

import { processAudio, processAudioFromBuffer } from './audio';
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
  const totalStartTime = Date.now();
  console.log(`[AsyncProcessor] Starting background processing for document: ${documentId}`);

  try {
    // Step 1: Download file from Supabase Storage
    console.log(`[AsyncProcessor] Downloading file from storage: ${filePath}`);
    const fileBuffer = await downloadFile(filePath);

    // Step 2: Process the file based on type
    console.log(`[AsyncProcessor] Processing ${sourceType} file...`);
    let processedContent;

    if (sourceType === 'audio') {
      // Process audio directly from buffer - no need to write to disk first
      const originalFilename = filePath.split('/').pop() || 'audio.mp3';
      const audioStartTime = Date.now();
      
      console.log(`[AsyncProcessor] Starting audio transcription from buffer...`);
      console.log(`[AsyncProcessor] File size: ${fileBuffer.length} bytes (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

      try {
        processedContent = await processAudioFromBuffer(fileBuffer, originalFilename);
        const audioDuration = Date.now() - audioStartTime;
        console.log(`[AsyncProcessor] Audio transcription completed in ${(audioDuration / 1000).toFixed(2)}s. Text length: ${processedContent.text.length} characters`);
      } catch (error) {
        console.error(`[AsyncProcessor] Error during audio transcription:`, error);
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
    const chunkStartTime = Date.now();
    console.log('[AsyncProcessor] Chunking content...');
    console.log(`[AsyncProcessor] Content length: ${processedContent.text.length} characters`);
    
    if (!processedContent.text || processedContent.text.trim().length === 0) {
      throw new Error('No text content extracted from file');
    }

    const chunks = chunkText(processedContent.text, {
      maxTokens: 512,
      overlap: 50,
      preserveParagraphs: true,
    });
    
    const chunkDuration = Date.now() - chunkStartTime;
    console.log(`[AsyncProcessor] Created ${chunks.length} chunks in ${(chunkDuration / 1000).toFixed(2)}s`);

      if (chunks.length === 0) {
        // Likely an image-only PDF or extractor produced no text.
        // Instead of throwing and failing the background job, mark the document
        // with a 'no_text' tag so it can be handled (OCR/manual review) later.
        console.warn(
          `[AsyncProcessor] No chunks created for document ${documentId} — possibly image-only PDF or empty content. Marking document with 'no_text' tag and skipping vectorization.`
        );

        try {
          const supabaseForNoText = getSupabaseClient();
          const { data: existingDoc, error: fetchErr } = await supabaseForNoText
            .from('documents')
            .select('*')
            .eq('id', documentId)
            .single();

          const newTags = fetchErr || !existingDoc
            ? ['no_text']
            : [...(existingDoc.tags || []).filter((t: string) => t !== 'processing'), 'no_text'];

          await supabaseForNoText
            .from('documents')
            .update({ tags: newTags })
            .eq('id', documentId);
        } catch (tagErr) {
          console.error(
            `[AsyncProcessor] Failed to update document ${documentId} tags for no_text fallback:`,
            tagErr
          );
        }

        // Stop further processing for this document
        return;
      }

    // Step 4: Generate embeddings and prepare chunk records in parallel
    const embeddingStartTime = Date.now();
    console.log(`[AsyncProcessor] Generating embeddings for ${chunks.length} chunks...`);
    
    // Get document info early (needed for chunk records)
    const supabase = getSupabaseClient();
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    // Generate embeddings in parallel with preparing chunk records
    const [embeddings] = await Promise.all([
      generateEmbeddings(chunks),
    ]);
    
    const embeddingDuration = Date.now() - embeddingStartTime;
    console.log(`[AsyncProcessor] Generated ${embeddings.length} embeddings in ${(embeddingDuration / 1000).toFixed(2)}s`);

    // Step 5: Create chunk records and prepare vectors
    const saveStartTime = Date.now();
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

    // Step 6: Save chunks and upload vectors in parallel
    console.log(`[AsyncProcessor] Saving ${chunkRecords.length} chunks and uploading ${vectors.length} vectors in parallel...`);
    await Promise.all([
      createChunks(chunkRecords),
      upsertVectors(vectors),
    ]);
    
    const saveDuration = Date.now() - saveStartTime;
    console.log(`[AsyncProcessor] Chunks saved and vectors uploaded in ${(saveDuration / 1000).toFixed(2)}s`);

    // Step 7: Update document with processing complete tag
    await supabase
      .from('documents')
      .update({
        tags: [...document.tags.filter(t => t !== 'processing'), 'completed']
      })
      .eq('id', documentId);

    const totalDuration = Date.now() - totalStartTime;
    console.log(`[AsyncProcessor] Successfully completed processing for document: ${documentId}`);
    console.log(`[AsyncProcessor] Total processing time: ${(totalDuration / 1000).toFixed(2)}s`);

  } catch (error) {
    console.error(`[AsyncProcessor] Error processing document ${documentId}:`, error);
    console.error(`[AsyncProcessor] Error details:`, error instanceof Error ? error.stack : error);

    // Mark document as failed - ensure this always happens
    try {
      const supabase = getSupabaseClient();
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          tags: ['failed']
        })
        .eq('id', documentId);
      
      if (updateError) {
        console.error(`[AsyncProcessor] Failed to mark document as failed:`, updateError);
      } else {
        console.log(`[AsyncProcessor] Document ${documentId} marked as failed`);
      }
    } catch (markError) {
      console.error(`[AsyncProcessor] Critical error marking document as failed:`, markError);
    }

    throw error;
  }
}
