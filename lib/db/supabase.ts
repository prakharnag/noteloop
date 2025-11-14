/**
 * Supabase database client
 * Provides type-safe database access for the Second Brain system
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Database types based on schema
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          sources: any[];
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          sources?: any[];
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: 'user' | 'assistant' | 'system';
          content?: string;
          sources?: any[];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          }
        ];
      };
      meetings: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          start_time: string;
          end_time: string | null;
          status: 'active' | 'completed' | 'failed';
          total_duration: number | null;
          metadata: Record<string, any>;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          start_time: string;
          end_time?: string | null;
          status?: 'active' | 'completed' | 'failed';
          total_duration?: number | null;
          metadata?: Record<string, any>;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          start_time?: string;
          end_time?: string | null;
          status?: 'active' | 'completed' | 'failed';
          total_duration?: number | null;
          metadata?: Record<string, any>;
        };
        Relationships: [
          {
            foreignKeyName: "meetings_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      documents: {
        Row: {
          id: string;
          user_id: string;
          meeting_id: string | null;
          title: string;
          source_type: 'audio' | 'pdf' | 'markdown';
          source_uri: string | null;
          created_at: string;
          ingested_at: string;
          tags: string[];
        };
        Insert: {
          id?: string;
          user_id: string;
          meeting_id?: string | null;
          title: string;
          source_type: 'audio' | 'pdf' | 'markdown';
          source_uri?: string | null;
          created_at?: string;
          ingested_at?: string;
          tags?: string[];
        };
        Update: {
          id?: string;
          user_id?: string;
          meeting_id?: string | null;
          title?: string;
          source_type?: 'audio' | 'pdf' | 'markdown';
          source_uri?: string | null;
          created_at?: string;
          ingested_at?: string;
          tags?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "documents_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_meeting_id_fkey";
            columns: ["meeting_id"];
            referencedRelation: "meetings";
            referencedColumns: ["id"];
          }
        ];
      };
      chunks: {
        Row: {
          id: string;
          document_id: string;
          chunk_index: number;
          chunk_text: string;
          embedding_id: string;
          created_at: string;
          processed_flag: boolean;
          metadata: Record<string, any>;
        };
        Insert: {
          id?: string;
          document_id: string;
          chunk_index: number;
          chunk_text: string;
          embedding_id: string;
          created_at?: string;
          processed_flag?: boolean;
          metadata?: Record<string, any>;
        };
        Update: {
          id?: string;
          document_id?: string;
          chunk_index?: number;
          chunk_text?: string;
          embedding_id?: string;
          created_at?: string;
          processed_flag?: boolean;
          metadata?: Record<string, any>;
        };
        Relationships: [
          {
            foreignKeyName: "chunks_document_id_fkey";
            columns: ["document_id"];
            referencedRelation: "documents";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};

let supabaseClient: SupabaseClient<Database> | null = null;

/**
 * Get Supabase client singleton
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env'
      );
    }

    supabaseClient = createClient<Database>(supabaseUrl, supabaseKey);
  }

  return supabaseClient;
}

/**
 * Helper function to create a new user
 */
export async function createUser(email: string, name: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .insert({ email, name })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Helper function to create a new meeting
 */
export async function createMeeting(
  userId: string,
  title: string,
  startTime: Date
) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('meetings')
    .insert({
      user_id: userId,
      title,
      start_time: startTime.toISOString(),
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Helper function to complete a meeting
 */
export async function completeMeeting(
  meetingId: string,
  endTime: Date,
  totalDuration: number
) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('meetings')
    .update({
      end_time: endTime.toISOString(),
      status: 'completed',
      total_duration: totalDuration,
    })
    .eq('id', meetingId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Helper function to create a document
 */
export async function createDocument(document: Database['public']['Tables']['documents']['Insert']) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('documents')
    .insert(document)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Helper function to create chunks
 */
export async function createChunks(chunks: Database['public']['Tables']['chunks']['Insert'][]) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('chunks')
    .insert(chunks)
    .select();

  if (error) throw error;
  return data;
}

/**
 * Helper function to get document with chunks
 */
export async function getDocumentWithChunks(documentId: string) {
  const supabase = getSupabaseClient();
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (docError) throw docError;

  const { data: chunks, error: chunksError } = await supabase
    .from('chunks')
    .select('*')
    .eq('document_id', documentId)
    .order('chunk_index');

  if (chunksError) throw chunksError;

  return { document, chunks };
}
