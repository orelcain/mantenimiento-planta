/**
 * Textos y agrupación de la ventana de Causa raíz en PC (`AcrRapidoSheet` con `AcrExpedientePC`).
 * Funciones puras, sin React.
 */
import type { AccionAcr, CausaAcr } from '@/services/acr/acr.types'

/** Primera frase de lo que se rompió: es el título de la ventana. */
export function tituloAcr(definicion: string): string {
  const limpia = definicion.trim()
  const fin = limpia.search(/[.…]\s/)
  return fin > 0 ? limpia.slice(0, fin) : limpia.replace(/\.$/, '')
}

const TIPOS_EQUIPO = new Set(['evisceradora', 'fileteadora', 'descabezadora', 'grader'])

function palabraTitulo(p: string): string {
  // Códigos y números quedan tal cual: N1, 142, B200.
  if (/\d/.test(p)) return p
  return `${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase()}`
}

/** `EVISCERADORA BAADER 142 N1` → tipo `Evisceradora`, nombre `Baader 142 N1`. */
export function partesEquipo(equipo: string): { tipo: string | null; nombre: string } {
  const palabras = equipo.trim().split(/\s+/).filter(Boolean)
  const primera = palabras[0]
  if (primera && palabras.length > 1 && TIPOS_EQUIPO.has(primera.toLowerCase())) {
    return { tipo: palabraTitulo(primera), nombre: palabras.slice(1).map(palabraTitulo).join(' ') }
  }
  return { tipo: null, nombre: palabras.map(palabraTitulo).join(' ') }
}

/** Nombre mínimo para una fila de antecedentes: `N2`, `B200`; si no, la primera palabra. */
export function equipoCorto(equipo: string): string {
  const linea = /\bN\d+\b/i.exec(equipo)
  if (linea) return linea[0].toUpperCase()
  const baader = /BAADER\s*(\d+)/i.exec(equipo)
  if (baader) return `B${baader[1]}`
  return palabraTitulo(equipo.trim().split(/\s+/)[0] ?? '').slice(0, 6)
}

/** `2026-09-24` → `24-09`. */
export function diaMes(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return mes && dia ? `${dia}-${mes}` : iso
}

/** `2026-09-24` → `24-09-2026`. */
export function fechaLarga(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return anio && mes && dia ? `${dia}-${mes}-${anio}` : iso
}

/** Turno legible: el id termina en `_dia` o `_noche`; con otro id, solo la fecha. */
export function etiquetaTurno(turnoId: string, fecha: string): string {
  const larga = fechaLarga(fecha)
  if (/_dia$/i.test(turnoId)) return `Día, ${larga}`
  if (/_noche$/i.test(turnoId)) return `Noche, ${larga}`
  return larga
}

export interface GrupoPlan {
  /** null = acciones sin causa asignada. */
  causa: CausaAcr | null
  acciones: AccionAcr[]
}

/** Una fila por causa con sus acciones; las acciones sin causa válida van al final. */
export function gruposPlan(causas: readonly CausaAcr[], acciones: readonly AccionAcr[]): GrupoPlan[] {
  const ids = new Set(causas.map((c) => c.id))
  const grupos: GrupoPlan[] = causas.map((causa) => ({
    causa,
    acciones: acciones.filter((a) => a.causaId === causa.id),
  }))
  const sueltas = acciones.filter((a) => a.causaId == null || !ids.has(a.causaId))
  return sueltas.length > 0 ? [...grupos, { causa: null, acciones: sueltas }] : grupos
}

/** Texto de la columna Plazo: una acción hecha muestra cuándo se hizo. */
export function plazoAccion(a: AccionAcr): { texto: string; apagado: boolean } {
  if (a.estado === 'hecha') return { texto: a.hechaEn ? `Hecha ${diaMes(a.hechaEn)}` : 'Hecha', apagado: false }
  return a.fechaLimite ? { texto: fechaLarga(a.fechaLimite), apagado: false } : { texto: 'Sin fecha', apagado: true }
}

/** La fila de totales con la que cierra la tabla. */
export function totalesPlan(causas: readonly CausaAcr[], acciones: readonly AccionAcr[]): { causas: string; acciones: string; asignadas: string } {
  const fuertes = acciones.filter((a) => a.fuerza === 'fuerte').length
  const hechas = acciones.filter((a) => a.estado === 'hecha').length
  const partes = [
    `${acciones.length} ${acciones.length === 1 ? 'acción' : 'acciones'}`,
    `${fuertes} ${fuertes === 1 ? 'fuerte' : 'fuertes'}`,
    ...(hechas > 0 ? [`${hechas} ${hechas === 1 ? 'hecha' : 'hechas'}`] : []),
  ]
  return {
    causas: `${causas.length} ${causas.length === 1 ? 'causa' : 'causas'}`,
    acciones: partes.join(', '),
    asignadas: `${acciones.filter((a) => a.responsable.trim() !== '').length} de ${acciones.length}`,
  }
}
