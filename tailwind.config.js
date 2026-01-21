/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./popup.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        neon: {
          cyan: '#00ffff',
          purple: '#bc13fe',
          pink: '#ff10f0',
          green: '#39ff14',
          blue: '#00bfff',
          red: '#ff3333',
        },
        dark: {
          bg: '#0a0a0a',
          surface: '#1a1a1a',
          border: '#2a2a2a',
          text: '#e0e0e0',
          muted: '#888888',
        }
      },
      boxShadow: {
        'neon-cyan': '0 0 5px #00ffff, 0 0 10px #00ffff, 0 0 15px #00ffff',
        'neon-purple': '0 0 5px #bc13fe, 0 0 10px #bc13fe, 0 0 15px #bc13fe',
      }
    },
  },
  plugins: [],
}
