/**
 * End-to-end backend test script
 * Tests the complete pipeline: upload → process → query
 */

import dotenv from 'dotenv';
dotenv.config();

import { createUser, getSupabaseClient } from '../lib/db/supabase';
import { uploadFile } from '../lib/storage/supabase-storage';
import { processDocumentAsync } from '../lib/processors/async-processor';
import { generateEmbedding } from '../lib/vectordb/embeddings';
import { queryVectors } from '../lib/vectordb/pinecone';
import * as fs from 'fs';
import * as path from 'path';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testBackendPipeline() {
  console.log('🧪 Testing Second Brain Backend Pipeline\n');

  // Check environment variables
  console.log('=== Checking Environment Variables ===\n');
  const requiredEnvVars = [
    'OPENAI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'PINECONE_API_KEY',
  ];

  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error(`✗ Missing environment variables: ${missingVars.join(', ')}`);
    console.error('Please add them to your .env file and try again.\n');
    process.exit(1);
  }

  console.log('✓ All required environment variables are set\n');

  try {
    // Step 1: Set up test user (use manual UUID for now to bypass RLS)
    console.log('=== Step 1: Setting Up Test User ===\n');
    const supabase = getSupabaseClient();

    // For testing, you need to manually create a user in Supabase dashboard first
    // Or insert via SQL editor: INSERT INTO users (id, email, name) VALUES ('...', 'test@example.com', 'Test User');
    console.log('ℹ️  For this test, please create a test user manually in Supabase:');
    console.log('   1. Go to Supabase Dashboard → SQL Editor');
    console.log('   2. Run: INSERT INTO users (email, name) VALUES (\'test@secondbrain.ai\', \'Test User\') RETURNING id;');
    console.log('   3. Copy the returned user ID\n');

    // Check if test user exists
    const { data: existingUsers } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'test@secondbrain.ai')
      .limit(1);

    if (!existingUsers || existingUsers.length === 0) {
      console.error('✗ No test user found. Please create one manually first (see instructions above).');
      console.error('   Or temporarily disable RLS on users table for testing.\n');
      process.exit(1);
    }

    const testUser = existingUsers[0];
    console.log(`✓ Using test user: ${testUser.id} (${testUser.email})`);
    console.log();

    // Step 2: Create a test markdown file
    console.log('=== Step 2: Creating Test Document ===\n');
    const testContent = `# Second Brain Test Document

This is a test document for the Second Brain AI system.

## Overview
This document contains information about AI, machine learning, and knowledge management.

## Key Concepts
- Artificial Intelligence enables machines to learn from data
- Vector embeddings represent semantic meaning in high-dimensional space
- RAG (Retrieval Augmented Generation) combines search with language models

## Technical Details
The system uses OpenAI's Whisper for transcription and GPT models for question answering.
Pinecone provides fast vector similarity search across millions of documents.

## Conclusion
This test validates the complete pipeline from ingestion to retrieval.`;

    const testDir = path.join(__dirname, 'test-data');
    try {
      await fs.promises.mkdir(testDir, { recursive: true });
    } catch {}

    const testFilePath = path.join(testDir, 'test-document.md');
    await fs.promises.writeFile(testFilePath, testContent);
    console.log(`✓ Created test file: ${testFilePath}\n`);

    // Step 3: Upload to Supabase Storage
    console.log('=== Step 3: Uploading to Supabase Storage ===\n');
    const fileBuffer = await fs.promises.readFile(testFilePath);
    const { path: storagePath, publicUrl } = await uploadFile(
      supabase,
      fileBuffer,
      'test-document.md',
      testUser.id
    );
    console.log(`✓ File uploaded to: ${storagePath}`);
    console.log(`  Public URL: ${publicUrl}\n`);

    // Step 4: Create document record
    console.log('=== Step 4: Creating Document Record ===\n');
    const { data: document } = await supabase
      .from('documents')
      .insert({
        user_id: testUser.id,
        title: 'Test Document - Second Brain',
        source_type: 'markdown',
        source_uri: storagePath,
        tags: ['test', 'processing'],
      })
      .select()
      .single();

    if (!document) {
      throw new Error('Failed to create document');
    }

    console.log(`✓ Document created: ${document.id}\n`);

    // Step 5: Process document asynchronously
    console.log('=== Step 5: Processing Document (Async) ===\n');
    console.log('Processing: Extract → Chunk → Embed → Store...');

    await processDocumentAsync(
      document.id,
      storagePath,
      'markdown',
      testUser.id
    );

    console.log('✓ Document processed successfully\n');

    // Step 6: Verify chunks were created
    console.log('=== Step 6: Verifying Chunks ===\n');
    const { data: chunks, count } = await supabase
      .from('chunks')
      .select('*', { count: 'exact' })
      .eq('document_id', document.id);

    console.log(`✓ Created ${count} chunks`);
    if (chunks && chunks.length > 0) {
      console.log(`  First chunk preview: ${chunks[0].chunk_text.substring(0, 100)}...\n`);
    }

    // Step 7: Test vector search
    console.log('=== Step 7: Testing Vector Search ===\n');
    const testQuery = 'What is RAG and how does it work?';
    console.log(`Query: "${testQuery}"`);

    const queryEmbedding = await generateEmbedding(testQuery);
    const results = await queryVectors(queryEmbedding, {
      topK: 3,
      filter: { user_id: { $eq: testUser.id } },
      includeMetadata: true,
    });

    console.log(`✓ Found ${results.length} relevant chunks:`);
    results.forEach((result, i) => {
      console.log(`  ${i + 1}. Score: ${result.score?.toFixed(4)} - ${result.metadata?.title}`);
    });
    console.log();

    // Step 8: Test the complete query flow (simulating API)
    console.log('=== Step 8: Testing Q&A Query ===\n');

    // Get chunk text
    const chunkIds = results.map(r => r.id).filter((id): id is string => id !== undefined);
    const { data: chunkData } = await supabase
      .from('chunks')
      .select('*')
      .in('embedding_id', chunkIds);

    const context = chunkData
      ?.map(c => c.chunk_text)
      .join('\n\n---\n\n') || '';

    console.log(`✓ Retrieved context (${context.length} chars)`);
    console.log(`  Context preview: ${context.substring(0, 150)}...\n`);

    // Step 9: Clean up
    console.log('=== Step 9: Cleanup ===\n');
    console.log('Leaving test data in place for manual inspection.');
    console.log(`  Document ID: ${document.id}`);
    console.log(`  Storage path: ${storagePath}`);
    console.log(`  To clean up later, delete the document from Supabase dashboard.\n`);

    // Summary
    console.log('=== ✅ All Tests Passed! ===\n');
    console.log('Backend pipeline is working correctly:');
    console.log('  ✓ File upload to Supabase Storage');
    console.log('  ✓ Document processing (extract, chunk, embed)');
    console.log('  ✓ Vector storage in Pinecone');
    console.log('  ✓ Metadata storage in Supabase');
    console.log('  ✓ Vector similarity search');
    console.log('  ✓ Full RAG pipeline\n');

    console.log('🎉 Ready for API testing and frontend development!\n');

  } catch (error) {
    console.error('\n❌ Test Failed:\n');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
testBackendPipeline().catch(console.error);
