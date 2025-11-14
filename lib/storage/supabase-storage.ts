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
 */
export async function downloadFile(filePath: string): Promise<Buffer> {
  const supabase = getSupabaseClient();

  console.log(`[Storage] Downloading file from: ${filePath}`);

  const { data, error } = await supabase.storage
    .from(UPLOADS_BUCKET)
    .download(filePath);

  if (error) {
    console.error('[Storage] Download error:', error);
    throw new Error(`Failed to download file: ${error.message}`);
  }

  // Convert Blob to Buffer
  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(`[Storage] File downloaded: ${buffer.length} bytes`);

  return buffer;
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
