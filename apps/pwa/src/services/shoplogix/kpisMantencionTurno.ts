/**
 * kpisMantencionTurno.ts — los KPIs de Mantención de un turno, calculados en el
 * cliente desde el snapshot upstream que la página de Análisis de Turno YA
 * carga (states con causa exacta + intervalos de 5 min con esperado).
 *
 * Espejo del módulo backend `functions/shoplogix/kpisMantencion.js` (ese
 * alimenta el monitor público; este, la pestaña Mantención). Si se toca una
 * regla acá, tocarla allá: los dos deben contar la misma historia.
 *
 * Reglas heredadas del prototipo F1 (26-08-2026, con sus trampas pagadas):
 *  - Las fallas se ENCADENAN en eventos (gap 12 min: la Ev1 re-cayó a los
 *    11m15s tras arrancar a media marcha). MTTR/MTBF van por evento.
 *  - Micro y "excedido" quedan FUERA del MTTR: 69 microdetenciones en un turno
 *    real lo pulverizan sin decir nada de fallas.
 *  - `expectedCycles = 0` es cómo Shoplogix marca el tiempo sin expectativa
 *    (colación/planificado): la llave de la «caída no planificada».
 *  - El reenganche se mide contra la MEDIANA ANDANDO de la propia máquina, no
 *    contra el esperado teórico (la Ev1 jamás alcanzó el 90% de su target 19).
 */

import type {
  UpstreamLineSnapshot,
  UpstreamMachineShift,
  UpstreamMachineState,
  UpstreamProductionInterval,
} from './types'

export type FamiliaCausa =
  | 'produccion' | 'planificado' | 'excedido' | 'externo' | 'micro' | 'falla' | 'sin-imputar'

const RE_PLANIFICADO = /COLACI|DETENCION PROGRAMADA|REUNION|EJERCICIO|CHARLA|ASEO|LIMPIEZA|SANITIZ|PLANNED\s*DOWNTIME|CAMBIO DE TURNO/
const RE_EXTERNO = /MMPP|MATERIA PRIMA|FALTA PERSONAL|ACUMULACION|RECHAZO|ABASTEC|ESPERA/

function normaliza(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
}

export function clasificaCausa(state: Pick<UpstreamMachineState, 'type' | 'name' | 'reason'>): FamiliaCausa {
  if (state.type === 'uptime') return 'produccion'
  const name = state.name || ''
  const reason = state.reason || ''
  const r = normaliza(reason || name)
  if (/EXCEDID/i.test(name)) return 'excedido'
  if (/MICRO/i.test(name) && !reason) return 'micro'
  if (RE_PLANIFICADO.test(r)) return 'planificado'
  if (RE_EXTERNO.test(r)) return 'externo'
  if (!reason) return 'sin-imputar'
  return 'falla'
}

export interface VentanaTurno { start: Date; end: Date }

/** Dedupe por (inicio, tipo, nombre, causa) + recorte de duración a la ventana. */
export function sanearStates(states: UpstreamMachineState[], ventana: VentanaTurno): UpstreamMachineState[] {
  const t0 = ventana.start.getTime()
  const t1 = ventana.end.getTime()
  const vistos = new Set<string>()
  const out: UpstreamMachineState[] = []
  for (const s of states || []) {
    const a = s.startAt?.getTime?.()
    const b = s.endAt?.getTime?.()
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    if (a! >= t1 || b! <= t0) continue
    const key = `${a}|${s.type}|${s.name}|${s.reason}`
    if (vistos.has(key)) continue
    vistos.add(key)
    const durationSec = (Math.min(b!, t1) - Math.max(a!, t0)) / 1000
    if (durationSec <= 0) continue
    out.push({ ...s, durationSec })
  }
  return out.sort((x, y) => x.startAt.getTime() - y.startAt.getTime())
}

export interface FallaSuelta { desde: Date; hasta: Date; sec: number; causa: string }
export interface EventoFalla { desde: Date; hasta: Date; sec: number; causas: string[]; paros: number }

export function encadenarFallas(fallas: FallaSuelta[], gapMs = 12 * 60_000): EventoFalla[] {
  const orden = [...fallas].sort((a, b) => a.desde.getTime() - b.desde.getTime())
  const eventos: EventoFalla[] = []
  for (const f of orden) {
    const ult = eventos[eventos.length - 1]
    if (ult && f.desde.getTime() - ult.hasta.getTime() <= gapMs) {
      ult.hasta = new Date(Math.max(ult.hasta.getTime(), f.hasta.getTime()))
      ult.sec += f.sec
      if (!ult.causas.includes(f.causa)) ult.causas.push(f.causa)
      ult.paros++
    } else {
      eventos.push({ desde: f.desde, hasta: f.hasta, sec: f.sec, causas: [f.causa], paros: 1 })
    }
  }
  return eventos
}

export interface GrupoCausa { n: number; sec: number; causas: Record<string, number> }

export interface KpisMaquina {
  uptimeMin: number
  grupos: Partial<Record<Exclude<FamiliaCausa, 'produccion'>, GrupoCausa>>
  /** Las filas de falla tal cual (para dibujar los tramos dentro de un evento). */
  fallas: FallaSuelta[]
  eventosFalla: EventoFalla[]
  mttrMin: number | null
  mtbfMin: number | null
  dispTecnicaPct: number | null
}

export function kpisDeMaquina(statesSaneados: UpstreamMachineState[]): KpisMaquina {
  const grupos: KpisMaquina['grupos'] = {}
  const fallas: FallaSuelta[] = []
  let uptimeSec = 0
  for (const st of statesSaneados) {
    const cl = clasificaCausa(st)
    if (cl === 'produccion') { uptimeSec += st.durationSec; continue }
    const g = grupos[cl] ?? (grupos[cl] = { n: 0, sec: 0, causas: {} })
    g.n++
    g.sec += st.durationSec
    const causa = st.reason || st.name || '(sin causa)'
    g.causas[causa] = (g.causas[causa] || 0) + st.durationSec
    if (cl === 'falla') fallas.push({ desde: st.startAt, hasta: st.endAt, sec: st.durationSec, causa })
  }
  const eventos = encadenarFallas(fallas)
  const fallaSec = grupos.falla?.sec ?? 0
  const n = eventos.length
  return {
    uptimeMin: uptimeSec / 60,
    grupos,
    fallas,
    eventosFalla: eventos,
    mttrMin: n ? (fallaSec / 60) / n : null,
    mtbfMin: n ? (uptimeSec / 60) / n : null,
    dispTecnicaPct: (uptimeSec + fallaSec) > 0 ? (uptimeSec / (uptimeSec + fallaSec)) * 100 : null,
  }
}

// ── Sobre los intervalos de 5 min (ciclos + esperado) ────────────────────────

export interface VelocidadMaquina {
  /** Intervalos andando (con ciclos y esperado > 0). */
  nAndando: number
  /** % de esos intervalos a ≥90% / 50–90% / <50% del esperado. */
  pctLleno: number | null
  pctMedio: number | null
  pctBajo: number | null
  /** Mediana del ritmo andando, en pz/min (los intervalos son de 5 min). */
  medianaAndandoCpm: number | null
  /** Esperado del sensor, pz/min (mediana de los expectedCycles/5 con e>0). */
  esperadoCpm: number | null
}

export function velocidadDesdeIntervals(intervals: UpstreamProductionInterval[]): VelocidadMaquina {
  const andando = (intervals || []).filter((iv) => (iv.cycles || 0) > 0 && (iv.expectedCycles || 0) > 0)
  const n = andando.length
  if (n === 0) {
    return { nAndando: 0, pctLleno: null, pctMedio: null, pctBajo: null, medianaAndandoCpm: null, esperadoCpm: null }
  }
  const cpms = andando.map((iv) => iv.cycles / 5).sort((a, b) => a - b)
  const esperados = andando.map((iv) => iv.expectedCycles / 5).sort((a, b) => a - b)
  return {
    nAndando: n,
    pctLleno: (andando.filter((iv) => iv.cycles >= 0.9 * iv.expectedCycles).length / n) * 100,
    pctMedio: (andando.filter((iv) => iv.cycles >= 0.5 * iv.expectedCycles && iv.cycles < 0.9 * iv.expectedCycles).length / n) * 100,
    pctBajo: (andando.filter((iv) => iv.cycles < 0.5 * iv.expectedCycles).length / n) * 100,
    medianaAndandoCpm: cpms[Math.floor(n / 2)]!,
    esperadoCpm: esperados[Math.floor(n / 2)]!,
  }
}

/**
 * ¿El esperado del sensor no calza con lo que la máquina demuestra?
 *
 * Umbral: techo observado bajo el 80% del esperado Y casi ningún intervalo
 * lleno. Es un AVISO de dato (tinta info, no roja): o el set point está en la
 * máquina equivocada o la máquina está degradada — ambos importan, ninguno se
 * afirma sin verificar en terreno.
 */
export function targetSospechoso(v: VelocidadMaquina): boolean {
  if (v.medianaAndandoCpm == null || v.esperadoCpm == null || v.pctLleno == null) return false
  return v.medianaAndandoCpm < 0.8 * v.esperadoCpm && v.pctLleno < 5
}

/**
 * Reenganche: minutos (en buckets) desde el fin de cada evento de falla hasta
 * que la máquina vuelve a su ritmo demostrado.
 *
 * ⚠ El umbral es el 90% de la MEDIANA ANDANDO propia, no del esperado teórico:
 * la Ev1 (esperado 19, techo 13-15) daba «nunca recuperó» en las cuatro fallas
 * si se le exigía el target. `umbralPorBucket` va en la MISMA unidad que `c`
 * (ciclos por bucket): con intervalos de 5 min, mediana pz/min × 5.
 */
export function reenganches(
  buckets: Array<{ ms: number; c: number; e: number }>,
  eventosFalla: Array<{ hasta: Date }>,
  umbralPorBucket: number,
): Array<{ hasta: Date; min: number | null }> {
  if (!(umbralPorBucket > 0)) return []
  const umbral = 0.9 * umbralPorBucket
  return (eventosFalla || []).map((ev) => {
    const finMs = ev.hasta.getTime()
    const despues = (buckets || []).filter((b) => b.ms >= finMs && b.e > 0)
    const idx = despues.findIndex((b) => b.c >= umbral)
    return { hasta: ev.hasta, min: idx < 0 ? null : idx }
  })
}

// ── El turno completo ────────────────────────────────────────────────────────

export interface KpisMaquinaTurno {
  maquina: UpstreamMachineShift
  kpi: KpisMaquina
  velocidad: VelocidadMaquina
  /** Reparto de la ventana en minutos, por familia (para las barras). */
  reparto: Record<Exclude<FamiliaCausa, 'produccion'> | 'produccion' | 'resto', number>
}

export interface KpisTurnoMantencion {
  ventana: VentanaTurno
  ventanaMin: number
  porMaquina: KpisMaquinaTurno[]
  /** Todos los eventos de falla del turno, del más caro al más barato. */
  eventos: Array<EventoFalla & { maquina: string }>
  totalFallaMin: number
  totalEventos: number
  mttrGlobalMin: number | null
  linea: {
    /** Intervalos de 5 min con TODAS las máquinas en cero. */
    caidaTotalMin: number
    /** …y además alguna con esperado > 0 (caída de verdad, no colación). */
    caidaNoPlanificadaMin: number
  }
}

export function kpisDeTurno(snapshot: UpstreamLineSnapshot): KpisTurnoMantencion | null {
  const maquinas = snapshot.machines ?? []
  if (maquinas.length === 0) return null
  const m0 = maquinas[0]!
  const start = m0.scheduledStart ?? m0.shiftStart
  const end = m0.scheduledEnd ?? m0.shiftEnd
  if (!start || !end || end.getTime() <= start.getTime()) return null
  const ventana: VentanaTurno = { start, end: new Date(end.getTime() + 10 * 60_000) }
  const ventanaMin = (end.getTime() - start.getTime()) / 60_000

  const porMaquina: KpisMaquinaTurno[] = maquinas.map((m) => {
    const kpi = kpisDeMaquina(sanearStates(m.states ?? [], ventana))
    const velocidad = velocidadDesdeIntervals(m.intervals ?? [])
    const minDe = (f: Exclude<FamiliaCausa, 'produccion'>) => (kpi.grupos[f]?.sec ?? 0) / 60
    const conocidos = kpi.uptimeMin + minDe('falla') + minDe('micro') + minDe('externo')
      + minDe('planificado') + minDe('excedido') + minDe('sin-imputar')
    return {
      maquina: m,
      kpi,
      velocidad,
      reparto: {
        falla: minDe('falla'),
        micro: minDe('micro'),
        externo: minDe('externo'),
        excedido: minDe('excedido'),
        planificado: minDe('planificado'),
        'sin-imputar': minDe('sin-imputar'),
        produccion: kpi.uptimeMin,
        /** Lo que la ventana tiene y los states no cubren (huecos de sensor). */
        resto: Math.max(0, ventanaMin - conocidos),
      },
    }
  })

  const eventos = porMaquina
    .flatMap((x) => x.kpi.eventosFalla.map((e) => ({ ...e, maquina: x.maquina.machineName })))
    .sort((a, b) => b.sec - a.sec)
  const totalFallaMin = porMaquina.reduce((a, x) => a + x.reparto.falla, 0)
  const totalEventos = eventos.length

  // Caída de línea a resolución de 5 min (los intervalos que el cliente tiene).
  const n = Math.min(...maquinas.map((m) => m.intervals?.length ?? 0))
  let caida = 0, caidaNoPlan = 0
  for (let i = 0; i < n; i++) {
    const todasCero = maquinas.every((m) => (m.intervals[i]?.cycles ?? 0) === 0)
    if (!todasCero) continue
    caida += 5
    if (maquinas.some((m) => (m.intervals[i]?.expectedCycles ?? 0) > 0)) caidaNoPlan += 5
  }

  return {
    ventana,
    ventanaMin,
    porMaquina,
    eventos,
    totalFallaMin,
    totalEventos,
    mttrGlobalMin: totalEventos > 0 ? totalFallaMin / totalEventos : null,
    linea: { caidaTotalMin: caida, caidaNoPlanificadaMin: caidaNoPlan },
  }
}
