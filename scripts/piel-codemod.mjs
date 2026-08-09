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

/**
 * Guarda contra prefijos de variante. La mitad "clara" de un par NO puede venir
 * con `hover:` / `focus:` / `group-hover:` / `md:`: si viene, no es el estado
 * base, y absorber el `dark:` vecino le roba el fondo en REPOSO en tema oscuro.
 *
 * Lo detectó la revisión del diff, no un test: `hover:bg-red-500/20
 * dark:bg-red-500/10` colapsaba a un solo `hover:` y el elemento perdía su
 * fondo de reposo. Por eso el barrido se revisa archivo por archivo.
 */
const NV = '(?<![\\w:-])'

/**
 * Guarda contra prefijos de variante. La mitad "clara" de un par NO puede venir
 * con `hover:`/`focus:`/`group-hover:`: si viene, no es el estado base, y
 * absorber el `dark:` vecino le roba el fondo en reposo en tema oscuro.
 * (Lo pilló la revision del diff: `hover:bg-red-500/20 dark:bg-red-500/10`
 * colapsaba a un solo `hover:` y el elemento perdia su fondo.)
 */
const NO_VARIANT = '(?<![\w:-])'

/**
 * Aplica una regla SOLO dentro de literales de cadena ('…', "…", `…`).
 *
 * Por qué existe: las clases de Tailwind siempre viven dentro de una cadena,
 * pero el resto del archivo es código. Sin esta barrera, la regla del `rounded`
 * pelado reescribió una VARIABLE llamada `rounded` y dejó
 * `const rounded-ctl = Math.round(value)` — código que ni siquiera parsea.
 * Lo pilló el typecheck de los 111 archivos del Grader, no un test.
 *
 * Se ignoran los comentarios (`//` y `/* … *\/`): ahí puede haber ejemplos de
 * clases que no deben migrarse, y de paso se respeta la documentación.
 */
function replaceInStrings(source, re, replacer) {
  // Trocea en: comentario de línea | comentario de bloque | cadena | resto.
  const TOKEN = /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|('(?:[^'\\\n]|\\.)*')|("(?:[^"\\\n]|\\.)*")|(`(?:[^`\\]|\\.)*`)/g
  let out = '', last = 0, hits = 0, m
  while ((m = TOKEN.exec(source)) !== null) {
    out += source.slice(last, m.index)
    const tok = m[0]
    const isString = Boolean(m[3] || m[4] || m[5])
    if (isString) {
      out += tok.replace(re, (...a) => { hits++; return replacer(...a) })
    } else {
      out += tok // comentarios: intactos
    }
    last = m.index + tok.length
  }
  out += source.slice(last)
  return { out, hits }
}

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  let s = src
  const applied = []
  // Cuenta solo lo que de verdad se va a reemplazar (dentro de cadenas).
  const count = (re) => replaceInStrings(s, re, (m) => m).hits

  // 0) El CHIP de 4 clases: `bg-X-100 text-X-700 dark:bg-X-900/30 dark:text-X-300`.
  //    Va primero porque las reglas de abajo lo partirían en dos mitades y
  //    dejarían el fondo claro huérfano (el bug que el dry-run pilló antes).
  const chip4Re = new RegExp(
    NO_VARIANT + `bg-(${FAMS})-\\d{2,3}(?:\\/\\d{1,3})? text-(?:${FAMS})-\\d{2,3} ` +
    `dark:bg-(?:${FAMS})-\\d{2,3}(?:\\/\\d{1,3})? dark:text-(?:${FAMS})-\\d{2,3}`, 'g')
  const nChip4 = count(chip4Re)
  s = replaceInStrings(s, chip4Re, (_m, fam) => `${TINT[fam]} ${INK[fam]}`).out
  if (nChip4) applied.push(`${nChip4} chips de 4 clases → tinte + tono adaptativo`)

  // 0b) Banner de alerta que solo existe en CLARO (`bg-X-50 border border-X-200
  //     text-X-800`, sin ninguna variante dark:). Hoy en tema oscuro se ve como
  //     una franja clara: no es solo deuda de piel, es un bug de tema. Migrarlo
  //     lo arregla de paso.
  const alertRe = new RegExp(
    NO_VARIANT + `bg-(${FAMS})-50 border border-(?:${FAMS})-200 text-(?:${FAMS})-800`, 'g')
  const nAlert = count(alertRe)
  s = replaceInStrings(s, alertRe, (_m, fam) => `${TINT[fam]} border ${BORDER[fam]} ${INK[fam]}`).out
  if (nAlert) applied.push(`${nAlert} banners claro-only → adaptativos (arregla tema oscuro)`)

  // 1) El par claro/oscuro colapsa a UN tono adaptativo. Es el patrón dominante
  //    (247 casos en la app) y el que más ruido quita: dos clases → una.
  const pairRe = new RegExp(NO_VARIANT + `text-(${FAMS})-\\d{2,3} dark:text-(?:${FAMS})-\\d{2,3}`, 'g')
  const nPairs = count(pairRe)
  s = replaceInStrings(s, pairRe, (_m, fam) => INK[fam]).out
  if (nPairs) applied.push(`${nPairs} pares claro/oscuro → tono adaptativo`)

  // 2) Fondo: el PAR claro/oscuro se colapsa junto. Ojo — este orden importa:
  //    tratar el `dark:bg-*` por separado y borrarlo dejaba el `bg-blue-50`
  //    claro solo, y en tema oscuro la tarjeta quedaba blanca. El dry-run lo
  //    delató antes de aplicarlo; por eso el par se reemplaza de una pieza.
  const bgPairRe = new RegExp(
    NO_VARIANT + `bg-(${FAMS})-\\d{2,3}(?:\\/\\d{1,3})? dark:bg-(?:${FAMS})-\\d{2,3}(?:\\/\\d{1,3})?`, 'g')
  const nBgPairs = count(bgPairRe)
  s = replaceInStrings(s, bgPairRe, (_m, fam) => TINT[fam]).out
  if (nBgPairs) applied.push(`${nBgPairs} pares de fondo claro/oscuro → tinte 8%`)

  // 3) Fondo translúcido suelto (sin par) → el 8% MEDIDO de la Pill.
  const tintRe = new RegExp(`\\bbg-(${FAMS})-\\d{2,3}\\/\\d{1,3}`, 'g')
  const nTints = count(tintRe)
  s = replaceInStrings(s, tintRe, (_m, fam) => TINT[fam]).out
  if (nTints) applied.push(`${nTints} fondos translúcidos → tinte 8%`)

  // 4) Bordes: SOLO los que ya eran translúcidos. Un `border-amber-500` sólido
  //    suele ser un acento deliberado (fila destacada, tarjeta seleccionada) y
  //    bajarlo al 25% lo apagaría — eso es criterio, no mecánica.
  const bordRe = new RegExp(`\\bborder-(${FAMS})-\\d{2,3}\\/\\d{1,3}`, 'g')
  const nBord = count(bordRe)
  s = replaceInStrings(s, bordRe, (_m, fam) => BORDER[fam]).out
  if (nBord) applied.push(`${nBord} bordes translúcidos → borde de tinte`)

  // 5) RADIOS → escala única de 3 clases. Es el cambio MÁS VISIBLE de la piel:
  //    la mezcla de 6 variantes es lo que hace que la app se vea "casi igual
  //    pero desordenada". El valor de cada clase es una variable por piel, así
  //    que esto no altera producción (ver index.css).
  //    `rounded-full` y las direccionales (`rounded-t-lg`) NO se tocan: el
  //    lookahead `(?!-)` las deja fuera a propósito.
  const RADII = [
    [/\brounded-(?:sm|md)\b(?!-)/g, 'rounded-ctl'],
    [/\brounded-(?:lg|xl)\b(?!-)/g, 'rounded-card'],
    [/\brounded-(?:2xl|3xl)\b(?!-)/g, 'rounded-panel'],
    [/\brounded\b(?!-)/g, 'rounded-ctl'],   // el `rounded` pelado, al final
  ]
  let nRad = 0
  for (const [re, to] of RADII) {
    nRad += count(re)
    s = replaceInStrings(s, re, () => to).out
  }
  if (nRad) applied.push(`${nRad} radios → escala única (ctl/card/panel)`)

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
