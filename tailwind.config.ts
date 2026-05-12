import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Figma Chatus design tokens
        ch: {
          bg:      '#10131b',
          card:    '#1c2028',
          input:   '#272a32',
          surface: '#31353d',
          border:  '#414755',
          text:    '#e0e2ed',
          sub:     '#c1c6d7',
          accent:  '#4b8eff',
          blue:    '#adc6ff',
          sent:    '#007aff',
          error:   '#ffb4ab',
          peach:   '#ffb595',
          badge:   '#181c23',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
