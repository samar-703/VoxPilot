import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "VoxPilot | Voice-Controlled Infrastructure",
  description:
    "Mission control for your infrastructure. Execute SRE operations with natural voice commands and AI-powered automation.",
  keywords: [
    "SRE",
    "DevOps",
    "voice control",
    "infrastructure",
    "AI automation",
    "monitoring",
    "operations",
  ],
  authors: [{ name: "VoxPilot Team" }],
  creator: "VoxPilot",
  openGraph: {
    title: "VoxPilot | Voice-Controlled Infrastructure",
    description:
      "Mission control for your infrastructure. Execute SRE operations with natural voice commands.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "VoxPilot | Voice-Controlled Infrastructure",
    description:
      "Mission control for your infrastructure. Execute SRE operations with natural voice commands.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        className={`${inter.variable} font-sans bg-background text-foreground min-h-screen`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <div className="relative min-h-screen noise">
            {/* Global gradient backgrounds */}
            <div className="fixed inset-0 bg-gradient-to-br from-purple-950/20 via-transparent to-indigo-950/20 pointer-events-none" />
            <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-purple-500/5 blur-[120px] rounded-full pointer-events-none" />

            {/* Content */}
            <main className="relative z-10">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
