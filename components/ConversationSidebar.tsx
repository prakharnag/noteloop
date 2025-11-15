'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Plus, Loader2, MoreVertical, Edit2, Trash2, X, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ConversationSidebarProps {
  userId: string;
  currentConversationId: string | null;
  onConversationSelect: (conversationId: string) => void;
  onNewConversation: () => void;
}

export function ConversationSidebar({
  userId,
  currentConversationId,
  onConversationSelect,
  onNewConversation,
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/conversations?user_id=${userId}`);

      if (!response.ok) {
        throw new Error('Failed to load conversations');
      }

      const data = await response.json();
      setConversations(data.conversations);
    } catch (error) {
      console.error('[ConversationSidebar] Error:', error);
      toast.error('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadConversations();
    }
  }, [userId]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is outside any menu dropdown
      const menuElement = document.querySelector('[data-menu-dropdown]');
      if (menuElement && !menuElement.contains(target)) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenuId]);

  // Focus input when editing
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleNewConversation = async () => {
    try {
      setCreating(true);
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          title: 'New Chat',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create conversation');
      }

      const data = await response.json();
      toast.success('New chat created!');

      // Reload conversations and switch to new one
      await loadConversations();
      onNewConversation();
      onConversationSelect(data.conversation.id);
    } catch (error) {
      console.error('[ConversationSidebar] Error creating conversation:', error);
      toast.error('Failed to create new chat');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (conversationId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      toast.error('Title cannot be empty');
      return;
    }

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });

      if (!response.ok) {
        throw new Error('Failed to rename conversation');
      }

      toast.success('Conversation renamed');
      setEditingId(null);
      setEditTitle('');
      await loadConversations();
    } catch (error) {
      console.error('[ConversationSidebar] Error renaming conversation:', error);
      toast.error('Failed to rename conversation');
    }
  };

  const handleDelete = async (conversationId: string) => {
    if (!confirm('Are you sure you want to delete this conversation?')) {
      return;
    }

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete conversation');
      }

      toast.success('Conversation deleted');
      setOpenMenuId(null);

      // If deleted conversation was current, switch to new conversation
      if (conversationId === currentConversationId) {
        onNewConversation();
      }

      await loadConversations();
    } catch (error) {
      console.error('[ConversationSidebar] Error deleting conversation:', error);
      toast.error('Failed to delete conversation');
    }
  };

  const startEditing = (conversation: Conversation) => {
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
    setOpenMenuId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full bg-white backdrop-blur-sm border-r border-neutral-200">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200">
        <button
          onClick={handleNewConversation}
          disabled={creating}
          className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover disabled:bg-neutral-400 text-foreground font-medium py-3 rounded-xl transition-all disabled:cursor-not-allowed shadow-md"
        >
          {creating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Creating...</span>
            </>
          ) : (
            <>
              <Plus className="w-5 h-5" />
              <span>New Chat</span>
            </>
          )}
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MessageSquare className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm text-neutral-600">
              No conversations yet
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Start a new chat to begin!
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group relative w-full p-3 rounded-xl transition-all ${
                  conversation.id === currentConversationId
                    ? 'bg-neutral-100 border border-neutral-200'
                    : 'hover:bg-neutral-50'
                }`}
              >
                {editingId === conversation.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRename(conversation.id, editTitle);
                        } else if (e.key === 'Escape') {
                          cancelEditing();
                        }
                      }}
                      className="flex-1 px-2 py-1 text-sm font-medium bg-white border border-neutral-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      onClick={() => handleRename(conversation.id, editTitle)}
                      className="p-1 text-success hover:bg-neutral-100 rounded transition-colors"
                      title="Save"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="p-1 text-neutral-500 hover:bg-neutral-100 rounded transition-colors"
                      title="Cancel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => onConversationSelect(conversation.id)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-start gap-2">
                        <MessageSquare
                          className={`w-4 h-4 mt-1 shrink-0 ${
                            conversation.id === currentConversationId
                              ? 'text-primary'
                              : 'text-neutral-400'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-medium truncate ${
                              conversation.id === currentConversationId
                                ? 'text-foreground'
                                : 'text-neutral-600'
                            }`}
                          >
                            {conversation.title}
                          </p>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {formatDate(conversation.updated_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                    <div className="relative shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(
                            openMenuId === conversation.id ? null : conversation.id
                          );
                        }}
                        className="p-1 rounded hover:bg-neutral-200 transition-colors opacity-0 group-hover:opacity-100"
                        title="More options"
                      >
                        <MoreVertical className="w-4 h-4 text-neutral-500" />
                      </button>
                      {openMenuId === conversation.id && (
                        <div 
                          data-menu-dropdown
                          className="absolute right-0 top-8 z-50 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[140px]"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(conversation);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-neutral-100 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                            <span>Rename</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(conversation.id);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error-light transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
