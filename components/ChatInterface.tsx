'use client';

import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Send, Loader2, Sparkles, Copy, Check, Pencil, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { DocumentChip } from './chat/DocumentChip';
import { useDocumentSelection } from './contexts/DocumentSelectionContext';

interface ChatInterfaceProps {
  userId: string;
  conversationId?: string | null;
  onConversationLoaded?: (conversationId: string) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  timestamp: Date;
}

interface Source {
  document_id: string;
  title: string;
  source_type: string;
  relevance_score: number;
  excerpt: string;
  created_at: string;
}

export function ChatInterface({ userId, conversationId: propConversationId, onConversationLoaded }: ChatInterfaceProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(true);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const { selectedDocuments, removeDocument } = useDocumentSelection();

  const handleCopyMessage = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      toast.error('Failed to copy message');
    }
  };

  const handleStartEdit = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditContent(content);
    // Focus the textarea after render
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleSaveEdit = async (messageId: string) => {
    if (!editContent.trim() || loading) return;

    // Find the index of the message being edited
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;

    // Remove all messages after this one (including the assistant response)
    const updatedMessages = messages.slice(0, messageIndex);

    // Update the edited message
    const editedMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: editContent.trim(),
      timestamp: new Date(),
    };

    setMessages([...updatedMessages, editedMessage]);
    setEditingMessageId(null);
    setEditContent('');
    setLoading(true);

    // Force scroll to bottom
    shouldAutoScrollRef.current = true;
    setTimeout(() => scrollToBottom(true), 100);

    // Create placeholder for assistant message
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      // Build filters with document selection
      const filters: Record<string, unknown> = {
        topK: 5,
      };

      if (selectedDocuments.length > 0) {
        if (selectedDocuments.length === 1) {
          filters.document_id = selectedDocuments[0].id;
        } else {
          filters.document_ids = selectedDocuments.map(d => d.id);
        }
      }

      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          query: editContent.trim(),
          conversation_id: conversationId,
          filters,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response stream available');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'metadata') {
                if (!conversationId && data.conversation_id) {
                  setConversationId(data.conversation_id);
                }
              } else if (data.type === 'token') {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + data.content }
                      : msg
                  )
                );
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (parseError) {
              // Silently handle parse errors
            }
          }
        }
      }
    } catch (error) {
      toast.error('Unable to process your question', {
        description: 'Please try again in a moment.',
      });

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: "I'm sorry, I encountered an issue processing your question. Please try asking again.",
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const isNearBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    
    const threshold = 100; // pixels from bottom
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom < threshold;
  };

  const scrollToBottom = (force = false) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    // Only auto-scroll if user is near bottom or if forced (e.g., new message sent)
    if (force || shouldAutoScrollRef.current) {
      // Use scrollTop instead of scrollIntoView to avoid affecting page scroll
      if (force) {
        // Smooth scroll for user actions
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      } else {
        // Instant scroll during streaming to avoid blocking
        container.scrollTop = container.scrollHeight;
      }
    }
  };

  // Handle scroll events to detect user scrolling
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // Stop propagation to prevent affecting parent scroll
    e.stopPropagation();
    if (messagesContainerRef.current) {
      shouldAutoScrollRef.current = isNearBottom();
    }
  };

  useEffect(() => {
    // Auto-scroll on new messages, but only if user is near bottom
    if (shouldAutoScrollRef.current) {
      scrollToBottom(false);
    }
  }, [messages]);

  // Load conversation and messages - handles both initial load and conversation switching
  useEffect(() => {
    const loadConversation = async () => {
      try {
        setConversationLoading(true);
        setMessages([]); // Clear messages when switching conversations

        // If a specific conversation ID is provided, load it
        if (propConversationId) {
          const response = await fetch(`/api/conversations/${propConversationId}/messages`);

          if (!response.ok) {
            throw new Error('Failed to load conversation messages');
          }

          const data = await response.json();
          setConversationId(propConversationId);

          const loadedMessages: Message[] = data.messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            sources: msg.sources || [],
            timestamp: new Date(msg.created_at),
          }));

          setMessages(loadedMessages);
          onConversationLoaded?.(propConversationId);
          // Scroll to bottom when conversation loads
          shouldAutoScrollRef.current = true;
          setTimeout(() => scrollToBottom(true), 100);
        } else {
          // Load latest conversation
          const response = await fetch(`/api/conversations/latest?user_id=${userId}`);

          if (!response.ok) {
            throw new Error('Failed to load conversation');
          }

          const data = await response.json();
          setConversationId(data.conversation.id);

          const loadedMessages: Message[] = data.messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            sources: msg.sources || [],
            timestamp: new Date(msg.created_at),
          }));

          setMessages(loadedMessages);
          onConversationLoaded?.(data.conversation.id);
          // Scroll to bottom when conversation loads
          shouldAutoScrollRef.current = true;
          setTimeout(() => scrollToBottom(true), 100);
        }
      } catch (error) {
        toast.error('Failed to load conversation', {
          description: 'Please try again',
        });
      } finally {
        setConversationLoading(false);
      }
    };

    if (userId) {
      loadConversation();
    }
  }, [userId, propConversationId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentQuery = input;
    setInput('');
    setLoading(true);
    // Force scroll to bottom when user sends a message
    shouldAutoScrollRef.current = true;
    setTimeout(() => scrollToBottom(true), 100);

    // Create placeholder for assistant message
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      // Build filters with document selection
      const filters: Record<string, unknown> = {
        topK: 5,
      };

      if (selectedDocuments.length > 0) {
        if (selectedDocuments.length === 1) {
          filters.document_id = selectedDocuments[0].id;
        } else {
          filters.document_ids = selectedDocuments.map(d => d.id);
        }
      }

      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          query: currentQuery,
          conversation_id: conversationId,
          filters,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response stream available');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'metadata') {
                // Update conversation ID if this was the first message
                if (!conversationId && data.conversation_id) {
                  setConversationId(data.conversation_id);
                }
              } else if (data.type === 'token') {
                // Append token to assistant message
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + data.content }
                      : msg
                  )
                );
              } else if (data.type === 'done') {
                // Don't show toast - response is already visible in chat
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (parseError) {
              // Silently handle parse errors
            }
          }
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // Show a friendly error message
      toast.error('Unable to process your question', {
        description: 'Please try again in a moment. If the problem persists, check your connection.',
      });

      // Update the assistant message with a friendly error message
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: "I'm sorry, I encountered an issue processing your question. Please try asking again, or rephrase your question. If the problem continues, it might help to check your internet connection.",
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white backdrop-blur-sm rounded-2xl shadow-md flex flex-col h-[700px] border border-[hsl(214.3,25%,88%)] overflow-hidden">
      {/* Header */}
      <div className="bg-[hsl(214.3,28%,75%)] p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[hsl(214.3,25%,25%)]" />
          <h2 className="text-xl font-bold text-[hsl(214.3,25%,25%)]">
            Chat with Your Knowledge Base
          </h2>
        </div>
        <p className="text-sm text-[hsl(214.3,20%,35%)] mt-1">
          Ask questions about your uploaded documents
        </p>
      </div>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-[hsl(214.3,25%,97%)]"
        style={{ overscrollBehavior: 'contain' }}
      >
        {conversationLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-[hsl(214.3,28%,75%)] mx-auto mb-2" />
              <p className="text-[hsl(214.3,20%,35%)]">Loading conversation...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-full bg-[hsl(214.3,25%,94%)] flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-[hsl(214.3,28%,75%)]" />
              </div>
              <p className="text-lg font-medium text-[hsl(214.3,25%,25%)] mb-2">
                No messages yet
              </p>
              <p className="text-sm text-[hsl(214.3,20%,35%)]">
                Upload a document and start asking questions about your knowledge base!
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div className={`group relative max-w-[80%] ${message.role === 'user' ? 'flex items-start gap-1' : ''}`}>
                {/* Action buttons for user messages */}
                {message.role === 'user' && editingMessageId !== message.id && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity self-center">
                    <button
                      onClick={() => handleStartEdit(message.id, message.content)}
                      className="p-1.5 rounded-lg hover:bg-[hsl(214.3,25%,85%)] text-[hsl(214.3,20%,45%)]"
                      title="Edit message"
                      disabled={loading}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleCopyMessage(message.id, message.content)}
                      className="p-1.5 rounded-lg hover:bg-[hsl(214.3,25%,85%)] text-[hsl(214.3,20%,45%)]"
                      title="Copy message"
                    >
                      {copiedMessageId === message.id ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
                {/* Edit mode UI */}
                {message.role === 'user' && editingMessageId === message.id ? (
                  <div className="w-full min-w-[300px]">
                    <textarea
                      ref={editInputRef}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full px-4 py-3 bg-[hsl(214.3,25%,97%)] border border-[hsl(214.3,25%,88%)] rounded-xl focus:ring-2 focus:ring-[hsl(214.3,28%,75%)] focus:border-transparent text-[hsl(214.3,25%,25%)] resize-none"
                      rows={3}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSaveEdit(message.id);
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1.5 text-sm text-[hsl(214.3,20%,35%)] hover:bg-[hsl(214.3,25%,94%)] rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(message.id)}
                        disabled={!editContent.trim() || loading}
                        className="px-3 py-1.5 text-sm bg-[hsl(214.3,28%,75%)] hover:bg-[hsl(214.3,30%,65%)] text-[hsl(214.3,25%,25%)] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        Send
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-[hsl(214.3,28%,75%)] text-[hsl(214.3,25%,25%)] shadow-md'
                        : 'bg-white text-[hsl(214.3,25%,25%)] shadow-sm border border-[hsl(214.3,25%,88%)]'
                    }`}
                  >
                    {message.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-a:no-underline">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    )}

                    <p className={`text-xs mt-2 ${
                      message.role === 'user' ? 'text-[hsl(214.3,20%,35%)]' : 'text-[hsl(214.3,15%,45%)]'
                    }`}>
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-[hsl(214.3,25%,88%)]">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[hsl(214.3,28%,75%)]" />
                <span className="text-sm text-[hsl(214.3,20%,35%)]">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-[hsl(214.3,25%,88%)]">
        {/* Document Chips */}
        {selectedDocuments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {selectedDocuments.map((doc) => (
              <DocumentChip
                key={doc.id}
                document={doc}
                onRemove={() => removeDocument(doc.id)}
              />
            ))}
          </div>
        )}
        {selectedDocuments.length === 0 && (
          <p className="text-xs text-[hsl(214.3,15%,60%)] mb-2">
            Searching all documents
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={selectedDocuments.length > 0 ? `Ask about ${selectedDocuments.length} selected document${selectedDocuments.length > 1 ? 's' : ''}...` : "Ask a question..."}
            disabled={loading || conversationLoading}
            className="flex-1 px-4 py-3 bg-[hsl(214.3,25%,97%)] border border-[hsl(214.3,25%,88%)] rounded-xl focus:ring-2 focus:ring-[hsl(214.3,28%,75%)] focus:border-transparent text-[hsl(214.3,25%,25%)] placeholder:text-[hsl(214.3,15%,60%)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || conversationLoading}
            className="bg-[hsl(214.3,28%,75%)] hover:bg-[hsl(214.3,30%,65%)] disabled:bg-[hsl(214.3,15%,60%)] disabled:cursor-not-allowed text-[hsl(214.3,25%,25%)] font-medium px-6 py-3 rounded-xl transition-all flex items-center gap-2 shadow-md"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            <span className="hidden sm:inline">
              {loading ? 'Sending...' : 'Send'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
