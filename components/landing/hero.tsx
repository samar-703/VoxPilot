"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import {
  VoxPilotLogo,
  IconArrowRight,
  IconWaveform,
  IconShield,
  IconZap,
} from "@/components/icons";

export function LandingHero() {
  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-foreground/[0.02] rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-foreground/[0.02] rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-muted/50 via-background to-background" />

        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(hsl(var(--foreground) / 0.1) 1px, transparent 1px),
                             linear-gradient(90deg, hsl(var(--foreground) / 0.1) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 lg:px-12">
        <div className="flex items-center gap-3">
          <VoxPilotLogo size={36} className="text-foreground" />
          <span className="text-lg font-semibold tracking-tight text-foreground">
            VoxPilot
          </span>
        </div>
        <nav className="hidden md:flex items-center gap-8">
          <a
            href="#features"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </a>
          <a
            href="#demo"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Demo
          </a>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              Dashboard
            </Button>
          </Link>
          <ModeToggle />
        </nav>
      </header>

      {/* Hero Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6"
        >
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-muted/50 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Voice-Powered Infrastructure Control
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight max-w-4xl text-foreground"
        >
          Control Your Infrastructure
          <br />
          <span className="text-muted-foreground">With Your Voice</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 text-lg text-muted-foreground max-w-2xl"
        >
          VoxPilot is an AI-powered SRE mission control that understands natural
          language commands. Speak to scale services, restart containers, and
          manage infrastructure with safety confirmations built in.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex flex-col sm:flex-row items-center gap-4"
        >
          <Link href="/dashboard">
            <Button variant="glow" size="xl" className="group">
              Launch Mission Control
              <IconArrowRight
                size={18}
                className="transition-transform group-hover:translate-x-1"
              />
            </Button>
          </Link>
          <Button variant="outline" size="xl">
            View Demo
          </Button>
        </motion.div>

        {/* Voice Visualization */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-16 relative isolate contain-layout contain-paint"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
          <div className="flex items-center gap-1 px-8 py-6 rounded-2xl border border-border bg-muted/30 backdrop-blur-sm">
            <VoiceWaveformBars />
            <span className="ml-4 text-sm text-muted-foreground font-mono">
              &quot;Restart payment service&quot;
            </span>
          </div>
        </motion.div>
      </main>

      {/* Features Section */}
      <section id="features" className="relative z-10 py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
              Built for SRE Teams
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Designed with safety-first principles and natural voice
              interaction
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<IconWaveform size={24} />}
              title="Natural Voice Commands"
              description="Speak naturally to control infrastructure. VoxPilot understands context and intent using Gemini 2.0."
              delay={0}
            />
            <FeatureCard
              icon={<IconShield size={24} />}
              title="Safety Confirmations"
              description="Destructive actions require verbal confirmation. Hear the warning, say 'Yes' to proceed."
              delay={0.1}
            />
            <FeatureCard
              icon={<IconZap size={24} />}
              title="Real-time Feedback"
              description="ElevenLabs voice responses confirm every action with natural, human-like speech."
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <VoxPilotLogo size={20} />
            <span>VoxPilot</span>
            <span className="text-border">•</span>
            <span>Built for ElevenLabs x Google Cloud Hackathon</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">
              GitHub
            </a>
            <a href="#" className="hover:text-foreground transition-colors">
              Documentation
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay }}
      className="p-6 rounded-xl border border-border bg-muted/30 hover:bg-muted/50 transition-colors group"
    >
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-4 text-muted-foreground group-hover:text-foreground transition-colors">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2 text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </motion.div>
  );
}

// Pre-computed animation configs for smooth, consistent animation
const WAVEFORM_BARS = [
  { scale: 2.5, duration: 0.9, delay: 0 },
  { scale: 3.2, duration: 1.1, delay: 0.05 },
  { scale: 2.8, duration: 0.85, delay: 0.1 },
  { scale: 3.5, duration: 1.0, delay: 0.15 },
  { scale: 2.2, duration: 0.95, delay: 0.2 },
  { scale: 3.8, duration: 1.05, delay: 0.25 },
  { scale: 2.6, duration: 0.88, delay: 0.3 },
  { scale: 3.0, duration: 1.12, delay: 0.35 },
  { scale: 2.4, duration: 0.92, delay: 0.4 },
  { scale: 3.3, duration: 1.08, delay: 0.45 },
  { scale: 2.7, duration: 0.87, delay: 0.5 },
  { scale: 3.1, duration: 0.98, delay: 0.55 },
];

function VoiceWaveformBars() {
  return (
    <div className="flex items-center gap-1 h-12">
      {WAVEFORM_BARS.map((bar, i) => (
        <motion.div
          key={i}
          className="w-1 h-3 bg-foreground/60 rounded-full origin-center will-change-transform"
          animate={{
            scaleY: [1, bar.scale, 1],
          }}
          transition={{
            duration: bar.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: bar.delay,
          }}
        />
      ))}
    </div>
  );
}
