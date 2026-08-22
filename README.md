# VoxPilot

VoxPilot is an AI-powered voice assistant for YouTube video analysis. It allows users to paste YouTube URLs, get AI-generated summaries, and interact with the content using natural voice commands. The application leverages Google Gemini for intelligent content analysis and ElevenLabs for natural text-to-speech responses.

## Features

### Video Analysis

- Paste any YouTube URL to analyze the video content
- Automatically extracts transcripts when available for accurate analysis
- Falls back to metadata-based inference when transcripts are unavailable
- Displays confidence badges (Full or Inferred) based on data source. dtlp required 
- Generates key takeaways, abstracts, and structured summaries
- More features are in pipeline 

### Voice Control

- Full voice command support for hands-free operation
- Supported voice commands:
  - "Summarize this video" or "Analyze this" to process a pasted URL
  - "Save" or "Save this video" to bookmark the current video
  - "Delete" to remove a video from your library (with voice confirmation)
  - "Read the summary" to hear the summary spoken aloud
  - "How many videos do I have?" to get a count of saved videos
  - "Switch to dark mode" or "Switch to light mode" for theme control
  - "Play" or "Watch" to open the video on YouTube

### Video Library

- Save analyzed videos to your personal library
- View and manage saved videos in the sidebar
- One-click loading of previously saved summaries
- Voice commands for library management

### Audio Responses

- Natural text-to-speech powered by ElevenLabs
- Voice feedback for confirmations, summaries, and answers
- Confidence-adjusted voice tone for follow-up question responses

## Tech Stack

<p align="left">
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/Google_Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Google Gemini" />
  <img src="https://img.shields.io/badge/ElevenLabs-000000?style=for-the-badge&logo=elevenlabs&logoColor=white" alt="ElevenLabs" />
  <img src="https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white" alt="Framer Motion" />
</p>

| Technology     | Purpose                                            |
| -------------- | -------------------------------------------------- |
| Next.js 14     | React framework with App Router and Server Actions |
| TypeScript     | Type-safe development                              |
| Tailwind CSS   | Utility-first styling                              |
| Supabase       | Authentication and database for saved videos       |
| Google Gemini  | AI-powered video summarization and Q&A             |
| ElevenLabs     | Natural text-to-speech for voice responses         |
| Framer Motion  | Smooth animations and transitions                  |
| Radix UI       | Accessible component primitives                    |
| Web Speech API | Browser-based voice recognition                    |

## Prerequisites

Before running VoxPilot locally, you will need:

1. **Node.js** (v20 or higher)
2. **pnpm** package manager
3. **Supabase account** with a project set up
4. **Google AI API key** for Gemini access
5. **ElevenLabs API key** for text-to-speech

## Local Development

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/VoxPilot.git
cd VoxPilot
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment Variables

Copy the example environment file and fill in your API keys:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Google AI API Key (for Gemini)
GOOGLE_API_KEY=your_google_api_key_here

# ElevenLabs API Key (for Text-to-Speech)
ELEVEN_LABS_API_KEY=your_elevenlabs_api_key_here
```

### 4. Set Up Supabase Database

Create the following table in your Supabase project:

```sql
create table saved_content (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  url text not null,
  video_id text not null,
  title text not null,
  summary_json jsonb not null,
  thumbnail_url text,
  created_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table saved_content enable row level security;

-- Create policy for users to manage their own content
create policy "Users can manage own content" on saved_content
  for all using (auth.uid() = user_id);
```

### 5. Run the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
VoxPilot/
├── app/
│   ├── actions.ts          # Server actions for AI processing
│   ├── dashboard/          # Main dashboard page
│   ├── login/              # Login page
│   ├── signup/             # Signup page
│   ├── globals.css         # Global styles
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Landing page
├── components/
│   ├── ui/                 # Reusable UI components
│   └── icons.tsx           # Icon components
├── lib/
│   ├── supabase/           # Supabase client configuration
│   └── utils.ts            # Utility functions
├── types/                  # TypeScript type definitions
└── middleware.ts           # Auth middleware
```

## Usage

1. **Sign up or log in** to access the dashboard
2. **Paste a YouTube URL** in the input field
3. **Click Analyze** or say "Summarize this video"
4. **View the AI-generated summary** with key takeaways
5. **Save videos** to your library for later reference
6. **Use voice commands** for hands-free interaction

## Voice Commands Reference

| Command                           | Action                                       |
| --------------------------------- | -------------------------------------------- |
| "Summarize this" / "Analyze this" | Analyze the video URL in the input field     |
| "Save" / "Save this"              | Save current video to library                |
| "Delete"                          | Delete current video (requires confirmation) |
| "Read the summary"                | Read summary aloud                           |
| "Read the answer"                 | Read the last Q&A answer aloud               |
| "How many videos"                 | Count saved videos                           |
| "Dark mode" / "Light mode"        | Switch theme                                 |
| "Hello" / "Hi"                    | Greeting response                            |
| Ask any question                  | Get contextual answers about the video       |

## API Keys

### Google Gemini

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create or select a project
3. Generate an API key
4. Add to `GOOGLE_API_KEY` in `.env.local`

### ElevenLabs

1. Visit [ElevenLabs](https://elevenlabs.io)
2. Sign up and go to Profile Settings
3. Copy your API key
4. Add to `ELEVEN_LABS_API_KEY` in `.env.local`

### Supabase

1. Visit [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project
3. Go to Project Settings > API
4. Copy the URL and anon key
5. Add to `.env.local`

## License

This project is licensed under the MIT License.
