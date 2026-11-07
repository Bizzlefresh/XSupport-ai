import type { Config } from "tailwindcss";

// Tokens live in src/styles/tokens.css. Amber (`ai`) is reserved for AI-generated content
// so suggestions stay visibly separate from ticket facts.
const c = (n: string) => `rgb(var(--${n}) / <alpha-value>)`;
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        paper: c("paper"), panel: c("panel"), elevated: c("elevated"), ink: c("ink"), muted: c("muted"),
        line: c("line"), brand: c("brand"), "on-brand": c("on-brand"), info: c("info"), ai: c("ai"),
        ok: c("ok"), warn: c("warn"), danger: c("danger"),
      },
      fontFamily: {
        sans: ["Inter Variable", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: { sm: "var(--radius-sm)", md: "var(--radius-md)", lg: "var(--radius-lg)" },
      boxShadow: { sm: "var(--shadow-sm)", md: "var(--shadow-md)", lg: "var(--shadow-lg)" },
      maxWidth: { container: "var(--container-max)" },
      height: { header: "var(--header-h)" },
      transitionTimingFunction: { app: "var(--ease)" },
      transitionDuration: { fast: "150ms", DEFAULT: "200ms" },
    },
  },
  plugins: [],
};
export default config;
