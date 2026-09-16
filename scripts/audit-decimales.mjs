#!/usr/bin/env node
/**
 * audit-decimales.mjs — los números que la gente lee llevan coma (ratchet).
 *
 * `toFixed(1)` escribe el decimal con PUNTO. En una planta donde el punto es el
 * separador de MILES, la misma pantalla mostraba «5,0 min» al lado de «87.3%»
 * y «10.7 pz/min». El formateador único es `apps/pwa/src/utils/formatoNumeros.ts`
 * (`dec1`, `dec2`), que usa `toLocaleString('es-CL')`.
 *
 * Ámbito: el mundo del Análisis de Turno (components/grader, services/grader,
 * pages/AnalisisGrader, pages/monitor, services/shoplogix), que es lo que se
 * mira todos los días. El resto de la app todavía no está barrido.
 *
 * ⚠️ `toFixed` SIGUE SIENDO CORRECTO cuando el punto es obligatorio o cuando no
 * se está formateando texto:
 *   - anchos CSS (`width: ${pct.toFixed(1)}%`) y atributos SVG (x, y, d…)
 *   - redondeo numérico (`+x.toFixed(2)`, `Number(x.toFixed(1))`)
 *   - claves, URLs, logs
 * Esas líneas se marcan con el comentario `decimal-tecnico` y dejan de contar.
 *
 * Modo RATCHET, igual que audit-piel: falla solo si la deuda CRECE.
 *   --update-baseline  reescribe la línea base
 *   --verbose          lista archivo:línea de cada ocurrencia nueva
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'apps', 'pwa', 'src')
const BASELINE_PATH = join(ROOT, 'scripts', 'audit-decimales.baseline.json')

const UPDATE = process.argv.includes('--update-baseline')
const VERBOSE = process.argv.includes('--verbose')

const AMBITO = ['components/grader/', 'services/grader/', 'pages/AnalisisGrader/',
  'pages/monitor/', 'services/shoplogix/']
const RX = /\.toFixed\((1|2)\)/g
/** La línea declara que ahí el punto es obligatorio (CSS, SVG, redondeo, claves). */
const EXCEPCION = /decimal-tecnico/

function* archivos(dir) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (nombre === '__tests__' || nombre === 'node_modules') continue
    const st = statSync(ruta)
    if (st.isDirectory()) yield* archivos(ruta)
    else if (/\.tsx?$/.test(nombre) && !nombre.includes('.test.')) yield ruta
  }
}

const ocurrencias = []
for (const ruta of archivos(SRC)) {
  const rel = relative(SRC, ruta).split(sep).join('/')
  if (!AMBITO.some((a) => rel.startsWith(a))) continue
  readFileSync(ruta, 'utf8').split('\n').forEach((linea, i) => {
    if (EXCEPCION.test(linea)) return
    const n = (linea.match(RX) || []).length
    for (let k = 0; k < n; k++) ocurrencias.push({ rel, n: i + 1, linea: linea.trim().slice(0, 110) })
  })
}

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
  if (!VERBOSE && total > 20) console.error(`  …y más (--verbose para verlas).`)
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
