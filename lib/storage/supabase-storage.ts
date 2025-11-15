/**
 * Supabase Storage integration
 * Handles file uploads to Supabase Storage buckets
 */

import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/db/supabase';

export const UPLOADS_BUCKET = 'uploads';

/**
 * Upload file to Supabase Storage
 * @param supabase - Authenticated Supabase client
 * @returns Public URL or signed URL for the uploaded file
 */
export async function uploadFile(
  supabase: SupabaseClient,
  file: Buffer,
  fileName: string,
  userId: string
): Promise<{ path: string; publicUrl: string }> {

  // Create a unique file path: userId/fileId-filename
  const fileId = randomUUID();
  const filePath = `${userId}/${fileId}-${fileName}`;

  console.log(`[Storage] Uploading file to: ${filePath}`);

  const { data, error } = await supabase.storage
    .from(UPLOADS_BUCKET)
    .upload(filePath, file, {
      contentType: getContentType(fileName),
      upsert: false,
    });

  if (error) {
    console.error('[Storage] Upload error:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(UPLOADS_BUCKET)
    .getPublicUrl(filePath);

  console.log(`[Storage] File uploaded successfully: ${urlData.publicUrl}`);

  return {
    path: filePath,
    publicUrl: urlData.publicUrl,
  };
}

/**
 * Download file from Supabase Storage as Buffer
 * Uses service role client for server-side operations
 * Includes timeout and retry logic for reliability
 */
export async function downloadFile(filePath: string, maxRetries: number = 3): Promise<Buffer> {
  const supabase = getSupabaseClient();
  const downloadTimeout = 120000; // 2 minutes timeout for download

  console.log(`[Storage] Downloading file from: ${filePath}`);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[Storage] Retry attempt ${attempt}/${maxRetries} for: ${filePath}`);
        // Exponential backoff: wait 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 2) * 1000));
      }

      // Race between download and timeout
      const downloadPromise = supabase.storage
        .from(UPLOADS_BUCKET)
        .download(filePath);

      // Create a timeout promise that rejects
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Download timeout after ${downloadTimeout / 1000}s`));
        }, downloadTimeout);
      });

      // Race: if timeout rejects first, the whole promise rejects (caught in catch block)
      // If download completes first, we get the result
      const result = await Promise.race([downloadPromise, timeoutPromise]);
      const { data, error } = result;

      if (error) {
        throw new Error(`Supabase download error: ${error.message}`);
      }

      if (!data) {
        throw new Error('Download returned no data');
      }

      // Convert Blob to Buffer with timeout
      console.log(`[Storage] Converting blob to buffer...`);
      const arrayBufferPromise = data.arrayBuffer();
      const arrayBufferTimeout = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('ArrayBuffer conversion timeout after 30s'));
        }, 30000);
      });

      const arrayBuffer = await Promise.race([arrayBufferPromise, arrayBufferTimeout]);
      const buffer = Buffer.from(arrayBuffer);

      console.log(`[Storage] File downloaded successfully: ${buffer.length} bytes (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

      return buffer;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[Storage] Download attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      // Don't retry on timeout or non-retryable errors
      if (lastError.message.includes('timeout') || lastError.message.includes('not found')) {
        throw lastError;
      }

      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw new Error(`Failed to download file after ${maxRetries} attempts: ${lastError.message}`);
      }
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Download failed for unknown reason');
}

/**
 * Delete file from Supabase Storage
 */
export async function deleteFile(filePath: string): Promise<void> {
  const supabase = getSupabaseClient();

  console.log(`[Storage] Deleting file: ${filePath}`);

  const { error } = await supabase.storage
    .from(UPLOADS_BUCKET)
    .remove([filePath]);

  if (error) {
    console.error('[Storage] Delete error:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }

  console.log('[Storage] File deleted successfully');
}

/**
 * Delete all files for a user
 */
export async function deleteUserFiles(userId: string): Promise<void> {
  const supabase = getSupabaseClient();

  console.log(`[Storage] Deleting all files for user: ${userId}`);

  const { data: files, error: listError } = await supabase.storage
    .from(UPLOADS_BUCKET)
    .list(userId);

  if (listError) {
    console.error('[Storage] List error:', listError);
    throw new Error(`Failed to list user files: ${listError.message}`);
  }

  if (!files || files.length === 0) {
    console.log('[Storage] No files to delete');
    return;
  }

  const filePaths = files.map((file) => `${userId}/${file.name}`);

  const { error: deleteError } = await supabase.storage
    .from(UPLOADS_BUCKET)
    .remove(filePaths);

  if (deleteError) {
    console.error('[Storage] Delete error:', deleteError);
    throw new Error(`Failed to delete user files: ${deleteError.message}`);
  }

  console.log(`[Storage] Deleted ${filePaths.length} files`);
}

/**
 * Get content type based on file extension
 */
function getContentType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const contentTypes: Record<string, string> = {
    // Audio
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
    // Documents
    pdf: 'application/pdf',
    md: 'text/markdown',
    markdown: 'text/markdown',
    txt: 'text/plain',
  };
  return contentTypes[ext || ''] || 'application/octet-stream';
}

/**
 * Check if Supabase Storage bucket exists and is accessible
 */
export async function checkBucketExists(): Promise<boolean> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase.storage.listBuckets();

    if (error) {
      console.error('[Storage] Error checking buckets:', error);
      return false;
    }

    const bucketExists = data.some((bucket) => bucket.name === UPLOADS_BUCKET);

    if (!bucketExists) {
      console.warn(`[Storage] Bucket '${UPLOADS_BUCKET}' does not exist. Please create it in Supabase dashboard.`);
    }

    return bucketExists;
  } catch (error) {
    console.error('[Storage] Error checking bucket:', error);
    return false;
  }
}
