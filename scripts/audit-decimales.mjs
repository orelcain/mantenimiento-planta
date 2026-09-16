#!/usr/bin/env node
/**
 * audit-decimales.mjs — los números que la gente lee llevan coma.
 *
 * `toFixed(1)` escribe el decimal con PUNTO. En una planta donde el punto es el
 * separador de MILES, la misma pantalla mostraba «5,0 min» al lado de «87.3%» y
 * «10.7 pz/min». El formateador único es `apps/pwa/src/utils/formatoNumeros.ts`
 * (`dec1`, `dec2`), que usa `toLocaleString('es-CL')`.
 *
 * Dos reglas, con distinta severidad:
 *
 *  1. RATCHET — `toFixed(1|2)` sin marcar. Falla solo si la deuda CRECE (igual
 *     que audit-piel), porque quedan usos técnicos sin marcar y módulos que
 *     todavía no se barrieron.
 *
 *  2. FALLA SIEMPRE — `dec1`/`dec2` donde el separador TIENE que ser punto:
 *     atributos SVG (opacity, x, y, width…), anchos CSS y medidas en px. Pasó
 *     en producción con `opacity={dec2(…)}` en un <rect>: el navegador descarta
 *     el valor con coma y pinta el rectángulo opaco, sin degradado.
 *
 * ⚠️ `toFixed` SIGUE SIENDO CORRECTO cuando el punto es obligatorio o cuando no
 * se está formateando texto:
 *   - anchos CSS (`width: ${pct.toFixed(1)}%`) y atributos SVG (x, y, d, opacity…)
 *   - redondeo numérico (`+x.toFixed(2)`, `Number(x.toFixed(1))`)
 *   - claves, URLs, logs
 * Esas líneas se marcan con el comentario `decimal-tecnico` —explicando por qué—
 * y dejan de contar.
 *
 * Uso:
 *   node scripts/audit-decimales.mjs [--verbose] [--update-baseline]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'apps', 'pwa', 'src')
const BASELINE_PATH = join(ROOT, 'scripts', 'audit-decimales.baseline.json')

const UPDATE = process.argv.includes('--update-baseline')
const VERBOSE = process.argv.includes('--verbose')

// Incluye los decimales variables (`toFixed(decimals)`), que es por donde se
// escapo el tablero de KPI: mostraba «Disponibilidad 67.4%» con punto.
const RX_TOFIXED = /\.toFixed\((?:1|2|[A-Za-z_$][\w$]*)\)/g
/** La línea declara que ahí el punto es obligatorio (CSS, SVG, redondeo, claves). */
const EXCEPCION = /decimal-tecnico/
/** Regla 2: coma donde va punto. Atributos SVG/JSX numéricos, estilos y px. */
const RX_COMA_DONDE_VA_PUNTO = new RegExp(
  // atributo JSX/SVG numérico: opacity={dec2(…)}, width={dec1(…)}
  '(?<![A-Za-z])(?:opacity|fillOpacity|strokeOpacity|strokeWidth|fontSize|offset|x|y|cx|cy|r|dx|dy|width|height)=\\{\\s*dec[12]\\('
  // objeto de estilos: style={{ width: dec1(…) }}
  + '|style=\\{\\{[^}]*dec[12]\\('
  // propiedad CSS en plantilla: width: `${dec1(x)}%`
  + '|(?:width|height|left|top|right|bottom|transform|inset|gap|padding|margin|lineHeight)\\s*:\\s*`[^`]*\\$\\{dec[12]?\\('
  // Geometría SVG armada como TEXTO (rutas `d` y `points`). Así se rompió el
  // comparador del monitor: `M${dec2(x)},${dec2(y)}` daba «M12,50,30,20», que el
  // navegador lee como CUATRO números, y la línea cruzaba el gráfico entero.
  //   dos coordenadas seguidas:        ${dec1(x)},${dec1(y)}   ·   ${dec1(x)} ${dec1(y)}
  + '|\\$\\{dec[12]?\\([^`]*?\\)\\}[ ,]\\$\\{dec[12]?\\('
  //   comando de ruta junto a un dec:  'L'}${dec2(x)}   ·   ` L ${x} ${dec1(y)}`
  + "|[MLHVCSQTAZ]['\"]?\\}?\\s?\\$\\{dec[12]?\\("
  + '|[MLHVCSQTAZ] \\$\\{[^}]+\\} \\$\\{dec[12]?\\(',
)

function* archivos(dir) {
  for (const nombre of readdirSync(dir)) {
    if (nombre === '__tests__' || nombre === 'node_modules') continue
    const ruta = join(dir, nombre)
    const st = statSync(ruta)
    if (st.isDirectory()) yield* archivos(ruta)
    else if (/\.tsx?$/.test(nombre) && !nombre.includes('.test.')) yield ruta
  }
}

const ocurrencias = []
const invertidas = []
for (const ruta of archivos(SRC)) {
  const rel = relative(SRC, ruta).split(sep).join('/')
  readFileSync(ruta, 'utf8').split('\n').forEach((linea, i) => {
    const item = { rel, n: i + 1, linea: linea.trim().slice(0, 110) }
    if (RX_COMA_DONDE_VA_PUNTO.test(linea)) invertidas.push(item)
    if (EXCEPCION.test(linea)) return
    const n = (linea.match(RX_TOFIXED) || []).length
    for (let k = 0; k < n; k++) ocurrencias.push(item)
  })
}

// ── Regla 2: no admite deuda ─────────────────────────────────────────────────
if (invertidas.length > 0) {
  console.error(`audit-decimales: ${invertidas.length} uso(s) de dec1/dec2 donde el separador debe ser PUNTO.\n`)
  for (const o of invertidas) console.error(`  ${o.rel}:${o.n}  ${o.linea}`)
  console.error('\nEn atributos SVG, anchos CSS y medidas en px el navegador DESCARTA el valor con coma')
  console.error('(un opacity con coma pinta opaco). Ahí va `.toFixed(n)` con el comentario')
  console.error('`decimal-tecnico` explicando por qué.')
  process.exit(1)
}

// ── Regla 1: ratchet ─────────────────────────────────────────────────────────
const total = ocurrencias.length

if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), total }, null, 2) + '\n')
  console.log(`audit-decimales: línea base actualizada a ${total}.`)
  process.exit(0)
}

let baseline
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
} catch {
  console.error('No existe scripts/audit-decimales.baseline.json — correr con --update-baseline primero.')
  process.exit(1)
}

if (total > baseline.total) {
  console.error(`audit-decimales: ${total} toFixed(1|2) sin marcar, la línea base es ${baseline.total}.\n`)
  const muestra = VERBOSE ? ocurrencias : ocurrencias.slice(0, 20)
  for (const o of muestra) console.error(`  ${o.rel}:${o.n}  ${o.linea}`)
  if (!VERBOSE && total > 20) console.error('  …y más (--verbose para verlas).')
  console.error('\nSi es un número que alguien LEE: usa dec1/dec2 de utils/formatoNumeros.')
  console.error('Si el punto es obligatorio (ancho CSS, atributo SVG, redondeo, clave, log):')
  console.error('agrega el comentario `decimal-tecnico` en esa línea, y explica por qué.')
  process.exit(1)
}

if (total < baseline.total) {
  console.log(`audit-decimales: bajó la deuda 🎉 ${baseline.total} → ${total}.`)
  console.log('Considera `node scripts/audit-decimales.mjs --update-baseline` en este mismo PR.')
  process.exit(0)
}

console.log(`audit-decimales: sin deuda nueva (${total}).`)
