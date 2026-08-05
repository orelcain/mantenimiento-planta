/**
 * Tests de la ventana real del turno.
 *
 * Los casos NO son inventados: salen de leer los docs de producción el
 * 2026-08-05 (`shoplogix/{planta}/shifts`). Cada uno lleva su origen en el
 * nombre para que se pueda volver a comprobar contra Firestore.
 */
import { describe, it, expect } from 'vitest'
import { resolveShiftWindow, formatGapMinutes } from '../graderShiftWindow'

/** Los timestamps del sync son wall-clock-as-UTC: se construyen con Z. */
const w = (s: string) => new Date(`${s}.000Z`)

describe('resolveShiftWindow · casos reales de producción', () => {
  it('chonchi 2026-08-05_Turno 2 — el turno de HOY, recortado por el borde', () => {
    // Firestore: scheduled 08:00→09:55 · official 07:15→15:00.
    const r = resolveShiftWindow({
      declaredStart: w('2026-08-05T07:15:00'), declaredEnd: w('2026-08-05T15:00:00'),
      observedStart: w('2026-08-05T08:00:00'), observedEnd: w('2026-08-05T09:55:00'),
    })
    expect(r.observedClipped).toBe(true)
    expect(r.origin).toBe('declarado')
    expect(r.start).toEqual(w('2026-08-05T07:15:00'))
    expect(r.end).toEqual(w('2026-08-05T15:00:00'))
    // 07:15 → 08:00 es producción real de la que NO hay datos.
    expect(r.missingHeadMin).toBe(45)
    // No es "arranque anticipado": es una ventana de consulta que llegó tarde.
    expect(r.earlyStartMin).toBe(0)
  })

  it('chonchi 2026-08-04_Turno 2 — el de AYER, que absorbió el arranque de hoy', () => {
    // Firestore: scheduled 04-ago 08:00 → 05-ago 08:00 (24 h) · official 07:15→15:00.
    const r = resolveShiftWindow({
      declaredStart: w('2026-08-04T07:15:00'), declaredEnd: w('2026-08-04T15:00:00'),
      observedStart: w('2026-08-04T08:00:00'), observedEnd: w('2026-08-05T08:00:00'),
    })
    // Una ventana de 24 h no es un turno: se descarta entera.
    expect(r.observedClipped).toBe(true)
    expect(r.start).toEqual(w('2026-08-04T07:15:00'))
    expect(r.end).toEqual(w('2026-08-04T15:00:00'))
    expect(r.origin).toBe('declarado')
  })

  it('yal 2026-08-02_Turno 2 — arranque anticipado REAL de 2 h 15', () => {
    // Firestore: scheduled 14:00→00:00 · official 16:15→00:00. Acá lo observado
    // es MÁS cierto que lo declarado, y por eso no se puede preferir el oficial.
    const r = resolveShiftWindow({
      declaredStart: w('2026-08-02T16:15:00'), declaredEnd: w('2026-08-03T00:00:00'),
      observedStart: w('2026-08-02T14:00:00'), observedEnd: w('2026-08-03T00:00:00'),
    })
    expect(r.observedClipped).toBe(false)
    // Manda lo observado: es lo que de verdad pasó. Unir con lo declarado
    // habría dado 14:00→00:00 igual acá, pero infla la ventana en el caso
    // normal (produjo 09:05-17:02 dentro de un turno declarado 09:00-17:15).
    expect(r.origin).toBe('observado')
    expect(r.start).toEqual(w('2026-08-02T14:00:00'))
    expect(r.end).toEqual(w('2026-08-03T00:00:00'))
    expect(r.earlyStartMin).toBe(135)
    expect(r.missingHeadMin).toBe(0)                     // sí hay datos de esos 135 min
  })

  it('filete 2026-07-29_Turno Dia — 30 min de arranque sin datos', () => {
    // Firestore: scheduled 08:00→08:00 · official 07:30→15:45.
    const r = resolveShiftWindow({
      declaredStart: w('2026-07-29T07:30:00'), declaredEnd: w('2026-07-29T15:45:00'),
      observedStart: w('2026-07-29T08:00:00'), observedEnd: w('2026-07-30T08:00:00'),
    })
    expect(r.start).toEqual(w('2026-07-29T07:30:00'))
    expect(r.missingHeadMin).toBe(30)
  })

  it('yal 2026-08-04_Turno 1 — el mismo patrón con 15 min', () => {
    const r = resolveShiftWindow({
      declaredStart: w('2026-08-04T07:45:00'), declaredEnd: w('2026-08-04T15:00:00'),
      observedStart: w('2026-08-04T08:00:00'), observedEnd: w('2026-08-05T08:00:00'),
    })
    expect(r.missingHeadMin).toBe(15)
    expect(r.start).toEqual(w('2026-08-04T07:45:00'))
  })

  it('chonchi 2026-08-04_Turno 1 — nocturno sano: no se toca', () => {
    // Firestore: scheduled 21:15→05:00 · official 21:15→05:00. Cruza medianoche
    // pero no toca el ancla de las 08:00.
    const r = resolveShiftWindow({
      declaredStart: w('2026-08-04T21:15:00'), declaredEnd: w('2026-08-05T05:00:00'),
      observedStart: w('2026-08-04T21:15:00'), observedEnd: w('2026-08-05T05:00:00'),
    })
    expect(r.observedClipped).toBe(false)
    expect(r.origin).toBe('observado')
    expect(r.earlyStartMin).toBe(0)
    expect(r.missingHeadMin).toBe(0)
  })
})

describe('resolveShiftWindow · lo que NO puede hacer', () => {
  it('un turno que arranca a las 08:00 EN SERIO no se marca como recortado', () => {
    // Sin un declarado anterior no hay razón para sospechar del borde.
    const r = resolveShiftWindow({
      declaredStart: w('2026-08-04T08:00:00'), declaredEnd: w('2026-08-04T16:00:00'),
      observedStart: w('2026-08-04T08:00:00'), observedEnd: w('2026-08-04T16:00:00'),
    })
    expect(r.observedClipped).toBe(false)
    expect(r.missingHeadMin).toBe(0)
    expect(r.start).toEqual(w('2026-08-04T08:00:00'))
  })

  it('sin datos de Shoplogix cae al horario configurado y lo dice', () => {
    const r = resolveShiftWindow({
      scheduleStart: w('2026-08-05T09:00:00'), scheduleEnd: w('2026-08-05T17:15:00'),
    })
    expect(r.origin).toBe('schedule')
    expect(r.start).toEqual(w('2026-08-05T09:00:00'))
  })

  it('sin nada devuelve nulo, no una ventana inventada', () => {
    const r = resolveShiftWindow({})
    expect(r.start).toBeNull()
    expect(r.origin).toBe('ninguna')
  })

  it('el horario configurado NUNCA le gana a Shoplogix', () => {
    // El caso que motivó todo: plantLines decía 09:00-17:15 y ganaba en turno
    // vivo, tapando el 07:15-15:00 que Shoplogix reportaba.
    const r = resolveShiftWindow({
      declaredStart: w('2026-08-05T07:15:00'), declaredEnd: w('2026-08-05T15:00:00'),
      observedStart: w('2026-08-05T08:00:00'), observedEnd: w('2026-08-05T09:55:00'),
      scheduleStart: w('2026-08-05T09:00:00'), scheduleEnd: w('2026-08-05T17:15:00'),
    })
    expect(r.start).toEqual(w('2026-08-05T07:15:00'))
    expect(r.end).not.toEqual(w('2026-08-05T17:15:00'))
  })

  it('ignora timestamps placeholder (epoch) en vez de tomarlos por fecha', () => {
    const r = resolveShiftWindow({
      declaredStart: new Date(0), declaredEnd: new Date(1000),
      observedStart: w('2026-08-05T08:00:00'), observedEnd: w('2026-08-05T15:00:00'),
    })
    expect(r.origin).toBe('observado')
    expect(r.start).toEqual(w('2026-08-05T08:00:00'))
  })

  it('descarta una ventana invertida en vez de propagarla', () => {
    const r = resolveShiftWindow({
      declaredStart: w('2026-08-05T15:00:00'), declaredEnd: w('2026-08-05T07:15:00'),
      observedStart: w('2026-08-05T08:00:00'), observedEnd: w('2026-08-05T15:00:00'),
    })
    expect(r.origin).toBe('observado')
  })

  it('no reporta diferencias menores a 10 min como evento', () => {
    // 5 min de desfase es ruido de sync, no un arranque anticipado.
    const r = resolveShiftWindow({
      declaredStart: w('2026-08-05T08:05:00'), declaredEnd: w('2026-08-05T15:00:00'),
      observedStart: w('2026-08-05T08:00:00'), observedEnd: w('2026-08-05T15:00:00'),
    })
    expect(r.earlyStartMin).toBe(0)
    expect(r.start).toEqual(w('2026-08-05T08:00:00'))
  })
})

describe('formatGapMinutes', () => {
  it('formatea minutos y horas como se leen', () => {
    expect(formatGapMinutes(45)).toBe('45 min')
    expect(formatGapMinutes(135)).toBe('2 h 15')
    expect(formatGapMinutes(120)).toBe('2 h')
  })
})
