/**
 * Cuánto costó cada parada.
 *
 * ⚠ Lo que se protege acá es que NO se sobreestime. La cifra se le imputa a
 * Mantención —"se perdieron X piezas por esa detención"— y tiene que aguantar
 * que alguien la revise con la serie en la mano.
 *
 * Los números vienen del turno de Filete del 14-08: promedio andando 13,5
 * pz/min, y antes del corte de agua la línea venía a 12,1 con tramos de 8,5.
 */
import { describe, it, expect } from 'vitest'
import { costoDeParadas, ritmosPorTramo } from '../monitorPerdidas'

const T0 = '2026-08-14T07:40:00.000Z'
/** Serie de tramos de 5 min desde T0. */
const serie = (piezas: number[]) =>
  piezas.map((p, i) => ({ t: new Date(Date.parse(T0) + i * 5 * 60_000).toISOString(), pieces: p }))
/** Un evento: minuto de turno en que arranca y cuántos minutos dura. */
const ev = (r: number, minuto: number, dur: number) => ({
  r,
  f: new Date(Date.parse(T0) + minuto * 60_000).toISOString(),
  s: dur * 60,
})

describe('ritmosPorTramo', () => {
  it('mide el ritmo sobre el tiempo ANDANDO, no sobre los 5 min', () => {
    // 30 piezas con 2 min parado son 10 pz/min, no 6.
    const t = ritmosPorTramo(serie([50, 30]), [ev(0, 5, 2)])
    expect(t[1]!.paroMin).toBe(2)
    expect(t[1]!.cpm).toBe(10)
  })

  it('un tramo casi entero parado no da ritmo: sería ruido', () => {
    const t = ritmosPorTramo(serie([50, 3]), [ev(0, 5, 4.5)])
    expect(t[1]!.cpm).toBeNull()
  })
})

describe('costoDeParadas', () => {
  const REASONS = ['AGUA', 'COLACION']
  const base = {
    stopReasons: REASONS,
    recuperables: ['AGUA'],
    cpmGlobal: 13.5,
  }

  it('⚠ valoriza al ritmo LOCAL, no al promedio del turno', () => {
    // Seis tramos limpios a 10 pz/min (50 pz en 5 min) y después una parada de
    // 10 min. Al promedio del turno (13,5) serían 135 pz; a lo que la línea
    // venía dando, 100.
    const r = costoDeParadas({
      ...base,
      series: serie([50, 50, 50, 50, 50, 50, 20]),
      stopEvents: [ev(0, 30, 10)],
    })!
    expect(Math.round(r.totalPiezas)).toBe(100)
    expect(r.porCausa[0]!.cpm).toBe(10)
    expect(r.sinLocal).toBe(0)
  })

  it('usa la MEDIANA: un tramo raro no mueve la cifra', () => {
    // Cinco tramos a 10 y uno disparado a 30: la mediana sigue siendo 10.
    const r = costoDeParadas({
      ...base,
      series: serie([50, 50, 150, 50, 50, 50, 20]),
      stopEvents: [ev(0, 30, 10)],
    })!
    expect(r.porCausa[0]!.cpm).toBe(10)
  })

  it('⚠ los tramos CON parada no entran en la referencia', () => {
    /*
     * El tramo anterior a la parada larga tiene 20 pz porque estuvo 3 min
     * detenido, no porque la línea fuera lenta. Si entrara en la ventana
     * arrastraría la referencia hacia abajo y SUBESTIMARÍA la pérdida — el
     * error opuesto, y también miente.
     */
    const r = costoDeParadas({
      ...base,
      series: serie([50, 50, 50, 50, 50, 20, 20]),
      stopEvents: [ev(0, 25, 3), ev(0, 30, 10)],
    })!
    const agua = r.porCausa[0]!
    expect(agua.cpm).toBe(10)          // la mediana de los tramos limpios
    expect(agua.eventos).toBe(2)
  })

  it('sin tramos limpios cae al promedio del turno, y lo dice', () => {
    // La parada arranca en el minuto 5: no hay 30 min hacia atrás con dato.
    const r = costoDeParadas({
      ...base,
      series: serie([0, 0, 50, 50]),
      stopEvents: [ev(0, 5, 10)],
    })!
    expect(r.porCausa[0]!.cpm).toBe(13.5)
    expect(r.sinLocal).toBe(1)
  })

  it('⚠⚠ el convenio NO se imputa aunque esté en los eventos', () => {
    const r = costoDeParadas({
      ...base,
      series: serie([50, 50, 50, 50, 50, 50, 20]),
      stopEvents: [ev(0, 30, 10), ev(1, 35, 55)],   // AGUA + COLACION
    })!
    expect(r.porCausa).toHaveLength(1)
    expect(r.porCausa[0]!.reason).toBe('AGUA')
    expect(r.eventos).toBe(1)
  })

  it('suma los eventos de una misma causa y ordena por piezas', () => {
    const r = costoDeParadas({
      ...base,
      recuperables: ['AGUA', 'COLACION'],
      series: serie([50, 50, 50, 50, 50, 50, 50, 50, 50]),
      stopEvents: [ev(0, 30, 4), ev(0, 40, 6), ev(1, 35, 20)],
    })!
    expect(r.porCausa[0]!.reason).toBe('COLACION')   // 20 min pesa más
    expect(r.porCausa[1]!.min).toBe(10)              // los dos de AGUA
    expect(r.porCausa[1]!.eventos).toBe(2)
  })

  it('sin datos no inventa un costo', () => {
    expect(costoDeParadas({ ...base, series: [], stopEvents: [] })).toBeNull()
    expect(costoDeParadas({ ...base, series: serie([50]), stopEvents: null })).toBeNull()
    expect(costoDeParadas({ ...base, series: serie([50]), stopEvents: [], cpmGlobal: 0 })).toBeNull()
  })
})

/**
 * Líneas con VARIAS máquinas. Cada evento de `stopEvents` es la parada de una
 * sola máquina, pero el ritmo local sale de `series`, que son las piezas de la
 * LÍNEA entera. Sin dividir, la parada se cobraba una vez por máquina.
 *
 * El caso real: Chonchi eviscerado, turno del 24-08-2026 con 3 Baader 142.
 * Los eventos de "Detencion" sumaban 239 min de máquina y salían valorizados
 * en 10.871 pz — más que las 7.036 que el propio monitor mostraba como brecha
 * total, y con la línea completa detenida solo 67 min.
 */
describe('costoDeParadas · líneas con varias máquinas', () => {
  const REASONS = ['Detencion']
  // 10 tramos de 5 min a 150 pz = 30 pz/min de línea.
  const series10 = serie(Array.from({ length: 10 }, () => 150))
  const args = (maquinas?: number) => ({
    series: series10,
    // Las 3 máquinas paran 10 min a la vez, en el minuto 40.
    stopEvents: [ev(0, 40, 10), ev(0, 40, 10), ev(0, 40, 10)],
    stopReasons: REASONS,
    recuperables: ['Detencion'],
    cpmGlobal: 30,
    maquinas,
  })

  it('no cobra la misma parada una vez por máquina', () => {
    const c = costoDeParadas(args(3))!
    // 10 min de línea a 30 pz/min = 300 pz, no 900.
    expect(Math.round(c.totalPiezas)).toBe(300)
  })

  it('con una sola máquina no cambia nada (Filete)', () => {
    const c = costoDeParadas({ ...args(1), stopEvents: [ev(0, 40, 10)] })!
    expect(Math.round(c.totalPiezas)).toBe(300)
  })

  it('sin el dato de máquinas se comporta como antes (divisor 1)', () => {
    const c = costoDeParadas(args(undefined))!
    expect(Math.round(c.totalPiezas)).toBe(900)
  })

  it('informa el ritmo de LÍNEA, que es el que se muestra al explicar la cifra', () => {
    const c = costoDeParadas(args(3))!
    expect(Math.round(c.porCausa[0]!.cpm)).toBe(30)
  })
})
