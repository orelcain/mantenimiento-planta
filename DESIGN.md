# DESIGN.md — PWA de Mantención ANTARFOOD

> **Qué es este archivo.** El contrato visual que cualquier agente (Claude, Codex, Aider) debe
> leer ANTES de escribir una línea de UI. Es el par de `AGENTS.md`: ese dice *cómo se construye
> el proyecto*, éste dice *cómo debe verse*.
>
> **Objetivo en una frase:** "Apple diseñando una herramienta industrial profesional."
> No una página decorada. No un dashboard genérico. No un ERP tradicional.
>
> **Vara viva:** https://claude.ai/artifact/9J1LM6QX3QzHmCw1hAr9rV — la pantalla de Turno en
> claro y oscuro a 375 px, con las comparaciones antes/después.

## Cadena de autoridad

1. `ARIA_MANTENIMIENTO_PLANTA\docs\CONSTITUCION_DISENO_APPLE.md` (OneDrive) — norma suprema.
2. `ARIA_MANTENIMIENTO_PLANTA\docs\NUEVA_PIEL_APPLE_HIG.md` (OneDrive) — tokens medidos.
3. Este archivo — destilado operativo.

⚠️ **Excepción vigente (2026-09-15).** Los docs 1 y 2 se compilaron el 2026-08-09 contra el
HIG de **iOS 18**. Desde entonces se verificó que iOS 26/27 cambió radios, tamaño de body y
el tratamiento de los encabezados. En **los tres puntos marcados como ⚠️ADELANTA** más abajo,
este archivo está más al día y manda; el resto sigue la cadena normal. Actualizar los docs
canónicos es tarea pendiente de Orel — hasta entonces esta excepción queda escrita acá.

Para cambios visuales no triviales, además: mockup primero (`/mockup-antes-de-construir`).

---

## 0 · Lo que Apple documenta y lo que no

Esto ordena todo lo demás, así que va primero.

Para todo iOS, Apple publica **dos** números: el objetivo táctil de **44 pt** y una capa de
atenuación del **35 %** bajo vidrio *clear* sobre contenido brillante. Ningún radio, ningún
blur, ninguna sombra, ningún hex garantizado. Ni los desarrolladores pueden leer el radio de
un grupo de lista: la API devuelve 0.

**Consecuencia:** la vara no es "los valores de Apple". Es **nuestros valores, calibrados
contra la mejor medición pública disponible**. Cada valor de este archivo lleva marca:

- **[APPLE]** — documentado por Apple (HIG o sesión WWDC).
- **[MEDIDO]** — medición pública contra el iOS real. Es aproximación, no spec.
- **[NUESTRO]** — decisión del proyecto. Legítima, pero no atribuible a Apple.

---

## 1 · Los tres principios [APPLE]

- **Claridad** — el contenido manda. La jerarquía la hacen la tipografía y el espacio, no las cajas.
- **Deferencia** — la UI cede ante la tarea. El inicio se reordena por urgencia.
- **Profundidad** — capas con significado. Contenido sólido, cromo translúcido, sheets que suben.

Antes de agregar cualquier elemento: *¿ayuda a comprender el estado del sistema o a realizar
una acción?* Si no, se elimina.

---

## 2 · Tipografía

### Escala Dynamic Type, tamaño Large [APPLE]

| Rol | Tamaño / interlineado | Peso | Peso enfatizado |
|---|---|---|---|
| largeTitle | 34 / 41 | Regular | Bold |
| title1 | 28 / 34 | Regular | Bold |
| title2 | 22 / 28 | Regular | Bold |
| title3 | 20 / 25 | Regular | Semibold |
| headline | 17 / 22 | **Semibold** | Semibold |
| body | **17** / 22 | Regular | Semibold |
| callout | 16 / 21 | Regular | Semibold |
| subhead | 15 / 20 | Regular | Semibold |
| footnote | 13 / 18 | Regular | Semibold |
| caption1 | 12 / 16 | Regular | Medium |
| caption2 | 11 / 13 | Regular | Semibold |

**Piso 11 px. Default 17 px** [APPLE]. Por debajo de 11 es "texto diminuto" y está prohibido
(Constitución §64). Esa es la causa medida de que la app se viera densa, no el color.

⚠️**ADELANTA 1 — `body` es 17, no 15.** El contrato anterior tenía el texto corrido en 15 px,
que es el `subhead` de Apple. Toda la app estaba un escalón por debajo de iOS, alimentando
justo la densidad que combatimos. `title2` va a 22 (estaba en 23) y `largeTitle` a 34.

Lo que **no** cambió en iOS 26/27: los tamaños son los mismos que iOS 18. Lo que se movió fue
el **uso de pesos** — *"la tipografía se refinó para reforzar claridad y estructura, ahora más
pesada y alineada a la izquierda"* [APPLE, WWDC25]. Apple agregó la columna de peso enfatizado
a la tabla oficial en diciembre de 2025.

### Reglas [APPLE]

- Jerarquía por **peso + tamaño + color**, nunca por uno solo.
- **Evitar pesos ligeros**: usar Regular, Medium, Semibold o Bold. Nunca Ultralight, Thin, Light.
- Minimizar el número de tipografías.
- Familia: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`.
  SF Pro **no se puede servir como webfont** (licencia Apple): fuera de Apple cae a Segoe UI o Roboto.

### Números tabulares [NUESTRO]

Todo número que se lee como **dato** va `tabular-nums`, para que las columnas no bailen al
refrescar. Importante: **Apple no tiene regla escrita sobre esto** — la HIG de tipografía no lo
menciona. La capacidad existe en la API; la regla es nuestra, y es buena. No atribuirla a Apple.

### ⚠️ADELANTA 2 — MAYÚSCULAS: se van

**iOS 26 quitó las mayúsculas de los encabezados de sección.** Donde Ajustes decía "VISION",
ahora dice "Vision": formato oración, más grande, algo más pesado para compensar el énfasis
perdido. El uppercase era el comportamiento **por defecto del estilo agrupado** hasta iOS 18
(SwiftUI convertía solo; había que pedir `.textCase(nil)` para evitarlo).

- **Los ~160 `uppercase` de la app SÍ se barren.** Una versión anterior de este archivo decía
  lo contrario; era un error.
- Quedan legítimas en **códigos SAP, tags e identificadores técnicos**. Eso no es texto de
  interfaz.
- **Encabezado de grupo — PENDIENTE DE CALIBRAR.** Nadie publica el tamaño/peso exactos del
  header nuevo, ni Apple ni mediciones de terceros. Lo sostenido por fuentes: *más grande que
  13 px, más pesado que Regular, formato oración*. Propuesta provisoria: **16 px / 600, tinta
  primaria**. Confirmar contra una captura real de Ajustes en iOS 27 antes de congelarlo.

---

## 3 · Color

**Prohibido:** hex inventados, clases Tailwind de color crudas (`text-amber-400`), grises
sólidos para texto secundario, emojis como íconos (usar Lucide).

### Tema claro — systemGrouped [MEDIDO]

| Token | Valor |
|---|---|
| fondo | `#F2F2F7` |
| tarjeta | `#FFFFFF` |
| texto primario | `#1C1C1E` |
| texto secundario | `#6E6E71` |
| texto terciario | `rgba(60,60,67,.30)` |
| separador | `rgba(60,60,67,.29)` |
| relleno de control | `rgba(120,120,128,.12)` |

### Tema oscuro — dark ELEVADO, no el negro OLED [MEDIDO]

| Token | Valor |
|---|---|
| fondo | `#1C1C1E` |
| tarjeta | `#2C2C2E` |
| tarjeta 2º nivel | `#3A3A3C` |
| texto primario | `#FFFFFF` |
| texto secundario | `rgba(235,235,245,.60)` |
| separador | `rgba(84,84,88,.65)` |
| sombras | **ninguna** — elevación por tono |

**Hallazgo anti-fatiga:** Apple no oscurece el blanco, reduce la masa de contraste duro con
jerarquía por opacidad. Si una pantalla cansa, el error es exceso de `label`, no falta de gris.

### Acento de marca — adaptativo [NUESTRO]

Claro `#2E75B6` · oscuro `#5AA0DC`. Único color no-Apple del sistema, a propósito. Se usa en
acción e interactividad, ~10 % de la interfaz. Nunca decoración.

### Semánticos — estado [MEDIDO]

| | Claro | Oscuro |
|---|---|---|
| éxito / operando | `#34C759` | `#30D158` |
| advertencia | `#FF9500` | `#FF9F0A` |
| crítico / falla | `#FF3B30` | `#FF453A` |
| neutro | `#8E8E93` | `#636366` |

**Apple no publica hex garantizados**: los system colors son tokens adaptativos que cambian con
el entorno, y los valores que circulan son medición de la comunidad. Los nuestros están
verificados contra contraste en `check-contrast.mjs`, que es lo que importa.

### Rellenos de estado — `bg-fill-*` [NUESTRO, medido]

| Token | Valor | Con blanco encima |
|---|---|---|
| `bg-fill-critical` | `#8C4B45` | 6.55 : 1 |
| `bg-fill-warning` | `#7A5A1E` | 6.35 : 1 |
| `bg-fill-ok` | `#2F6B41` | 6.36 : 1 |

**Los tres llevan `text-white`** y rondan el mismo contraste a propósito: un sistema
donde cada relleno pide una tinta distinta se usa mal.

**Cuándo usarlos:** solo en el caso real de relleno **opaco** de estado — una barra de
gráfico, un segmento de Gantt, una cabecera de estado. **Nunca en un botón**: el botón de
estado en iOS es *tinted* (ver §5). Los semánticos vivos (`bg-red-500`) son para **tintes
al 8–15 %**, donde el color apenas se insinúa. Usados como relleno opaco se ven chillones
*y* reprueban AA: `bg-red-500` con blanco da 3.41:1.

**Señal de alarma:** si estás por poner texto blanco sobre un relleno de color, el patrón
suele estar mal antes que el color. Sus valores no son hexes libres: son system colors de
Apple oscurecidos hasta cumplir AA, la misma lógica que el §1.4 del HIG doc aplicó al verde
(`#248A3D` → `#217E38`).

⚠️ **Por qué no se resolvió desaturando `red-500`:** ese token también alimenta los
tintes de las Pills. Bajarle el croma deja el chip crítico oscuro en **4.50:1**, el
mínimo exacto — cualquier redondeo lo tumba, y son los chips que marcan una falla de
línea. Los rellenos necesitan tokens propios, no un token compartido debilitado.

### `destructive` está partido en dos

Un relleno lleva texto blanco encima, así que debe ser **oscuro**. Una tinta va sobre la
superficie del tema, así que en oscuro debe ser **clara** — al revés. Un valor único no
puede hacer las dos cosas, y el anterior (`#bf6c61`) reprobaba en ambas.

| | Valor | Contraste |
|---|---|---|
| `bg-destructive` | systemRed vivo (`--tw-red-500`) | solo como base de tinte, nunca opaco |
| `bg-destructive-tint` | systemRed al 13 % **ya compuesto sobre card**, opaco | 4.72 claro / 4.73 oscuro |
| `text-destructive` | `--tw-red-600` adaptativo | 5.60 claro / 5.39 oscuro |

En `tailwind.config.js` viven separados: `backgroundColor.destructive` y
`textColor.destructive`. El bloque `colors.destructive` queda para `border-destructive`.

**Por qué el tinte va opaco y no con alfa:** un `bg-destructive/13` transparente se apoya en
lo que haya debajo — sobre card da 4.70, sobre el fondo gris cae a 4.25. Con la base fija
cumple siempre y sobre card se ve idéntico. Es el patrón de iOS: los controles viven sobre
una superficie propia, no sobre el fondo pelado.

**Caminos que se probaron y NO son la solución** (para que nadie los repita): oscurecer el
texto — el systemRed *accessible* de Apple (`#D70015`) da 4.08 ahí, peor que el actual;
subir el tinte — al 20 % da 3.88 y al 28 % da 3.49. El problema nunca fue la tinta sino la
superficie.

### La regla de superficie — la que más decide el resultado

Los tintes vivos van **solo en superficies chicas**: puntos de estado, deltas, íconos bajo
30 px, texto. Un relleno sólido de 30 px, y tres en fila, ya es un semáforo de ERP.

**El color de estado NO va en el ícono de una celda.** El ícono va neutro (`systemFill`); el
estado viaja en un punto de 8 px, en el texto y en el valor fuera de rango. La Constitución
exige que el color nunca sea el único canal, así que esto no quita información: la reparte.

Para rellenos grandes (Gantt, paretos, fondos de sección) sigue vigente el −50 % croma de
`softenAccentHex()` (decisión Orel 2026-07-19, PRs #240/#248).

**Pill: texto = tono 600 sobre fondo = tono 500 al 8 %.** El 8 % está medido: al 14 % el rojo
reprueba AA (4.24:1). Peor caso al 8 %: 4.57:1.

### Categóricos — cuando NO hay orden

Tipo de repuesto, causal, turno, área. 8 tonos sin jerarquía, tokens `--cat-N-ink` /
`--cat-N-tint`, siempre por el primitivo `<Tag tone={1..8}>`. Tono por **índice estable**, no
por hash del texto. Usar la escala semántica para categorizar hace que *un rodamiento se lea
como alerta*.

---

## 4 · Geometría

### ⚠️ADELANTA 3 — Radios: iOS 26 los agrandó

[APPLE] *"Las secciones tienen un radio de esquina aumentado para coincidir con la curvatura de
los controles del sistema"* y *"los botones con borde ahora tienen forma de cápsula por
defecto"*. Nuestros 10–16 px eran de la era iOS 7–18.

| Elemento | Antes | **Ahora** |
|---|---|---|
| Grupo de lista / tarjeta | 10–16 | **26** |
| Botón | 10 | **cápsula** (`999px`) |
| Campo de búsqueda | 11 | **22** |
| Segmented | 9 | **cápsula** fuera y dentro (iOS 26+; hasta iOS 18 era 16) |
| Sheet / modal | 18–20 | **32** |
| Alerta | 14 | **36** |
| Pill / avatar | 999 | 999 |

**Concentricidad** [APPLE], que es la regla detrás de todo: el radio de un elemento anidado
**se deriva** del contenedor, no se elige. `radio_hijo = radio_padre − padding`. Por eso la tab
bar flotante es cápsula: su radio es la mitad de su altura.

### Espaciado y targets

- **Grilla de 8 pt** [NUESTRO — Apple no documenta una grilla para iOS]. Escala 4/8/12/16/24/32.
  Prohibidos los arbitrarios (13, 19, 27).
- Márgenes de pantalla: **16 px móvil, 20 px escritorio** [MEDIDO].
- Padding de tarjeta: 16–18 px. Altura mínima de celda de lista: **52 px** [MEDIDO].
- **Target táctil 44×44 px** [APPLE]. Es el objetivo de diseño; 28 px es el piso absoluto de
  accesibilidad, no una autorización para bajar. La celda completa es clicable, nunca solo el
  chevron. Se usa con guantes.
  ⚠️ `html` está a 87.5 % en PC: `rem` **no** da 44 px. Usar px.
- **Sombras**: solo en claro, receta única `0 1px 4px rgba(0,0,0,.05)`. En oscuro, ninguna.
- **Separar con espacio, no con línea.**
- Listas **inset grouped**: fondo continuo, separadores insetados (arrancan después del ícono).

### Squircle — no invertir

Apple usa `continuous corners`, que no es un `border-radius` circular. En CSS existe
`corner-shape: squircle`, pero **Safari iOS no lo soporta** — justo el navegador donde se
vería. A radios de UI la diferencia es difícil de ver, y el look de iOS lo dan mucho más la
tipografía, los márgenes y el separador. Dejarlo como mejora progresiva de una línea y nada más:

```css
.card { border-radius: 26px; }
@supports (corner-shape: squircle) { .card { corner-shape: squircle; } }
```

---

## 5 · Los 5 primitivos

Todo se compone de estos. Si falta uno, se crea siguiendo esta spec. **Nunca un one-off.**

1. **Button** — `filled` (acento, MÁXIMO UNO por vista) · `tinted` · `plain` ·
   `destructive` (**rojo tinted con base opaca**, `bg-destructive-tint text-destructive` —
   nunca un bloque rojo con texto blanco, eso no existe en iOS y daba 2.59:1).
   **Cápsula.** Deshabilitado 40 % opacidad. Presión `scale(.96–.97)`.
   Alturas del primitivo: default `h-11` (44 px táctil), `sm` 36, `lg` 48, `icon` 44×44.
   En `rem` a propósito: el root vuelve a 16 px con puntero grueso, así que da 44 con guante
   y ~38 con mouse. `h-[44px]` rompería esa decisión.
   ⚠️ No pisar el variant con clases crudas (`className="bg-red-600 text-white"`): el
   variant existe para eso y ya está medido.
2. **GroupedList / Cell** — ícono neutro 30 px + título `body` + subtítulo `footnote` + valor
   tabular a la derecha + chevron. Celda ≥52 px. Estado en punto de 8 px, no en el ícono.
3. **Pill / StatusChip** — ver §3. Variantes crítica/media/ok/neutra/en-vivo.
4. **Sheet** — sube desde abajo con agarradera, radio 32, fondo `rgba(0,0,0,.35)` + blur, 500 ms.
   **Reemplaza todos los modales centrados.**
5. **TabBar flotante** (móvil) + **Toolbar** (escritorio).

Estados obligatorios de cada uno: default / hover / focus-visible / active / disabled /
loading / error.

---

## 6 · Materiales — el vidrio es navegación, no decoración

### Las reglas duras [APPLE, textuales]

- *"No uses Liquid Glass en la capa de contenido."*
- *"Evita siempre vidrio sobre vidrio."*
- *"Evita tintar todos tus elementos"* — el tinte es solo para la **acción primaria**.
- *"Limita estos efectos a los elementos funcionales más importantes de tu app."*

**Traducción:** listas, tablas, tarjetas, KPIs y gráficos van **sólidos**. El vidrio es la capa
de navegación flotante: tab bar, toolbar, sheet, menú contextual. Prohibido `bg-*-500/10` nuevo
— eso es glassmorphism de IA, lo contrario del material Apple.

### Variantes [APPLE]

- **Regular** — difumina y ajusta la luminosidad del fondo para mantener legibilidad. Es la que
  usan casi todos los componentes del sistema. Úsala por defecto.
- **Clear** — muy translúcida, solo sobre contenido media-rich, y solo si se cumplen las tres
  condiciones de Apple. *"Nunca se deben mezclar."* En esta app: no se usa.

### La receta iOS 27 [MEDIDO — Apple no publica valores]

iOS 27 cambió cuatro cosas sobre iOS 26: difusión más efectiva del contenido de atrás,
refracción mejorada, **borde oscurecido** y **specular highlights más brillantes**.

```css
background: rgba(var(--card-rgb), .82);
backdrop-filter: blur(24px) saturate(180%);
box-shadow:
  inset 0 .5px 0 var(--spec-hi),    /* specular: ESTE es el efecto */
  inset 0 0 0 .5px var(--dark-edge); /* borde oscurecido */
```

`--spec-hi`: `rgba(255,255,255,.75)` claro, `rgba(255,255,255,.22)` oscuro.
`--dark-edge`: `rgba(0,0,0,.14)` claro, `rgba(0,0,0,.45)` oscuro.

**El inset highlight superior ES el efecto.** Bajarlo aplana el panel al instante.

### Techo técnico — aceptarlo y no pelearlo

`backdrop-filter` **no desplaza píxeles**, así que la refracción de Apple **no se puede
reproducir en CSS**. Requiere un filtro SVG sobre el backdrop, que solo funciona en Chromium —
justo no en Safari. No invertir ahí.

Y el vidrio **solo se ve sobre fondo complejo**. Sobre un relleno plano no tiene nada que
muestrear y queda un rectángulo gris. Si el fondo es plano, usá sólido.

### Accesibilidad del material

- `prefers-reduced-transparency` → cromo sólido, se conserva el borde. **Obligatorio**: hoy la
  app tiene 84 `backdrop-blur` y cero respaldo.
- `prefers-contrast: more` → borde de alto contraste.
- `prefers-reduced-motion` → sin morphing.

El slider de transparencia de iOS 27 (Ajustes → Appearance → Liquid Glass, continuo entre *More
Clear* y *More Tinted*) **no tiene equivalente web**. Si se quisiera, sería una preferencia
propia de la app modulando una variable de opacidad.

---

## 6b · Tema: uno solo, y es del sistema

- La app tiene **dos temas, claro y oscuro, y los decide el sistema o el usuario en Ajustes**.
  **Ningún módulo tiene un modo de color propio.** En iOS el tema es del sistema, nunca de
  una sección. El Grader tenía un tercer modo (un toggle sol/luna que arrancaba siempre en
  oscuro, ignorando el tema de la app); desde 2026-09-16 hereda el tema en vivo y el toggle
  se retiró. `useIsDark()` en `hooks/useTheme.ts` es la forma de preguntar por el tema.
- **Los grises son neutros.** Sesgo de hue ≤ 5 (diferencia máx. entre canales RGB). La
  escala *slate* de Tailwind tiene sesgo 27–34 y hace que un módulo se lea como de otra app
  aunque cada color cumpla contraste. Los grises de iOS: `#1C1C1E` (2), `#6E6E71` (3),
  `#C6C6C8` (2).
- **Texto de marca fuera de una card → `text-brand-ink`**, no `text-primary`. El acento puro
  sobre card pasa (4.84) pero sobre el fondo reprueba (4.34), y sobre su propio tinte al 15 %
  da 3.60. Quedan ~95 usos de `text-primary` sobre tinte por migrar, caso por caso.
- Paletas propias legítimas: `shift-ramp` y `mon-*` (magnitud, derivadas del hue de marca).
  Los `lc-*` del Centro de Aprendizaje cumplen AA pero son una familia que no existe en iOS —
  **decisión abierta** (ver §13).

---

## 7 · Navegación

- **Tab bar flotante** [APPLE]: redondeada, separada de los tres bordes, despegada del fondo,
  con material de vidrio. Una barra rectangular de borde a borde es iOS 15 y delata la pantalla.
- **Agrupación de toolbar** [APPLE]: los ítems se colocan sobre una superficie de vidrio
  compartida y **se agrupan automáticamente**. En CSS: **una cápsula de vidrio con varios
  íconos dentro**, separada de otras cápsulas por un gap. No un vidrio por botón.
- **Scroll edge effect** [APPLE]: *"a medida que el contenido empieza a scrollear bajo un
  elemento de vidrio, el efecto disuelve suavemente el contenido en el fondo"*. No es solo el
  blur de la barra: es una franja con máscara degradada sobre el contenido.
- **Search en iPhone va abajo**, al alcance del pulgar [APPLE].
- **El ＋ central** [NUESTRO, desviación consciente]: un botón elevado por fuera de la barra es
  un FAB de Android y no existe en iOS. Va **dentro** de la cápsula flotante. La vía Apple pura
  sería una acción en la toolbar superior.

---

## 8 · Motion [MEDIDO]

| Categoría | Duración | Curva |
|---|---|---|
| micro (hover, presión) | 150–250 ms | `cubic-bezier(.32,.72,0,1)` |
| transición de elementos | 300–550 ms | `cubic-bezier(.22,.9,.24,1)` |
| entrada de datos (anillo, conteo) | ~1.1 s | ease-out cúbico |
| rebote (SOLO alertas entrantes) | 550 ms | `cubic-bezier(.28,1.35,.4,1)` |

- Animar **solo** `transform` y `opacity`. Nunca layout.
- Un protagonista por pantalla. Stagger máx. 5 elementos, 70 ms.
- Todo dentro de `@media (prefers-reduced-motion: reduce)`. Nada supera 1.2 s.

---

## 9 · Accesibilidad

- WCAG AA: 4.5:1 texto normal, 3:1 texto grande. Verificar cada par nuevo con
  `node scripts/check-contrast.mjs`.
- Los semánticos **nunca** son el único canal: color + texto/forma.
- Focus visible en todo interactivo.

---

## 10 · Anti-patrones

| Anti-patrón | Reemplazo |
|---|---|
| Emojis como íconos en JSX | Lucide |
| Colores Tailwind sueltos | tokens de §3 |
| Radios `sm/md/lg/xl` o 10–16 px | escala de §4 |
| Chips translúcidos `bg-*/10` | Pill sólida / systemFill |
| `bg-red-500` / `bg-amber-500` opacos en gráficos | `bg-fill-critical` / `bg-fill-warning` |
| `bg-red-600 text-white` en un botón | `variant="destructive"` (tinted) |
| `text-primary` sobre tinte o sobre el fondo | `text-brand-ink` |
| Grises de la escala *slate* | grises neutros de iOS (§6b) |
| Un módulo con su propio toggle de tema | heredar el tema de la app (§6b) |
| Botón o input bajo 44 px táctiles | el primitivo (`h-11`) o `min-h-[44px]` — nunca `min-h-11`, no existe |
| Número de KPI grande (≥ 20 px) en color de estado | número en `text-foreground`; el estado en la barra, el punto o el rótulo de al lado (Salud, Bolsa) |
| `cat-5-ink` (rosa de *categoría*) como "crítico" | `text-ink-crit` / `bg-red-500/[0.15]` — categoría y estado son escalas distintas |
| `text-amber-400` / `text-emerald-400` / `text-red-400` como estado | `text-ink-warn` / `text-ink-ok` / `text-ink-crit` (adaptativas y ya medidas) |
| Ícono de tile del home tintado con glifo en tono 500 vivo | tile neutro: `bg-muted-foreground/[0.12]` + glifo `text-muted-foreground` |
| Tinte de botón con alfa (`bg-x/13`) | tinte opaco precalculado sobre card |
| Modales centrados | Sheet |
| Spinners centrados | Skeletons |
| Texto secundario en gris sólido | opacidades de §3 |
| Texto bajo 11 px | rol tipográfico de §2 |
| Encabezado de grupo en MAYÚSCULAS | formato oración, §2 |
| Ícono de celda con relleno de estado | ícono neutro + punto de 8 px |
| Barra de acento lateral en tarjetas | patrón web, no existe en iOS |
| Botón elevado fuera de la barra (FAB) | dentro de la cápsula |

---

## 11 · Verificación

```bash
node scripts/audit-piel.mjs      # ratchet: las violaciones NO pueden aumentar
node scripts/audit-theme.mjs     # tema claro/oscuro
node scripts/check-contrast.mjs  # WCAG AA · 108 pares
```

Y **en el navegador**, con `?skin=apple` y a 375 px: `scripts/medir-en-pantalla.md` trae
tres medidores para pegar en la consola — targets bajo 44 px (distingue primitivo de botón a
mano), rellenos saturados grandes, y overflow horizontal. Los auditores leen el código; estos
leen lo que se **pinta**, que es donde aparecieron todos los defectos del 2026-09-15.

1. **Mirar la pantalla a 375 px.** El escritorio engaña: el home móvil era una grilla de
   mosaicos (lenguaje Android) y en escritorio no se notaba.
2. Verificar en **ambos temas**.
3. Prueba final: *¿podría pertenecer a una app profesional moderna hecha con las HIG de Apple,
   adaptada a un sistema industrial?* Simple, espaciosa, precisa, silenciosa, rápida, coherente,
   premium, funcional.

---

## 12 · Notas para un agente sin visión (Codex)

Codex no puede juzgar si algo se ve bien. Reparto:

- **Claude decide** qué rol tipográfico, qué token, qué primitivo. Mira a 375 px.
- **Codex aplica** el cambio en volumen y corre los tres auditores de §11.
- Codex **nunca** elige un tamaño, un color ni un radio por su cuenta. Si el contrato no cubre
  el caso, para y pregunta.
- **Ningún barrido masivo de `uppercase`** sin leer cada contexto: los códigos SAP y tags se
  quedan.

⚠️ Al escribir en este repo desde Codex: los acentos se corrompen al pasar por el pipe de
PowerShell. Patrón obligatorio: Codex vuelca el resultado a JSON en su cwd, y Claude lo aplica
con un script Node local (`writeFileSync` en `utf8`).

---

## 13 · Pendientes

1. **Calibrar el encabezado de grupo** contra una captura real de Ajustes en iOS 27. Es el
   único valor de este contrato que nadie publica. Propuesta provisoria: 16 px / 600.
2. **Actualizar los docs canónicos de OneDrive** con los tres ⚠️ADELANTA (radios, body 17,
   mayúsculas), más dos correcciones ya detectadas: el §5.3 del HIG doc dice Pill al 14 % cuando
   su propio §1.4 demuestra 8 %; y los nombres de roles del §2 no coinciden con
   `tailwind.config.js`.
3. ~~Agregar el rol `stat`~~ — hecho 2026-09-15. `text-stat` va siempre con `tabular-nums`.
4. ~~Implementar `prefers-reduced-transparency`~~ — hecho 2026-09-15 en `index.css`, cubre
   los 84 `backdrop-blur` sin tocar archivos.
5. **Texto diminuto y mayúsculas — estado real medido el 2026-09-16.** Las pantallas de
   uso diario en el teléfono (home, Incidencias, Calendario, Análisis de Turno, Repuestos)
   ya están en **0 / 0**. El primitivo `Tag` estaba a 10,88 px y se subió a 11 (671 textos
   solo en Bodega). Los 281 `text-[8/9/10px]` restantes viven en **editores de mapa y HMI
   de PC** (`PanelCapasYZonas` 50, `HmiBombeoS2Public` 33, `ShapeEditorDialog` 21…) y el
   único de teléfono con deuda es `PublicShiftMonitorPage` (16 diminutos + 14 mayúsculas).
   De las 162 mayúsculas, 109 son el patrón de encabezado iOS 18 (`font-semibold uppercase
   tracking-wide`): se convierten cambiando clases, sin tocar texto.
   ⚠️ **Los NOMBRES de repuesto llegan en MAYÚSCULAS desde SAP** ("JUEGO O'RING VITON EN
   MILIMETROS"): 153 en la pestaña Bodega. Es dato, no CSS, y es lo que da el aspecto de
   ERP. Corregirlo es un formateador de presentación con protección de siglas (VITON,
   NFPA, SAP), no una clase — decisión de producto.
   ✅ 2026-09-16: `formatNombreSAP` con diccionario de tildes de planta, nombres propios
   (Chonchi, Yal, Marelec…) y siglas de área (DAF, RILES), aplicado a repuestos, ubicaciones de
   bodega, árbol de áreas, selectores del CTD y listas de Equipos y Jerarquía. Lo que no está en
   el diccionario baja de caja sin tilde: se agregan palabras ahí, no parches por pantalla.
5b. **Bodega (Repuestos)** — mockup publicado el 2026-09-16:
   https://claude.ai/artifact/VYgqKho8xrCyR6zGQnuTPL (375 px, claro y oscuro, datos reales).
   Diagnóstico: seis tiles de KPI con círculo de color, botones de acción con relleno
   verde/ámbar/azul, banda roja de alertas con pills, canto de estado + fondo teñido + barra
   verde en cada tarjeta, tres botones por tarjeta, scroll anidado de 60 vh y nombres SAP en
   mayúsculas. Respuesta iOS 27: chips de filtro (activo en marca, punto de 8 px como estado),
   celda de alertas con tile rojo y badge numérico (patrón Ajustes), lista agrupada radio 26
   con cifra en `text-foreground` y estado en rótulo de 13 px, acciones por deslizamiento,
   segmentado de 3 vías arriba y sub-vista desde el título, formateador de nombres SAP.
   ✅ Construido el 2026-09-16 en el PR #1055 con las cuatro decisiones tal como las proponía
   el mockup. Primitivos nuevos en la piel: `SegmentedControl` (cápsula, 44 px) y `SwipeRow`
   (deslizar en táctil, hover en PC). `formatNombreSAP` en `utils/repuestos` con 22 tests.
   Pendiente de Orel: probar el deslizamiento con guantes en el teléfono de pruebas.
5c. **Centro Técnico Documental** — mockup publicado el 2026-09-16:
   https://claude.ai/artifact/3zhE9CC4CJpgRFazhTBf4v. Medido a 375 px: 214 de 220 objetivos
   bajo 44 px, seis `<select>` nativos de 31 px en fila, cuatro tiles con la cifra en color,
   fila con cinco badges y dos botones fantasma, nombres SAP en mayúsculas. Respuesta: chips de
   filtro, botón «Filtros» con badge que abre una hoja (radio 32) con lista agrupada, fila con
   criticidad como letra en círculo neutro (solo «A» en relleno de etiqueta) y estado en rótulo,
   deslizar para QR/Tablero/favorito, «⋯» para datos, `formatNombreSAP` para nombres.
   ✅ Construido el 2026-09-16 (PR #1055) con las cuatro decisiones. Los `<select>` nativos
   viven como trailing de cada celda de la hoja (abren el selector del sistema). La vista
   «agenda» ya era inalcanzable desde la UI antes del cambio: sigue igual, decisión aparte.
5d. **Barrido medido del 2026-09-16 (teléfono, `?skin=apple`):** Home, Bitácora, Calendario,
   Repuestos, Aprendizaje, Configuración y CTD dan 0 diminutos, 0 mayúsculas y 0 px² de color
   saturado en superficies grandes. Lo que queda son objetivos táctiles bajo 44 px y botones
   sin cápsula (corregidos en el mismo PR) y las dos pantallas grandes (Bodega ✅, CTD ⏳).
   Clima Puerto es un iframe externo: fuera de alcance del contrato.

5e. **Centro de Aprendizaje (hub)** — mockup publicado el 2026-09-16:
   https://claude.ai/artifact/CanEbkokMz1hesHnNmJync. Hoy: paleta propia `lc-*` por `style=`
   en línea, héroe con título en degradado y tres métricas dentro de una tarjeta, secciones
   numeradas «01», tarjetas con banda de color de 72 px. Propuesta: tokens del sistema (se
   retiran los 20 `--lc-*`), título grande + línea secundaria con las métricas, encabezados
   en formato oración, filas de lista con el color de máquina solo en el tile de 40 px,
   evaluación aprobada como único trailing. ✅ Construido el 2026-09-16 (PR #1055) con las
   cuatro decisiones. ⚠ Los 20 tokens `--lc-*` SIGUEN en index.css: los usan el editor admin
   de Aprendizaje, los planos, variadores y dos vistas del Grader. Se retiran cuando migren.

5f. **Pantallas de PC (2026-09-16).** Editores y visores (mapa Leaflet, capas y zonas, formas,
   DXF, isométrico, visor 3D, monitor) son interfaz de la app: sus 190 textos de 8–10 px pasan
   al piso de 11 px (`text-caption`) y sus encabezados iOS 18 a formato oración. **Excepción
   documentada:** las HMI que emulan el panel real (`HmiBombeoS2PublicPage`, `HmiKnuroPage`,
   `HmiKnuroPublicPage`) y las experiencias interactivas sobre el modelo 3D (sopladoras Baader
   142, plataforma pontón) conservan su tipografía: es fidelidad al equipo, no interfaz. Lo que
   sí les aplica es el marco alrededor (botones, encabezados de la app).
   Hallazgo del medidor en PC: con la raíz al 87,5 % `text-xs` (0.75rem) rendía 10,5 px en
   TODO el escritorio (chips de fecha, pie de la barra lateral, tarjetas del visor 3D). Se
   resolvió en la escala, no pantalla por pantalla: `xs = max(0.75rem, 11px)` en
   tailwind.config.js. En móvil (raíz 16) sigue en 12.

6. ~~Decidir claro frío `#F2F2F7` vs cálido `#EAE7E0`~~ — **cerrado 2026-09-16: frío.** Es el
   `systemGroupedBackground` de iOS y la piel Apple ya lo trae; medidos sus grises, ninguno pasa
   de sesgo 6. El celeste `#d7e5f2` (sesgo 27) de la piel vieja queda hasta que la piel Apple
   sea la predeterminada. ✅ 2026-09-16: la piel Apple es la predeterminada (index.html);
   `?skin=default` vuelve a la anterior para comparar.
7. **Los 228 `<button>` a mano** con 13 alturas distintas (25–64 px). No es un barrido: chips,
   flechas e íconos en tablas no van a 44. Dirigirlo pantalla por pantalla con el medidor de
   `scripts/medir-en-pantalla.md`. Análisis de Turno es el caso extremo: 64 de 67 a mano.
8. **Migrar los ~95 `text-primary` sobre tinte** a `text-brand-ink`. Caso por caso, porque
   hay que confirmar que cada tinte sea el del 15 %.
9. **Migrar los 272 rellenos opacos `bg-red/amber/emerald-*`** a `bg-fill-*`. Caso por caso:
   un `bg-red-500` puede ser una barra (va a `fill`) o un punto de 8 px (se queda vivo).
10. **Decidir los `lc-*` del Centro de Aprendizaje**: cumplen AA (tres con más margen que
    Apple) pero son una familia que no existe en iOS. Migrar gana coherencia y pierde
    contraste (`lc-warn` 6.54 → 5.28). Depende de si esa sección tiene identidad propia.
11. ~~Decidir si el Grader conserva el toggle sol/luna~~ — **cerrado 2026-09-16: se retiró.**
    Sigue al tema de la app en vivo (`useIsDark`, observa la clase del documento). Para
    presentar en claro se cambia el tema en Configuración, como en cualquier app de iOS.
12. ~~`body` sigue en 15 px~~ — hecho 2026-09-16: `body` 17, `title2` 22, `display` 34,
    más `subhead` (15) y `callout` (16) nuevos. Verificado en el home a 375 px: 4 de 36
    títulos de celda saltan de línea (nombres largos de cursos) — iOS envuelve, se acepta.
13. **Tiles de ícono en el escritorio** (`MobileHomeGrid.tsx` ~línea 296 y el mapa `COLOR`):
    siguen tintados con el glifo vivo. El móvil ya es neutro. Y el ribbon "en desarrollo"
    de esa variante está a **6,5 px en mayúsculas** (línea ~274): viola el piso de 11 y la
    regla de mayúsculas a la vez.
