import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#07080B",
        surface: "#0E1016",
        card: "#111318",
        hairline: "#1E2230",
        ink: "#E8E6DF",
        mute: "#8B90A0",
        gold: "#E8B923",
        live: "#3DDC97",
        buy: "#1FA971",
        sell: "#E5484D",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
