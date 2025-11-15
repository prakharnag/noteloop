/**
 * Supabase Storage integration using S3-compatible API
 * Handles file uploads and downloads from Supabase Storage buckets
 */

import { randomUUID } from 'crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/db/supabase';

export const UPLOADS_BUCKET = 'uploads';

// S3-compatible client for Supabase Storage
// According to Supabase docs: https://supabase.com/docs/guides/storage/s3/authentication
// Use direct storage hostname for optimal performance: https://project_ref.storage.supabase.co/storage/v1/s3
function getS3Client(): S3Client {
  // Support both naming conventions
  let endpoint = process.env.SUPABASE_STORAGE_ENDPOINT || process.env.SUPABASE_S3_ENDPOINT;
  const accessKeyId = process.env.SUPABASE_STORAGE_ACCESS_KEY || process.env.SUPABASE_S3_ACCESS_KEY;
  const secretAccessKey = process.env.SUPABASE_STORAGE_SECRET_KEY || process.env.SUPABASE_S3_SECRET_KEY;
  const region = process.env.SUPABASE_S3_REGION || process.env.SUPABASE_REGION || 'us-east-1';

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing S3 credentials. Set SUPABASE_STORAGE_ENDPOINT (or SUPABASE_S3_ENDPOINT), SUPABASE_STORAGE_ACCESS_KEY (or SUPABASE_S3_ACCESS_KEY), and SUPABASE_STORAGE_SECRET_KEY (or SUPABASE_S3_SECRET_KEY)');
  }

  // Ensure endpoint ends with /storage/v1/s3 as per Supabase docs
  if (!endpoint.endsWith('/storage/v1/s3')) {
    // If it's just the base URL, construct the full endpoint
    if (endpoint.includes('storage.supabase.co')) {
      endpoint = endpoint.replace(/\/$/, '') + '/storage/v1/s3';
    } else {
      // If it's the project URL, convert to storage URL
      const projectRef = process.env.SUPABASE_URL?.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
      if (projectRef) {
        endpoint = `https://${projectRef}.storage.supabase.co/storage/v1/s3`;
      }
    }
  }

  console.log(`[Storage] S3 Client Config - Endpoint: ${endpoint}, Region: ${region}`);

  return new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true, // Required for S3-compatible APIs per Supabase docs
    // Note: Request timeouts are handled via AbortController in the download function
  });
}

/**
 * Upload file to Supabase Storage using S3-compatible API
 * @param supabase - Authenticated Supabase client (for getting public URL)
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

  const s3Client = getS3Client();
  const contentType = getContentType(fileName);

  try {
    // Use Upload for better handling of large files
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: UPLOADS_BUCKET,
        Key: filePath,
        Body: file,
        ContentType: contentType,
      },
    });

    await upload.done();
    console.log(`[Storage] File uploaded successfully via S3 API`);

    // Get public URL from Supabase
    const { data: urlData } = supabase.storage
      .from(UPLOADS_BUCKET)
      .getPublicUrl(filePath);

    return {
      path: filePath,
      publicUrl: urlData.publicUrl,
    };
  } catch (error) {
    console.error('[Storage] Upload error:', error);
    throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get Supabase client with service role key for server-side storage operations
 * This bypasses RLS and is needed for background processing
 */
function getStorageClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  // Try service role key first, fallback to anon key
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in .env'
    );
  }


  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Download file from Supabase Storage as Buffer using S3-compatible API
 */
export async function downloadFile(filePath: string, maxRetries: number = 3): Promise<Buffer> {
  const downloadTimeout = 60000; // 1 minute timeout for download

  console.log(`[Storage] Downloading file from: ${filePath}`);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[Storage] Retry attempt ${attempt}/${maxRetries} for: ${filePath}`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 2) * 1000));
      }

      console.log(`[Storage] Starting S3 download (attempt ${attempt})...`);
      const s3Client = getS3Client();

      // Create abort controller for the S3 request
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log(`[Storage] Timeout reached, aborting S3 request...`);
        abortController.abort();
      }, downloadTimeout);

      try {
        // According to AWS SDK docs, the Key should be the exact path as stored
        // The SDK handles encoding internally. Don't pre-encode it.
        // The filePath is stored exactly as: userId/fileId-filename (with spaces preserved)
        console.log(`[Storage] S3 Key: ${filePath}`);
        console.log(`[Storage] Bucket: ${UPLOADS_BUCKET}`);
        console.log(`[Storage] Sending GetObjectCommand...`);
        
        const command = new GetObjectCommand({
          Bucket: UPLOADS_BUCKET,
          Key: filePath, // Use exact path as stored - AWS SDK handles encoding
        });
        
        console.log(`[Storage] Command created, sending request...`);
        
        // Wrap in Promise.race to ensure timeout works even if AbortController doesn't
        const sendPromise = s3Client.send(command, { abortSignal: abortController.signal });
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            console.log(`[Storage] Promise.race timeout triggered after ${downloadTimeout / 1000}s`);
            abortController.abort();
            reject(new Error(`S3 request timeout after ${downloadTimeout / 1000}s`));
          }, downloadTimeout);
        });
        
        const response = await Promise.race([sendPromise, timeoutPromise]);
        console.log(`[Storage] GetObjectCommand completed, response received`);

        clearTimeout(timeoutId);

        if (!response.Body) {
          throw new Error('Download returned no data');
        }

        console.log(`[Storage] Converting stream to buffer...`);
        // Convert stream to buffer with timeout for reading
        const chunks: Uint8Array[] = [];
        const stream = response.Body as any;
        
        // Read stream with timeout
        const readPromise = (async () => {
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
        })();

        const readTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Stream read timeout after 30s'));
          }, 30000);
        });

        await Promise.race([readPromise, readTimeoutPromise]);

        const buffer = Buffer.concat(chunks);
        console.log(`[Storage] File downloaded successfully: ${buffer.length} bytes (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

        return buffer;
      } catch (s3Error) {
        clearTimeout(timeoutId);
        
        if (s3Error instanceof Error && s3Error.name === 'AbortError') {
          throw new Error(`Download timeout after ${downloadTimeout / 1000}s`);
        }
        throw s3Error;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[Storage] Download attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      if (lastError.message.includes('timeout') || 
          lastError.message.includes('NoSuchKey') ||
          lastError.message.includes('404')) {
        throw lastError;
      }

      if (attempt === maxRetries) {
        throw new Error(`Failed to download file after ${maxRetries} attempts: ${lastError.message}`);
      }
    }
  }

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
