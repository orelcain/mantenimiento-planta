/**
 * Turno del 25-08 de noche, que arrancó a las 21:25. Al abrir la causa
 * «Detencion» el monitor listaba, como primera parada larga del turno:
 *
 *     21:15:00→21:25:45   10,8 min
 *
 * Diez de esos once minutos son de ANTES de que el turno existiera. Y por eso
 * las 10 paradas listadas sumaban 99,7 min mientras la fila de la causa decía
 * 85: dos cifras para lo mismo a 20 px de distancia, y la de abajo cargándole
 * al turno tiempo que no es suyo.
 *
 * Las otras dos causas del mismo turno sí cuadraban (54 vs 53,5 y 36 vs 35,3):
 * la discrepancia no era de redondeo, era esta parada.
 */
import { describe, it, expect } from 'vitest'
import { agruparEventos } from '../monitorEventos'

const T0 = '2026-08-25T21:25:00.000Z'
const FIN = '2026-08-26T05:10:00.000Z'
const tb = { windowMin: 465, producingMin: 382, plannedMin: 0, recoverableMin: 85, planned: [],
  recoverable: [{ reason: 'Detencion', min: 85, count: 10, lineMin: 67 }] }

/** `f` en la convención wall-clock-as-UTC del doc; `s` en segundos. */
const EVENTOS = [
  { r: 0, f: '2026-08-25T21:15:00.000Z', s: 645 },   // arranca 10 min ANTES del turno
  { r: 0, f: '2026-08-26T01:34:18.000Z', s: 3570 },  // 59,5 min, dentro
]

/** Los 19 eventos de «Detencion» del turno real, del payload publicado. */
const REALES = [
  { r: 0, f: '2026-08-25T21:15:00.000Z', s: 645 },
  { r: 0, f: '2026-08-25T21:15:00.000Z', s: 600 },
  { r: 0, f: '2026-08-25T21:15:00.000Z', s: 615 },
  { r: 0, f: '2026-08-25T23:30:18.153Z', s: 105 },
  { r: 0, f: '2026-08-26T00:16:48.044Z', s: 105 },
  { r: 0, f: '2026-08-26T00:53:33.047Z', s: 225 },
  { r: 0, f: '2026-08-26T01:26:33.068Z', s: 120 },
  { r: 0, f: '2026-08-26T01:34:18.113Z', s: 3570 },
  { r: 0, f: '2026-08-26T01:34:48.103Z', s: 3525 },
  { r: 0, f: '2026-08-26T01:36:03.119Z', s: 3405 },
  { r: 0, f: '2026-08-26T02:36:48.340Z', s: 255 },
  { r: 0, f: '2026-08-26T02:37:18.362Z', s: 285 },
  { r: 0, f: '2026-08-26T02:37:18.369Z', s: 225 },
  { r: 0, f: '2026-08-26T03:28:33.523Z', s: 375 },
  { r: 0, f: '2026-08-26T03:28:48.523Z', s: 300 },
  { r: 0, f: '2026-08-26T03:29:18.523Z', s: 270 },
  { r: 0, f: '2026-08-26T03:42:48.493Z', s: 120 },
  { r: 0, f: '2026-08-26T04:53:18.427Z', s: 402 },
  { r: 0, f: '2026-08-26T04:53:33.427Z', s: 387 },
]

const causa = (g: ReturnType<typeof agruparEventos>) =>
  g.flatMap((x) => x.causas).find((c) => c.reason === 'Detencion')!

describe('paradas recortadas a la ventana del turno', () => {
  it('⚠ la parada que empieza antes del arranque entra solo por lo que cae dentro', () => {
    const c = causa(agruparEventos({
      tb: tb as never, stopEvents: EVENTOS, stopReasons: ['Detencion'],
      t0: T0, ventana: { desdeMs: Date.parse(T0), hastaMs: Date.parse(FIN) },
    }))
    const corta = c.paradas.find((p) => p.hora.startsWith('21:'))!
    expect(corta.min).toBeCloseTo(0.75, 2)
    expect(corta.hora).toBe('21:25:00')   // no 21:15:00
  })

  it('⚠ el turno REAL: la lista pasa de 99,7 a 89,7 min y se acerca a los 85 de la fila', () => {
    /*
     * Los 19 `stopEvents` de «Detencion» del turno del 25-08 tal como los
     * publicó el backend. Se funden en 10 episodios (tres máquinas paradas a la
     * vez cuentan una sola vez), y la fila declara `min: 85`.
     *
     * Antes: 99,7 min listados contra 85 declarados — 14,7 de descuadre.
     * Después del recorte: 89,7. Lo que queda es otra consolidación del
     * backend (`lineMin: 67` es una tercera vara), pero los 10,8 minutos de
     * una parada de ANTES del turno ya no se le cargan a este turno.
     */
    const args = {
      tb: tb as never, stopEvents: REALES, stopReasons: ['Detencion'], t0: T0,
    }
    const sinRecorte = causa(agruparEventos(args))
      .paradas.reduce((a, p) => a + p.min, 0)
    const conRecorte = causa(agruparEventos({
      ...args, ventana: { desdeMs: Date.parse(T0), hastaMs: Date.parse(FIN) },
    })).paradas.reduce((a, p) => a + p.min, 0)

    expect(sinRecorte).toBeCloseTo(99.7, 1)
    expect(conRecorte).toBeCloseTo(89.7, 1)
    expect(Math.abs(85 - conRecorte)).toBeLessThan(Math.abs(85 - sinRecorte))
  })

  it('sin recortar, la de las 21:15 aportaba 10,75 min que no son del turno', () => {
    const c = causa(agruparEventos({
      tb: tb as never, stopEvents: EVENTOS, stopReasons: ['Detencion'], t0: T0,
    }))
    expect(c.paradas.reduce((a, p) => a + p.min, 0)).toBeCloseTo(70.25, 2)
  })

  it('una parada enteramente anterior al turno no se lista', () => {
    const c = agruparEventos({
      tb: tb as never,
      stopEvents: [{ r: 0, f: '2026-08-25T20:00:00.000Z', s: 600 }, EVENTOS[1]!],
      stopReasons: ['Detencion'], t0: T0,
      ventana: { desdeMs: Date.parse(T0), hastaMs: Date.parse(FIN) },
    })
    expect(causa(c).paradas).toHaveLength(1)
  })

  it('la que sigue corriendo al cierre se corta en el cierre', () => {
    const c = causa(agruparEventos({
      tb: tb as never,
      stopEvents: [{ r: 0, f: '2026-08-26T05:05:00.000Z', s: 1800 }],
      stopReasons: ['Detencion'], t0: T0,
      ventana: { desdeMs: Date.parse(T0), hastaMs: Date.parse(FIN) },
    }))
    expect(c.paradas[0]!.min).toBeCloseTo(5, 2)
    expect(c.paradas[0]!.hasta).toBe('05:10:00')
  })

  it('sin ventana se comporta como antes — nada se recorta', () => {
    const c = causa(agruparEventos({
      tb: tb as never, stopEvents: EVENTOS, stopReasons: ['Detencion'], t0: T0,
      ventana: { desdeMs: null, hastaMs: null },
    }))
    expect(c.paradas.reduce((a, p) => a + p.min, 0)).toBeCloseTo(70.25, 2)
  })
})
