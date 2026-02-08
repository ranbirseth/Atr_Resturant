/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#DC9D1D", // Gold
        primaryHover: "#B07D14",
        primaryActive: "#8E6410",
        lightAccent: "#FFF7ED",

        bgMain: "#1F110E",   // Dark Reddish Brown
        bgHeader: "#3D1D13", // Header Brown
        bgCard: "#2A1612",   // Card Brown
        bgSidebar: "#020617",
        bgHover: "#374151",
        bgModal: "#2A140E",

        textPrimary: "#F9FAFB",
        textSecondary: "#9CA3AF",
        textGold: "#D4A017",
        textMuted: "#6B7280",
        textDisabled: "#4B5563",
        textHighlight: "#DC9D1D",

        borderColor: "#3D251E",
        dividerColor: "#3D251E",
        borderActive: "#DC9D1D",

        success: "#22C55E",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3B82F6",
      },
      fontFamily: {
        serif: ['Playfair Display', 'serif'],
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
};
