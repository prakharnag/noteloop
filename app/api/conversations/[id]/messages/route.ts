/**
 * API endpoint for getting messages for a specific conversation
 * GET /api/conversations/[id]/messages
 */

import { NextRequest, NextResponse } from 'next/server';
import { getConversationMessages } from '@/lib/db/conversations';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: conversationId } = await params;

    const messages = await getConversationMessages(conversationId);

    return NextResponse.json({
      conversation_id: conversationId,
      messages,
      count: messages.length,
    });
  } catch (error) {
    console.error('[Conversation Messages API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch messages',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
