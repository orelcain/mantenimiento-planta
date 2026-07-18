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
  background: '#c5d9eb', foreground: '#16242f', card: '#eef5fb',
  secondary: '#b5cfe6', muted: '#b3cbe0', mutedFg: '#314050',
  accent: '#a9c6e0', border: '#585e64',
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

console.log('\n=== DARK — chips de estado (texto-300/400 sobre bg-color/10-20 mezclado con card) ===')
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
  for (const alpha of [0.10, 0.20]) {
    const bg = composite(DARK.card, colorHex, alpha)
    check(`${name} text/${Math.round(alpha * 100)}%`, textHex, bg, 4.5)
  }
}

const fails = results.filter(r => !r.pass)
console.log(`\n${'='.repeat(60)}\nTotal: ${results.length} · Fallan: ${fails.length}`)
if (fails.length) {
  console.log('FALLAN:')
  fails.forEach(f => console.log(`  - ${f.label}: ${fmt(f.ratio)}`))
  console.log('\n(La falla DARK border/background es pre-existente y conocida — no es un blocker.)')
}
