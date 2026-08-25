/**
 * Caso real: de las 23 secciones de `baader200-sections`, **14 tienen
 * `updatedAt` como Timestamp y 9 como número** (epoch en ms). El parser hacía
 * `data.updatedAt?.toDate()`, que con un número tira
 * `TypeError: toDate is not a function`. La carga entera fallaba y la pantalla
 * de la Baader 200 se quedaba en "Selecciona una sección del menú" con las 23
 * secciones invisibles.
 */
import { describe, it, expect } from 'vitest'
import { aFechaSegura } from '../fechaFirestore'

class TimestampFalso {
  constructor(public seconds: number, public nanoseconds: number) {}
  toDate() { return new Date(this.seconds * 1000 + this.nanoseconds / 1e6) }
}

describe('aFechaSegura', () => {
  it('lee un Timestamp', () => {
    expect(aFechaSegura(new TimestampFalso(1775605191, 2_000_000))!.toISOString())
      .toBe('2026-04-07T23:39:51.002Z')
  })

  it('lee un número de milisegundos — el tipo que tumbaba la pantalla', () => {
    expect(aFechaSegura(1775605191002)!.toISOString()).toBe('2026-04-07T23:39:51.002Z')
  })

  it('lee el mapa plano en que se convierte un Timestamp mal guardado', () => {
    expect(aFechaSegura({ seconds: 1775605191, nanoseconds: 2_000_000 })!.toISOString())
      .toBe('2026-04-07T23:39:51.002Z')
    expect(aFechaSegura({ _seconds: 1775605191, _nanoseconds: 0 })!.toISOString())
      .toBe('2026-04-07T23:39:51.000Z')
  })

  it('lee un ISO y un Date', () => {
    expect(aFechaSegura('2026-04-07T23:39:51.000Z')!.getTime()).toBe(1775605191000)
    const d = new Date(1775605191000)
    expect(aFechaSegura(d)).toBe(d)
  })

  it('devuelve undefined en vez de inventar, con lo que no entiende', () => {
    expect(aFechaSegura(null)).toBeUndefined()
    expect(aFechaSegura(undefined)).toBeUndefined()
    expect(aFechaSegura({ _methodName: 'serverTimestamp' })).toBeUndefined()
    expect(aFechaSegura('no soy una fecha')).toBeUndefined()
    expect(aFechaSegura(new Date('x'))).toBeUndefined()
  })

  it('una sola sección con el tipo raro no tumba a las demás', () => {
    const docs = [
      { updatedAt: new TimestampFalso(1775605191, 0) },
      { updatedAt: 1775605191002 },
      { updatedAt: { _methodName: 'serverTimestamp' } },
    ]
    const leidas = docs.map((d) => aFechaSegura(d.updatedAt) ?? null)
    expect(leidas.filter(Boolean)).toHaveLength(2)
    expect(() => docs.map((d) => aFechaSegura(d.updatedAt))).not.toThrow()
  })
})
