/**
 * Datos de «Grader en vivo» (E-A): arma de una vez todo lo que pinta `GraderVivo.tsx`. Puro, aparte del componente
 * para que React Fast Refresh funcione y para probarlo sin DOM.
 */
import { DEFAULT_P0_CRITICAL_PCT, P0_LINE_MIN_PIECES } from '@/services/grader/graderP0Thresholds'
import { serieDesdeCubetas, type CubetaMinuto } from '@/services/grader/espejo/espejoMinutos'
import { evaluarAlertas, milesPunto, minutosCerrados, minutosSinLectura } from '@/services/grader/espejo/alertasGrader'
import {
  baaderEnEje,
  lineaManualPorHora,
  p0Por15,
  RETRASO_REFERENCIA_MIN,
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
import { seteoGatesVivo } from '@/services/grader/espejo/seteoGatesVivo'
import { clasificarP0, duenoDelTramo, mantPorMinuto, rafagaFotocelula, type ResumenP0 } from '@/services/grader/espejo/motivoP0'
import type { StoredGate0Record } from '@/services/grader/graderGate0Store'

/** El aviso de cambio de lote se muestra la primera hora del lote nuevo. */
export const LOTE_AVISO_MIN = 60
/** El aviso de cambio de programa de una gate, la primera hora desde el cambio. */
export const GATE_CAMBIO_AVISO_MIN = 60
/** La ráfaga de fotocélula se muestra 60 min después de su última pieza. */
export const RAFAGA_AVISO_MIN = 60

const kg2 = (v: number | null) => (v === null ? '—' : v.toFixed(2).replace('.', ',')) // decimal-tecnico: ya pasa a coma

/**
 * Agregados que necesitan las piezas una a una (etapas 2, 5 y 1): causas P0, lote, distribución de peso, zona
 * compartida y los turnos anteriores. `null` sin piezas del turno.
 */
export function armarPesca(piezas: readonly PiezaEspejo[], inicioMs: number, finMs: number, resumenes: readonly GraderDailySummary[] | null, turnoActualId: string | null, leidoHastaMs: number | null = null, gate0Exacto: readonly StoredGate0Record[] | null = null) {
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
  // Seteo de las gates hasta lo leído (nunca más allá del fin del turno): una gate gris es «sin piezas leídas».
  const seteo = seteoGatesVivo(pz, leidoHastaMs != null && Number.isFinite(leidoHastaMs) ? Math.min(leidoHastaMs, finMs) : undefined)
  for (const c of seteo?.cambios ?? []) {
    if (Date.parse(seteo!.referenciaTs) - Date.parse(c.desdeTs) > GATE_CAMBIO_AVISO_MIN * 60_000) continue
    avisos.push({
      regla: 'gate-cambio',
      nivel: 'atento',
      desdeMin: desdeMin(c.desdeTs),
      titulo: `${c.desdeTs.slice(11, 16)} · G${c.gate} cambió a ${c.despues}${c.estado === 'provisional' ? ' (sin confirmar)' : ''}`,
      detalle: c.estado === 'provisional'
        ? `Venía con ${c.antes}. Lleva ${c.piezas} piezas seguidas del programa nuevo; se confirma con 100.`
        : `Venía con ${c.antes}. Confirmado con 100 piezas; nadie lo registró en la app.`,
    })
  }
  // Motivo P0 por pieza: exacto con Puerta 0 si hay registros; si no, estimado con el seteo inferido.
  const p0Dueno: ResumenP0 = clasificarP0(pz, gate0Exacto)
  const rafaga = rafagaFotocelula(p0Dueno.porPieza)
  if (rafaga && ultMs - rafaga.hastaMs <= RAFAGA_AVISO_MIN * 60_000) {
    const hm = (ms: number) => new Date(ms).toISOString().slice(11, 16)
    const est = rafaga.estimado ? ' (estimado)' : ''
    avisos.push({
      regla: 'rafaga-fotocelula',
      nivel: 'mal',
      desdeMin: desdeMin(new Date(rafaga.desdeMs).toISOString()),
      titulo: rafaga.estimado || rafaga.puerta > 0
        ? `${hm(rafaga.desdeMs)} · ${rafaga.pz} piezas de fotocélula o puerta en 15 min${est}`
        : `${hm(rafaga.desdeMs)} · ${rafaga.pz} piezas sin leer por la fotocélula en 15 min`,
      detalle: `De ${hm(rafaga.desdeMs)} a ${hm(rafaga.hastaMs)} · ${milesPunto(Math.round(rafaga.kg))} kg a P0. Revisar el lente de la fotocélula.`,
    })
  }
  const filas: FilaTurno[] = [
    filaDelTurno(pz, `Hoy hasta ${pz[pz.length - 1]!.ts.slice(11, 16)}`),
    ...(resumenes && turnoActualId ? ultimosTurnos(resumenes, turnoActualId) : []),
  ]
  return {
    p0Dueno,
    causas: causasP0Vivo(pz),
    lote,
    hora: { desde: hora[0]?.ts.slice(11, 16) ?? '', hasta: pz[pz.length - 1]!.ts.slice(11, 16) },
    histHora: histogramaPeso(hora),
    histTurno: histogramaPeso(pz),
    zonaHora: zonaCompartida(hora),
    zonaTurno: zonaCompartida(pz),
    bordes: bordesPorGate(hora),
    seteo,
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
  /** Registros de Puerta 0 del turno (`loadGate0Records`): motivo exacto por pieza. `null` sin registros. */
  gate0Exacto?: readonly StoredGate0Record[] | null
}

/** Todo lo que se pinta, calculado de una vez (puro: lo usan el componente y los tests). */
export function armarGraderVivo(e: EntradaGraderVivo) {
  const n = Math.max(1, Math.ceil((e.finMs - e.inicioMs) / 60_000))
  const serie = serieDesdeCubetas(e.cubetas, e.inicioMs, n)
  const baader = baaderEnEje(e.baader, serie.t0Ms)
  const leidoHastaMin = e.leidoHastaMs != null && Number.isFinite(e.leidoHastaMs)
    ? Math.min(n, Math.max(serie.hastaMin - 1, Math.floor((e.leidoHastaMs - serie.t0Ms) / 60_000)))
    : null
  const cerrados = minutosCerrados({ hastaMin: serie.hastaMin, leidoHastaMin })
  // Minutos que el espejo no leyó (huecos con las Baader andando): la línea manual, el atasco y la medición del
  // retraso callan ahí. Primero con el retraso de referencia (un hueco dura ≥ 15 min: 1 min de corrimiento no lo
  // cambia), y de nuevo con el medido sin esos minutos (18-11 T1: con el hueco adentro la correlación bajaba a 0,76; sin él, 0,90).
  const retraso = retrasoOReferencia(baader, serie.pz, serie.hastaMin, minutosSinLectura(serie.pz, baader, RETRASO_REFERENCIA_MIN, cerrados))
  const sinLectura = minutosSinLectura(serie.pz, baader, retraso.min, cerrados)
  const pesca = e.piezas ? armarPesca(e.piezas, e.inicioMs, e.finMs, e.resumenes ?? null, e.turnoActualId ?? null, e.leidoHastaMs ?? null, e.gate0Exacto ?? null) : null
  const mantMin = pesca ? mantPorMinuto(pesca.p0Dueno.porPieza, serie.t0Ms) : null
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
    duenoP0: pesca ? (desde, hasta) => duenoDelTramo(pesca.p0Dueno.porPieza, serie.t0Ms, desde, hasta) : undefined,
  })
  return {
    n,
    serie,
    baader,
    retraso,
    alertas: pesca ? [...alertas, ...pesca.avisos].sort((a, b) => (a.nivel === b.nivel ? a.desdeMin - b.desdeMin : a.nivel === 'mal' ? -1 : 1)) : alertas,
    pesca,
    totales: totalesDelTurno(serie),
    salida: salidaUltimaHora(serie),
    // `mantPz`: piezas de Mantención del tramo (fotocélula + puerta, o «tenía gate» estimado). `null` sin piezas.
    p0: p0Por15(serie, P0_LINE_MIN_PIECES).map((t) => {
      if (!mantMin) return { ...t, mantPz: null }
      let mantPz = 0
      for (let m = t.desde; m < t.hasta; m++) mantPz += mantMin.get(m) ?? 0
      return { ...t, mantPz }
    }),
    reparto: repartoDelTurno(serie),
    // Solo horas cerradas: la de la última pieza puede seguir abierta.
    manual: lineaManualPorHora({ ...serie, hastaMin: cerrados }, baader, retraso.min, sinLectura),
    sinLectura,
    paradas: e.paradas
      .map((p) => ({ desde: (p.desdeMs - serie.t0Ms) / 60_000, hasta: (p.hastaMs - serie.t0Ms) / 60_000, dueno: p.dueno }))
      // Hasta donde hay dato (grader o Baader): una banda no puede ir por delante de la curva.
      .filter((p) => p.hasta > 0 && p.desde < Math.min(n, Math.max(serie.hastaMin, baader?.length ?? 0)))
      .map((p) => ({ ...p, hasta: Math.min(p.hasta, Math.max(serie.hastaMin, baader?.length ?? 0)) })),
  }
}

export type DatosGraderVivo = ReturnType<typeof armarGraderVivo>
