/**
 * API endpoint for managing individual conversations
 * PATCH /api/conversations/[id] - Update conversation (rename)
 * DELETE /api/conversations/[id] - Delete conversation
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  updateConversationTitle,
  deleteConversation,
} from '@/lib/db/conversations';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const {id: conversationId} = await params;
    const body = await request.json();
    const { title } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'title is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    await updateConversationTitle(conversationId, title.trim());

    return NextResponse.json({
      message: 'Conversation updated successfully',
    });
  } catch (error) {
    console.error('[Conversations API] Error updating conversation:', error);
    return NextResponse.json(
      {
        error: 'Failed to update conversation',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const {id: conversationId} = await params;

    await deleteConversation(conversationId);

    return NextResponse.json({
      message: 'Conversation deleted successfully',
    });
  } catch (error) {
    console.error('[Conversations API] Error deleting conversation:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete conversation',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

