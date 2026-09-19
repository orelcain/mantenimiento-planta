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
        // `destructive` tenía UN solo valor para dos trabajos opuestos, y por eso
        // ninguno de los dos cumplía (medido 2026-09-15): #bf6c61 como RELLENO
        // con texto blanco da 3.80:1, y como TEXTO da 3.67:1 sobre card oscuro.
        // Reprobaba AA en los 76 `bg-destructive` y en los 192 `text-destructive`.
        // La separación va abajo, en `backgroundColor` y `textColor`: un relleno
        // no necesita el mismo color que una tinta, igual que `--brand` y
        // `--brand-ink`. Este bloque queda para `border-destructive` y similares.
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
      // ── `destructive`: el relleno y la tinta son trabajos distintos ────────
      // Un RELLENO lleva texto blanco encima, así que tiene que ser oscuro.
      // Una TINTA va sobre la superficie del tema, así que tiene que contrastar
      // CONTRA ella — y por eso en oscuro debe ser clara, justo al revés.
      // Un único valor no puede hacer las dos cosas; el anterior reprobaba AA
      // en ambas. Medido:
      //   bg-destructive   #8C4B45 con blanco encima ....... 6.55:1  (era 3.80)
      //   text-destructive #c42d25 sobre card claro ........ 5.93:1  (era 3.80)
      //   text-destructive #ff776f sobre card oscuro ....... 5.39:1  (era 3.67)
      // Las dos tintas NO son nuevas: son los rojo-600 que `check-contrast.mjs`
      // ya verificaba para los chips. Se reutilizan en vez de inventar un hex.
      backgroundColor: {
        // El FONDO destructivo es el rojo vivo del sistema, porque se usa
        // TINTED (al 13%): `bg-destructive/[0.13]`. Al 13% el systemRed se
        // insinua como rosa palido, que es exactamente el boton destructivo de
        // iOS. Puesto opaco se veria chillon, pero el variant nunca lo usa asi.
        destructive: {
          DEFAULT: 'rgb(var(--tw-red-500) / <alpha-value>)',
          foreground: '#ffffff',
          // El tinte del boton destructivo, YA compuesto sobre la card y opaco.
          // Con alfa se apoyaba en lo que hubiera debajo: 4.70:1 sobre card pero
          // 4.25 sobre el fondo gris. Ver la nota en index.css.
          tint: 'rgb(var(--destructive-tint) / <alpha-value>)',
        },
        // ── RELLENOS de estado ────────────────────────────────────────────
        // Estos tres tokens son para el caso REAL de relleno opaco: barras de
        // gráfico, segmentos de Gantt, cabeceras de estado. NO para botones.
        //
        // Un botón de estado en iOS es TINTED (color al 13% + texto del color),
        // nunca un bloque de color sólido — ver `variant: destructive` abajo.
        // Si estás por poner texto blanco sobre un relleno de color, el patrón
        // casi siempre está mal antes que el color.
        //
        // Los valores son los system colors de Apple OSCURECIDOS hasta cumplir
        // AA con blanco, no hexes libres: misma lógica que ya usaba el §1.4 del
        // HIG doc cuando el verde accesible de Apple (#248A3D) daba 4.40:1 y se
        // bajó a #217E38. Medido: critical 6.55 · warning 6.35 · ok 6.36.
        fill: {
          critical: '#8C4B45',
          warning: '#7A5A1E',
          ok: '#2F6B41',
        },
      },
      textColor: {
        destructive: 'rgb(var(--tw-red-600) / <alpha-value>)',
      },
      fontSize: {
        // ×`--escala-texto` (19-09-2026): con 1 (por defecto) todo mide lo mismo que antes;
        // la bitácora la sube según el tamaño de letra del teléfono (useTamanoLetraBitacora).
        // Campo de texto: 16 px como piso (bajo 16 el iPhone hace zoom solo al tocarlo).
        campo:     ['calc(16px * var(--escala-texto, 1))'],
        // ── ESCALA TIPOGRÁFICA de la Constitución (§9) ────────────────────────
        // En PX a propósito: el `html` de esta app está al 87.5%, así que los
        // `rem` no dan los tamaños que la norma pide.
        // El piso de la escala es 11px: por debajo es "texto diminuto", que la
        // §64 prohíbe explícitamente. La app tenía 1.125 usos por debajo (8, 9
        // y 10px) — esa era la causa real de que se viera densa y no Apple.
        // Piso de 11 px también en PC: la raíz va al 87,5 % y `text-xs` (0.75rem) rendía
        // 10,5 px, medio punto bajo el mínimo del contrato. En móvil (raíz 16) sigue en 12.
        xs:        ['calc(max(0.75rem, 11px) * var(--escala-texto, 1))', { lineHeight: '1rem' }],
        caption:   ['calc(11px * var(--escala-texto, 1))', { lineHeight: '1.35' }],
        footnote:  ['calc(13px * var(--escala-texto, 1))', { lineHeight: '1.4' }],
        // body 17 (Apple: 17/22). Estaba en 15, que es el SUBHEAD de Apple: toda la app
        // iba un escalon por debajo de iOS y eso alimentaba la densidad. subhead y
        // callout se agregan para que el texto secundario pueda bajar sin inventar px.
        subhead:   ['calc(15px * var(--escala-texto, 1))', { lineHeight: '1.33' }],
        callout:   ['calc(16px * var(--escala-texto, 1))', { lineHeight: '1.31' }],
        body:      ['calc(17px * var(--escala-texto, 1))', { lineHeight: '1.3' }],
        headline:  ['calc(17px * var(--escala-texto, 1))', { lineHeight: '1.35', fontWeight: '600' }],
        title3:    ['calc(20px * var(--escala-texto, 1))', { lineHeight: '1.25', fontWeight: '600' }],
        title2:    ['calc(22px * var(--escala-texto, 1))', { lineHeight: '1.27', fontWeight: '600' }],
        title1:    ['calc(28px * var(--escala-texto, 1))', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        display:   ['calc(34px * var(--escala-texto, 1))', { lineHeight: '1.2',  letterSpacing: '-0.028em', fontWeight: '700' }],
        // Rol propio (no existe en la escala de Apple): el NUMERO de un KPI.
        // Estaba definido en docs/NUEVA_PIEL_APPLE_HIG.md §2 desde el 2026-08-09
        // pero nunca se agrego aca, asi que cada KPI eligio su tamano a mano.
        // OJO: Tailwind solo admite lineHeight/letterSpacing/fontWeight en este
        // objeto, asi que las cifras tabulares NO viajan con el rol —
        // `text-stat` va SIEMPRE acompanado de `tabular-nums`, o las columnas
        // bailan al refrescar con datos en vivo.
        stat:      ['calc(30px * var(--escala-texto, 1))', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '700' }],
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
