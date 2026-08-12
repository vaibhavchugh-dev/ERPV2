/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1e293b",
          muted: "#334155",
        },
        accent: {
          DEFAULT: "#2563eb",
          soft: "#eff6ff",
        },
        surface: {
          DEFAULT: "#ffffff",
          dark: "#1e293b",
        },
        canvas: {
          DEFAULT: "#f4f6f9",
          dark: "#020617",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)",
        "card-dark": "0 2px 8px rgba(0, 0, 0, 0.35), 0 8px 24px rgba(0, 0, 0, 0.25)",
      },
      minHeight: {
        tap: "48px",
      },
      fontFamily: {
        sans: ['"Source Sans 3"', "Segoe UI", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
