"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Mic,
  MicOff,
  Activity,
  Server,
  Database,
  CreditCard,
  Shield,
  Terminal,
  Radio,
  Zap,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  ScrollArea,
  cn,
} from "@/components/ui/primitives";
import { processCommand } from "./actions";

// Types
interface Service {
  id: string;
  name: string;
  status: "healthy" | "critical" | "warning";
  icon: React.ElementType;
  lastUpdated: string;
  metrics: {
    cpu: number;
    memory: number;
    requests: number;
  };
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: "user" | "system" | "action" | "error";
  message: string;
}

// Extend Window interface for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// Initial mock data
const initialServices: Service[] = [
  {
    id: "auth",
    name: "Auth Service",
    status: "healthy",
    icon: Shield,
    lastUpdated: "2 min ago",
    metrics: { cpu: 45, memory: 62, requests: 1250 },
  },
  {
    id: "payment",
    name: "Payment Service",
    status: "critical",
    icon: CreditCard,
    lastUpdated: "30 sec ago",
    metrics: { cpu: 89, memory: 78, requests: 890 },
  },
  {
    id: "database",
    name: "Database Service",
    status: "healthy",
    icon: Database,
    lastUpdated: "1 min ago",
    metrics: { cpu: 32, memory: 54, requests: 2100 },
  },
];

export default function VoxPilotDashboard() {
  const [services, setServices] = useState<Service[]>(initialServices);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "init",
      timestamp: new Date().toLocaleTimeString(),
      type: "system",
      message:
        "VoxPilot Mission Control initialized. Standing by for voice commands.",
    },
  ]);
  const [transcript, setTranscript] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Add log entry
  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    const entry: LogEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setLogs((prev) => [...prev, entry]);
  }, []);

  // Play audio from base64
  const playAudio = useCallback((base64Audio: string) => {
    const audio = new Audio(`data:audio/mpeg;base64,${base64Audio}`);
    audioRef.current = audio;
    audio.play().catch((err) => {
      console.error("Audio playback error:", err);
    });
  }, []);

  // Update service status based on action
  const updateServiceStatus = useCallback(
    (action: string, target: string) => {
      if (action === "NONE" || !target) return;

      setServices((prev) =>
        prev.map((service) => {
          const targetLower = target.toLowerCase();
          const nameLower = service.name.toLowerCase();

          if (
            nameLower.includes(targetLower) ||
            targetLower.includes(service.id)
          ) {
            if (action === "RESTART") {
              addLog("action", `🔄 Restarting ${service.name}...`);
              // Simulate restart - set to healthy after "restart"
              return {
                ...service,
                status: "healthy" as const,
                lastUpdated: "just now",
                metrics: {
                  ...service.metrics,
                  cpu: Math.floor(Math.random() * 30) + 20,
                },
              };
            } else if (action === "SCALE") {
              addLog("action", `⚡ Scaling ${service.name}...`);
              return {
                ...service,
                status: "healthy" as const,
                lastUpdated: "just now",
                metrics: {
                  ...service.metrics,
                  requests: service.metrics.requests + 500,
                },
              };
            }
          }
          return service;
        })
      );
    },
    [addLog]
  );

  // Process voice command
  const handleCommand = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      setIsProcessing(true);
      addLog("user", `🎤 "${text}"`);

      try {
        const result = await processCommand(text);

        // Log the action
        if (result.action_data.action !== "NONE") {
          addLog(
            "system",
            `📋 Action: ${result.action_data.action} → ${result.action_data.target}`
          );
        }
        addLog("system", `🤖 ${result.action_data.reply_text}`);

        // Play audio response
        if (result.audio) {
          playAudio(result.audio);
        }

        // Update UI based on action
        updateServiceStatus(
          result.action_data.action,
          result.action_data.target
        );
      } catch (error) {
        console.error("Command processing error:", error);
        addLog("error", "Failed to process command. Please try again.");
      } finally {
        setIsProcessing(false);
      }
    },
    [addLog, playAudio, updateServiceStatus]
  );

  // Initialize speech recognition
  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      addLog("error", "Speech recognition not supported in this browser.");
      return null;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript("");
      addLog("system", "🎙️ Listening for command...");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const current = event.resultIndex;
      const result = event.results[current];
      const text = result[0].transcript;

      setTranscript(text);

      if (result.isFinal) {
        handleCommand(text);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== "aborted") {
        addLog("error", `Recognition error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return recognition;
  }, [addLog, handleCommand]);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (!recognitionRef.current) {
        recognitionRef.current = initSpeechRecognition();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (error) {
          // Recognition might already be running
          recognitionRef.current = initSpeechRecognition();
          recognitionRef.current?.start();
        }
      }
    }
  }, [isListening, initSpeechRecognition]);

  // Get status badge variant
  const getStatusVariant = (status: Service["status"]) => {
    switch (status) {
      case "healthy":
        return "success";
      case "critical":
        return "destructive";
      case "warning":
        return "warning";
      default:
        return "default";
    }
  };

  // Get log entry color
  const getLogColor = (type: LogEntry["type"]) => {
    switch (type) {
      case "user":
        return "text-cyan-400";
      case "system":
        return "text-zinc-300";
      case "action":
        return "text-emerald-400";
      case "error":
        return "text-red-400";
      default:
        return "text-zinc-400";
    }
  };

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <Radio className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">VoxPilot</h1>
              <p className="text-sm text-zinc-400">SRE Mission Control</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Status indicator */}
            <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/50 px-4 py-2">
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  isListening ? "animate-pulse bg-emerald-500" : "bg-zinc-600"
                )}
              />
              <span className="text-sm text-zinc-400">
                {isListening
                  ? "Listening..."
                  : isProcessing
                  ? "Processing..."
                  : "Ready"}
              </span>
            </div>
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Services Panel */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-emerald-400" />
                <CardTitle>Service Status</CardTitle>
              </div>
              <CardDescription>
                Real-time infrastructure health monitoring
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                {services.map((service) => {
                  const Icon = service.icon;
                  return (
                    <div
                      key={service.id}
                      className={cn(
                        "rounded-lg border p-4 transition-all duration-300",
                        service.status === "healthy"
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : service.status === "critical"
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-amber-500/30 bg-amber-500/5"
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <Icon
                          className={cn(
                            "h-5 w-5",
                            service.status === "healthy"
                              ? "text-emerald-400"
                              : service.status === "critical"
                              ? "text-red-400"
                              : "text-amber-400"
                          )}
                        />
                        <Badge variant={getStatusVariant(service.status)}>
                          {service.status.charAt(0).toUpperCase() +
                            service.status.slice(1)}
                        </Badge>
                      </div>
                      <h3 className="font-semibold">{service.name}</h3>
                      <p className="text-xs text-zinc-500">
                        Updated {service.lastUpdated}
                      </p>

                      {/* Mini metrics */}
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-zinc-500">CPU</span>
                          <p className="font-mono text-zinc-300">
                            {service.metrics.cpu}%
                          </p>
                        </div>
                        <div>
                          <span className="text-zinc-500">MEM</span>
                          <p className="font-mono text-zinc-300">
                            {service.metrics.memory}%
                          </p>
                        </div>
                        <div>
                          <span className="text-zinc-500">REQ</span>
                          <p className="font-mono text-zinc-300">
                            {service.metrics.requests}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Voice Control Panel */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-400" />
                <CardTitle>Voice Control</CardTitle>
              </div>
              <CardDescription>
                Speak commands to control infrastructure
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {/* Mic Button */}
              <div className="relative">
                {isListening && (
                  <div className="absolute inset-0 animate-pulse-ring rounded-full bg-emerald-500/30" />
                )}
                <Button
                  size="icon"
                  variant={isListening ? "destructive" : "default"}
                  className={cn(
                    "relative h-20 w-20 rounded-full transition-all duration-300",
                    isListening && "bg-red-600 hover:bg-red-700"
                  )}
                  onClick={toggleListening}
                  disabled={isProcessing}
                >
                  {isListening ? (
                    <MicOff className="h-8 w-8" />
                  ) : (
                    <Mic className="h-8 w-8" />
                  )}
                </Button>
              </div>

              {/* Transcript */}
              <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-center">
                <p className="text-sm text-zinc-400">
                  {transcript || "Tap microphone to speak..."}
                </p>
              </div>

              {/* Quick commands hint */}
              <div className="w-full space-y-2">
                <p className="text-xs font-medium text-zinc-500">Try saying:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Restart payment service",
                    "Scale up auth",
                    "Check status",
                  ].map((cmd) => (
                    <span
                      key={cmd}
                      className="rounded-full border border-zinc-800 bg-zinc-900/50 px-2 py-1 text-xs text-zinc-400"
                    >
                      &quot;{cmd}&quot;
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Terminal / Logs */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-emerald-400" />
              <CardTitle>Mission Log</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-zinc-800 bg-black/50 font-mono">
              <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <div className="h-3 w-3 rounded-full bg-amber-500" />
                <div className="h-3 w-3 rounded-full bg-emerald-500" />
                <span className="ml-2 text-xs text-zinc-500">
                  voxpilot-terminal
                </span>
              </div>
              <ScrollArea maxHeight="250px" className="p-4">
                <div className="space-y-1">
                  {logs.map((log) => (
                    <div key={log.id} className="flex gap-2 text-sm">
                      <span className="shrink-0 text-zinc-600">
                        [{log.timestamp}]
                      </span>
                      <span className={getLogColor(log.type)}>
                        {log.message}
                      </span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                  <div className="flex items-center gap-1 text-emerald-400">
                    <Zap className="h-3 w-3" />
                    <span className="animate-blink">_</span>
                  </div>
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
