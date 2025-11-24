/**
 * API endpoint for individual document operations
 * DELETE /api/documents/:id - Delete a document and all associated data
 * PATCH /api/documents/:id - Update document metadata (e.g., title)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/db/supabase';
import { deleteVectors } from '@/lib/vectordb/pinecone';
import { deleteFile } from '@/lib/storage/supabase-storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const {id: documentId} = await params;

    if (!documentId) {
      return NextResponse.json(
        { error: 'document_id is required' },
        { status: 400 }
      );
    }

    console.log(`[Documents API] Deleting document ${documentId}`);

    const supabase = getSupabaseClient();

    // Step 1: Get document details
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      console.error('[Documents API] Document not found:', docError);
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Step 2: Get all chunks for this document to get embedding IDs
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('embedding_id')
      .eq('document_id', documentId);

    if (chunksError) {
      console.error('[Documents API] Error fetching chunks:', chunksError);
    }

    // Step 3: Delete vectors from Pinecone
    if (chunks && chunks.length > 0) {
      try {
        const embeddingIds = chunks.map(chunk => chunk.embedding_id);
        console.log(`[Documents API] Deleting ${embeddingIds.length} vectors from Pinecone`);
        await deleteVectors(embeddingIds);
      } catch (error) {
        console.error('[Documents API] Error deleting vectors from Pinecone:', error);
        // Continue with deletion even if Pinecone fails
      }
    }

    // Step 4: Delete chunks from database (CASCADE will handle this, but being explicit)
    const { error: deleteChunksError } = await supabase
      .from('chunks')
      .delete()
      .eq('document_id', documentId);

    if (deleteChunksError) {
      console.error('[Documents API] Error deleting chunks:', deleteChunksError);
      // Continue with deletion
    }

    // Step 5: Delete file from Supabase Storage if it exists
    if (document.source_uri) {
      try {
        // Extract the file path from source_uri
        // Format is typically: user-id/file-id-filename
        const urlParts = document.source_uri.split('/');
        const bucketIndex = urlParts.indexOf('uploads');
        if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
          const filePath = urlParts.slice(bucketIndex + 1).join('/');
          console.log(`[Documents API] Deleting file from storage: ${filePath}`);
          await deleteFile(filePath);
        }
      } catch (error) {
        console.error('[Documents API] Error deleting file from storage:', error);
        // Continue with deletion
      }
    }

    // Step 6: Delete document from database
    const { error: deleteDocError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (deleteDocError) {
      console.error('[Documents API] Error deleting document:', deleteDocError);
      throw new Error(`Failed to delete document: ${deleteDocError.message}`);
    }

    console.log(`[Documents API] Successfully deleted document ${documentId}`);

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully',
    });

  } catch (error) {
    console.error('[Documents API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete document',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    if (!documentId) {
      return NextResponse.json(
        { error: 'document_id is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { title } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json(
        { error: 'title is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    console.log(`[Documents API] Updating document ${documentId} title to: ${title}`);

    const supabase = getSupabaseClient();

    // Check if document exists
    const { data: existingDoc, error: checkError } = await supabase
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .single();

    if (checkError || !existingDoc) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Update the document title
    const { data: updatedDoc, error: updateError } = await supabase
      .from('documents')
      .update({ title: title.trim() })
      .eq('id', documentId)
      .select()
      .single();

    if (updateError) {
      console.error('[Documents API] Error updating document:', updateError);
      throw new Error(`Failed to update document: ${updateError.message}`);
    }

    console.log(`[Documents API] Successfully updated document ${documentId}`);

    return NextResponse.json({
      success: true,
      document: updatedDoc,
    });

  } catch (error) {
    console.error('[Documents API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to update document',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
