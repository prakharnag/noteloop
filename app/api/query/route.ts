/**
 * API endpoint for querying the knowledge base
 * POST /api/query
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateEmbedding } from '@/lib/vectordb/embeddings';
import { queryVectors } from '@/lib/vectordb/pinecone';
import { getSupabaseClient } from '@/lib/db/supabase';
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

    const { user_id: userId, query, filters } = body;

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

    // Step 6: Generate answer using LLM
    console.log('[Query API] Generating answer with LLM...');
    const systemPrompt = `You are a helpful AI assistant that answers questions based on the user's personal knowledge base.

Use the provided context to answer the question. If the context doesn't contain enough information to answer the question, say so honestly.

Context from knowledge base:
${context}`;

    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const answer = completion.choices[0].message.content || 'Unable to generate answer.';

    // Step 7: Format sources
    const sources = contextChunks.map((chunk) => ({
      document_id: chunk.metadata?.document_id as string,
      title: chunk.metadata?.title as string,
      source_type: chunk.metadata?.source_type as string,
      relevance_score: chunk.score,
      excerpt: chunk.text.substring(0, 200) + (chunk.text.length > 200 ? '...' : ''),
      created_at: chunk.metadata?.created_at as string,
    }));

    console.log('[Query API] Query completed successfully');

    return NextResponse.json({
      answer,
      sources,
      query,
      chunks_used: contextChunks.length,
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
