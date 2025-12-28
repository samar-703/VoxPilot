"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { IconRefresh } from "@/components/icons";

export type ServiceStatus = "healthy" | "critical" | "warning" | "restarting";

interface HealthCardProps {
  name: string;
  icon: React.ReactNode;
  status: ServiceStatus;
  cpu: number;
  memory: number;
  latency: number;
  isFlashing?: boolean;
  onClick?: () => void;
}

export function HealthCard({
  name,
  icon,
  status,
  cpu,
  memory,
  latency,
  isFlashing,
  onClick,
}: HealthCardProps) {
  const statusColors: Record<ServiceStatus, string> = {
    healthy: "border-green-500/30 bg-green-500/5",
    critical: "border-red-500/50 bg-red-500/5 animate-card-critical",
    warning: "border-amber-500/30 bg-amber-500/5",
    restarting: "border-blue-500/30 bg-blue-500/5",
  };

  const statusBadge: Record<
    ServiceStatus,
    "success" | "destructive" | "warning" | "secondary"
  > = {
    healthy: "success",
    critical: "destructive",
    warning: "warning",
    restarting: "secondary",
  };

  const iconColors: Record<ServiceStatus, string> = {
    healthy: "text-green-500",
    critical: "text-red-500",
    warning: "text-amber-500",
    restarting: "text-blue-500",
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative rounded-xl border p-5 transition-all duration-300 cursor-pointer hover:bg-neutral-900/50",
        statusColors[status],
        isFlashing && "animate-card-success-flash"
      )}
      onClick={onClick}
    >
      {/* Status indicator pulse */}
      {status === "critical" && (
        <div className="absolute top-4 right-4">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
        </div>
      )}

      <div className="flex items-start justify-between mb-4">
        <div
          className={cn("p-2 rounded-lg bg-neutral-900", iconColors[status])}
        >
          {status === "restarting" ? (
            <IconRefresh size={20} className="animate-spin" />
          ) : (
            icon
          )}
        </div>
        <Badge variant={statusBadge[status]}>
          {status === "restarting"
            ? "Restarting..."
            : status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      </div>

      <h3 className="font-semibold text-white mb-1">{name}</h3>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <MetricItem label="CPU" value={`${cpu}%`} critical={cpu > 80} />
        <MetricItem label="MEM" value={`${memory}%`} critical={memory > 80} />
        <MetricItem label="P95" value={`${latency}ms`} />
      </div>
    </motion.div>
  );
}

function MetricItem({
  label,
  value,
  critical,
}: {
  label: string;
  value: string;
  critical?: boolean;
}) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-wider text-neutral-600">
        {label}
      </span>
      <p
        className={cn(
          "text-sm font-mono",
          critical ? "text-red-400" : "text-neutral-300"
        )}
      >
        {value}
      </p>
    </div>
  );
}
