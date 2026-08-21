/**
 * Tests de `construirCascada`.
 *
 * El invariante que sostiene todo: **la cascada CIERRA**. Si capacidad menos las
 * pérdidas no da exactamente lo producido, el bloque no sirve para una reunión —
 * el primero que sume las barras encuentra el hueco.
 *
 * Los casos vienen del turno noche de Filete del 20-08, que es el que se usó
 * para diseñarlo: 95 min de ventana, 81 andando, 14 detenidos (4 detenciones de
 * 10 min y 11 microdetenciones de 4 min), máquina a 18 pz/min, 924 piezas.
 */

import { describe, it, expect } from 'vitest'

import { construirCascada } from '../cascadaTurno'
import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'

/** Serie de tramos de 5 min que suma `total` y termina a las `finHHMM`. */
function serie(total: number, finHHMM = '23:05') {
  return [
    { t: '2026-08-20T22:55:00.000Z', pieces: Math.round(total / 2) },
    { t: `2026-08-20T${finHHMM}:00.000Z`, pieces: total - Math.round(total / 2) },
  ]
}

const live = (over: Partial<PublicMonitorLive> = {}): PublicMonitorLive => ({
  totalPieces: 924,
  shiftPieces: 924,
  series: serie(924),
  timeBreakdown: {
    windowMin: 95,
    producingMin: 81,
    plannedMin: 0,
    recoverableMin: 14,
    planned: [],
    recoverable: [
      { reason: 'Detencion', min: 10, count: 4, lineMin: 10 },
      { reason: 'Micro Detencion', min: 4, count: 11, lineMin: 4 },
    ],
  },
  ...over,
} as unknown as PublicMonitorLive)

describe('construirCascada', () => {
  it('cierra exacto: capacidad menos perdidas es lo producido', () => {
    const c = construirCascada({ live: live(), ritmoMaquina: 18 })!
    expect(c).not.toBeNull()
    const suma = c.pasos
      .filter(p => p.clave !== 'producido' && p.clave !== 'capacidad')
      .reduce((a, p) => a + p.piezas, c.capacidad)
    expect(suma).toBe(c.producido)
  })

  it('reparte como en el turno real de Filete', () => {
    const c = construirCascada({ live: live(), ritmoMaquina: 18 })!
    expect(c.capacidad).toBe(1710)      // 95 min x 18
    expect(c.producido).toBe(924)
    expect(c.perdido).toBe(786)
    expect(c.perdidoParado).toBe(252)   // 14 min detenidos x 18
    expect(c.perdidoAndando).toBe(534)  // el resto, andando con la silleta vacia
    // La conclusion que el monitor no podia dar: la mayor parte NO es una falla.
    expect(c.perdidoAndando).toBeGreaterThan(c.perdidoParado)
  })

  it('separa detenciones de microdetenciones, con sus veces', () => {
    const c = construirCascada({ live: live(), ritmoMaquina: 18 })!
    const det = c.pasos.find(p => p.clave === 'detenciones')!
    const micro = c.pasos.find(p => p.clave === 'micro')!
    expect(det.piezas).toBe(-180)
    expect(det.veces).toBe(4)
    expect(micro.piezas).toBe(-72)
    expect(micro.veces).toBe(11)
  })

  it('el tiempo planificado NO cuenta como capacidad perdida', () => {
    // Una colacion de 30 min no puede aparecer como piezas que se dejaron de
    // hacer: nadie puede recuperarla.
    const conColacion = live({
      timeBreakdown: {
        ...live().timeBreakdown!,
        windowMin: 125,
        plannedMin: 30,
        planned: [{ reason: 'Colacion', min: 30, count: 1, lineMin: 30 }],
      },
    })
    const c = construirCascada({ live: conColacion, ritmoMaquina: 18 })!
    expect(c.capacidad).toBe(1710)
    expect(c.pasos.some(p => /colacion/i.test(p.etiqueta))).toBe(false)
  })

  it('usa los minutos de LINEA, no los de maquina', () => {
    // Con tres maquinas, `min` y `lineMin` se separan mucho: en Chonchi KNURO se
    // llevo 98 min de UNA Baader y solo 4 detuvieron la linea. El que se traduce
    // a piezas que no pasaron por el sensor es el de linea.
    const c = construirCascada({
      live: live({
        timeBreakdown: {
          ...live().timeBreakdown!,
          recoverableMin: 4,
          producingMin: 91,
          recoverable: [{ reason: 'KNURO', min: 98, count: 3, lineMin: 4 }],
        },
      }),
      ritmoMaquina: 18,
    })!
    const det = c.pasos.find(p => p.clave === 'detenciones')!
    expect(det.minutos).toBe(4)
  })

  it('los minutos detenidos sin desglosar no se pierden', () => {
    const c = construirCascada({
      live: live({
        timeBreakdown: {
          ...live().timeBreakdown!,
          recoverableMin: 20,       // 6 min mas de los que explican las causas
          producingMin: 75,
        },
      }),
      ritmoMaquina: 18,
    })!
    const det = c.pasos.find(p => p.clave === 'detenciones')!
    expect(det.minutos).toBe(16)    // 10 declarados + 6 sin desglosar
    const suma = c.pasos
      .filter(p => p.clave !== 'producido' && p.clave !== 'capacidad')
      .reduce((a, p) => a + p.piezas, c.capacidad)
    expect(suma).toBe(c.producido)
  })

  // ── Lo que NO debe dibujar ────────────────────────────────────────────────

  it('nunca dibuja una perdida negativa si la linea supero el nominal', () => {
    // Set point mal puesto, o la linea corriendo por sobre el nominal: la resta
    // daria negativa y el grafico mostraria una barra al reves.
    const c = construirCascada({ live: live({ series: serie(2000), totalPieces: 2000 }), ritmoMaquina: 18 })!
    expect(c.perdidoAndando).toBe(0)
    expect(c.pasos.every(p => p.clave === 'capacidad' || p.clave === 'producido' || p.piezas <= 0)).toBe(true)
  })

  it('no arma cascada sin ritmo de maquina', () => {
    expect(construirCascada({ live: live(), ritmoMaquina: null })).toBeNull()
    expect(construirCascada({ live: live(), ritmoMaquina: 0 })).toBeNull()
  })

  it('no arma cascada sin desglose de tiempo', () => {
    expect(construirCascada({ live: live({ timeBreakdown: null }), ritmoMaquina: 18 })).toBeNull()
  })

  it('no arma cascada con el turno recien arrancado', () => {
    const c = construirCascada({
      live: live({ timeBreakdown: { ...live().timeBreakdown!, producingMin: 0 } }),
      ritmoMaquina: 18,
    })
    expect(c).toBeNull()
  })

  // ── El corte ──────────────────────────────────────────────────────────────

  it('declara su propio corte: el fin del ultimo tramo cerrado', () => {
    const c = construirCascada({ live: live(), ritmoMaquina: 18 })!
    // Ultimo tramo marca 23:05, el bucket cierra 5 min despues.
    expect(new Date(c.corteWallMs!).toISOString().slice(11, 16)).toBe('23:10')
    // Y lo producido es el de los TRAMOS, no el contador vivo: si tomara el
    // pulso, la suma no cerraria contra minutos que salen de la rejilla.
    expect(c.producido).toBe(924)
  })

  it('las silletas llenas se miden contra el tiempo ANDANDO', () => {
    const c = construirCascada({ live: live(), ritmoMaquina: 18 })!
    // 81 min x 18 = 1.458 silletas pasaron; 924 iban con pieza.
    expect(c.silletasLlenasPor100).toBe(63)
  })
})
