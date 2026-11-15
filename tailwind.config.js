/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/client/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        line: "var(--line)",
        text: "var(--text)",
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        danger: "var(--danger)",
      },
      fontFamily: {
        serif: ['"Instrument Serif"', "Georgia", "serif"],
        sans: ['"Hanken Grotesk"', "system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        poster: "6px",
        control: "8px",
        dialog: "16px",
      },
    },
  },
  plugins: [],
};
