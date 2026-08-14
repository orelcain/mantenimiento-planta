/**
 * El Pareto de las paradas, con los 6 turnos REALES de Filete leídos del doc
 * del monitor el 14-08-2026. Los números de este archivo son los que se vieron
 * en pantalla, no un ejemplo inventado.
 */
import { describe, it, expect } from 'vitest'
import { buildPareto, equipoDe } from '../monitorPareto'

/** `timeBreakdown.recoverable` de cada uno de los 6 turnos anteriores. */
const TURNOS = [
  // 13-ago · 4.707 pz
  [
    { reason: 'ATASCAMIENTO', min: 23, count: 6 },
    { reason: 'Micro Detencion', min: 16, count: 39 },
    { reason: 'Baader 200/CUCHILLERIA DORSAL', min: 15, count: 3 },
    { reason: 'Equipo Auxiliar / CINTAS', min: 5, count: 2 },
  ],
  // 12-ago · 4.486 pz
  [
    { reason: 'Micro Detencion', min: 19, count: 45 },
    { reason: 'FALLA OPERACIONAL', min: 10, count: 2 },
    { reason: 'ATASCAMIENTO', min: 4, count: 2 },
  ],
  // 11-ago · 3.618 pz — el turno del evento grande de cuchillería
  [
    { reason: 'Baader 200/CUCHILLERIA RASCADOR', min: 47, count: 7 },
    { reason: 'Micro Detencion', min: 17, count: 38 },
    { reason: 'ATASCAMIENTO', min: 8, count: 3 },
    { reason: 'Detencion', min: 7, count: 2 },
  ],
  // 10-ago · 4.915 pz — el MEJOR turno, y el que más micro-detenciones tuvo
  [
    { reason: 'Micro Detencion', min: 27, count: 58 },
    { reason: 'Baader 200/CUCHILLERIA DORSAL', min: 13, count: 2 },
    { reason: 'ATASCAMIENTO', min: 9, count: 3 },
    { reason: 'AJUSTE MANTENIMIENTO', min: 5, count: 2 },
  ],
  // 8-ago · 3.454 pz — el incidente de acumulación
  [
    { reason: 'ACUMULACION', min: 36, count: 9 },
    { reason: 'Micro Detencion', min: 20, count: 43 },
  ],
  // 7-ago · 4.364 pz
  [
    { reason: 'Micro Detencion', min: 27, count: 63 },
    { reason: 'CAMBIO LOTE/MMPP', min: 11, count: 2 },
    { reason: 'Baader 200/PERNOS/RESORTES', min: 11, count: 2 },
    { reason: 'ATASCAMIENTO', min: 6, count: 3 },
  ],
]

describe('equipoDe', () => {
  it('saca el equipo de una causa "Equipo/Parte"', () => {
    expect(equipoDe('Baader 200/CUCHILLERIA DORSAL')).toBe('Baader 200')
    expect(equipoDe('Equipo Auxiliar / CINTAS')).toBe('Equipo Auxiliar')
  })

  it('una causa sin equipo se queda como está', () => {
    expect(equipoDe('Micro Detencion')).toBeNull()
    expect(equipoDe('ATASCAMIENTO')).toBeNull()
  })

  it('⚠ "CAMBIO LOTE/MMPP" NO es un equipo con parte', () => {
    // Es una sola causa que lleva una barra en el nombre. Se agrupa igual bajo
    // "CAMBIO LOTE", que es su propio nombre: no inventa un equipo falso ni
    // rompe, pero conviene saberlo si un día hay que afinar la regla.
    expect(equipoDe('CAMBIO LOTE/MMPP')).toBe('CAMBIO LOTE')
  })
})

describe('buildPareto · 6 turnos reales de Filete', () => {
  const p = buildPareto(TURNOS)

  it('suma los 336 min recuperables de la muestra', () => {
    expect(p.totalMin).toBe(336)
    expect(p.shifts).toBe(6)
  })

  it('ordena por minutos y agrupa las tres causas de la Baader en una', () => {
    expect(p.rows[0]!.label).toBe('Micro Detencion')
    expect(p.rows[0]!.minutes).toBe(126)
    expect(p.rows[1]!.label).toBe('Baader 200')
    // 15 + 47 + 13 + 11: sueltas ninguna pasa de 47 y ninguna llama la atención.
    expect(p.rows[1]!.minutes).toBe(86)
    expect(p.rows[1]!.parts).toHaveLength(3)
    expect(p.rows[2]!.label).toBe('ATASCAMIENTO')
    expect(p.rows[2]!.minutes).toBe(50)
  })

  it('cuatro causas explican el 89% del tiempo parado', () => {
    /*
     * El corte es el estándar: la primera fila que alcanza el 80% acumulado.
     * Acá la tercera llega a 78,0 y la cuarta a 89,3, así que entran cuatro.
     * Se resistió la tentación de mover el corte a "la más cercana al 80%"
     * para que diera tres: con 6 turnos, discutir 78 contra 80 es precisión
     * falsa, y una regla torcida a mano deja de ser auditable.
     */
    expect(p.vitalCount).toBe(4)
    expect(Math.round(p.vitalPct)).toBe(89)
    expect(Math.round(p.rows[2]!.cumPct)).toBe(78)
  })

  it('⚠ el segundo eje: en cuántos turnos aparece cada una', () => {
    // Sin esto, ACUMULACION (36 min, cuarta por minutos) se lee como causa
    // crónica cuando ocurrió UNA vez.
    expect(p.rows[0]!.shifts).toBe(6)   // Micro Detencion, en todos
    expect(p.rows[1]!.shifts).toBe(4)   // Baader 200
    expect(p.rows[2]!.shifts).toBe(5)   // ATASCAMIENTO
    const acum = p.rows.find((r) => r.label === 'ACUMULACION')!
    expect(acum.minutes).toBe(36)
    expect(acum.shifts).toBe(1)
  })

  it('cuenta las paradas, que es otra escala del problema', () => {
    // 286 micro-detenciones en 6 turnos: 48 por turno.
    expect(p.rows[0]!.count).toBe(286)
    expect(p.rows[1]!.count).toBe(14)
  })

  it('los porcentajes suman 100 y el acumulado es creciente', () => {
    expect(Math.round(p.rows.reduce((a, r) => a + r.sharePct, 0))).toBe(100)
    for (let i = 1; i < p.rows.length; i++) {
      expect(p.rows[i]!.cumPct).toBeGreaterThanOrEqual(p.rows[i - 1]!.cumPct)
    }
    expect(Math.round(p.rows[p.rows.length - 1]!.cumPct)).toBe(100)
  })
})

describe('buildPareto · bordes', () => {
  it('sin turnos no inventa nada', () => {
    expect(buildPareto([]).rows).toEqual([])
    expect(buildPareto([null, undefined]).totalMin).toBe(0)
  })

  it('descarta causas de duración cero en vez de listarlas con 0%', () => {
    const p = buildPareto([[{ reason: 'X', min: 0, count: 3 }, { reason: 'Y', min: 5, count: 1 }]])
    expect(p.rows).toHaveLength(1)
    expect(p.rows[0]!.label).toBe('Y')
  })

  it('una sola causa se lleva el 100% y el corte es de una fila', () => {
    const p = buildPareto([[{ reason: 'X', min: 10, count: 1 }]])
    expect(p.vitalCount).toBe(1)
    expect(p.vitalPct).toBe(100)
  })

  it('con todas parejas y ninguna llegando al 80%, igual corta donde lo cruza', () => {
    const p = buildPareto([[
      { reason: 'A', min: 10, count: 1 }, { reason: 'B', min: 10, count: 1 },
      { reason: 'C', min: 10, count: 1 }, { reason: 'D', min: 10, count: 1 },
      { reason: 'E', min: 10, count: 1 },
    ]])
    expect(p.vitalCount).toBe(4)   // 4 de 5 = 80%
  })
})
