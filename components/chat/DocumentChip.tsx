'use client';

import { X, FileText, Mic, FileCode } from 'lucide-react';

interface DocumentChipProps {
  document: {
    id: string;
    title: string;
    type: 'audio' | 'pdf' | 'markdown';
  };
  onRemove: () => void;
}

export function DocumentChip({ document, onRemove }: DocumentChipProps) {
  const getIcon = () => {
    switch (document.type) {
      case 'audio':
        return <Mic className="w-3 h-3" />;
      case 'pdf':
        return <FileText className="w-3 h-3" />;
      case 'markdown':
        return <FileCode className="w-3 h-3" />;
      default:
        return <FileText className="w-3 h-3" />;
    }
  };

  const getColorClasses = () => {
    switch (document.type) {
      case 'audio':
        return 'bg-[hsl(280,25%,95%)] border-[hsl(280,25%,85%)] text-[hsl(280,30%,40%)]';
      case 'pdf':
        return 'bg-[hsl(15,35%,95%)] border-[hsl(15,35%,85%)] text-[hsl(15,40%,40%)]';
      case 'markdown':
        return 'bg-[hsl(200,30%,95%)] border-[hsl(200,30%,85%)] text-[hsl(200,35%,40%)]';
      default:
        return 'bg-[hsl(214.3,25%,95%)] border-[hsl(214.3,25%,85%)] text-[hsl(214.3,25%,40%)]';
    }
  };

  // Truncate title to ~20 chars
  const truncatedTitle = document.title.length > 20
    ? `${document.title.slice(0, 18)}...`
    : document.title;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium transition-all ${getColorClasses()}`}
      title={document.title}
    >
      {getIcon()}
      <span className="truncate max-w-[120px]">{truncatedTitle}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="p-0.5 hover:bg-black/10 rounded-full transition-colors"
        aria-label={`Remove ${document.title}`}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
