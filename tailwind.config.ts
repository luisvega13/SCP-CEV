import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#0a1142",
          red: "#7a0000",
          gold: "#c79a35",
        },
        // Conserva las utilidades existentes y las alinea con la identidad CEJV.
        sky: {
          50: "#f3f4f8",
          100: "#e4e6f0",
          200: "#c8ccdf",
          300: "#a3a9c6",
          400: "#707aab",
          500: "#303d79",
          600: "#0a1142",
          700: "#080d35",
          800: "#060a29",
          900: "#04071d",
          950: "#020411",
        },
      },
    },
  },
  plugins: [],
};

export default config;
