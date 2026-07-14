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
        // Neutros por VARIABLE CSS (canales RGB en index.css): tema oscuro AquaChile
        // (el de siempre, default) bajo `.dark`, y tema claro bajo `:root`.
        // Toggle en el header (useTheme, clase `dark` en <html>, anti-flash en index.html).
        // Marca (primary) y status (destructive/success/warning) NO varían por tema.
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--foreground) / <alpha-value>)',
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
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--foreground) / <alpha-value>)',
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
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--border) / <alpha-value>)',
        ring: '#5aa6e8',
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.25rem',
      },
      fontFamily: {
        // UI en IBM Plex Sans (tipo de ingeniería con carácter, no Inter genérico)
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        // Mono técnico para datos/lecturas (KPIs, códigos, timestamps, IDs)
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
    },
  },
  plugins: [],
}
