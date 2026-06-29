/**
 * tailwind.config.ts — CasperFlow design tokens
 */
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:       "#0A1628",
        surface:  "#111827",
        surface2: "#1a2540",
        accent:   "#00E5CC",
        accent2:  "#00b8a9",
        muted:    "#6B7280",
        success:  "#10B981",
        warning:  "#F59E0B",
        error:    "#EF4444",
        border:   "#1F2937",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "pulse-green": "pulse-green 1.5s ease-in-out infinite",
        "glow-teal":   "glow-teal 3s ease-in-out infinite",
        "slide-up":    "slide-up 0.3s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
