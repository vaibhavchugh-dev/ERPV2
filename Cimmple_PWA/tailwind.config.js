/** @type {import('tailwindcss').Config} */
export default {
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
        surface: "#ffffff",
        canvas: "#f4f6f9",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)",
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
