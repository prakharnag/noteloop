-- Database schema for Second Brain AI Companion (Supabase)
-- Run this in Supabase SQL Editor or via migration

-- Enable UUID extension (usually already enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('audio', 'pdf', 'markdown')),
  source_uri TEXT, -- file path/URL
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ingested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  tags TEXT[] DEFAULT '{}'::text[]
);

-- Chunks table
-- Stores processed text chunks from documents with embeddings
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding_id TEXT NOT NULL, -- Reference to Pinecone vector ID
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_flag BOOLEAN DEFAULT FALSE, -- For async processing
  metadata JSONB DEFAULT '{}'::jsonb, -- Stores additional chunk metadata
  UNIQUE(document_id, chunk_index)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_tags ON documents USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_id ON chunks(embedding_id);
CREATE INDEX IF NOT EXISTS idx_chunks_processed_flag ON chunks(processed_flag);
CREATE INDEX IF NOT EXISTS idx_chunks_created_at ON chunks(created_at);
CREATE INDEX IF NOT EXISTS idx_chunks_metadata ON chunks USING GIN(metadata);

-- Function to automatically create user record when auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, created_at)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function when a new user signs up
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable Row Level Security (RLS) - Supabase best practice
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies (adjust based on your auth setup)
-- For now, these are permissive policies. Tighten them based on your auth requirements.

CREATE POLICY "Users can view their own data" ON users
  FOR SELECT USING (true);

CREATE POLICY "Users can view their own documents" ON documents
  FOR ALL USING (true);

CREATE POLICY "Users can view chunks from their documents" ON chunks
  FOR ALL USING (true);

-- Storage Policies for uploads bucket
-- These allow authenticated users to upload, read, update, and delete files

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'uploads');

-- Allow authenticated users to read files
CREATE POLICY "Authenticated users can read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'uploads');

-- Allow users to update their own files
CREATE POLICY "Users can update own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'uploads');

-- Allow users to delete their own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
