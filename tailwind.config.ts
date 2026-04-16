import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', "serif"],
        sans: [
          "Geist",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: [
          '"Geist Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        canvas: "#F3EBE2",
        pad: "#C5BEB6",
        card: "#FFFFFF",
        ink: "#1A1A1A",
        "ink-alt": "#2D2926",
        body: "#3D3D3D",
        muted: "#6B6B6B",
        caption: "#8C8782",
        accent: "#7D6B3D",
        conflict: "#7F1D1D",
        danger: "#B23A3A",
        "danger-soft": "#B4301F",
        hairline: "#0000001f",
        layer: {
          managed: "#7C5CE0",
          user: "#6BA3FF",
          "user-local": "#2DB3A0",
          project: "#D97A37",
          "project-local": "#C45183",
        },
      },
      borderRadius: {
        "soft-sm": "10px",
        "soft-md": "12px",
        "soft-lg": "16px",
        "soft-xl": "20px",
      },
      boxShadow: {
        soft: "0 1px 2px 0 #0000000a",
        lift: "0 2px 8px 0 #1a1a1a33",
        "focus-ink": "0 0 0 3px #1a1a1a14",
      },
    },
  },
  plugins: [],
} satisfies Config;
