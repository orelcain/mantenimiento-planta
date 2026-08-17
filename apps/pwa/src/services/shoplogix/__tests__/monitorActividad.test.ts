/**
 * El recorte del eje al tramo con actividad real.
 *
 * El caso que lo motivó: Filete, madrugada del 17-08-2026. Turno sin definir
 * en Shoplogix → ventana de 06:00 a ahora (16 h) para 1 h de producción.
 */
import { describe, it, expect } from 'vitest'
import { ventanaDeActividad, horaDelMinuto, desdePrimeraPieza, piezasAntesDelArranque, type PuntoSerie } from '../monitorActividad'

/** Serie de `n` tramos vacíos; `pone` marca piezas en índices concretos. */
const serie = (n: number, pone: Record<number, number> = {}): PuntoSerie[] =>
  Array.from({ length: n }, (_, i) => ({
    t: new Date(Date.UTC(2026, 7, 16, 6, i * 5)).toISOString(),
    pieces: pone[i] ?? 0,
  }))

describe('ventanaDeActividad', () => {
  it('recorta el vacío de los extremos y deja un respiro a cada lado', () => {
    // 24 tramos (2 h); solo produce en los tramos 12 y 13 (60–70 min).
    const v = ventanaDeActividad(serie(24, { 12: 40, 13: 55 }))
    expect(v).not.toBeNull()
    expect(v!.desdeMin).toBe(55)      // 60 − un paso
    expect(v!.hastaMin).toBe(75)      // fin del tramo 13 (70) + un paso
  })

  it('⚠ el caso Filete: 16 h de ventana para 1 h de producción', () => {
    // 192 tramos = 16 h. Produce solo en la última hora (tramos 180 a 191).
    const pone: Record<number, number> = {}
    for (let i = 180; i < 192; i++) pone[i] = 50
    const v = ventanaDeActividad(serie(192, pone))
    expect(v!.desdeMin).toBe(895)     // 180×5 − 5
    expect(v!.hastaMin).toBe(960)     // tope del dominio, no se pasa
    // Lo que se gana: de 960 min de eje a 65.
    expect(v!.hastaMin - v!.desdeMin).toBe(65)
    expect(v!.recortadoMin).toBe(895)
  })

  it('un pico aislado al principio NO se esconde: manda el primer tramo con piezas', () => {
    // 3 pz a las 21:45 y el grueso 2,5 h después — el caso real de Filete.
    const pone: Record<number, number> = { 10: 3 }
    for (let i = 40; i < 46; i++) pone[i] = 60
    const v = ventanaDeActividad(serie(60, pone))
    expect(v!.desdeMin).toBe(45)      // arranca en el pico, no en el grueso
    // El hueco de en medio queda DENTRO de la ventana: la línea estuvo parada
    // y eso se tiene que ver.
    expect(v!.hastaMin).toBe(235)
  })

  it('devuelve null cuando no hay casi nada que recortar', () => {
    // Produce de punta a punta: recortar movería el eje sin ganar nada.
    const pone: Record<number, number> = {}
    for (let i = 0; i < 96; i++) pone[i] = 50
    expect(ventanaDeActividad(serie(96, pone))).toBeNull()
  })

  it('no recorta por unos pocos minutos de vacío', () => {
    // 8 h de turno con los primeros 15 min sin piezas: por debajo del umbral.
    const pone: Record<number, number> = {}
    for (let i = 3; i < 96; i++) pone[i] = 50
    expect(ventanaDeActividad(serie(96, pone))).toBeNull()
    // Con el umbral bajado a mano sí recorta: el umbral es política, no dato.
    expect(ventanaDeActividad(serie(96, pone), { minRecorteMin: 5 })).not.toBeNull()
  })

  it('un turno sin una sola pieza no se recorta', () => {
    expect(ventanaDeActividad(serie(96))).toBeNull()
  })

  it('serie vacía o ausente no rompe', () => {
    expect(ventanaDeActividad([])).toBeNull()
    expect(ventanaDeActividad(null)).toBeNull()
    expect(ventanaDeActividad(undefined)).toBeNull()
  })
})

describe('horaDelMinuto', () => {
  const fmt = (iso: string) => iso.slice(11, 16)

  it('traduce un minuto de turno a la hora de ese tramo', () => {
    const s = serie(24)
    expect(horaDelMinuto(s, 0, fmt)).toBe('06:00')
    expect(horaDelMinuto(s, 60, fmt)).toBe('07:00')
  })

  it('un minuto fuera de rango se pega al borde en vez de devolver basura', () => {
    const s = serie(24)
    expect(horaDelMinuto(s, -50, fmt)).toBe('06:00')
    expect(horaDelMinuto(s, 99_999, fmt)).toBe('07:55')
  })

  it('sin serie devuelve null', () => {
    expect(horaDelMinuto([], 10, fmt)).toBeNull()
  })
})

describe('desdePrimeraPieza', () => {
  it('corta los tramos vacíos del principio', () => {
    const s = serie(10, { 4: 20, 5: 30 })
    const r = desdePrimeraPieza(s)
    expect(r).toHaveLength(6)
    expect(r[0]!.pieces).toBe(20)
  })

  it('conserva la COLA vacía: el backend la agrega para que se vea el último paro', () => {
    const s = serie(10, { 2: 15 })
    expect(desdePrimeraPieza(s)).toHaveLength(8)
  })

  it('un turno sin una sola pieza se devuelve entero, no vacío', () => {
    // Un turno que no produjo sigue siendo un turno y su gráfico plano informa.
    expect(desdePrimeraPieza(serie(6))).toHaveLength(6)
  })

  it('si ya arranca con piezas no cambia nada', () => {
    const s = serie(4, { 0: 10 })
    expect(desdePrimeraPieza(s)).toHaveLength(4)
  })

  it('serie vacía o ausente devuelve lista vacía, no revienta', () => {
    expect(desdePrimeraPieza([])).toEqual([])
    expect(desdePrimeraPieza(null)).toEqual([])
    expect(desdePrimeraPieza(undefined)).toEqual([])
  })
})

/*
 * ⚠⚠ EL CASO REAL: Filete, madrugada del 17-08-2026. La línea pasó 3 piezas a
 * las 21:45 y arrancó en serio a las 00:20. Tomar el pico como origen metía
 * 2 h 35 min de nada en el turno y hundía el «tiempo produciendo» al 43 %.
 */
describe('desdePrimeraPieza · un pico suelto no es el arranque', () => {
  it('salta el pico aislado y arranca en la racha productiva', () => {
    // tramo 0: 3 pz (la prueba) · nada hasta el tramo 31 (2 h 35 min después)
    const s = serie(60, { 0: 3, 31: 60, 32: 55, 33: 70 })
    const r = desdePrimeraPieza(s)
    expect(r).toHaveLength(29)          // 60 − 31
    expect(r[0]!.pieces).toBe(60)
  })

  it('las piezas de la prueba no se pierden: se pueden contar aparte', () => {
    const s = serie(60, { 0: 3, 31: 60 })
    expect(piezasAntesDelArranque(s)).toBe(3)
  })

  it('un hueco corto NO parte el turno: es una detención normal', () => {
    // 25 min sin piezas en medio de la producción: eso es un paro, no un pico.
    const s = serie(20, { 0: 40, 1: 50, 7: 45, 8: 60 })
    expect(desdePrimeraPieza(s)).toHaveLength(20)
    expect(piezasAntesDelArranque(s)).toBe(0)
  })

  it('varios picos seguidos: arranca después del último hueco largo', () => {
    const s = serie(80, { 0: 5, 20: 4, 60: 70, 61: 65 })
    const r = desdePrimeraPieza(s)
    expect(r).toHaveLength(20)          // 80 − 60
    expect(piezasAntesDelArranque(s)).toBe(9)
  })
})
