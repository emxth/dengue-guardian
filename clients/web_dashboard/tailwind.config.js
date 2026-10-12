/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#3674B5",     // Guardian Cobalt
        secondary: "#578FCA",   // Surveillance Blue
        accent: "#A1E3F9",      // Telemetry Sky
        mintSurface: "#D1F8EF", // Eco Mint
        background: "#F8FAFC",  // Off-white/Cool Gray
        surface: "#FFFFFF",     // Pure White
        darkBase: "#0F172A",    // Deep Slate Navy
        textMuted: "#475569",   // Slate Gray
        borderLight: "#E2E8F0", // Subtle Card Border
        riskHigh: "#E11D48",    // Crimson Red
        riskMedium: "#F59E0B",  // Amber
        riskCleared: "#10B981", // Emerald Green
      },
    },
  },
  plugins: [],
};