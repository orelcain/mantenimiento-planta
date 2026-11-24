/**
 * «Por qué va a P0» (mockup v4, versión 5): un árbol que cuadra. Con Puerta 0, la raíz son los registros de Matrix
 * (todas las piezas de Gate 0, también las que el espejo no leyó); «Fuera de límites» se abre en sus hijos según el
 * seteo leído de las piezas, y los hijos suman el padre. Sin Puerta 0 el árbol es estimado (seteo inferido).
 *
 * También arma el detalle de un minuto y de un tramo de 15 min para las hojas que abre el gráfico. Puro.
 */
import type { PiezaEspejo } from '@/services/grader/espejo/espejoFilas'
import type { PiezaP0, ResumenP0 } from '@/services/grader/espejo/motivoP0'
import type { StoredGate0Record } from '@/services/grader/graderGate0Store'

export type ClaveFila = 'fdl' | 'calibre' | 'calidad' | 'consprod' | 'sinexp' | 'foto' | 'tooclose' | 'puerta' | 'sinpeso'

/** Una pieza de P0 como la muestra la hoja. */
export interface PiezaArbol {
  ts: string
  kg: number | null
  calidad: string
  /** La gate que le tocaba, en palabras («gate 11 o 12», «ninguna (10-12 lb)», «sin lectura»). */
  gate: string
  cantidad: number
}

export interface FilaArbol {
  clave: ClaveFila
  rotulo: string
  /** Rótulo corto para la fila (el largo va en `title`). */
  corto?: string
  nivel: 0 | 1
  dueno: 'mantencion' | 'seteo' | null
  /** `null` = sin dato con qué cruzar (la fila muestra «—»). */
  piezas: PiezaArbol[] | null
  /** Nota chica junto al rótulo («sin lectura»). */
  nota?: string
}

export interface ArbolP0 {
  exacto: boolean
  /** Piezas de P0 de la raíz (registros de Puerta 0 con ella; piezas del espejo sin ella). */
  total: number
  mant: number
  seteo: number
  filas: FilaArbol[]
  /** Registros de Puerta 0 que el espejo no leyó (hueco): van a la raíz igual, sin seteo con qué compararlos. */
  sinLectura: number
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const clave = (ts: string, kg: number): string => `${ts.slice(0, 19)}|${kg.toFixed(2)}` // decimal-tecnico: clave de cruce, no se muestra

/** Motivo exacto de Puerta 0 → fila de primer nivel. */
function filaDeMotivo(m: string): ClaveFila | null {
  const n = norm(m)
  if (n.startsWith('fuera de limites')) return 'fdl'
  if (n.includes('fotocelula')) return 'foto'
  if (n.startsWith('too close')) return 'tooclose'
  if (n.startsWith('puerta no preparada')) return 'puerta'
  return null
}

/** «10-12lb» → «10-12 lb»; «12-up lb» → «12+ lb». */
export function calibreLegible(c: string): string {
  return c.replace(/\s*lb$/i, ' lb').replace(/-up\b/i, '+').trim()
}

/** La gate que le tocaba a la pieza, como la dice la hoja del mockup. */
export function gateQueTocaba(p: PiezaP0, hijo: ClaveFila | null): string {
  const cal = p.calibres[0] ? calibreLegible(p.calibres[0]) : '—'
  if (hijo === 'calibre') return `ninguna (${cal})`
  if (hijo === 'calidad') return `ninguna ${p.calidad || '—'} en ${cal}`
  const gs = [...new Set(p.calibres.flatMap((c) => p.gatesCalibre[c] ?? []))].sort((a, b) => a - b)
  return gs.length ? `gate ${gs.join(' o ')}` : '—'
}

/** Hijo de «Fuera de límites» según la causa estimada por el seteo leído. */
function hijoFdl(p: PiezaP0): 'calibre' | 'calidad' | 'sinexp' {
  if (p.causa === 'sin-gate-peso') return 'calibre'
  if (p.causa === 'calidad-sin-gate' || p.causa === 'calidad-d') return 'calidad'
  return 'sinexp'
}

export const aPieza = (p: PiezaP0, hijo: ClaveFila | null): PiezaArbol => ({ ts: p.ts, kg: p.kg || null, calidad: p.calidad, gate: gateQueTocaba(p, hijo), cantidad: p.cantidad })

/**
 * El árbol. `registros` = Puerta 0 del turno ya recortada a la ventana del turno (o `null`). Las piezas del espejo sin
 * registro no entran a un árbol exacto: la raíz es Matrix.
 */
export function arbolP0(r: ResumenP0, registros: readonly StoredGate0Record[] | null): ArbolP0 {
  if (!registros || registros.length === 0) return arbolEstimado(r)
  const filas: Record<ClaveFila, PiezaArbol[]> = { fdl: [], calibre: [], calidad: [], consprod: [], sinexp: [], foto: [], tooclose: [], puerta: [], sinpeso: [] }
  // Claves de las piezas que sí cruzaron con un registro: el resto de los registros cayó donde el espejo no leyó.
  const cruzadas = new Map<string, number>()
  for (const p of r.porPieza) {
    if (!p.exacto || p.motivo === null) continue
    const k = filaDeMotivo(p.motivo)
    if (!k) continue
    let hijo: ClaveFila | null = null
    if (k === 'fdl') {
      hijo = hijoFdl(p)
      filas[hijo].push(aPieza(p, hijo))
    }
    filas[k].push(aPieza(p, hijo))
    const c = clave(p.ts, p.kg)
    cruzadas.set(c, (cruzadas.get(c) ?? 0) + 1)
  }
  let sinLectura = 0
  for (const x of registros) {
    const k = filaDeMotivo(x.error ?? '')
    if (!k) continue
    const c = x.weightKg != null ? clave(x.ts, x.weightKg) : ''
    const n = cruzadas.get(c) ?? 0
    if (n > 0) { cruzadas.set(c, n - 1); continue }
    const pz: PiezaArbol = { ts: x.ts, kg: x.weightKg ?? null, calidad: '—', gate: 'sin lectura', cantidad: x.pieces || 1 }
    filas[k].push(pz)
    if (k === 'fdl') filas.sinexp.push(pz)
    sinLectura += pz.cantidad
  }
  const pz = (a: PiezaArbol[]) => a.reduce((s, x) => s + x.cantidad, 0)
  const total = pz(filas.fdl) + pz(filas.foto) + pz(filas.tooclose) + pz(filas.puerta)
  const mant = pz(filas.foto)
  const sinexpLectura = filas.sinexp.some((x) => x.gate === 'sin lectura')
  return {
    exacto: true,
    total,
    mant,
    seteo: total - mant,
    sinLectura,
    filas: [
      { clave: 'fdl', rotulo: 'Fuera de límites', nivel: 0, dueno: 'seteo', piezas: filas.fdl },
      { clave: 'calibre', rotulo: 'Sin gate de calibre', nivel: 1, dueno: 'seteo', piezas: filas.calibre },
      { clave: 'calidad', rotulo: 'Sin gate de calidad', nivel: 1, dueno: 'seteo', piezas: filas.calidad },
      // Matrix marca toda pieza de P0 como CONGELADO · DESTINO FILETE: no hay con qué cruzar.
      { clave: 'consprod', rotulo: 'Sin gate de conservación o producto', corto: 'Conservación o producto', nivel: 1, dueno: 'seteo', piezas: null },
      { clave: 'sinexp', rotulo: 'Fuera de límites sin explicación', corto: 'Sin explicación', nivel: 1, dueno: 'seteo', piezas: filas.sinexp, nota: sinexpLectura ? 'sin lectura' : undefined },
      { clave: 'foto', rotulo: 'No leído por fotocélula', nivel: 0, dueno: 'mantencion', piezas: filas.foto },
      { clave: 'tooclose', rotulo: 'Too close or too long', nivel: 0, dueno: 'seteo', piezas: filas.tooclose },
      { clave: 'puerta', rotulo: 'Puerta no preparada', nivel: 0, dueno: 'seteo', piezas: filas.puerta },
    ],
  }
}

/** Sin Puerta 0: lo que se puede decir con el seteo leído de las piezas. Fotocélula y puerta no se separan. */
function arbolEstimado(r: ResumenP0): ArbolP0 {
  const f: Record<'foto' | 'calibre' | 'calidad' | 'sinpeso', PiezaArbol[]> = { foto: [], calibre: [], calidad: [], sinpeso: [] }
  for (const p of r.porPieza) {
    if (p.causa === null) f.sinpeso.push(aPieza(p, null))
    else if (p.causa === 'tenia-gate') f.foto.push(aPieza(p, null))
    else if (p.causa === 'sin-gate-peso') f.calibre.push(aPieza(p, 'calibre'))
    else f.calidad.push(aPieza(p, 'calidad'))
  }
  const pz = (a: PiezaArbol[]) => a.reduce((s, x) => s + x.cantidad, 0)
  const total = pz(f.foto) + pz(f.calibre) + pz(f.calidad) + pz(f.sinpeso)
  const mant = pz(f.foto)
  return {
    exacto: false,
    total,
    mant,
    seteo: pz(f.calibre) + pz(f.calidad),
    sinLectura: 0,
    filas: [
      { clave: 'foto', rotulo: 'Fotocélula o puerta (tenía gate)', corto: 'Fotocélula o puerta', nivel: 0, dueno: 'mantencion', piezas: f.foto },
      { clave: 'calibre', rotulo: 'Sin gate de calibre', nivel: 0, dueno: 'seteo', piezas: f.calibre },
      { clave: 'calidad', rotulo: 'Sin gate de calidad', nivel: 0, dueno: 'seteo', piezas: f.calidad },
      ...(f.sinpeso.length ? [{ clave: 'sinpeso' as const, rotulo: 'Sin peso (no se puede repartir)', corto: 'Sin peso', nivel: 0 as const, dueno: null, piezas: f.sinpeso }] : []),
    ],
  }
}

/** Piezas de la fila agrupadas por la gate que les tocaba (las 6 mayores) y por hora del reloj. */
export function resumenFila(piezas: readonly PiezaArbol[]): { porGate: Array<{ gate: string; n: number }>; porHora: Array<{ hora: string; n: number }>; kg: number } {
  const g = new Map<string, number>()
  const h = new Map<string, number>()
  let kg = 0
  // En orden de hora: las piezas que el espejo no leyó llegan al final de la lista.
  for (const p of [...piezas].sort((x, y) => x.ts.localeCompare(y.ts))) {
    g.set(p.gate, (g.get(p.gate) ?? 0) + p.cantidad)
    const hh = p.ts.slice(11, 13)
    h.set(hh, (h.get(hh) ?? 0) + p.cantidad)
    kg += p.kg ?? 0
  }
  return {
    porGate: [...g].map(([gate, n]) => ({ gate, n })).sort((a, b) => b.n - a.n).slice(0, 6),
    porHora: [...h].map(([hh, n]) => ({ hora: hh, n })),
    kg,
  }
}

/** Lo que pasó en un minuto del grader: piezas por gate (0-12) y el P0 por dueño y motivo. */
export interface DetalleMinuto {
  ts: string
  porGate: number[]
  leidas: number
  lote: string | null
  mant: Array<{ rotulo: string; n: number }>
  seteo: Array<{ rotulo: string; n: number }>
  estimado: boolean
}

/** Motivo de una pieza de P0 para el detalle: exacto si cruzó con Puerta 0; si no, la causa estimada. */
export function motivoDe(p: PiezaP0): string {
  if (p.exacto && p.motivo) {
    const k = filaDeMotivo(p.motivo)
    return k === 'fdl' ? 'Fuera de límites' : k === 'foto' ? 'No leído por fotocélula' : k === 'puerta' ? 'Puerta no preparada' : k === 'tooclose' ? 'Too close or too long' : p.motivo
  }
  if (p.causa === 'tenia-gate') return 'Fotocélula o puerta'
  if (p.causa === 'sin-gate-peso') return 'Sin gate de calibre'
  if (p.causa === 'calidad-sin-gate' || p.causa === 'calidad-d') return 'Sin gate de calidad'
  return 'Sin peso'
}

export function detalleMinuto(piezas: readonly PiezaEspejo[], porPieza: readonly PiezaP0[], minutoTs: string): DetalleMinuto {
  const pre = minutoTs.slice(0, 16)
  const porGate = new Array<number>(13).fill(0)
  let lote: string | null = null
  for (const p of piezas) {
    if (p.ts.slice(0, 16) !== pre) continue
    if (p.gate >= 0 && p.gate <= 12) porGate[p.gate] = (porGate[p.gate] ?? 0) + p.cantidad
    lote = p.lote || lote
  }
  const cuenta = { mantencion: new Map<string, number>(), seteo: new Map<string, number>() }
  let estimado = false
  for (const p of porPieza) {
    if (p.ts.slice(0, 16) !== pre || p.dueno === 'sin-reparto') continue
    if (!p.exacto) estimado = true
    const m = motivoDe(p)
    cuenta[p.dueno].set(m, (cuenta[p.dueno].get(m) ?? 0) + p.cantidad)
  }
  const lista = (m: Map<string, number>) => [...m].map(([rotulo, n]) => ({ rotulo, n })).sort((a, b) => b.n - a.n)
  return { ts: pre, porGate, leidas: porGate.reduce((s, x) => s + x, 0), lote, mant: lista(cuenta.mantencion), seteo: lista(cuenta.seteo), estimado }
}
