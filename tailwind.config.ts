import type { Config } from "tailwindcss";

/**
 * Tailwind reads from the CSS custom properties defined in app/globals.css, so
 * there is exactly one place a colour is decided. Components use token names
 * (surface-raised, pri-critical) and never raw hex.
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          sunken: "var(--surface-sunken)",
          base: "var(--surface-base)",
          raised: "var(--surface-raised)",
          overlay: "var(--surface-overlay)",
        },
        edge: { subtle: "var(--border-subtle)", DEFAULT: "var(--border-default)", strong: "var(--border-strong)" },
        ink: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
          faint: "var(--text-faint)",
        },
        pri: {
          critical: "var(--p-critical)", high: "var(--p-high)",
          medium: "var(--p-medium)", low: "var(--p-low)",
        },
        st: {
          available: "var(--st-available)", enroute: "var(--st-enroute)",
          onscene: "var(--st-onscene)", busy: "var(--st-busy)", offline: "var(--st-offline)",
        },
        accent: { DEFAULT: "var(--accent)", hover: "var(--accent-hover)", quiet: "var(--accent-quiet)" },
        danger: { DEFAULT: "var(--danger)", hover: "var(--danger-hover)" },
        warn: "var(--warn)",
        info: "var(--info)",
        /* Retained so existing base-* utilities keep resolving. */
        base: { 950: "#0a0a0c", 900: "#101013", 850: "#16161a", 800: "#1e1e22", 700: "#2a2a30" },
      },
      borderRadius: { sm: "var(--r-sm)", md: "var(--r-md)", lg: "var(--r-lg)", xl: "var(--r-xl)" },
      boxShadow: { sm: "var(--shadow-sm)", md: "var(--shadow-md)", lg: "var(--shadow-lg)" },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Inter", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      transitionTimingFunction: { ops: "cubic-bezier(0.2, 0, 0.1, 1)" },
      screens: { xs: "430px" },
    },
  },
  plugins: [],
} satisfies Config;
