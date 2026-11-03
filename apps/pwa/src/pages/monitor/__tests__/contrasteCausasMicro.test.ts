/**
 * Las marcas ▼, los tramos de la barra del resumen (sólidos, rayados y de contorno) y los cuadros de color de las 4 causas de una micro (v3) deben dar ≥ 3:1 contra la tarjeta Y contra el fondo local donde se
 * dibujan (el chip gris del resumen, la columna resaltada de la tabla del globo), en claro y en oscuro y en las tres pieles (WCAG 2.x,
 * objetos gráficos). Lee los colores REALES: el mapa `COLOR_CAUSA` que dibuja el gráfico, los tokens `--v2-*` de monitorGlass.css y los
 * colores de tarjeta de cada piel de index.css. Misma cuenta que `scripts/check-contrast-pizarra.mjs` (que lee index.css de la misma manera),
 * que solo mide contra la tarjeta: por eso aquí se mide además contra el chip (`--v2-relleno`, gris al 16 % sobre la tarjeta), donde el gris
 * translúcido de «Sin contexto» en oscuro bajaba a 2,6:1 y, en la piel clásica clara, el coral, el ámbar y el gris a 2,8:1.
 * Si alguien vuelve a poner el coral de `--v2-mal` (2,8:1 en claro) o el gris translúcido (2,3:1) en «Al volver de una detención» o «Sin contexto», falla aquí.
 * Los tramos de la barra dibujan el color de la causa (relleno, trama o contorno de 1 a 1,5 px): el contraste es el del color contra la superficie donde se apoya.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CAUSAS_MICRO, COLOR_CAUSA, ROTULO_CAUSA } from '../microCausa'

type Rgb = [number, number, number]
interface Color { rgb: Rgb; alfa: number }

const leer = (ruta: string) => readFileSync(resolve(__dirname, ruta), 'utf8').replace(/\r\n/g, '\n')
const indexCss = leer('../../../index.css')
const glassCss = leer('../monitorGlass.css').replace(/\/\*[\s\S]*?\*\//g, '')

// ── Matemática de contraste (WCAG 2.x) ───────────────────────────────────────
const aRgb = (hex: string): Rgb => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const luminancia = ([r, g, b]: Rgb) => {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contraste = (a: Rgb, b: Rgb) => { const x = luminancia(a), y = luminancia(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
/** `fg` con su alfa sobre `base`: lo que ve el ojo de un color translúcido. */
const sobre = (base: Rgb, fg: Rgb, alfa: number): Rgb => base.map((v, i) => fg[i]! * alfa + v * (1 - alfa)) as Rgb

// ── Los tokens de index.css (cada piel) y de monitorGlass.css (tema claro y oscuro) ───────────
function bloque(css: string, selector: string) {
  const i = css.indexOf(`${selector} {`)
  if (i < 0) throw new Error(`no encontré el bloque ${selector} en index.css`)
  return css.slice(i, css.indexOf('\n}', i))
}
function triple(selector: string, nombre: string): Rgb {
  const m = new RegExp(`--${nombre}:\\s*(\\d+) (\\d+) (\\d+)`).exec(bloque(indexCss, selector))
  if (!m) throw new Error(`falta --${nombre} en ${selector}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}
/** Todas las declaraciones `--token: valor` de monitorGlass.css para el tema claro (`[data-glass='v2']`, `.v2-vars`) o el oscuro (`.dark …`). */
function declaraciones(oscuro: boolean) {
  const sirve = oscuro
    ? (s: string) => s === ".dark [data-glass='v2']" || s === '.dark .v2-vars'
    : (s: string) => s === "[data-glass='v2']" || s === '.v2-vars'
  const out = new Map<string, string>()
  for (const b of glassCss.matchAll(/(?:^|\n)([^{}\n@][^{}]*)\{([^{}]*)\}/g)) {
    if (!b[1]!.split(',').some((s) => sirve(s.trim()))) continue
    for (const d of b[2]!.matchAll(/--([\w-]+):\s*([^;]+);/g)) out.set(d[1]!, d[2]!.trim())
  }
  return out
}
const CLARO = declaraciones(false)
const OSCURO = declaraciones(true)

/** Resuelve un valor CSS a un color: #hex, rgb(r g b [/ a]), rgb(var(--foreground)), var(--token), color-mix(in srgb, A p%, B) y black. */
function evaluar(valor: string, oscuro: boolean, texto: Rgb): Color {
  const t = valor.trim()
  let m: RegExpExecArray | null
  if (/^#[0-9a-f]{6}$/i.test(t)) return { rgb: aRgb(t), alfa: 1 }
  if ((m = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(t))) return { rgb: [+m[1]!, +m[2]!, +m[3]!], alfa: m[4] ? +m[4] : 1 }
  if (t === 'rgb(var(--foreground))') return { rgb: texto, alfa: 1 }
  if (t === 'black') return { rgb: [0, 0, 0], alfa: 1 }
  if ((m = /^var\(--([\w-]+)\)$/.exec(t))) {
    const v = (oscuro ? OSCURO.get(m[1]!) : undefined) ?? CLARO.get(m[1]!)
    if (v == null) throw new Error(`no existe el token --${m[1]} en monitorGlass.css`)
    return evaluar(v, oscuro, texto)
  }
  if ((m = /^color-mix\(in srgb, (.+?) ([\d.]+)%, (.+)\)$/.exec(t))) {
    const a = evaluar(m[1]!, oscuro, texto).rgb, b = evaluar(m[3]!, oscuro, texto).rgb, p = +m[2]! / 100
    return { rgb: a.map((v, i) => v * p + b[i]! * (1 - p)) as Rgb, alfa: 1 }
  }
  throw new Error(`no sé evaluar «${t}»`)
}

const PIELES = [
  { nombre: 'Pizarra · claro', selector: ':root[data-skin="apple"][data-paleta="pizarra"]:not(.dark)', oscuro: false },
  { nombre: 'Pizarra · oscuro', selector: ':root[data-skin="apple"][data-paleta="pizarra"].dark', oscuro: true },
  { nombre: 'Apple · claro', selector: ':root[data-skin="apple"]', oscuro: false },
  { nombre: 'Apple · oscuro', selector: ':root[data-skin="apple"].dark', oscuro: true },
  { nombre: 'Clásica · claro', selector: ':root', oscuro: false },
  { nombre: 'Clásica · oscuro', selector: '.dark', oscuro: true },
]

/** El gris translúcido de `--v2-relleno` (el fondo del chip) y el de la columna resaltada de la tabla del globo (`.gm-tabla .cm`): rgb(142 142 147) con su alfa. */
const GRIS: Rgb = [142, 142, 147]

describe('contraste de las causas de una micro (marcas y cuadros ≥ 3:1 contra la tarjeta y contra el fondo local)', () => {
  for (const piel of PIELES) {
    it(`${piel.nombre}: las 4 causas dan ≥ 3:1 (tramo de la barra, marca ▼, cuadro) sobre la tarjeta, la esmerilada, el globo, el chip y la columna resaltada`, () => {
      const fondo = triple(piel.selector, 'background')
      const tarjeta = triple(piel.selector, 'card')
      const texto = triple(piel.selector, 'foreground')
      /* Donde se ven: la tarjeta pelada, la tarjeta esmerilada del monitor (card al 78 % sobre el fondo), el globo (card al 92 % sobre ella),
         el chip del resumen (gris al 16 % sobre la esmerilada; también dentro del globo) y la columna del minuto de la micro en la tabla (gris al 10 % sobre el globo). */
      const esmerilada = sobre(fondo, tarjeta, 0.78)
      const globo = sobre(esmerilada, tarjeta, 0.92)
      const superficies: Array<[string, Rgb]> = [
        ['tarjeta', tarjeta],
        ['tarjeta esmerilada', esmerilada],
        ['globo', globo],
        ['chip', sobre(esmerilada, GRIS, 0.16)],
        ['chip sobre el globo', sobre(globo, GRIS, 0.16)],
        ['columna resaltada de la tabla', sobre(globo, GRIS, 0.10)],
      ]
      for (const causa of CAUSAS_MICRO) {
        const c = evaluar(COLOR_CAUSA[causa], piel.oscuro, texto)
        for (const [nombre, s] of superficies) {
          const r = contraste(c.alfa < 1 ? sobre(s, c.rgb, c.alfa) : c.rgb, s)
          expect(r, `${ROTULO_CAUSA[causa]} (${COLOR_CAUSA[causa]}) sobre ${nombre} en ${piel.nombre}: ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
        }
      }
    })
  }

  for (const piel of PIELES) {
    it(`${piel.nombre}: la marca de la leyenda de la barra (el gris de texto secundario) da ≥ 3:1 sobre la tarjeta`, () => {
      const tarjeta = triple(piel.selector, 'card')
      const gris = triple(piel.selector, 'muted-foreground')
      expect(contraste(gris, tarjeta)).toBeGreaterThanOrEqual(3)
    })
  }

  it('Sin contexto ya no usa el gris que daba 2,3:1 en claro (--v2-gris), ni Al volver de una detención el coral de siempre (--v2-mal, 2,8:1)', () => {
    expect(Object.keys(COLOR_CAUSA)).toEqual(['arranque', 'linea', 'paro', 'sin'])
    expect(COLOR_CAUSA.sin).not.toBe('var(--v2-gris)')
    expect(COLOR_CAUSA.paro).not.toBe('var(--v2-mal)')
    /* El oscuro conserva el coral (ya pasaba en todas las superficies). «Ritmo bajo» ya no tiene token: salió de las causas de micro. */
    expect(OSCURO.get('v2-causa-paro')).toBe('var(--v2-mal)')
    expect(OSCURO.has('v2-causa-ritmo')).toBe(false)
    expect(CLARO.has('v2-causa-ritmo')).toBe(false)
  })

  it('el gris de «Sin contexto» en oscuro es OPACO: el `--v2-gris` translúcido sobre el chip bajaba a 2,6:1', () => {
    const sinOscuro = OSCURO.get('v2-causa-sin')!
    expect(sinOscuro).not.toBe('var(--v2-gris)')
    const c = evaluar(sinOscuro, true, [255, 255, 255])
    expect(c.alfa).toBe(1)
  })
})
