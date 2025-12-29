"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  processYoutubeLink,
  analyzeCommand,
  saveContent,
  getSavedContent,
  deleteContent,
  readSummaryAloud,
  signOut,
  getUser,
  type VideoSummary,
  type SavedContent,
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
type OrbState = "idle" | "listening" | "processing" | "speaking";

export default function DashboardPage() {
  const router = useRouter();

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
  } | null>(null);
  const [savedVideos, setSavedVideos] = useState<SavedContent[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);

  // Voice state
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [transcript, setTranscript] = useState("");

  // UI state
  const [statusMessage, setStatusMessage] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<SavedContent | null>(null);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch user and saved content on mount
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

  // Show status message
  const showStatus = useCallback((message: string, duration = 3000) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(""), duration);
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

  // Handle URL or voice input
  const handleAnalyze = useCallback(
    async (input: string) => {
      if (!input.trim()) return;

      setIsAnalyzing(true);
      setOrbState("processing");
      showStatus("Analyzing...");

      try {
        // Check if it's a YouTube URL
        const isUrl = input.match(/(youtube\.com|youtu\.be)/i);

        if (isUrl) {
          const result = await processYoutubeLink(input);

          if (result.success && result.summary) {
            const videoId = input.match(
              /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
            )?.[1];

            setCurrentVideo({
              url: input,
              videoId: videoId || "",
              summary: result.summary,
            });
            showStatus("Video analyzed successfully!");
          } else {
            showStatus(result.message);
          }
        } else {
          // Treat as voice command or question
          const result = await analyzeCommand(input);

          if (result.success) {
            showStatus(result.message);

            if (result.audio) {
              playAudio(result.audio);
            }

            // Handle specific intents
            if (result.analysis?.intent === "list") {
              const saved = await getSavedContent();
              setSavedVideos(saved);
            }
          } else {
            showStatus(result.message);
          }
        }
      } catch (error) {
        console.error("Analysis error:", error);
        showStatus("An error occurred. Please try again.");
      } finally {
        setIsAnalyzing(false);
        setOrbState("idle");
        setInputValue("");
      }
    },
    [showStatus, playAudio]
  );

  // Save current video
  const handleSave = useCallback(async () => {
    if (!currentVideo) return;

    setIsAnalyzing(true);
    showStatus("Saving...");

    try {
      const result = await saveContent(
        currentVideo.url,
        currentVideo.videoId,
        currentVideo.summary
      );

      if (result.success) {
        showStatus("Video saved to your library!");
        const saved = await getSavedContent();
        setSavedVideos(saved);
      } else {
        showStatus(result.message);
      }
    } catch (error) {
      console.error("Save error:", error);
      showStatus("Failed to save video.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [currentVideo, showStatus]);

  // Delete video
  const handleDelete = useCallback(async () => {
    if (!videoToDelete) return;

    try {
      const result = await deleteContent(videoToDelete.id);

      if (result.success) {
        setSavedVideos((prev) => prev.filter((v) => v.id !== videoToDelete.id));
        showStatus("Video deleted.");
      } else {
        showStatus(result.message);
      }
    } catch (error) {
      console.error("Delete error:", error);
      showStatus("Failed to delete video.");
    } finally {
      setDeleteDialogOpen(false);
      setVideoToDelete(null);
    }
  }, [videoToDelete, showStatus]);

  // Read summary aloud
  const handleReadSummary = useCallback(
    async (summary: VideoSummary) => {
      setOrbState("processing");
      showStatus("Generating audio...");

      try {
        const result = await readSummaryAloud(summary);

        if (result.audio) {
          playAudio(result.audio);
          showStatus("Reading summary...");
        } else {
          showStatus("Audio generation failed. Check ElevenLabs API key.");
        }
      } catch (error) {
        console.error("Read aloud error:", error);
        showStatus("Failed to read summary.");
      }
    },
    [showStatus, playAudio]
  );

  // Load saved video into view
  const handleLoadSaved = useCallback((saved: SavedContent) => {
    setCurrentVideo({
      url: saved.url,
      videoId: saved.video_id,
      summary: saved.summary_json,
    });
  }, []);

  // Voice recognition
  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showStatus("Speech recognition not supported in this browser.");
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
      setOrbState("listening");
      setTranscript("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript;
      setTranscript(text);

      if (result.isFinal) {
        handleAnalyze(text);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      setOrbState("idle");
      if (event.error !== "aborted") {
        showStatus("Voice recognition error. Please try again.");
      }
    };

    recognition.onend = () => {
      if (orbState === "listening") {
        setOrbState("idle");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [handleAnalyze, showStatus, orbState]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setOrbState("idle");
  }, []);

  const toggleListening = useCallback(() => {
    if (orbState === "listening") {
      stopListening();
    } else if (orbState === "idle") {
      startListening();
    }
  }, [orbState, startListening, stopListening]);

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

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-black/10 dark:border-white/10 bg-white/80 dark:bg-black/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
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
                size="lg"
                onClick={() => handleAnalyze(inputValue)}
                disabled={isAnalyzing || !inputValue.trim()}
                className="px-6"
              >
                {isAnalyzing ? (
                  <IconLoader size={20} className="animate-spin" />
                ) : (
                  <IconSearch size={20} />
                )}
                <span className="ml-2 hidden sm:inline">Analyze</span>
              </Button>
            </div>

            {/* Transcript display */}
            <AnimatePresence>
              {transcript && orbState === "listening" && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full mt-2 left-0 right-0 p-3 rounded-xl bg-white/90 dark:bg-neutral-900/90 border border-black/10 dark:border-white/10 backdrop-blur-sm"
                >
                  <p className="text-sm text-muted-foreground">
                    <span className="text-foreground font-medium">
                      Hearing:
                    </span>{" "}
                    {transcript}
                  </p>
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
                          <CardTitle className="text-xl">
                            {currentVideo.summary.title}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            AI-generated summary
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
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
          <div className="lg:col-span-1">
            <Card className="border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] h-full">
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

      {/* Voice Orb */}
      <div className="fixed bottom-8 right-8 z-50">
        <div className="relative">
          {/* Listening rings */}
          {orbState === "listening" && (
            <>
              <motion.div
                className="absolute inset-[-20px] rounded-full bg-primary/20"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.5, 0.2, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              <motion.div
                className="absolute inset-[-10px] rounded-full border-2 border-primary/30"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </>
          )}

          {/* Processing spinner */}
          {orbState === "processing" && (
            <motion.div
              className="absolute inset-[-8px] rounded-full border-2 border-primary/50 border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          )}

          {/* Speaking waves */}
          {orbState === "speaking" && (
            <motion.div
              className="absolute inset-[-12px] rounded-full border-2 border-green-500/50"
              animate={{
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 0.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}

          {/* Main button */}
          <Button
            variant="glow"
            size="icon"
            className={cn(
              "w-14 h-14 rounded-full transition-all duration-300",
              orbState === "listening" && "bg-primary hover:bg-primary",
              orbState === "speaking" && "bg-green-500 hover:bg-green-600"
            )}
            onClick={toggleListening}
            disabled={orbState === "processing" || orbState === "speaking"}
          >
            {orbState === "listening" ? (
              <IconMicrophoneOff size={24} />
            ) : orbState === "processing" ? (
              <IconLoader size={24} className="animate-spin" />
            ) : (
              <IconMicrophone size={24} />
            )}
          </Button>
        </div>

        {/* State label */}
        <AnimatePresence>
          {orbState !== "idle" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 rounded-full bg-black/80 dark:bg-white/10 text-white text-xs backdrop-blur-sm"
            >
              {orbState === "listening" && "Listening..."}
              {orbState === "processing" && "Processing..."}
              {orbState === "speaking" && "Speaking..."}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
