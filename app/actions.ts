"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSubtitles } from "youtube-caption-scraper";
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
  confidence: "high" | "medium" | "low";
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

// Data availability levels for graceful degradation
type DataLevel = "transcript" | "metadata" | "basic";

interface VideoData {
  level: DataLevel;
  transcript?: string;
  title: string;
  description?: string;
  channel?: string;
  tags?: string[];
  url: string;
  videoId: string;
}

// Error classification for better UX
class DataUnavailabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataUnavailabilityError";
  }
}

class SystemFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SystemFailureError";
  }
}

// Utility: Execute with timeout
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${operation} timed out`)), timeoutMs);
  });
  
  try {
    return await Promise.race([promise, timeoutPromise]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("timed out")) {
      throw new DataUnavailabilityError(`${operation} unavailable`);
    }
    throw error;
  }
}

// Utility: Retry with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  operation: string = "operation"
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      
      if (isLastAttempt) {
        throw error;
      }
      
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`${operation} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`${operation} failed after ${maxRetries} retries`);
}

// Extract YouTube Video ID from URL
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

// Get YouTube thumbnail URL
function getThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

// Layer 1: Fetch transcript using youtube-caption-scraper
async function fetchTranscriptData(videoId: string): Promise<string | null> {
  console.log("Layer 1: Fetching transcript with youtube-caption-scraper for:", videoId);
  
  try {
    const subtitles = await getSubtitles({ videoID: videoId, lang: 'en' });
    
    if (subtitles && subtitles.length > 0) {
      const transcript = subtitles
        .map((sub) => sub.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      
      console.log(`✓ Transcript found: ${transcript.length} chars`);
      console.log(`✓ Subtitles count: ${subtitles.length}`);
      console.log(`Transcript preview: ${transcript.substring(0, 200)}...`);
      
      return transcript;
    }
  } catch (error) {
    console.log("✗ Transcript fetch failed:", error instanceof Error ? error.message : "unknown");
  }
  
  console.log("✗ No transcript available");
  return null;
}

// Layer 2: Fetch video metadata as fallback (direct YouTube API)
async function fetchVideoMetadata(videoId: string, url: string): Promise<Omit<VideoData, 'transcript' | 'level'>> {
  console.log("Layer 2: Fetching video metadata as fallback");
  
  try {
    // Try to get basic video info via transcript endpoint (it returns video data)
    const subtitles = await getSubtitles({ videoID: videoId });
    
    if (subtitles && subtitles.length > 0) {
      // Extract any metadata from the response if available
      return {
        title: "YouTube Video",
        description: "",
        channel: "",
        tags: [],
        url,
        videoId,
      };
    }
  } catch (error) {
    console.log("✗ Metadata extraction failed:", error instanceof Error ? error.message : "unknown");
  }
  
  console.log("✗ Using basic data");
  return {
    title: "YouTube Video",
    description: "",
    channel: "",
    tags: [],
    url,
    videoId,
  };
}

// Main data fetching with layered fallback
async function fetchVideoData(url: string): Promise<VideoData> {
  const videoId = extractVideoId(url);
  
  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }
  
  console.log("=== Starting layered data fetch ===");
  
  // Layer 1: Try transcript
  const transcript = await withRetry(
    () => fetchTranscriptData(videoId),
    2,
    "Transcript fetch"
  );
  
  if (transcript && transcript.length > 20) {
    return {
      level: "transcript",
      transcript,
      title: "Video",
      url,
      videoId,
    };
  }
  
  console.log("⚠ Transcript unavailable, degrading to metadata");
  
  // Layer 2: Fallback to metadata
  const metadata = await withRetry(
    () => fetchVideoMetadata(videoId, url),
    1,
    "Metadata fetch"
  );
  
  return {
    level: metadata.channel ? "metadata" : "basic",
    title: metadata.title,
    description: metadata.description,
    channel: metadata.channel,
    tags: metadata.tags,
    url,
    videoId,
  };
}

// Generate summary with adaptive prompt based on data level
async function generateAdaptiveSummary(data: VideoData): Promise<VideoSummary> {
  const now = Date.now();
  if (now < geminiDisabledUntil) {
    throw new SystemFailureError("AI service temporarily unavailable due to rate limiting");
  }

  if (!process.env.GOOGLE_API_KEY) {
    throw new SystemFailureError("AI service not configured");
  }

  try {
    console.log(`Generating summary from ${data.level} level data...`);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    
    let prompt: string;
    let confidence: VideoSummary["confidence"];
    
    if (data.level === "transcript") {
      confidence = "high";
      // Use first 6000 chars for key insights - saves tokens, captures main content
      const truncated = data.transcript!.length > 6000
        ? data.transcript!.substring(0, 6000) + "..."
        : data.transcript!;
      
      prompt = `Extract key insights from this video transcript.

Create a focused summary with:
1. Title (max 10 words) - what video is about
2. Exactly 3 Key Takeaways (each max 15 words) - main points learned
3. Abstract (max 50 words) - concise overview

Be specific and actionable. Avoid generic phrases.

Transcript:
${truncated}`;
    } else if (data.level === "metadata") {
      confidence = "medium";
      prompt = `Create summary from video metadata:

Title: ${data.title}
Description: ${data.description || "N/A"}

Generate:
1. Title (max 10 words)
2. Exactly 3 Key Takeaways (each max 15 words)
3. Abstract (max 50 words)`;

    } else {
      confidence = "low";
      prompt = `Create generic template:

1. Title: "Video Summary"
2. Exactly 3 Generic Takeaways
3. Abstract (max 30 words): "Captions unavailable."`;
    }

    const result = await withTimeout(
      model.generateContent([
        {
          text: `${prompt}

Return ONLY valid JSON:
{
  "title": "...",
  "keyTakeaways": ["...", "...", "..."],
  "abstract": "..."
}`
        }
      ]),
      20000,
      "AI generation"
    );

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("Failed to parse AI response");
      console.error("Raw response:", text.substring(0, 300));
      throw new SystemFailureError("AI response parsing failed");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`✓ Summary generated (${confidence} confidence): ${parsed.title}`);
    
    return {
      ...parsed,
      confidence,
    };
  } catch (error) {
    console.error("AI generation error:", error);
    
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 429
    ) {
      console.log("AI quota exceeded, cooling down");
      geminiDisabledUntil = Date.now() + 60000;
    }
    
    if (error instanceof DataUnavailabilityError) {
      throw error;
    }
    
    throw new SystemFailureError("AI generation failed");
  }
}

// Process YouTube link with graceful degradation
export async function processYoutubeLink(url: string): Promise<ActionResult> {
  const videoId = extractVideoId(url);

  if (!videoId) {
    return {
      success: false,
      message: "Please enter a valid YouTube link",
    };
  }

  try {
    console.log("=== Processing video ===");
    console.log("URL:", url);
    console.log("ID:", videoId);
    
    // Fetch data with layered fallback
    const data = await fetchVideoData(url);
    
    // Generate summary with adaptive prompt
    const summary = await generateAdaptiveSummary(data);
    
    // Provide user-friendly context message
    let contextMessage = "";
    if (summary.confidence === "high") {
      contextMessage = "Full transcript analysis complete.";
    } else if (summary.confidence === "medium") {
      contextMessage = "Summary based on video metadata (captions unavailable).";
    } else {
      contextMessage = "Limited summary (video information unavailable).";
    }
    
    console.log("✓ Processing complete");
    return {
      success: true,
      message: contextMessage,
      summary,
      analysis: {
        intent: "analyze_url",
        url,
        videoId,
        response: `Analyzed: ${summary.title}`,
      },
    };
  } catch (error) {
    console.error("✗ Processing error:", error);
    
    if (error instanceof DataUnavailabilityError) {
      return {
        success: false,
        message: "Video information temporarily unavailable. Please try again or use a different video.",
      };
    }
    
    if (error instanceof SystemFailureError) {
      return {
        success: false,
        message: error.message,
      };
    }
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Unable to process video. ${errorMessage}`,
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
