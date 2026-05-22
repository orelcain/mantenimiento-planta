/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Tema oscuro AquaChile (neutros tintados al azul de marca).
        // Fuente de verdad de la paleta del módulo: src/data/learningTheme.ts (LC).
        // Status (destructive/success/warning) se mantienen vivos para que resalten.
        background: '#0d1722',
        foreground: '#e9eef3',
        card: {
          DEFAULT: '#16242f',
          foreground: '#e9eef3',
        },
        popover: {
          DEFAULT: '#16242f',
          foreground: '#e9eef3',
        },
        primary: {
          DEFAULT: '#2E75B6',
          foreground: '#ffffff',
          50: '#eaf3fb',
          100: '#cfe2f3',
          200: '#9DC3E6',
          300: '#79afde',
          400: '#5aa6e8',
          500: '#2E75B6',
          600: '#2a6aa6',
          700: '#245a8c',
          800: '#1f4a73',
          900: '#173a5a',
        },
        secondary: {
          DEFAULT: '#2b3d4c',
          foreground: '#e9eef3',
        },
        muted: {
          DEFAULT: '#15212c',
          foreground: '#9db0c2',
        },
        accent: {
          DEFAULT: '#1f3445',
          foreground: '#e9eef3',
        },
        destructive: {
          DEFAULT: '#f44336',
          foreground: '#ffffff',
        },
        success: {
          DEFAULT: '#4caf50',
          foreground: '#ffffff',
        },
        warning: {
          DEFAULT: '#ff9800',
          foreground: '#000000',
        },
        border: '#22384a',
        input: '#22384a',
        ring: '#5aa6e8',
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.25rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
    },
  },
  plugins: [],
}
