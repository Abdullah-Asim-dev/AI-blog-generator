/** Every colour comes from CSS variables, so light and dark themes switch automatically. */
const ch = (v) => `rgb(var(${v}) / <alpha-value>)`;
const scale = (name, shades) =>
  Object.fromEntries(shades.map((s) => [s, ch(`--${name}-${s}`)]));

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: ch('--canvas'),
        panel: ch('--panel'),
        panel2: ch('--panel-2'),
        slate: scale('slate', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        emerald: scale('accent', [200, 300, 400, 500, 600, 700]), // now the blue accent
        red: scale('red', [300, 400, 500]),
        amber: scale('amber', [200, 300, 400, 500]),
        orange: scale('orange', [300, 400, 500]),
      },
      fontFamily: {
        sans: ['var(--font-ui)', 'var(--font-urdu)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'var(--font-urdu)', 'Georgia', 'serif'],
        display: ['var(--font-display)', 'var(--font-ui)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};