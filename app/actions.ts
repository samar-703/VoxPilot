"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { YoutubeTranscript } from "youtube-transcript";
import { createClient } from "@/lib/supabase/server";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

// Track Gemini failures to skip retrying when quota exceeded
let geminiDisabledUntil = 0;

// Types
export interface VideoSummary {
  title: string;
  keyTakeaways: string[];
  abstract: string;
}

export interface SavedContent {
  id: string;
  user_id: string;
  url: string;
  video_id: string;
  title: string;
  summary_json: VideoSummary;
  thumbnail_url: string;
  created_at: string;
}

export interface CommandAnalysis {
  intent:
    | "analyze_url"
    | "question"
    | "read_summary"
    | "save"
    | "list"
    | "delete"
    | "greeting"
    | "unclear";
  url?: string;
  videoId?: string;
  question?: string;
  response: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  audio?: string;
  analysis?: CommandAnalysis;
  summary?: VideoSummary;
  savedContent?: SavedContent;
}

// Extract YouTube Video ID from URL
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Get YouTube thumbnail URL
function getThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// Fetch transcript from YouTube
async function fetchTranscript(videoId: string): Promise<string> {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    return transcript.map((item) => item.text).join(" ");
  } catch (error) {
    console.error("Failed to fetch transcript:", error);
    throw new Error(
      "Could not fetch video transcript. The video may not have captions available."
    );
  }
}

// Process YouTube link and generate summary
export async function processYoutubeLink(url: string): Promise<ActionResult> {
  const videoId = extractVideoId(url);

  if (!videoId) {
    return {
      success: false,
      message: "Invalid YouTube URL. Please provide a valid YouTube link.",
    };
  }

  try {
    // Fetch transcript
    console.log("📝 Fetching transcript for video:", videoId);
    const transcript = await fetchTranscript(videoId);

    if (!transcript || transcript.length < 50) {
      return {
        success: false,
        message: "Video transcript is too short or unavailable.",
      };
    }

    // Generate summary with Gemini
    console.log("Generating summary with Gemini...");
    const summary = await generateSummaryWithGemini(transcript);

    if (!summary) {
      return {
        success: false,
        message: "Failed to generate summary. Please try again.",
      };
    }

    return {
      success: true,
      message: "Video analyzed successfully!",
      summary,
      analysis: {
        intent: "analyze_url",
        url,
        videoId,
        response: `Analyzed: ${summary.title}`,
      },
    };
  } catch (error) {
    console.error("Error processing YouTube link:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to process video.",
    };
  }
}

// Generate summary using Gemini 2.0 Flash
async function generateSummaryWithGemini(
  transcript: string
): Promise<VideoSummary | null> {
  const now = Date.now();
  if (now < geminiDisabledUntil) {
    console.log("⏭️ Gemini quota exceeded, skipping...");
    return null;
  }

  if (!process.env.GOOGLE_API_KEY) {
    console.log("⏭No Gemini API key configured");
    return null;
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const systemPrompt = `You are a research assistant. Summarize this video transcript into:
1. A concise Title (max 10 words)
2. Exactly 3 Key Takeaways (each max 20 words)
3. A 50-word Abstract

Return ONLY valid JSON in this exact format:
{
  "title": "...",
  "keyTakeaways": ["...", "...", "..."],
  "abstract": "..."
}`;

    // Truncate transcript if too long (keep first 15000 chars for context)
    const truncatedTranscript =
      transcript.length > 15000
        ? transcript.substring(0, 15000) + "..."
        : transcript;

    const result = await model.generateContent([
      systemPrompt,
      `Video transcript:\n${truncatedTranscript}`,
    ]);

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("Failed to parse Gemini response");
      return null;
    }

    return JSON.parse(jsonMatch[0]) as VideoSummary;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 429
    ) {
      console.log("Gemini quota exceeded - disabling for 60 seconds");
      geminiDisabledUntil = Date.now() + 60000;
    }
    console.error("Gemini API error:", error);
    return null;
  }
}

// Save content to Supabase
export async function saveContent(
  url: string,
  videoId: string,
  summary: VideoSummary
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        message: "You must be logged in to save content.",
      };
    }

    const { data, error } = await supabase
      .from("saved_content")
      .insert({
        user_id: user.id,
        url,
        video_id: videoId,
        title: summary.title,
        summary_json: summary,
        thumbnail_url: getThumbnailUrl(videoId),
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return {
        success: false,
        message: "Failed to save content to database.",
      };
    }

    return {
      success: true,
      message: "Content saved successfully!",
      savedContent: data as SavedContent,
    };
  } catch (error) {
    console.error("Save content error:", error);
    return {
      success: false,
      message: "Failed to save content.",
    };
  }
}

// Get saved content for current user
export async function getSavedContent(): Promise<SavedContent[]> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from("saved_content")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase fetch error:", error);
      return [];
    }

    return data as SavedContent[];
  } catch (error) {
    console.error("Get saved content error:", error);
    return [];
  }
}

// Delete saved content
export async function deleteContent(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        message: "You must be logged in to delete content.",
      };
    }

    const { error } = await supabase
      .from("saved_content")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Supabase delete error:", error);
      return {
        success: false,
        message: "Failed to delete content.",
      };
    }

    return {
      success: true,
      message: "Content deleted successfully!",
    };
  } catch (error) {
    console.error("Delete content error:", error);
    return {
      success: false,
      message: "Failed to delete content.",
    };
  }
}

// Answer questions about saved content
export async function askQuestion(
  question: string,
  videoId?: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        message: "You must be logged in to ask questions.",
      };
    }

    // Fetch relevant content
    let query = supabase
      .from("saved_content")
      .select("*")
      .eq("user_id", user.id);

    if (videoId) {
      query = query.eq("video_id", videoId);
    }

    const { data: contents } = await query.limit(5);

    if (!contents || contents.length === 0) {
      return {
        success: false,
        message: "No saved content found to answer your question.",
      };
    }

    // Use Gemini to answer the question
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const context = contents
      .map(
        (c) => `Title: ${c.title}\nSummary: ${JSON.stringify(c.summary_json)}`
      )
      .join("\n\n");

    const result = await model.generateContent([
      `You are a helpful assistant answering questions about saved YouTube videos. Keep answers concise (max 100 words).`,
      `Context from saved videos:\n${context}`,
      `Question: ${question}`,
    ]);

    const answer = result.response.text();

    return {
      success: true,
      message: answer,
      analysis: {
        intent: "question",
        question,
        response: answer,
      },
    };
  } catch (error) {
    console.error("Ask question error:", error);
    return {
      success: false,
      message: "Failed to answer question.",
    };
  }
}

// Analyze voice command intent
export async function analyzeCommand(
  transcript: string
): Promise<ActionResult> {
  const lower = transcript.toLowerCase();

  // Check for URL in transcript
  const urlMatch = transcript.match(
    /(https?:\/\/[^\s]+)|(youtu\.?be[^\s]+)|(youtube\.com[^\s]+)/i
  );

  if (urlMatch) {
    // Extract and process the URL
    let url = urlMatch[0];
    if (!url.startsWith("http")) {
      url = "https://" + url;
    }
    return processYoutubeLink(url);
  }

  // Check for "analyze" or "summarize" intent with video reference
  if (lower.match(/analyze|summarize|process|check out|look at/)) {
    return {
      success: true,
      message: "Please provide a YouTube URL to analyze.",
      analysis: {
        intent: "analyze_url",
        response: "Please provide a YouTube URL to analyze.",
      },
    };
  }

  // Check for "read summary" intent - this triggers TTS
  if (lower.match(/read.*summary|read it|read.*to me|speak|say.*summary/)) {
    const audio = await generateSpeech(
      "Which summary would you like me to read?"
    );
    return {
      success: true,
      message: "Which summary would you like me to read?",
      audio,
      analysis: {
        intent: "read_summary",
        response: "Which summary would you like me to read?",
      },
    };
  }

  // Check for list/show saved content
  if (lower.match(/list|show|my videos|saved|recent/)) {
    return {
      success: true,
      message: "Showing your saved videos.",
      analysis: {
        intent: "list",
        response: "Here are your saved videos.",
      },
    };
  }

  // Check for delete intent
  if (lower.match(/delete|remove|clear/)) {
    return {
      success: true,
      message: "Which video would you like to delete?",
      analysis: {
        intent: "delete",
        response: "Which video would you like to delete?",
      },
    };
  }

  // Check for greetings
  if (lower.match(/^(hi|hello|hey|good|greetings)/)) {
    const audio = await generateSpeech(
      "Hello! Paste a YouTube link or ask me anything."
    );
    return {
      success: true,
      message:
        "Hello! Paste a YouTube link to analyze, or ask me about your saved videos.",
      audio,
      analysis: {
        intent: "greeting",
        response: "Hello! Ready to help.",
      },
    };
  }

  // Default: treat as a question about saved content
  if (transcript.length > 10) {
    return askQuestion(transcript);
  }

  return {
    success: true,
    message:
      "Paste a YouTube link to analyze, or ask me about your saved videos.",
    analysis: {
      intent: "unclear",
      response: "Paste a YouTube link or ask a question.",
    },
  };
}

// Generate speech with ElevenLabs (ONLY when explicitly requested)
export async function generateSpeech(
  text: string
): Promise<string | undefined> {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;

  if (!apiKey) {
    console.warn("⚠️ ElevenLabs API key not configured");
    return undefined;
  }

  try {
    console.log("🔊 Generating speech with ElevenLabs...");

    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM",
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs error:", response.status, errorText);
      return undefined;
    }

    console.log("✅ ElevenLabs audio generated successfully");
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");
    return `data:audio/mpeg;base64,${base64Audio}`;
  } catch (error) {
    console.error("ElevenLabs TTS error:", error);
    return undefined;
  }
}

// Read summary aloud (explicit user request only)
export async function readSummaryAloud(
  summary: VideoSummary
): Promise<ActionResult> {
  const textToRead = `${
    summary.title
  }. Key takeaways: ${summary.keyTakeaways.join(". ")}. ${summary.abstract}`;

  const audio = await generateSpeech(textToRead);

  return {
    success: true,
    message: "Reading summary...",
    audio,
  };
}

// Auth actions
export async function signIn(email: string, password: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, message: error.message };
  }

  return { success: true, message: "Signed in successfully!" };
}

export async function signUp(email: string, password: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { success: false, message: error.message };
  }

  return {
    success: true,
    message: "Check your email to confirm your account!",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return { success: true, message: "Signed out successfully!" };
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
