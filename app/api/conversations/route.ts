/**
 * API endpoint for managing conversations
 * GET /api/conversations - Get all conversations for a user
 * POST /api/conversations - Create a new conversation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserConversations, createConversation } from '@/lib/db/conversations';

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

    const conversations = await getUserConversations(userId);

    return NextResponse.json({
      conversations,
      count: conversations.length,
    });
  } catch (error) {
    console.error('[Conversations API] Error fetching conversations:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch conversations',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, title } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    const conversation = await createConversation(user_id, title);

    return NextResponse.json({
      conversation,
      message: 'Conversation created successfully',
    });
  } catch (error) {
    console.error('[Conversations API] Error creating conversation:', error);
    return NextResponse.json(
      {
        error: 'Failed to create conversation',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
