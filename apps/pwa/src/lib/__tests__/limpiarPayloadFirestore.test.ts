/**
 * El mismo bug, tres veces: un "stripUndefined" que reconstruye CUALQUIER
 * objeto convierte los Timestamp y los sentinels de Firestore en mapas planos,
 * y el documento termina fechado hoy para siempre.
 *
 * Pasó en el Gantt (604 de 609 tareas) y en Evidencias Fotográficas: la única
 * evidencia, creada el 09-01-2026, se mostraba como de hoy porque `createdAt`
 * quedó guardado como `{_methodName:'serverTimestamp'}`.
 */
import { describe, it, expect } from 'vitest'
import { quitarUndefined, esObjetoLiteral, fechaDesdeId } from '../limpiarPayloadFirestore'

class TimestampFalso {
  constructor(public seconds: number, public nanoseconds: number) {}
  toDate() { return new Date(this.seconds * 1000) }
}
class SentinelFalso {
  _methodName = 'serverTimestamp'
}

describe('quitarUndefined', () => {
  it('deja intacto un Timestamp', () => {
    const ts = new TimestampFalso(1767980073, 0)
    expect(quitarUndefined({ createdAt: ts }).createdAt).toBe(ts)
  })

  it('deja intacto el sentinel de serverTimestamp', () => {
    const sentinel = new SentinelFalso()
    expect(quitarUndefined({ createdAt: sentinel }).createdAt).toBe(sentinel)
  })

  it('no convierte un Date en {}', () => {
    const d = new Date('2026-01-09T17:34:33Z')
    expect(quitarUndefined({ f: d }).f).toBe(d)
  })

  it('sigue sacando undefined en objetos y arrays literales', () => {
    expect(quitarUndefined({ a: 1, b: undefined, c: { d: undefined, e: 2 }, l: [{ f: undefined, g: 3 }] }))
      .toEqual({ a: 1, c: { e: 2 }, l: [{ g: 3 }] })
  })
})

describe('esObjetoLiteral', () => {
  it('distingue un objeto literal de una instancia', () => {
    expect(esObjetoLiteral({})).toBe(true)
    expect(esObjetoLiteral(Object.create(null))).toBe(true)
    expect(esObjetoLiteral(new TimestampFalso(1, 0))).toBe(false)
    expect(esObjetoLiteral(new Date())).toBe(false)
    expect(esObjetoLiteral([])).toBe(false)
    expect(esObjetoLiteral(null)).toBe(false)
  })
})

describe('fechaDesdeId', () => {
  it('rescata el instante real del id de la evidencia rota', () => {
    // Id real: la evidencia "Pintura", creada el 09-01-2026.
    expect(fechaDesdeId('1767980073991-88piw3a')!.toISOString()).toBe('2026-01-09T17:34:33.991Z')
  })

  it('acepta el id sin sufijo', () => {
    expect(fechaDesdeId('1767980073991')!.getTime()).toBe(1767980073991)
  })

  it('ignora ids que no traen fecha', () => {
    expect(fechaDesdeId('abc123')).toBeUndefined()
    expect(fechaDesdeId('0573MwTm6Lt6QIInv0Sa')).toBeUndefined()
    expect(fechaDesdeId('9999999999999-x')).toBeUndefined() // año 2286
  })
})
