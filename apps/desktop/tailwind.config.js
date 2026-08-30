/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces: ground -> floating panel -> card -> inset.
        bg: "var(--bg)",
        panel: "var(--panel)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        // Borders, weakest to strongest.
        faint: "var(--border-faint)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        "border-selected": "var(--border-selected)",
        // Text, strongest to faintest.
        "text-strong": "var(--text-strong)",
        text: "var(--text)",
        "text-muted": "var(--text-muted)",
        muted: "var(--muted)",
        "text-faint": "var(--text-faint)",
        // Ink accent — what controls are made of.
        accent: "var(--accent)",
        "accent-fg": "var(--accent-fg)",
        // Brand pop — sparse: selected state, one CTA per screen.
        brand: "var(--brand)",
        "brand-fg": "var(--brand-fg)",
        "brand-soft": "var(--brand-soft)",
        "brand-text": "var(--brand-text)",
        // Translucent hover/press ladder.
        fill: "var(--fill)",
        "fill-2": "var(--fill-2)",
        "fill-3": "var(--fill-3)",
        glass: "var(--glass)",
        link: "var(--link)",
        warn: "var(--warn)",
        ok: "var(--ok)",
        error: "var(--error)",
        "error-fg": "var(--error-fg)",
      },
      fontFamily: {
        serif: ["'Source Serif 4'", "Georgia", "serif"],
        sans: ["'Albert Sans'", "Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        // Tailwind's defaults already cover the small end (rounded-sm 2px,
        // rounded 4px); these are the container and pill ends of the scale.
        card: "12px",
        input: "8px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(40, 39, 35, 0.04), 0 1px 3px rgba(40, 39, 35, 0.03)",
        pop: "0 6px 24px rgba(40, 39, 35, 0.09), 0 2px 6px rgba(40, 39, 35, 0.05)",
        // The floating rail / lifted panel.
        lift: "0 24px 60px rgba(40, 39, 35, 0.14), 0 8px 16px rgba(40, 39, 35, 0.06)",
      },
      backdropBlur: {
        glass: "var(--glass-blur)",
      },
      transitionDuration: {
        quick: "var(--dur-quick)",
        base: "var(--dur)",
        enter: "var(--dur-enter)",
        slow: "var(--dur-slow)",
      },
      transitionTimingFunction: {
        // Named by role so Tailwind's own ease-out/ease-in-out keep working.
        enter: "var(--ease-out)",
        standard: "var(--ease)",
      },
    },
  },
  plugins: [],
};
