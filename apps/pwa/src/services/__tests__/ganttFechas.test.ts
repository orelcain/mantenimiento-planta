/**
 * Lo que rompio el Gantt: el payload pasaba por `stripUndefinedDeep`, que
 * reconstruia CADA objeto campo por campo. Un `Timestamp` quedaba como
 * `{seconds, nanoseconds}` y `serverTimestamp()` como
 * `{_methodName: 'serverTimestamp'}`, asi que Firestore guardaba mapas planos
 * en vez de fechas. Al leerlos, `asDate` no los entendia y devolvia `new Date()`:
 * 604 de 609 tareas se dibujaban HOY.
 */
import { describe, it, expect } from 'vitest'
import { asDate, stripUndefinedDeep } from '../gantt'

/** Imita un Timestamp del SDK: campos publicos `seconds`/`nanoseconds` + toDate(). */
class TimestampFalso {
  constructor(public seconds: number, public nanoseconds: number) {}
  toDate() { return new Date(this.seconds * 1000 + this.nanoseconds / 1e6) }
}

describe('stripUndefinedDeep', () => {
  it('no desarma un Timestamp: lo deja como estaba', () => {
    const ts = new TimestampFalso(1771001915, 757000000)
    const out = stripUndefinedDeep({ startDate: ts })
    expect(out.startDate).toBe(ts)
    expect(out.startDate).toBeInstanceOf(TimestampFalso)
  })

  it('no convierte un Date en {}', () => {
    const d = new Date('2026-02-13T09:00:00Z')
    const out = stripUndefinedDeep({ cuando: d })
    expect(out.cuando).toBe(d)
  })

  it('sigue sacando los undefined y recorriendo objetos y arrays literales', () => {
    const out = stripUndefinedDeep({
      a: 1,
      b: undefined,
      anidado: { c: undefined, d: 'x' },
      lista: [{ e: undefined, f: 2 }],
    })
    expect(out).toEqual({ a: 1, anidado: { d: 'x' }, lista: [{ f: 2 }] })
  })
})

describe('asDate', () => {
  it('entiende un Timestamp que quedo guardado como mapa plano', () => {
    // El valor real de una de las 604 tareas rotas.
    expect(asDate({ seconds: 1771001915, nanoseconds: 757000000 }).toISOString())
      .toBe('2026-02-13T16:58:35.757Z')
  })

  it('entiende tambien la forma del admin SDK', () => {
    expect(asDate({ _seconds: 1771001915, _nanoseconds: 0 }).toISOString())
      .toBe('2026-02-13T16:58:35.000Z')
  })

  it('un Timestamp de verdad y un ISO siguen funcionando', () => {
    expect(asDate(new TimestampFalso(1771001915, 0)).getTime()).toBe(1771001915000)
    expect(asDate('2026-02-13T16:58:35.000Z').getTime()).toBe(1771001915000)
  })
})
