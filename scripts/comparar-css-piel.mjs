/**
 * Compara el CSS de la app contra una referencia (por defecto origin/main) ignorando
 * todo lo que cuelga del interruptor de paleta (`[data-paleta`).
 *
 * Objetivo: demostrar que SIN `data-paleta="pizarra"` el color calculado de la app es
 * idéntico al de antes.
 *
 * Qué compara
 *  · Todos los .css de apps/pwa/src (index.css compilado con Tailwind, el resto pasado por
 *    postcss+Tailwind igual, para resolver @apply). Se descartan solo las reglas con `[data-paleta`.
 *  · Variables CSS en ámbito de documento (selectores :root / .dark / :root.dark /
 *    [data-skin="apple"] / :not(.dark), sus combinaciones): se resuelve la CASCADA real
 *    (especificidad, luego orden) en cada contexto de tema {claro, oscuro} × {piel default, apple}.
 *  · Cada otra regla se resuelve en esos 4 contextos: var(--x) se sustituye por el valor que
 *    tiene en ese contexto. Si el resultado es igual en los 4 se emite una línea; si no, cuatro.
 *    Así una variable nueva (ej. `.dark { --success: … }`) debe valer lo mismo que el literal
 *    que reemplaza, en CADA contexto, o sale DIFERENTE.
 *  · De las variables de documento solo se comparan los NOMBRES que existían en la referencia
 *    (las nuevas se validan por su uso). Las declaraciones de variables en otros selectores
 *    (.monitor-tv, .a3c-led, .dossier…) se conservan todas, con su selector.
 *  · Colores normalizados a rgba(r,g,b,a); `!important` se serializa.
 *
 * Prueba de humo (hecha al corregir el script; repetirla si se toca la lógica). Cada una de
 * estas modificaciones temporales FUERA de Pizarra debe dar DIFERENTE, y al revertir, IGUAL:
 *   1. agregar `--success: 1 2 3;` dentro del bloque `.dark { … }` de index.css;
 *   2. cambiar un color en components/aprendizaje/a3c/a3c.css (p. ej. `--a3cp-off-rojo`);
 *   3. quitar un `!important` de una regla de index.css (p. ej. `.grader-light-mode .text-red-500`).
 *
 * Uso: node scripts/comparar-css-piel.mjs [refBase]      (por defecto origin/main)
 *      GREP=texto node scripts/comparar-css-piel.mjs     (imprime las líneas que contienen el texto)
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pwa = resolve(raiz, 'apps/pwa')
const require = createRequire(resolve(pwa, 'package.json'))
const postcss = require('postcss')
const tailwindcss = require('tailwindcss')

const ref = process.argv[2] || 'origin/main'
const cache = resolve(tmpdir(), 'piel-base-' + process.pid)
const coloresUrl = pathToFileURL(require.resolve('tailwindcss/colors.js')).href

// 1 · Referencia extraída a un directorio temporal
rmSync(cache, { recursive: true, force: true })
mkdirSync(cache, { recursive: true })
const tar = execFileSync('git', ['archive', ref, '--', 'apps/pwa/src', 'apps/pwa/index.html', 'apps/pwa/tailwind.config.js'], { cwd: raiz, maxBuffer: 1024 * 1024 * 1024 })
execFileSync('tar', ['-x'], { input: tar, cwd: cache })

function* cssDe(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') yield* cssDe(p) } else if (n.endsWith('.css')) yield p
  }
}

async function cargarConfig(dirPwa) {
  // El config importa 'tailwindcss/colors' sin extensión: en ESM puro no resuelve, así que se
  // reescribe a una copia con la ruta absoluta (vite lo carga por otro camino y no tiene el problema).
  const texto = readFileSync(resolve(dirPwa, 'tailwind.config.js'), 'utf8').replace(/from 'tailwindcss\/colors'/, `from '${coloresUrl}'`)
  const copia = resolve(cache, `config-${Math.random().toString(36).slice(2)}.mjs`)
  writeFileSync(copia, texto)
  const mod = await import(pathToFileURL(copia).href)
  return { ...mod.default, content: [resolve(dirPwa, 'index.html'), resolve(dirPwa, 'src/**/*.{js,ts,jsx,tsx}')] }
}

/** Devuelve [{ archivo, root }] con index.css primero y el resto de los .css de src/ ordenados. */
async function compilarTodo(dirPwa) {
  const config = await cargarConfig(dirPwa)
  const src = resolve(dirPwa, 'src')
  const archivos = [...cssDe(src)].sort((a, b) => {
    const ia = a.endsWith(join('src', 'index.css')) ? 0 : 1, ib = b.endsWith(join('src', 'index.css')) ? 0 : 1
    return ia - ib || a.localeCompare(b)
  })
  const salida = []
  for (const f of archivos) {
    const r = await postcss([tailwindcss(config)]).process(readFileSync(f, 'utf8'), { from: f })
    salida.push({ archivo: relative(src, f).replace(/\\/g, '/'), root: r.root })
  }
  return salida
}

// ── Contextos de tema ─────────────────────────────────────────────────────────
const CONTEXTOS = [
  { n: 'claro·default', dark: false, skin: null },
  { n: 'oscuro·default', dark: true, skin: null },
  { n: 'claro·apple', dark: false, skin: 'apple' },
  { n: 'oscuro·apple', dark: true, skin: 'apple' },
]

/** Un selector "de documento": solo :root / html / .dark / :not(.dark) / [data-skin=…]. null si no lo es. */
function compuestoDocumento(sel) {
  let resto = sel.trim()
  let esp = 0
  const conds = []
  let m
  while (resto) {
    if ((m = /^:root/.exec(resto))) { esp += 10 }
    else if ((m = /^html(?![\w-])/.exec(resto))) { /* tipo: especificidad 0 en la columna de clases */ }
    else if ((m = /^\.dark(?![\w-])/.exec(resto))) { esp += 10; conds.push((c) => c.dark) }
    else if ((m = /^:not\(\s*\.dark\s*\)/.exec(resto))) { esp += 10; conds.push((c) => !c.dark) }
    else if ((m = /^\[data-skin=(?:"([\w-]+)"|'([\w-]+)'|([\w-]+))\]/.exec(resto))) {
      const v = m[1] ?? m[2] ?? m[3]; esp += 10; conds.push((c) => c.skin === v)
    } else return null
    resto = resto.slice(m[0].length)
  }
  return { esp, aplica: (c) => conds.every((f) => f(c)) }
}

function selectorDocumento(selector) {
  const partes = selector.split(',').map(compuestoDocumento)
  return partes.every(Boolean) ? partes : null
}

const enAtRule = (n) => { let p = n.parent; while (p) { if (p.type === 'atrule') return true; p = p.parent } return false }

// ── Normalización de colores ──────────────────────────────────────────────────
const colores = (v) => v
  .replace(/#([0-9a-f]{6})\b/gi, (m, h) => `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},1)`)
  .replace(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+%?)\s*\)/g, (m, r, g, b, a) => `rgba(${r},${g},${b},${a.endsWith('%') ? parseFloat(a) / 100 : a})`)
  .replace(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\)/g, (m, r, g, b) => `rgba(${r},${g},${b},1)`)

function resolver(v, mapa, locales = {}) {
  let n = 0, prev
  do {
    prev = v
    v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,[^()]*(?:\([^()]*\)[^()]*)*)?\)/g, (m, nombre) => {
      if (nombre in locales) return locales[nombre]
      if (nombre in mapa) return mapa[nombre]
      return m
    })
  } while (v !== prev && ++n < 8)
  return colores(v)
}

function contextoDeAtrules(rule) {
  const ctx = []
  let p = rule.parent
  while (p && p.type === 'atrule') { ctx.unshift(`@${p.name} ${p.params}`); p = p.parent }
  return ctx.join(' ')
}

/**
 * Convierte un conjunto de CSS (todos los archivos) en líneas comparables.
 * `nombresDoc`: si se pasa, solo se emiten las variables de documento con esos nombres (lado nuevo).
 */
function lineas(archivos, nombresDoc) {
  // quitar lo que cuelga del interruptor
  for (const { root } of archivos) {
    root.walkRules((rule) => { if (rule.selector.includes('[data-paleta')) rule.remove() })
    root.walkAtRules((a) => { if (a.nodes && a.nodes.length === 0) a.remove() })
    root.walkComments((c) => c.remove())
  }

  // 1) declaraciones de variables de documento, con (especificidad, orden)
  const docDecls = [] // { nombre, valor, partes, orden }
  let orden = 0
  const nombresDocVistos = new Set()
  for (const { root } of archivos) {
    root.walkRules((rule) => {
      orden++
      if (enAtRule(rule)) return
      const partes = selectorDocumento(rule.selector)
      if (!partes) return
      rule.each((n) => {
        if (n.type === 'decl' && n.prop.startsWith('--')) {
          docDecls.push({ nombre: n.prop, valor: n.value.trim(), partes, orden })
          nombresDocVistos.add(n.prop)
        }
      })
    })
  }
  const mapas = {}
  for (const c of CONTEXTOS) {
    const efectivo = {}
    const mejor = {}
    for (const d of docDecls) {
      let esp = -1
      for (const p of d.partes) if (p.aplica(c)) esp = Math.max(esp, p.esp)
      if (esp < 0) continue
      const k = mejor[d.nombre]
      if (!k || esp > k.esp || (esp === k.esp && d.orden >= k.orden)) { mejor[d.nombre] = { esp, orden: d.orden }; efectivo[d.nombre] = d.valor }
    }
    mapas[c.n] = efectivo
  }

  const salida = []
  // 2) mapa efectivo por contexto (solo nombres de la referencia en el lado nuevo)
  for (const c of CONTEXTOS) {
    for (const [nombre, valor] of Object.entries(mapas[c.n])) {
      if (nombresDoc && !nombresDoc.has(nombre)) continue
      salida.push(`[${c.n}] ${nombre}: ${resolver(valor, mapas[c.n])}`)
    }
  }

  // 3) resto de reglas, resueltas por contexto
  for (const { archivo, root } of archivos) {
    root.walkRules((rule) => {
      const documento = !enAtRule(rule) && selectorDocumento(rule.selector)
      const locales = {}
      rule.each((n) => { if (n.type === 'decl' && /^--tw-[\w-]*opacity$/.test(n.prop)) locales[n.prop] = n.value.trim() })
      const ctxAt = contextoDeAtrules(rule)
      const sel = rule.selector.replace(/\s+/g, ' ')
      const declsPara = (mapa) => {
        const out = []
        rule.each((n) => {
          if (n.type !== 'decl') return
          if (documento && n.prop.startsWith('--')) return // ya está en el mapa efectivo
          out.push(`${n.prop}:${resolver(n.value, mapa, locales)}${n.important ? ' !important' : ''}`)
        })
        return out
      }
      const porCtx = CONTEXTOS.map((c) => ({ c, d: declsPara(mapas[c.n]).join(';') }))
      if (!porCtx[0].d && porCtx.every((x) => !x.d)) return
      const unicos = new Set(porCtx.map((x) => x.d))
      if (unicos.size === 1) salida.push(`${archivo} ${ctxAt} ${sel}{${porCtx[0].d}}`)
      else for (const x of porCtx) salida.push(`${archivo} [${x.c.n}] ${ctxAt} ${sel}{${x.d}}`)
    })
  }
  return { salida, nombresDoc: nombresDocVistos }
}

const [base, nuevo] = [await compilarTodo(resolve(cache, 'apps/pwa')), await compilarTodo(pwa)]
const lb = lineas(base)
const ln = lineas(nuevo, lb.nombresDoc)
const nuevas = [...ln.nombresDoc].filter((n) => !lb.nombresDoc.has(n) && !n.startsWith('--tw-'))

const hash = (l) => createHash('sha256').update(l.join('\n')).digest('hex')
const hb = hash(lb.salida), hn = hash(ln.salida)

if (process.env.GREP) {
  for (const [n, l] of [['base', lb.salida], ['actual', ln.salida]]) l.filter((x) => x.includes(process.env.GREP)).forEach((x) => console.log(`[${n}] ${x.slice(0, 300)}`))
}
console.log(`archivos CSS: ${base.length} en la referencia · ${nuevo.length} actuales`)
console.log(`referencia ${ref}: ${lb.salida.length} líneas · sha256 ${hb.slice(0, 16)}`)
console.log(`actual:                ${ln.salida.length} líneas · sha256 ${hn.slice(0, 16)}`)
console.log(`variables de documento nuevas (validadas por su uso, ${nuevas.length}): ${nuevas.join(', ') || '—'}`)

rmSync(cache, { recursive: true, force: true })

if (hb === hn) {
  console.log('IGUAL: sin data-paleta el CSS calculado es idéntico al de la referencia.')
} else {
  const sb = new Set(lb.salida), sn = new Set(ln.salida)
  const soloBase = lb.salida.filter((l) => !sn.has(l)), soloNuevo = ln.salida.filter((l) => !sb.has(l))
  console.log(`\nDIFERENTE: ${soloBase.length} líneas solo en la referencia, ${soloNuevo.length} solo en la actual.`)
  soloBase.slice(0, 25).forEach((l) => console.log('  - ' + l.slice(0, 300)))
  soloNuevo.slice(0, 25).forEach((l) => console.log('  + ' + l.slice(0, 300)))
  process.exitCode = 1
}
