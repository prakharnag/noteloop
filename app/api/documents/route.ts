/**
 * API endpoint for document management
 * GET /api/documents?user_id=xxx - List all documents for a user
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/db/supabase';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    console.log(`[Documents API] Fetching documents for user ${userId}`);

    const supabase = getSupabaseClient();

    // Fetch all documents for the user
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, title, source_type, source_uri, created_at, ingested_at, tags')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Documents API] Error fetching documents:', error);
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }

    // Filter out failed documents and get chunk count for each document
    const validDocuments = (documents || []).filter(
      (doc) => !doc.tags.includes('failed')
    );

    const documentsWithChunkCount = await Promise.all(
      validDocuments.map(async (doc) => {
        const { count } = await supabase
          .from('chunks')
          .select('*', { count: 'exact', head: true })
          .eq('document_id', doc.id);

        return {
          ...doc,
          chunk_count: count || 0,
        };
      })
    );

    console.log(`[Documents API] Found ${documentsWithChunkCount.length} valid documents (${(documents || []).length - validDocuments.length} failed documents excluded)`);

    return NextResponse.json({
      documents: documentsWithChunkCount,
    });

  } catch (error) {
    console.error('[Documents API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch documents',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
