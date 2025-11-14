/**
 * Simple test script to verify audio and document processors
 * Run with: npx tsx scripts/test-processors.ts
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import { processAudio } from '../lib/processors/audio';
import { processPDF, processMarkdown } from '../lib/processors/document';
import { chunkText, createChunkMetadata } from '../lib/chunking';
import * as fs from 'fs';
import * as path from 'path';

async function testDocumentProcessor() {
  console.log('\n=== Testing Document Processor ===\n');

  // Create a test markdown file
  const testMdPath = path.join(__dirname, 'test-sample.md');
  const testMdContent = `# Test Document

This is a test markdown document for the Second Brain system.

## Section 1
This section contains some information about the system architecture.

## Section 2
This section has more details about the implementation.`;

  fs.writeFileSync(testMdPath, testMdContent);

  try {
    console.log('Testing Markdown processor...');
    const mdResult = await processMarkdown(testMdPath);
    console.log('✓ Markdown processed successfully');
    console.log(`  Text length: ${mdResult.text.length}`);
    console.log(`  Metadata:`, mdResult.metadata);

    // Test chunking
    console.log('\nTesting chunking...');
    const chunks = chunkText(mdResult.text, { maxTokens: 100 });
    console.log(`✓ Created ${chunks.length} chunks`);
    chunks.forEach((chunk, i) => {
      const metadata = createChunkMetadata(chunk, i, chunks.length);
      console.log(`  Chunk ${i + 1}: ${metadata.estimated_tokens} tokens, ${metadata.char_count} chars`);
    });

    // Clean up
    fs.unlinkSync(testMdPath);
  } catch (error) {
    console.error('✗ Document processor test failed:', error);
    fs.unlinkSync(testMdPath);
  }
}

async function testAudioProcessor() {
  console.log('\n=== Testing Audio Processor ===\n');

  // Check if OPENAI_API_KEY is set
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠ Skipping audio test: OPENAI_API_KEY not set');
    console.log('  To test audio processing, set OPENAI_API_KEY environment variable');
    return;
  }

  console.log('⚠ Audio processor requires an actual audio file to test');
  console.log('  Place a test audio file (e.g., test.mp3) in the scripts/ folder');
  console.log('  Then uncomment the test code below');

  // Uncomment below when you have a test audio file
  /*
  const testAudioPath = path.join(__dirname, 'test.mp3');

  if (!fs.existsSync(testAudioPath)) {
    console.log('✗ Test audio file not found at:', testAudioPath);
    return;
  }

  try {
    console.log('Testing Audio processor...');
    const audioResult = await processAudio(testAudioPath);
    console.log('✓ Audio processed successfully');
    console.log(`  Transcription length: ${audioResult.text.length}`);
    console.log(`  Metadata:`, audioResult.metadata);

    // Test chunking
    console.log('\nTesting chunking...');
    const chunks = chunkText(audioResult.text);
    console.log(`✓ Created ${chunks.length} chunks`);
  } catch (error) {
    console.error('✗ Audio processor test failed:', error);
  }
  */
}

async function main() {
  console.log('🧪 Testing Second Brain Processors\n');

  await testDocumentProcessor();
  await testAudioProcessor();

  console.log('\n✓ All tests completed!\n');
}

main().catch(console.error);