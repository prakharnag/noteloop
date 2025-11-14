'use client';

import { useState, useEffect } from 'react';

interface DocumentManagerProps {
  userId: string;
}

interface Document {
  id: string;
  title: string;
  source_type: 'audio' | 'pdf' | 'markdown';
  source_uri: string | null;
  created_at: string;
  ingested_at: string;
  tags: string[];
  chunk_count: number;
}

export function DocumentManager({ userId }: DocumentManagerProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[DocumentManager] Loading documents for user:', userId);

      const response = await fetch(`/api/documents?user_id=${userId}`);
      const data = await response.json();

      if (response.ok) {
        setDocuments(data.documents);
        console.log(`[DocumentManager] Loaded ${data.documents.length} documents`);
      } else {
        setError(data.error || 'Failed to load documents');
        console.error('[DocumentManager] Error loading documents:', data.error);
      }
    } catch (error) {
      console.error('[DocumentManager] Error:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [userId]);

  const handleDelete = async (documentId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This will remove all associated data and cannot be undone.`)) {
      return;
    }

    try {
      setDeleting(documentId);
      console.log('[DocumentManager] Deleting document:', documentId);

      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        console.log('[DocumentManager] Document deleted successfully');
        // Remove from local state
        setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      } else {
        alert(`Failed to delete document: ${data.error}`);
        console.error('[DocumentManager] Delete failed:', data.error);
      }
    } catch (error) {
      console.error('[DocumentManager] Error deleting document:', error);
      alert('Network error. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSourceTypeIcon = (type: string) => {
    switch (type) {
      case 'audio':
        return '🎤';
      case 'pdf':
        return '📄';
      case 'markdown':
        return '📝';
      default:
        return '📎';
    }
  };

  const getSourceTypeColor = (type: string) => {
    switch (type) {
      case 'audio':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'pdf':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'markdown':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Document Library
        </h2>
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          <p>Loading documents...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          Document Library
        </h2>
        <div className="text-center text-red-500 py-8">
          <p>{error}</p>
          <button
            onClick={loadDocuments}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Document Library
        </h2>
        <button
          onClick={loadDocuments}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          🔄 Refresh
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          <p className="text-lg mb-2">No documents yet</p>
          <p className="text-sm">
            Upload your first document to get started!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{getSourceTypeIcon(doc.source_type)}</span>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {doc.title}
                    </h3>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className={`text-xs px-2 py-1 rounded ${getSourceTypeColor(doc.source_type)}`}>
                      {doc.source_type.toUpperCase()}
                    </span>
                    <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                      {doc.chunk_count} chunks
                    </span>
                    {doc.tags.filter(tag => !tag.includes('processing') && !tag.includes('completed')).map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Uploaded: {formatDate(doc.created_at)}
                  </p>
                </div>

                <button
                  onClick={() => handleDelete(doc.id, doc.title)}
                  disabled={deleting === doc.id}
                  className="ml-4 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {deleting === doc.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
