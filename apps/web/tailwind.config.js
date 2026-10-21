/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { comic: ['"Comic Book"', 'system-ui', 'sans-serif'] },
      // Colores de los dados (Dice-guide-V03)
      colors: {
        die: {
          red: '#d9343f',
          orange: '#ee6b23',
          blue: '#5eb4e4',
          purple: '#7766a6',
          green: '#94c11f',
          white: '#e7e3ea',
        },
        bark: '#2a1a0e',
        sherbet: '#f9e9c8',
      },
    },
  },
  plugins: [],
};
