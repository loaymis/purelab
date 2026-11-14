/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effaf7', 100: '#d7f2ea', 200: '#b0e4d5', 300: '#7ccfba',
          400: '#46b39b', 500: '#259781', 600: '#187a69', 700: '#156256',
          800: '#144e46', 900: '#12413b', 950: '#082522',
        },
      },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
