import colors from 'tailwindcss/colors'

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
        // Acentos "mate" (pedido de Orel 2026-07-17, recroma'ados -50% en oklch
        // 2026-07-19 — el semáforo se sentía "muy brillante" usado como bloque;
        // ver /antarfood-design-system para el detalle). Las familias stock de
        // Tailwind que usamos como acento quedan desaturadas en los tonos
        // 400/500 — mismo hue, menos croma (nada neón). El claro usa
        // mayormente -600 (intactos); el oscuro -400/-500.
        //
        // ⚠ TRADE-OFF CONSCIENTE: a -50% el patrón text-400/dark:text-400 sobre
        // bg-500/15 (badges/chips oscuros, ~30+ usos solo en BodegaView) cae
        // BAJO 4.5:1 WCAG AA en emerald (4.09:1) y red (3.99:1); amber queda
        // justo (4.44:1). Orel decidió mantener -50% aceptando el trade-off de
        // contraste por el look menos "neón". Si algún día se reporta que un
        // chip oscuro es difícil de leer, esto es la causa — no es un bug
        // nuevo, es esta decisión (memoria Claude:
        // reference_skill_antarfood_design_system.md tiene el detalle completo).
        // 2ª pasada 2026-07-19: también los -600 (el semáforo del calendario
        // histórico, badges PP/P0 y botones de borrar usaban red-600 stock y
        // seguían brillando; los -600 son la mitad "claro" del mismo semáforo).
        emerald: { ...colors.emerald, 400: '#6c9a8a', 500: '#62917f', 600: '#5b8c75' },
        green: { ...colors.green, 400: '#779f85', 500: '#679576', 600: '#5f9368' },
        red: { ...colors.red, 400: '#b2807f', 500: '#b0706d', 600: '#b46259' },
        amber: { ...colors.amber, 400: '#ac966e', 500: '#a88c64', 600: '#ae7e59' },
        yellow: { ...colors.yellow, 400: '#d9bc4a' },
        blue: { ...colors.blue, 400: '#6da3d8', 500: '#4a86c8' },
        violet: { ...colors.violet, 400: '#a190d6', 500: '#7d68c4' },
        cyan: { ...colors.cyan, 400: '#56b8cc' },
        sky: { ...colors.sky, 400: '#57a9d3' },
        rose: { ...colors.rose, 400: '#e07d8c' },
        indigo: { ...colors.indigo, 400: '#8992d1', 500: '#6870b8' },
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
          DEFAULT: '#bf6c61',
          foreground: '#ffffff',
        },
        success: {
          DEFAULT: '#6c986c',
          foreground: '#ffffff',
        },
        warning: {
          DEFAULT: '#c08e5f',
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
