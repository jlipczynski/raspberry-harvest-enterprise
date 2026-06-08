import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Marka „Maliny" — malinowa czerwień
        raspberry: {
          DEFAULT: "#c2185b",
          dark: "#a01548",
          light: "#fce4ec",
        },
      },
      minHeight: {
        touch: "44px",
      },
    },
  },
  plugins: [],
};

export default config;
