/**
 * Cifras PURAS del modo TV v2 (`?pantalla=1`, `TvV2.tsx`). Nada de cálculo nuevo de Duelo: todo sale de `duelo.ts`
 * (`puntajeJornada`, `serieVentaja`, `piezasALaMismaHora`, `costoDeMantencionPeriodo`); acá solo se ordena para una
 * pantalla de 1920×1080 sin hover: el texto de cada cifra, el eje en horas de producción y el trazo de la carrera.
 *
 * Glosario de la TV: «hechas», «meta a esta hora», «N adelante / N atrás», «detenciones». Prohibido: paradas, a esta
 * altura, tocaban, cuota, llevaba, acumulado (hay un test que lo vigila).
 */
import type { PacePoint } from '@/services/shoplogix/monitorCompare'
import {
  EQUIPOS, nombreCorto,
  type DatosDuelo, type EquipoId, type NombresEquipos, type PuntoEnJuego, type PuntoVentaja,
} from './duelo'
import { int } from './dueloTextos'

export { int }

/** Palabras que NO pueden aparecer en la TV (el glosario del plan). */
export const PALABRAS_PROHIBIDAS_TV = ['paradas', 'parada ', 'a esta altura', 'tocaban', 'cuota', 'llevaba', 'acumulado'] as const

// ── Piezas hechas contra la meta a esta hora ─────────────────────────────────

export interface DifMeta { n: number; adelante: boolean }

/** «N adelante / N atrás» de las hechas contra la meta a esta hora. null si no hay meta. Exacto en 0 = adelante (no hay «0 atrás»). */
export function difMeta(hechas: number, metaAhora: number | null | undefined): DifMeta | null {
  if (metaAhora == null || !Number.isFinite(metaAhora)) return null
  const d = Math.round(hechas - metaAhora)
  return { n: Math.abs(d), adelante: d >= 0 }
}

/** Ancho (0–100) del relleno de la barra de avance, topado. */
export const pctDe = (valor: number, total: number | null | undefined): number =>
  total != null && total > 0 ? Math.max(0, Math.min(100, (valor / total) * 100)) : 0

// ── Eje en horas de producción ───────────────────────────────────────────────

export interface BandaHoraTv { hora: number; desde: number; hasta: number; rotulo: string; centro: number }

/** El eje de la TV: horas de producción («1.ª h», «2.ª h»…), nunca reloj. */
export const rotuloHora = (n: number) => `${n}.ª h`

export function bandasHoraTv(maxMin: number): BandaHoraTv[] {
  const n = Math.max(1, Math.ceil(maxMin / 60))
  return Array.from({ length: n }, (_, i) => ({ hora: i + 1, desde: i * 60, hasta: (i + 1) * 60, rotulo: rotuloHora(i + 1), centro: i * 60 + 30 }))
}

/** El largo del eje: lo más largo entre las curvas y lo previsto, redondeado a hora completa (mínimo una hora). */
export function maxEjeTv(curvas: ReadonlyArray<readonly PacePoint[] | null | undefined>, previstoMin?: number | null): number {
  let m = previstoMin != null && Number.isFinite(previstoMin) ? previstoMin : 0
  for (const c of curvas) if (c?.length) m = Math.max(m, c[c.length - 1]!.minutes)
  return Math.max(60, Math.ceil(m / 60) * 60)
}

/** Trazo `d` de un path SVG con los puntos hasta `hastaMin` (decimado a ~200 puntos). */
export function trazoCurva(curva: readonly PacePoint[], hastaMin: number, X: (m: number) => number, Y: (p: number) => number): string {
  const pts = curva.filter((p) => p.minutes <= hastaMin + 1e-6)
  if (!pts.length) return ''
  const paso = Math.max(1, Math.ceil(pts.length / 200))
  const usados = pts.filter((_, i) => i % paso === 0 || i === pts.length - 1)
  return usados.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.minutes).toFixed(1)} ${Y(p.pieces).toFixed(1)}`).join('') // decimal-tecnico: coordenada SVG
}

/** El punto de mayor ventaja de la serie (para el 2.º rótulo clave). null si nunca hubo ventaja. */
export function mayorVentaja(serie: readonly PuntoVentaja[]): PuntoVentaja | null {
  let top: PuntoVentaja | null = null
  for (const p of serie) if (p.lider && (!top || p.ventaja > top.ventaja)) top = p
  return top
}

// ── Marcador: puntos firmes + «N en juego» ───────────────────────────────────

export interface LadoMarcadorTv { equipo: EquipoId; nombre: string; firmes: number }

export interface MarcadorTv {
  /** Cárdenas / Grupo 2 siempre primero, Rebolledo / Grupo 1 segundo: el color de cada equipo es fijo. */
  lados: [LadoMarcadorTv, LadoMarcadorTv]
  enJuego: number
  /** Qué se decide al cierre, en palabras de la TV («arranque y cierre · alimentación ×3»). */
  alCierre: string
  cerrada: boolean
}

const ROTULO_ENJUEGO: Record<PuntoEnJuego['indicador'], string> = {
  carrera: 'carrera', ritmo: 'ritmo', micro: 'micro detención', arranque: 'arranque y cierre', alimentacion: 'alimentación',
}

export function alCierreTexto(detalle: readonly PuntoEnJuego[]): string {
  const orden: PuntoEnJuego['indicador'][] = ['carrera', 'ritmo', 'micro', 'arranque', 'alimentacion']
  const partes: string[] = []
  for (const k of orden) {
    const n = detalle.filter((p) => p.indicador === k).length
    if (n > 0) partes.push(n > 1 ? `${ROTULO_ENJUEGO[k]} ×${n}` : ROTULO_ENJUEGO[k])
  }
  return partes.join(' · ')
}

export function marcadorTv(d: DatosDuelo | null | undefined, nombres?: NombresEquipos | null): MarcadorTv | null {
  const p = d?.puntaje
  if (!d || !p) return null
  const aEq = d.hoy.equipo
  const lado = (e: EquipoId): LadoMarcadorTv => ({ equipo: e, nombre: nombreCorto(e, nombres), firmes: e === aEq ? p.firmes.a : p.firmes.b })
  return {
    lados: [lado('cardenas'), lado('rebolledo')],
    enJuego: p.enJuego,
    alCierre: alCierreTexto(p.detalleEnJuego),
    cerrada: p.cerrada,
  }
}

/** Por qué no hay marcador (la noche corre sola, falta el día, sin duelo): una frase para la franja. */
export function sinMarcadorTexto(d: DatosDuelo | null | undefined): string {
  if (!d) return 'Todavía no hay turno para comparar.'
  if (d.abreJornada && !d.hoy.cerrado) return 'La noche abre la jornada: el día se mide contra ella.'
  if (d.esperando) return 'Espera al turno día para asignar los puntos.'
  return 'Este turno no tiene rival para comparar.'
}

// ── Título de la carrera: «N adelante / N atrás» a la misma hora ─────────────

export interface TituloCarreraTv {
  sujeto: EquipoId
  rival: EquipoId
  nombreSujeto: string
  nombreRival: string
  /** «886 atrás de», «181 adelante de», «parejos con». */
  verbo: string
}

export function tituloCarreraTv(d: DatosDuelo | null | undefined, nombres?: NombresEquipos | null): TituloCarreraTv | null {
  const c = d?.carrera
  if (!d || !c || c.diferencia == null) return null
  const dif = Math.round(c.diferencia)
  return {
    sujeto: d.hoy.equipo,
    rival: c.rivalEquipo,
    nombreSujeto: nombreCorto(d.hoy.equipo, nombres),
    nombreRival: nombreCorto(c.rivalEquipo, nombres),
    verbo: dif === 0 ? 'parejos con' : dif > 0 ? `${int(dif)} adelante de` : `${int(-dif)} atrás de`,
  }
}

// ── Mantención de HOY (jornada): una sola fuente, el período a la vista ──────

export interface MantTv {
  /** «jornada 28/10»: el período que cubren las cifras. */
  periodo: string
  fallas: number
  fallaMin: number
  /** MTTR (min de máquina por falla). La jornada no lo trae: sus minutos son de LÍNEA, no de reparación. */
  mttr: number | null
  /** Minutos de LÍNEA detenida por las fallas técnicas (la jornada); null cuando la cifra es el MTTR del turno. */
  lineaMin?: number | null
  /** Piezas que las fallas técnicas quitaron (suma de los dos equipos). */
  piezasPerdidas: number
  porEquipo: Array<{ equipo: EquipoId; nombre: string; fallas: number }>
}

export function mantTv(d: DatosDuelo | null | undefined, nombres?: NombresEquipos | null): MantTv | null {
  if (!d) return null
  const c = d.costoHoy
  const fallas = EQUIPOS.reduce((a, e) => a + c.equipos[e].fallasN, 0)
  const fallaMin = EQUIPOS.reduce((a, e) => a + c.equipos[e].fallaMin, 0)
  return {
    periodo: c.etiqueta,
    fallas,
    fallaMin,
    /* 29-10: `fallaMin` de la jornada es tiempo de LÍNEA (las causas repartidas a prorrata): dividido por fallas daba
       «MTTR 0,4 min» el 28-10 día, con fallas reales de 5 a 7 min por Baader. No es un MTTR: se muestra como línea detenida. */
    mttr: null,
    lineaMin: fallaMin,
    piezasPerdidas: Math.round(EQUIPOS.reduce((a, e) => a + c.equipos[e].piezasPerdidas, 0)),
    porEquipo: (['cardenas', 'rebolledo'] as const).map((e) => ({ equipo: e, nombre: nombreCorto(e, nombres), fallas: c.equipos[e].fallasN })),
  }
}

// ── Estado de la línea ───────────────────────────────────────────────────────

export interface EstadoTv { texto: string; detenida: boolean }

/** El estado SIEMPRE con hora cuando es una detención: «Detenida desde 12:56». */
export function estadoTv(e: { cerrado: boolean; status: string; sinDatosHaceMin?: number | null; viejo: boolean; desde?: string | null; cierre?: string | null }): EstadoTv {
  if (e.cerrado) return { texto: e.cierre ? `Turno terminado ${e.cierre}` : 'Turno terminado', detenida: false }
  if (e.viejo && e.sinDatosHaceMin != null) return { texto: `Sin datos hace ${Math.round(e.sinDatosHaceMin)} min`, detenida: false }
  if (e.status === 'detenida') return { texto: e.desde ? `Detenida desde ${e.desde}` : 'Detenida', detenida: true }
  if (e.status === 'produciendo') return { texto: 'Produciendo', detenida: false }
  return { texto: 'Sin datos', detenida: false }
}

/** Escala del lienzo 1920×1080 al viewport (entra entero). */
export function escalaTv(ancho: number, alto: number): number {
  if (!(ancho > 0) || !(alto > 0)) return 1
  return Math.min(ancho / 1920, alto / 1080)
}

// ── Franja de ventaja a la misma hora ────────────────────────────────────────

export interface TramoVentaja { lider: EquipoId | null; puntos: PuntoVentaja[] }

/** Parte la serie en tramos del mismo líder (cada uno se pinta de su color). Un tramo «parejos» no se pinta. */
export function tramosVentaja(serie: readonly PuntoVentaja[]): TramoVentaja[] {
  const out: TramoVentaja[] = []
  let ult: TramoVentaja | null = null
  let prev: PuntoVentaja | null = null
  for (const p of serie) {
    if (!ult) {
      ult = { lider: p.lider, puntos: [p] }
      out.push(ult)
    } else if (p.lider === null || ult.lider === null || p.lider === ult.lider) {
      if (ult.lider === null) ult.lider = p.lider
      ult.puntos.push(p)
    } else {
      /* cambio de líder: el tramo nuevo parte del punto anterior para que no quede hueco entre colores */
      ult = { lider: p.lider, puntos: prev ? [prev, p] : [p] }
      out.push(ult)
    }
    prev = p
  }
  return out
}
