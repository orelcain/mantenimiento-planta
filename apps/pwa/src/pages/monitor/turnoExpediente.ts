/**
 * Cuentas y títulos de las ventanas del Monitor en PC (`TurnoExpedientePC`): Piezas del turno, Ritmo, Al cierre y Máquinas.
 * Sin React, para probarlas solas. Cada título dice el dato del turno, calculado de lo que llega por props; nada se inventa.
 */
import type { HourlyRow } from '@/services/shoplogix/monitorHourly'
import { int } from './ejeTurno'

const dec = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const hhmm = (iso: string) => iso.slice(11, 16)

/** % hecho de la meta, entero. Sin meta, null. */
export const pctMeta = (hechas: number, meta: number | null | undefined) => (meta && meta > 0 ? Math.round((hechas / meta) * 100) : null)

/** El tramo más largo de horas seguidas sin una pieza (de la primera a la última de ese tramo). null si no hubo. */
export function tramoSinProducir(filas: HourlyRow[]): { desde: string; hasta: string; horas: number } | null {
  let mejor: { i: number; n: number } | null = null
  let ini = -1
  filas.forEach((h, i) => {
    if (h.pieces <= 0) {
      if (ini < 0) ini = i
      const n = i - ini + 1
      if (!mejor || n > mejor.n) mejor = { i: ini, n }
    } else ini = -1
  })
  if (!mejor) return null
  const { i, n } = mejor as { i: number; n: number }
  return { desde: filas[i]!.from, hasta: filas[i + n - 1]!.to, horas: n }
}

/**
 * «9.262 piezas, 62 % de la meta; de 10:20 a 12:20 la línea no produjo». Sin horas en cero, la hora completa más baja (si hay
 * al menos dos y no son iguales). Sin meta, solo las piezas.
 */
export function tituloPiezas(hechas: number, meta: number | null | undefined, filas: HourlyRow[]): string {
  const pct = pctMeta(hechas, meta)
  const base = `${int(hechas)} ${Math.round(hechas) === 1 ? 'pieza' : 'piezas'}${pct != null ? `, ${pct} % de la meta` : ''}`
  const cero = tramoSinProducir(filas)
  if (cero) return `${base}; de ${hhmm(cero.desde)} a ${hhmm(cero.hasta)} la línea no produjo`
  const completas = filas.filter((h) => !h.partial)
  if (completas.length < 2) return base
  const peor = completas.reduce((a, h) => (h.pieces < a.pieces ? h : a))
  const mejor = completas.reduce((a, h) => (h.pieces > a.pieces ? h : a))
  if (peor.pieces === mejor.pieces) return base
  return `${base}; la hora más baja, de ${hhmm(peor.from)} a ${hhmm(peor.to)}, dio ${int(peor.pieces)}`
}

/** Piezas de esa hora contra la meta de los minutos que cubre (una hora de 45 min se compara con ¾ de la meta por hora). */
export const contraMetaHora = (h: Pick<HourlyRow, 'pieces' | 'minutesCovered'>, metaPorHora: number) => Math.round(h.pieces - (metaPorHora * h.minutesCovered) / 60)

/** La fila «Turno» de Hora a hora: la línea, cada Baader y contra la meta, sumando las mismas filas que se ven. */
export function totalHoras(filas: HourlyRow[], porMaquina: Array<{ nombre: string; piezas: number[] }>, metaPorHora: number | null) {
  return {
    linea: filas.reduce((a, h) => a + h.pieces, 0),
    maquinas: porMaquina.map((m) => filas.reduce((a, _h, i) => a + (m.piezas[i] ?? 0), 0)),
    contraMeta: metaPorHora != null ? filas.reduce((a, h) => a + contraMetaHora(h, metaPorHora), 0) : null,
  }
}

/**
 * «Al cierre de las 15:05 llegaría a 15.200 pz, 200 sobre la meta». Sin proyección lo dice. Con la línea detenida, la proyección
 * queda en pausa, igual que en la franja y en el gráfico: no se promete una cifra que supone que la línea ya volvió a andar.
 */
export function tituloCierre(proyeccion: number | null, meta: number | null, hora: string | null | undefined, detenida = false): string {
  if (detenida) return 'La línea está detenida: la proyección del cierre queda en pausa'
  if (proyeccion == null) return 'Sin proyección del cierre para este turno'
  const base = `Al cierre${hora ? ` de las ${hora}` : ''} llegaría a ${int(proyeccion)} pz`
  if (!meta || meta <= 0) return base
  const d = Math.round(proyeccion - meta)
  if (d === 0) return `${base}, justo la meta`
  return d > 0 ? `${base}, ${int(d)} sobre la meta` : `${base}; faltarían ${int(-d)} para la meta`
}

/** «La línea anda a 38,2 pz/min; la meta pide 39,8». Cerrado, «anduvo» y la comparación con lo normal de la línea. */
export function tituloRitmo(e: { ritmo: number | null; necesario: number | null; normal: number | null; cerrado: boolean }): string {
  if (e.ritmo == null) return 'Sin ritmo de la línea en este turno'
  const base = `La línea ${e.cerrado ? 'anduvo' : 'anda'} a ${dec(e.ritmo)} pz/min`
  if (!e.cerrado && e.necesario != null) return `${base}; la meta pide ${dec(e.necesario)}`
  if (e.normal != null) return `${base}; lo normal de esta línea es ${dec(e.normal)}`
  return base
}

/** «2 de 3 máquinas corriendo; Evisceradora 2 detenida». Con más de una detenida, cuántas. */
export function tituloMaquinas(maquinas: Array<{ name: string; status: string }>): string {
  const corriendo = maquinas.filter((m) => m.status === 'produciendo').length
  const detenidas = maquinas.filter((m) => m.status === 'detenida')
  const base = `${corriendo} de ${maquinas.length} ${maquinas.length === 1 ? 'máquina corriendo' : 'máquinas corriendo'}`
  if (detenidas.length === 1) return `${base}; ${detenidas[0]!.name} detenida`
  if (detenidas.length > 1) return `${base}; ${detenidas.length} detenidas`
  return base
}
