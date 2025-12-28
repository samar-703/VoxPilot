"use client";

import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";
import { IconTerminal, IconZap } from "@/components/icons";

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: "user" | "system" | "action" | "error" | "warning" | "success";
  message: string;
}

interface TerminalLogsProps {
  logs: LogEntry[];
}

export function TerminalLogs({ logs }: TerminalLogsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const typeStyles: Record<
    LogEntry["type"],
    { prefix: string; color: string }
  > = {
    user: { prefix: "USR", color: "text-blue-400" },
    system: { prefix: "SYS", color: "text-neutral-400" },
    action: { prefix: "ACT", color: "text-purple-400" },
    error: { prefix: "ERR", color: "text-red-400" },
    warning: { prefix: "WRN", color: "text-amber-400" },
    success: { prefix: "OK!", color: "text-green-400" },
  };

  return (
    <div className="rounded-xl border border-neutral-900 bg-black overflow-hidden">
      {/* Terminal Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-900 bg-neutral-950">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/80" />
          <span className="w-3 h-3 rounded-full bg-amber-500/80" />
          <span className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="flex items-center gap-2 text-neutral-500">
          <IconTerminal size={14} />
          <span className="text-xs font-mono">voxpilot-mission-log</span>
        </div>
      </div>

      {/* Terminal Content */}
      <div
        ref={scrollContainerRef}
        className="h-[280px] overflow-y-auto custom-scrollbar"
      >
        <div className="p-4 font-mono text-xs space-y-1.5">
          {logs.map((log, index) => {
            const style = typeStyles[log.type];
            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.02 }}
                className="flex gap-3"
              >
                <span className="text-neutral-700 shrink-0">
                  {formatTime(log.timestamp)}
                </span>
                <span className={cn("shrink-0", style.color)}>
                  [{style.prefix}]
                </span>
                <span
                  className={cn(
                    log.type === "error"
                      ? "text-red-300"
                      : log.type === "success"
                      ? "text-green-300"
                      : log.type === "warning"
                      ? "text-amber-300"
                      : log.type === "user"
                      ? "text-blue-300"
                      : "text-neutral-300"
                  )}
                >
                  {log.message}
                </span>
              </motion.div>
            );
          })}

          {/* Cursor line */}
          <div className="flex items-center gap-2 text-neutral-600">
            <IconZap size={12} />
            <span className="animate-pulse">_</span>
          </div>
        </div>
      </div>
    </div>
  );
}
