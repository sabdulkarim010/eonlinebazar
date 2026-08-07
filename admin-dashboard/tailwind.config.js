/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#6C63FF',
          50: '#F0EFFF',
          100: '#E0DEFF',
          200: '#C2BCFF',
          300: '#A39AFF',
          400: '#8578FF',
          500: '#6C63FF',
          600: '#5A52E0',
          700: '#4841B8',
          800: '#363190',
          900: '#242168',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(249, 115, 22, 0.5)' },
          '50%': { boxShadow: '0 0 0 8px rgba(249, 115, 22, 0)' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(1.3)' },
        },
      },
      animation: {
        pulseGlow: 'pulseGlow 1.5s ease-in-out infinite',
        pulseDot: 'pulseDot 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
