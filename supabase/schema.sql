-- VoxPilot YouTube Knowledge Base Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create saved_content table
CREATE TABLE IF NOT EXISTS saved_content (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary_json JSONB NOT NULL,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_saved_content_user_id ON saved_content(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_content_video_id ON saved_content(video_id);
CREATE INDEX IF NOT EXISTS idx_saved_content_created_at ON saved_content(created_at DESC);

-- Enable Row Level Security
ALTER TABLE saved_content ENABLE ROW LEVEL SECURITY;

-- Create policies for saved_content
-- Users can only see their own content
CREATE POLICY "Users can view own content"
  ON saved_content
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own content
CREATE POLICY "Users can insert own content"
  ON saved_content
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own content
CREATE POLICY "Users can update own content"
  ON saved_content
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own content
CREATE POLICY "Users can delete own content"
  ON saved_content
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_saved_content_updated_at
  BEFORE UPDATE ON saved_content
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
