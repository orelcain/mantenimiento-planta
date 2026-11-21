/**
 * Datos de «Grader en vivo» (E-A): arma de una vez todo lo que pinta `GraderVivo.tsx`. Puro, aparte del componente
 * para que React Fast Refresh funcione y para probarlo sin DOM.
 */
import { DEFAULT_P0_CRITICAL_PCT, P0_LINE_MIN_PIECES } from '@/services/grader/graderP0Thresholds'
import { serieDesdeCubetas, type CubetaMinuto } from '@/services/grader/espejo/espejoMinutos'
import { evaluarAlertas, minutosCerrados } from '@/services/grader/espejo/alertasGrader'
import {
  baaderEnEje,
  lineaManualPorHora,
  p0Por15,
  repartoDelTurno,
  retrasoOReferencia,
  salidaUltimaHora,
  totalesDelTurno,
  type SerieMinutoBaader,
} from '@/services/grader/espejo/graderVivo'
import type { DuenoPerdida } from '@/services/shoplogix/monitorEventos'
import type { PiezaEspejo } from '@/services/grader/espejo/espejoFilas'
import type { AlertaGrader } from '@/services/grader/espejo/alertasGrader'
import {
  bordesPorGate,
  causasP0Vivo,
  escalones,
  filaDelTurno,
  histogramaPeso,
  loteVivo,
  ultimosMinutos,
  ultimosTurnos,
  zonaCompartida,
  type FilaTurno,
} from '@/services/grader/espejo/pescaVivo'
import type { GraderDailySummary } from '@/services/grader/types'

/** El aviso de cambio de lote se muestra la primera hora del lote nuevo. */
export const LOTE_AVISO_MIN = 60

const kg2 = (v: number | null) => (v === null ? '—' : v.toFixed(2).replace('.', ',')) // decimal-tecnico: ya pasa a coma

/**
 * Agregados que necesitan las piezas una a una (etapas 2, 5 y 1): causas P0, lote, distribución de peso, zona
 * compartida y los turnos anteriores. `null` sin piezas del turno.
 */
export function armarPesca(piezas: readonly PiezaEspejo[], inicioMs: number, finMs: number, resumenes: readonly GraderDailySummary[] | null, turnoActualId: string | null) {
  const ini = new Date(inicioMs).toISOString()
  const fin = new Date(finMs).toISOString()
  const pz = piezas.filter((p) => p.ts >= ini && p.ts < fin)
  if (pz.length === 0) return null
  const ultMs = Date.parse(pz[pz.length - 1]!.ts)
  const hora = ultimosMinutos(pz, 60)
  const lote = loteVivo(pz)
  const avisos: AlertaGrader[] = []
  const desdeMin = (ts: string) => Math.max(0, Math.floor((Date.parse(ts) - inicioMs) / 60_000))
  if (lote?.anterior && ultMs - Date.parse(lote.desdeTs) <= LOTE_AVISO_MIN * 60_000) {
    const a = lote.anterior.perfil
    const b = lote.perfil
    avisos.push({
      regla: 'lote-cambio',
      nivel: 'atento',
      desdeMin: desdeMin(lote.desdeTs),
      titulo: `${lote.desdeTs.slice(11, 16)} · Cambio de lote: ${lote.anterior.lote} → ${lote.lote}`,
      detalle: `Peso medio de ${kg2(a.pesoMedioKg)} a ${kg2(b.pesoMedioKg)} kg; ${b.calibreDominante?.calibre ?? '—'} es el ${Math.round(b.calibreDominante?.pct ?? 0)} % del lote nuevo.`,
    })
  }
  for (const e of escalones(hora)) {
    avisos.push({
      regla: 'escalon',
      nivel: 'atento',
      desdeMin: desdeMin(hora[0]!.ts),
      titulo: `Escalón en ${(e.limiteG / 1000).toFixed(2).replace('.', ',')} kg entre ${e.bajo.calibre} y ${e.alto.calibre}`, // decimal-tecnico: ya pasa a coma
      detalle: `En la última hora, 100 g bajo el límite: ${e.bajo.piezas} piezas; 100 g sobre él: ${e.alto.piezas}. Una pesca pareja no salta así: revisar la balanza o el seteo.`,
    })
  }
  const filas: FilaTurno[] = [
    filaDelTurno(pz, `Hoy hasta ${pz[pz.length - 1]!.ts.slice(11, 16)}`),
    ...(resumenes && turnoActualId ? ultimosTurnos(resumenes, turnoActualId) : []),
  ]
  return {
    causas: causasP0Vivo(pz),
    lote,
    hora: { desde: hora[0]?.ts.slice(11, 16) ?? '', hasta: pz[pz.length - 1]!.ts.slice(11, 16) },
    histHora: histogramaPeso(hora),
    histTurno: histogramaPeso(pz),
    zonaHora: zonaCompartida(hora),
    zonaTurno: zonaCompartida(pz),
    bordes: bordesPorGate(hora),
    filas,
    avisos,
  }
}

/** Una detención de Shoplogix ubicada en el reloj (ms wall-clock-as-UTC). */
export interface ParadaGrader {
  desdeMs: number
  hastaMs: number
  dueno: DuenoPerdida
}

/** Con menos piezas que esto en el turno y ninguna en Gate 0, se dice que el P0 llega con Puerta 0. */
export const PIEZAS_PARA_DECIR_SIN_GATE0 = 500

export interface EntradaGraderVivo {
  cubetas: readonly CubetaMinuto[]
  inicioMs: number
  finMs: number
  baader: SerieMinutoBaader | null
  paradas: readonly ParadaGrader[]
  minutosSinLatido: number | null
  turnoEnCurso: boolean
  /**
   * Hasta dónde leyó el lector ENTERO (ms wall-clock de su última lectura completa, sin tramo pendiente ni error).
   * Con esto un grader detenido se ve: hay minutos leídos sin piezas. `null` si no se sabe.
   */
  leidoHastaMs?: number | null
  /** Piezas del espejo (la ventana del turno con su margen), para las causas P0, el lote y la zona compartida. */
  piezas?: readonly PiezaEspejo[]
  /** Resúmenes de cierre de los días anteriores y el id del turno actual (`{dateKey}__{turno}`), para comparar. */
  resumenes?: readonly GraderDailySummary[] | null
  turnoActualId?: string | null
}

/** Todo lo que se pinta, calculado de una vez (puro: lo usan el componente y los tests). */
export function armarGraderVivo(e: EntradaGraderVivo) {
  const n = Math.max(1, Math.ceil((e.finMs - e.inicioMs) / 60_000))
  const serie = serieDesdeCubetas(e.cubetas, e.inicioMs, n)
  const baader = baaderEnEje(e.baader, serie.t0Ms)
  const retraso = retrasoOReferencia(baader, serie.pz, serie.hastaMin)
  const leidoHastaMin = e.leidoHastaMs != null && Number.isFinite(e.leidoHastaMs)
    ? Math.min(n, Math.max(serie.hastaMin - 1, Math.floor((e.leidoHastaMs - serie.t0Ms) / 60_000)))
    : null
  const cerrados = minutosCerrados({ hastaMin: serie.hastaMin, leidoHastaMin })
  const alertas = evaluarAlertas({
    leidoHastaMin,
    t0Ms: serie.t0Ms,
    grader: serie,
    baader,
    retrasoMin: retraso.min,
    hastaMin: serie.hastaMin,
    minutosSinLatido: e.minutosSinLatido,
    turnoEnCurso: e.turnoEnCurso,
    umbrales: { p0CriticoPct: DEFAULT_P0_CRITICAL_PCT, p0MinPiezas: P0_LINE_MIN_PIECES },
  })
  const pesca = e.piezas ? armarPesca(e.piezas, e.inicioMs, e.finMs, e.resumenes ?? null, e.turnoActualId ?? null) : null
  return {
    n,
    serie,
    baader,
    retraso,
    alertas: pesca ? [...alertas, ...pesca.avisos].sort((a, b) => (a.nivel === b.nivel ? a.desdeMin - b.desdeMin : a.nivel === 'mal' ? -1 : 1)) : alertas,
    pesca,
    totales: totalesDelTurno(serie),
    salida: salidaUltimaHora(serie),
    p0: p0Por15(serie, P0_LINE_MIN_PIECES),
    reparto: repartoDelTurno(serie),
    // Solo horas cerradas: la de la última pieza puede seguir abierta.
    manual: lineaManualPorHora({ ...serie, hastaMin: cerrados }, baader, retraso.min),
    paradas: e.paradas
      .map((p) => ({ desde: (p.desdeMs - serie.t0Ms) / 60_000, hasta: (p.hastaMs - serie.t0Ms) / 60_000, dueno: p.dueno }))
      // Hasta donde hay dato (grader o Baader): una banda no puede ir por delante de la curva.
      .filter((p) => p.hasta > 0 && p.desde < Math.min(n, Math.max(serie.hastaMin, baader?.length ?? 0)))
      .map((p) => ({ ...p, hasta: Math.min(p.hasta, Math.max(serie.hastaMin, baader?.length ?? 0)) })),
  }
}

export type DatosGraderVivo = ReturnType<typeof armarGraderVivo>
