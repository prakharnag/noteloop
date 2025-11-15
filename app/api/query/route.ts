/**
 * API endpoint for querying the knowledge base
 * POST /api/query
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateEmbedding } from '@/lib/vectordb/embeddings';
import { queryVectors } from '@/lib/vectordb/pinecone';
import { getSupabaseClient } from '@/lib/db/supabase';
import { getConversationMessages, addMessage, getOrCreateConversation, getUserConversations } from '@/lib/db/conversations';
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

    // Get conversation history for current conversation
    const previousMessages = await getConversationMessages(currentConversationId);
    console.log(`[Query API] Loaded ${previousMessages.length} previous messages from current conversation`);

    // Get AI Memory: Recent messages from other conversations
    const allConversations = await getUserConversations(userId);
    const otherConversations = allConversations.filter(c => c.id !== currentConversationId);

    let aiMemoryMessages: any[] = [];
    for (const conv of otherConversations.slice(0, 3)) { // Last 3 conversations
      const messages = await getConversationMessages(conv.id);
      // Take last 10 messages from each conversation
      aiMemoryMessages.push(...messages.slice(-10));
    }
    console.log(`[Query API] Loaded ${aiMemoryMessages.length} messages from previous conversations for AI memory`);

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

    // Handle case when no matches found
    if (matches.length === 0) {
      // Save user message first
      await addMessage(currentConversationId, 'user', query);
      
      // Generate a friendly, helpful response using LLM
      const friendlyNoResultsPrompt = `The user asked: "${query}"

However, I couldn't find any relevant information in their knowledge base to answer this question.

Please provide a friendly, helpful response that:
1. Acknowledges that you couldn't find relevant information
2. Suggests they might want to upload relevant documents
3. Offers to help with a different question
4. Is warm and conversational

Keep it brief (2-3 sentences max).`;

      const noResultsResponse = await getOpenAIClient().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful, friendly AI assistant.' },
          { role: 'user', content: friendlyNoResultsPrompt },
        ],
        temperature: 0.7,
        max_tokens: 150,
      });

      const friendlyAnswer = noResultsResponse.choices[0]?.message?.content || 
        "I couldn't find any relevant information in your knowledge base to answer this question. You might want to upload some documents related to this topic, or feel free to ask me something else!";

      // Save the friendly response
      await addMessage(currentConversationId, 'assistant', friendlyAnswer, []);

      // Return as streaming response for consistency
      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            // Send metadata
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'metadata',
                conversation_id: currentConversationId,
                chunks_used: 0
              })}\n\n`)
            );

            // Stream the friendly message word by word for better UX
            const words = friendlyAnswer.split(' ');
            for (let i = 0; i < words.length; i++) {
              const word = words[i] + (i < words.length - 1 ? ' ' : '');
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'token', content: word })}\n\n`)
              );
              // Small delay for streaming effect
              await new Promise(resolve => setTimeout(resolve, 20));
            }

            // Send completion
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
            );
            controller.close();
          } catch (error) {
            console.error('[Query API] Error streaming no-results response:', error);
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

    // Build AI Memory context from previous conversations
    const aiMemoryContext = aiMemoryMessages.length > 0
      ? `\n\nPrevious conversation context (AI Memory):\n${aiMemoryMessages.map(msg =>
          `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
        ).join('\n')}`
      : '';

    // Check if we have low-quality matches (low relevance scores)
    const lowQualityThreshold = 0.7; // Adjust based on your needs
    const highQualityChunks = contextChunks.filter(c => (c.score || 0) >= lowQualityThreshold);
    const hasLowQualityResults = highQualityChunks.length === 0 && contextChunks.length > 0;

    const systemPrompt = `You are a helpful AI assistant that answers questions based on the user's personal knowledge base.

Use the provided context to answer the question. 

IMPORTANT: If the context doesn't contain enough information to fully answer the question, or if the information is not very relevant, be honest and friendly about it. Say something like:
- "Based on the information I found, [partial answer if any], but I don't have complete information about this. You might want to upload more relevant documents."
- "I found some information, but it's not very specific to your question. [Share what you found if useful], but you may need to add more documents to get a complete answer."

You also have access to previous conversation history (AI Memory), which you can reference to provide continuity across conversations.

${hasLowQualityResults ? 'NOTE: The search results have low relevance scores, so the information may not be very relevant to the question. Be honest about this.' : ''}

Context from knowledge base:
${context}${aiMemoryContext}`;

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

          // Auto-generate conversation title from first message
          if (previousMessages.length === 0) {
            // This is the first message in the conversation
            const titleWords = query.split(' ').slice(0, 6).join(' ');
            const title = titleWords.length < query.length ? `${titleWords}...` : titleWords;

            console.log(`[Query API] Auto-generating conversation title: "${title}"`);
            const supabase = getSupabaseClient();
            await supabase
              .from('conversations')
              .update({ title })
              .eq('id', currentConversationId);
          }

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
