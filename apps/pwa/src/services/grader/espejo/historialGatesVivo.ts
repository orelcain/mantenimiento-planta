/**
 * Historial de cambios de cada gate (tanda 2, opción A «Antes y después» aprobada por Orel): cada cambio de programa
 * del turno con su comparación, 60 minutos con producción antes contra 60 después, en P0 y en pz/min por gate.
 *
 * El cambio (hora, programa anterior y nuevo, confirmado o provisional) ya lo detecta `seteoGatesVivo`: aquí solo se
 * mide qué pasó alrededor. Un cambio sin confirmar (menos de 100 piezas del programa nuevo) no lleva comparación.
 */
import type { PiezaEspejo } from './espejoFilas'
import type { CambioGate, SeteoVivo, TramoGate } from './seteoGatesVivo'

/** Minutos con producción de cada lado del cambio. */
export const VENTANA_CAMBIO_MIN = 60
/** Con menos minutos con producción de un lado la comparación no se da (se dice «sin antes»). */
export const VENTANA_CAMBIO_MIN_UTIL = 10
/** Diferencia de P0 (puntos) bajo la cual se dice «P0 igual». */
export const P0_IGUAL_PTS = 0.1

const etiquetaDe = (p: PiezaEspejo) => `${p.calibre} · ${p.calidad}`

/** Un lado de la comparación. */
export interface LadoCambio {
  /** Minutos con producción realmente medidos (hasta 60). */
  minutos: number
  piezas: number
  p0Piezas: number
  p0Pct: number | null
  /** pz/min de cada gate del grupo, promediado; `null` sin gates en el grupo o sin minutos. */
  pzMinNuevo: number | null
  pzMinViejo: number | null
}

export interface CambioConEfecto {
  cambio: CambioGate
  /** Gates que tenían el programa nuevo ANTES del cambio (el grupo de «8-10 por gate» del antes). */
  gatesNuevo: number[]
  /** Gates que se quedaron con el programa anterior DESPUÉS del cambio (el grupo de «G12»). */
  gatesViejo: number[]
  /** Gates con el programa nuevo después del cambio, la que cambió incluida (el grupo del después). */
  gatesNuevoDespues: number[]
  antes: LadoCambio | null
  despues: LadoCambio | null
  /** `igual` | `sube` | `baja` según la diferencia de P0, o `null` sin comparación. */
  p0: 'igual' | 'sube' | 'baja' | null
}

const minutoDe = (ts: string) => ts.slice(0, 16)

/** Gates que tuvieron un tramo con ese programa (calibre · calidad) que se solapa con [desde, hasta). */
function gatesConPrograma(tramos: readonly TramoGate[], programa: string, desde: string, hasta: string): number[] {
  const s = new Set<number>()
  for (const t of tramos) {
    if (t.etiqueta !== programa) continue
    if (t.desdeTs < hasta && (t.hastaTs === null || t.hastaTs > desde)) s.add(t.gate)
  }
  return [...s].sort((a, b) => a - b)
}

function medir(
  piezas: readonly PiezaEspejo[],
  minutos: readonly string[],
  nuevo: { programa: string; gates: number[] },
  viejo: { programa: string; gates: number[] },
): LadoCambio {
  const set = new Set(minutos)
  const nG = new Set(nuevo.gates)
  const vG = new Set(viejo.gates)
  let total = 0
  let g0 = 0
  let pn = 0
  let pv = 0
  for (const p of piezas) {
    if (!set.has(minutoDe(p.ts))) continue
    total += p.cantidad
    if (p.gate === 0) g0 += p.cantidad
    else if (nG.has(p.gate) && etiquetaDe(p) === nuevo.programa) pn += p.cantidad
    else if (vG.has(p.gate) && etiquetaDe(p) === viejo.programa) pv += p.cantidad
  }
  const m = minutos.length
  return {
    minutos: m,
    piezas: total,
    p0Piezas: g0,
    p0Pct: total > 0 ? (g0 / total) * 100 : null,
    pzMinNuevo: m > 0 && nuevo.gates.length > 0 ? pn / nuevo.gates.length / m : null,
    pzMinViejo: m > 0 && viejo.gates.length > 0 ? pv / viejo.gates.length / m : null,
  }
}

/**
 * Los cambios del turno con su antes y después. `piezas` = las del turno en orden de hora; `refMs` = hasta dónde se
 * mide (la última pieza leída). Los cambios vienen de `seteo.cambios` y los tramos de `seteo.tramos`.
 */
export function efectoDeCambios(piezas: readonly PiezaEspejo[], seteo: SeteoVivo, refMs: number): CambioConEfecto[] {
  const refTs = new Date(refMs).toISOString()
  const todos = [...new Set(piezas.map((p) => minutoDe(p.ts)))].sort()
  return seteo.cambios.map((cambio): CambioConEfecto => {
    const t = cambio.desdeTs
    const tMin = minutoDe(t)
    // Grupos de gates: las que tenían el programa nuevo antes del cambio, las que lo tienen después (con la que
    // cambió) y las que se quedaron con el anterior.
    const gatesNuevo = gatesConPrograma(seteo.tramos, cambio.despues, '0000', t).filter((g) => g !== cambio.gate)
    const gatesNuevoDespues = gatesConPrograma(seteo.tramos, cambio.despues, t, '9999')
    const gatesViejo = gatesConPrograma(seteo.tramos, cambio.antes, t, '9999').filter((g) => g !== cambio.gate)
    const base = { cambio, gatesNuevo, gatesViejo, gatesNuevoDespues }
    if (cambio.estado === 'provisional') return { ...base, antes: null, despues: null, p0: null }
    const previos = todos.filter((m) => m < tMin).slice(-VENTANA_CAMBIO_MIN)
    const posteriores = todos.filter((m) => m >= tMin && m <= minutoDe(refTs)).slice(0, VENTANA_CAMBIO_MIN)
    const nuevo = (gates: number[]) => ({ programa: cambio.despues, gates })
    const viejo = { programa: cambio.antes, gates: gatesViejo }
    const antes = previos.length >= VENTANA_CAMBIO_MIN_UTIL ? medir(piezas, previos, nuevo(gatesNuevo), viejo) : null
    const despues = posteriores.length >= VENTANA_CAMBIO_MIN_UTIL ? medir(piezas, posteriores, nuevo(gatesNuevoDespues), viejo) : null
    let p0: CambioConEfecto['p0'] = null
    if (antes?.p0Pct != null && despues?.p0Pct != null) {
      const d = despues.p0Pct - antes.p0Pct
      p0 = Math.abs(d) < P0_IGUAL_PTS ? 'igual' : d > 0 ? 'sube' : 'baja'
    }
    return { ...base, antes, despues, p0 }
  })
}

/** «G8, G9, G10» → «G8–G10»: tramos seguidos se juntan. */
export function textoGates(gates: readonly number[]): string {
  const g = [...gates].sort((a, b) => a - b)
  const out: string[] = []
  let i = 0
  while (i < g.length) {
    let j = i
    while (j + 1 < g.length && g[j + 1] === g[j]! + 1) j++
    out.push(j - i >= 2 ? `G${g[i]}–G${g[j]}` : g.slice(i, j + 1).map((x) => `G${x}`).join(', '))
    i = j + 1
  }
  return out.join(', ')
}
