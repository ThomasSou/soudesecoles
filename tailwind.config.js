/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        sou: {
          blue: "#1F3864",
          gold: "#B08D57",
        },
      },
    },
  },
  plugins: [],
};
