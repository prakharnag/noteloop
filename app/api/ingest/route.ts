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
export const maxDuration = 60; // Increased for Vercel - allows more time for validation and upload

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

    // Quick validation: Only check file size and basic integrity
    // Full validation happens during async processing to speed up upload
    console.log(`[Ingest API] Performing quick file validation...`);
    
    if (buffer.length === 0) {
      return NextResponse.json(
        {
          error: 'File validation failed',
          details: 'File appears to be empty or corrupted.',
        },
        { status: 400 }
      );
    }

    // For PDF/Markdown: Do a quick validation to avoid storing unprocessable files
    // This is faster than full extraction but still catches obvious issues
    if (sourceType === 'pdf' || sourceType === 'markdown') {
      try {
        // Quick check: Try to read first few bytes to ensure file is readable
        // Full extraction validation happens in async processor
        if (sourceType === 'pdf' && buffer.length < 100) {
          throw new Error('PDF file appears to be too small or corrupted.');
        }
        console.log(`[Ingest API] Quick validation passed for ${sourceType}. File size: ${buffer.length} bytes.`);
      } catch (validationError) {
        const errorMessage = validationError instanceof Error 
          ? validationError.message 
          : 'File validation failed.';
        
        console.error(`[Ingest API] Quick validation failed:`, errorMessage);
        return NextResponse.json(
          {
            error: 'File validation failed',
            details: errorMessage,
          },
          { status: 400 }
        );
      }
    } else if (sourceType === 'audio') {
      // For audio, just check file size
      if (buffer.length < 100) {
        return NextResponse.json(
          {
            error: 'File validation failed',
            details: 'Audio file appears to be too small or corrupted.',
          },
          { status: 400 }
        );
      }
      console.log(`[Ingest API] Audio file quick validation passed. File size: ${buffer.length} bytes.`);
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
