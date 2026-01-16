/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        costco: {
          blue: '#005da3',
          red: '#e31837',
        }
      }
    },
  },
  plugins: [],
}
