/**
 * Audio processing pipeline using OpenAI Whisper API
 * Transcribes audio files (.mp3, .m4a, .wav, etc.) to text
 */

import OpenAI from 'openai';
import { ProcessedContent } from '@/types';
import { createReadStream } from 'fs';

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

    // Create a read stream for the audio file
    const audioStream = createReadStream(filePath) as any;

    // Call OpenAI Whisper API for transcription
    const transcription = await getOpenAIClient().audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      language: options.language,
      prompt: options.prompt,
      temperature: options.temperature ?? 0,
      response_format: 'verbose_json', // Get detailed response with timestamps
    });

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
 */
function getAudioMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
  };
  return mimeTypes[ext || ''] || 'audio/mpeg';
}

/**
 * Validate audio file format
 */
export function isValidAudioFile(filename: string): boolean {
  const validExtensions = ['mp3', 'm4a', 'wav', 'webm', 'ogg'];
  const ext = filename.split('.').pop()?.toLowerCase();
  return validExtensions.includes(ext || '');
}
