-- Migration: Remove meetings table and meeting_id from documents
-- This migration removes all meeting-related functionality from the database

-- Step 1: Drop the foreign key constraint on documents.meeting_id
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_meeting_id_fkey;

-- Step 2: Drop the index on documents.meeting_id
DROP INDEX IF EXISTS idx_documents_meeting_id;

-- Step 3: Remove the meeting_id column from documents table
ALTER TABLE documents DROP COLUMN IF EXISTS meeting_id;

-- Step 4: Drop RLS policies on meetings table
DROP POLICY IF EXISTS "Users can view their own meetings" ON meetings;

-- Step 5: Disable RLS on meetings table (required before dropping)
ALTER TABLE IF EXISTS meetings DISABLE ROW LEVEL SECURITY;

-- Step 6: Drop indexes on meetings table
DROP INDEX IF EXISTS idx_meetings_user_id;
DROP INDEX IF EXISTS idx_meetings_start_time;
DROP INDEX IF EXISTS idx_meetings_status;

-- Step 7: Drop the meetings table
DROP TABLE IF EXISTS meetings CASCADE;

