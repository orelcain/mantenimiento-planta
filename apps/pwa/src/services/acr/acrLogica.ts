/**
 * Lógica pura del ACR: qué falta para avanzar de paso, cuándo se puede cerrar y el KPI de
 * fuerza de las acciones. Sin Firestore ni React: se prueba en `__tests__/acrLogica.test.ts`.
 *
 * Método de 5 pasos (spec SPEC_ACR.md §2): definir → evidencia → analizar → acciones → verificar.
 * Regla de fondo: el ACR no se cierra con una causa humana; tiene que llegar a la latente.
 */
import type { Acr, AccionAcr, EventoRefAcr, FuerzaAccion } from './acr.types'

export const PASOS = ['definir', 'evidencia', 'analizar', 'acciones', 'verificar'] as const
export type Paso = (typeof PASOS)[number]

export const ETIQUETA_PASO: Record<Paso, string> = {
  definir: 'Definir',
  evidencia: 'Evidencia',
  analizar: 'Analizar',
  acciones: 'Acciones',
  verificar: 'Verificar',
}

export const MENSAJE_LATENTE =
  'Falta la causa latente: la que hace que vuelva a pasar. El error humano no es causa raíz.'

/** Tipos de evento que piden ACR (los ids reales de `TIPOS_EVENTO` + el legado `falla`). */
const TIPOS_CON_ACR = ['correctivo', 'falla'] as const

/** El ACR aplica a fallas correctivas o a cualquier evento con detención de máquina. */
export function eventoRequiereAcr(evento: Pick<EventoRefAcr, 'minutosParada'> & { tipo: string }): boolean {
  return (TIPOS_CON_ACR as readonly string[]).includes(evento.tipo) || (evento.minutosParada ?? 0) > 0
}

/** Mensaje en español de lo que impide terminar el paso, o null si ya se puede avanzar. */
export function faltaParaAvanzar(paso: Paso, acr: Acr): string | null {
  switch (paso) {
    case 'definir':
      return acr.definicion.trim() ? null : 'Escribe qué pasó.'
    case 'evidencia':
      return acr.evidencias.length > 0 || acr.piezaGuardada
        ? null
        : 'Agrega una foto o marca que la pieza dañada quedó guardada.'
    case 'analizar':
      if (acr.causas.length === 0) return 'Agrega al menos una causa.'
      return acr.causas.some((c) => c.nivel === 'latente') ? null : MENSAJE_LATENTE
    case 'acciones':
      if (acr.acciones.length === 0) return 'Agrega al menos una acción.'
      return acr.acciones.every((a) => a.texto.trim()) ? null : 'Toda acción necesita un texto.'
    case 'verificar':
      if (!acr.verificacion.criterio.trim()) return 'Escribe el criterio de verificación.'
      return acr.verificacion.dias > 0 ? null : 'Los días de verificación tienen que ser mayores que cero.'
  }
}

/** Primer paso que todavía no cumple, o null si el ACR está completo. */
export function primerPasoPendiente(acr: Acr): Paso | null {
  return PASOS.find((p) => faltaParaAvanzar(p, acr) !== null) ?? null
}

/**
 * Para saltar de `desde` a `hasta` (puede ser hacia atrás): revisa cada paso que se deja
 * atrás. Devuelve el primero que falta, o null si se puede ir.
 */
export function faltaParaIr(acr: Acr, desde: Paso, hasta: Paso): { paso: Paso; mensaje: string } | null {
  const i = PASOS.indexOf(desde)
  const j = PASOS.indexOf(hasta)
  if (j <= i) return null
  for (const paso of PASOS.slice(i, j)) {
    const mensaje = faltaParaAvanzar(paso, acr)
    if (mensaje) return { paso, mensaje }
  }
  return null
}

export function puedeCerrar(acr: Acr): boolean {
  return primerPasoPendiente(acr) === null
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
