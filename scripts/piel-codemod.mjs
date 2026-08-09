#!/usr/bin/env node
/**
 * piel-codemod.mjs — barrido asistido de un archivo a los tokens de la piel.
 *
 * Normas: docs/NUEVA_PIEL_APPLE_HIG.md · Skill: /nueva-piel-apple
 *
 * Qué resuelve: quedan ~30 archivos con el mismo puñado de patrones repetidos
 * (miles de ocurrencias). Hacerlo a mano es lento y se cometen errores de dedo;
 * hacerlo con un `sed` improvisado por archivo no deja rastro de qué criterio se
 * usó. Esto centraliza el criterio, es repetible y —lo más importante— REPORTA
 * lo que NO supo mapear, que es justo lo que hay que mirar con ojo humano.
 *
 * Uso:
 *   node scripts/piel-codemod.mjs --dry  apps/pwa/src/pages/Foo.tsx   # ver
 *   node scripts/piel-codemod.mjs        apps/pwa/src/pages/Foo.tsx   # aplicar
 *
 * NO es automático de punta a punta a propósito: se corre por archivo, se revisa
 * el diff y se verifica en el navegador. Un barrido masivo sin mirar es
 * exactamente cómo se degradó la UI la primera vez.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const files = args.filter((a) => !a.startsWith('--'))

if (files.length === 0) {
  console.error('Uso: node scripts/piel-codemod.mjs [--dry] <archivo.tsx> [...]')
  process.exit(1)
}

/**
 * A dónde va cada familia de color de Tailwind.
 *  - red/amber/emerald/green: su -600 ya es variable CSS y cambia con el tema.
 *  - blue/sky: informativo → color de MARCA (adaptativo).
 *  - el resto: paleta CATEGÓRICA (§1.6), que no implica estado.
 *  - neutros: tokens de texto.
 */
const INK = {
  red: 'text-red-600', amber: 'text-amber-600', emerald: 'text-emerald-600',
  green: 'text-green-600', yellow: 'text-amber-600',
  blue: 'text-primary', sky: 'text-primary',
  indigo: 'text-cat-3-ink', violet: 'text-cat-6-ink', purple: 'text-cat-6-ink',
  orange: 'text-cat-4-ink', teal: 'text-cat-7-ink', cyan: 'text-cat-7-ink',
  rose: 'text-cat-5-ink', pink: 'text-cat-5-ink',
  zinc: 'text-muted-foreground', gray: 'text-muted-foreground',
  slate: 'text-muted-foreground', neutral: 'text-muted-foreground',
  stone: 'text-muted-foreground',
}
const TINT = {
  red: 'bg-red-500/[0.08]', amber: 'bg-amber-500/[0.08]', emerald: 'bg-emerald-500/[0.08]',
  green: 'bg-green-500/[0.08]', yellow: 'bg-amber-500/[0.08]',
  blue: 'bg-primary/[0.08]', sky: 'bg-primary/[0.08]',
  indigo: 'bg-cat-3-tint/[0.08]', violet: 'bg-cat-6-tint/[0.08]', purple: 'bg-cat-6-tint/[0.08]',
  orange: 'bg-cat-4-tint/[0.08]', teal: 'bg-cat-7-tint/[0.08]', cyan: 'bg-cat-7-tint/[0.08]',
  rose: 'bg-cat-5-tint/[0.08]', pink: 'bg-cat-5-tint/[0.08]',
  zinc: 'bg-muted-foreground/[0.10]', gray: 'bg-muted-foreground/[0.10]',
  slate: 'bg-muted-foreground/[0.10]', neutral: 'bg-muted-foreground/[0.10]',
  stone: 'bg-muted-foreground/[0.10]',
}
const BORDER = Object.fromEntries(
  Object.entries(TINT).map(([k, v]) => [k, v.replace('bg-', 'border-').replace('/[0.08]', '/[0.25]')]),
)

const FAMS = Object.keys(INK).join('|')

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  let s = src
  const applied = []
  const count = (re) => (src.match(re) ?? []).length

  // 1) El par claro/oscuro colapsa a UN tono adaptativo. Es el patrón dominante
  //    (247 casos en la app) y el que más ruido quita: dos clases → una.
  const pairRe = new RegExp(`\\btext-(${FAMS})-\\d{2,3} dark:text-(?:${FAMS})-\\d{2,3}`, 'g')
  const nPairs = count(pairRe)
  s = s.replace(pairRe, (_m, fam) => INK[fam])
  if (nPairs) applied.push(`${nPairs} pares claro/oscuro → tono adaptativo`)

  // 2) Fondo: el PAR claro/oscuro se colapsa junto. Ojo — este orden importa:
  //    tratar el `dark:bg-*` por separado y borrarlo dejaba el `bg-blue-50`
  //    claro solo, y en tema oscuro la tarjeta quedaba blanca. El dry-run lo
  //    delató antes de aplicarlo; por eso el par se reemplaza de una pieza.
  const bgPairRe = new RegExp(
    `\\bbg-(${FAMS})-\\d{2,3}(?:\\/\\d{1,3})? dark:bg-(?:${FAMS})-\\d{2,3}(?:\\/\\d{1,3})?`, 'g')
  const nBgPairs = count(bgPairRe)
  s = s.replace(bgPairRe, (_m, fam) => TINT[fam])
  if (nBgPairs) applied.push(`${nBgPairs} pares de fondo claro/oscuro → tinte 8%`)

  // 3) Fondo translúcido suelto (sin par) → el 8% MEDIDO de la Pill.
  const tintRe = new RegExp(`\\bbg-(${FAMS})-\\d{2,3}\\/\\d{1,3}`, 'g')
  const nTints = count(tintRe)
  s = s.replace(tintRe, (_m, fam) => TINT[fam])
  if (nTints) applied.push(`${nTints} fondos translúcidos → tinte 8%`)

  // 4) Bordes: SOLO los que ya eran translúcidos. Un `border-amber-500` sólido
  //    suele ser un acento deliberado (fila destacada, tarjeta seleccionada) y
  //    bajarlo al 25% lo apagaría — eso es criterio, no mecánica.
  const bordRe = new RegExp(`\\bborder-(${FAMS})-\\d{2,3}\\/\\d{1,3}`, 'g')
  const nBord = count(bordRe)
  s = s.replace(bordRe, (_m, fam) => BORDER[fam])
  if (nBord) applied.push(`${nBord} bordes translúcidos → borde de tinte`)

  // Lo que queda sin mapear: SE REPORTA, no se toca. Suele ser color en datos,
  // gradientes o casos que piden criterio (y por eso no van en un codemod).
  const leftoverRe = new RegExp(`\\b(?:text|bg|border|ring|fill|stroke)-(?:${FAMS})-\\d{2,3}`, 'g')
  const leftovers = [...new Set(s.match(leftoverRe) ?? [])]

  console.log(`\n── ${file}`)
  if (applied.length === 0) console.log('   (sin cambios)')
  else applied.forEach((a) => console.log(`   ✓ ${a}`))
  if (leftovers.length) {
    console.log(`   ⚠ quedan ${leftovers.length} clase(s) sin mapear — revisar a mano:`)
    console.log(`     ${leftovers.slice(0, 12).join(' ')}${leftovers.length > 12 ? ' …' : ''}`)
  }

  if (!DRY && s !== src) writeFileSync(file, s)
}

if (DRY) console.log('\n(--dry: no se escribió nada)')
