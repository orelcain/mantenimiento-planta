/**
 * De «minutos parados de una máquina» a «minutos perdidos de la LÍNEA».
 *
 * Una parada de 30 min en una de las tres BAADER no le cuesta 30 min a Eviscerado: le
 * cuesta su cuota (1 de 3 ≈ 10 min). Esa cuota la define el editor de líneas de proceso
 * (`lineasProceso/{planta}`) y la calcula `pesosPorLinea`. Acá solo se cruza con lo que
 * registró la bitácora.
 *
 * Regla de datos (Orel): no se inventa. Si una máquina todavía no está puesta en el
 * editor, o el evento se escribió a mano y no quedó ligado al árbol de equipos, su tiempo
 * NO se convierte: se informa aparte como «todavía sin lugar en la línea».
 */
import { pesosPorLinea, type GrafoLineas, type PesoEnLinea } from '@/services/lineasProceso/modeloLineas'
import type { EquipoDelPeriodo } from './historialBitacora'

export interface EquipoConCuota {
  equipo: string
  /** Minutos que estuvo detenida la máquina (tiempo de reloj). */
  minutos: number
  /** Parte de su línea que pasa por esta máquina (0-1). */
  cuota: number
  /** Minutos equivalentes de línea: `minutos × cuota`. */
  minutosLinea: number
  linea: string
}

export interface PerdidaDeLinea {
  /** Minutos de línea por cada línea, de mayor a menor. */
  porLinea: Array<{ linea: string; minutos: number; equipos: number }>
  /** Los equipos que sí tienen cuota, de mayor a menor pérdida de línea. */
  equipos: EquipoConCuota[]
  /** Suma de los minutos de reloj de los equipos con cuota. */
  minutosMaquina: number
  /** Suma de los minutos equivalentes de línea. */
  minutosLinea: number
  /** Lo que no se pudo convertir: nombre y minutos de reloj. */
  sinCuota: Array<{ equipo: string; minutos: number; motivo: 'sin-ubicar' | 'fuera-de-linea' | 'en-circulo' }>
  /** Minutos de reloj que quedaron sin convertir. */
  minutosSinCuota: number
}

/** Nombre de cada línea del grafo, para rotular. */
function nombresDeLinea(grafo: Pick<GrafoLineas, 'lineas'>): Map<string, string> {
  return new Map(grafo.lineas.map((l) => [l.id, l.nombre]))
}

/**
 * Cruza los equipos del período con las cuotas del editor.
 * `grafo` en `null` (nunca se guardaron las líneas) devuelve todo como «sin ubicar».
 */
export function perdidaDeLinea(equipos: readonly EquipoDelPeriodo[], grafo: GrafoLineas | null): PerdidaDeLinea {
  const pesos: Map<string, PesoEnLinea> = grafo ? pesosPorLinea(grafo) : new Map()
  const nombres = grafo ? nombresDeLinea(grafo) : new Map<string, string>()
  // «Sin ubicar» = ni siquiera está puesto en el editor. «Fuera de la línea» = está, pero
  // no le llega el flujo desde ninguna entrada. Son dos pendientes distintos.
  const enElLienzo = new Set(grafo?.nodos.map((n) => n.id) ?? [])

  const conCuota: EquipoConCuota[] = []
  const sinCuota: PerdidaDeLinea['sinCuota'] = []
  for (const e of equipos) {
    if (e.minutos <= 0) continue
    const peso = e.equipoId ? pesos.get(e.equipoId) : undefined
    if (!peso) {
      const puesto = !!e.equipoId && enElLienzo.has(e.equipoId)
      sinCuota.push({ equipo: e.equipo, minutos: e.minutos, motivo: puesto ? 'fuera-de-linea' : 'sin-ubicar' })
      continue
    }
    if (peso.ciclo) {
      sinCuota.push({ equipo: e.equipo, minutos: e.minutos, motivo: 'en-circulo' })
      continue
    }
    if (peso.peso <= 0) {
      sinCuota.push({ equipo: e.equipo, minutos: e.minutos, motivo: 'fuera-de-linea' })
      continue
    }
    conCuota.push({
      equipo: e.equipo,
      minutos: e.minutos,
      cuota: peso.peso,
      minutosLinea: e.minutos * peso.peso,
      linea: nombres.get(peso.lineaId) ?? peso.lineaId,
    })
  }
  conCuota.sort((a, b) => b.minutosLinea - a.minutosLinea)
  sinCuota.sort((a, b) => b.minutos - a.minutos)

  const porLinea = new Map<string, { minutos: number; equipos: number }>()
  for (const e of conCuota) {
    const actual = porLinea.get(e.linea) ?? { minutos: 0, equipos: 0 }
    actual.minutos += e.minutosLinea
    actual.equipos += 1
    porLinea.set(e.linea, actual)
  }

  return {
    porLinea: [...porLinea.entries()]
      .map(([linea, x]) => ({ linea, ...x }))
      .sort((a, b) => b.minutos - a.minutos),
    equipos: conCuota,
    minutosMaquina: conCuota.reduce((s, e) => s + e.minutos, 0),
    minutosLinea: conCuota.reduce((s, e) => s + e.minutosLinea, 0),
    sinCuota,
    minutosSinCuota: sinCuota.reduce((s, e) => s + e.minutos, 0),
  }
}

/**
 * La respuesta a «¿cuánto le costó a la línea?», con su referencia: el título dice si el
 * tiempo de línea perdido es mayor o menor que el tiempo de reloj y por qué.
 */
export function respuestaPerdida(p: PerdidaDeLinea, formatoMinutos: (m: number) => string): { titulo: string; detalle: string } | null {
  if (!p.equipos.length) return null
  // Se redondea PRIMERO y se resta después: si no, «5 min = 3 min, absorbió 3 min» sumaba
  // más que el total y la cifra se contradecía sola.
  const maquina = Math.round(p.minutosMaquina)
  const linea = Math.round(p.minutosLinea)
  const ahorro = Math.max(0, maquina - linea)
  const parte = p.minutosMaquina > 0 ? (p.minutosMaquina - p.minutosLinea) / p.minutosMaquina : 0
  const mayor = p.porLinea[0]
  const titulo =
    parte >= 0.05
      ? `${formatoMinutos(maquina)} de máquina detenida = ${formatoMinutos(linea)} de línea`
      : `${formatoMinutos(linea)} de línea perdidos: casi todo lo parado era en serie`
  const detalle =
    parte >= 0.05
      ? `Las máquinas que trabajan en paralelo absorbieron ${formatoMinutos(ahorro)}${mayor ? `. La línea más golpeada: ${mayor.linea}, ${formatoMinutos(Math.round(mayor.minutos))}` : ''}.`
      : `Cada minuto parado le costó casi un minuto a la línea${mayor ? `: ${mayor.linea} perdió ${formatoMinutos(Math.round(mayor.minutos))}` : ''}.`
  return { titulo, detalle }
}
