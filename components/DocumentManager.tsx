'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { FileText, Mic, FileCode, Trash2, Loader2, RefreshCw, Library, Check, Pencil, X } from 'lucide-react';
import { useDocumentSelection } from './contexts/DocumentSelectionContext';

interface DocumentManagerProps {
  userId: string;
  refreshTrigger?: number;
  onDocumentsLoaded?: (titles: string[]) => void;
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

export function DocumentManager({ userId, refreshTrigger, onDocumentsLoaded }: DocumentManagerProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const { selectedDocuments, addDocument, removeDocument, isSelected } = useDocumentSelection();

  const handleStartEditTitle = (e: React.MouseEvent, docId: string, currentTitle: string) => {
    e.stopPropagation();
    setEditingDocId(docId);
    setEditTitle(currentTitle);
  };

  const handleCancelEditTitle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingDocId(null);
    setEditTitle('');
  };

  const handleSaveTitle = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    if (!editTitle.trim() || saving) return;

    try {
      setSaving(true);
      const response = await fetch(`/api/documents/${docId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: editTitle.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update title');
      }

      // Update local state
      setDocuments(prev =>
        prev.map(doc =>
          doc.id === docId ? { ...doc, title: editTitle.trim() } : doc
        )
      );

      // Update document titles for parent
      onDocumentsLoaded?.(documents.map(doc =>
        doc.id === docId ? editTitle.trim() : doc.title
      ));

      toast.success('Title updated successfully');
      setEditingDocId(null);
      setEditTitle('');
    } catch (error) {
      toast.error('Failed to update title', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSelectDocument = (doc: Document) => {
    if (isSelected(doc.id)) {
      removeDocument(doc.id);
    } else {
      if (selectedDocuments.length >= 5) {
        toast.error('Maximum 5 documents can be selected', {
          description: 'Remove a document to select another',
        });
        return;
      }
      addDocument({
        id: doc.id,
        title: doc.title,
        type: doc.source_type,
      });
      toast.success(`Added "${doc.title}" to context`, {
        duration: 2000,
      });
    }
  };

  const loadDocuments = async () => {
    try {
      setLoading(true);

      const response = await fetch(`/api/documents?user_id=${userId}`);

      if (!response.ok) {
        throw new Error('Failed to load documents');
      }

      const data = await response.json();
      setDocuments(data.documents);
      // Report loaded document titles to parent
      onDocumentsLoaded?.(data.documents.map((doc: Document) => doc.title));
    } catch (error) {
      toast.error('Failed to load documents', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [userId]);

  // Refresh when refreshTrigger changes (triggered by upload completion)
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      loadDocuments();
    }
  }, [refreshTrigger]);

  const handleDelete = async (documentId: string, title: string) => {
    // Show confirmation toast
    toast(`Delete "${title}"?`, {
      description: 'This will remove all associated data and cannot be undone.',
      action: {
        label: 'Delete',
        onClick: () => performDelete(documentId, title),
      },
      cancel: {
        label: 'Cancel',
        onClick: () => {},
      },
      duration: 10000,
    });
  };

  const performDelete = async (documentId: string, title: string) => {
    try {
      setDeleting(documentId);
      toast.loading('Deleting document...', { id: `delete-${documentId}` });

      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Delete failed');
      }

      toast.success('Document deleted successfully!', { id: `delete-${documentId}` });

      // Remove from local state
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));

      // Remove from selected documents if it was selected
      if (isSelected(documentId)) {
        removeDocument(documentId);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      toast.error('Failed to delete document', {
        id: `delete-${documentId}`,
        description: errorMessage,
      });
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

  const getSourceTypeConfig = (type: string) => {
    switch (type) {
      case 'audio':
        return {
          icon: Mic,
          label: 'Audio',
          color: 'bg-[hsl(280,30%,75%)]',
          bgColor: 'bg-[hsl(280,25%,95%)]',
          borderColor: 'border-[hsl(280,25%,85%)]',
          textColor: 'text-[hsl(280,30%,40%)]',
        };
      case 'pdf':
        return {
          icon: FileText,
          label: 'PDF',
          color: 'bg-[hsl(15,40%,75%)]',
          bgColor: 'bg-[hsl(15,35%,95%)]',
          borderColor: 'border-[hsl(15,35%,85%)]',
          textColor: 'text-[hsl(15,40%,40%)]',
        };
      case 'markdown':
        return {
          icon: FileCode,
          label: 'Markdown',
          color: 'bg-[hsl(200,35%,75%)]',
          bgColor: 'bg-[hsl(200,30%,95%)]',
          borderColor: 'border-[hsl(200,30%,85%)]',
          textColor: 'text-[hsl(200,35%,40%)]',
        };
      default:
        return {
          icon: FileText,
          label: 'Document',
          color: 'bg-[hsl(214.3,25%,75%)]',
          bgColor: 'bg-[hsl(214.3,25%,95%)]',
          borderColor: 'border-[hsl(214.3,25%,85%)]',
          textColor: 'text-[hsl(214.3,25%,40%)]',
        };
    }
  };

  if (loading) {
    return (
      <div className="bg-white backdrop-blur-sm rounded-2xl shadow-md p-6 border border-[hsl(214.3,25%,88%)]">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[hsl(214.3,28%,75%)] mx-auto mb-2" />
            <p className="text-[hsl(214.3,20%,35%)]">Loading documents...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white backdrop-blur-sm rounded-2xl shadow-md p-4 sm:p-6 border border-[hsl(214.3,25%,88%)] overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 sm:mb-6 gap-2 sm:gap-4">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="p-2 rounded-lg bg-[hsl(25,45%,82%)] shrink-0">
            <Library className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(214.3,25%,25%)]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-[hsl(214.3,25%,25%)] truncate">
              Document Library
            </h2>
            <p className="text-xs text-[hsl(214.3,15%,45%)]">
              {documents.length} {documents.length === 1 ? 'document' : 'documents'}
            </p>
          </div>
        </div>
        <button
          onClick={loadDocuments}
          className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-[hsl(214.3,20%,35%)] hover:text-[hsl(214.3,25%,25%)] rounded-lg hover:bg-[hsl(214.3,25%,94%)] transition-colors shrink-0"
        >
          <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-[hsl(214.3,25%,94%)] flex items-center justify-center mx-auto mb-4">
            <Library className="w-8 h-8 text-[hsl(214.3,28%,75%)]" />
          </div>
          <p className="text-lg font-medium text-[hsl(214.3,25%,25%)] mb-2">
            No documents yet
          </p>
          <p className="text-sm text-[hsl(214.3,15%,45%)]">
            Upload your first document to get started!
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4">
          {documents.map((doc) => {
            const config = getSourceTypeConfig(doc.source_type);
            const Icon = config.icon;
            const selected = isSelected(doc.id);

            return (
              <div
                key={doc.id}
                onClick={() => handleSelectDocument(doc)}
                className={`group p-3 sm:p-4 rounded-xl border ${config.borderColor} ${config.bgColor} hover:shadow-lg transition-all overflow-hidden cursor-pointer ${
                  selected ? 'ring-2 ring-[hsl(214.3,28%,65%)] ring-offset-2' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2 sm:gap-4">
                  <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden">
                    <div className={`relative p-1.5 sm:p-2 rounded-lg ${config.color} shrink-0`}>
                      <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(214.3,25%,25%)]" />
                      {selected && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-[hsl(214.3,28%,65%)] rounded-full flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      {editingDocId === doc.id ? (
                        <div className="flex items-center gap-2 mb-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="flex-1 px-2 py-1 text-sm sm:text-base font-semibold bg-white border border-[hsl(214.3,25%,75%)] rounded focus:ring-2 focus:ring-[hsl(214.3,28%,75%)] focus:border-transparent text-[hsl(214.3,25%,25%)]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveTitle(e as unknown as React.MouseEvent, doc.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEditTitle(e as unknown as React.MouseEvent);
                              }
                            }}
                            autoFocus
                          />
                          <button
                            onClick={(e) => handleSaveTitle(e, doc.id)}
                            disabled={!editTitle.trim() || saving}
                            className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                            title="Save"
                          >
                            {saving ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={handleCancelEditTitle}
                            className="p-1 text-[hsl(0,45%,50%)] hover:bg-[hsl(0,45%,95%)] rounded transition-colors"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 mb-1 group/title">
                          <h3 className="font-semibold text-sm sm:text-base text-[hsl(214.3,25%,25%)] truncate">
                            {doc.title}
                          </h3>
                          <button
                            onClick={(e) => handleStartEditTitle(e, doc.id, doc.title)}
                            className="opacity-0 group-hover/title:opacity-100 p-1 text-[hsl(214.3,20%,45%)] hover:bg-[hsl(214.3,25%,85%)] rounded transition-all shrink-0"
                            title="Edit title"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2">
                        <span className={`text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full ${config.bgColor} ${config.textColor} border ${config.borderColor} shrink-0`}>
                          {config.label}
                        </span>
                        {doc.tags
                          .filter((tag) => !tag.includes('processing') && !tag.includes('completed') && !tag.includes('failed'))
                          .map((tag, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-[hsl(150,35%,90%)] text-[hsl(150,35%,30%)] border border-[hsl(150,35%,75%)] shrink-0"
                            >
                              {tag}
                            </span>
                          ))}
                      </div>
                      <p className="text-xs text-[hsl(214.3,15%,45%)] truncate">
                        Uploaded {formatDate(doc.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(doc.id, doc.title);
                    }}
                    disabled={deleting === doc.id}
                    className="shrink-0 p-1.5 sm:p-2 text-[hsl(0,45%,50%)] hover:bg-[hsl(0,45%,95%)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete document"
                  >
                    {deleting === doc.id ? (
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
