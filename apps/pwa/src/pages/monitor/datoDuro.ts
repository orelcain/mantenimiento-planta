/**
 * Derivados del DATO DURO del pulso (buckets de 1 minuto de Shoplogix) para
 * los números vivos del monitor.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Careo del 29-08 con el turno andando: la curva histórica de 5 min calza
 * EXACTA con los buckets (28/28 tramos cerrados, dif 0), pero los números
 * "vivos" derivados de ella arrastran el rezago del sync (~5 min) y el tramo
 * a medio formar. El caso medido: media 15 min de la UI 26,3 pz/min contra
 * 33,1 reales — subestimaba 5-7 pz/min SIEMPRE que la línea corre. Pedido de
 * Orel: «todo debe cuadrar conforme la data de piezas pasadas por minuto».
 *
 * Todo lo de acá se usa SOLO cuando el pulso está fresco (mismo criterio que
 * el número grande, `elegirContador`); si no, cada bloque cae a su fórmula
 * de 5 min de siempre.
 */

import type { PulsoMonitor } from '@/services/shoplogix/publicShiftMonitor.service'

export interface Media15Duro {
  /** pz/min ANDANDO: solo los minutos con piezas (la vara del número grande). */
  cpm: number
  /** pz/min DE RELOJ: con los minutos parados adentro. */
  cpmReloj: number
  /** Minutos con piezas dentro de la ventana. */
  minAndando: number
  /** Reparto por máquina en la MISMA ventana y vara — suman `cpm`. */
  porMaquina: Array<{ id: string; cpm: number }>
  /** Fin del último minuto cerrado (wall-clock-as-UTC ms), para el rótulo. */
  hastaWallMs: number
}

/**
 * La media de los últimos 15 minutos CERRADOS, desde los buckets.
 *
 * «Andando» acá es por MINUTO de línea: un minuto sin ninguna pieza de
 * ninguna máquina no cuenta en el denominador — grano más fino que la versión
 * de 5 min (que descartaba tramos enteros), misma semántica.
 */
export function media15DelDuro(pulse: PulsoMonitor | null | undefined): Media15Duro | null {
  const s = pulse?.serieMinuto
  if (!s?.maquinas?.length) return null
  const n = Math.min(...s.maquinas.map((m) => m.cycles.length))
  /* Con menos de 5 minutos de historia la media es puro arranque: mejor la
     fórmula de siempre. */
  if (n < 5) return null
  const desde = Date.parse(s.desde)
  if (!Number.isFinite(desde)) return null

  const ventana = Math.min(15, n)
  const i0 = n - ventana
  const linea = Array.from({ length: ventana }, (_, i) =>
    s.maquinas.reduce((a, m) => a + (m.cycles[i0 + i] ?? 0), 0))
  const total = linea.reduce((a, b) => a + b, 0)
  const minAndando = linea.filter((v) => v > 0).length

  return {
    cpm: minAndando > 0 ? total / minAndando : 0,
    cpmReloj: total / ventana,
    minAndando,
    porMaquina: s.maquinas.map((m) => ({
      id: m.id,
      cpm: minAndando > 0
        ? m.cycles.slice(i0, i0 + ventana).reduce((a, b) => a + b, 0) / minAndando
        : 0,
    })),
    hastaWallMs: desde + n * 60_000,
  }
}

export interface PiezasMaquinaDuro {
  /** Piezas del turno por máquina, al corte del PULSO (no del sync). */
  piezas: Map<string, number>
  /** El corte, en UTC real (el `at` del pulso). */
  at: string
}

/**
 * El acumulado del turno POR MÁQUINA según los buckets — el mismo corte del
 * contador grande, para que «Por máquina» sume lo que dice el héroe.
 *
 * Sale de la última lectura del pulso (trae el acumulado por máquina, con el
 * minuto parcial incluido — igual que `totalCycles`); si esa forma vieja no
 * está, se suma la serie de minutos cerrados (queda ≤1 min por debajo).
 */
export function piezasDelDuro(pulse: PulsoMonitor | null | undefined): PiezasMaquinaDuro | null {
  if (!pulse) return null
  const ultima = pulse.lecturas?.[pulse.lecturas.length - 1]
  if (ultima?.porMaquina && Object.keys(ultima.porMaquina).length > 0) {
    return { piezas: new Map(Object.entries(ultima.porMaquina)), at: pulse.at }
  }
  const s = pulse.serieMinuto
  if (!s?.maquinas?.length) return null
  return {
    piezas: new Map(s.maquinas.map((m) => [m.id, m.cycles.reduce((a, b) => a + b, 0)])),
    at: pulse.at,
  }
}

/**
 * Corrige la HORA EN CURSO del «Hora por hora» con los minutos cerrados de la
 * serie: la fila parcial de 5 min llega hasta 8 min tarde y con el último
 * tramo a medio formar.
 *
 * @param fila — la fila parcial: `from` wall-as-UTC ISO del inicio de la hora.
 * @returns piezas y pz/h frescos, o null si la serie no cubre esa hora.
 */
export function horaEnCursoDelDuro(
  pulse: PulsoMonitor | null | undefined,
  fila: { from: string },
): { pieces: number; piecesPerHour: number; minutesCovered: number } | null {
  const s = pulse?.serieMinuto
  if (!s?.maquinas?.length) return null
  const n = Math.min(...s.maquinas.map((m) => m.cycles.length))
  const desde = Date.parse(s.desde)
  const fromMs = Date.parse(fila.from)
  if (!Number.isFinite(desde) || !Number.isFinite(fromMs)) return null
  const i0 = Math.round((fromMs - desde) / 60_000)
  if (i0 < 0 || i0 >= n) return null
  let pieces = 0
  for (let i = i0; i < n; i++) {
    pieces += s.maquinas.reduce((a, m) => a + (m.cycles[i] ?? 0), 0)
  }
  const minutesCovered = n - i0
  if (minutesCovered <= 0) return null
  return { pieces, piecesPerHour: Math.round((pieces / minutesCovered) * 60), minutesCovered }
}
