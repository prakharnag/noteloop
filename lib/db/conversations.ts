/**
 * Database helper functions for conversation and message management
 */

import { getSupabaseClient } from './supabase';

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: any[];
  created_at: string;
}

/**
 * Create a new conversation
 */
export async function createConversation(userId: string, title?: string): Promise<Conversation> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      title: title || 'New Conversation',
    })
    .select()
    .single();

  if (error) {
    console.error('[Conversations] Error creating conversation:', error);
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return data;
}

/**
 * Get all conversations for a user
 */
export async function getUserConversations(
  userId: string
): Promise<Conversation[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[Conversations] Error fetching conversations:', error);
    throw new Error(`Failed to fetch conversations: ${error.message}`);
  }

  return data || [];
}

/**
 * Get a specific conversation
 */
export async function getConversation(
  conversationId: string
): Promise<Conversation | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (error) {
    console.error('[Conversations] Error fetching conversation:', error);
    return null;
  }

  return data;
}

/**
 * Get all messages in a conversation
 */
export async function getConversationMessages(
  conversationId: string
): Promise<Message[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[Conversations] Error fetching messages:', error);
    throw new Error(`Failed to fetch messages: ${error.message}`);
  }

  return data || [];
}

/**
 * Add a message to a conversation
 */
export async function addMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  sources?: any[]
): Promise<Message> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
      sources: sources || [],
    })
    .select()
    .single();

  if (error) {
    console.error('[Conversations] Error adding message:', error);
    throw new Error(`Failed to add message: ${error.message}`);
  }

  return data;
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('conversations')
    .update({ title })
    .eq('id', conversationId);

  if (error) {
    console.error('[Conversations] Error updating title:', error);
    throw new Error(`Failed to update conversation title: ${error.message}`);
  }
}

/**
 * Delete a conversation and all its messages
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId);

  if (error) {
    console.error('[Conversations] Error deleting conversation:', error);
    throw new Error(`Failed to delete conversation: ${error.message}`);
  }
}

/**
 * Get the most recent conversation for a user, or create one if none exists
 */
export async function getOrCreateConversation(
  userId: string
): Promise<Conversation> {
  const conversations = await getUserConversations(userId);

  if (conversations.length > 0) {
    return conversations[0]; // Most recent
  }

  return createConversation(userId);
}
