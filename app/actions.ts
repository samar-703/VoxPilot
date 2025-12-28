"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

// Track Gemini failures to skip retrying when quota exceeded
let geminiDisabledUntil = 0;

// Types
export interface CommandAnalysis {
  intent: string;
  service: string | null;
  action: string | null;
  risk: "HIGH" | "LOW" | "NONE";
  response: string;
  confirmation?: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  audio?: string; // Base64 audio
  analysis?: CommandAnalysis;
}

// Service state (in production, this would be a database)
const serviceStates: Record<
  string,
  {
    status: "healthy" | "critical" | "warning" | "restarting";
    cpu: number;
    memory: number;
    latency: number;
  }
> = {
  gateway: { status: "healthy", cpu: 45, memory: 62, latency: 23 },
  auth: { status: "critical", cpu: 92, memory: 87, latency: 450 },
  database: { status: "healthy", cpu: 34, memory: 56, latency: 12 },
  cache: { status: "warning", cpu: 78, memory: 81, latency: 89 },
};

// Analyze voice command with Gemini
export async function analyzeCommand(
  transcript: string
): Promise<ActionResult> {
  // Skip Gemini if quota was recently exceeded (cache for 60 seconds)
  const now = Date.now();
  if (now < geminiDisabledUntil) {
    console.log("⏭️ Skipping Gemini (quota exceeded, using local parser)");
    return localCommandParser(transcript);
  }

  // Skip Gemini if no API key
  if (!process.env.GOOGLE_API_KEY) {
    console.log("⏭️ No Gemini API key, using local parser");
    return localCommandParser(transcript);
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const systemPrompt = `You are VoxPilot, an AI assistant for SRE infrastructure operations.
Analyze the user's voice command and respond with JSON.

Available services: gateway, auth, database, cache
Available actions: restart, scale, diagnose, check-status, rollback, deploy, stop, kill

CRITICAL: For destructive operations (restart, stop, kill, rollback, deploy, scale), set risk to "HIGH".
For read-only operations (check-status, diagnose, logs), set risk to "LOW".
For greetings or unclear commands, set risk to "NONE".

Respond with this exact JSON structure:
{
  "intent": "Brief description of what user wants",
  "service": "service-name or null",
  "action": "action-name or null",
  "risk": "HIGH" | "LOW" | "NONE",
  "response": "Your response to the user (under 15 words)",
  "confirmation": "Warning message for HIGH risk actions (under 15 words)"
}

Examples:
- "restart the auth service" → HIGH risk, requires confirmation
- "what's the status of database" → LOW risk, immediate response
- "hello" → NONE risk, greeting response`;

    console.log("Sending to Gemini API...");
    const result = await model.generateContent([
      systemPrompt,
      `User command: "${transcript}"`,
    ]);

    const text = result.response.text();
    console.log("Gemini response received");

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        success: false,
        message: "Failed to parse command analysis",
      };
    }

    const analysis: CommandAnalysis = JSON.parse(jsonMatch[0]);
    console.log("Gemini analysis:", JSON.stringify(analysis, null, 2));

    // Generate audio for the response
    let audio: string | undefined;

    if (analysis.risk === "HIGH" && analysis.confirmation) {
      // For HIGH risk, generate confirmation warning audio
      audio = await generateSpeech(analysis.confirmation);
    } else if (analysis.response) {
      // For other responses, generate response audio
      audio = await generateSpeech(analysis.response);
    }

    return {
      success: true,
      message: analysis.response,
      audio,
      analysis,
    };
  } catch (error: unknown) {
    // Check if it's a rate limit error (429)
    if (error && typeof error === 'object' && 'status' in error && error.status === 429) {
      console.log("⚠️ Gemini quota exceeded - disabling for 60 seconds");
      geminiDisabledUntil = Date.now() + 60000; // Disable for 60 seconds
    }
    
    console.error("❌ Gemini API failed:", error);
    console.log("⚠️ FALLBACK: Using local command parser");

    // Fallback local parser
    return localCommandParser(transcript);
  }
}

// Execute confirmed action
export async function executeAction(
  service: string,
  action: string
): Promise<ActionResult> {
  try {
    // Simulate action execution
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Update service state based on action
    if (serviceStates[service]) {
      switch (action) {
        case "restart":
          serviceStates[service].status = "healthy";
          serviceStates[service].cpu = Math.floor(Math.random() * 30) + 20;
          serviceStates[service].memory = Math.floor(Math.random() * 30) + 30;
          serviceStates[service].latency = Math.floor(Math.random() * 30) + 10;
          break;
        case "stop":
        case "kill":
          serviceStates[service].status = "critical";
          break;
        case "scale":
          serviceStates[service].cpu = Math.floor(
            serviceStates[service].cpu * 0.7
          );
          serviceStates[service].memory = Math.floor(
            serviceStates[service].memory * 0.8
          );
          break;
      }
    }

    const successMessage = `${action} completed on ${service}. Service is now operational.`;
    const audio = await generateSpeech(successMessage);

    return {
      success: true,
      message: successMessage,
      audio,
    };
  } catch (error) {
    console.error("Action execution error:", error);
    return {
      success: false,
      message: `Failed to ${action} ${service}`,
    };
  }
}

// Get current service states
export async function getServiceStates() {
  return serviceStates;
}

// Generate speech with ElevenLabs
async function generateSpeech(text: string): Promise<string | undefined> {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;

  if (!apiKey) {
    console.warn(
      "⚠️ ElevenLabs API key not configured - using browser TTS fallback"
    );
    return undefined;
  }

  try {
    console.log("🔊 Generating speech with ElevenLabs...");
    console.log("🔑 API Key present:", apiKey ? `${apiKey.substring(0, 8)}...` : "MISSING");
    
    // Use Rachel voice (21m00Tcm4TlvDq8ikWAM) - professional female voice
    // Using eleven_multilingual_v2 which is available on free tier
    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM",
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
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
      console.error(
        "❌ ElevenLabs error:",
        response.status,
        errorText,
        "- using browser TTS fallback"
      );
      return undefined;
    }

    console.log("✅ ElevenLabs audio generated successfully");
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString("base64");
    return `data:audio/mpeg;base64,${base64Audio}`;
  } catch (error) {
    console.error(
      "❌ ElevenLabs TTS error:",
      error,
      "- using browser TTS fallback"
    );
    return undefined;
  }
}

// Fallback local command parser (now async to call ElevenLabs)
async function localCommandParser(transcript: string): Promise<ActionResult> {
  const lower = transcript.toLowerCase();
  console.log("🔍 Local parser analyzing:", `"${transcript}"`);

  // Service detection with fuzzy matching for speech recognition errors
  // "auth" is often misheard as "earth", "off", "all", "path", "oth", "oauth"
  const serviceAliases: Record<string, string[]> = {
    gateway: ["gateway", "gate way", "get way", "getaway", "gate"],
    auth: [
      "auth",
      "earth",
      "off",
      "all",
      "path",
      "oth",
      "oauth",
      "authentication",
      "of",
    ],
    database: ["database", "data base", "data", "db", "base"],
    cache: ["cache", "cash", "cach", "redis", "red is"],
  };

  let foundService: string | null = null;
  for (const [service, aliases] of Object.entries(serviceAliases)) {
    if (aliases.some((alias) => lower.includes(alias))) {
      foundService = service;
      console.log(`Service detected: "${service}" (from transcript)`);
      break;
    }
  }

  // Action detection
  const destructiveActions = [
    "restart",
    "stop",
    "kill",
    "rollback",
    "deploy",
    "scale",
  ];
  const readActions = ["status", "check", "diagnose", "health", "logs"];

  const foundDestructive = destructiveActions.find((a) => lower.includes(a));
  const foundRead = readActions.find((a) => lower.includes(a));

  if (foundDestructive) {
    console.log(`Destructive action detected: "${foundDestructive}"`);
  }
  if (foundRead) {
    console.log(`Read action detected: "${foundRead}"`);
  }
  if (!foundService) {
    console.log("No service detected in transcript");
  }
  if (!foundDestructive && !foundRead) {
    console.log("No action detected in transcript");
  }

  if (foundDestructive && foundService) {
    console.log(
      `🚨 HIGH RISK: ${foundDestructive} ${foundService} - requires confirmation`
    );
    const confirmationText = `Warning: This will ${foundDestructive} the ${foundService} service. Say Yes to confirm.`;
    const audio = await generateSpeech(confirmationText);
    return {
      success: true,
      message: `Ready to ${foundDestructive} ${foundService}. Confirm with "Yes".`,
      audio,
      analysis: {
        intent: `${foundDestructive} ${foundService} service`,
        service: foundService,
        action: foundDestructive,
        risk: "HIGH",
        response: `Ready to ${foundDestructive} ${foundService}. Confirm with "Yes".`,
        confirmation: confirmationText,
      },
    };
  }

  if (foundRead && foundService) {
    const state = serviceStates[foundService];
    const status = state?.status || "unknown";
    console.log(`LOW RISK: Check status of ${foundService}`);
    const responseText = `${foundService} is ${status}. CPU ${state?.cpu}%, Memory ${state?.memory}%.`;
    const audio = await generateSpeech(responseText);
    return {
      success: true,
      message: `${foundService} service is ${status}. CPU: ${state?.cpu}%, Memory: ${state?.memory}%.`,
      audio,
      analysis: {
        intent: `Check ${foundService} status`,
        service: foundService,
        action: "check-status",
        risk: "LOW",
        response: responseText,
      },
    };
  }

  // Greeting detection
  if (lower.match(/^(hi|hello|hey|good|greetings)/)) {
    const responseText = "VoxPilot ready. How can I assist with your infrastructure?";
    const audio = await generateSpeech(responseText);
    return {
      success: true,
      message: responseText,
      audio,
      analysis: {
        intent: "Greeting",
        service: null,
        action: null,
        risk: "NONE",
        response: responseText,
      },
    };
  }

  const responseText = "Specify a service: gateway, auth, database, or cache. And an action like restart or check status.";
  const audio = await generateSpeech(responseText);
  return {
    success: true,
    message: "I understood your command. Specify a service and action.",
    audio,
    analysis: {
      intent: "Unclear command",
      service: null,
      action: null,
      risk: "NONE",
      response: responseText,
    },
  };
}
