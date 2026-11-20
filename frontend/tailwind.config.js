/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cinema: {
          50: '#fbf2f7',
          100: '#f3e3ee',
          500: '#c2185b',
          600: '#ad1457',
          700: '#8c124b',
          900: '#4a032e',
          950: '#2a011c',
        },
        dark: {
          850: '#0b0c10',
          900: '#0f1115',
          950: '#0a0b0e',
          980: '#050608',
        },
        accent: {
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
        }
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
      },
      boxShadow: {
        'glow': '0 0 40px -12px rgba(173, 20, 87, 0.35)',
        'card': '0 20px 40px -10px rgba(0,0,0,0.6)',
        'neon': '0 0 20px rgba(244, 63, 94, 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'slide-up': 'slideUp 0.7s ease-out forwards',
        'float': 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(244, 63, 94, 0.2)' },
          '50%': { boxShadow: '0 0 40px rgba(244, 63, 94, 0.6)' },
        },
      },
    },
  },
  plugins: [],
};
