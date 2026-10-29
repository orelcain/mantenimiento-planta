/**
 * fallaRepetida — paros de Mantención cuya MISMA causa vuelve en la MISMA
 * máquina al poco andar.
 *
 * ── Por qué este indicador y no «micros que anticipan la falla» ─────────────
 * Estudio de factibilidad 28-10-2026 (Chonchi + Yal feb→oct, Filete jul→oct;
 * plan en OneDrive `ARIA_MANTENIMIENTO_PLANTA/docs/PLAN_PREDICTIVA_MICRODETENCIONES.md`):
 *  - Las microdetenciones NO avisan con horas de anticipación (1-24 h antes: sin
 *    señal; una alerta por micros acierta 1 de cada 10).
 *  - Lo que sí está en el dato: tras un paro de Mantención, la misma causa
 *    vuelve en ≤ 8 h de operación ×4 a ×15 más seguido que en un momento al
 *    azar (Motores 63 % vs 6 %, Lógica 61 % vs 7 %, Knuro 46 % vs 10 %).
 *  - Orel (28-10): cuando vuelve, es la misma falla mal resuelta. O sea, la
 *    reincidencia mide la calidad de la reparación.
 *
 * ── Definiciones (las mismas del estudio; cambiarlas cambia las cifras) ─────
 *  - Paro: state `downtime` de nombre «Detencion» (no micro), ≥ 2 min, con una
 *    causal del bucket Mantención. «Ajuste mantenimiento» y «Trabajos
 *    contratistas» quedan fuera: Orel confirmó que Ajuste mezcla rutina con
 *    falla, y en Yal son 848 paros que tapan todo lo demás.
 *  - Episodio: paros de la misma causa separados por < 12 min se cuentan como
 *    uno (la máquina partió y volvió a parar por lo mismo).
 *  - Repetición: el episodio empieza ≤ 8 h DE OPERACIÓN (tiempo `uptime`, no
 *    de reloj) después del episodio anterior de la misma causa y máquina. Se
 *    mide en horas de operación porque una colación o un fin de semana sin
 *    producir no son tiempo en que la reparación se pone a prueba.
 *  - Shoplogix guarda wall-clock como UTC; acá solo se restan instantes, así
 *    que la convención no afecta.
 */

import { matchImputacion } from './imputacionTaxonomy'

export const FALLA_REPETIDA = {
  /** Horas de operación dentro de las que una vuelta cuenta como repetición. */
  ventanaOpH: 8,
  /** Paros de la misma causa con menos de esto entre medio forman un episodio. */
  encadenarMin: 12,
  /** Paros más cortos no entran (la micro sin causal es otro problema). */
  minDurSec: 120,
} as const

/** Hojas del bucket Mantención que NO son falla del equipo. */
const CAUSAS_EXCLUIDAS = new Set(['Ajuste mantenimiento', 'Trabajos contratistas / propios'])

/**
 * Causa de falla de un reason, o null si no es un paro de Mantención que
 * cuente. Las cuchillerías de la Baader 200 se juntan en una sola causa: el
 * cuchillo que se cambia es el mismo juego y por estación quedan muy pocos
 * episodios para leer algo.
 */
export function causaDeFalla(reason: string | null | undefined): string | null {
  const { leaf } = matchImputacion(reason)
  if (!leaf || leaf.bucket !== 'mantencion' || CAUSAS_EXCLUIDAS.has(leaf.label)) return null
  if (leaf.equipo === 'baader200' && leaf.label.startsWith('Cuchillería')) return 'Cuchillería'
  return leaf.label
}

export interface StateFalla {
  startAt: Date
  endAt: Date
  durationSec: number
  type: string
  name: string
  reason: string
}

export interface MaquinaFalla {
  machineid: string
  machineName: string
  states: ReadonlyArray<StateFalla>
}

export interface EpisodioFalla {
  machineid: string
  machineName: string
  causa: string
  startAt: Date
  endAt: Date
  /** Paros que se encadenaron en el episodio. */
  paros: number
  /** Horas de operación desde el fin del episodio anterior de la misma causa; null si es el primero. */
  opHDesdeAnterior: number | null
  /** true si llegó ≤ ventanaOpH después del anterior. */
  esRepeticion: boolean
}

/** Saca los states duplicados (Shoplogix repite el mismo state en dos syncs). */
function dedupe(states: ReadonlyArray<StateFalla>): StateFalla[] {
  const vistos = new Map<string, StateFalla>()
  for (const s of states) {
    const k = `${s.startAt.getTime()}|${s.type}|${s.name}|${s.reason}`
    const prev = vistos.get(k)
    // Del mismo state queda el más largo: el de un sync posterior trae el cierre.
    if (!prev || s.durationSec > prev.durationSec) vistos.set(k, s)
  }
  return [...vistos.values()].sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
}

/** Horas de `uptime` entre dos instantes. `uptime` va ordenado por inicio. */
function horasOperacion(uptime: ReadonlyArray<StateFalla>, desde: number, hasta: number): number {
  if (hasta <= desde) return 0
  let ms = 0
  for (const u of uptime) {
    const a = u.startAt.getTime()
    if (a >= hasta) break
    const b = a + u.durationSec * 1000
    const ini = Math.max(a, desde)
    const fin = Math.min(b, hasta)
    if (fin > ini) ms += fin - ini
  }
  return ms / 3_600_000
}

/** Episodios de falla de todas las máquinas, en orden de inicio. */
export function episodiosFalla(maquinas: ReadonlyArray<MaquinaFalla>): EpisodioFalla[] {
  const out: EpisodioFalla[] = []
  for (const m of maquinas) {
    const states = dedupe(m.states)
    const uptime = states.filter((s) => s.type === 'uptime')

    const porCausa = new Map<string, Array<{ ini: number; fin: number; paros: number }>>()
    for (const s of states) {
      if (s.type !== 'downtime' || s.name.toLowerCase().includes('micro')) continue
      if (s.durationSec < FALLA_REPETIDA.minDurSec) continue
      const causa = causaDeFalla(s.reason)
      if (!causa) continue
      const ini = s.startAt.getTime()
      const fin = ini + s.durationSec * 1000
      const lista = porCausa.get(causa) ?? []
      const ultimo = lista[lista.length - 1]
      if (ultimo && ini - ultimo.fin < FALLA_REPETIDA.encadenarMin * 60_000) {
        ultimo.fin = Math.max(ultimo.fin, fin)
        ultimo.paros += 1
      } else {
        lista.push({ ini, fin, paros: 1 })
      }
      porCausa.set(causa, lista)
    }

    for (const [causa, lista] of porCausa) {
      lista.forEach((e, i) => {
        const prev = i > 0 ? lista[i - 1]! : null
        const opH = prev ? horasOperacion(uptime, prev.fin, e.ini) : null
        out.push({
          machineid: m.machineid,
          machineName: m.machineName,
          causa,
          startAt: new Date(e.ini),
          endAt: new Date(e.fin),
          paros: e.paros,
          opHDesdeAnterior: opH,
          esRepeticion: opH !== null && opH <= FALLA_REPETIDA.ventanaOpH,
        })
      })
    }
  }
  return out.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
}

export interface GrupoFallaRepetida {
  machineid: string
  machineName: string
  causa: string
  /** Episodios de la causa que empezaron dentro del turno. */
  episodios: number
  /** De esos, cuántos fueron repetición (incluye la vuelta de un paro del turno anterior). */
  repeticiones: number
  /** Inicio de la última repetición del turno. */
  ultimaRepeticion: Date | null
  /** Horas de operación entre la última repetición y su paro anterior. */
  opHUltima: number | null
}

/**
 * Agrupa por máquina · causa los episodios que empezaron en [desde, hasta) y
 * deja solo los que tuvieron al menos una repetición. Ordena por repeticiones.
 */
export function fallasRepetidasDelTurno(
  episodios: ReadonlyArray<EpisodioFalla>,
  desde: Date,
  hasta: Date,
): GrupoFallaRepetida[] {
  const a = desde.getTime()
  const b = hasta.getTime()
  const grupos = new Map<string, GrupoFallaRepetida>()
  for (const e of episodios) {
    const t = e.startAt.getTime()
    if (t < a || t >= b) continue
    const k = `${e.machineid}|${e.causa}`
    const g = grupos.get(k) ?? {
      machineid: e.machineid, machineName: e.machineName, causa: e.causa,
      episodios: 0, repeticiones: 0, ultimaRepeticion: null, opHUltima: null,
    }
    g.episodios += 1
    if (e.esRepeticion) {
      g.repeticiones += 1
      g.ultimaRepeticion = e.startAt
      g.opHUltima = e.opHDesdeAnterior
    }
    grupos.set(k, g)
  }
  return [...grupos.values()]
    .filter((g) => g.repeticiones > 0)
    .sort((x, y) => y.repeticiones - x.repeticiones || y.episodios - x.episodios
      || x.machineName.localeCompare(y.machineName, 'es'))
}
