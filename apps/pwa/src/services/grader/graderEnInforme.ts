/**
 * Bloque «Grader» del detalle de turno (estructura fija, 20-11-2026).
 *
 * El día se ve igual con o sin Excel de Matrix: Shoplogix es la base y el grader
 * es un extra identificable. Este módulo decide QUÉ muestra el bloque, sin React:
 * - `no-aplica`: la línea no pasa por grader (Filete). No se dibuja nada.
 * - `con`: hay resumen del grader con piezas.
 * - `en-curso`: el turno corre y aún no llega exporte.
 * - `sin`: turno cerrado sin datos del grader.
 *
 * ⚠ Horas: el grader y Shoplogix guardan hora de planta marcada como UTC; todo se
 * lee con `getUTCHours`, nunca se convierte de zona.
 */
import { nivelDePureza } from './graderPurezaNivel'
import type { GraderDailySummary } from './types'

export type EstadoBloqueGrader = 'no-aplica' | 'con' | 'en-curso' | 'sin'

export function estadoBloqueGrader(p: {
  tieneGrader: boolean
  summary: Pick<GraderDailySummary, 'totalPieces'> | null | undefined
  enCurso: boolean
}): EstadoBloqueGrader {
  if (!p.tieneGrader) return 'no-aplica'
  if (p.summary && p.summary.totalPieces > 0) return 'con'
  return p.enCurso ? 'en-curso' : 'sin'
}

export interface CeldaP0Hora {
  /** «07», «23», «00»… */
  hora: string
  /** % P0 de esa hora (1 decimal), o null si el grader no tiene piezas en esa hora. */
  pct: number | null
  piezas: number
}

const HORA_MS = 3_600_000

/**
 * Puerta 0 por hora, alineada a las horas de la ventana del turno (la misma del
 * gráfico de Shoplogix). Una hora sin piezas del grader queda en null: el hueco
 * se ve, no se rellena. Cruza medianoche sin problema porque la ventana dura
 * menos de 24 h y cada hora del reloj aparece una sola vez.
 */
export function p0PorHora(
  buckets: GraderDailySummary['hourlyBuckets'] | null | undefined,
  inicioMs: number,
  finMs: number,
): CeldaP0Hora[] {
  if (!Number.isFinite(inicioMs) || !Number.isFinite(finMs) || finMs <= inicioMs) return []
  const porHora = new Map<number, { total: number; p0: number }>()
  for (const b of buckets ?? []) {
    const prev = porHora.get(b.hour) ?? { total: 0, p0: 0 }
    porHora.set(b.hour, { total: prev.total + (b.totalPieces || 0), p0: prev.p0 + (b.p0Pieces || 0) })
  }
  const celdas: CeldaP0Hora[] = []
  const primera = Math.floor(inicioMs / HORA_MS) * HORA_MS
  for (let ms = primera; ms < finMs && celdas.length < 24; ms += HORA_MS) {
    const h = new Date(ms).getUTCHours()
    const b = porHora.get(h)
    const piezas = b?.total ?? 0
    celdas.push({
      hora: String(h).padStart(2, '0'),
      pct: piezas > 0 ? Math.round(((b?.p0 ?? 0) / piezas) * 1000) / 10 : null,
      piezas,
    })
  }
  return celdas
}

/** Compuertas con pureza ≥ 95 % sobre las que tienen asignación. null si no hay gateMix. */
export function purezaCompuertas(
  gateMix: GraderDailySummary['gateMix'] | null | undefined,
): { ok: number; asignadas: number } | null {
  if (!gateMix) return null
  const asignadas = gateMix.gates.filter((g) => g.purityPct != null)
  if (asignadas.length === 0) return null
  return { ok: asignadas.filter((g) => nivelDePureza(g.purityPct) === 'ok').length, asignadas: asignadas.length }
}

/** Intensidad del petróleo en la celda de P0 por hora (0–100), relativa al máximo del turno. */
export function intensidadP0(pct: number | null, maxPct: number): number {
  if (pct == null || maxPct <= 0) return 0
  return Math.round(12 + (Math.min(pct, maxPct) / maxPct) * 48)
}
