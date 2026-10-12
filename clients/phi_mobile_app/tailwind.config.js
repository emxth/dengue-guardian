/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx}", "./src/**/*.{js,jsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#3674B5",
        secondary: "#578FCA",
        accent: "#A1E3F9",
        mintSurface: "#D1F8EF",
        background: "#F8FAFC",
        surface: "#FFFFFF",
        darkBase: "#0F172A",
        textMuted: "#475569",
        borderLight: "#E2E8F0",
        riskHigh: "#E11D48",
        riskMedium: "#F59E0B",
        riskCleared: "#10B981",
      },
    },
  },
  plugins: [],
};