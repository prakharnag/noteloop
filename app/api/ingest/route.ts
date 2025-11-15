/**
 * API endpoint for ingesting content (audio and documents)
 * POST /api/ingest - Asynchronous processing with Supabase Storage
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDocumentType } from '@/lib/processors/document';
import { createDocument } from '@/lib/db/supabase';
import { uploadFile } from '@/lib/storage/supabase-storage';
import { processDocumentAsync } from '@/lib/processors/async-processor';
import { createClient } from '@/lib/auth/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 30; // Only for upload, not processing

export async function POST(request: NextRequest) {
  try {
    // Get authenticated Supabase client
    const supabase = await createClient();

    const formData = await request.formData();

    // Extract form data
    const file = formData.get('file') as File | null;
    const userId = formData.get('user_id') as string;
    const title = formData.get('title') as string | null;
    const tags = formData.get('tags') as string | null;

    // Validation
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    const uploadStartTime = Date.now();
    console.log(`[Ingest API] Received file: ${file.name} for user: ${userId}`);
    console.log(`[Ingest API] File size: ${file.size} bytes (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    // Determine source type
    const docType = getDocumentType(file.name);
    let sourceType: 'audio' | 'pdf' | 'markdown';

    if (docType === 'pdf') {
      sourceType = 'pdf';
    } else if (docType === 'markdown') {
      sourceType = 'markdown';
    } else if (file.name.match(/\.(flac|m4a|mp3|mp4|mpeg|mpga|oga|ogg|wav|webm)$/i)) {
      sourceType = 'audio';
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Supported: PDF, Markdown, Audio (mp3, m4a, wav, flac, ogg, webm, mp4, mpeg, mpga, oga)' },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Validate that we can extract text before uploading
    // For PDF/Markdown: Quick validation
    // For Audio: We'll validate during processing, but check file is readable
    console.log(`[Ingest API] Validating file can be processed...`);
    let canProcess = false;
    
    try {
      if (sourceType === 'pdf') {
        const { processPDFFromBuffer } = await import('@/lib/processors/document');
        const processedContent = await processPDFFromBuffer(buffer, file.name);
        if (!processedContent.text || processedContent.text.trim().length === 0) {
          throw new Error('No text content could be extracted from this PDF. It may be an image-only PDF or corrupted file.');
        }
        canProcess = true;
        console.log(`[Ingest API] PDF validation passed. Extracted ${processedContent.text.length} characters.`);
      } else if (sourceType === 'markdown') {
        const { processMarkdownFromBuffer } = await import('@/lib/processors/document');
        const processedContent = await processMarkdownFromBuffer(buffer, file.name);
        if (!processedContent.text || processedContent.text.trim().length === 0) {
          throw new Error('No text content could be extracted from this Markdown file.');
        }
        canProcess = true;
        console.log(`[Ingest API] Markdown validation passed. Extracted ${processedContent.text.length} characters.`);
      } else if (sourceType === 'audio') {
        // For audio, we can't do quick validation (transcription takes time)
        // But we can check if the file buffer is valid
        if (buffer.length === 0) {
          throw new Error('Audio file appears to be empty or corrupted.');
        }
        canProcess = true;
        console.log(`[Ingest API] Audio file validation passed. File size: ${buffer.length} bytes.`);
      }
    } catch (validationError) {
      const errorMessage = validationError instanceof Error 
        ? validationError.message 
        : 'File validation failed. Unable to extract text from this file.';
      
      console.error(`[Ingest API] Validation failed:`, errorMessage);
      return NextResponse.json(
        {
          error: 'File validation failed',
          details: errorMessage,
        },
        { status: 400 }
      );
    }

    if (!canProcess) {
      return NextResponse.json(
        {
          error: 'Unable to process this file type',
          details: 'File validation failed. Please ensure the file is not corrupted and contains extractable content.',
        },
        { status: 400 }
      );
    }

    // Upload to Supabase Storage (only after validation passes)
    const storageUploadStartTime = Date.now();
    console.log(`[Ingest API] Uploading file to Supabase Storage...`);
    const { path: storagePath, publicUrl } = await uploadFile(
      supabase,
      buffer,
      file.name,
      userId
    );
    const storageUploadDuration = Date.now() - storageUploadStartTime;
    console.log(`[Ingest API] File uploaded to: ${storagePath}`);
    console.log(`[Ingest API] Storage upload took: ${(storageUploadDuration / 1000).toFixed(2)} seconds`);

    // Create document record with "processing" tag
    const document = await createDocument({
      user_id: userId,
      title: title || file.name,
      source_type: sourceType,
      source_uri: storagePath, // Store Supabase Storage path
      tags: ['processing', ...(tags ? tags.split(',').map(t => t.trim()) : [])],
    });

    console.log(`[Ingest API] Created document: ${document.id}`);
    
    const totalUploadDuration = Date.now() - uploadStartTime;
    console.log(`[Ingest API] Total upload and setup time: ${(totalUploadDuration / 1000).toFixed(2)} seconds`);

    // Start async processing (don't await - let it run in background)
    // For PDF/Markdown, we already validated text extraction, so processing should succeed
    // For Audio, validation happens during transcription
    processDocumentAsync(document.id, storagePath, sourceType, userId)
      .then(() => {
        console.log(`[Ingest API] ✓ Background processing completed for: ${document.id}`);
      })
      .catch(async (error) => {
        console.error(`[Ingest API] ✗ Background processing failed for: ${document.id}`, error);
        
        // If processing fails after upload, clean up: delete from storage and mark as failed
        try {
          const { deleteFile } = await import('@/lib/storage/supabase-storage');
          await deleteFile(storagePath);
          console.log(`[Ingest API] Cleaned up storage file: ${storagePath}`);
        } catch (cleanupError) {
          console.error(`[Ingest API] Failed to clean up storage file:`, cleanupError);
        }
      });

    // Return immediately with processing status
    return NextResponse.json({
      document_id: document.id,
      status: 'processing',
      message: `File uploaded successfully. Processing ${file.name} in background.`,
      storage_path: storagePath,
      public_url: publicUrl,
      check_status_url: `/api/ingest/status/${document.id}`,
    }, { status: 202 }); // 202 Accepted

  } catch (error) {
    console.error('[Ingest API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload file',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
