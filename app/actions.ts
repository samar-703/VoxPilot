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

type DataLevel = "transcript" | "basic";

interface VideoData {
  level: DataLevel;
  transcript?: string;
  title: string;
  url: string;
  videoId: string;
}

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

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

// Extract YouTube Video ID
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

// Simple, robust transcript fetching
async function fetchTranscriptData(videoId: string): Promise<string | null> {
  console.log("Fetching transcript for:", videoId);
  
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    
    if (transcript && transcript.length > 0) {
      const text = transcript.map((item) => item.text).join(" ").trim();
      console.log(`✓ Transcript found: ${text.length} chars`);
      console.log(`Preview: ${text.substring(0, 150)}...`);
      return text;
    }
  } catch (error) {
    console.log("✗ Failed:", error instanceof Error ? error.message : "unknown");
  }
  
  return null;
}

// Generate summary from transcript
async function generateAdaptiveSummary(data: VideoData): Promise<VideoSummary> {
  const now = Date.now();
  if (now < geminiDisabledUntil) {
    throw new SystemFailureError("AI service temporarily unavailable");
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
      const truncated = data.transcript!.length > 6000
        ? data.transcript!.substring(0, 6000) + "..."
        : data.transcript!;
      
      prompt = `Extract key insights from this video transcript.

Create a focused summary:
1. Title (max 10 words) - what video is about
2. Exactly 3 Key Takeaways (each max 15 words) - main points
3. Abstract (max 50 words) - concise overview

Be specific. Avoid generic phrases.

Transcript:
${truncated}`;
    } else {
      confidence = "low";
      prompt = `Create generic summary:
1. Title: "Video Summary"
2. Exactly 3 Generic Takeaways
3. Abstract (max 30 words): "Captions unavailable."`;
    }

    const result = await withTimeout(
      model.generateContent([
        {
          text: `${prompt}

Return ONLY JSON:
{
  "title": "...",
  "keyTakeaways": ["...", "...", "..."],
  "abstract": "..."
}`
        }
      ]),
      20000
    );

    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("Failed to parse AI response");
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
      geminiDisabledUntil = Date.now() + 60000;
    }
    
    if (error instanceof DataUnavailabilityError) {
      throw error;
    }
    
    throw new SystemFailureError("AI generation failed");
  }
}

// Main video processing
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
    
    const transcript = await fetchTranscriptData(videoId);

    if (!transcript || transcript.length < 20) {
      console.warn("Transcript unavailable or too short");
      return {
        success: false,
        message: "This video doesn't have captions. Please try a video with CC enabled.",
      };
    }

    const summary = await generateAdaptiveSummary({
      level: "transcript",
      transcript,
      title: "Video",
      url,
      videoId,
    });

    console.log("✓ Processing complete");
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
    console.error("✗ Processing error:", error);
    
    if (error instanceof DataUnavailabilityError) {
      return {
        success: false,
        message: "Video information temporarily unavailable. Please try again.",
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

// Analyze voice command intent
export async function analyzeCommand(
  transcript: string
): Promise<ActionResult> {
  const lower = transcript.toLowerCase();

  const urlMatch = transcript.match(
    /(https?:\/\/[^\s]+)|(youtu\.?be[^\s]+)|(youtube\.com[^\s]+)/i
  );

  if (urlMatch) {
    let url = urlMatch[0];
    if (!url.startsWith("http")) {
      url = "https://" + url;
    }
    return processYoutubeLink(url);
  }

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

  if (lower.match(/^(hi|hello|hey|good|greetings)/)) {
    const audio = await generateSpeech(
      "Hello! Paste a YouTube link to analyze, or ask me about your saved videos."
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

  if (transcript.length > 10) {
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

  return {
    success: true,
    message: "Paste a YouTube link to analyze, or ask me about your saved videos.",
    analysis: {
      intent: "unclear",
      response: "Paste a YouTube link or ask a question.",
    },
  };
}

// Generate speech with ElevenLabs
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

    console.log("ElevenLabs audio generated successfully");
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");
    return `data:audio/mpeg;base64,${base64Audio}`;
  } catch (error) {
    console.error("ElevenLabs TTS error:", error);
    return undefined;
  }
}

// Read summary aloud
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
