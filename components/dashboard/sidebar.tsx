"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  VoxPilotLogo,
  IconHome,
  IconServer,
  IconActivity,
  IconTerminal,
  IconSettings,
} from "@/components/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

const navItems = [
  { href: "/dashboard", icon: IconHome, label: "Dashboard" },
  { href: "/dashboard/services", icon: IconServer, label: "Services" },
  { href: "/dashboard/monitoring", icon: IconActivity, label: "Monitoring" },
  { href: "/dashboard/logs", icon: IconTerminal, label: "Logs" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="fixed left-0 top-0 z-40 h-screen w-16 border-r border-neutral-900 bg-black flex flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-center border-b border-neutral-900">
          <Link
            href="/"
            className="text-white hover:opacity-80 transition-opacity"
          >
            <VoxPilotLogo size={28} />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col items-center gap-2 py-4">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-neutral-800 text-white"
                        : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
                    )}
                  >
                    <Icon size={20} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Settings */}
        <div className="flex flex-col items-center gap-2 py-4 border-t border-neutral-900">
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300 transition-all duration-200">
                <IconSettings size={20} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
