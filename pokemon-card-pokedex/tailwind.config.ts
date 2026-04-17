import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        pokeRed: "#DC2626",
        pokeYellow: "#FACC15",
        pokeBlue: "#2563EB",
      },
    },
  },
  plugins: [],
};

export default config;
