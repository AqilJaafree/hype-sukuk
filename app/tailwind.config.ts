import type { Config } from "tailwindcss";
import { fontFamily as defaultFontFamily } from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F7F6F3",
        surface:    "#FFFFFF",
        border:     "#E2E0DB",
        text:       "#1A1917",
        muted:      "#76726B",
        forest:     "#1D5C3A",
        forestLight:"#EAF2EE",
        gold:       "#A8832A",
        goldLight:  "#F7F1E2",
        red:        "#8B2E2E",
      },
      fontFamily: {
        sans: ["var(--font-inter)", ...defaultFontFamily.sans],
      },
    },
  },
  plugins: [],
};

export default config;
