/**
 * API endpoint to check document processing status
 * GET /api/ingest/status/:id
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/db/supabase';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Get document with chunks
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Get chunks count
    const { count: chunksCount, error: chunksError } = await supabase
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', documentId);

    if (chunksError) {
      // Silently handle chunk count errors
    }

    // Determine status from tags and chunks
    // If chunks exist, consider it completed even if tag isn't set yet
    let status: 'processing' | 'completed' | 'failed';
    if (document.tags.includes('failed')) {
      status = 'failed';
    } else if (document.tags.includes('completed') || (chunksCount && chunksCount > 0)) {
      // Completed if tag is set OR if chunks exist (more reliable)
      status = 'completed';
    } else {
      status = 'processing';
    }

    return NextResponse.json({
      document_id: documentId,
      status,
      title: document.title,
      source_type: document.source_type,
      created_at: document.created_at,
      ingested_at: document.ingested_at,
      chunks_count: chunksCount || 0,
      tags: document.tags.filter(t => !['processing', 'completed', 'failed'].includes(t)),
      message:
        status === 'completed'
          ? `Processing complete. ${chunksCount} chunks created.`
          : status === 'failed'
          ? 'Processing failed. Please try uploading again.'
          : 'Processing in progress...',
    });

  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to get document status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
