'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export interface SelectedDocument {
  id: string;
  title: string;
  type: 'audio' | 'pdf' | 'markdown';
}

interface DocumentSelectionContextType {
  selectedDocuments: SelectedDocument[];
  addDocument: (doc: SelectedDocument) => void;
  removeDocument: (id: string) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
}

const DocumentSelectionContext = createContext<DocumentSelectionContextType | undefined>(undefined);

const MAX_SELECTED_DOCUMENTS = 5;

export function DocumentSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedDocuments, setSelectedDocuments] = useState<SelectedDocument[]>([]);

  const addDocument = (doc: SelectedDocument) => {
    setSelectedDocuments((prev) => {
      // Don't add if already selected
      if (prev.some((d) => d.id === doc.id)) {
        return prev;
      }
      // Don't add if at max limit
      if (prev.length >= MAX_SELECTED_DOCUMENTS) {
        return prev;
      }
      return [...prev, doc];
    });
  };

  const removeDocument = (id: string) => {
    setSelectedDocuments((prev) => prev.filter((doc) => doc.id !== id));
  };

  const clearSelection = () => {
    setSelectedDocuments([]);
  };

  const isSelected = (id: string) => {
    return selectedDocuments.some((doc) => doc.id === id);
  };

  return (
    <DocumentSelectionContext.Provider
      value={{
        selectedDocuments,
        addDocument,
        removeDocument,
        clearSelection,
        isSelected,
      }}
    >
      {children}
    </DocumentSelectionContext.Provider>
  );
}

export function useDocumentSelection() {
  const context = useContext(DocumentSelectionContext);
  if (context === undefined) {
    throw new Error('useDocumentSelection must be used within a DocumentSelectionProvider');
  }
  return context;
}
