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
        // Tema oscuro industrial
        background: '#121212',
        foreground: '#ffffff',
        card: {
          DEFAULT: '#1e1e1e',
          foreground: '#ffffff',
        },
        popover: {
          DEFAULT: '#1e1e1e',
          foreground: '#ffffff',
        },
        primary: {
          DEFAULT: '#2196f3',
          foreground: '#ffffff',
          50: '#e3f2fd',
          100: '#bbdefb',
          200: '#90caf9',
          300: '#64b5f6',
          400: '#42a5f5',
          500: '#2196f3',
          600: '#1e88e5',
          700: '#1976d2',
          800: '#1565c0',
          900: '#0d47a1',
        },
        secondary: {
          DEFAULT: '#424242',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: '#2a2a2a',
          foreground: '#a0a0a0',
        },
        accent: {
          DEFAULT: '#2a2a2a',
          foreground: '#ffffff',
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
        border: '#333333',
        input: '#333333',
        ring: '#2196f3',
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.25rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
