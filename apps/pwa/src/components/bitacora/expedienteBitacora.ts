import { tecnicosDelEvento, type EventoBitacora } from '@/services/bitacora/bitacora.types'
import { etiquetaTipo, normalizarRepuestos } from '@/services/bitacora/presentacionEvento'
import { nombreEquipoLegible } from '@/services/bitacora/nombreEquipo'

// El título vive en services (lo usa también el correo); se reexporta para quien ya lo importaba de aquí.
export { tituloTurno } from '@/services/bitacora/tituloTurno'

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

/** Plural de un tipo de evento para el total: «1 correctivo», «7 correctivos», «2 mejoras». */
export function pluralTipo(tipo: string, n: number): string {
  if (n === 1) return tipo
  return /[aeiou]$/i.test(tipo) ? `${tipo}s` : `${tipo}es`
}
