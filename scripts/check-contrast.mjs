/**
 * Verificador de contraste WCAG 2.1 para los tokens de tema de la PWA.
 *
 * Por qué existe: los ajustes de vista clara/oscura se venían validando "a
 * ojo" (screenshot + comparación visual). Este script calcula el ratio de
 * contraste real (luminancia relativa, fórmula WCAG) para los pares texto/
 * fondo y borde/superficie del tema, en vez de asumir que algo "se ve bien".
 *
 * Uso: node scripts/check-contrast.mjs
 *
 * Mantenimiento: los valores de LIGHT/DARK/T de abajo son una COPIA de los
 * tokens en apps/pwa/src/index.css y apps/pwa/tailwind.config.js — si se
 * tocan esos archivos, actualizar los valores acá antes de confiar en el
 * resultado. (Deliberadamente no se parsea el CSS en vivo para mantener el
 * script sin dependencias.)
 */

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const num = parseInt(n, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function relLuminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const [R, G, B] = [f(r), f(g), f(b)]
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

function contrastRatio(hex1, hex2) {
  const L1 = relLuminance(hexToRgb(hex1))
  const L2 = relLuminance(hexToRgb(hex2))
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1]
  return (lighter + 0.05) / (darker + 0.05)
}

/** Compone un color translúcido (overlayHex a alpha 0-1) sobre un fondo opaco. */
function composite(baseHex, overlayHex, alpha) {
  const [br, bg, bb] = hexToRgb(baseHex)
  const [or_, og, ob] = hexToRgb(overlayHex)
  const r = Math.round(or_ * alpha + br * (1 - alpha))
  const g = Math.round(og * alpha + bg * (1 - alpha))
  const b = Math.round(ob * alpha + bb * (1 - alpha))
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

function fmt(ratio) {
  return ratio.toFixed(2) + ':1'
}

const results = []
function check(label, textHex, bgHex, required) {
  const ratio = contrastRatio(textHex, bgHex)
  const pass = ratio >= required
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${fmt(ratio).padEnd(8)} (need ${required}:1)  ${label}  [${textHex} on ${bgHex}]`)
  results.push({ label, ratio, pass })
}

// ── Tokens (index.css, 2026-07-18) ──────────────────────────────────────
const LIGHT = {
  background: '#d7e5f2', foreground: '#16242f', card: '#e9f0f8',
  secondary: '#c9dcee', muted: '#c3d7e9', mutedFg: '#314050',
  accent: '#bcd2e7', border: '#585e64',
}
const DARK = {
  background: '#0d1722', foreground: '#e9eef3', card: '#16242f',
  secondary: '#2b3d4c', muted: '#15212c', mutedFg: '#9db0c2',
  accent: '#1f3445', border: '#22384a',
}

// Tailwind "mate" overrides (tailwind.config.js) + stock 700/800 (sin tocar).
const T = {
  emerald500: '#2aa07e', emerald800: '#065f46', emerald400: '#45b493',
  red500: '#d95757', red800: '#991b1b', red400: '#e07d7d',
  amber500: '#cf9636', amber800: '#92400e', amber400: '#d9ab4e',
  blue500: '#4a86c8', blue800: '#1e40af', blue400: '#6da3d8',
  indigo500: '#6870b8', indigo800: '#3730a3', indigo400: '#8992d1',
  violet500: '#7d68c4', violet800: '#5b21b6', violet400: '#a190d6',
  sky500: '#38bdf8', sky800: '#075985', sky400: '#57a9d3',
  cyan500: '#06b6d4', cyan800: '#155e75', cyan400: '#56b8cc',
  orange500: '#f97316', orange800: '#9a3412',
  rose500: '#f43f5e', rose800: '#9f1239',
}
const primary500 = '#2E75B6'
const primary700 = '#245a8c'

console.log('\n=== LIGHT — texto base sobre superficies (AA normal 4.5:1) ===')
check('foreground / background', LIGHT.foreground, LIGHT.background, 4.5)
check('foreground / card', LIGHT.foreground, LIGHT.card, 4.5)
check('foreground / muted', LIGHT.foreground, LIGHT.muted, 4.5)
check('foreground / accent', LIGHT.foreground, LIGHT.accent, 4.5)
check('foreground / secondary', LIGHT.foreground, LIGHT.secondary, 4.5)
check('mutedFg / background', LIGHT.mutedFg, LIGHT.background, 4.5)
check('mutedFg / card', LIGHT.mutedFg, LIGHT.card, 4.5)
check('mutedFg / muted', LIGHT.mutedFg, LIGHT.muted, 4.5)
check('mutedFg / accent', LIGHT.mutedFg, LIGHT.accent, 4.5)

console.log('\n=== LIGHT — bordes / UI no-textual (AA 3:1) ===')
check('border / background', LIGHT.border, LIGHT.background, 3)
check('border / card', LIGHT.border, LIGHT.card, 3)

console.log('\n=== LIGHT — chips de estado (texto-700/800 sobre bg-color/10-20 mezclado con card) ===')
for (const [name, textHex, colorHex] of [
  ['emerald (OK / Cond.1)', T.emerald800, T.emerald500],
  ['red (crítico / Cond.3)', T.red800, T.red500],
  ['amber (atención / Cond.2)', T.amber800, T.amber500],
  ['blue (info)', T.blue800, T.blue500],
  ['indigo (turno noche)', T.indigo800, T.indigo500],
  ['violet (drill-down)', T.violet800, T.violet500],
  ['sky (backfill/OT)', T.sky800, T.sky500],
  ['cyan (turno A)', T.cyan800, T.cyan500],
  ['orange (riesgo alto)', T.orange800, T.orange500],
  ['rose (paros etapa)', T.rose800, T.rose500],
  ['primary (marca)', primary700, primary500],
]) {
  for (const alpha of [0.10, 0.20]) {
    const bg = composite(LIGHT.card, colorHex, alpha)
    check(`${name} text/${Math.round(alpha * 100)}%`, textHex, bg, 4.5)
  }
}

console.log('\n=== DARK — texto base sobre superficies (referencia — NO tocar sin motivo explícito) ===')
check('foreground / background', DARK.foreground, DARK.background, 4.5)
check('foreground / card', DARK.foreground, DARK.card, 4.5)
check('mutedFg / background', DARK.mutedFg, DARK.background, 4.5)
check('mutedFg / card', DARK.mutedFg, DARK.card, 4.5)
check('border / background (3:1, FALLA pre-existente conocida)', DARK.border, DARK.background, 3)

console.log('\n=== DARK — chips de estado (texto-300/400 sobre bg-color/10-15; los /20 riesgosos llevan dark:bg-*/10 desde 2026-07-18) ===')
for (const [name, textHex, colorHex] of [
  ['emerald', T.emerald400, T.emerald500],
  ['red', T.red400, T.red500],
  ['amber', T.amber400, T.amber500],
  ['blue', T.blue400, T.blue500],
  ['indigo', T.indigo400, T.indigo500],
  ['violet', T.violet400, T.violet500],
  ['sky', T.sky400, T.sky500],
  ['cyan', T.cyan400, T.cyan500],
]) {
  for (const alpha of [0.10, 0.15]) {
    const bg = composite(DARK.card, colorHex, alpha)
    check(`${name} text/${Math.round(alpha * 100)}%`, textHex, bg, 4.5)
  }
}

// ============================================================================
// NUEVA PIEL — Apple HIG (`[data-skin="apple"]` en index.css)
// docs/NUEVA_PIEL_APPLE_HIG.md · skill /nueva-piel-apple
// Estos pares son los que justifican las DESVIACIONES documentadas del HIG:
// Apple acepta secondaryLabel al 60% y su verde accesible #248A3D, pero ambos
// reprueban AA medidos contra nuestras superficies. Si alguien "corrige" los
// tokens de vuelta a los valores literales del HIG, esto lo delata.
// ============================================================================
console.log('\n=== NUEVA PIEL (Apple) — CLARO ===')
const AL = { bg: '#f2f2f7', card: '#ffffff', ink: '#1c1c1e', sub: '#6e6e71', sep: '#c6c6c8' }
check('ink sobre card', AL.ink, AL.card, 4.5)
check('ink sobre fondo', AL.ink, AL.bg, 4.5)
check('secundario sobre card', AL.sub, AL.card, 4.5)
check('secundario sobre fondo (peor caso)', AL.sub, AL.bg, 4.5)
check('marca sobre card', '#2E75B6', AL.card, 4.5)
check('rojo-600 texto sobre fondo', '#c42d25', AL.bg, 4.5)
check('verde-600 texto sobre fondo', '#217d38', AL.bg, 4.5)
check('naranja-600 texto sobre fondo', '#9e5c00', AL.bg, 4.5)
check('separador sobre card (no textual)', AL.sep, AL.card, 1.5)
check('marca-ink sobre tinte marca 15%', '#2a6aa6', composite(AL.card, '#2E75B6', 0.15), 4.5)

console.log('\n=== NUEVA PIEL (Apple) — OSCURO (elevado) ===')
const AD = { bg: '#1c1c1e', card: '#2c2c2e', ink: '#ffffff', sub: '#9f9fa5', sep: '#38383a' }
check('ink sobre card', AD.ink, AD.card, 4.5)
check('secundario sobre card', AD.sub, AD.card, 4.5)
check('secundario sobre fondo', AD.sub, AD.bg, 4.5)
check('marca adaptativa sobre card', '#5AA0DC', AD.card, 4.5)
check('marca-ink sobre tinte marca 15%', '#71ade1', composite(AD.card, '#5AA0DC', 0.15), 4.5)
check('rojo-600 texto sobre card', '#ff776f', AD.card, 4.5)
check('verde-600 texto sobre card', '#30d158', AD.card, 4.5)
check('naranja-600 texto sobre card', '#ff9f0a', AD.card, 4.5)
// Chips/Pill de la piel nueva. REGLA descubierta al medir (2026-08-09): el tinte
// vivo como TEXTO sobre su propio fondo al 14% reprueba en rojo oscuro (3.51:1).
// Por eso la Pill es: texto = tono 600 (variante accesible) · fondo = tono 500 al
// 8%. El vivo queda para puntos/íconos (no textuales), donde AA no aplica igual.
for (const [name, ink, tint] of [
  ['crítica', '#ff776f', '#ff453a'],
  ['media', '#ff9f0a', '#ff9f0a'],
  ['ok', '#30d158', '#30d158'],
]) {
  check(`chip ${name} DARK (texto 600 sobre tinte 15%)`, ink, composite(AD.card, tint, 0.15), 4.5)
}
for (const [name, ink, tint] of [
  ['crítica', '#c42d25', '#ff3b30'],
  ['media', '#9e5c00', '#ff9500'],
  ['ok', '#217d38', '#34c759'],
]) {
  check(`chip ${name} LIGHT (texto 600 sobre tinte 15%)`, ink, composite(AL.card, tint, 0.15), 4.5)
}

// ── Paleta CATEGÓRICA (index.css, docs §1.6) ────────────────────────────────
// Existe porque la app usa color para CATEGORIZAR (tipo de repuesto, causal,
// área), no solo para dar estado. Cada tono se lee sobre su propio tinte al 8%.
// Dos hubo que corregirlos contra la medición: índigo oscuro (3.78:1) y teal
// claro (4.41:1). Si alguien los "redondea" a los valores de Apple, esto falla.
console.log('\n=== PALETA CATEGÓRICA — CLARO / OSCURO ===')
const CATS = [
  ['1 azul', '#0064d1', '#007aff', '#4ca5ff', '#0a84ff'],
  ['2 verde', '#217d38', '#34c759', '#30d158', '#30d158'],
  ['3 índigo', '#5856d6', '#5856d6', '#9695ef', '#5e5ce6'],
  ['4 naranja', '#9e5c00', '#ff9500', '#ff9f0a', '#ff9f0a'],
  ['5 rosa', '#c72342', '#ff2d55', '#ff718d', '#ff375f'],
  ['6 púrpura', '#9345ba', '#af52de', '#d085f5', '#bf5af2'],
  ['7 teal', '#207685', '#30b0c7', '#40c8e0', '#40c8e0'],
  ['8 café', '#7e6749', '#a2845e', '#bca385', '#ac8e68'],
]
for (const [name, inkL, tintL, inkD, tintD] of CATS) {
  check(`cat ${name} CLARO`, inkL, composite('#ffffff', tintL, 0.15), 4.5)
  check(`cat ${name} OSCURO`, inkD, composite('#2c2c2e', tintD, 0.15), 4.5)
}

const fails = results.filter(r => !r.pass)
console.log(`\n${'='.repeat(60)}\nTotal: ${results.length} · Fallan: ${fails.length}`)
if (fails.length) {
  console.log('FALLAN:')
  fails.forEach(f => console.log(`  - ${f.label}: ${fmt(f.ratio)}`))
  console.log('\n(La falla DARK border/background es pre-existente y conocida — no es un blocker.)')
}
