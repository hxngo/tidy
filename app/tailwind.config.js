/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Tidy 다크 테마 색상 팔레트
        app: {
          bg: '#0f0f0f',
          sidebar: '#161616',
          card: '#1a1a1a',
          border: '#2a2a2a',
          accent: '#d4d4d8',
          'text-primary': '#e5e5e5',
          'text-secondary': '#737373',
        },
      },
    },
  },
  plugins: [],
}
