# NoteLoop - Second Brain AI Companion

A personal AI companion that ingests, understands, and reasons about your information. Built with Next.js, Supabase, Pinecone, and OpenAI.

## Features

- 🎙️ **Audio Transcription**: Upload audio files (mp3, m4a, wav) and automatically transcribe using OpenAI Whisper
- 📄 **Document Processing**: Extract text from PDFs and Markdown files
- 🧠 **Semantic Search**: Vector embeddings with Pinecone for intelligent retrieval
- ⏱️ **Temporal Queries**: Time-based filtering (e.g., "What did I work on last month?")
- 💾 **Persistent Storage**: Supabase (Postgres) for metadata, Pinecone for vectors
- 🔐 **Security**: Row Level Security (RLS) with Supabase

## Architecture

- **Frontend**: Next.js 16 with React 19, Tailwind CSS v4
- **Backend**: Next.js API Routes
- **Database**: Supabase (Postgres)
- **Vector DB**: Pinecone
- **AI**: OpenAI (Whisper for transcription, GPT for Q&A, text-embedding-3-small for vectors)
- **Storage**: Supabase Storage (for uploaded files)

## Prerequisites

- Node.js 20+ and npm
- Supabase account (free tier works)
- Pinecone account (free tier works)
- OpenAI API key

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd noteloop
npm install
```

### 2. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to initialize (~2 minutes)
3. Go to **SQL Editor** in Supabase dashboard
4. Copy the contents of `lib/db/schema.sql` and run it in the SQL Editor
5. Go to **Project Settings** > **API** and copy:
   - Project URL (SUPABASE_URL)
   - `anon` `public` key (SUPABASE_ANON_KEY)
6. Go to **Storage** and create a new bucket called `uploads` (make it public or configure RLS)

### 3. Set Up Pinecone

1. Go to [pinecone.io](https://www.pinecone.io) and create an account
2. Create a new index:
   - **Name**: `second-brain` (or your choice)
   - **Dimensions**: `1536` (for OpenAI text-embedding-3-small)
   - **Metric**: `cosine`
   - **Cloud**: AWS
   - **Region**: `us-east-1`
3. Go to **API Keys** and copy your API key

### 4. Get OpenAI API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Navigate to **API Keys**
3. Create a new secret key and copy it

### 5. Configure Environment Variables

Create a `.env` file in the `noteloop` directory:

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...

# Pinecone
PINECONE_API_KEY=pcsk_...
PINECONE_INDEX_NAME=second-brain
```

### 6. Create a Test User (Optional)

Run this in Supabase SQL Editor to create a test user:

```sql
INSERT INTO users (email, name)
VALUES ('test@example.com', 'Test User')
RETURNING id;
```

Save the returned `id` - you'll need it for API requests.

## Development

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Test Processors

Test the audio and document processors:

```bash
npm run test:processors
```

This will:
- Create a sample Markdown file
- Process it and chunk the content
- Verify the chunking logic works

### Lint Code

```bash
npm run lint
```

## API Endpoints

### POST /api/ingest

Upload and process audio or document files.

**Request (multipart/form-data):**
```
file: File (pdf, md, mp3, m4a, wav)
user_id: string (UUID)
title: string (optional)
tags: string (optional, comma-separated)
```

**Response:**
```json
{
  "document_id": "uuid",
  "status": "processing",
  "message": "File uploaded successfully",
  "check_status_url": "/api/ingest/status/{document_id}"
}
```

### GET /api/ingest/status/:id

Check processing status of a document.

### POST /api/query

Query your knowledge base with natural language.

**Request:**
```json
{
  "user_id": "uuid",
  "query": "What were the key points from the uploaded documents?",
  "filters": {
    "time_range": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-01-31T23:59:59Z"
    },
    "tags": ["project-x"],
    "source_types": ["audio"]
  }
}
```

## Project Structure

```
noteloop/
├── app/
│   ├── api/
│   │   ├── ingest/          # File upload and processing
│   │   └── query/           # Q&A endpoint
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── db/
│   │   ├── schema.sql       # Supabase database schema
│   │   └── supabase.ts      # Supabase client
│   ├── processors/
│   │   ├── audio.ts         # Audio transcription (Whisper)
│   │   ├── document.ts      # PDF/Markdown processing
│   │   └── async-processor.ts # Background processing
│   ├── vectordb/
│   │   ├── embeddings.ts    # OpenAI embeddings
│   │   └── pinecone.ts      # Pinecone integration
│   ├── storage/
│   │   └── supabase-storage.ts # File storage
│   └── chunking.ts          # Text chunking logic
├── types/
│   └── index.ts             # TypeScript types
├── scripts/
│   └── test-processors.ts   # Testing script
└── .env                     # Environment variables (create this)
```

## Database Schema

See `lib/db/schema.sql` for the complete schema. Key tables:

- **users**: User accounts
- **documents**: Uploaded files and their metadata
- **chunks**: Processed text chunks with embeddings
- **conversations**: Chat conversation sessions
- **messages**: Chat messages within conversations

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJhbGc...` |
| `PINECONE_API_KEY` | Pinecone API key | `pcsk_...` |
| `PINECONE_INDEX_NAME` | Pinecone index name | `second-brain` |


## Troubleshooting

### "Missing Supabase credentials"
- Ensure `.env` file exists in the `noteloop` directory
- Check that `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set correctly

### "OPENAI_API_KEY not set"
- Add your OpenAI API key to `.env`
- Restart the development server

### "Failed to create Pinecone index"
- Ensure your index dimensions are `1536`
- Check that the metric is set to `cosine`

### Database connection errors
- Verify Supabase project is active
- Check that the schema has been run
- Ensure RLS policies are configured correctly

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
