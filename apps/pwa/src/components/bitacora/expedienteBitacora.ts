import { tecnicosDelEvento, type EventoBitacora } from '@/services/bitacora/bitacora.types'
import type { ResumenBitacora } from '@/services/bitacora/resumenBitacora'
import { formatoMinutos } from '@/services/bitacora/turnoMantencion'
import { etiquetaTipo, normalizarRepuestos } from '@/services/bitacora/presentacionEvento'
import { nombreEquipoLegible } from '@/services/bitacora/nombreEquipo'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * Título del expediente del turno en PC: dice lo que pasó, no el nombre del
 * módulo (criterio limpio, 08-11-2026). Primero lo que costó a la línea.
 */
export function tituloTurno(r: ResumenBitacora, fotos: number): string {
  if (r.eventos === 0) return 'Sin trabajos registrados en este turno'
  const trabajos = plural(r.eventos, 'trabajo', 'trabajos')
  if (r.conParada > 0) {
    const min = r.minutosParada > 0 ? ` ${formatoMinutos(r.minutosParada)}` : ''
    return `${trabajos}; ${plural(r.conParada, 'detuvo', 'detuvieron')} la máquina${min}`
  }
  if (r.afectados > 0) return `${trabajos}; ${r.afectados} ${r.afectados === 1 ? 'siguió' : 'siguieron'} gracias a Mantención`
  const conFotos = fotos > 0 ? ` y ${plural(fotos, 'foto', 'fotos')}` : ''
  return `${trabajos}${conFotos}; ninguno anotó detención`
}

/** Técnicos del turno con cuántos trabajos firmó cada uno; los no marcados como presentes, al final. */
export function tecnicosConTrabajos(eventos: readonly EventoBitacora[], presentes: readonly string[]) {
  const cuenta = new Map<string, number>()
  for (const n of presentes) cuenta.set(n, 0)
  for (const e of eventos) for (const n of tecnicosDelEvento(e)) cuenta.set(n, (cuenta.get(n) ?? 0) + 1)
  const marcados = new Set(presentes)
  return [...cuenta.entries()]
    .map(([nombre, trabajos]) => ({ nombre, trabajos, presente: marcados.has(nombre) }))
    .sort((a, b) => Number(b.presente) - Number(a.presente) || b.trabajos - a.trabajos || a.nombre.localeCompare(b.nombre))
}

/** La fila de total de la tabla: equipos distintos, tipos, repuestos, técnicos y fotos. */
export function totalesTurno(eventos: readonly EventoBitacora[]) {
  const equipos = new Set(eventos.map((e) => nombreEquipoLegible(e.equipo).toLowerCase()).filter(Boolean)).size
  const porTipo = new Map<string, number>()
  for (const e of eventos) {
    const t = etiquetaTipo(e).toLowerCase()
    porTipo.set(t, (porTipo.get(t) ?? 0) + 1)
  }
  const tipos = [...porTipo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const repuestos = eventos.reduce((n, e) => n + normalizarRepuestos(e.repuestos).length, 0)
  const tecnicos = new Set(eventos.flatMap((e) => tecnicosDelEvento(e))).size
  const fotos = eventos.reduce((n, e) => n + (e.fotos?.length ?? 0), 0)
  return { equipos, tipos, repuestos, tecnicos, fotos }
}
