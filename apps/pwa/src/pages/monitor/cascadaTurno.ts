/**
 * La cascada del turno: dónde se fueron las piezas que no se hicieron.
 *
 * ── Qué responde ────────────────────────────────────────────────────────────
 * Capacidad de la máquina − detenciones − microdetenciones − silletas vacías =
 * lo producido. Cierra exacto, y por eso se puede llevar a una reunión: cada
 * resta tiene un dueño distinto.
 *
 *   · detenciones y microdetenciones → Mantención y operación
 *   · silletas vacías                 → abastecimiento aguas arriba
 *
 * Los tres datos ya existían en el monitor, pero en tres tarjetas separadas, así
 * que nadie los sumaba. Medido en Filete el 20-08: 252 piezas se perdieron con
 * la línea parada y 534 con la línea andando y la silleta vacía. Dos tercios de
 * la pérdida NO son una falla, y esa conclusión no se podía leer en pantalla.
 *
 * ── Lo que NO hace ──────────────────────────────────────────────────────────
 * No dice «sin las detenciones habríamos hecho X». Dice dónde se fue el tiempo.
 * Es la misma regla del informe de defensa: un turno ideal que no ocurrió
 * convierte evidencia en excusa.
 *
 * ── Dos decisiones que cambian el resultado ─────────────────────────────────
 * 1. El tiempo PLANIFICADO (colación) queda fuera de la capacidad. Contarlo
 *    haría aparecer una pérdida que nadie puede recuperar, y exigir que se
 *    recupere una colación es pedir un imposible.
 * 2. La cascada se mide contra los TRAMOS CERRADOS, no contra el contador vivo:
 *    los minutos de `timeBreakdown` vienen de esa misma rejilla. Mezclarlos con
 *    el pulso haría que la suma no cerrara por unas decenas de piezas, y una
 *    cascada que no cierra no sirve para nada. Por eso devuelve su propio
 *    `corteWallMs` y la UI está obligada a decirlo.
 */

import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'

/** Lo que Shoplogix llama microdetención. Se compara sin tildes ni mayúsculas. */
const ES_MICRO = /micro\s*detenc/i

export interface PasoCascada {
  clave: 'capacidad' | 'detenciones' | 'micro' | 'vacias' | 'producido'
  etiqueta: string
  /** Piezas. Negativo en los pasos de pérdida. */
  piezas: number
  /** Minutos que explican el paso, cuando aplica. */
  minutos?: number
  /** Cuántas veces ocurrió, cuando aplica. */
  veces?: number
}

export interface Cascada {
  pasos: PasoCascada[]
  capacidad: number
  producido: number
  /** Total no producido = capacidad − producido. */
  perdido: number
  /** Lo que se perdió con la línea detenida (detenciones + micro). */
  perdidoParado: number
  /** Lo que se perdió andando, con la silleta vacía. */
  perdidoAndando: number
  /** De cada 100 silletas que pasaron, cuántas iban con pieza. */
  silletasLlenasPor100: number
  ritmoMaquina: number
  minutosEnMarcha: number
  minutosDetenida: number
  /** Hasta qué instante (reloj de planta) describe la cascada. */
  corteWallMs: number | null
}

/** Piezas del último tramo cerrado, y hasta cuándo llega. */
function hastaElUltimoTramo(live: PublicMonitorLive): { piezas: number | null; corteWallMs: number | null } {
  const serie = live.series
  if (!serie || !serie.length) return { piezas: null, corteWallMs: null }
  let acumulado = 0
  for (const punto of serie) acumulado += punto.pieces || 0
  const ultimo = serie[serie.length - 1]
  const ms = ultimo ? Date.parse(ultimo.t) : NaN
  return {
    piezas: acumulado,
    corteWallMs: Number.isFinite(ms) ? ms + 5 * 60_000 : null,
  }
}

/**
 * Arma la cascada. Devuelve null cuando falta algo con lo que no se puede
 * cerrar la cuenta — preferible a dibujar una cascada que no suma.
 *
 * @param ritmoMaquina  pz/min que da la máquina (set point). Sin esto no hay
 *                      capacidad contra la cual medir, y no se inventa.
 */
export function construirCascada({ live, ritmoMaquina }: {
  live: PublicMonitorLive
  ritmoMaquina: number | null | undefined
}): Cascada | null {
  const tb = live.timeBreakdown
  if (!tb || !(ritmoMaquina && ritmoMaquina > 0)) return null

  const enMarcha = Math.max(0, tb.producingMin || 0)
  const detenida = Math.max(0, tb.recoverableMin || 0)
  if (enMarcha <= 0) return null

  const { piezas, corteWallMs } = hastaElUltimoTramo(live)
  const producido = piezas ?? live.shiftPieces ?? live.totalPieces
  if (!(producido > 0)) return null

  /* Las paradas se parten en dos porque se atacan distinto: una detención de 10
     min es un evento con causa, y 11 microdetenciones de 20 segundos son un
     problema de flujo. Sumadas en una sola barra, la segunda desaparece. */
  let minMicro = 0; let vecesMicro = 0
  let minDet = 0; let vecesDet = 0
  for (const causa of tb.recoverable || []) {
    /* `lineMin` son los minutos que además frenaron la LÍNEA entera; `min`, los
       que la causa estuvo activa en alguna máquina. Con varias máquinas los dos
       se separan mucho, y acá manda el de línea: es el único que se traduce a
       piezas que no pasaron por el sensor. */
    const min = Math.max(0, causa.lineMin ?? causa.min ?? 0)
    if (ES_MICRO.test(causa.reason || '')) { minMicro += min; vecesMicro += causa.count || 0 }
    else { minDet += min; vecesDet += causa.count || 0 }
  }
  /* Si el desglose no cubre todos los minutos detenidos, el resto va con las
     detenciones: es preferible atribuirlo a lo genérico que perder minutos y
     que la cascada no cierre. */
  const sinDesglosar = Math.max(0, detenida - minMicro - minDet)
  minDet += sinDesglosar

  const capacidadAndando = enMarcha * ritmoMaquina
  const capacidad = Math.round((enMarcha + detenida) * ritmoMaquina)
  const pzDet = Math.round(minDet * ritmoMaquina)
  const pzMicro = Math.round(minMicro * ritmoMaquina)

  /* El resto por diferencia, NO por su propia fórmula: así la suma cierra al
     entero aunque los redondeos de arriba no acompañen. Si el contador superó
     la capacidad andando —set point mal puesto, o la línea corriendo por sobre
     el nominal— se recorta en 0 en vez de dibujar una pérdida negativa. */
  const pzVacias = Math.max(0, capacidad - pzDet - pzMicro - producido)

  const pasos: PasoCascada[] = [
    { clave: 'capacidad', etiqueta: 'Podía hacer', piezas: capacidad, minutos: Math.round(enMarcha + detenida) },
  ]
  if (pzDet > 0) pasos.push({ clave: 'detenciones', etiqueta: 'Detenciones', piezas: -pzDet, minutos: Math.round(minDet), veces: vecesDet })
  if (pzMicro > 0) pasos.push({ clave: 'micro', etiqueta: 'Microdetenciones', piezas: -pzMicro, minutos: Math.round(minMicro), veces: vecesMicro })
  if (pzVacias > 0) pasos.push({ clave: 'vacias', etiqueta: 'Silletas vacías', piezas: -pzVacias })
  pasos.push({ clave: 'producido', etiqueta: 'Hizo', piezas: producido, minutos: Math.round(enMarcha) })

  return {
    pasos,
    capacidad,
    producido,
    perdido: Math.max(0, capacidad - producido),
    perdidoParado: pzDet + pzMicro,
    perdidoAndando: pzVacias,
    silletasLlenasPor100: capacidadAndando > 0
      ? Math.round((producido / capacidadAndando) * 100)
      : 0,
    ritmoMaquina,
    minutosEnMarcha: Math.round(enMarcha),
    minutosDetenida: Math.round(detenida),
    corteWallMs,
  }
}
