/**
 * Cubetas por minuto del espejo del grader (etapa E-A), lógica pura.
 *
 * Rendimiento: las series del monitor NO recorren las piezas en cada snapshot. Cada
 * documento de hora (`{fecha}/{HH}`, ~1.500 piezas) se agrupa en ≤ 60 cubetas una sola
 * vez; la caché (`CacheHorasEspejo`) reemplaza el arreglo de piezas de un documento solo
 * cuando ese documento cambió, y aquí las cubetas se guardan por la identidad de ese
 * arreglo. Un envío del lector (que toca 1-2 horas) reagrupa 1-2 documentos; el turno se
 * arma uniendo ~16 × 60 cubetas.
 *
 * Gate 0, pesos nulos y pesos en 0 quedan fuera de kg, peso medio, calibre y calidad: el
 * rechazo trae piezas «0-2 lb» de 5,8 kg (Chonchi, 19-11) y en Yal pesos en 0 que
 * ensuciarían el reparto y la regla de peso.
 */
import type { PiezaEspejo } from './espejoFilas'
import type { MinutosGrader } from './alertasGrader'

export interface CubetaMinuto {
  /** Inicio del minuto (ms, wall-clock-as-UTC). */
  ms: number
  pz: number
  g0: number
  kgSalida: number
  pzPeso: number
  calibre: Record<string, number>
  calidad: Record<string, number>
  /** Piezas por lote (todas las gates). */
  lotes: Record<string, number>
  /** Lote y hora de la última pieza del minuto. */
  ultimoLote: string
  ultimaTs: string
}

const sumar = (r: Record<string, number>, k: string, n: number) => {
  if (!k) return
  r[k] = (r[k] ?? 0) + n
}

/** Agrupa piezas (de un documento de hora) en cubetas por minuto, en orden. */
export function cubetasDe(piezas: readonly PiezaEspejo[]): CubetaMinuto[] {
  const por = new Map<number, CubetaMinuto>()
  for (const p of piezas) {
    const ms = Date.parse(`${p.fecha}T${p.hora.slice(0, 5)}:00.000Z`)
    if (Number.isNaN(ms)) continue
    let c = por.get(ms)
    if (!c) {
      c = { ms, pz: 0, g0: 0, kgSalida: 0, pzPeso: 0, calibre: {}, calidad: {}, lotes: {}, ultimoLote: '', ultimaTs: '' }
      por.set(ms, c)
    }
    c.pz += p.cantidad
    sumar(c.lotes, p.lote, p.cantidad)
    if (p.ts >= c.ultimaTs) {
      c.ultimaTs = p.ts
      c.ultimoLote = p.lote
    }
    if (p.gate === 0) {
      c.g0 += p.cantidad
      continue
    }
    if (p.pesoKg !== null && p.pesoKg > 0) {
      c.kgSalida += p.pesoKg
      c.pzPeso += p.cantidad
      sumar(c.calibre, p.calibre, p.cantidad)
      sumar(c.calidad, p.calidad, p.cantidad)
    }
  }
  return Array.from(por.values()).sort((a, b) => a.ms - b.ms)
}

/**
 * Cubetas de varios documentos con memo por la identidad del arreglo de piezas de cada uno.
 * `agrupados` cuenta cuántos documentos se agruparon (los tests miden que no se reagrupe todo).
 */
export class AgregadorMinutos {
  agrupados = 0
  private memo = new WeakMap<readonly PiezaEspejo[], CubetaMinuto[]>()

  de(piezasDoc: readonly PiezaEspejo[]): CubetaMinuto[] {
    let c = this.memo.get(piezasDoc)
    if (!c) {
      c = cubetasDe(piezasDoc)
      this.agrupados++
      this.memo.set(piezasDoc, c)
    }
    return c
  }

  /** Une las cubetas de los documentos (en orden de clave = orden por hora). */
  unir(docs: ReadonlyArray<readonly PiezaEspejo[]>): CubetaMinuto[] {
    const out: CubetaMinuto[] = []
    for (const d of docs) for (const c of this.de(d)) out.push(c)
    return out
  }
}

/** Serie del turno en el eje de minutos [t0, t0 + n). */
export interface SerieGrader extends MinutosGrader {
  t0Ms: number
  calidad: Array<Record<string, number> | undefined>
  /** Minutos con dato: la última pieza leída cae en `hastaMin - 1`; 0 sin piezas. */
  hastaMin: number
  /** Hora ISO de la última pieza del eje. */
  ultimaTs: string | null
  /** Lote de la última pieza, desde qué minuto corre sin interrupción (otro lote) y sus piezas en ese tramo. */
  lote: { lote: string; desdeMin: number; piezas: number } | null
}

/**
 * Cubetas → arreglos por minuto en [t0Ms, t0Ms + n·60 s). Solo se recorren cubetas (≤ 60 por hora), nunca piezas.
 * `t0Ms` se baja al minuto.
 */
export function serieDesdeCubetas(cubetas: readonly CubetaMinuto[], t0Ms: number, n: number): SerieGrader {
  const t0 = Math.floor(t0Ms / 60_000) * 60_000
  const N = Math.max(0, Math.floor(n))
  const pz = new Array<number>(N).fill(0)
  const g0 = new Array<number>(N).fill(0)
  const kgSalida = new Array<number>(N).fill(0)
  const pzPeso = new Array<number>(N).fill(0)
  const calibre = new Array<Record<string, number> | undefined>(N).fill(undefined)
  const calidad = new Array<Record<string, number> | undefined>(N).fill(undefined)
  const lotes = new Array<Record<string, number> | undefined>(N).fill(undefined)
  let hasta = 0
  let ultimaTs: string | null = null
  let ultimoLote = ''
  for (const c of cubetas) {
    const m = Math.round((c.ms - t0) / 60_000)
    if (m < 0 || m >= N || c.pz <= 0) continue
    pz[m] = (pz[m] ?? 0) + c.pz
    g0[m] = (g0[m] ?? 0) + c.g0
    kgSalida[m] = (kgSalida[m] ?? 0) + c.kgSalida
    pzPeso[m] = (pzPeso[m] ?? 0) + c.pzPeso
    calibre[m] = c.pzPeso > 0 ? c.calibre : calibre[m]
    calidad[m] = c.pzPeso > 0 ? c.calidad : calidad[m]
    lotes[m] = c.lotes
    if (m + 1 > hasta) hasta = m + 1
    if (ultimaTs === null || c.ultimaTs > ultimaTs) {
      ultimaTs = c.ultimaTs
      ultimoLote = c.ultimoLote
    }
  }
  let lote: SerieGrader['lote'] = null
  if (ultimoLote) {
    let desde = hasta - 1
    let piezas = 0
    for (let m = hasta - 1; m >= 0; m--) {
      const l = lotes[m]
      if (!l) continue // minuto sin piezas: no corta el lote
      if (!l[ultimoLote]) break
      piezas += l[ultimoLote] ?? 0
      desde = m
      // Un minuto con dos lotes es donde empezó este: hasta ahí llega.
      if (Object.keys(l).length > 1) break
    }
    lote = { lote: ultimoLote, desdeMin: desde, piezas }
  }
  return { t0Ms: t0, pz, g0, kgSalida, pzPeso, calibre, calidad, hastaMin: hasta, ultimaTs, lote }
}
