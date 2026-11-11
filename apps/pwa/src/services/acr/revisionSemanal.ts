/** Lógica pura de la Revisión semanal en PC: agrupar por falla y resumir el cumplimiento. */
import type { AccionAcr, Acr, FuerzaAccion } from './acr.types'

const ORDEN: Record<FuerzaAccion, number> = { debil: 0, media: 1, fuerte: 2 }

export type EstadoRevision = 'hecha' | 'vencida' | 'pendiente'

export interface GrupoFalla {
  acr: Acr
  /** De la más débil a la más fuerte. */
  acciones: AccionAcr[]
}

/** Una falla por análisis con acciones. Primero las que tienen la acción más débil. */
export function gruposPorFalla(acrs: readonly Acr[]): GrupoFalla[] {
  return acrs
    .filter((acr) => acr.acciones.length > 0)
    .map((acr) => ({ acr, acciones: [...acr.acciones].sort((a, b) => ORDEN[a.fuerza] - ORDEN[b.fuerza]) }))
    .sort((a, b) => ORDEN[a.acciones[0]!.fuerza] - ORDEN[b.acciones[0]!.fuerza])
}

/** Vencida = sigue pendiente y su fecha límite ya pasó. Hoy aún está en plazo. */
export function estadoDeAccion(accion: AccionAcr, hoy: string): EstadoRevision {
  if (accion.estado === 'hecha') return 'hecha'
  return accion.fechaLimite && accion.fechaLimite < hoy ? 'vencida' : 'pendiente'
}

export interface Cumplimiento { hechas: number; pendientes: number; vencidas: number; sinResponsable: number }

/** Las vencidas también cuentan como pendientes: hechas + pendientes = total. */
export function resumenCumplimiento(acciones: readonly AccionAcr[], hoy: string): Cumplimiento {
  const estados = acciones.map((a) => estadoDeAccion(a, hoy))
  return {
    hechas: estados.filter((e) => e === 'hecha').length,
    pendientes: estados.filter((e) => e !== 'hecha').length,
    vencidas: estados.filter((e) => e === 'vencida').length,
    sinResponsable: acciones.filter((a) => !a.responsable.trim()).length,
  }
}

/** Acciones por equipo, de mayor a menor. */
export function accionesPorEquipo(grupos: readonly GrupoFalla[]): { equipo: string; n: number }[] {
  const m = new Map<string, number>()
  for (const g of grupos) m.set(g.acr.equipo, (m.get(g.acr.equipo) ?? 0) + g.acciones.length)
  return [...m].map(([equipo, n]) => ({ equipo, n })).sort((a, b) => b.n - a.n || a.equipo.localeCompare(b.equipo, 'es', { numeric: true }))
}

/** Minutos de detención de los análisis que los registran. */
export function detencionAnalizada(grupos: readonly GrupoFalla[]): number {
  return grupos.reduce((t, g) => t + (g.acr.minutosDetencion ?? 0), 0)
}

/** «2026-09-24» → «24-09». Sin fecha, una raya. */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [, m, d] = iso.split('-')
  return d && m ? `${d}-${m}` : iso
}
