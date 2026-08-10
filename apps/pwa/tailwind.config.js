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
        // 3ª pasada 2026-08-09 (NUEVA PIEL): estos tonos pasan de hex fijo a
        // VARIABLE CSS (index.css). Los valores por defecto en `:root` son los
        // mismos -50% croma de arriba —byte-idénticos, la piel actual no cambia—
        // pero ahora una piel puede re-teñir los ~4.480 usos de estas clases sin
        // tocar 306 .tsx (ver docs/NUEVA_PIEL_APPLE_HIG.md §1.4 y `[data-skin]`).
        emerald: {
          ...colors.emerald,
          400: 'rgb(var(--tw-emerald-400) / <alpha-value>)',
          500: 'rgb(var(--tw-emerald-500) / <alpha-value>)',
          600: 'rgb(var(--tw-emerald-600) / <alpha-value>)',
        },
        green: {
          ...colors.green,
          400: 'rgb(var(--tw-green-400) / <alpha-value>)',
          500: 'rgb(var(--tw-green-500) / <alpha-value>)',
          600: 'rgb(var(--tw-green-600) / <alpha-value>)',
        },
        red: {
          ...colors.red,
          400: 'rgb(var(--tw-red-400) / <alpha-value>)',
          500: 'rgb(var(--tw-red-500) / <alpha-value>)',
          600: 'rgb(var(--tw-red-600) / <alpha-value>)',
        },
        amber: {
          ...colors.amber,
          400: 'rgb(var(--tw-amber-400) / <alpha-value>)',
          500: 'rgb(var(--tw-amber-500) / <alpha-value>)',
          600: 'rgb(var(--tw-amber-600) / <alpha-value>)',
        },
        yellow: { ...colors.yellow, 400: '#d9bc4a' },
        blue: {
          ...colors.blue,
          400: 'rgb(var(--tw-blue-400) / <alpha-value>)',
          500: 'rgb(var(--tw-blue-500) / <alpha-value>)',
        },
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
          // Acento de marca ADAPTATIVO: #2E75B6 en claro, #5AA0DC en oscuro bajo la
          // piel nueva (el azul puro se apaga sobre superficie oscura). Default =
          // #2E75B6 en ambos temas, igual que siempre.
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          foreground: 'rgb(var(--brand-foreground) / <alpha-value>)',
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
        // Paleta CATEGÓRICA (index.css). Se consume por el primitivo <Tag>,
        // no a mano: `text-cat-3-ink` suelto vuelve a dispersar la decisión.
        ...Object.fromEntries(
          Array.from({ length: 8 }, (_, i) => [
            `cat-${i + 1}`,
            {
              ink: `rgb(var(--cat-${i + 1}-ink) / <alpha-value>)`,
              tint: `rgb(var(--cat-${i + 1}-tint) / <alpha-value>)`,
            },
          ]),
        ),
        // Tinta de marca para texto SOBRE tinte de marca (el primary puro
        // reprueba AA sobre su propio tinte al 15% — medido).
        'brand-ink': 'rgb(var(--brand-ink) / <alpha-value>)',
        // TINTA ADAPTATIVA: reemplaza el patrón `text-X-700 dark:text-X-400`
        // por UNA clase que ya cambia con el tema. No usar los -600 para esto:
        // esos tienen dueño (la decisión de julio de bajar croma) y reutilizarlos
        // lavó los colores de producción.
        'ink-crit': 'rgb(var(--ink-crit) / <alpha-value>)',
        'ink-warn': 'rgb(var(--ink-warn) / <alpha-value>)',
        'ink-ok': 'rgb(var(--ink-ok) / <alpha-value>)',
        'ink-info': 'rgb(var(--ink-info) / <alpha-value>)',
        'card-edge': 'rgb(var(--card-edge) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--border) / <alpha-value>)',
        ring: '#5aa6e8',
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.25rem',
        // Escala ÚNICA de la nueva piel (docs/NUEVA_PIEL_APPLE_HIG.md §3).
        // Reemplaza la mezcla rounded/-sm/-md/-lg/-xl en TODO componente nuevo.
        // Valores por VARIABLE: la piel actual conserva sus proporciones y la
        // nueva trae la geometría Apple. Ver index.css para el porqué.
        ctl: 'var(--r-ctl)',      // controles: botón, input, segmented, chip
        card: 'var(--r-card)',    // tarjeta / grupo de lista
        panel: 'var(--r-panel)',  // contenedor grande, sheet, modal
      },
      fontSize: {
        // ── ESCALA TIPOGRÁFICA de la Constitución (§9) ────────────────────────
        // En PX a propósito: el `html` de esta app está al 87.5%, así que los
        // `rem` no dan los tamaños que la norma pide.
        // El piso de la escala es 11px: por debajo es "texto diminuto", que la
        // §64 prohíbe explícitamente. La app tenía 1.125 usos por debajo (8, 9
        // y 10px) — esa era la causa real de que se viera densa y no Apple.
        caption:   ['11px', { lineHeight: '1.35' }],
        footnote:  ['13px', { lineHeight: '1.4' }],
        body:      ['15px', { lineHeight: '1.45' }],
        headline:  ['17px', { lineHeight: '1.35', fontWeight: '600' }],
        title3:    ['20px', { lineHeight: '1.25', fontWeight: '600' }],
        title2:    ['23px', { lineHeight: '1.2',  fontWeight: '600' }],
        title1:    ['28px', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        display:   ['33px', { lineHeight: '1.1',  letterSpacing: '-0.028em', fontWeight: '700' }],
      },
      fontFamily: {
        // UI en IBM Plex Sans (tipo de ingeniería con carácter, no Inter genérico)
        // §8: familia del sistema primero — en Apple resuelve a SF Pro, que es
        // lo que le da el aire correcto; IBM Plex queda de respaldo con carácter.
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI Variable Text"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'],
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
