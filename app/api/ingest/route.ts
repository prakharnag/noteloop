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

    console.log(`[Ingest API] Received file: ${file.name} for user: ${userId}`);

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

    // Upload to Supabase Storage
    console.log(`[Ingest API] Uploading file to Supabase Storage...`);
    const { path: storagePath, publicUrl } = await uploadFile(
      supabase,
      buffer,
      file.name,
      userId
    );

    console.log(`[Ingest API] File uploaded to: ${storagePath}`);

    // Create document record with "processing" tag
    const document = await createDocument({
      user_id: userId,
      title: title || file.name,
      source_type: sourceType,
      source_uri: storagePath, // Store Supabase Storage path
      tags: ['processing', ...(tags ? tags.split(',').map(t => t.trim()) : [])],
    });

    console.log(`[Ingest API] Created document: ${document.id}`);

    // Start async processing (don't await - let it run in background)
    processDocumentAsync(document.id, storagePath, sourceType, userId)
      .then(() => {
        console.log(`[Ingest API] ✓ Background processing completed for: ${document.id}`);
      })
      .catch((error) => {
        console.error(`[Ingest API] ✗ Background processing failed for: ${document.id}`, error);
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
