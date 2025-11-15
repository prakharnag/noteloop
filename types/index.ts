// Core types for Audio and Document processing

export type SourceType = 'audio' | 'pdf' | 'markdown';

export interface Document {
  id: string;
  user_id: string;
  title: string;
  source_type: SourceType;
  source_uri: string | null;
  created_at: Date;
  ingested_at: Date;
  tags: string[];
}

export interface Chunk {
  id: string;
  document_id: string;
  chunk_index: number;
  chunk_text: string;
  embedding_id: string;
  created_at: Date;
  processed_flag: boolean;
  metadata: Record<string, any>;
}

export interface ProcessedContent {
  text: string;
  metadata: Record<string, any>;
}

export interface IngestRequest {
  user_id: string;
  source_type: SourceType;
  file?: File;
  title?: string;
  tags?: string[];
}

export interface IngestResponse {
  document_id: string;
  status: 'processing' | 'completed';
  message: string;
}
