/**
 * Audio processing pipeline using OpenAI Whisper API
 * Transcribes audio files (.mp3, .m4a, .wav, etc.) to text
 */

import OpenAI from 'openai';
import { ProcessedContent } from '@/types';

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

export interface AudioProcessorOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
}

/**
 * Process audio file and extract transcription
 */
export async function processAudio(
  filePath: string,
  options: AudioProcessorOptions = {}
): Promise<ProcessedContent> {
  try {
    console.log(`[AudioProcessor] Processing audio file: ${filePath}`);

    // Import toFile helper from OpenAI SDK
    const { toFile } = await import('openai/uploads');
    const { readFile } = await import('fs/promises');

    // Extract filename from path to preserve extension
    const filename = filePath.split('/').pop() || 'audio.mp3';
    console.log(`[AudioProcessor] Filename: ${filename}`);
    console.log(`[AudioProcessor] File path: ${filePath}`);

    // Check if file exists before reading
    const { access, constants } = await import('fs/promises');
    try {
      await access(filePath, constants.F_OK);
      console.log(`[AudioProcessor] File exists, proceeding to read...`);
    } catch (accessError) {
      console.error(`[AudioProcessor] File does not exist at path: ${filePath}`);
      throw new Error(`Audio file not found at path: ${filePath}`);
    }

    // Read file and create proper File object with filename
    console.log(`[AudioProcessor] Reading file from disk...`);
    const fileBuffer = await readFile(filePath);
    console.log(`[AudioProcessor] File read successfully. Size: ${fileBuffer.length} bytes`);
    
    console.log(`[AudioProcessor] Converting buffer to File object...`);
    const audioFile = await toFile(fileBuffer, filename);
    console.log(`[AudioProcessor] File object created successfully`);
    
    console.log(`[AudioProcessor] Starting OpenAI Whisper API transcription...`);
    console.log(`[AudioProcessor] File size for transcription: ${audioFile.size || 'unknown'} bytes`);
    
    // Call OpenAI Whisper API for transcription with timeout
    // Large audio files can take a long time, so we set a reasonable timeout
    const transcriptionPromise = getOpenAIClient().audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: options.language,
      prompt: options.prompt,
      temperature: options.temperature ?? 0,
      response_format: 'verbose_json', // Get detailed response with timestamps
    });
    
    // Add timeout (30 minutes for very long audio files)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Transcription timeout after 30 minutes')), 30 * 60 * 1000);
    });
    
    const transcription = await Promise.race([transcriptionPromise, timeoutPromise]) as any;

    console.log(
      `[AudioProcessor] Transcription completed. Duration: ${transcription.duration}s`
    );

    // Extract text and metadata
    const text = transcription.text;
    const metadata = {
      duration: transcription.duration,
      language: transcription.language,
      processor: 'whisper-1',
      segments: transcription.segments?.length || 0,
      // Store segments for potential future use (temporal chunking)
      timestamp_segments: transcription.segments?.map((seg: any) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
      })),
    };

    return {
      text,
      metadata,
    };
  } catch (error) {
    console.error('[AudioProcessor] Error processing audio:', error);
    console.error('[AudioProcessor] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[AudioProcessor] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    throw new Error(
      `Failed to process audio file: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Process audio from buffer (useful for direct uploads)
 */
export async function processAudioFromBuffer(
  buffer: Buffer,
  filename: string,
  options: AudioProcessorOptions = {}
): Promise<ProcessedContent> {
  try {
    console.log(`[AudioProcessor] Processing audio buffer: ${filename}`);

    // Create a file-like object from buffer
    // Convert Buffer to Uint8Array for compatibility with Blob
    const uint8Array = new Uint8Array(buffer);
    const blob = new Blob([uint8Array], { type: getAudioMimeType(filename) });
    const file = new File([blob], filename, {
      type: getAudioMimeType(filename),
    });

    const transcription = await getOpenAIClient().audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: options.language,
      prompt: options.prompt,
      temperature: options.temperature ?? 0,
      response_format: 'verbose_json',
    });

    const text = transcription.text;
    const metadata = {
      duration: transcription.duration,
      language: transcription.language,
      processor: 'whisper-1',
      filename,
      segments: transcription.segments?.length || 0,
    };

    return {
      text,
      metadata,
    };
  } catch (error) {
    console.error('[AudioProcessor] Error processing audio buffer:', error);
    throw new Error(
      `Failed to process audio buffer: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

/**
 * Get MIME type based on file extension
 * Supports all Whisper API audio formats
 */
function getAudioMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    // Whisper supported formats
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    mp4: 'audio/mp4',
    mpeg: 'audio/mpeg',
    mpga: 'audio/mpeg',
    oga: 'audio/ogg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    webm: 'audio/webm',
  };
  return mimeTypes[ext || ''] || 'audio/mpeg';
}

/**
 * Validate audio file format
 * All formats supported by OpenAI Whisper API
 */
export function isValidAudioFile(filename: string): boolean {
  const validExtensions = [
    'flac',
    'm4a',
    'mp3',
    'mp4',
    'mpeg',
    'mpga',
    'oga',
    'ogg',
    'wav',
    'webm',
  ];
  const ext = filename.split('.').pop()?.toLowerCase();
  return validExtensions.includes(ext || '');
}
