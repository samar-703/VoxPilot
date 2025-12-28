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
  confirmationText,
  onClick,
  disabled,
}: VoiceOrbProps) {
  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-3">
      {/* Confirmation bubble - only show for confirming state */}
      <AnimatePresence>
        {state === "confirming" && confirmationText && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="max-w-xs rounded-xl border border-red-500/50 bg-red-950/90 px-4 py-3 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 mb-2 text-red-400">
              <IconAlertTriangle size={16} />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Confirmation Required
              </span>
            </div>
            <p className="text-sm text-red-200">{confirmationText}</p>
            <p className="text-xs text-red-400/70 mt-2">
              Say &quot;Yes&quot; to confirm or &quot;No&quot; to cancel
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status text - near the orb */}
      <AnimatePresence>
        {state !== "idle" && state !== "confirming" && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            className="px-3 py-1.5 rounded-lg bg-neutral-900/90 border border-neutral-800 backdrop-blur-sm"
          >
            <span className="text-xs text-neutral-300">
              {state === "listening" && "Listening..."}
              {state === "processing" && "Processing..."}
              {state === "speaking" && "Speaking..."}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Orb Container */}
      <div className="relative">
        {/* Outer glow rings for listening state */}
        {state === "listening" && (
          <>
            <motion.div
              className="absolute inset-[-20px] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)",
              }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <motion.div
              className="absolute inset-[-12px] rounded-full border border-purple-500/30"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.2,
              }}
            />
            <motion.div
              className="absolute inset-[-6px] rounded-full border border-violet-400/40"
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.4, 0.8, 0.4],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.4,
              }}
            />
          </>
        )}

        {/* Confirming glow */}
        {state === "confirming" && (
          <motion.div
            className="absolute inset-[-15px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(239,68,68,0.2) 0%, transparent 70%)",
            }}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}

        {/* Speaking glow */}
        {state === "speaking" && (
          <motion.div
            className="absolute inset-[-10px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(34,197,94,0.2) 0%, transparent 70%)",
            }}
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}

        {/* Orb Button */}
        <motion.button
          onClick={onClick}
          disabled={disabled || state === "processing"}
          whileTap={{ scale: 0.92 }}
          animate={
            state === "listening"
              ? {
                  scale: [1, 1.08, 1],
                  boxShadow: [
                    "0 0 20px 5px rgba(139,92,246,0.4), 0 0 40px 10px rgba(168,85,247,0.2)",
                    "0 0 30px 10px rgba(168,85,247,0.6), 0 0 60px 20px rgba(192,132,252,0.3)",
                    "0 0 20px 5px rgba(139,92,246,0.4), 0 0 40px 10px rgba(168,85,247,0.2)",
                  ],
                }
              : state === "confirming"
              ? {
                  scale: [1, 1.05, 1],
                  boxShadow: [
                    "0 0 15px 5px rgba(239,68,68,0.3)",
                    "0 0 25px 10px rgba(239,68,68,0.5)",
                    "0 0 15px 5px rgba(239,68,68,0.3)",
                  ],
                }
              : state === "speaking"
              ? {
                  scale: [1, 1.03, 1],
                }
              : {}
          }
          transition={{
            duration: state === "listening" ? 1.5 : 1,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className={cn(
            "relative w-16 h-16 rounded-full border-2 transition-colors duration-300 flex items-center justify-center overflow-hidden",
            state === "idle" &&
              "bg-neutral-900 border-neutral-700 hover:border-violet-500/50 hover:bg-neutral-800",
            state === "listening" &&
              "bg-gradient-to-br from-violet-950 via-purple-950 to-indigo-950 border-purple-500",
            state === "processing" && "bg-neutral-900 border-neutral-500",
            state === "speaking" &&
              "bg-gradient-to-br from-green-950 to-emerald-950 border-green-500",
            state === "confirming" &&
              "bg-gradient-to-br from-red-950 to-rose-950 border-red-500",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {/* Inner gradient overlay for listening */}
          {state === "listening" && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "linear-gradient(135deg, rgba(168,85,247,0.3) 0%, rgba(139,92,246,0.1) 50%, rgba(99,102,241,0.3) 100%)",
              }}
              animate={{
                rotate: [0, 360],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          )}

          {/* Particle effects for listening */}
          {state === "listening" && (
            <div className="absolute inset-0 rounded-full overflow-hidden">
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 rounded-full bg-purple-400/60"
                  style={{
                    left: "50%",
                    top: "50%",
                  }}
                  animate={{
                    x: [0, Math.cos((i * 60 * Math.PI) / 180) * 25],
                    y: [0, Math.sin((i * 60 * Math.PI) / 180) * 25],
                    opacity: [0, 1, 0],
                    scale: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: "easeOut",
                  }}
                />
              ))}
            </div>
          )}

          {/* Icon */}
          <span
            className={cn(
              "relative z-10 transition-colors duration-300",
              state === "idle" && "text-neutral-400",
              state === "listening" && "text-purple-300",
              state === "processing" && "text-neutral-400",
              state === "speaking" && "text-green-400",
              state === "confirming" && "text-red-400"
            )}
          >
            {state === "listening" ? (
              <IconMicrophoneOff size={24} />
            ) : (
              <IconMicrophone size={24} />
            )}
          </span>

          {/* Processing spinner */}
          {state === "processing" && (
            <motion.div
              className="absolute inset-0"
              animate={{ rotate: 360 }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              <svg className="w-full h-full" viewBox="0 0 64 64">
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke="url(#processingGradient)"
                  strokeWidth="2"
                  strokeDasharray="60 140"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient
                    id="processingGradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
              </svg>
            </motion.div>
          )}

          {/* Speaking waveform */}
          {state === "speaking" && (
            <div className="absolute inset-0 flex items-center justify-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <motion.span
                  key={i}
                  className="w-0.5 bg-green-400 rounded-full"
                  animate={{
                    height: [8, 18, 8],
                  }}
                  transition={{
                    duration: 0.4,
                    repeat: Infinity,
                    delay: i * 0.08,
                  }}
                />
              ))}
            </div>
          )}
        </motion.button>
      </div>

      {/* State label */}
      <span className="text-[10px] uppercase tracking-wider text-neutral-600">
        {state === "idle" && "Click to speak"}
        {state === "listening" && "Listening"}
        {state === "processing" && "Processing"}
        {state === "speaking" && "Speaking"}
        {state === "confirming" && "Say Yes or No"}
      </span>
    </div>
  );
}
