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
        // Handle validation errors with user-friendly messages
        let userFriendlyMessage = 'Upload failed';
        let toastDescription = data.details || data.error || 'Please try again';
        
        if (response.status === 400) {
          // File validation failed
          if (data.details?.includes('No text content could be extracted')) {
            userFriendlyMessage = 'Issue with file';
            toastDescription = 'Unable to extract text from this file. It may be an image-only PDF, corrupted file, or unsupported format. Please try a different file.';
          } else if (data.details?.includes('empty or corrupted')) {
            userFriendlyMessage = 'Issue with file';
            toastDescription = 'The file appears to be empty or corrupted. Please check the file and try again.';
          } else if (data.error === 'File validation failed') {
            userFriendlyMessage = 'Issue with file';
            toastDescription = data.details || 'The file could not be processed. Please ensure it\'s not corrupted and contains extractable content.';
          } else {
            userFriendlyMessage = 'Upload failed';
            toastDescription = data.details || data.error || 'Please try again';
          }
        } else {
          userFriendlyMessage = 'Upload failed';
          toastDescription = data.details || data.error || 'Please try again';
        }

        toast.error(userFriendlyMessage, {
          id: 'upload',
          description: toastDescription,
        });

        setUploadStatus({
          type: 'error',
          message: toastDescription,
        });
        
        // Reset button after 5 seconds
        setTimeout(() => {
          setUploadStatus(null);
        }, 5000);
        
        return;
      }

      toast.success('File uploaded successfully!', { id: 'upload' });
      setUploadStatus({
        type: 'info',
        message: `Reading your document...`,
      });

      setProcessingDocumentId(data.document_id);

      // Start polling for processing status
      // Audio files take longer, so we'll poll for up to 10 minutes
      const isAudio = !!file.name.match(/\.(flac|m4a|mp3|mp4|mpeg|mpga|oga|ogg|wav|webm)$/i);
      pollProcessingStatus(data.document_id, isAudio);

      // Reset form
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';

      toast.error('Upload failed', {
        id: 'upload',
        description: 'An unexpected error occurred. Please try again.',
      });

      setUploadStatus({
        type: 'error',
        message: 'An unexpected error occurred. Please try again.',
      });
      
      // Reset button after 5 seconds
      setTimeout(() => {
        setUploadStatus(null);
      }, 5000);
    } finally {
      setUploading(false);
    }
  };

  const pollProcessingStatus = async (documentId: string, isAudio: boolean = false) => {
    // Audio files need more time (up to 10 minutes), others up to 5 minutes
    const maxAttempts = isAudio ? 300 : 150; // 2 seconds per attempt
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/ingest/status/${documentId}`);

        if (!response.ok) {
          // If document not found (404), it may have been deleted due to processing failure
          if (response.status === 404) {
            toast.error('Processing failed', {
              description: 'The file could not be processed. It may be corrupted or in an unsupported format.',
            });
            setProcessingDocumentId(null);
            setUploadStatus({
              type: 'error',
              message: 'File could not be processed. Please try a different file.',
            });
            setTimeout(() => {
              setUploadStatus(null);
            }, 5000);
            return;
          }
          throw new Error('Failed to check status');
        }

        const data = await response.json();

        if (data.status === 'completed') {
          toast.success('All set!', {
            description: 'Your document is ready to use',
          });
          setProcessingDocumentId(null);
          // Show success message briefly, then reset
          setUploadStatus({
            type: 'success',
            message: `All set! Your document is ready to use.`,
          });
          // Trigger document library refresh
          onUploadComplete?.();
          // Reset button after 3 seconds
          setTimeout(() => {
            setUploadStatus(null);
          }, 3000);
          return;
        } else if (data.status === 'failed') {
          // Determine specific error message
          let errorMessage = data.message || 'Please try uploading again';
          if (data.message?.includes('No text content extracted')) {
            errorMessage = 'Unable to extract text from this file. It may be an image-only PDF, corrupted file, or unsupported format.';
          }
          
          toast.error('Processing failed', {
            description: errorMessage,
          });
          setProcessingDocumentId(null);
          setUploadStatus({
            type: 'error',
            message: errorMessage,
          });
          // Reset button after 5 seconds to allow user to try again
          setTimeout(() => {
            setUploadStatus(null);
          }, 5000);
          return;
        }

        // Still processing - show friendly progress messages
        attempts++;

        // Update status message based on progress and file type
        if (isAudio) {
          if (attempts > 200) {
            setUploadStatus({
              type: 'info',
              message: 'Almost there... Audio transcription takes time.',
            });
          } else if (attempts > 100) {
            setUploadStatus({
              type: 'info',
              message: 'Transcribing audio... This may take a few minutes.',
            });
          } else if (attempts > 30) {
            setUploadStatus({
              type: 'info',
              message: 'Processing audio file...',
            });
          }
        } else {
          if (attempts > 100) {
            setUploadStatus({
              type: 'info',
              message: 'Almost there...',
            });
          } else if (attempts > 30) {
            setUploadStatus({
              type: 'info',
              message: 'Making sense of your content...',
            });
          }
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          // Timeout reached - check one more time, then show message
          // The document might be completed but we stopped polling too early
          setTimeout(async () => {
            try {
              const finalCheck = await fetch(`/api/ingest/status/${documentId}`);
              if (finalCheck.ok) {
                const finalData = await finalCheck.json();
                if (finalData.status === 'completed') {
                  toast.success('All set!', {
                    description: 'Your document is ready to use',
                  });
                  setProcessingDocumentId(null);
                  setUploadStatus({
                    type: 'success',
                    message: `All set! Your document is ready to use.`,
                  });
                  onUploadComplete?.();
                  // Reset button after 3 seconds
                  setTimeout(() => {
                    setUploadStatus(null);
                  }, 3000);
                  return;
                }
              }
            } catch {
              // Ignore final check errors
            }
            
            // If still not completed, show timeout message but allow refresh
            toast.info('Processing is taking longer than expected', {
              description: 'Your document will appear in the library when ready. You can refresh the page.',
            });
            setProcessingDocumentId(null);
            setUploadStatus({
              type: 'info',
              message: 'Processing may still be in progress. Check the document library or refresh the page.',
            });
            // Reset button after 5 seconds
            setTimeout(() => {
              setUploadStatus(null);
            }, 5000);
            // Still trigger refresh in case it's done
            onUploadComplete?.();
          }, 2000);
        }
      } catch (error) {
        setProcessingDocumentId(null);
        toast.error('Something went wrong', {
          description: 'Please try again or check the document library',
        });
        setUploadStatus({
          type: 'error',
          message: 'Status check failed. Please refresh the page to see if processing completed.',
        });
        // Reset button after 5 seconds
        setTimeout(() => {
          setUploadStatus(null);
        }, 5000);
        // Still trigger refresh in case it's done
        onUploadComplete?.();
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

        {/* Upload Button with Status Messages */}
        <button
          onClick={handleUpload}
          disabled={!file || uploading || processingDocumentId !== null}
          className={`w-full font-medium py-3 rounded-xl transition-all disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md ${
            uploadStatus?.type === 'success'
              ? 'bg-[hsl(150,35%,82%)] hover:bg-[hsl(150,40%,72%)] text-[hsl(150,35%,25%)]'
              : uploadStatus?.type === 'error'
              ? 'bg-[hsl(0,45%,85%)] hover:bg-[hsl(0,50%,75%)] text-[hsl(0,45%,30%)]'
              : uploading || processingDocumentId
              ? 'bg-[hsl(214.3,28%,75%)] text-[hsl(214.3,25%,25%)]'
              : 'bg-[hsl(25,45%,82%)] hover:bg-[hsl(25,50%,72%)] disabled:bg-[hsl(214.3,15%,60%)] text-[hsl(214.3,25%,25%)]'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Uploading...</span>
            </>
          ) : uploadStatus ? (
            <>
              {uploadStatus.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : uploadStatus.type === 'error' ? (
                <XCircle className="w-5 h-5" />
              ) : (
                <Loader2 className="w-5 h-5 animate-spin" />
              )}
              <span className="text-sm">{uploadStatus.message}</span>
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              <span>Upload</span>
            </>
          )}
        </button>
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
