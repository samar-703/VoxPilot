"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { YoutubeTranscript } from "youtube-transcript";
import { createClient } from "@/lib/supabase/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

let geminiDisabledUntil = 0;

// Types
export interface VideoSummary {
  title: string;
  keyTakeaways: string[];
  abstract: string;
  confidence: "transcript" | "inferred";
  dataSource: "transcript" | "metadata";
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

export type Intent =
  | "ANALYZE_VIDEO"
  | "READ_SUMMARY"
  | "SAVE_VIDEO"
  | "DELETE_VIDEO"
  | "LIST_VIDEOS"
  | "PLAY_VIDEO"
  | "GREETING"
  | "UNCLEAR"
  | "CONFIRM_YES"
  | "CANCEL_DELETE";

export interface CommandAnalysis {
  intent: Intent;
  url?: string;
  videoId?: string;
  question?: string;
  response: string;
  requiresConfirmation?: boolean;
}

export interface ActionResult {
  success: boolean;
  message: string;
  audio?: string;
  analysis?: CommandAnalysis;
  summary?: VideoSummary;
  savedContent?: SavedContent;
}

interface VideoMetadata {
  videoId: string;
  url: string;
  title?: string;
  description?: string;
  channelName?: string;
}

interface TranscriptResult {
  success: boolean;
  text?: string;
  reason?: string;
}

// Utility functions
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function getThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// Fetch transcript - returns result object instead of throwing
async function fetchTranscript(videoId: string): Promise<TranscriptResult> {
  console.log("Attempting transcript fetch for:", videoId);

  try {
    const transcript = await withTimeout(
      YoutubeTranscript.fetchTranscript(videoId),
      15000
    );

    if (!transcript || transcript.length === 0) {
      console.log("Transcript empty");
      return {
        success: false,
        reason: "Transcript array is empty",
      };
    }

    const text = transcript
      .map((item) => item.text)
      .join(" ")
      .trim();

    if (text.length < 50) {
      console.log(`Transcript too short: ${text.length} chars`);
      return {
        success: false,
        reason: `Transcript too short (${text.length} chars)`,
      };
    }

    console.log(`✓ Transcript fetched: ${text.length} chars`);
    return {
      success: true,
      text,
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unknown transcript error";
    console.log(`Transcript fetch failed: ${reason}`);
    return {
      success: false,
      reason,
    };
  }
}

// Fetch video metadata from YouTube oEmbed API
async function fetchVideoMetadata(
  videoId: string,
  url: string
): Promise<VideoMetadata> {
  console.log("Fetching video metadata for:", videoId);

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      url
    )}&format=json`;

    const response = await withTimeout(fetch(oembedUrl), 8000);

    if (response.ok) {
      const data = await response.json();
      console.log("✓ Metadata fetched:", {
        title: data.title?.substring(0, 50),
        author: data.author_name,
      });

      return {
        videoId,
        url,
        title: data.title || "Untitled Video",
        channelName: data.author_name || "Unknown Channel",
        description: "", // oEmbed doesn't provide description
      };
    }
  } catch (error) {
    console.log(
      "Metadata fetch failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }

  // Fallback metadata
  return {
    videoId,
    url,
    title: "YouTube Video",
    channelName: "Unknown Channel",
    description: "",
  };
}

// Generate summary from transcript (high confidence)
async function generateTranscriptSummary(
  transcript: string,
  metadata: VideoMetadata
): Promise<VideoSummary> {
  console.log("Generating transcript-based summary...");

  const truncated =
    transcript.length > 6000
      ? transcript.substring(0, 6000) + "..."
      : transcript;

  const prompt = `Analyze this YouTube video transcript and extract key insights.

Video Title: ${metadata.title}
Channel: ${metadata.channelName}

Transcript:
${truncated}

Create a structured summary:
1. Title (max 10 words) - clear, specific title based on content
2. Exactly 3 Key Takeaways (each 12-15 words) - concrete, actionable insights
3. Abstract (40-50 words) - concise overview of main points

Be specific and avoid generic language. Focus on unique insights from this video.

Return ONLY valid JSON in this exact format:
{
  "title": "...",
  "keyTakeaways": ["...", "...", "..."],
  "abstract": "..."
}`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const result = await withTimeout(
    model.generateContent([{ text: prompt }]),
    25000
  );

  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error("Failed to parse Gemini response as JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate structure
  if (
    !parsed.title ||
    !Array.isArray(parsed.keyTakeaways) ||
    parsed.keyTakeaways.length !== 3 ||
    !parsed.abstract
  ) {
    throw new Error("Invalid summary structure from Gemini");
  }

  console.log("✓ Transcript summary generated");

  return {
    title: parsed.title,
    keyTakeaways: parsed.keyTakeaways,
    abstract: parsed.abstract,
    confidence: "transcript",
    dataSource: "transcript",
  };
}

// Generate summary from metadata only (inferred)
async function generateMetadataSummary(
  metadata: VideoMetadata
): Promise<VideoSummary> {
  console.log("🤖 Generating metadata-inferred summary...");

  const prompt = `A user wants to analyze this YouTube video, but captions are unavailable.

Video Information:
- Title: ${metadata.title}
- Channel: ${metadata.channelName}
- URL: ${metadata.url}

Based ONLY on the title and channel name, infer what this video is likely about and create a reasonable summary.

Create a structured summary:
1. Title (max 10 words) - based on the video title, make it clear and descriptive
2. Exactly 3 Key Takeaways (each 12-15 words) - infer likely main points based on title/channel
3. Abstract (40-50 words) - brief overview of what the video appears to cover

Be honest that this is inferred. Use phrases like "appears to cover", "likely discusses", "seems to focus on".

Return ONLY valid JSON in this exact format:
{
  "title": "...",
  "keyTakeaways": ["...", "...", "..."],
  "abstract": "..."
}`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const result = await withTimeout(
    model.generateContent([{ text: prompt }]),
    20000
  );

  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error("Failed to parse Gemini response as JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate structure
  if (
    !parsed.title ||
    !Array.isArray(parsed.keyTakeaways) ||
    parsed.keyTakeaways.length !== 3 ||
    !parsed.abstract
  ) {
    throw new Error("Invalid summary structure from Gemini");
  }

  console.log("✓ Metadata-inferred summary generated");

  return {
    title: parsed.title,
    keyTakeaways: parsed.keyTakeaways,
    abstract: parsed.abstract,
    confidence: "inferred",
    dataSource: "metadata",
  };
}

// Main video processing with fail-soft fallback
export async function processYoutubeLink(url: string): Promise<ActionResult> {
  const videoId = extractVideoId(url);

  if (!videoId) {
    return {
      success: false,
      message: "Please enter a valid YouTube link",
    };
  }

  // Check if Gemini is temporarily disabled
  const now = Date.now();
  if (now < geminiDisabledUntil) {
    return {
      success: false,
      message:
        "AI service temporarily unavailable. Please try again in a moment.",
    };
  }

  if (!process.env.GOOGLE_API_KEY) {
    return {
      success: false,
      message: "AI service not configured. Please contact support.",
    };
  }

  console.log("=== Processing Video ===");
  console.log("URL:", url);
  console.log("Video ID:", videoId);

  try {
    // Step 1: Fetch metadata (always succeeds with fallback)
    const metadata = await fetchVideoMetadata(videoId, url);

    // Step 2: Attempt transcript fetch (non-blocking)
    const transcriptResult = await fetchTranscript(videoId);

    let summary: VideoSummary;

    // Step 3: Generate summary based on available data
    if (transcriptResult.success && transcriptResult.text) {
      console.log("Path: TRANSCRIPT-BASED");
      summary = await generateTranscriptSummary(
        transcriptResult.text,
        metadata
      );
    } else {
      console.log("Path: METADATA-INFERRED");
      console.log(`   Reason: ${transcriptResult.reason}`);
      summary = await generateMetadataSummary(metadata);
    }

    console.log("✓ Processing complete");
    console.log(`   Confidence: ${summary.confidence}`);
    console.log(`   Title: ${summary.title}`);

    return {
      success: true,
      message: `Video analyzed successfully! (${
        summary.confidence === "transcript"
          ? "Full analysis"
          : "Inferred from metadata"
      })`,
      summary,
      analysis: {
        intent: "ANALYZE_VIDEO",
        url,
        videoId,
        response: "Please provide a YouTube URL to analyze.",
      },
    };
  } catch (error) {
    console.error("✗ Critical processing error:", error);

    // Handle rate limiting
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 429
    ) {
      geminiDisabledUntil = Date.now() + 60000;
      return {
        success: false,
        message: "AI service rate limited. Please try again in a minute.",
      };
    }

    // Generic failure
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return {
      success: false,
      message: `Failed to process video: ${errorMessage}`,
    };
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

// Get saved content
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

// Parse voice command and return intent (NO automatic TTS - only on explicit request)
// ElevenLabs is ONLY called for READ_SUMMARY intent to save quota
export async function parseVoiceIntent(
  transcript: string,
  currentSummary?: VideoSummary,
  awaitingConfirmation?: { type: string } | null
): Promise<CommandAnalysis> {
  const lower = transcript.toLowerCase().trim();

  // If awaiting confirmation, check for yes/no first
  if (awaitingConfirmation) {
    // Match yes/no anywhere in the transcript (less strict for voice recognition)
    if (lower.match(/\b(yes|yeah|yep|confirm|do it|proceed|okay|ok|sure)\b/)) {
      return {
        intent: "CONFIRM_YES",
        response: "Confirmed",
      };
    }
    if (lower.match(/\b(no|nope|cancel|stop|never mind|nevermind)\b/)) {
      return {
        intent: "CANCEL_DELETE",
        response: "Cancelled",
      };
    }
  }

  // ANALYZE_VIDEO: Extract URL and process
  const urlMatch = transcript.match(
    /(https?:\/\/[^\s]+)|(youtu\.?be[^\s]+)|(youtube\.com[^\s]+)/i
  );

  if (urlMatch) {
    let url = urlMatch[0];
    if (!url.startsWith("http")) {
      url = "https://" + url;
    }
    return {
      intent: "ANALYZE_VIDEO",
      url,
      videoId: extractVideoId(url) || undefined,
      response: "Analyzing video",
    };
  }

  // READ_SUMMARY: This is the ONLY intent that triggers ElevenLabs
  if (
    lower.match(
      /read.*summary|read it|read.*to me|speak|say.*summary|read this/
    )
  ) {
    return {
      intent: "READ_SUMMARY",
      response: currentSummary ? "Reading summary" : "No summary loaded",
    };
  }

  // SAVE_VIDEO
  if (lower.match(/save|store|keep|bookmark/)) {
    return {
      intent: "SAVE_VIDEO",
      response: currentSummary ? "Saving" : "No video to save",
    };
  }

  // LIST_VIDEOS
  if (lower.match(/list|show.*video|my videos|saved|library|recent/)) {
    return {
      intent: "LIST_VIDEOS",
      response: "Showing saved videos",
    };
  }

  // DELETE_VIDEO: Requires confirmation
  if (lower.match(/delete|remove|clear/)) {
    return {
      intent: "DELETE_VIDEO",
      response: "Are you sure?",
      requiresConfirmation: true,
    };
  }

  // PLAY_VIDEO: Open in YouTube
  if (lower.match(/play|watch|open.*video/)) {
    return {
      intent: "PLAY_VIDEO",
      response: "Opening video",
    };
  }

  // GREETING
  if (lower.match(/^(hi|hello|hey|good|greetings)/)) {
    return {
      intent: "GREETING",
      response: "Ready",
    };
  }

  // Default: unclear
  return {
    intent: "UNCLEAR",
    response: "Say: read summary, save, list, delete, or paste a link",
  };
}

// Legacy handler - now delegates to parseVoiceIntent
// Kept for backward compatibility but TTS is NOT auto-generated
export async function handleVoiceCommand(
  transcript: string,
  currentSummary?: VideoSummary
): Promise<ActionResult> {
  const analysis = await parseVoiceIntent(transcript, currentSummary, null);

  // Only generate TTS for READ_SUMMARY intent (explicit user request)
  if (analysis.intent === "READ_SUMMARY" && currentSummary) {
    const audio = await generateSpeech(
      `${
        currentSummary.title
      }. Key takeaways: ${currentSummary.keyTakeaways.join(". ")}. ${
        currentSummary.abstract
      }`
    );
    return {
      success: true,
      message: "Reading summary...",
      audio,
      analysis,
    };
  }

  // For ANALYZE_VIDEO, actually process the video
  if (analysis.intent === "ANALYZE_VIDEO" && analysis.url) {
    const result = await processYoutubeLink(analysis.url);
    return {
      ...result,
      analysis,
    };
  }

  // For all other intents, just return the analysis (no TTS)
  return {
    success: true,
    message: analysis.response,
    analysis,
  };
}

// Generate speech with ElevenLabs (ONLY on explicit request)
export async function generateSpeech(
  text: string
): Promise<string | undefined> {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;

  if (!apiKey) {
    console.warn("ElevenLabs API key not configured");
    return undefined;
  }

  try {
    console.log("Generating speech with ElevenLabs...");

    // Truncate text to avoid quota issues
    const truncatedText =
      text.length > 500 ? text.substring(0, 500) + "..." : text;

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
          text: truncatedText,
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

    console.log("✓ ElevenLabs audio generated");
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");
    return `data:audio/mpeg;base64,${base64Audio}`;
  } catch (error) {
    console.error("ElevenLabs TTS error:", error);
    return undefined;
  }
}

// Generate short voice response for common interactions (keeps API usage minimal)
export async function speakResponse(text: string): Promise<string | undefined> {
  return await generateSpeech(text);
}

// Read summary aloud (explicit user action only)
export async function readSummaryAloud(
  summary: VideoSummary
): Promise<ActionResult> {
  const confidenceNote =
    summary.confidence === "inferred"
      ? "Note: This summary was inferred from video metadata. "
      : "";

  const textToRead = `${confidenceNote}${
    summary.title
  }. Key takeaways: ${summary.keyTakeaways.join(". ")}. Summary: ${
    summary.abstract
  }`;

  const audio = await generateSpeech(textToRead);

  if (!audio) {
    return {
      success: false,
      message: "Text-to-speech is not available at the moment.",
    };
  }

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

// Delete video by ID (for voice commands)
export async function deleteContentById(id: string): Promise<ActionResult> {
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
        message: "Failed to delete video.",
      };
    }

    return {
      success: true,
      message: "Video deleted successfully!",
    };
  } catch (error) {
    console.error("Delete content error:", error);
    return {
      success: false,
      message: "Failed to delete content.",
    };
  }
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
