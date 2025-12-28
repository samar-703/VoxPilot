import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoxPilot - SRE Mission Control",
  description: "Voice-controlled SRE Mission Control Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased">
        <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
