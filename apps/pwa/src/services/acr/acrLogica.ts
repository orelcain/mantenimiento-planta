/**
 * Lógica pura del ACR: cuándo se puede cerrar y el KPI de fuerza de las acciones. Sin Firestore
 * ni React: se prueba en `__tests__/acrLogica.test.ts`.
 *
 * R1 (SPEC_ACR_R1.md §1): la hoja de 5 pasos se retiró. Cerrar pide las 3 respuestas, una causa
 * latente y una acción. Regla de fondo: el ACR no se cierra con una causa humana.
 */
import type { Acr, AccionAcr, EventoRefAcr, FuerzaAccion } from './acr.types'

export const MENSAJE_LATENTE =
  'Falta la causa latente: la que hace que vuelva a pasar. El error humano no es causa raíz.'

/** Tipos de evento que piden ACR (los ids reales de `TIPOS_EVENTO` + el legado `falla`). */
const TIPOS_CON_ACR = ['correctivo', 'falla'] as const

/** El ACR aplica a fallas correctivas o a cualquier evento con detención de máquina. */
export function eventoRequiereAcr(evento: Pick<EventoRefAcr, 'minutosParada'> & { tipo: string }): boolean {
  return (TIPOS_CON_ACR as readonly string[]).includes(evento.tipo) || (evento.minutosParada ?? 0) > 0
}

/**
 * Lo primero que impide cerrar el ACR (R1), o null si ya se puede. El orden es el de la tarjeta:
 * las 3 preguntas, luego la causa latente y por último la acción.
 */
export function motivoNoCierra(acr: Acr): string | null {
  const r = acr.respuestas
  if (!r?.queSeRompio.trim()) return 'Falta: qué se rompió.'
  if (!r.porQue.trim()) return 'Falta: por qué se rompió.'
  if (!r.queHacemos.trim()) return 'Falta: qué hacemos para que no vuelva.'
  if (!acr.causas.some((c) => c.nivel === 'latente')) return MENSAJE_LATENTE
  if (acr.acciones.length === 0 || acr.acciones.some((a) => !a.texto.trim())) {
    return 'Falta una acción con texto y su fuerza.'
  }
  return null
}

export function puedeCerrar(acr: Acr): boolean {
  return motivoNoCierra(acr) === null
}

/**
 * ¿Aplica el análisis a este evento? Solo fallas correctivas con detención de máquina (R1).
 * `eventoRequiereAcr` es más amplio: decide si la fila se monta, por si ya existe un ACR.
 */
export function aplicaAnalisis(evento: { tipo: string; minutosParada: number | null }): boolean {
  return (TIPOS_CON_ACR as readonly string[]).includes(evento.tipo) && (evento.minutosParada ?? 0) > 0
}

export interface ResumenFuerza {
  acciones: number
  debil: number
  media: number
  fuerte: number
  /** Porcentaje sin redondear; null si no hay acciones. */
  fuertePct: number | null
}

export function resumenFuerza(acciones: readonly AccionAcr[]): ResumenFuerza {
  const cuenta = (f: FuerzaAccion) => acciones.filter((a) => a.fuerza === f).length
  const fuerte = cuenta('fuerte')
  return {
    acciones: acciones.length,
    debil: cuenta('debil'),
    media: cuenta('media'),
    fuerte,
    fuertePct: acciones.length > 0 ? (fuerte / acciones.length) * 100 : null,
  }
}

export interface FilaEquipoMes {
  equipo: string
  /** YYYY-MM */
  mes: string
  acrs: number
  acciones: number
  fuertes: number
  fuertePct: number | null
}

export interface KpiFuerzaAcciones {
  acrs: number
  acciones: number
  debil: number
  media: number
  fuerte: number
  fuertePct: number | null
  porEquipoMes: FilaEquipoMes[]
}

/**
 * KPI «% de acciones fuertes». Cuenta los ACR cuyo `fechaTurno` cae en el rango (inclusive),
 * en cualquier estado (borrador o cerrado). Ordena por mes descendente y luego por equipo.
 */
export function kpiFuerzaAcciones(
  acrs: readonly Acr[],
  range: { start: string; end: string },
): KpiFuerzaAcciones {
  const enRango = acrs.filter((a) => a.fechaTurno >= range.start && a.fechaTurno <= range.end)
  const todas = enRango.flatMap((a) => a.acciones)
  const total = resumenFuerza(todas)

  const grupos = new Map<string, { equipo: string; mes: string; acrs: Acr[] }>()
  for (const a of enRango) {
    const mes = a.fechaTurno.slice(0, 7)
    const clave = `${a.equipo}\u0000${mes}`
    const g = grupos.get(clave) ?? { equipo: a.equipo, mes, acrs: [] }
    g.acrs.push(a)
    grupos.set(clave, g)
  }

  const porEquipoMes: FilaEquipoMes[] = [...grupos.values()]
    .map((g) => {
      const r = resumenFuerza(g.acrs.flatMap((a) => a.acciones))
      return {
        equipo: g.equipo,
        mes: g.mes,
        acrs: g.acrs.length,
        acciones: r.acciones,
        fuertes: r.fuerte,
        fuertePct: r.fuertePct,
      }
    })
    .sort((x, y) => y.mes.localeCompare(x.mes) || x.equipo.localeCompare(y.equipo, 'es'))

  return {
    acrs: enRango.length,
    acciones: total.acciones,
    debil: total.debil,
    media: total.media,
    fuerte: total.fuerte,
    fuertePct: total.fuertePct,
    porEquipoMes,
  }
}

/** Id corto para causas y acciones (no hace falta que sea único fuera del documento). */
export function nuevoIdSubdoc(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
