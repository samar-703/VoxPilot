"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";

interface ActionData {
  action: "SCALE" | "RESTART" | "NONE";
  target: string;
  reply_text: string;
}

interface ProcessCommandResponse {
  audio: string | null;
  action_data: ActionData;
  error?: string;
}

const SYSTEM_PROMPT = `You are VoxPilot, an AI assistant for SRE Mission Control. You help operators manage infrastructure services.

Available services: Auth Service, Payment Service, Database Service.

When the user gives a command, analyze it and respond with a JSON object:
{
  "action": "SCALE" | "RESTART" | "NONE",
  "target": "<service name or empty string>",
  "reply_text": "<brief confirmation, max 15 words>"
}

Rules:
- SCALE: User wants to scale up/down a service
- RESTART: User wants to restart/recover a service
- NONE: Greeting, question, or unrelated command

Examples:
- "restart the auth service" -> {"action": "RESTART", "target": "Auth Service", "reply_text": "Initiating restart of Auth Service now."}
- "scale up payment" -> {"action": "SCALE", "target": "Payment Service", "reply_text": "Scaling up Payment Service resources."}
- "hello" -> {"action": "NONE", "target": "", "reply_text": "Hello! I'm VoxPilot. How can I help you today?"}
- "what's the status" -> {"action": "NONE", "target": "", "reply_text": "All systems displayed on dashboard. Any specific concerns?"}

ONLY respond with valid JSON. No markdown, no code blocks.`;

async function analyzeWithGemini(text: string): Promise<ActionData> {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    console.error("GOOGLE_API_KEY not configured");
    return {
      action: "NONE",
      target: "",
      reply_text: "API key not configured. Please check setup.",
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
    });

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: `User command: "${text}"` },
    ]);

    const response = result.response;
    const responseText = response.text().trim();

    // Clean up response - remove markdown code blocks if present
    let cleanedResponse = responseText;
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.slice(7);
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith("```")) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }
    cleanedResponse = cleanedResponse.trim();

    const parsed = JSON.parse(cleanedResponse) as ActionData;

    return {
      action: parsed.action || "NONE",
      target: parsed.target || "",
      reply_text: parsed.reply_text || "Command received.",
    };
  } catch (error) {
    console.error("Gemini API error:", error);
    return {
      action: "NONE",
      target: "",
      reply_text: "Sorry, I couldn't process that command.",
    };
  }
}

async function textToSpeech(text: string): Promise<string | null> {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;

  if (!apiKey) {
    console.error("ELEVEN_LABS_API_KEY not configured");
    return null;
  }

  try {
    // Using Rachel voice - clear and professional
    const voiceId = "21m00Tcm4TlvDq8ikWAM";

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", response.status, errorText);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return base64;
  } catch (error) {
    console.error("ElevenLabs TTS error:", error);
    return null;
  }
}

export async function processCommand(
  text: string
): Promise<ProcessCommandResponse> {
  // Step 1: Analyze intent with Gemini
  const actionData = await analyzeWithGemini(text);

  // Step 2: Convert response to speech with ElevenLabs
  const audio = await textToSpeech(actionData.reply_text);

  return {
    audio,
    action_data: actionData,
  };
}
