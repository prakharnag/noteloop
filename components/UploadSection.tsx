'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Upload, FileText, Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface UploadSectionProps {
  userId: string;
  onUploadComplete?: () => void;
}

export function UploadSection({ userId, onUploadComplete }: UploadSectionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [processingDocumentId, setProcessingDocumentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUploadStatus(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('No file selected');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', userId);

    setUploading(true);
    setUploadStatus(null);

    try {
      toast.loading('Uploading file...', { id: 'upload' });

      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      toast.success('File uploaded successfully!', { id: 'upload' });
      setUploadStatus({
        type: 'info',
        message: `Reading your document...`,
      });

      setProcessingDocumentId(data.document_id);

      // Start polling for processing status
      pollProcessingStatus(data.document_id);

      // Reset form
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('[UploadSection] Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';

      toast.error('Upload failed', {
        id: 'upload',
        description: errorMessage,
      });

      setUploadStatus({
        type: 'error',
        message: errorMessage,
      });
    } finally {
      setUploading(false);
    }
  };

  const pollProcessingStatus = async (documentId: string) => {
    const maxAttempts = 60;
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/ingest/status/${documentId}`);

        if (!response.ok) {
          throw new Error('Failed to check status');
        }

        const data = await response.json();

        if (data.status === 'completed') {
          toast.success('All set!', {
            description: 'Your document is ready to use',
          });
          setProcessingDocumentId(null);
          setUploadStatus({
            type: 'success',
            message: `All set! Your document is ready to use.`,
          });
          // Trigger document library refresh
          onUploadComplete?.();
          return;
        } else if (data.status === 'failed') {
          toast.error('Something went wrong', {
            description: data.message || 'Please try uploading again',
          });
          setProcessingDocumentId(null);
          setUploadStatus({
            type: 'error',
            message: `Oops! ${data.message || 'Please try uploading again'}`,
          });
          return;
        }

        // Still processing - show friendly progress messages
        attempts++;

        // Update status message based on progress
        if (attempts > 15) {
          setUploadStatus({
            type: 'info',
            message: 'Almost there...',
          });
        } else if (attempts > 5) {
          setUploadStatus({
            type: 'info',
            message: 'Making sense of your content...',
          });
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          toast.warning('Taking longer than usual', {
            description: 'Your document is still being prepared',
          });
          setProcessingDocumentId(null);
        }
      } catch (error) {
        console.error('[UploadSection] Status poll error:', error);
        setProcessingDocumentId(null);
        toast.error('Something went wrong', {
          description: 'Please try again',
        });
      }
    };

    poll();
  };

  const getSupportedFormats = () => {
    return 'PDF, Markdown (.md), Audio (.mp3, .m4a, .wav, .flac, .ogg, .webm, .mp4, .mpeg, .mpga, .oga)';
  };

  return (
    <div className="bg-white backdrop-blur-sm rounded-2xl shadow-md p-6 border border-[hsl(214.3,25%,88%)]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-[hsl(25,45%,82%)]">
          <Upload className="w-5 h-5 text-[hsl(214.3,25%,25%)]" />
        </div>
        <h3 className="text-xl font-bold text-[hsl(214.3,25%,25%)]">
          Upload Document
        </h3>
      </div>

      <p className="text-sm text-[hsl(214.3,20%,35%)] mb-6">
        Upload files to add to your knowledge base
      </p>

      {/* File Input */}
      <div className="space-y-4">
        <div className="border-2 border-dashed border-[hsl(214.3,25%,88%)] rounded-xl p-6 text-center hover:border-[hsl(214.3,28%,75%)] transition-colors cursor-pointer bg-[hsl(214.3,25%,97%)]">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            accept=".pdf,.md,.mp3,.m4a,.wav,.flac,.ogg,.webm,.mp4,.mpeg,.mpga,.oga"
            className="hidden"
            id="file-upload"
            disabled={uploading}
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer flex flex-col items-center"
          >
            <FileText className="w-12 h-12 text-[hsl(25,45%,82%)] mb-3" />
            <p className="text-sm font-medium text-[hsl(214.3,25%,25%)] mb-1">
              {file ? file.name : 'Click to select a file'}
            </p>
            <p className="text-xs text-[hsl(214.3,15%,45%)]">
              {getSupportedFormats()}
            </p>
          </label>
        </div>

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={!file || uploading || processingDocumentId !== null}
          className="w-full bg-[hsl(25,45%,82%)] hover:bg-[hsl(25,50%,72%)] disabled:bg-[hsl(214.3,15%,60%)] text-[hsl(214.3,25%,25%)] font-medium py-3 rounded-xl transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Uploading...
            </>
          ) : processingDocumentId ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              Upload
            </>
          )}
        </button>

        {/* Status Message */}
        {uploadStatus && (
          <div
            className={`p-4 rounded-xl border ${
              uploadStatus.type === 'success'
                ? 'bg-[hsl(150,35%,90%)] border-[hsl(150,35%,75%)]'
                : uploadStatus.type === 'error'
                ? 'bg-[hsl(0,45%,95%)] border-[hsl(0,45%,80%)]'
                : 'bg-[hsl(214.3,25%,94%)] border-[hsl(214.3,25%,88%)]'
            }`}
          >
            <div className="flex items-start gap-3">
              {uploadStatus.type === 'success' && (
                <CheckCircle2 className="w-5 h-5 text-[hsl(150,35%,40%)] shrink-0 mt-0.5" />
              )}
              {uploadStatus.type === 'error' && (
                <XCircle className="w-5 h-5 text-[hsl(0,45%,50%)] shrink-0 mt-0.5" />
              )}
              {uploadStatus.type === 'info' && (
                <Loader2 className="w-5 h-5 text-[hsl(214.3,28%,75%)] shrink-0 mt-0.5 animate-spin" />
              )}
              <p
                className={`text-sm ${
                  uploadStatus.type === 'success'
                    ? 'text-[hsl(150,35%,30%)]'
                    : uploadStatus.type === 'error'
                    ? 'text-[hsl(0,45%,40%)]'
                    : 'text-[hsl(214.3,25%,25%)]'
                }`}
              >
                {uploadStatus.message}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-6 pt-6 border-t border-[hsl(214.3,25%,88%)]">
        <p className="text-xs text-[hsl(214.3,15%,45%)]">
          💡 <strong>Tip:</strong> Larger files may take a few minutes to process.
          You'll be notified when processing is complete.
        </p>
      </div>
    </div>
  );
}
