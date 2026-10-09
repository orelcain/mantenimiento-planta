#!/usr/bin/env node
/**
 * medir-herramientas.mjs — medidor de toques de las herramientas del Centro de Aprendizaje.
 *
 * Para cada ruta de herramienta, a 375 px (celular), reporta:
 *   - desborde horizontal: scrollWidth vs ancho de pantalla (meta: igual).
 *   - objetivos táctiles menores de 48 px FUERA de [data-bisel] (botones, enlaces, campos,
 *     role=button/tab/…, y también dentro de los iframes de los HMI, que son del mismo origen).
 *   - textos menores de 12 px FUERA de [data-bisel].
 *
 * `[data-bisel]` marca el panel del equipo (HMI Knuro/Grader/Bombeo, plano de la A3C, plano
 * eléctrico): conserva su tamaño y fidelidad con el equipo, así que no se mide ahí.
 * Las herramientas abren sin sesión: no hace falta iniciar sesión.
 *
 * Uso (con la PWA corriendo, p. ej. `pnpm -C apps/pwa dev`):
 *   node scripts/medir-herramientas.mjs                         # tabla markdown, 375 px
 *   node scripts/medir-herramientas.mjs --base http://localhost:5841/mantenimiento-planta
 *   node scripts/medir-herramientas.mjs --detalle               # lista cada elemento infractor
 *   node scripts/medir-herramientas.mjs --solo knuro,grader     # filtra por nombre
 *   node scripts/medir-herramientas.mjs --json salida.json      # guarda el detalle completo
 *   node scripts/medir-herramientas.mjs --ancho 390 --alto 844
 *   node scripts/medir-herramientas.mjs --tema dark
 *
 * Playwright: usa `playwright-core` (o `playwright`) si está en node_modules; si no, la variable
 * PLAYWRIGHT_CORE con la ruta a su index.mjs. Navegador: Edge (canal `msedge`), sin descargar nada.
 * Sale con código 1 si alguna herramienta tiene desborde u objetivos bajo 48 px (apto para CI local).
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`)
  if (i < 0) return d
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const BASE = String(arg('base', 'http://localhost:5841/mantenimiento-planta')).replace(/\/$/, '')
const ANCHO = Number(arg('ancho', 375))
const ALTO = Number(arg('alto', 812))
const TEMA = String(arg('tema', 'light'))
const SOLO = arg('solo', null) ? String(arg('solo')).split(',') : null
const DETALLE = arg('detalle', false) === true
const JSON_OUT = arg('json', null)
const MIN_TOQUE = 48
const MIN_TEXTO = 12

/** Rutas de herramienta (sin sesión). El plano abierto usa el primero del catálogo. */
const RUTAS = [
  ['hmi-knuro', '/aprendizaje/hmi-knuro'],
  // Mismo HMI con el panel «Pantallas» abierto (buscador + árbol): sus controles solo existen abiertos.
  ['hmi-knuro+pantallas', '/aprendizaje/hmi-knuro', async (pagina) => {
    const marco = pagina.frames().find((f) => f.url().includes('hmi-knuro-embed'))
    await marco?.click('#kn-pan-btn', { timeout: 5000 })
    await pagina.waitForTimeout(800)
  }],
  ['hmi-grader', '/aprendizaje/hmi-grader'],
  ['hmi-bombeo-s2', '/aprendizaje/hmi-bombeo-s2'],
  ['perilla-5', '/aprendizaje/perilla-5'],
  ['tarjeta-a3c', '/aprendizaje/baader-142/tarjeta-a3c'],
  ['a3c-por-confirmar', '/aprendizaje/baader-142/tarjeta-a3c/por-confirmar'],
  ['variadores', '/aprendizaje/variadores'],
  ['variadores-recetas', '/aprendizaje/variadores?vista=recetas'],
  ['variadores-parametro', '/aprendizaje/variadores?vista=parametro'],
  ['variadores-equiv', '/aprendizaje/variadores?vista=equivalencias'],
  ['variadores-ficha', '/aprendizaje/variadores?ficha=atv312'],
  ['variadores-fallas', '/aprendizaje/variadores?ficha=atv312&seccion=fallas'],
  ['planos-catalogo', '/aprendizaje/planos'],
  ['plano-abierto', '/aprendizaje/planos/baader-142-860'],
  ['plano-abierto+ficha', '/aprendizaje/planos/baader-142-860?ap=Q1'],
  ['ficha-maquina', '/aprendizaje/maquina/baader-142'],
  ['baader-200-terreno', '/aprendizaje/baader-200/terreno'],
]

async function cargarChromium() {
  const require = createRequire(import.meta.url)
  const candidatos = ['playwright-core', 'playwright']
  for (const c of candidatos) {
    try { return require(c).chromium } catch { /* siguiente */ }
  }
  const alt = process.env.PLAYWRIGHT_CORE || 'C:/Users/orelc/dev/capturas/node_modules/playwright-core/index.mjs'
  try { return (await import(pathToFileURL(alt).href)).chromium } catch { /* nada */ }
  console.error('No encuentro Playwright. Instala playwright-core o define PLAYWRIGHT_CORE=<ruta a index.mjs>.')
  process.exit(2)
}

/** Se ejecuta dentro de cada documento (página e iframes). Devuelve infractores fuera de [data-bisel]. */
function medirDocumento({ minToque, minTexto }) {
  const SEL =
    'button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=switch],' +
    '[role=checkbox],[role=radio],[role=menuitem],[role=option],[role=link],[data-toque]'
  const visible = (el, paraTexto = false) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none' || (!paraTexto && s.pointerEvents === 'none')) return false
    if (Number(s.opacity) === 0) return false
    // recortado por un ancestro con overflow oculto o fuera del documento
    if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight * 3) return false
    return true
  }
  const fueraDelBisel = (el) => !el.closest('[data-bisel]')
  const desc = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 28)
    const id = el.id ? `#${el.id}` : ''
    const cl = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
    return `${el.tagName.toLowerCase()}${id}${cl.slice(0, 40)} «${t}»`
  }
  const doc = document.documentElement
  const out = { sw: doc.scrollWidth, vw: window.innerWidth, toques: [], textos: [], bisel: document.querySelectorAll('[data-bisel]').length }

  // Además de los controles nativos: cualquier elemento «tocable» por estilo (cursor:pointer) que no
  // sea parte de otro ya tocable (filas de un árbol, tarjetas con onclick, celdas…).
  const porCursor = []
  for (const el of document.querySelectorAll('body *')) {
    if (el.matches(SEL) || el.closest('svg') ) continue
    if (getComputedStyle(el).cursor !== 'pointer') continue
    const padre = el.parentElement
    if (padre && (padre.matches(SEL) || getComputedStyle(padre).cursor === 'pointer')) continue
    porCursor.push(el)
  }
  const vistos = new Set()
  for (const el of [...document.querySelectorAll(SEL), ...porCursor]) {
    if (!fueraDelBisel(el) || !visible(el)) continue
    if (el.disabled && el.tagName === 'INPUT') continue
    // radio/checkbox ocultos que se activan por su <label> de 48: se mide la etiqueta
    const r = el.getBoundingClientRect()
    const menor = Math.min(r.width, r.height)
    if (menor + 0.5 < minToque) {
      vistos.add(el)
      out.toques.push({ el: desc(el), w: Math.round(r.width), h: Math.round(r.height) })
    }
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const porEl = new Map()
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue
    const el = n.parentElement
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(el.tagName)) continue
    if (el.closest('svg')) continue // texto de dibujos: va con el bisel / plano
    if (!fueraDelBisel(el) || !visible(el, true)) continue
    const fs = parseFloat(getComputedStyle(el).fontSize)
    if (fs + 0.01 < minTexto && !porEl.has(el)) porEl.set(el, fs)
  }
  for (const [el, fs] of porEl) out.textos.push({ el: desc(el), fs })
  return out
}

const chromium = await cargarChromium()
const navegador = await chromium.launch({ channel: 'msedge', headless: true })
const filas = []

for (const [nombre, ruta, accion] of RUTAS) {
  if (SOLO && !SOLO.some((s) => nombre.includes(s))) continue
  const ctx = await navegador.newContext({
    viewport: { width: ANCHO, height: ALTO },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: TEMA,
  })
  await ctx.addInitScript((t) => { try { localStorage.setItem('app-theme', t) } catch { /* sin storage */ } }, TEMA)
  const pagina = await ctx.newPage()
  const fila = { nombre, ruta, url: '', sw: 0, vw: ANCHO, toques: [], textos: [], bisel: 0, error: null }
  try {
    await pagina.goto(BASE + ruta, { waitUntil: 'load', timeout: 60000 })
    await pagina.waitForTimeout(4500) // lazy chunks + iframes del HMI
    if (accion) await accion(pagina)
    fila.url = pagina.url().replace(BASE, '')
    for (const marco of pagina.frames()) {
      if (marco.url().startsWith('about:') || marco.url() === '') continue
      let m
      try { m = await marco.evaluate(medirDocumento, { minToque: MIN_TOQUE, minTexto: MIN_TEXTO }) } catch { continue }
      const esPrincipal = marco === pagina.mainFrame()
      const etiqueta = esPrincipal ? '' : `[iframe ${marco.url().split('/').pop().split('?')[0]}] `
      if (esPrincipal) { fila.sw = m.sw; fila.vw = m.vw }
      else fila.swIframe = Math.max(fila.swIframe || 0, m.sw - (m.vw || 0))
      fila.bisel += m.bisel
      fila.toques.push(...m.toques.map((t) => ({ ...t, el: etiqueta + t.el })))
      fila.textos.push(...m.textos.map((t) => ({ ...t, el: etiqueta + t.el })))
    }
  } catch (e) {
    fila.error = String(e).slice(0, 160)
  }
  filas.push(fila)
  await ctx.close()
}
await navegador.close()

// En emulación móvil el viewport de layout se ensancha si hay desborde: se compara contra el ancho pedido.
const desborde = (f) => Math.max(f.sw, f.vw) - ANCHO
console.log(`\nMedición a ${ANCHO} px · tema ${TEMA} · ${BASE}\n`)
console.log('| Herramienta | scrollWidth / ancho | Desborde | Toques < 48 px | Textos < 12 px | [data-bisel] |')
console.log('|---|---|---|---|---|---|')
for (const f of filas) {
  if (f.error) { console.log(`| ${f.nombre} | ERROR: ${f.error} | | | | |`); continue }
  console.log(`| ${f.nombre} | ${f.sw} / ${ANCHO} | ${desborde(f) > 0 ? '+' + desborde(f) : 'no'} | ${f.toques.length} | ${f.textos.length} | ${f.bisel} |`)
}
if (DETALLE) {
  for (const f of filas) {
    if (!f.toques.length && !f.textos.length) continue
    console.log(`\n## ${f.nombre}`)
    for (const t of f.toques) console.log(`  toque ${t.w}x${t.h}  ${t.el}`)
    for (const t of f.textos) console.log(`  texto ${t.fs}px  ${t.el}`)
  }
}
if (JSON_OUT && JSON_OUT !== true) fs.writeFileSync(JSON_OUT, JSON.stringify(filas, null, 2), 'utf8')

const mal = filas.some((f) => f.error || desborde(f) > 0 || f.toques.length > 0)
process.exit(mal ? 1 : 0)
