import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        foreground: "#fafafa",
        card: {
          DEFAULT: "#0a0a0a",
          foreground: "#fafafa",
        },
        primary: {
          DEFAULT: "#fafafa",
          foreground: "#0a0a0a",
        },
        secondary: {
          DEFAULT: "#141414",
          foreground: "#fafafa",
        },
        muted: {
          DEFAULT: "#141414",
          foreground: "#a3a3a3",
        },
        accent: {
          DEFAULT: "#1a1a1a",
          foreground: "#fafafa",
        },
        destructive: {
          DEFAULT: "#dc2626",
          foreground: "#fafafa",
        },
        success: {
          DEFAULT: "#16a34a",
          foreground: "#fafafa",
        },
        warning: {
          DEFAULT: "#d97706",
          foreground: "#fafafa",
        },
        border: "#1f1f1f",
        input: "#1f1f1f",
        ring: "#404040",
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.25rem",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "monospace"],
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": {
            boxShadow: "0 0 20px 5px rgba(255,255,255,0.1)",
            transform: "scale(1)",
          },
          "50%": {
            boxShadow: "0 0 40px 10px rgba(255,255,255,0.2)",
            transform: "scale(1.02)",
          },
        },
        "orb-idle": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.9" },
          "50%": { transform: "scale(1.05)", opacity: "1" },
        },
        "orb-listening": {
          "0%, 100%": {
            transform: "scale(1)",
            boxShadow: "0 0 30px 10px rgba(59,130,246,0.4)",
          },
          "50%": {
            transform: "scale(1.1)",
            boxShadow: "0 0 50px 20px rgba(59,130,246,0.6)",
          },
        },
        "orb-speaking": {
          "0%": { transform: "scale(1) rotate(0deg)" },
          "25%": { transform: "scale(1.05) rotate(2deg)" },
          "50%": { transform: "scale(1.1) rotate(0deg)" },
          "75%": { transform: "scale(1.05) rotate(-2deg)" },
          "100%": { transform: "scale(1) rotate(0deg)" },
        },
        "orb-processing": {
          "0%": { transform: "scale(1)", opacity: "0.8" },
          "50%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "0.8" },
        },
        "card-critical": {
          "0%, 100%": { borderColor: "rgba(220, 38, 38, 0.4)" },
          "50%": { borderColor: "rgba(220, 38, 38, 0.9)" },
        },
        "card-success-flash": {
          "0%": {
            backgroundColor: "rgba(22, 163, 74, 0.3)",
            borderColor: "rgba(22, 163, 74, 0.8)",
          },
          "100%": {
            backgroundColor: "transparent",
            borderColor: "rgba(22, 163, 74, 0.3)",
          },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "orb-idle": "orb-idle 3s ease-in-out infinite",
        "orb-listening": "orb-listening 1.5s ease-in-out infinite",
        "orb-speaking": "orb-speaking 0.8s ease-in-out infinite",
        "orb-processing": "orb-processing 1s ease-in-out infinite",
        "card-critical": "card-critical 1.5s ease-in-out infinite",
        "card-success-flash": "card-success-flash 0.6s ease-out forwards",
        shimmer: "shimmer 2s linear infinite",
        "fade-up": "fade-up 0.6s ease-out forwards",
        float: "float 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
