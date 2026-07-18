#!/usr/bin/env node
/**
 * Auditoría de tema claro/oscuro — detecta los patrones de bug conocidos
 * (skill /tema-claro-oscuro §3, §4b, §4c) en apps/pwa/src.
 *
 * Uso:  node scripts/audit-theme.mjs [ruta-o-filtro]
 *       node scripts/audit-theme.mjs components/grader
 *
 * Patrones (hits CRUDOS — clasificar antes de tocar, no es find-replace):
 *  A  superficie interior translúcida estática (bg-background/30-70, bg-muted/10-40)
 *  B  tinte de card casi nulo (bg-primary/[0.0X])
 *  C  tinte de estado débil (bg-*-500/5 y /10)
 *  D  borde erosionado (border-border/15-60)
 *  T1 tinta -100/-300 sin dark: (texto lavado en claro)
 *  T4 tinta -400/-500 de acento sin dark: (débil en claro; revisar contexto)
 *  H  fondo oscuro hardcodeado sin dark: (bg-*-800/900/950)
 *
 * NO son bug (dejar): hover:, dark:, backdrop-blur, bg-black/NN sobre fotos,
 * casi-opacos /80-95, HMIs/3D/mapa (oscuros a propósito), hairlines divide-*.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..', 'apps', 'pwa', 'src')
const FILTER = process.argv[2] ?? ''
// Oscuros a propósito — se reportan aparte, no cuentan como deuda
const EXCLUDE = /components[\\/](map|visor3d)|pages[\\/](Hmi|Map\w*|Mapa)/

const PATTERNS = {
  'A  interior translúcido': /bg-background\/(30|40|50|60|70)\b|bg-muted\/(10|20|30|40)\b/g,
  'B  tinte card ~0': /bg-primary\/\[0\.0\d+\]/g,
  'C  tinte estado débil': /bg-[a-z]+-500\/(5|10)\b/g,
  'D  borde erosionado': /border-border\/(15|20|25|30|40|50|60)\b/g,
  'T1 texto -100/-300': /text-[a-z]+-(100|200|300)\b/g,
  'T4 texto -400/-500': /text-[a-z]+-(400|500)\b/g,
  'H  oscuro hardcodeado': /bg-(slate|gray|zinc|neutral|stone|blue|indigo|red|orange|amber|cyan|violet|rose|emerald|teal|sky|purple|fuchsia|pink|lime|green|yellow)-(800|900|950)\b/g,
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(tsx|ts|css)$/.test(name)) yield p
  }
}

const totals = {}
const perFile = new Map()
let excluded = 0

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file)
  if (FILTER && !rel.replaceAll('\\', '/').includes(FILTER)) continue
  const isExcluded = EXCLUDE.test(rel)
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    // descartar variantes legítimas en la MISMA clase
    if (/backdrop-blur/.test(line)) return
    for (const [label, re] of Object.entries(PATTERNS)) {
      re.lastIndex = 0
      for (const m of line.matchAll(re)) {
        const before = line.slice(Math.max(0, m.index - 12), m.index)
        if (/dark:$|hover:$|focus:$|active:$|group-hover:$/.test(before)) continue
        if (isExcluded) { excluded++; continue }
        totals[label] = (totals[label] ?? 0) + 1
        if (!perFile.has(rel)) perFile.set(rel, [])
        perFile.get(rel).push(`${i + 1}: [${label.trim()}] ${line.trim().slice(0, 110)}`)
      }
    }
  })
}

console.log('— Auditoría de tema (hits crudos, clasificar antes de tocar) —\n')
for (const [label, n] of Object.entries(totals).sort((a, b) => b[1] - a[1]))
  console.log(`  ${label}: ${n}`)
console.log(`  (excluidos HMIs/3D/mapa: ${excluded})\n`)

const ranked = [...perFile.entries()].sort((a, b) => b[1].length - a[1].length)
console.log('— Top archivos —')
for (const [f, hits] of ranked.slice(0, 25)) console.log(`  ${String(hits.length).padStart(3)}  ${f}`)
if (process.env.VERBOSE) {
  console.log('\n— Detalle —')
  for (const [f, hits] of ranked) { console.log(`\n${f}`); hits.forEach(h => console.log('  ' + h)) }
}
