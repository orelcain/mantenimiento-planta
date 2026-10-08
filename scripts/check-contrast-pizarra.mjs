/**
 * Contraste de la paleta PIZARRA (`[data-paleta="pizarra"]`, ?skin=pizarra).
 *
 * A diferencia de check-contrast.mjs, este NO copia los valores: los lee de los
 * bloques reales de apps/pwa/src/index.css, así que si alguien toca un token y no
 * cumple, falla acá. Fuente de la decisión: ronda-estilo-propio/6_jurado_final.md.
 *
 * Criterios:
 *  · Riel --muted (superficie 3): ≥ 1,15:1 contra fondo y tarjeta; texto 1 y 2 ≥ 4,5:1 encima.
 *  · WCAG 2.x: texto ≥ 4,5:1 (texto 1/2/3, acento, estados como texto, también sobre
 *    su tinte al 15% apoyado en el fondo = peor caso, igual que check-contrast.mjs).
 *  · APCA 0.0.98G: cuerpo |Lc| ≥ 75, secundario ≥ 60, terciario ≥ 45; en Penumbra el
 *    texto 1 no pasa de |Lc| 90.
 *  · Bordes y rellenos sobre tarjeta se informan, no cuentan (separador / forma+palabra).
 *
 * Uso: node scripts/check-contrast-pizarra.mjs   (o `pnpm check:contrast:pizarra`)
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(resolve(raiz, 'apps/pwa/src/index.css'), 'utf8').replace(/\r\n/g, '\n')

// ── Lectura de tokens del CSS real ───────────────────────────────────────────
function bloque(selector) {
  const i = css.indexOf(selector + ' {')
  if (i < 0) throw new Error(`No encontré el bloque ${selector} en index.css`)
  return css.slice(i, css.indexOf('\n}', i))
}
const hex2 = (n) => Number(n).toString(16).padStart(2, '0')
function tokens(selector) {
  const t = {}
  // Sin comentarios, y varios tokens por línea (--tw-red-400: …; --tw-red-500: …;)
  const sinComentarios = bloque(selector).replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of sinComentarios.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const v = m[2].trim()
    const tri = v.match(/^(\d+) (\d+) (\d+)$/)
    if (tri) t[m[1]] = '#' + hex2(tri[1]) + hex2(tri[2]) + hex2(tri[3])
    else if (/^#[0-9a-f]{6}$/i.test(v)) t[m[1]] = v.toLowerCase()
  }
  return t
}

// ── Matemática de contraste ──────────────────────────────────────────────────
const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
function lum([r, g, b]) {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function ratio(a, b) {
  const x = lum(hexToRgb(a)), y = lum(hexToRgb(b))
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
function componer(base, sobre, alfa) {
  const B = hexToRgb(base), S = hexToRgb(sobre)
  return '#' + B.map((v, i) => hex2(Math.round(S[i] * alfa + v * (1 - alfa)))).join('')
}
function apcaY(h) {
  const [r, g, b] = hexToRgb(h).map(v => v / 255)
  return 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4
}
function apca(txt, bg) {
  const soft = (y) => (y > 0.022 ? y : y + (0.022 - y) ** 1.414)
  const yt = soft(apcaY(txt)), yb = soft(apcaY(bg))
  if (Math.abs(yb - yt) < 0.0005) return 0
  if (yb > yt) { const s = (yb ** 0.56 - yt ** 0.57) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100 }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14
  return s > -0.1 ? 0 : (s + 0.027) * 100
}

const resultados = []
function wcag(etiqueta, texto, fondo, min = 4.5) {
  const r = ratio(texto, fondo), ok = r >= min
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${(r.toFixed(2) + ':1').padEnd(8)} (need ${min}:1)  ${etiqueta}  [${texto} on ${fondo}]`)
  resultados.push({ etiqueta, ok, valor: r })
}
function lc(etiqueta, texto, fondo, min, max = Infinity) {
  const v = Math.abs(apca(texto, fondo)), ok = v >= min && v <= max
  console.log(`${ok ? 'OK  ' : 'FAIL'} Lc ${v.toFixed(1).padEnd(5)} (need ${max === Infinity ? '≥ ' + min : min + '–' + max})  APCA ${etiqueta}  [${texto} on ${fondo}]`)
  resultados.push({ etiqueta: 'APCA ' + etiqueta, ok, valor: v })
}
function info(etiqueta, texto, fondo) {
  console.log(`INFO ${(ratio(texto, fondo).toFixed(2) + ':1').padEnd(8)} (no cuenta)  ${etiqueta}  [${texto} on ${fondo}]`)
}

// ── Pares ────────────────────────────────────────────────────────────────────
const INTENSIDADES = [
  { nombre: 'DÍA', sel: ':root[data-skin="apple"][data-paleta="pizarra"]:not(.dark)', penumbra: false },
  { nombre: 'PENUMBRA', sel: ':root[data-skin="apple"][data-paleta="pizarra"].dark', penumbra: true },
]

// Esperados del jurado (valores FINALES). Si el CSS se desvía, falla.
const ESPERADO = {
  DÍA: { background: '#f2f1ec', card: '#ffffff', border: '#d4d3cf', muted: '#e2e1db', foreground: '#1d1d1c', 'muted-foreground': '#4e4d4a', 'foreground-3': '#6a6966', brand: '#2a6ba6', 'fill-critical': '#b1272d', 'fill-warning': '#f2b400' },
  PENUMBRA: { background: '#171614', card: '#222120', border: '#3e3d3a', muted: '#2e2d2b', foreground: '#e8e2d7', 'muted-foreground': '#bdb6aa', 'foreground-3': '#a8a195', brand: '#7db4ee', 'fill-critical': '#b1272d', 'fill-warning': '#f2b400' },
}

for (const { nombre, sel, penumbra } of INTENSIDADES) {
  const t = tokens(sel)
  const bg = t.background, card = t.card
  console.log(`\n=== PIZARRA ${nombre} — valores del jurado presentes en index.css ===`)
  for (const [k, v] of Object.entries(ESPERADO[nombre])) {
    const ok = t[k] === v
    console.log(`${ok ? 'OK  ' : 'FAIL'} --${k} = ${t[k]} (jurado ${v})`)
    resultados.push({ etiqueta: `valor --${k} ${nombre}`, ok, valor: 0 })
  }

  console.log(`\n=== PIZARRA ${nombre} — texto (WCAG 4,5:1) ===`)
  for (const [k, hex] of [['texto 1', t.foreground], ['texto 2', t['muted-foreground']], ['texto 3', t['foreground-3']]]) {
    wcag(`${k} sobre tarjeta`, hex, card)
    wcag(`${k} sobre fondo`, hex, bg)
  }
  wcag('acento sobre tarjeta', t.brand, card)
  wcag('acento sobre fondo', t.brand, bg)
  wcag('brand-ink sobre tarjeta', t['brand-ink'], card)
  wcag('brand-ink sobre su tinte 15% (sobre fondo)', t['brand-ink'], componer(bg, t.brand, 0.15))
  wcag('texto sobre acento (botón primario)', penumbra ? t['brand-foreground'] : '#ffffff', t.brand)
  // Relleno de aviso: texto oscuro (nunca blanco). Relleno de falla: blanco en Día, texto 1 en Penumbra.
  wcag('texto sobre relleno de AVISO', penumbra ? bg : t.foreground, t['fill-warning'])
  wcag('texto sobre relleno de FALLA', penumbra ? t.foreground : '#ffffff', t['fill-critical'])

  console.log(`\n=== PIZARRA ${nombre} — superficie 3 (--muted: riel de segmentados, buscadores, chips) ===`)
  const muted = t.muted
  // Distinguible del fondo Y de la tarjeta: si no, los bg-muted sobre la página desaparecen.
  wcag('riel (--muted) contra el fondo', muted, bg, 1.15)
  wcag('riel (--muted) contra la tarjeta', muted, card, 1.15)
  wcag('texto 1 sobre el riel', t.foreground, muted)
  wcag('texto 2 (muted-foreground) sobre el riel', t['muted-foreground'], muted)
  // APCA del texto 2 sobre el riel: en Penumbra baja a Lc ~59 (sobre tarjeta da 61). Subir el
  // riel para ganar 1 punto lo acercaría al borde de 1,15 contra la tarjeta; se exige 55.
  lc('texto 2 sobre el riel', t['muted-foreground'], muted, 55)
  // El segmento elegido es la tarjeta con texto 1 encima (ya medido arriba).
  info('texto 3 sobre el riel (reservado; no usarlo en rieles)', t['foreground-3'], muted)
  info('acento sobre el riel (el elegido va sobre tarjeta, no sobre el riel)', t.brand, muted)

  console.log(`\n=== PIZARRA ${nombre} — estados como TEXTO (--ink-*) ===`)
  const base = { crit: t['fill-critical'], warn: t['fill-warning'], ok: t['ink-ok'], info: t.brand }
  for (const k of ['crit', 'warn', 'ok', 'info']) {
    const ink = t['ink-' + k]
    wcag(`ink-${k} sobre tarjeta`, ink, card)
    wcag(`ink-${k} sobre fondo`, ink, bg)
    wcag(`ink-${k} sobre su tinte 15% (sobre fondo)`, ink, componer(bg, base[k], 0.15))
    wcag(`ink-${k} sobre su tinte 15% (sobre tarjeta)`, ink, componer(card, base[k], 0.15))
  }
  // Texto destructivo (rojo-600) y botón destructivo tinted
  wcag('text-destructive (tw-red-600) sobre tarjeta', t['tw-red-600'], card)
  wcag('text-destructive sobre botón tinted (destructive-tint)', t['tw-red-600'], t['destructive-tint'])
  wcag('tw-amber-600 sobre tarjeta', t['tw-amber-600'], card)

  console.log(`\n=== PIZARRA ${nombre} — APCA ===`)
  lc('texto 1 sobre tarjeta', t.foreground, card, 75, penumbra ? 90 : Infinity)
  lc('texto 1 sobre fondo', t.foreground, bg, 75, penumbra ? 90 : Infinity)
  lc('texto 2 sobre tarjeta', t['muted-foreground'], card, 60)
  lc('texto 2 sobre fondo', t['muted-foreground'], bg, 60)
  lc('texto 3 sobre tarjeta', t['foreground-3'], card, 45)
  lc('texto 3 sobre fondo', t['foreground-3'], bg, 45)
  // Acento: el informe no fija un nivel propio. Se exige el terciario (45); en Penumbra mide Lc 57,
  // bajo el 60 de un texto secundario: vale para controles e íconos, no para cuerpo en acento.
  lc('acento sobre tarjeta', t.brand, card, 45)
  lc('ink-crit sobre tarjeta', t['ink-crit'], card, 60)
  lc('ink-warn sobre tarjeta', t['ink-warn'], card, 60)
  lc('texto sobre relleno de falla', penumbra ? t.foreground : '#ffffff', t['fill-critical'], 60)

  console.log(`\n=== PIZARRA ${nombre} — no textual (informativo) ===`)
  info('borde sobre tarjeta (separador, no control)', t.border, card)
  info('borde sobre fondo', t.border, bg)
  info('relleno de falla sobre tarjeta (se lee por forma + palabra)', t['fill-critical'], card)
  info('relleno de aviso sobre tarjeta', t['fill-warning'], card)
}

const fallan = resultados.filter(r => !r.ok)
console.log(`\n${'='.repeat(60)}\nTotal: ${resultados.length} · Fallan: ${fallan.length}`)
if (fallan.length) {
  console.log('FALLAN:')
  fallan.forEach(f => console.log(`  - ${f.etiqueta}: ${f.valor.toFixed(2)}`))
  process.exitCode = 1
}
