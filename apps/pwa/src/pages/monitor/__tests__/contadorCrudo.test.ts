/**
 * Tests de `contadorCrudo`: qué número va grande en el monitor.
 *
 * El valor de estos tests está en los casos que YA pasaron en producción, no en
 * el camino feliz:
 *   · el contador vivo devolviendo 0 con la línea produciendo (19-08, Chonchi
 *     y Filete)
 *   · el contador vivo congelado mientras los buckets seguían llegando
 *   · producción fuera del horario del turno, que el crudo de Shoplogix no
 *     cuenta y el derivado sí
 *   · las dos horas en bases distintas (UTC real vs wall-clock de planta)
 */

import { describe, it, expect } from 'vitest'

import { elegirContador, aWallClockMs, corteDeBuckets, pulsoVivo } from '../contadorCrudo'
import type { PublicMonitorLive, PulsoMonitor } from '@/services/shoplogix/publicShiftMonitor.service'

/** Serie en wall-clock de planta, como la manda el backend. */
const serie = (ultimoHHMM: string) => [
  { t: `2026-08-20T${ultimoHHMM}:00.000Z`, pieces: 60 },
]

const live = (over: Partial<PublicMonitorLive> = {}): PublicMonitorLive => ({
  totalPieces: 805,
  shiftPieces: 805,
  outsidePieces: 0,
  series: serie('22:55'),
  shiftClosed: false,
  ...over,
} as unknown as PublicMonitorLive)

const pulso = (over: Partial<PulsoMonitor> = {}): PulsoMonitor => ({
  // 22:56 hora de planta = 02:56 UTC del día siguiente (Chile en UTC-4).
  at: '2026-08-21T02:56:00.000Z',
  totalCycles: 805,
  cpm: 11,
  ...over,
})

describe('aWallClockMs', () => {
  it('lleva un instante UTC real al reloj de planta', () => {
    const ms = aWallClockMs('2026-08-21T02:56:00.000Z')
    expect(new Date(ms!).toISOString().slice(11, 16)).toBe('22:56')
  })

  it('devuelve null si la fecha no se puede leer', () => {
    expect(aWallClockMs('cualquier cosa')).toBeNull()
  })
})

describe('corteDeBuckets', () => {
  it('el bucket cierra 5 min despues de su marca', () => {
    const ms = corteDeBuckets({ series: serie('22:55') } as PublicMonitorLive)
    expect(new Date(ms!).toISOString().slice(11, 16)).toBe('23:00')
  })

  it('sin serie no hay corte', () => {
    expect(corteDeBuckets({ series: [] } as unknown as PublicMonitorLive)).toBeNull()
  })
})

describe('pulsoVivo', () => {
  // El caso que Orel cazo en vivo (29-08): con el pulso mudo por una
  // discontinuidad del contador, la tarjeta caia a la media de 15 min y decia
  // 33 pz/min mientras la linea goteaba a 12.
  it('con cpm fresco, el vivo es el cpm y no esta recalibrando', () => {
    const v = pulsoVivo(pulso({ cpm: 12.3, porMaquina: [{ id: 'a', cpm: 12.3 }] }))
    expect(v).toEqual({ cpm: 12.3, at: '2026-08-21T02:56:00.000Z', porMaquina: [{ id: 'a', cpm: 12.3 }], recalibrando: false })
  })

  it('un cpm de CERO es un vivo valido — la linea detenida es informacion', () => {
    expect(pulsoVivo(pulso({ cpm: 0 }))?.cpm).toBe(0)
  })

  it('con el cpm mudo usa el arrastrado, con SU hora y marcado recalibrando', () => {
    const v = pulsoVivo(pulso({
      cpm: null,
      vivoPrevio: { cpm: 12, at: '2026-08-21T02:53:00.000Z', porMaquina: [{ id: 'a', cpm: 12 }] },
    }))
    expect(v).toEqual({ cpm: 12, at: '2026-08-21T02:53:00.000Z', porMaquina: [{ id: 'a', cpm: 12 }], recalibrando: true })
  })

  it('un arrastrado de hace mas de 6 min ya no es «ahora» — null, que caiga a la media', () => {
    const v = pulsoVivo(pulso({
      cpm: null,
      vivoPrevio: { cpm: 12, at: '2026-08-21T02:49:00.000Z' },
    }))
    expect(v).toBeNull()
  })

  it('sin pulso ni arrastrado no inventa nada', () => {
    expect(pulsoVivo(null)).toBeNull()
    expect(pulsoVivo(pulso({ cpm: null }))).toBeNull()
  })
})

describe('elegirContador', () => {
  it('manda el crudo de Shoplogix cuando esta vivo', () => {
    const r = elegirContador({ pulse: pulso(), live: live() })
    expect(r.fuente).toBe('pulso')
    expect(r.valor).toBe(805)
    expect(r.motivoFallback).toBeNull()
    // Y la hora de corte es la del pulso, en reloj de planta.
    expect(new Date(r.corteWallMs!).toISOString().slice(11, 16)).toBe('22:56')
  })

  it('NO compara las dos horas sin convertir la base', () => {
    // Este es el bug que se evitó: crudo a las 22:56 de planta (02:56Z) contra
    // buckets hasta las 23:00 de planta. Comparar los ISO en crudo daría 4 h de
    // diferencia y mandaría siempre al derivado.
    const r = elegirContador({ pulse: pulso(), live: live() })
    expect(r.fuente).toBe('pulso')
  })

  it('cae al derivado cuando el contador vivo devuelve 0 con la linea produciendo', () => {
    // Caso real del 2026-08-19 en Chonchi y Filete.
    const r = elegirContador({ pulse: pulso({ totalCycles: 0 }), live: live() })
    expect(r.fuente).toBe('buckets')
    expect(r.valor).toBe(805)
    expect(r.motivoFallback).toMatch(/no está respondiendo/)
  })

  it('cae al derivado cuando no hay pulso', () => {
    expect(elegirContador({ pulse: null, live: live() }).fuente).toBe('buckets')
    expect(elegirContador({ pulse: undefined, live: live() }).motivoFallback).toBeTruthy()
  })

  it('cae al derivado cuando el contador vivo quedo congelado', () => {
    // Pulso de las 21:00 de planta (01:00Z) contra buckets hasta las 23:00.
    const r = elegirContador({
      pulse: pulso({ at: '2026-08-21T01:00:00.000Z' }),
      live: live(),
    })
    expect(r.fuente).toBe('buckets')
    expect(r.motivoFallback).toMatch(/quedó atrás/)
  })

  it('aguanta un desfase chico sin cambiar de fuente', () => {
    // 4 min de atraso es normal: el bucket cierra despues que la lectura viva.
    const r = elegirContador({
      pulse: pulso({ at: '2026-08-21T02:56:00.000Z' }),
      live: live({ series: serie('22:55') }),
    })
    expect(r.fuente).toBe('pulso')
  })

  it('con el turno cerrado manda el total final, sin motivo de falla', () => {
    const r = elegirContador({ pulse: pulso(), live: live(), shiftClosed: true })
    expect(r.fuente).toBe('buckets')
    expect(r.motivoFallback).toBeNull()
  })

  // ── Lo que el crudo NO cuenta ─────────────────────────────────────────────

  it('las piezas de fuera del horario salen aparte, nunca sumadas al crudo', () => {
    const r = elegirContador({
      pulse: pulso({ totalCycles: 805 }),
      live: live({ totalPieces: 950, shiftPieces: 805, outsidePieces: 145 }),
    })
    expect(r.fuente).toBe('pulso')
    expect(r.valor).toBe(805)
    expect(r.fueraDelHorario).toBe(145)
    // La suma sigue cuadrando con lo que la gente contó en la línea.
    expect(r.valor + r.fueraDelHorario).toBe(950)
  })

  it('con el derivado no se desglosa: ese numero ya las incluye', () => {
    const r = elegirContador({
      pulse: null,
      live: live({ totalPieces: 950, shiftPieces: 805, outsidePieces: 145 }),
    })
    expect(r.valor).toBe(950)
    expect(r.fueraDelHorario).toBe(0)
  })
})
