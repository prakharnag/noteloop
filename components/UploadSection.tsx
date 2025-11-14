'use client';

import { useState } from 'react';

interface UploadSectionProps {
  userId: string;
}

export function UploadSection({ userId }: UploadSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      if (!title) {
        setTitle(e.target.files[0].name);
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setStatus({ type: 'error', message: 'Please select a file' });
      return;
    }

    setUploading(true);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_id', userId);
      formData.append('title', title || file.name);
      if (tags) {
        formData.append('tags', tags);
      }

      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setDocumentId(data.document_id);
        setStatus({
          type: 'success',
          message: `File uploaded! Processing in background...`,
        });
        setFile(null);
        setTitle('');
        setTags('');
        // Reset file input
        const fileInput = document.getElementById('file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';

        // Poll for status
        pollStatus(data.document_id);
      } else {
        setStatus({
          type: 'error',
          message: data.error || 'Upload failed',
        });
      }
    } catch (error) {
      setStatus({
        type: 'error',
        message: 'Network error. Please try again.',
      });
    } finally {
      setUploading(false);
    }
  };

  const pollStatus = async (docId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes max

    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/ingest/status/${docId}`);
        const data = await response.json();

        if (data.status === 'completed') {
          setStatus({
            type: 'success',
            message: `✓ Processing complete! ${data.chunks_count} chunks created.`,
          });
        } else if (data.status === 'failed') {
          setStatus({
            type: 'error',
            message: 'Processing failed. Please try again.',
          });
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(checkStatus, 2000); // Check every 2 seconds
        }
      } catch (error) {
        console.error('Error checking status:', error);
      }
    };

    checkStatus();
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
        Upload Content
      </h2>

      <form onSubmit={handleUpload} className="space-y-4">
        {/* File Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            File
          </label>
          <input
            id="file-input"
            type="file"
            accept=".pdf,.md,.markdown,.mp3,.m4a,.wav"
            onChange={handleFileChange}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300"
          />
          <p className="mt-1 text-xs text-gray-500">
            Supported: PDF, Markdown, Audio (MP3, M4A, WAV)
          </p>
        </div>

        {/* Title Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Title (optional)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
        </div>

        {/* Tags Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tags (optional)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="work, meeting, notes"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-500">Comma-separated</p>
        </div>

        {/* Upload Button */}
        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors"
        >
          {uploading ? 'Uploading...' : 'Upload & Process'}
        </button>
      </form>

      {/* Status Message */}
      {status && (
        <div
          className={`mt-4 p-4 rounded-lg ${
            status.type === 'success'
              ? 'bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-200'
              : status.type === 'error'
              ? 'bg-red-50 text-red-800 dark:bg-red-900 dark:text-red-200'
              : 'bg-blue-50 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
          }`}
        >
          <p className="text-sm">{status.message}</p>
          {documentId && (
            <p className="text-xs mt-1 opacity-75">Doc ID: {documentId}</p>
          )}
        </div>
      )}
    </div>
  );
}
