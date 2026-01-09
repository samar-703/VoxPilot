"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  processYoutubeLink,
  parseVoiceIntent,
  saveContent,
  getSavedContent,
  deleteContent,
  readSummaryAloud,
  speakResponse,
  answerFollowUpQuestion,
  generateSpeechWithConfidence,
  signOut,
  getUser,
  type VideoSummary,
  type SavedContent,
  type Intent,
  type FollowUpResult,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  VoxPilotLogo,
  IconMicrophone,
  IconMicrophoneOff,
  IconYoutube,
  IconSearch,
  IconBookmark,
  IconTrash,
  IconVolume,
  IconLoader,
  IconCheck,
  IconX,
  IconLogout,
  IconExternalLink,
} from "@/components/icons";
import { ModeToggle } from "@/components/mode-toggle";
import { cn } from "@/lib/utils";

// Voice Orb State
type OrbState = "idle" | "listening" | "processing" | "speaking" | "confirming";

export default function DashboardPage() {
  const router = useRouter();
  const { setTheme } = useTheme();

  // User state
  const [user, setUser] = useState<{ email: string } | null>(null);

  // Input state
  const [inputValue, setInputValue] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Content state
  const [currentVideo, setCurrentVideo] = useState<{
    url: string;
    videoId: string;
    summary: VideoSummary;
    transcript?: string;
  } | null>(null);
  const [savedVideos, setSavedVideos] = useState<SavedContent[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [lastAnswer, setLastAnswer] = useState<FollowUpResult | null>(null);

  // Voice state
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [transcript, setTranscript] = useState("");

  const [awaitingConfirmation, setAwaitingConfirmation] = useState<{
    type: "delete";
    video: SavedContent;
  } | null>(null);

  const [statusMessage, setStatusMessage] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<SavedContent | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restartListeningRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const init = async () => {
      const userData = await getUser();
      if (userData) {
        setUser({ email: userData.email || "" });
        const saved = await getSavedContent();
        setSavedVideos(saved);
      }
      setLoadingSaved(false);
    };
    init();
  }, []);

  const showStatus = useCallback((message: string, duration = 3000) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(""), duration);
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setOrbState("idle");
    }
  }, []);

  // Play audio
  const playAudio = useCallback((audioData: string) => {
    if (audioRef.current) {
      audioRef.current.src = audioData;
      audioRef.current.play();
      setOrbState("speaking");
      audioRef.current.onended = () => setOrbState("idle");
    }
  }, []);

  const handleLoadSaved = useCallback((saved: SavedContent) => {
    setCurrentVideo({
      url: saved.url,
      videoId: saved.video_id,
      summary: saved.summary_json,
    });
  }, []);

  const executeAction = useCallback(
    async (
      intent: Intent,
      context?: { url?: string; video?: SavedContent; question?: string }
    ) => {
      console.log("Executing intent:", intent, context);

      switch (intent) {
        case "ANALYZE_VIDEO": {
          if (!context?.url) {
            showStatus("No URL provided");
            return;
          }
          setIsAnalyzing(true);
          setOrbState("processing");
          showStatus("Analyzing...");

          try {
            const result = await processYoutubeLink(context.url);
            if (result.success && result.summary) {
              const videoId = context.url.match(
                /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
              )?.[1];
              setCurrentVideo({
                url: context.url,
                videoId: videoId || "",
                summary: result.summary,
                transcript: result.transcript,
              });
              showStatus("Video analyzed!");
            } else {
              showStatus(result.message);
            }
          } catch (error) {
            console.error("Analysis error:", error);
            showStatus("Failed to analyze video");
          } finally {
            setIsAnalyzing(false);
            setOrbState("idle");
            setInputValue("");
          }
          break;
        }

        case "READ_SUMMARY": {
          const summary = currentVideo?.summary;
          if (!summary) {
            showStatus("No summary loaded");
            setOrbState("idle");
            return;
          }
          setOrbState("processing");
          showStatus("Reading...");

          try {
            const result = await readSummaryAloud(summary);
            if (result.audio) {
              playAudio(result.audio);
            } else {
              showStatus("TTS unavailable");
              setOrbState("idle");
            }
          } catch (error) {
            console.error("TTS error:", error);
            showStatus("Failed to read summary");
            setOrbState("idle");
          }
          break;
        }

        case "SUMMARIZE_INPUT": {
          const urlFromInput = inputValue.trim();
          if (!urlFromInput) {
            showStatus("Please paste a YouTube URL first");
            setOrbState("idle");
            return;
          }

          if (!urlFromInput.match(/(youtube\.com|youtu\.be)/i)) {
            showStatus("Please paste a valid YouTube URL");
            setOrbState("idle");
            return;
          }

          setIsAnalyzing(true);
          setOrbState("processing");
          showStatus("Analyzing video...");

          try {
            const result = await processYoutubeLink(urlFromInput);
            if (result.success && result.summary) {
              setCurrentVideo({
                url: urlFromInput,
                videoId: result.analysis?.videoId || "",
                summary: result.summary,
                transcript: result.transcript,
              });
              showStatus("Video summarized!");
              setInputValue("");

              try {
                const audio = await speakResponse(
                  "Video summarized. Want me to read it for you?"
                );
                if (audio) {
                  playAudio(audio);
                } else {
                  setOrbState("idle");
                }
              } catch (ttsError) {
                console.error("TTS error:", ttsError);
                setOrbState("idle");
              }
            } else {
              showStatus(result.message);
              setOrbState("idle");
            }
          } catch (error) {
            console.error("Analysis error:", error);
            showStatus("Failed to analyze video");
            setOrbState("idle");
          } finally {
            setIsAnalyzing(false);
          }
          break;
        }

        case "SAVE_VIDEO": {
          if (!currentVideo) {
            showStatus("No video to save");
            return;
          }
          setIsAnalyzing(true);
          setOrbState("processing");
          showStatus("Saving...");

          try {
            const result = await saveContent(
              currentVideo.url,
              currentVideo.videoId,
              currentVideo.summary
            );
            if (result.success) {
              showStatus("Saved!");
              const saved = await getSavedContent();
              setSavedVideos(saved);

              try {
                const audio = await speakResponse("Video saved.");
                if (audio) {
                  playAudio(audio);
                } else {
                  setOrbState("idle");
                }
              } catch (e) {
                setOrbState("idle");
              }
            } else {
              showStatus(result.message);
              setOrbState("idle");
            }
          } catch (error) {
            console.error("Save error:", error);
            showStatus("Failed to save");
            setOrbState("idle");
          } finally {
            setIsAnalyzing(false);
          }
          break;
        }

        case "DELETE_VIDEO": {
          if (context?.video) {
            setAwaitingConfirmation({ type: "delete", video: context.video });
            setOrbState("processing");
            showStatus("Confirm deletion? Say yes or no.");

            const startConfirmListening = () => {
              if (typeof window === "undefined") return;
              const SR =
                (window as any).SpeechRecognition ||
                (window as any).webkitSpeechRecognition;
              if (!SR) return;

              if (recognitionRef.current) {
                try {
                  recognitionRef.current.stop();
                } catch (e) {}
              }

              const rec = new SR();
              rec.continuous = false;
              rec.interimResults = true;
              rec.lang = "en-US";

              rec.onstart = () => {
                setOrbState("confirming");
                setTranscript("");
              };

              rec.onresult = async (event: SpeechRecognitionEvent) => {
                const resultItem = event.results[event.results.length - 1];
                const text = resultItem[0].transcript;
                setTranscript(text);

                if (resultItem.isFinal) {
                  console.log("Confirmation voice input:", text);
                  setOrbState("processing");

                  const analysis = await parseVoiceIntent(
                    text,
                    currentVideo?.summary,
                    { type: "delete" }
                  );

                  console.log("Parsed confirmation:", analysis);
                  await executeAction(analysis.intent, {
                    video: context.video,
                  });
                  setTranscript("");
                }
              };

              rec.onerror = (event: SpeechRecognitionErrorEvent) => {
                console.error("Confirmation error:", event.error);
                if (event.error !== "aborted")
                  showStatus("Voice error. Try again.");
                setOrbState("confirming");
              };

              rec.onend = () => {};

              recognitionRef.current = rec;
              rec.start();
            };

            try {
              const audio = await speakResponse(
                "Delete this video? Say yes or no."
              );
              if (audio) {
                playAudio(audio);
                audioRef.current!.onended = () => {
                  setTimeout(startConfirmListening, 300);
                };
              } else {
                setOrbState("confirming");
                setTimeout(startConfirmListening, 300);
              }
            } catch (error) {
              console.error("Delete confirmation TTS error:", error);
              setOrbState("confirming");
              setTimeout(startConfirmListening, 300);
            }
          } else if (currentVideo) {
            const found = savedVideos.find(
              (v) => v.video_id === currentVideo.videoId
            );
            if (found) {
              setAwaitingConfirmation({ type: "delete", video: found });
              setOrbState("processing");
              showStatus("Confirm deletion? Say yes or no.");

              const startConfirmListening = () => {
                if (typeof window === "undefined") return;
                const SR =
                  (window as any).SpeechRecognition ||
                  (window as any).webkitSpeechRecognition;
                if (!SR) return;

                if (recognitionRef.current) {
                  try {
                    recognitionRef.current.stop();
                  } catch (e) {}
                }

                const rec = new SR();
                rec.continuous = false;
                rec.interimResults = true;
                rec.lang = "en-US";

                rec.onstart = () => {
                  setOrbState("confirming");
                  setTranscript("");
                };

                rec.onresult = async (event: SpeechRecognitionEvent) => {
                  const resultItem = event.results[event.results.length - 1];
                  const text = resultItem[0].transcript;
                  setTranscript(text);

                  if (resultItem.isFinal) {
                    console.log("Confirmation voice input:", text);
                    setOrbState("processing");

                    const analysis = await parseVoiceIntent(
                      text,
                      currentVideo?.summary,
                      { type: "delete" }
                    );

                    console.log("Parsed confirmation:", analysis);
                    await executeAction(analysis.intent, { video: found });
                    setTranscript("");
                  }
                };

                rec.onerror = (event: SpeechRecognitionErrorEvent) => {
                  console.error("Confirmation error:", event.error);
                  if (event.error !== "aborted")
                    showStatus("Voice error. Try again.");
                  setOrbState("confirming");
                };

                rec.onend = () => {};

                recognitionRef.current = rec;
                rec.start();
              };

              try {
                const audio = await speakResponse(
                  "Delete this video? Say yes or no."
                );
                if (audio) {
                  playAudio(audio);
                  audioRef.current!.onended = () => {
                    setTimeout(startConfirmListening, 300);
                  };
                } else {
                  setOrbState("confirming");
                  setTimeout(startConfirmListening, 300);
                }
              } catch (error) {
                console.error("Delete confirmation TTS error:", error);
                setOrbState("confirming");
                setTimeout(startConfirmListening, 300);
              }
            } else {
              showStatus("Video not in library");
            }
          } else {
            showStatus("No video selected");
          }
          break;
        }

        case "CONFIRM_YES": {
          if (awaitingConfirmation?.type === "delete" || context?.video) {
            const video = context?.video || awaitingConfirmation?.video;
            if (!video) {
              setOrbState("idle");
              break;
            }
            setAwaitingConfirmation(null);
            setOrbState("processing");
            showStatus("Deleting...");

            try {
              const result = await deleteContent(video.id);
              if (result.success) {
                setSavedVideos((prev) => prev.filter((v) => v.id !== video.id));
                showStatus("Deleted!");

                // Speak confirmation
                try {
                  const audio = await speakResponse("Deleted.");
                  if (audio) {
                    playAudio(audio);
                  } else {
                    setOrbState("idle");
                  }
                } catch (e) {
                  setOrbState("idle");
                }
              } else {
                showStatus(result.message);
                setOrbState("idle");
              }
            } catch (error) {
              console.error("Delete error:", error);
              showStatus("Failed to delete");
              setOrbState("idle");
            }
          } else {
            setOrbState("idle");
          }
          break;
        }

        case "CANCEL_DELETE": {
          setAwaitingConfirmation(null);
          showStatus("Cancelled");

          try {
            // Speak cancellation
            const audio = await speakResponse("Cancelled.");
            if (audio) {
              playAudio(audio);
            } else {
              setOrbState("idle");
            }
          } catch (error) {
            console.error("Cancel TTS error:", error);
            setOrbState("idle");
          }
          break;
        }

        case "LIST_VIDEOS": {
          showStatus("Loading library...");
          try {
            const saved = await getSavedContent();
            setSavedVideos(saved);
            showStatus(`${saved.length} videos in library`);
          } catch (error) {
            console.error("List error:", error);
            showStatus("Failed to load library");
          }
          setOrbState("idle");
          break;
        }

        case "PLAY_VIDEO": {
          if (currentVideo) {
            window.open(currentVideo.url, "_blank");
            showStatus("Opening video");
          } else {
            showStatus("No video loaded");
          }
          setOrbState("idle");
          break;
        }

        case "COUNT_VIDEOS": {
          const count = savedVideos.length;
          const message =
            count === 0
              ? "You don't have any saved videos yet."
              : count === 1
              ? "You have 1 video saved in your library."
              : `You have ${count} videos saved in your library.`;

          showStatus(message);
          setOrbState("processing");

          try {
            const audio = await speakResponse(message);
            if (audio) {
              playAudio(audio);
            } else {
              setOrbState("idle");
            }
          } catch (error) {
            console.error("Count videos TTS error:", error);
            setOrbState("idle");
          }
          break;
        }

        case "FOLLOW_UP_QUESTION": {
          if (!currentVideo) {
            showStatus("Please analyze a video first");
            setOrbState("idle");
            return;
          }

          const question = context?.question;
          if (!question) {
            showStatus("No question detected");
            setOrbState("idle");
            return;
          }

          setOrbState("processing");
          showStatus("Thinking...");

          try {
            const result = await answerFollowUpQuestion(
              question,
              currentVideo.summary,
              currentVideo.transcript
            );

            setLastAnswer(result);

            if (result.success) {
              // Show answer as status (truncated for display)
              const displayAnswer =
                result.answer.length > 100
                  ? result.answer.substring(0, 100) + "..."
                  : result.answer;
              showStatus(displayAnswer);

              // Log full answer to console
              console.log("Follow-up answer:", result.answer);
              console.log("Confidence:", result.confidence);
              if (result.disclaimer) {
                console.log("Disclaimer:", result.disclaimer);
              }
            } else {
              showStatus(result.answer);
            }
          } catch (error) {
            console.error("Follow-up question error:", error);
            showStatus("Failed to answer question");
          }

          setOrbState("idle");
          break;
        }

        case "READ_ANSWER": {
          if (!lastAnswer) {
            showStatus("No answer to read. Ask a question first.");
            setOrbState("idle");
            return;
          }

          setOrbState("processing");
          showStatus("Reading answer...");

          try {
            const textToRead = lastAnswer.disclaimer
              ? `${lastAnswer.disclaimer} ${lastAnswer.answer}`
              : lastAnswer.answer;

            const audio = await generateSpeechWithConfidence(
              textToRead,
              lastAnswer.confidence
            );

            if (audio) {
              playAudio(audio);
            } else {
              showStatus("TTS unavailable");
              setOrbState("idle");
            }
          } catch (error) {
            console.error("Read answer TTS error:", error);
            showStatus("Failed to read answer");
            setOrbState("idle");
          }
          break;
        }

        case "GREETING": {
          showStatus("Hello! Ready for commands.");
          setOrbState("processing");

          try {
            const audio = await speakResponse("Hello! Ready.");
            if (audio) {
              playAudio(audio);
            } else {
              setOrbState("idle");
            }
          } catch (error) {
            console.error("Greeting TTS error:", error);
            setOrbState("idle");
          }
          break;
        }

        case "SWITCH_LIGHT_MODE": {
          setTheme("light");
          showStatus("Switched to light mode");
          setOrbState("processing");

          try {
            const audio = await speakResponse("Switched to light mode.");
            if (audio) {
              playAudio(audio);
            } else {
              setOrbState("idle");
            }
          } catch (error) {
            console.error("Theme switch TTS error:", error);
            setOrbState("idle");
          }
          break;
        }

        case "SWITCH_DARK_MODE": {
          setTheme("dark");
          showStatus("Switched to dark mode");
          setOrbState("processing");

          try {
            const audio = await speakResponse("Switched to dark mode.");
            if (audio) {
              playAudio(audio);
            } else {
              setOrbState("idle");
            }
          } catch (error) {
            console.error("Theme switch TTS error:", error);
            setOrbState("idle");
          }
          break;
        }

        case "SWITCH_SYSTEM_MODE": {
          setTheme("system");
          showStatus("Switched to system mode");
          setOrbState("processing");

          try {
            const audio = await speakResponse("Switched to system mode.");
            if (audio) {
              playAudio(audio);
            } else {
              setOrbState("idle");
            }
          } catch (error) {
            console.error("Theme switch TTS error:", error);
            setOrbState("idle");
          }
          break;
        }

        case "UNCLEAR":
        default: {
          showStatus("Say: read summary, save, delete, or paste a link");
          setOrbState("idle");
          break;
        }
      }
    },
    [
      currentVideo,
      savedVideos,
      awaitingConfirmation,
      showStatus,
      playAudio,
      setTheme,
      inputValue,
      lastAnswer,
    ]
  );

  const handleAnalyze = useCallback(
    async (input: string) => {
      if (!input.trim()) return;

      const isUrl = input.match(/(youtube\.com|youtu\.be)/i);
      if (isUrl) {
        await executeAction("ANALYZE_VIDEO", { url: input });
      } else {
        showStatus("Please paste a valid YouTube URL");
      }
    },
    [executeAction, showStatus]
  );

  const handleSave = useCallback(async () => {
    await executeAction("SAVE_VIDEO");
  }, [executeAction]);

  const handleDelete = useCallback(async () => {
    if (!videoToDelete) return;

    setDeleteDialogOpen(false);
    setOrbState("processing");

    try {
      const result = await deleteContent(videoToDelete.id);
      if (result.success) {
        setSavedVideos((prev) => prev.filter((v) => v.id !== videoToDelete.id));
        showStatus("Deleted!");
      } else {
        showStatus(result.message);
      }
    } catch (error) {
      console.error("Delete error:", error);
      showStatus("Failed to delete");
    } finally {
      setVideoToDelete(null);
      setOrbState("idle");
    }
  }, [videoToDelete, showStatus]);

  const handleReadSummary = useCallback(
    async (summary: VideoSummary) => {
      setOrbState("processing");
      showStatus("Reading...");

      try {
        const result = await readSummaryAloud(summary);
        if (result.audio) {
          playAudio(result.audio);
        } else {
          showStatus("TTS unavailable");
          setOrbState("idle");
        }
      } catch (error) {
        console.error("TTS error:", error);
        showStatus("Failed to read summary");
        setOrbState("idle");
      }
    },
    [showStatus, playAudio]
  );

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showStatus("Speech recognition not supported");
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      if (awaitingConfirmation) {
        setOrbState("confirming");
      } else {
        setOrbState("listening");
      }
      setTranscript("");
    };

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      const resultItem = event.results[event.results.length - 1];
      const text = resultItem[0].transcript;
      setTranscript(text);

      if (resultItem.isFinal) {
        console.log("Voice input (final):", text);
        setOrbState("processing");

        const analysis = await parseVoiceIntent(
          text,
          currentVideo?.summary,
          awaitingConfirmation ? { type: awaitingConfirmation.type } : null
        );

        console.log("Parsed intent:", analysis);

        // Execute the action through unified handler
        await executeAction(analysis.intent, {
          url: analysis.url,
          video: awaitingConfirmation?.video,
          question: analysis.question,
        });

        setTranscript("");
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== "aborted") {
        showStatus("Voice error. Try again.");
      }
      setOrbState(awaitingConfirmation ? "confirming" : "idle");
    };

    recognition.onend = () => {
      if (orbState === "listening") {
        setOrbState(awaitingConfirmation ? "confirming" : "idle");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [showStatus, orbState, currentVideo, awaitingConfirmation, executeAction]);

  // Populate the restart listening ref so it can be called from executeAction
  useEffect(() => {
    restartListeningRef.current = () => {
      // Stop any existing recognition first
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore if already stopped
        }
      }
      // Start fresh after a short delay
      setTimeout(() => {
        startListening();
      }, 200);
    };
  }, [startListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setOrbState(awaitingConfirmation ? "confirming" : "idle");
  }, [awaitingConfirmation]);

  const toggleListening = useCallback(() => {
    if (orbState === "listening" || orbState === "confirming") {
      stopListening();
    } else if (orbState === "idle") {
      startListening();
    }
  }, [orbState, startListening, stopListening]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Spacebar: toggle voice listening (only when not focused on input)
      if (e.code === "Space" && document.activeElement === document.body) {
        e.preventDefault();
        if (orbState === "idle" || orbState === "confirming") {
          startListening();
        } else if (orbState === "listening") {
          stopListening();
        }
      }

      // ESC: stop audio, listening, or cancel confirmation
      if (e.code === "Escape") {
        e.preventDefault();
        if (orbState === "listening") {
          stopListening();
        } else if (orbState === "speaking") {
          stopAudio();
        } else if (awaitingConfirmation) {
          setAwaitingConfirmation(null);
          setOrbState("idle");
          showStatus("Cancelled");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    orbState,
    awaitingConfirmation,
    startListening,
    stopListening,
    stopAudio,
    showStatus,
  ]);

  // Sign out
  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push("/");
    router.refresh();
  }, [router]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hidden audio element */}
      <audio ref={audioRef} className="hidden" />

      {/* Collapsible Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            />
            {/* Sidebar Panel */}
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-0 left-0 z-50 h-full w-72 bg-white dark:bg-neutral-900 border-r border-black/10 dark:border-white/10 shadow-2xl"
            >
              <div className="flex items-center justify-between p-4 border-b border-black/10 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <VoxPilotLogo size={28} />
                  <span className="font-semibold text-foreground">
                    VoxPilot
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(false)}
                >
                  <IconX size={20} />
                </Button>
              </div>
              <ScrollArea className="h-[calc(100%-65px)]">
                <div className="p-4">
                  {/* Voice Commands Section */}
                  <div className="mb-6">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                      <IconMicrophone size={16} />
                      Voice Commands
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Say these to control VoxPilot
                    </p>
                    <div className="space-y-2">
                      {[
                        {
                          cmd: "Summarize this video",
                          desc: "Analyze pasted URL",
                        },
                        {
                          cmd: "Save this video",
                          desc: "Save to your library",
                        },
                        {
                          cmd: "Delete this video",
                          desc: "Remove from library",
                        },
                        { cmd: "Read the summary", desc: "Hear summary aloud" },
                        { cmd: "Switch to dark mode", desc: "Toggle theme" },
                      ].map((item, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5"
                        >
                          <p className="text-sm font-medium text-foreground">
                            &quot;{item.cmd}&quot;
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator className="my-4" />
                  {/* Future sections can be added here */}
                </div>
              </ScrollArea>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-black/10 dark:border-white/10 bg-white/80 dark:bg-black/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Hamburger + Logo */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                title="Open menu"
              >
                <svg
                  width={20}
                  height={20}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="4" x2="20" y1="6" y2="6" />
                  <line x1="4" x2="20" y1="12" y2="12" />
                  <line x1="4" x2="20" y1="18" y2="18" />
                </svg>
              </Button>
              <VoxPilotLogo size={32} />
              <span className="text-lg font-semibold text-foreground">
                VoxPilot
              </span>
              <Badge variant="secondary" className="text-xs">
                Knowledge Base
              </Badge>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-4">
              <ModeToggle />
              {user && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground hidden sm:block">
                    {user.email}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSignOut}
                    title="Sign out"
                  >
                    <IconLogout size={18} />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search/Input Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="relative max-w-3xl mx-auto">
            <div className="flex items-center gap-3 p-2 rounded-2xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] shadow-lg backdrop-blur-xl">
              <div className="flex-1 flex items-center gap-3 px-4">
                <IconYoutube size={24} className="text-red-500 flex-shrink-0" />
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Paste a YouTube URL or ask a question..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAnalyze(inputValue);
                    }
                  }}
                  className="border-0 bg-transparent focus-visible:ring-0 text-lg placeholder:text-muted-foreground/50"
                  disabled={isAnalyzing}
                />
              </div>
              <Button
                variant="glow"
                size="default"
                onClick={() => handleAnalyze(inputValue)}
                disabled={isAnalyzing || !inputValue.trim()}
                className="px-4 h-9"
              >
                {isAnalyzing ? (
                  <IconLoader size={16} className="animate-spin" />
                ) : (
                  <IconSearch size={16} />
                )}
                <span className="hidden sm:inline">Analyze</span>
              </Button>

              {/* Voice Input Button */}
              <Button
                variant={
                  orbState === "listening"
                    ? "default"
                    : orbState === "confirming"
                    ? "destructive"
                    : "outline"
                }
                size="lg"
                onClick={orbState === "speaking" ? stopAudio : toggleListening}
                disabled={orbState === "processing" || isAnalyzing}
                className={cn(
                  "px-4",
                  orbState === "listening" && "bg-primary",
                  orbState === "speaking" && "bg-green-500 hover:bg-green-600"
                )}
                title={
                  orbState === "idle"
                    ? "Click to speak"
                    : orbState === "listening"
                    ? "Stop listening"
                    : ""
                }
              >
                {orbState === "listening" ? (
                  <IconMicrophoneOff size={20} />
                ) : orbState === "processing" && !isAnalyzing ? (
                  <IconLoader size={20} className="animate-spin" />
                ) : orbState === "speaking" ? (
                  <IconX size={20} />
                ) : orbState === "confirming" ? (
                  <IconMicrophoneOff size={20} />
                ) : (
                  <IconMicrophone size={20} />
                )}
              </Button>
            </div>

            {/* Voice state and transcript display */}
            <AnimatePresence>
              {(orbState !== "idle" || transcript) && !isAnalyzing && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className={cn(
                    "mt-3 p-3 rounded-xl border backdrop-blur-sm origin-top",
                    orbState === "confirming" && awaitingConfirmation
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-white/90 dark:bg-neutral-900/90 border-black/10 dark:border-white/10"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {orbState === "listening" && (
                      <>
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-sm font-medium text-foreground">
                          Listening...
                        </span>
                      </>
                    )}
                    {orbState === "processing" && (
                      <>
                        <IconLoader
                          size={14}
                          className="animate-spin text-muted-foreground"
                        />
                        <span className="text-sm text-muted-foreground">
                          Processing...
                        </span>
                      </>
                    )}
                    {orbState === "speaking" && (
                      <>
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-sm font-medium text-green-600 dark:text-green-400">
                          Speaking...
                        </span>
                      </>
                    )}
                    {orbState === "confirming" && awaitingConfirmation && (
                      <>
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-sm font-medium text-red-600 dark:text-red-400">
                          Say YES or NO
                        </span>
                      </>
                    )}
                  </div>
                  {transcript && (
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="text-foreground/70">Heard:</span>{" "}
                      {transcript}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Status message */}
          <AnimatePresence>
            {statusMessage && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="text-center mt-4 text-sm text-muted-foreground"
              >
                {statusMessage}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Content Area */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Panel - Video & Summary */}
          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              {currentVideo ? (
                <motion.div
                  key="video-panel"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  {/* YouTube Embed */}
                  <Card className="overflow-hidden border-black/10 dark:border-white/10">
                    <div className="aspect-video bg-black">
                      <iframe
                        src={`https://www.youtube.com/embed/${currentVideo.videoId}`}
                        title="YouTube video player"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full"
                      />
                    </div>
                  </Card>

                  {/* Summary Card */}
                  <Card className="border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03]">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <CardTitle className="text-xl mb-1">
                            {currentVideo.summary.title}
                          </CardTitle>
                          <CardDescription className="mt-0">
                            AI-generated summary
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              currentVideo.summary.confidence === "transcript"
                                ? "default"
                                : "secondary"
                            }
                            className="h-8 px-3"
                          >
                            {currentVideo.summary.confidence === "transcript"
                              ? "Full"
                              : "Inferred"}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleReadSummary(currentVideo.summary)
                            }
                            disabled={orbState !== "idle"}
                            title="Read summary aloud"
                          >
                            <IconVolume size={16} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleSave}
                            disabled={isAnalyzing}
                            title="Save to library"
                          >
                            <IconBookmark size={16} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentVideo(null)}
                            title="Close"
                          >
                            <IconX size={16} />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Key Takeaways */}
                      <div>
                        <h4 className="text-sm font-semibold text-foreground mb-2">
                          Key Takeaways
                        </h4>
                        <ul className="space-y-2">
                          {currentVideo.summary.keyTakeaways.map(
                            (takeaway, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-sm text-muted-foreground"
                              >
                                <IconCheck
                                  size={16}
                                  className="text-green-500 mt-0.5 flex-shrink-0"
                                />
                                {takeaway}
                              </li>
                            )
                          )}
                        </ul>
                      </div>

                      <Separator className="bg-black/5 dark:bg-white/5" />

                      {/* Abstract */}
                      <div>
                        <h4 className="text-sm font-semibold text-foreground mb-2">
                          Abstract
                        </h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {currentVideo.summary.abstract}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                <motion.div
                  key="empty-state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center min-h-[400px] text-center"
                >
                  <div className="w-20 h-20 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-6">
                    <IconYoutube size={40} className="text-red-500" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Analyze YouTube Videos
                  </h3>
                  <p className="text-muted-foreground max-w-md">
                    Paste a YouTube URL above or use voice commands to extract
                    key insights, summaries, and takeaways from any video.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sidebar - Saved Videos */}
          <div className="lg:col-span-1 lg:self-start lg:sticky lg:top-24">
            <Card className="border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03]">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <IconBookmark size={18} />
                  Saved Videos
                </CardTitle>
                <CardDescription>Your video knowledge library</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingSaved ? (
                  <div className="flex items-center justify-center py-8">
                    <IconLoader
                      size={24}
                      className="animate-spin text-muted-foreground"
                    />
                  </div>
                ) : savedVideos.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">
                      No saved videos yet. Analyze a video and save it!
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-3">
                      {savedVideos.map((video) => (
                        <motion.div
                          key={video.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="group"
                        >
                          <div
                            className="p-3 rounded-xl border border-black/5 dark:border-white/5 bg-white/50 dark:bg-white/[0.02] hover:bg-white/80 dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
                            onClick={() => handleLoadSaved(video)}
                          >
                            {/* Thumbnail */}
                            <div className="relative aspect-video rounded-lg overflow-hidden mb-3 bg-neutral-200 dark:bg-neutral-800">
                              <img
                                src={video.thumbnail_url}
                                alt={video.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (
                                    e.target as HTMLImageElement
                                  ).src = `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`;
                                }}
                              />
                            </div>

                            {/* Info */}
                            <h4 className="text-sm font-medium text-foreground line-clamp-2 mb-1">
                              {video.title}
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              {new Date(video.created_at).toLocaleDateString()}
                            </p>

                            {/* Actions */}
                            <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(video.url, "_blank");
                                }}
                                title="Open in YouTube"
                              >
                                <IconExternalLink size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleReadSummary(video.summary_json);
                                }}
                                title="Read summary"
                              >
                                <IconVolume size={14} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVideoToDelete(video);
                                  setDeleteDialogOpen(true);
                                }}
                                title="Delete"
                              >
                                <IconTrash size={14} />
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Video</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{videoToDelete?.title}&quot;
              from your library? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
