'use client';

import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { Send, Loader2, Sparkles } from 'lucide-react';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

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
          console.log('[ChatInterface] Loading specific conversation:', propConversationId);
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
          console.log(`[ChatInterface] Loaded conversation ${propConversationId} with ${loadedMessages.length} messages`);
          // Scroll to bottom when conversation loads
          shouldAutoScrollRef.current = true;
          setTimeout(() => scrollToBottom(true), 100);
        } else {
          // Load latest conversation
          console.log('[ChatInterface] Loading latest conversation for user:', userId);
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
          console.log(`[ChatInterface] Loaded conversation ${data.conversation.id} with ${loadedMessages.length} messages`);
          // Scroll to bottom when conversation loads
          shouldAutoScrollRef.current = true;
          setTimeout(() => scrollToBottom(true), 100);
        }
      } catch (error) {
        console.error('[ChatInterface] Error loading conversation:', error);
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
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          query: currentQuery,
          conversation_id: conversationId,
          filters: {
            topK: 5,
          },
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
                  console.log('[ChatInterface] Set conversation ID:', data.conversation_id);
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
                console.log('[ChatInterface] Streaming completed');
                toast.success('Response complete!');
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (parseError) {
              console.error('[ChatInterface] Error parsing SSE:', parseError);
            }
          }
        }
      }
    } catch (error) {
      console.error('[ChatInterface] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      toast.error('Failed to get response', {
        description: errorMessage,
      });

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: '❌ Sorry, I encountered an error. Please try again.',
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
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-[hsl(214.3,28%,75%)] text-[hsl(214.3,25%,25%)] shadow-md'
                    : 'bg-white text-[hsl(214.3,25%,25%)] shadow-sm border border-[hsl(214.3,25%,88%)]'
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

                <p className={`text-xs mt-2 ${
                  message.role === 'user' ? 'text-[hsl(214.3,20%,35%)]' : 'text-[hsl(214.3,15%,45%)]'
                }`}>
                  {message.timestamp.toLocaleTimeString()}
                </p>
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
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
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
