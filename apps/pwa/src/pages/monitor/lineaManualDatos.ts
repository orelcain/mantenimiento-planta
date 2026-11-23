/**
 * «Línea manual por hora» (mockup v4, versión 5): grader menos Baader en cada hora cerrada, en barra desde 0 con una
 * escala fija, y el horario ESTIMADO de la entrada manual (señal débil). Puro, aparte del componente; también da los
 * tramos de la franja «Manual (estimado)» del gráfico.
 *
 * Minutos = minutos del grader desde el inicio del turno; las Baader ya vienen corridas `retraso` minutos.
 */
import { horaDelEje } from '@/services/grader/espejo/alertasGrader'
import type { HoraManual } from '@/services/grader/espejo/graderVivo'

/** Escala de la barra (pz por hora): el máximo de los últimos turnos (18-11 T2, 13:00). */
export const TOPE_MANUAL_PZ = 450
/** Ancho mínimo (%) de una barra positiva, para que +4 se vea. */
export const BARRA_MIN_PCT = 1.5
/** Exceso por minuto (pz) sobre el que un minuto cuenta como entrada manual (ilustrativo). */
export const MANUAL_EXCESO_PZ_MIN = 5
/** Minutos seguidos sobre el umbral para marcar un tramo. */
export const MANUAL_TRAMO_MIN = 3
/** Una hora con al menos estos minutos de línea detenida se marca «detenida» (la resta no dice nada). */
export const MANUAL_DETENIDA_MIN = 15

export type FilaManual =
  | { tipo: 'barra'; hora: string; d: number; pct: number }
  | { tipo: 'cero'; hora: string; d: number }
  | { tipo: 'detenida'; hora: string; d: number }
  | { tipo: 'sinLectura'; hora: string }
  | { tipo: 'enCurso'; hora: string }

/** Minuto del grader en que empieza la hora «HH:00» (la primera vez que aparece desde el inicio). */
function minutoDeHora(t0Ms: number, hora: string): number {
  const minDia0 = Math.floor(t0Ms / 60_000) % 1440
  const [h, m] = hora.split(':').map(Number)
  return ((((h ?? 0) * 60 + (m ?? 0)) - minDia0) % 1440 + 1440) % 1440
}

/**
 * Las filas de la tarjeta. `detenciones`: [desde, hasta) en minutos del grader. `hastaMin`: minutos con dato; si el
 * turno sigue y queda una hora abierta después de la última cerrada, va una fila «en curso».
 */
export function filasManual(horas: readonly HoraManual[], t0Ms: number, detenciones: ReadonlyArray<readonly [number, number]>, hastaMin: number, enCurso: boolean): FilaManual[] {
  const out: FilaManual[] = horas.map((h) => {
    if (h.diferencia === null) return { tipo: 'sinLectura', hora: h.hora }
    // Con el respaldo de 5 min las Baader van en quintos de pieza: se redondea.
    const dif = Math.round(h.diferencia)
    const a = minutoDeHora(t0Ms, h.hora)
    let det = 0
    for (const [x, y] of detenciones) det += Math.max(0, Math.min(y, a + 60) - Math.max(x, a))
    if (det >= MANUAL_DETENIDA_MIN) return { tipo: 'detenida', hora: h.hora, d: dif }
    if (dif <= 0) return { tipo: 'cero', hora: h.hora, d: dif }
    return { tipo: 'barra', hora: h.hora, d: dif, pct: Math.max(BARRA_MIN_PCT, Math.min(100, (dif / TOPE_MANUAL_PZ) * 100)) }
  })
  if (enCurso) {
    const ult = horas[horas.length - 1]
    const desde = ult ? minutoDeHora(t0Ms, ult.hora) + 60 : null
    if (desde !== null && desde < hastaMin) out.push({ tipo: 'enCurso', hora: horaDelEje(t0Ms, desde) })
  }
  return out
}

/** «+38», «−11 · ≈ 0», «+12 · detenida». */
export function textoFila(f: FilaManual): string {
  const n = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}`
  switch (f.tipo) {
    case 'barra': return n(f.d)
    case 'cero': return f.d === 0 ? '0' : `${n(f.d)} · ≈ 0`
    case 'detenida': return `${n(f.d)} · detenida`
    case 'sinLectura': return 'sin lectura'
    case 'enCurso': return 'en curso'
  }
}

/**
 * Tramos de entrada manual ESTIMADA: exceso = grader(t) − Baader(t), con las Baader ya corridas. Un tramo es «entrada
 * manual» si el exceso pasa de {@link MANUAL_EXCESO_PZ_MIN} pz/min por {@link MANUAL_TRAMO_MIN} min seguidos. Los minutos
 * sin lectura o sin Baader (`null`) cortan. Devuelve [desde, hasta, ≈pz].
 */
export function tramosManual(grader: ReadonlyArray<number | null>, baader: ReadonlyArray<number | null> | null): Array<[number, number, number]> {
  if (!baader) return []
  const tr: Array<[number, number, number]> = []
  let ini = -1
  let suma = 0
  for (let t = 0; t <= grader.length; t++) {
    const g = grader[t]
    const b = baader[t]
    const ex = t < grader.length && g != null && b != null ? g - b : 0
    if (ex > MANUAL_EXCESO_PZ_MIN) {
      if (ini < 0) { ini = t; suma = 0 }
      suma += ex
    } else if (ini >= 0) {
      if (t - ini >= MANUAL_TRAMO_MIN) tr.push([ini, t, Math.round(suma)])
      ini = -1
    }
  }
  return tr
}

/** Resumen de los tramos: cuántos, minutos y piezas. */
export function resumenTramos(tr: ReadonlyArray<readonly [number, number, number]>): { n: number; min: number; pz: number } {
  return { n: tr.length, min: tr.reduce((s, t) => s + t[1] - t[0], 0), pz: tr.reduce((s, t) => s + t[2], 0) }
}

/** «3 h 00 min» / «45 min». */
export function horasMin(m: number): string {
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}
