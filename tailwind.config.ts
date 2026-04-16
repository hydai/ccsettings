import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        layer: {
          managed: "#8b5cf6",
          user: "#3b82f6",
          "user-local": "#06b6d4",
          project: "#10b981",
          "project-local": "#f59e0b",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
