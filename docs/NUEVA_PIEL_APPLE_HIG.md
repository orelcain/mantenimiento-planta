# Nueva Piel de la PWA · Hallazgos del HIG de Apple y decisiones de diseño

> **Fuente única de la "nueva piel" estilo Apple.** Compilado 2026-08-09 desde las Human
> Interface Guidelines de Apple + valores oficiales de UIKit, con las decisiones ya tomadas
> en la sesión de diseño (mockups publicados como artifacts). Todo lo que se construya de la
> piel nueva se valida contra este documento.
>
> Mockups de referencia (artifacts, conmutador claro/oscuro):
> - Estructura (inicio/tab bar/hub): https://claude.ai/code/artifact/34c2745f-411a-47ae-bb46-ed872f2fb605
> - Sistema completo (tipografía/componentes/sheet/materiales): https://claude.ai/code/artifact/7d6c6aa8-7f68-4b01-adf3-54391ef4ff44
> - Colores y animaciones (6 demos de motion): https://claude.ai/code/artifact/681de9c0-e8bc-45a8-ba0e-d27ec533dc06

---

## 0 · Filosofía Apple (los 3 principios que ordenan todo)

1. **Claridad** — el contenido manda; la tipografía y el espacio hacen la jerarquía, no las cajas.
2. **Deferencia** — la UI cede ante la tarea del usuario. Aplicado a la PWA: la pantalla de
   inicio se reordena por urgencia (falla activa arriba de todo), y registrar incidencia es
   el gesto central permanente.
3. **Profundidad** — capas con significado: contenido sólido, cromo de navegación translúcido,
   modales que suben como sheets. La profundidad comunica dónde estás, no decora.

**Test para cada pantalla nueva:** ¿qué es lo más importante que el usuario necesita AHORA?
Eso debe ser lo más grande/primero. Todo lo demás cede.

---

## 1 · Color — tokens oficiales (DECIDIDO)

### 1.1 Tema claro = systemGrouped oficial de iOS

| Token | Valor | Uso |
|---|---|---|
| fondo | `#F2F2F7` | systemGroupedBackground — el lienzo gris |
| tarjeta | `#FFFFFF` | secondarySystemGroupedBackground — grupos/tarjetas |
| texto primario | `#000000` | label — SOLO títulos y contenido principal |
| texto secundario | `rgba(60,60,67,.60)` | secondaryLabel — subtítulos, metadatos |
| texto terciario | `rgba(60,60,67,.30)` | tertiaryLabel — placeholders, deshabilitado |
| separador | `rgba(60,60,67,.29)` | separator — líneas entre celdas |
| relleno de control | `rgba(120,120,128,.12)` | systemFill — fondos de search, segmented, sev |
| track/anillo | `#E5E5EA` | systemGray5 |

**El hallazgo anti-fatiga clave:** Apple NO oscurece el blanco para descansar la vista —
reduce la MASA de contraste duro con la jerarquía por opacidad. Solo el texto primario es
negro; todo lo demás es translúcido. Si una pantalla cansa, el error es exceso de `label`,
no falta de gris.

### 1.2 Tema oscuro = dark ELEVADO oficial (no el negro OLED base)

Apple tiene DOS juegos oscuros. El "base" (fondo `#000`) se descartó por dureza
(feedback de Orel 2026-08-09). Se usa el **elevado** (iPad/ventanas flotantes):

| Token | Valor | Uso |
|---|---|---|
| fondo | `#1C1C1E` | systemGroupedBackground elevado |
| tarjeta | `#2C2C2E` | secondarySystemGroupedBackground elevado |
| tarjeta 2º nivel | `#3A3A3C` | tertiary elevado (control sobre tarjeta) |
| texto primario | `#FFFFFF` | label |
| texto secundario | `rgba(235,235,245,.60)` | secondaryLabel |
| separador | `rgba(84,84,88,.65)` | separator |
| relleno de control | `rgba(120,120,128,.24)` | systemFill dark |
| sombras | **ninguna** | en oscuro la elevación es por TONO, no por sombra |

### 1.3 Acento de marca — ADAPTATIVO (decidido, opción C)

- Claro: **`#2E75B6`** (azul ANTARFOOD tal cual)
- Oscuro: **`#5AA0DC`** (mismo hue, luminosidad elevada por OKLCH — el puro se apaga sobre oscuro)
- Es el ÚNICO color no-Apple del sistema, a propósito: la app es ANTARFOOD.
- Regla HIG: el acento se usa en acción e interactividad (~10% de la interfaz), nunca decoración.

### 1.4 Semánticos — tintes de sistema oficiales

| Semántico | Claro | Oscuro |
|---|---|---|
| éxito / operando | `#34C759` | `#30D158` |
| advertencia / media | `#FF9500` | `#FF9F0A` |
| crítico / falla | `#FF3B30` | `#FF453A` |
| neutro / sin programar | `#8E8E93` | `#636366` |

**Regla de uso (híbrido con la decisión de julio):** los tintes vivos van SOLO en
superficies chicas — puntos de estado, pills (texto tinte + fondo tinte al 14%), deltas,
íconos < 30 px. Para RELLENOS GRANDES (segmentos de Gantt, paretos, fondos de sección)
sigue vigente el −50% croma de `softenAccentHex()` (decisión Orel 2026-07-19, PRs #240/#248).
No se revierte esa decisión: se acota a su caso real.

### 1.5 Pendiente de decisión de Orel

- [ ] ¿Claro Apple (`#F2F2F7`, frío) o "claro cálido" (`#EAE7E0`, papel — menos luz azul)?
  Ambos visibles en el artifact de estructura. El cálido NO es HIG; es candidato legítimo.

---

## 2 · Tipografía — escala oficial con roles (DECIDIDO)

Fuente: SF Pro en Apple; en la PWA (Windows/Android) la aproximación es
`-apple-system, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`.

Escala Dynamic Type de iOS (tamaño Large, el default) → mapeada a 8 roles de la app:

| Rol PWA | Estilo iOS | Tamaño/peso | Tracking | Uso en la app |
|---|---|---|---|---|
| `display` | largeTitle | 34/700 | −0.028em | título de página, UNO por pantalla |
| `title` | title1 | 28/700 | −0.026em | título de ficha/detalle |
| `section` | title3 | 20/600 | −0.02em | título de sección dentro de página |
| `headline` | headline | 15–17/600 | — | título de celda, incidencia |
| `body` | body/subheadline | 15/400 | — | texto corrido |
| `footnote` | footnote | 13/400 | — | metadatos, subtítulos de celda |
| `caption` | caption | 11/600 | +0.05em MAYÚS | encabezados de grupo, ejes |
| `stat` | (propio) | 30/700 tabular | −0.03em | KPIs numéricos |

Reglas duras:
- **8 roles, ni uno más.** Texto nuevo → rol existente más cercano. Nunca inventar tamaño.
- **Todo número que se lee como dato va tabular** (`font-variant-numeric: tabular-nums`) —
  imprescindible con datos en vivo para que las columnas no bailen al refrescar.
- Títulos grandes con tracking negativo; caption en mayúsculas con tracking positivo.
- Jerarquía por PESO y OPACIDAD antes que por tamaño.

---

## 3 · Layout y geometría (DECIDIDO)

- **Grilla de 8 pt**: todo espaciado es múltiplo de 8 (4 permitido en micro-espacios).
  Escala: 4 / 8 / 12 / 16 / 24 / 32.
- **Márgenes de pantalla**: 16 px compacto (móvil), 20 px regular (escritorio).
- **Padding interno de tarjeta**: 16 px.
- **Target táctil mínimo 44×44 px** — regla de oro con guantes en planta. La CELDA COMPLETA
  es clicable, nunca solo el chevron.
- **Radios (escala única, 4 valores)**: control 10 px · tarjeta/grupo 14–16 px ·
  contenedor grande/sheet 18–20 px · pill/avatar 999. Se ERRADICA la mezcla actual
  (rounded/sm/md/lg/xl conviviendo).
- **Sombras**: solo en claro, una sola receta suave (`0 1px 4px rgba(0,0,0,.05)` reposo,
  algo más al hover). En oscuro NO hay sombras: elevación por tono de superficie.
- Listas estilo **inset grouped**: grupo con fondo continuo y radios, separadores insetados
  (arrancan después del ícono, no tocan el borde izquierdo).

---

## 4 · Navegación y estructura (DECIDIDO en mockup; falta OK final)

- **Tab bar de 5 posiciones**: `Turno · Máquinas · [＋] · Aprender · Más`, con el **＋ central
  físico** (botón circular acento, elevado −24 px) = registrar incidencia desde cualquier
  lugar, precargando la máquina si vienes de su ficha. HIG: 3–5 tabs máximo.
- **Título grande** (largeTitle) que colapsa al hacer scroll → toolbar compacta.
- **Jerarquía push** con botón atrás "‹ Contexto" (nunca "‹ Volver" genérico).
- **La máquina como HUB**: la ficha de equipo absorbe los módulos sueltos — incidencias,
  historial/confiabilidad, repuestos, protocolo, planos, Centro de Aprendizaje, variador,
  HMI, 3D. Regla de reubicación: *describe a UNA máquina → vive en su ficha; describe al
  TURNO → vive en Turno; enseña → vive en Aprender; lo demás → Más*.
- **Inicio ordenado por urgencia**: falla activa = tarjeta de atención arriba (cronómetro +
  "Asignarme / Ver incidencia"), KPIs comprimidos. Sin fallas = anillo OEE protagonista +
  "✓ Sin incidencias activas · racha" como LOGRO de Mantención (meta grande: evidenciar el
  aporte).
- **Migración sin romper**: URLs actuales sobreviven por redirects.

---

## 5 · Componentes (catálogo base, DECIDIDO)

Los 5 primitivos a construir ANTES del barrido (todo lo demás se compone de estos):

1. **Button** — 4 énfasis: `filled` (acento, MÁXIMO UNO por vista), `tinted` (acento al
   13%), `plain` (texto acento), `destructive` (rojo tinted). 3 tamaños; deshabilitado =
   40% opacidad. Presión: scale(.96–.97).
2. **GroupedList / Cell** — grupo inset con radios 14–16; celda: ícono cuadrado redondeado
   28–30 px (color de estado) + título headline + subtítulo footnote + valor tabular derecha
   + chevron `›`. Separadores insetados. Celda completa táctil ≥44 px.
3. **Pill / StatusChip** — texto tinte + fondo tinte al 14%, radio 999. Reemplaza los ~899
   chips translúcidos ad-hoc actuales. Variantes: crítica/media/ok/neutra/en-vivo (con punto
   pulsante).
4. **Sheet** — modal que sube desde abajo con agarradera, fondo `rgba(0,0,0,.35)` + blur;
   500 ms curva iOS. Reemplaza TODOS los modales centrados.
5. **TabBar** (móvil) + **Toolbar** (escritorio) — translúcidas (ver materiales), con el ＋
   central en móvil.

Secundarios (misma piel, después): Switch iOS, Segmented con pulgar deslizante, Search
field (`systemFill`, radio 11), Stepper, Toast/alerta entrante, Skeleton, Empty state.

Estados obligatorios de cada componente: default / hover / focus-visible / active /
disabled / loading / error.

---

## 6 · Materiales — translucidez con reglas (DECIDIDO)

**El hallazgo que corrige el rumbo actual:** el "vidrio" Apple es un material de NAVEGACIÓN,
no un estilo de chips. Regla:

- **Material grueso** (blur 18, tarjeta al 72%): toolbar, tab bar, sidebars.
- **Material fino** (blur 12, tarjeta al 45%): overlays sobre gráficos/HMI.
- **Sólido**: TODO el contenido — tarjetas, listas, formularios, KPIs.

Es exactamente lo contrario del glassmorphism IA (tinte de color al 10% en cada badge).
Los 899 `bg-*/10` actuales se migran a Pill sólida o a fondo `systemFill`.

---

## 7 · Motion — especificación congelada (DECIDIDO)

| Categoría | Duración | Curva |
|---|---|---|
| micro (hover, presión) | 150–250 ms | `cubic-bezier(.32,.72,0,1)` (la de iOS) |
| transición de elementos | 300–550 ms | `cubic-bezier(.22,.9,.24,1)` entradas |
| entrada de datos (anillo, conteo) | ~1.1 s | ease-out cúbico |
| rebote (SOLO alertas entrantes) | 550 ms | `cubic-bezier(.28,1.35,.4,1)` |

Reglas duras:
- Animar SOLO `transform` y `opacity` (nunca layout) — 60 fps garantizados.
- **Un protagonista por pantalla** (el anillo OEE en Turno). Stagger máx. 5 elementos, 70 ms.
- Pulso "En vivo": anillo que respira 2.2 s, nunca parpadeo.
- TODO dentro de `@media (prefers-reduced-motion: reduce)`.
- Nada supera 1.2 s.
- Sheet: 500 ms; segmented: el pulgar VIAJA (320 ms), no salta.

---

## 8 · Accesibilidad (no negociable)

- Contraste WCAG AA mínimo: 4.5:1 texto normal, 3:1 texto grande — verificar con
  `scripts/check-contrast.mjs` cada par nuevo.
- Targets 44 px; focus visible en todo interactivo; `prefers-reduced-motion`.
- Los semánticos nunca son el ÚNICO canal: siempre color + texto/forma (pill dice "Crítica",
  no solo es roja).
- Dynamic Type futuro: tamaños en rem, no px duros, para poder escalar.

---

## 9 · Anti-patrones a ERRADICAR de la PWA actual (auditoría 2026-08-09)

| Anti-patrón | Medido | Reemplazo |
|---|---|---|
| Emojis como íconos en JSX | 288 ocurrencias | Lucide (ya en 228 archivos) con tamaño/stroke únicos |
| Colores Tailwind sueltos (`amber-400`…) | ~1.500 | tokens semánticos de §1 |
| Radios mezclados (sm/md/lg/xl/full) | 663+575+327+279+104+66 | escala única de §3 |
| Chips translúcidos `bg-*/10` | 899 | Pill sólida / systemFill |
| Modales centrados con borde | — | Sheet (§5.4) |
| Spinners centrados | — | Skeletons |
| Menú de módulos kilométrico | — | 4 tabs + hub máquina (§4) |
| Texto secundario en gris sólido | — | opacidades label de §1 |

---

## 10 · Plan de migración (orden acordado)

1. **Congelar tokens** en `tailwind.config.js` + `index.css` (variables de §1–§3, tras la
   decisión claro frío/cálido). Los HMIs/simuladores y el visor 3D quedan FUERA (oscuros a
   propósito, referencia de máquina real).
2. **Construir los 5 primitivos** (§5) con sus estados.
3. **Pantalla piloto**: Análisis de Turno real EN RAMA con datos vivos → Orel la prueba en
   su teléfono ANTES de cualquier barrido.
4. **Estructura**: tab bar + hub máquina + inicio por urgencia (redirects para URLs viejas).
5. **Barrido módulo a módulo** contra la tabla de §9, con script de auditoría (extender
   `scripts/audit-theme.mjs` para detectar emojis/colores sueltos/radios fuera de escala).
6. Verificación SIEMPRE en ambos temas (`/tema-claro-oscuro`) + contraste.

---

## Fuentes

- HIG Apple: https://developer.apple.com/design/human-interface-guidelines/ (color, dark-mode,
  layout, typography, motion, materials)
- Valores semánticos UIKit light/dark: https://sarunw.com/posts/dark-color-cheat-sheet/
- Tintes de sistema: https://swiftuicolors.com/ios-colors
- Layout/44pt/8pt/inset-grouped: gist "Apple HIG Layout & Spacing", docs `insetGrouped`,
  `RoundedCornerStyle.continuous` (developer.apple.com)
- Auditoría del código propio: sesión 2026-08-09 (grep sobre `apps/pwa/src`, 306 tsx)
