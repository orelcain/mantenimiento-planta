/**
 * Geometría del Jack-Knife: dominios log, marcas y colocación de etiquetas.
 * Pura (sin React): port de la lógica del mockup aprobado (07-11-2026).
 */

import type { CalculoJK, PuntoJK } from '@/services/shoplogix/jackKnife'


/** Dominio log ajustado a los datos, con piso y margen para que los puntos no toquen el borde. */
export function dominioLog(vals: number[], piso: number): [number, number] {
  piso = Math.min(piso, Math.min(...vals) / 1.45)
  let lo = Math.min(...vals) / 1.45
  let hi = Math.max(...vals) * 1.45
  lo = Math.max(piso, lo)
  if (hi / lo < 3) {
    const c = Math.sqrt(hi * lo)
    lo = Math.max(piso, c / 1.75)
    hi = c * 1.75
  }
  return [lo, hi]
}

/** Marcas 1-2-5 dentro del dominio. */
export function marcasLog(lo: number, hi: number): number[] {
  const out: number[] = []
  for (const e of [0.1, 1, 10, 100, 1000, 10000]) {
    for (const m of [1, 2, 5]) {
      const v = m * e
      if (v >= lo && v <= hi) out.push(v)
    }
  }
  return out
}

interface PuntoDibujo {
  p: PuntoJK
  x: number
  y: number
  rad: number
  etiqueta: { bx: number; by: number; cx: number; cy: number; lin: boolean } | null
}

interface Layout {
  sx: (v: number) => number
  sy: (v: number) => number
  disponibilidad: { x1: number; y1: number; x2: number; y2: number }
  W: number
  H: number
  L: number
  R: number
  T: number
  B: number
  iw: number
  ih: number
  ux: number
  uy: number
  xs: { v: number; x: number }[]
  ys: { v: number; y: number }[]
  puntos: PuntoDibujo[]
  ocultas: number
}

/**
 * Coloca las etiquetas sin solaparse: primero los cuatro títulos de cuadrante y
 * todos los marcadores, después cada etiqueta busca un sitio en anillos
 * alrededor de su punto. Si no cabe, el punto queda sin nombre (sigue en la lista).
 */
export function calcularLayout(c: CalculoJK, W: number, sel: string | null, fantasmas: PuntoJK[] = []): Layout {
  const small = W < 560
  const H = Math.round(Math.min(640, Math.max(small ? 440 : 480, W * 0.5)))
  const L = small ? 44 : 56
  const R = small ? 10 : 18
  const T = 12
  const B = 70
  const iw = W - L - R
  const ih = H - T - B
  const [x0, x1] = dominioLog([...c.pts.map((p) => p.ev), ...fantasmas.map(p => p.ev), c.un].filter(v => v > 0), 0.7)
  const [y0, y1] = dominioLog([...c.pts.map((p) => p.mttr), ...fantasmas.map(p => p.mttr), c.um].filter(v => v > 0), 0.3)
  const sx = (v: number) => L + iw * Math.log(v / x0) / Math.log(x1 / x0)
  const sy = (v: number) => T + ih * (1 - Math.log(v / y0) / Math.log(y1 / y0))
  const ux = sx(c.un)
  const uy = sy(c.um)

  const placed: { x: number; y: number; w: number; h: number }[] = []
  const hueco = (bx: number, by: number, w: number, h: number) =>
    placed.some((b) => bx < b.x + b.w && bx + w > b.x && by < b.y + b.h && by + h > b.y)

  for (const [t, x, y, an] of [
    ['Agudas', L + 8, T + 18, 'start'],
    ['Agudas y crónicas', W - R - 8, T + 18, 'end'],
    ['Bajo control', L + 8, T + ih - 8, 'start'],
    ['Crónicas', W - R - 8, T + ih - 8, 'end'],
  ] as const) {
    const w = t.length * 7.4
    placed.push({ x: an === 'start' ? x : x - w, y: y - 12, w, h: 16 })
  }
  for (const p of c.pts) {
    placed.push({ x: sx(p.ev) - 8, y: sy(p.mttr) - 8, w: 16, h: 16 })
  }

  const ord = [...c.pts].sort((a, b) => Number(b.k === sel) - Number(a.k === sel) || b.min - a.min)
  const anillos: [number, 0 | 1][] = [[11, 0], [30, 1], [54, 1], [82, 1]]
  const angulos = [0, 180, 315, 45, 225, 135, 270, 90]
  let ocultas = 0
  const puntos: PuntoDibujo[] = []

  const top = new Set([...c.pts].sort((a,b) => b.min-a.min).slice(0,5).map(p => p.k))
  for (const p of ord) {
    const x = sx(p.ev)
    const y = sy(p.mttr)
    const w = p.k.length * 6.9 + 2
    const h = 16
    let hit: PuntoDibujo['etiqueta'] = null
    colocar: for (const [r, lin] of (p.q !== 'ok' || top.has(p.k) ? anillos : [])) {
      for (const ang of angulos) {
        const a = (ang * Math.PI) / 180
        const cx = x + Math.cos(a) * r
        const cy = y + Math.sin(a) * r
        const izq = Math.cos(a) < -0.1
        const cen = Math.abs(Math.cos(a)) <= 0.1
        const bx = izq ? cx - w : cen ? cx - w / 2 : cx
        const by = cy - h / 2
        if (bx < L + 2 || bx + w > W - R - 2 || by < T + 2 || by + h > T + ih - 2) continue
        if (hueco(bx, by, w, h)) continue
        placed.push({ x: bx, y: by, w, h })
        hit = { bx, by: by + 12, cx, cy, lin: lin === 1 }
        break colocar
      }
    }
    const rad = Math.max(4, Math.min(12, 12 * Math.sqrt(p.min / Math.max(...c.pts.map(p => p.min), 1))))
    if (!hit) ocultas++
    puntos.push({ p, x, y, rad, etiqueta: hit })
  }

  return {
    W, H, L, R, T, B, iw, ih, ux, uy, sx, sy,
    disponibilidad: { x1: sx(Math.max(x0, c.un*c.um/y1)), y1: sy(c.un*c.um/Math.max(x0, c.un*c.um/y1)), x2: sx(Math.min(x1, c.un*c.um/y0)), y2: sy(c.un*c.um/Math.min(x1, c.un*c.um/y0)) },
    xs: marcasLog(x0, x1).map((v) => ({ v, x: sx(v) })),
    ys: marcasLog(y0, y1).map((v) => ({ v, y: sy(v) })),
    puntos,
    ocultas,
  }
}

