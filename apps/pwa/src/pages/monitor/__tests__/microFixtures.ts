/**
 * Los dos docs públicos REALES del 02-11-2026 con los que se prueba el globo de la micro, recortados a las claves que usa el
 * clasificador (`fixtures/*.json`): las paradas por máquina (`stopEvents`, `stopReasons`, `stopMachines`), las máquinas, el inicio
 * programado, las paradas programadas del doc (`timeBreakdown.planned`) y la serie por minuto (`pulse.serieMinuto`).
 *  · Chonchi, Turno 2 (3 Baader): `chonchi_0211_turno2.json`, la lectura de las 15:24.
 *  · Filete, Turno Día (1 Baader): `filete_0211_dia.json`.
 * Las horas son hora de planta sellada como UTC: no se convierte zona.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { clasificarMicros, type EntradaMicroCausa, type MicroClasificada } from '../microCausa'

export interface DocMicro {
  _fuente: string
  live: {
    scheduledStart: string
    stopEvents: Array<{ r: number; f: string; s: number; m: number }>
    stopReasons: string[]
    stopMachines: string[]
    machines: Array<{ id: string; name: string }>
    timeBreakdown: { planned: Array<{ reason: string; min: number; count: number }> }
  }
  pulse: { serieMinuto: { desde: string; maquinas: Array<{ id: string; esperado: number | null; cycles: number[] }> } }
}

const leer = (archivo: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', archivo), 'utf8')) as DocMicro

export const CHONCHI_0211_T2: DocMicro = leer('chonchi_0211_turno2.json')
export const FILETE_0211_DIA: DocMicro = leer('filete_0211_dia.json')

/** La entrada del clasificador como la arma la página: el inicio del turno es el programado (en estos dos turnos coincide con el de la serie). */
export function entradaDeDoc(doc: DocMicro, extra: Partial<EntradaMicroCausa> = {}): EntradaMicroCausa {
  const nombres = new Map(doc.live.machines.map((m) => [m.id, m.name]))
  return {
    serie: {
      desde: doc.pulse.serieMinuto.desde,
      maquinas: doc.pulse.serieMinuto.maquinas.map((m) => ({ id: m.id, nombre: nombres.get(m.id) ?? m.id, esperado: m.esperado, cycles: m.cycles })),
    },
    stopEvents: doc.live.stopEvents,
    stopReasons: doc.live.stopReasons,
    stopMachines: doc.live.stopMachines,
    inicioTurnoMs: Date.parse(doc.live.scheduledStart),
    ...extra,
  }
}

/** «15:10:00», la hora con segundos de una micro. */
export const horaDe = (q: MicroClasificada) => new Date(q.inicioMs).toISOString().slice(11, 19)

/** La micro de la Baader `nombre` («Evisceradora 1», «Linea 1») que empieza a esa hora con segundos; falla si no está. */
export function buscarMicro(micros: MicroClasificada[], hhmmss: string, nombre: string): MicroClasificada {
  const q = micros.find((x) => horaDe(x) === hhmmss && x.nombre === nombre)
  if (!q) throw new Error(`no está la micro ${nombre} ${hhmmss}`)
  return q
}

export const clasificarDoc = (doc: DocMicro, extra: Partial<EntradaMicroCausa> = {}) => clasificarMicros(entradaDeDoc(doc, extra))
