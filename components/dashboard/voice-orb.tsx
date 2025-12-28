"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  IconMicrophone,
  IconMicrophoneOff,
  IconAlertTriangle,
} from "@/components/icons";

export type OrbState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "confirming";

interface VoiceOrbProps {
  state: OrbState;
  transcript?: string;
  confirmationText?: string;
  onClick: () => void;
  disabled?: boolean;
}

export function VoiceOrb({
  state,
  transcript,
  confirmationText,
  onClick,
  disabled,
}: VoiceOrbProps) {
  const stateStyles: Record<OrbState, string> = {
    idle: "bg-neutral-900 border-neutral-700 hover:border-neutral-600",
    listening: "bg-blue-950 border-blue-500 animate-orb-listening",
    processing: "bg-neutral-900 border-neutral-500 animate-orb-processing",
    speaking: "bg-green-950 border-green-500 animate-orb-speaking",
    confirming: "bg-red-950 border-red-500 animate-card-critical",
  };

  const glowStyles: Record<OrbState, string> = {
    idle: "",
    listening: "shadow-[0_0_30px_rgba(59,130,246,0.3)]",
    processing: "shadow-[0_0_20px_rgba(255,255,255,0.1)]",
    speaking: "shadow-[0_0_30px_rgba(34,197,94,0.3)]",
    confirming: "shadow-[0_0_40px_rgba(239,68,68,0.4)]",
  };

  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-4">
      {/* Transcript/Status Bubble */}
      <AnimatePresence>
        {(transcript || confirmationText || state !== "idle") && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={cn(
              "max-w-xs rounded-xl border px-4 py-3 backdrop-blur-sm",
              state === "confirming"
                ? "border-red-500/50 bg-red-950/90"
                : "border-neutral-800 bg-neutral-900/90"
            )}
          >
            {state === "confirming" && (
              <div className="flex items-center gap-2 mb-2 text-red-400">
                <IconAlertTriangle size={16} />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Confirmation Required
                </span>
              </div>
            )}
            <p
              className={cn(
                "text-sm",
                state === "confirming" ? "text-red-200" : "text-neutral-300"
              )}
            >
              {confirmationText || transcript || getStateText(state)}
            </p>
            {state === "confirming" && (
              <p className="text-xs text-red-400/70 mt-2">
                Say &quot;Yes&quot; to confirm or &quot;No&quot; to cancel
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Orb Button */}
      <motion.button
        onClick={onClick}
        disabled={disabled || state === "processing"}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "relative w-16 h-16 rounded-full border-2 transition-all duration-300 flex items-center justify-center",
          stateStyles[state],
          glowStyles[state],
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {/* Pulse rings */}
        {state === "listening" && (
          <>
            <span className="absolute inset-0 rounded-full border border-blue-500/50 animate-ping" />
            <span className="absolute inset-[-8px] rounded-full border border-blue-500/20 animate-pulse" />
          </>
        )}

        {state === "confirming" && (
          <>
            <span className="absolute inset-0 rounded-full border border-red-500/50 animate-ping" />
            <span className="absolute inset-[-8px] rounded-full border border-red-500/20 animate-pulse" />
          </>
        )}

        {/* Icon */}
        <span
          className={cn(
            "relative z-10 transition-colors",
            state === "idle" && "text-neutral-400",
            state === "listening" && "text-blue-400",
            state === "processing" && "text-neutral-400",
            state === "speaking" && "text-green-400",
            state === "confirming" && "text-red-400"
          )}
        >
          {state === "listening" || state === "confirming" ? (
            <IconMicrophoneOff size={24} />
          ) : (
            <IconMicrophone size={24} />
          )}
        </span>

        {/* Processing spinner */}
        {state === "processing" && (
          <svg
            className="absolute inset-0 w-full h-full animate-spin"
            viewBox="0 0 64 64"
          >
            <circle
              cx="32"
              cy="32"
              r="30"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="60 140"
              className="text-neutral-600"
            />
          </svg>
        )}

        {/* Speaking waveform */}
        {state === "speaking" && (
          <div className="absolute inset-0 flex items-center justify-center gap-0.5">
            {[...Array(5)].map((_, i) => (
              <motion.span
                key={i}
                className="w-0.5 bg-green-400 rounded-full"
                animate={{
                  height: [8, 16 + Math.random() * 8, 8],
                }}
                transition={{
                  duration: 0.4,
                  repeat: Infinity,
                  delay: i * 0.1,
                }}
              />
            ))}
          </div>
        )}
      </motion.button>

      {/* State label */}
      <span className="text-[10px] uppercase tracking-wider text-neutral-600">
        {getStateLabel(state)}
      </span>
    </div>
  );
}

function getStateText(state: OrbState): string {
  switch (state) {
    case "listening":
      return "Listening...";
    case "processing":
      return "Processing command...";
    case "speaking":
      return "Speaking...";
    default:
      return "";
  }
}

function getStateLabel(state: OrbState): string {
  switch (state) {
    case "idle":
      return "Click to speak";
    case "listening":
      return "Listening";
    case "processing":
      return "Processing";
    case "speaking":
      return "Speaking";
    case "confirming":
      return "Awaiting confirmation";
    default:
      return "";
  }
}
