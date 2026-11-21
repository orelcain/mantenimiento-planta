/**
 * Los 3 turnos reales con que se validaron los agregados del Grader en vivo (21-11): 19-11 Turno 2, 18-11 Turno 1
 * y 17-11 Turno 2 de Chonchi. Solo para tests.
 *
 * Cada `.json.gz` trae TODAS las piezas de Pieza pieza (Excel de Matrix) en filas compactas, la serie de las 3
 * Baader (la serie por minuto archivada del monitor; el 17-11 ya no está archivada y va en tramos de 5 min
 * repartidos por minuto, como en el mockup) y las causas P0 oficiales del cierre (con Puerta 0).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { PiezaEspejo } from '../espejoFilas'
import type { SerieMinutoBaader } from '../graderVivo'
import type { CalibreRange } from '../../types'

export type TurnoReal = '2026-11-19-turno_2' | '2026-11-18-turno_1' | '2026-11-17-turno_2'
export const TURNOS_REALES: TurnoReal[] = ['2026-11-19-turno_2', '2026-11-18-turno_1', '2026-11-17-turno_2']

interface Crudo {
  fuente: string
  turno: string
  t0: string
  baader: SerieMinutoBaader
  dic: { calidad: string[]; calibre: string[]; conservacion: string[]; producto: string[]; lote: string[] }
  /** [seg desde t0, gate, gramos, piezas, calidad, calibre, conservación, producto, lote]. */
  filas: number[][]
  oficial: { topP0Causes: Array<{ error: string; pieces: number }>; pointZeroPieces: number; totalPieces: number }
}

export interface DatosTurnoReal {
  turno: string
  /** Inicio del turno de Shoplogix (minuto 0 del eje), wall-clock-as-UTC. */
  t0Ms: number
  baader: SerieMinutoBaader
  /** En orden de hora. */
  piezas: PiezaEspejo[]
  oficial: Crudo['oficial']
}

const cache = new Map<TurnoReal, DatosTurnoReal>()

export function turnoReal(t: TurnoReal): DatosTurnoReal {
  const c = cache.get(t)
  if (c) return c
  const raw = JSON.parse(gunzipSync(readFileSync(path.join(__dirname, `chonchi-${t}.json.gz`))).toString('utf8')) as Crudo
  const t0Ms = Date.parse(raw.t0)
  const piezas = raw.filas.map(([s, gate, g, n, q, c, co, pr, l]): PiezaEspejo => {
    const ts = new Date(t0Ms + s! * 1000).toISOString()
    return {
      cadena: `${ts}#${gate}#${g}`,
      ts,
      fecha: ts.slice(0, 10),
      hora: ts.slice(11, 19),
      pesoKg: g! > 0 ? g! / 1000 : null,
      cantidad: n!,
      lote: raw.dic.lote[l!] ?? '',
      gate: gate!,
      calidad: raw.dic.calidad[q!] ?? '',
      conservacion: raw.dic.conservacion[co!] ?? '',
      calibre: (raw.dic.calibre[c!] ?? '') as CalibreRange,
      producto: raw.dic.producto[pr!] ?? '',
      turnoMatrix: '',
    }
  })
  const d = { turno: raw.turno, t0Ms, baader: raw.baader, piezas, oficial: raw.oficial }
  cache.set(t, d)
  return d
}

/** Las piezas leídas hasta `hastaMs` (exclusivo), como las tendría el monitor en ese momento. */
export function piezasHasta(d: DatosTurnoReal, hastaMs: number): PiezaEspejo[] {
  const iso = new Date(hastaMs).toISOString()
  return d.piezas.filter((p) => p.ts < iso)
}

/** La serie de las Baader recortada a los minutos cerrados hasta `hastaMs` (Shoplogix publica con unos minutos de atraso). */
export function baaderHasta(d: DatosTurnoReal, hastaMs: number, atrasoMin = 3): SerieMinutoBaader {
  const desde = Date.parse(d.baader.desde)
  const n = Math.max(0, Math.floor((hastaMs - desde) / 60_000) - atrasoMin)
  return { desde: d.baader.desde, maquinas: d.baader.maquinas.map((m) => ({ cycles: m.cycles.slice(0, n) })) }
}
