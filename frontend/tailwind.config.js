/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Source Sans 3", "Segoe UI", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          pink: "#ff2c7d",
          blue: "#0F8AB1",
          green: "#10b981",
          navy: "#172033",
        },
      },
      boxShadow: {
        soft: "0 20px 60px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};
