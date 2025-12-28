"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  analyzeCommand,
  executeAction,
  type CommandAnalysis,
} from "@/app/actions";
import { Sidebar } from "@/components/dashboard/sidebar";
import {
  HealthCard,
  type ServiceStatus,
} from "@/components/dashboard/health-card";
import { VoiceOrb, type OrbState } from "@/components/dashboard/voice-orb";
import {
  TerminalLogs,
  type LogEntry,
} from "@/components/dashboard/terminal-logs";
import {
  IconShield,
  IconDatabase,
  IconServer,
  IconZap,
} from "@/components/icons";

// Service data type
interface Service {
  id: string;
  name: string;
  icon: React.ReactNode;
  status: ServiceStatus;
  cpu: number;
  memory: number;
  latency: number;
}

// Initial services
const initialServices: Service[] = [
  {
    id: "gateway",
    name: "API Gateway",
    icon: <IconZap size={20} />,
    status: "healthy",
    cpu: 45,
    memory: 62,
    latency: 23,
  },
  {
    id: "auth",
    name: "Auth Service",
    icon: <IconShield size={20} />,
    status: "critical",
    cpu: 92,
    memory: 87,
    latency: 450,
  },
  {
    id: "database",
    name: "Database",
    icon: <IconDatabase size={20} />,
    status: "healthy",
    cpu: 34,
    memory: 56,
    latency: 12,
  },
  {
    id: "cache",
    name: "Redis Cache",
    icon: <IconServer size={20} />,
    status: "warning",
    cpu: 78,
    memory: 81,
    latency: 89,
  },
];

// Generate unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

export default function DashboardPage() {
  // State
  const [services, setServices] = useState<Service[]>(initialServices);
  const [filteredServices, setFilteredServices] = useState<string[] | null>(
    null
  );
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: generateId(),
      timestamp: new Date(),
      type: "system",
      message: "VoxPilot Mission Control initialized",
    },
    {
      id: generateId(),
      timestamp: new Date(),
      type: "system",
      message: "4 services connected and monitored",
    },
  ]);
  const [confirmationText, setConfirmationText] = useState<string>();
  const [pendingAction, setPendingAction] = useState<{
    service: string;
    action: string;
  } | null>(null);
  const [flashingCard, setFlashingCard] = useState<string | null>(null);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const isListeningForConfirmation = useRef(false);
  const confirmationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingActionRef = useRef<{ service: string; action: string } | null>(
    null
  );

  // Cancel confirmation mode
  const cancelConfirmation = useCallback(() => {
    isListeningForConfirmation.current = false;
    pendingActionRef.current = null;
    if (confirmationTimeoutRef.current) {
      clearTimeout(confirmationTimeoutRef.current);
      confirmationTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    setPendingAction(null);
    setConfirmationText(undefined);
    setOrbState("idle");
  }, []);

  // Add log entry
  const addLog = useCallback((type: LogEntry["type"], message: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: generateId(),
        timestamp: new Date(),
        type,
        message,
      },
    ]);
  }, []);

  // Browser TTS fallback
  const speakText = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        resolve();
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Try to find a good voice
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) =>
          v.name.includes("Google") ||
          v.name.includes("Samantha") ||
          v.lang.startsWith("en")
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // Play audio (with browser TTS fallback)
  const playAudio = useCallback(
    (audioData: string | undefined, fallbackText?: string) => {
      return new Promise<void>((resolve) => {
        if (audioData && audioRef.current) {
          audioRef.current.src = audioData;
          audioRef.current.onended = () => resolve();
          audioRef.current.onerror = () => {
            // If audio fails, use browser TTS
            if (fallbackText) {
              speakText(fallbackText).then(resolve);
            } else {
              resolve();
            }
          };
          audioRef.current.play().catch(() => {
            // If play fails, use browser TTS
            if (fallbackText) {
              speakText(fallbackText).then(resolve);
            } else {
              resolve();
            }
          });
        } else if (fallbackText) {
          // No audio data, use browser TTS
          speakText(fallbackText).then(resolve);
        } else {
          resolve();
        }
      });
    },
    [speakText]
  );

  // Update service status
  const updateServiceStatus = useCallback(
    (serviceId: string, status: ServiceStatus, metrics?: Partial<Service>) => {
      setServices((prev) =>
        prev.map((s) =>
          s.id === serviceId ? { ...s, status, ...(metrics || {}) } : s
        )
      );

      // Flash the card
      setFlashingCard(serviceId);
      setTimeout(() => setFlashingCard(null), 2000);
    },
    []
  );

  // Handle voice command
  const handleVoiceCommand = useCallback(
    async (transcript: string) => {
      addLog("user", `"${transcript}"`);
      setOrbState("processing");

      try {
        const result = await analyzeCommand(transcript);

        if (!result.success || !result.analysis) {
          addLog("error", result.message || "Failed to analyze command");
          setOrbState("idle");
          return;
        }

        const analysis = result.analysis;
        addLog("action", `Intent: ${analysis.intent}`);

        // Handle dashboard control commands (no API call needed for execution)
        if (analysis.action) {
          const action = analysis.action.toLowerCase();

          // Filter commands
          if (action === "show-critical" || action.includes("critical")) {
            setFilteredServices(
              services.filter((s) => s.status === "critical").map((s) => s.id)
            );
            addLog("system", "Showing critical services");
            setOrbState("speaking");
            await playAudio(result.audio, "Showing critical.");
            setOrbState("idle");
            return;
          }

          if (action === "show-warnings" || action.includes("warning")) {
            setFilteredServices(
              services
                .filter(
                  (s) => s.status === "warning" || s.status === "critical"
                )
                .map((s) => s.id)
            );
            addLog("system", "Showing warnings");
            setOrbState("speaking");
            await playAudio(result.audio, "Showing warnings.");
            setOrbState("idle");
            return;
          }

          if (
            action === "show-all" ||
            action.includes("show all") ||
            action.includes("reset")
          ) {
            setFilteredServices(null);
            addLog("system", "Showing all services");
            setOrbState("speaking");
            await playAudio(result.audio, "Showing all.");
            setOrbState("idle");
            return;
          }

          if (action === "clear-logs" || action.includes("clear")) {
            setLogs([
              {
                id: generateId(),
                timestamp: new Date(),
                type: "system",
                message: "Logs cleared",
              },
            ]);
            setOrbState("speaking");
            await playAudio(result.audio, "Logs cleared.");
            setOrbState("idle");
            return;
          }

          if (
            action === "go-home" ||
            action.includes("home") ||
            action.includes("landing")
          ) {
            addLog("system", "Navigating home");
            setOrbState("speaking");
            await playAudio(result.audio, "Going home.");
            window.location.href = "/";
            return;
          }
        }

        // Handle based on risk level
        if (analysis.risk === "HIGH" && analysis.service && analysis.action) {
          // High risk - need confirmation
          const actionData = {
            service: analysis.service,
            action: analysis.action,
          };
          setPendingAction(actionData);
          pendingActionRef.current = actionData; // Also set ref for closure access
          setConfirmationText(
            analysis.confirmation || `${analysis.action} ${analysis.service}?`
          );

          addLog(
            "warning",
            `HIGH RISK: ${analysis.action} on ${analysis.service}`
          );

          // Play warning audio (short)
          setOrbState("speaking");
          await playAudio(
            result.audio,
            analysis.confirmation || `${analysis.action} ${analysis.service}?`
          );

          // Set up for confirmation listening
          isListeningForConfirmation.current = true;

          // Set timeout to auto-cancel after 15 seconds
          if (confirmationTimeoutRef.current) {
            clearTimeout(confirmationTimeoutRef.current);
          }
          confirmationTimeoutRef.current = setTimeout(() => {
            if (isListeningForConfirmation.current) {
              addLog("system", "Confirmation timeout - cancelled");
              cancelConfirmation();
            }
          }, 15000);

          // Start listening for confirmation after a short delay
          setTimeout(() => {
            startListening(true); // Pass true for confirmation mode
          }, 500);
        } else {
          // Low risk or no action - just respond
          addLog("system", analysis.response);

          // Play response audio (with browser TTS fallback)
          setOrbState("speaking");
          await playAudio(result.audio, analysis.response);

          setOrbState("idle");
        }
      } catch (error) {
        console.error("Command processing error:", error);
        addLog("error", "Failed to process command");
        setOrbState("idle");
      }
    },
    [addLog, playAudio, cancelConfirmation, services]
  );

  // Handle confirmation response
  const handleConfirmation = useCallback(
    async (transcript: string) => {
      const lower = transcript.toLowerCase();
      isListeningForConfirmation.current = false;

      // Stop any existing recognition immediately
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }

      // Clear the confirmation timeout
      if (confirmationTimeoutRef.current) {
        clearTimeout(confirmationTimeoutRef.current);
        confirmationTimeoutRef.current = null;
      }

      // Get pending action from ref (avoids stale closure)
      const currentPendingAction = pendingActionRef.current;

      console.log("🎤 Confirmation received:", transcript);
      console.log("📋 Pending action:", currentPendingAction);

      addLog("user", `"${transcript}"`);

      if (
        lower.includes("yes") ||
        lower.includes("confirm") ||
        lower.includes("proceed") ||
        lower.includes("yeah") ||
        lower.includes("yep") ||
        lower.includes("do it") ||
        lower.includes("go ahead")
      ) {
        // Execute the action
        if (currentPendingAction) {
          addLog(
            "action",
            `Executing ${currentPendingAction.action} on ${currentPendingAction.service}...`
          );
          setOrbState("processing");

          try {
            // Set to restarting state
            updateServiceStatus(currentPendingAction.service, "restarting");

            const result = await executeAction(
              currentPendingAction.service,
              currentPendingAction.action
            );

            if (result.success) {
              addLog("success", result.message);

              // Update to healthy
              updateServiceStatus(currentPendingAction.service, "healthy", {
                cpu: Math.floor(Math.random() * 30) + 20,
                memory: Math.floor(Math.random() * 30) + 30,
                latency: Math.floor(Math.random() * 30) + 10,
              });

              // Play success audio (with browser TTS fallback)
              setOrbState("speaking");
              await playAudio(result.audio, result.message);
            } else {
              addLog("error", result.message);
              // Speak error
              setOrbState("speaking");
              await playAudio(undefined, result.message);
            }
          } catch (error) {
            addLog("error", "Action execution failed");
            setOrbState("speaking");
            await playAudio(undefined, "Action execution failed");
          }
        } else {
          addLog("error", "No pending action found");
          setOrbState("speaking");
          await playAudio(undefined, "No action pending.");
        }
      } else if (
        lower.includes("no") ||
        lower.includes("cancel") ||
        lower.includes("abort")
      ) {
        addLog("system", "Action cancelled");
        setOrbState("speaking");
        await playAudio(undefined, "Cancelled.");
      } else {
        addLog("warning", "Unclear response, cancelled");
        setOrbState("speaking");
        await playAudio(undefined, "Cancelled.");
      }

      pendingActionRef.current = null;
      setPendingAction(null);
      setConfirmationText(undefined);
      setOrbState("idle");
    },
    [addLog, playAudio, updateServiceStatus]
  );

  // Speech recognition setup
  const startListening = useCallback(
    (forConfirmation = false) => {
      if (typeof window === "undefined") return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognitionAPI =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (!SpeechRecognitionAPI) {
        addLog("error", "Speech recognition not supported");
        return;
      }

      // Stop any existing recognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore errors when stopping
        }
      }

      // Small delay to ensure previous recognition is fully stopped
      setTimeout(() => {
        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onstart = () => {
          if (forConfirmation) {
            setOrbState("confirming");
            addLog("system", "Listening for confirmation...");
          } else {
            setOrbState("listening");
            addLog("system", "Listening...");
          }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          console.log(
            "🎤 Heard:",
            transcript,
            "| Confirmation mode:",
            forConfirmation
          );

          if (forConfirmation || isListeningForConfirmation.current) {
            handleConfirmation(transcript);
          } else {
            handleVoiceCommand(transcript);
          }
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          if (event.error !== "no-speech" && event.error !== "aborted") {
            addLog("error", `Voice error: ${event.error}`);
          }
          // If we're in confirmation mode and got no-speech, we'll restart in onend
          // For other errors in non-confirmation mode, go to idle
          if (!forConfirmation && !isListeningForConfirmation.current) {
            setOrbState("idle");
          }
          // no-speech error will trigger onend which will restart if in confirmation mode
        };

        recognition.onend = () => {
          console.log(
            "🎤 Recognition ended | Confirmation mode:",
            forConfirmation,
            isListeningForConfirmation.current
          );
          // If we're in confirmation mode and didn't get a result, restart listening
          if (forConfirmation || isListeningForConfirmation.current) {
            console.log("🎤 Restarting confirmation listening...");
            // Restart listening after a brief delay
            setTimeout(() => {
              if (isListeningForConfirmation.current) {
                try {
                  recognition.start();
                  console.log("🎤 Restarted confirmation listening");
                } catch (e) {
                  console.error("Failed to restart recognition:", e);
                }
              }
            }, 300);
          } else {
            if (orbState === "listening") {
              setOrbState("idle");
            }
          }
        };

        recognitionRef.current = recognition;

        try {
          recognition.start();
          console.log(
            "🎤 Started listening | Confirmation mode:",
            forConfirmation
          );
        } catch (e) {
          console.error("Failed to start recognition:", e);
        }
      }, 100);
    },
    [orbState, addLog, handleVoiceCommand, handleConfirmation]
  );

  // Orb click handler
  const handleOrbClick = useCallback(() => {
    if (orbState === "idle") {
      startListening(false);
    } else if (orbState === "listening") {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setOrbState("idle");
    } else if (orbState === "confirming") {
      // Click again to restart listening for confirmation
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // ignore
        }
      }
      // Short delay then restart
      setTimeout(() => {
        startListening(true);
      }, 200);
    }
  }, [orbState, startListening]);

  // Cleanup and keyboard shortcuts
  useEffect(() => {
    // Load voices on mount (needed for some browsers)
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }

    // Keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Space or Enter to start listening (when idle)
      if ((e.code === "Space" || e.code === "Enter") && orbState === "idle") {
        e.preventDefault();
        startListening(false);
      }

      // Escape to cancel
      if (e.code === "Escape") {
        if (orbState === "confirming") {
          cancelConfirmation();
          addLog("system", "Cancelled via keyboard");
        } else if (orbState === "listening") {
          if (recognitionRef.current) {
            recognitionRef.current.stop();
          }
          setOrbState("idle");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [orbState, startListening, cancelConfirmation, addLog]);

  // Quick command handler (for buttons)
  const executeQuickCommand = useCallback(
    (command: string) => {
      addLog("user", `"${command}"`);
      handleVoiceCommand(command);
    },
    [addLog, handleVoiceCommand]
  );

  // Click on service card handler
  const handleServiceClick = useCallback(
    (serviceId: string) => {
      const service = services.find((s) => s.id === serviceId);
      if (service) {
        executeQuickCommand(`check status of ${serviceId}`);
      }
    },
    [services, executeQuickCommand]
  );

  return (
    <div className="flex min-h-screen bg-black">
      {/* Audio element */}
      <audio ref={audioRef} className="hidden" />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <main className="flex-1 ml-16 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div>
              <h1 className="text-2xl font-bold text-white">Mission Control</h1>
              <p className="text-neutral-500 text-sm mt-1">
                Real-time infrastructure monitoring and voice operations
              </p>
            </div>
            <div className="flex items-center gap-3">
              {filteredServices && (
                <button
                  onClick={() => setFilteredServices(null)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                >
                  <span className="text-amber-400 text-xs font-medium">
                    Filtered ({filteredServices.length})
                  </span>
                  <span className="text-amber-400/60 text-xs">✕</span>
                </button>
              )}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-400 text-xs font-medium">
                  Systems Online
                </span>
              </div>
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-wrap gap-2"
          >
            <span className="text-xs text-neutral-500 mr-2 self-center">
              Quick:
            </span>
            <button
              onClick={() => executeQuickCommand("show critical services")}
              className="px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Show Critical
            </button>
            <button
              onClick={() => executeQuickCommand("show warnings")}
              className="px-3 py-1.5 text-xs rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              Show Warnings
            </button>
            <button
              onClick={() => executeQuickCommand("show all services")}
              className="px-3 py-1.5 text-xs rounded-lg bg-neutral-500/10 border border-neutral-500/20 text-neutral-400 hover:bg-neutral-500/20 transition-colors"
            >
              Show All
            </button>
            <button
              onClick={() =>
                executeQuickCommand("check status of all services")
              }
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors"
            >
              Status Report
            </button>
            <button
              onClick={() => executeQuickCommand("clear logs")}
              className="px-3 py-1.5 text-xs rounded-lg bg-neutral-500/10 border border-neutral-500/20 text-neutral-400 hover:bg-neutral-500/20 transition-colors"
            >
              Clear Logs
            </button>
          </motion.div>

          {/* Service cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {services
                .filter(
                  (s) => !filteredServices || filteredServices.includes(s.id)
                )
                .map((service, index) => (
                  <motion.div
                    key={service.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => handleServiceClick(service.id)}
                    className="cursor-pointer"
                  >
                    <HealthCard
                      name={service.name}
                      icon={service.icon}
                      status={service.status}
                      cpu={service.cpu}
                      memory={service.memory}
                      latency={service.latency}
                      isFlashing={flashingCard === service.id}
                    />
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>

          {/* Terminal logs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <TerminalLogs logs={logs} />
          </motion.div>

          {/* Keyboard shortcuts hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex items-center justify-center gap-4 text-[10px] text-neutral-600"
          >
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono">
                Space
              </kbd>{" "}
              to speak
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 font-mono">
                Esc
              </kbd>{" "}
              to cancel
            </span>
            <span>Click service card for status</span>
          </motion.div>

          {/* Voice status indicator */}
          <AnimatePresence>
            {orbState !== "idle" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-neutral-900/90 border border-neutral-800 backdrop-blur-sm"
              >
                <span className="text-sm text-neutral-300">
                  {orbState === "listening" && "Listening to your command..."}
                  {orbState === "processing" && "Processing command..."}
                  {orbState === "speaking" && "VoxPilot is responding..."}
                  {orbState === "confirming" && "Say Yes or No to confirm..."}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Voice orb */}
      <VoiceOrb
        state={orbState}
        onClick={handleOrbClick}
        confirmationText={confirmationText}
      />
    </div>
  );
}
