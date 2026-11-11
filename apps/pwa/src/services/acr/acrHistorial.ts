/**
 * Historial de ACR (página Causa raíz): reglas puras, sin Firestore ni React.
 * Fechas YYYY-MM-DD comparadas como texto (sin zona horaria).
 */
import type { ResumenJK } from '@/services/shoplogix/jackKnife'
import { normalizarTexto } from '@/services/shoplogix/jackKnife'
import type { Acr, AccionAcr, EstadoAcr, FuerzaAccion } from './acr.types'

const ORDEN_FUERZA: Record<FuerzaAccion, number> = { debil: 0, media: 1, fuerte: 2 }

/** Suma días a una fecha YYYY-MM-DD, en calendario UTC (sin zona horaria local). */
function sumarDias(iso: string, dias: number): string {
  const [anio, mes, dia] = iso.split('-').map(Number)
  const d = new Date(Date.UTC(anio ?? 1970, (mes ?? 1) - 1, (dia ?? 1) + dias))
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${d.getUTCFullYear()}-${mm}-${dd}`
}

/** Día en que vence la verificación: fecha del turno + días de verificación. */
export function fechaVerificacion(acr: Acr): string {
  return sumarDias(acr.fechaTurno, acr.verificacion.dias)
}

/** Vencida = cerrada, sin resultado y `hoy` ya pasó el día de vencimiento (no el mismo día). */
export function verificacionVencida(acr: Acr, hoy: string): boolean {
  return acr.estado === 'cerrado' && acr.verificacion.resultado === 'pendiente' && hoy > fechaVerificacion(acr)
}

/** Fuerza más alta entre las acciones (null si no hay acciones). */
export function fuerzaMaxima(acr: Pick<Acr, 'acciones'>): FuerzaAccion | null {
  let mejor: FuerzaAccion | null = null
  for (const a of acr.acciones) {
    if (mejor === null || ORDEN_FUERZA[a.fuerza] > ORDEN_FUERZA[mejor]) mejor = a.fuerza
  }
  return mejor
}

/** Hay al menos una acción fuerte marcada como hecha. */
export function tieneAccionFuerteHecha(acr: Pick<Acr, 'acciones'>): boolean {
  return acr.acciones.some((a: AccionAcr) => a.fuerza === 'fuerte' && a.estado === 'hecha')
}

export interface FiltrosAcr {
  equipo: string | null
  dias: 30 | 90 | 365 | null
  estado: EstadoAcr | null
  fuerza: FuerzaAccion | null
}

export interface GruposHistorial {
  porCerrar: Acr[]
  vencidas: Acr[]
  historial: Acr[]
}

const porFechaDesc = (x: Acr, y: Acr): number => y.fechaTurno.localeCompare(x.fechaTurno)

/**
 * Reparte los ACR en tres grupos (cada uno por fecha de turno descendente). Un ACR va a un solo
 * grupo: borrador → porCerrar; vencida → vencidas; el resto → historial. Equipo, estado y fuerza
 * filtran los tres grupos; `dias` filtra SOLO el historial, para que lo urgente no se esconda.
 * La fuerza filtra por la fuerza máxima del ACR (la misma Pill que ve el técnico).
 */
export function agruparHistorial(acrs: readonly Acr[], filtros: FiltrosAcr, hoy: string): GruposHistorial {
  const corte = filtros.dias === null ? null : sumarDias(hoy, -filtros.dias)
  const pasa = (a: Acr): boolean =>
    (filtros.equipo === null || a.equipo === filtros.equipo) &&
    (filtros.estado === null || a.estado === filtros.estado) &&
    (filtros.fuerza === null || fuerzaMaxima(a) === filtros.fuerza)

  const grupos: GruposHistorial = { porCerrar: [], vencidas: [], historial: [] }
  for (const a of acrs) {
    if (!pasa(a)) continue
    if (a.estado === 'borrador') grupos.porCerrar.push(a)
    else if (verificacionVencida(a, hoy)) grupos.vencidas.push(a)
    else if (corte === null || a.fechaTurno >= corte) grupos.historial.push(a)
  }
  grupos.porCerrar.sort(porFechaDesc)
  grupos.vencidas.sort(porFechaDesc)
  grupos.historial.sort(porFechaDesc)
  return grupos
}

/** Equipos distintos de los ACR, ordenados. */
export function equiposDe(acrs: readonly Acr[]): string[] {
  return [...new Set(acrs.map((a) => a.equipo))].sort((x, y) => x.localeCompare(y, 'es'))
}

export interface ResumenCausaJK {
  total: number
  fuertesHechas: number
  acrs: Acr[]
}

/** ACR agrupados por su causa del Jack-Knife (solo los que tienen `causaJK` de texto). */
export function resumenAcrPorCausa(acrs: readonly Acr[]): Map<string, ResumenCausaJK> {
  const mapa = new Map<string, ResumenCausaJK>()
  for (const a of acrs) {
    if (typeof a.causaJK !== 'string') continue
    const r = mapa.get(a.causaJK) ?? { total: 0, fuertesHechas: 0, acrs: [] }
    r.total++
    if (tieneAccionFuerteHecha(a)) r.fuertesHechas++
    r.acrs.push(a)
    mapa.set(a.causaJK, r)
  }
  return mapa
}

// ── Sugerencia de causa del Jack-Knife ──────────────────────────────────────

export interface CandidatoJK {
  causa: string
  eventos: number
  minutos: number
}

export interface SugerenciaJK {
  candidatos: CandidatoJK[]
  sugerida: string | null
  /** El equipo es de filete (Baader 200): no aparece en el gráfico de evisceradoras. */
  fueraDelGrafico: boolean
}

/** Equipo con palabra clave → causa (CINTA va antes que BAADER 142, a propósito). */
const CAUSA_POR_EQUIPO: readonly (readonly [string, string])[] = [
  ['CINTA', 'Cintas'],
  ['KNURO', 'Knuro'],
  ['BALANZA', 'Balanzas'],
  ['GRADER', 'Balanzas'],
  ['RILES', 'Planta de Riles'],
  ['BOMBA', 'Bombas'],
  ['TUNEL', 'Túneles'],
]

/** Texto del evento → causa, solo para evisceradoras (Baader 142). */
const CAUSA_POR_TEXTO: readonly (readonly [RegExp, string])[] = [
  [/RESORTE|PERNO/, 'Pernos / Resortes'],
  [/CORREA/, 'Correas'],
  [/CUCHILL|GUILLOTIN/, 'Cuchillos / Guillotinas'],
  [/LOGICA/, 'Lógica'],
  [/MOTOR/, 'Motores'],
  [/PUNTO CERO/, 'Punto Cero'],
]

const MAX_CANDIDATOS = 3

function sugerirCausa(equipoN: string, textoN: string): { sugerida: string | null; fueraDelGrafico: boolean } {
  for (const [clave, causa] of CAUSA_POR_EQUIPO) {
    if (equipoN.includes(clave)) return { sugerida: causa, fueraDelGrafico: false }
  }
  if (equipoN.includes('BAADER 200') || equipoN.includes('B200') || equipoN.includes('FILETE')) {
    return { sugerida: null, fueraDelGrafico: true }
  }
  if (equipoN.includes('BAADER 142') || equipoN.includes('EVISCERADORA')) {
    for (const [patron, causa] of CAUSA_POR_TEXTO) {
      if (patron.test(textoN)) return { sugerida: causa, fueraDelGrafico: false }
    }
  }
  return { sugerida: null, fueraDelGrafico: false }
}

/**
 * Propone la causa del Jack-Knife para un evento a partir del equipo y del texto, y lista hasta
 * 3 candidatos de los eventos del mismo turno. La sugerida va primero (aunque ese día no tenga
 * eventos de esa causa); el resto, por cercanía de minutos.
 */
export function sugerirCausaJK(
  datos: { equipo: string; texto: string; minutos: number | null },
  resumenesDelDia: readonly ResumenJK[],
): SugerenciaJK {
  const equipoN = normalizarTexto(datos.equipo).toUpperCase()
  const textoN = normalizarTexto(datos.texto).toUpperCase()
  const { sugerida, fueraDelGrafico } = sugerirCausa(equipoN, textoN)
  const minutos = datos.minutos ?? 0

  const porCausa = new Map<string, { eventos: number; minutos: number }>()
  for (const r of resumenesDelDia) {
    for (const [causa, , min] of r.eventos) {
      const x = porCausa.get(causa) ?? { eventos: 0, minutos: 0 }
      x.eventos++
      x.minutos += min
      porCausa.set(causa, x)
    }
  }

  const resto: CandidatoJK[] = [...porCausa]
    .filter(([causa]) => causa !== sugerida)
    .map(([causa, x]) => ({ causa, eventos: x.eventos, minutos: x.minutos }))
    .sort((a, b) => Math.abs(a.minutos - minutos) - Math.abs(b.minutos - minutos))

  const primero: CandidatoJK[] = []
  if (sugerida !== null) {
    const x = porCausa.get(sugerida)
    primero.push({ causa: sugerida, eventos: x?.eventos ?? 0, minutos: x?.minutos ?? 0 })
  }

  return {
    // Fuera del gráfico, los eventos de las evisceradoras de ese turno no tienen relación.
    candidatos: fueraDelGrafico ? [] : [...primero, ...resto].slice(0, MAX_CANDIDATOS),
    sugerida,
    fueraDelGrafico,
  }
}
