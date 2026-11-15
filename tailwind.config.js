/** @type {import('tailwindcss').Config} */
// Semantic colour roles are CSS variables (see src/index.css) so every screen
// switches between light and dark automatically. Brand stays a fixed teal ramp.
const role = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effaf7', 100: '#d7f2ea', 200: '#b0e4d5', 300: '#7ccfba',
          400: '#46b39b', 500: '#259781', 600: '#187a69', 700: '#156256',
          800: '#144e46', 900: '#12413b', 950: '#082522',
        },
        canvas: role('canvas'), // page background
        surface: role('surface'), // cards, sheets, inputs
        subtle: role('subtle'), // hover / muted fills
        line: role('line'), // borders & dividers
        ink: role('ink'), // primary text
        muted: role('muted'), // secondary text
        faint: role('faint'), // tertiary text / placeholders
        accent: role('accent'), // brand colour tuned per theme (text/icons)
      },
      fontFamily: {
        sans: ['"Inter Variable"', '"IBM Plex Sans Arabic"', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem' },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        pop: '0 10px 30px -10px rgb(15 23 42 / 0.25)',
      },
      keyframes: {
        // Opacity only: animating `transform` would turn the page into the containing block
        // for position:fixed children (checkout bar, FAB) while/after the animation runs.
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        pop: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.25)' }, '100%': { transform: 'scale(1)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in .18s ease-out both',
        'sheet-up': 'sheet-up .22s cubic-bezier(.2,.8,.2,1) both',
        pop: 'pop .3s ease-out',
      },
    },
  },
  plugins: [],
};
