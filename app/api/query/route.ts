/**
 * API endpoint for querying the knowledge base
 * POST /api/query
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateEmbedding } from '@/lib/vectordb/embeddings';
import { queryVectors } from '@/lib/vectordb/pinecone';
import { getSupabaseClient } from '@/lib/db/supabase';
import { getConversationMessages, addMessage, getOrCreateConversation } from '@/lib/db/conversations';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { user_id: userId, query, filters, conversation_id: conversationId } = body;

    // Validation
    if (!userId) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'query is required and must be a string' },
        { status: 400 }
      );
    }

    console.log(`[Query API] Processing query for user ${userId}: "${query}"`);

    // Get or create conversation
    let currentConversationId = conversationId;
    if (!currentConversationId) {
      const conversation = await getOrCreateConversation(userId);
      currentConversationId = conversation.id;
      console.log(`[Query API] Created/using conversation: ${currentConversationId}`);
    }

    // Get conversation history
    const previousMessages = await getConversationMessages(currentConversationId);
    console.log(`[Query API] Loaded ${previousMessages.length} previous messages`);

    // Step 1: Generate embedding for the query
    console.log('[Query API] Generating query embedding...');
    const queryEmbedding = await generateEmbedding(query);

    // Step 2: Build Pinecone filter
    const pineconeFilter: Record<string, any> = {
      user_id: { $eq: userId },
    };

    if (filters?.source_types && filters.source_types.length > 0) {
      pineconeFilter.source_type = { $in: filters.source_types };
    }

    if (filters?.tags && filters.tags.length > 0) {
      pineconeFilter.tags = { $in: filters.tags };
    }

    // Step 3: Query Pinecone for similar vectors
    console.log('[Query API] Querying vector database...');
    const matches = await queryVectors(queryEmbedding, {
      topK: filters?.topK || 5,
      filter: pineconeFilter,
      includeMetadata: true,
    });

    if (matches.length === 0) {
      return NextResponse.json({
        answer: "I couldn't find any relevant information in your knowledge base to answer this question.",
        sources: [],
        query,
      });
    }

    // Step 4: Get full chunk text from Supabase
    const supabase = getSupabaseClient();
    const chunkIds = matches
      .map((match) => match.id)
      .filter((id): id is string => id !== undefined);

    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id, chunk_text, document_id, chunk_index, embedding_id')
      .in('embedding_id', chunkIds);

    if (chunksError) {
      console.error('[Query API] Error fetching chunks:', chunksError);
      throw new Error('Failed to fetch chunk details');
    }

    // Step 5: Build context from chunks
    const contextChunks = matches
      .map((match) => {
        const chunk = chunks?.find((c) => c.embedding_id === match.id);
        return chunk
          ? {
              text: chunk.chunk_text,
              metadata: match.metadata,
              score: match.score || 0,
            }
          : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const context = contextChunks.map((c) => c.text).join('\n\n---\n\n');

    console.log(`[Query API] Found ${contextChunks.length} relevant chunks`);

    // Step 6: Save user message to database
    console.log('[Query API] Saving user message...');
    await addMessage(currentConversationId, 'user', query);

    // Step 7: Generate answer using LLM with conversation history (STREAMING)
    console.log('[Query API] Generating answer with LLM (streaming)...');
    const systemPrompt = `You are a helpful AI assistant that answers questions based on the user's personal knowledge base.

Use the provided context to answer the question. If the context doesn't contain enough information to answer the question, say so honestly.

Context from knowledge base:
${context}`;

    // Build messages array with conversation history
    const conversationHistory = previousMessages.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

    // Step 8: Format sources
    const sources = contextChunks.map((chunk) => ({
      document_id: chunk.metadata?.document_id as string,
      title: chunk.metadata?.title as string,
      source_type: chunk.metadata?.source_type as string,
      relevance_score: chunk.score,
      excerpt: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : ''),
      created_at: chunk.metadata?.created_at as string,
    }));

    // Create streaming response
    const stream = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: query },
      ],
      temperature: 0.7,
      max_tokens: 500,
      stream: true,
    });

    // Create a readable stream to send to client
    let fullAnswer = '';

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'metadata',
              conversation_id: currentConversationId,
              chunks_used: contextChunks.length
            })}\n\n`)
          );

          // Stream tokens
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              fullAnswer += content;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'token', content })}\n\n`)
              );
            }
          }

          // Save complete answer to database
          console.log('[Query API] Saving assistant response...');
          await addMessage(currentConversationId, 'assistant', fullAnswer, sources);

          // Send completion signal
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
          );

          controller.close();
          console.log('[Query API] Streaming completed successfully');
        } catch (error) {
          console.error('[Query API] Streaming error:', error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Streaming error'
            })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('[Query API] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process query',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
