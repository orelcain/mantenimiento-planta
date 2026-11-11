/**
 * Cuentas y textos de la ventana «Tiempo perdido y fallas» en PC (`CifrasExpedientePC`). Sin React, para probarlas solas.
 */
import type { DuenoPerdida } from '@/services/shoplogix/monitorEventos'

export interface Perdida { dueno: DuenoPerdida; min: number }
export interface Causa { causa: string; min: number; dueno: DuenoPerdida; veces: number }
export interface FallaMaquina { name: string; disp: number | null; fallas: number; fallaMin: number; mttr: number | null; microN: number; microMin: number }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

/** «2026-11-06_Turno 2» → «Turno 2 · 6 nov». Sin id reconocible, null. */
export function etiquetaTurno(turnoId: string | null | undefined): string | null {
  const m = turnoId?.match(/^(\d{4})-(\d{2})-(\d{2})_(.+)$/)
  if (!m) return null
  const mes = MESES[Number(m[2]) - 1]
  if (!mes) return null
  return `${(m[4] ?? '').replace(/\+/g, ' ').trim()} · ${Number(m[3])} ${mes}`
}

/** Parte entera del total, en %. Con total 0, 0. */
export const parte = (min: number, total: number) => (total > 0 ? Math.round((min / total) * 100) : 0)

/** El título dice lo que pasó: cuánto perdió la línea y qué causa se llevó la mayor parte. */
export function tituloPerdido(total: number, causas: Causa[], horas: (min: number) => string): string {
  if (total <= 0) return 'La línea no perdió tiempo en este turno'
  const mayor = causas.reduce<Causa | null>((a, c) => (a == null || c.min > a.min ? c : a), null)
  if (!mayor || mayor.min <= 0) return `La línea perdió ${horas(total)}`
  return `La línea perdió ${horas(total)}; el ${parte(mayor.min, total)} % fue ${mayor.causa}`
}

/** Fila de cierre de «Fallas por máquina»: sumas de fallas, minutos y micro de todas las máquinas. */
export function totalMaquinas(filas: FallaMaquina[]) {
  return filas.reduce(
    (a, m) => ({ fallas: a.fallas + m.fallas, fallaMin: a.fallaMin + m.fallaMin, microN: a.microN + m.microN, microMin: a.microMin + m.microMin }),
    { fallas: 0, fallaMin: 0, microN: 0, microMin: 0 },
  )
}

/** Dueños de mayor a menor, sin «programado» (no es pérdida). */
export const duenosOrdenados = (perdidas: Perdida[]) => perdidas.filter((p) => p.dueno !== 'programado').slice().sort((a, b) => b.min - a.min)
