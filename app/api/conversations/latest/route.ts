/**
 * API endpoint to get the latest conversation with messages
 * GET /api/conversations/latest?user_id=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateConversation, getConversationMessages } from '@/lib/db/conversations';

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

    console.log(`[Conversations API] Fetching latest conversation for user ${userId}`);

    // Get or create the latest conversation
    const conversation = await getOrCreateConversation(userId);

    // Get all messages in the conversation
    const messages = await getConversationMessages(conversation.id);

    console.log(`[Conversations API] Found conversation ${conversation.id} with ${messages.length} messages`);

    return NextResponse.json({
      conversation,
      messages,
    });

  } catch (error) {
    console.error('[Conversations API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch conversation',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
