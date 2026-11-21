import { describe, it, expect } from 'vitest'
import {
  contarPiezas,
  deduplicarCadenas,
  fechasDelTurno,
  miles,
  p0Pct,
  parsearFila,
  parsearFilas,
  piezasGate0,
  primeraYUltima,
  resumirEspejo,
  ventanaDelTurno,
} from './espejoFilas'

/** Fila del contrato: 11 celdas + `#n`, unidas por TAB. */
function fila(o: Partial<{
  fecha: string; hora: string; peso: string; cant: string; lote: string; gate: string
  calidad: string; cons: string; calibre: string; prod: string; turno: string; n: string
}> = {}): string {
  return [
    o.fecha ?? '2026-11-19', o.hora ?? '00:02:39', o.peso ?? '4,32 kg', o.cant ?? '1',
    o.lote ?? '720.260.738', o.gate ?? '9', o.calidad ?? 'Premium', o.cons ?? 'CONGELADO',
    o.calibre ?? '8 - 10 LB', o.prod ?? 'HG', o.turno ?? 'A', o.n ?? '#0',
  ].join('\t')
}

describe('parsearFila', () => {
  it('lee la fila del contrato con coma decimal en el peso', () => {
    const p = parsearFila(fila())!
    expect(p.ts).toBe('2026-11-19T00:02:39.000Z')
    expect(p.pesoKg).toBe(4.32)
    expect(p.cantidad).toBe(1)
    expect(p.gate).toBe(9)
    expect(p.lote).toBe('720.260.738')
    expect(p.calidad).toBe('Premium')
    expect(p.conservacion).toBe('CONGELADO')
    expect(p.calibre).toBe('8-10 lb')
    expect(p.producto).toBe('HG')
    expect(p.turnoMatrix).toBe('A')
  })

  it('el peso con punto de miles y coma se lee entero', () => {
    expect(parsearFila(fila({ peso: '1.234,5 kg' }))!.pesoKg).toBe(1234.5)
  })

  it('una fila mal formada se descarta sin romper', () => {
    expect(parsearFila('')).toBeNull()
    expect(parsearFila('basura sin tabuladores')).toBeNull()
    expect(parsearFila(fila({ fecha: '19-11-2026' }))).toBeNull()
    expect(parsearFila(fila({ hora: '0:02' }))).toBeNull()
    expect(parsearFila(fila({ cant: 'x' }))).toBeNull()
    expect(parsearFila(fila({ gate: '' }))).toBeNull()
    expect(parsearFila(fila().split('\t').slice(0, 8).join('\t'))).toBeNull()
  })

  it('parsearFilas cuenta las descartadas y no se cae', () => {
    const r = parsearFilas([fila(), 'roto', fila({ hora: '00:03:00' })])
    expect(r.piezas).toHaveLength(2)
    expect(r.descartadas).toBe(1)
  })
})

describe('deduplicado', () => {
  it('la misma cadena completa llegando dos veces cuenta una vez', () => {
    expect(deduplicarCadenas([fila(), fila()])).toHaveLength(1)
    expect(parsearFilas([fila(), fila()]).piezas).toHaveLength(1)
  })

  it('el ordinal #1 es OTRA pieza (idéntica en todas las celdas, otra fila de la tabla)', () => {
    const r = parsearFilas([fila({ n: '#0' }), fila({ n: '#1' })])
    expect(r.piezas).toHaveLength(2)
    expect(contarPiezas(r.piezas)).toBe(2)
  })

  it('ordena por hora', () => {
    const r = parsearFilas([fila({ hora: '00:10:00' }), fila({ hora: '00:02:00' })])
    expect(r.piezas.map((p) => p.hora)).toEqual(['00:02:00', '00:10:00'])
  })
})

describe('conteos', () => {
  const piezas = parsearFilas([
    fila({ hora: '00:01:00', gate: '3' }),
    fila({ hora: '00:02:00', gate: '0' }),
    fila({ hora: '00:03:00', gate: '4' }),
    fila({ hora: '00:04:00', gate: '5' }),
  ]).piezas

  it('cuenta piezas, Gate 0 y P0 %', () => {
    expect(contarPiezas(piezas)).toBe(4)
    expect(piezasGate0(piezas)).toBe(1)
    expect(p0Pct(piezas)).toBe(25)
  })

  it('P0 % es null si no hay ninguna Gate 0 (no se sabe si el informe las trae)', () => {
    expect(p0Pct(piezas.filter((p) => p.gate !== 0))).toBeNull()
    expect(p0Pct([])).toBeNull()
  })

  it('primera y última hora', () => {
    const pu = primeraYUltima(piezas)!
    expect(pu.primera.hora).toBe('00:01:00')
    expect(pu.ultima.hora).toBe('00:04:00')
    expect(primeraYUltima([])).toBeNull()
  })
})

describe('turno con la regla de la app', () => {
  // Turno que cruza medianoche: 19 21:30 → 20 05:45, día del turno 2026-11-19.
  const ventana = ventanaDelTurno({
    dateKey: '2026-11-19', inicio: '2026-11-19T21:30:00.000Z', fin: '2026-11-20T05:45:00.000Z', turnoId: 'Turno 1',
  })!

  it('el turno que cruza medianoche junta las piezas de los dos días', () => {
    const { piezas } = parsearFilas([
      fila({ fecha: '2026-11-19', hora: '23:50:00' }),
      fila({ fecha: '2026-11-20', hora: '00:10:00' }),
      fila({ fecha: '2026-11-20', hora: '02:36:00' }),
      // Mediodía del 19: horas antes del turno, no es de este turno.
      fila({ fecha: '2026-11-19', hora: '12:00:00' }),
    ])
    const r = resumirEspejo(piezas, ventana)
    expect(r.turno).toEqual({ sessionDate: '2026-11-19', shiftId: 'Turno 1' })
    expect(r.total).toBe(3)
    expect(r.primera).toBe('23:50:00')
    expect(r.ultima).toBe('02:36:00')
  })

  it('coincidencia: % de piezas con la letra mayoritaria dentro del turno', () => {
    const { piezas } = parsearFilas([
      fila({ fecha: '2026-11-19', hora: '22:00:00', turno: 'A' }),
      fila({ fecha: '2026-11-19', hora: '22:01:00', turno: 'A' }),
      fila({ fecha: '2026-11-19', hora: '22:02:00', turno: 'A' }),
      fila({ fecha: '2026-11-19', hora: '22:03:00', turno: 'B' }),
    ])
    const r = resumirEspejo(piezas, ventana)
    expect(r.coincidencia).toEqual({ letra: 'A', pct: 75 })
  })

  it('todas con la misma letra coinciden al 100 %', () => {
    const { piezas } = parsearFilas([fila({ hora: '22:00:00' }), fila({ hora: '22:01:00' })])
    expect(resumirEspejo(piezas, ventana).coincidencia?.pct).toBe(100)
  })

  it('ventana pedida sin piezas en ella: vacío (no cae a las piezas de otros turnos)', () => {
    // Mediodía del 19: fuera del turno 21:30 → 05:45. Gate 0 para que el P0 % lo delate.
    const { piezas } = parsearFilas([fila({ fecha: '2026-11-19', hora: '12:00:00', gate: '0', turno: 'B' })])
    const r = resumirEspejo(piezas, ventana)
    expect(r.piezas).toEqual([])
    expect(r.total).toBe(0)
    expect(r.gate0).toBe(0)
    expect(r.p0).toBeNull()
    expect(r.primera).toBeNull()
    expect(r.ultima).toBeNull()
    expect(r.coincidencia).toBeNull()
  })

  it('sin ventana toma el turno de la última pieza (regla por horario)', () => {
    const { piezas } = parsearFilas([fila({ hora: '10:00:00' }), fila({ hora: '10:05:00' })])
    const r = resumirEspejo(piezas, null)
    expect(r.total).toBe(2)
    expect(r.turno).not.toBeNull()
  })
})

describe('apoyo', () => {
  it('fechas del turno (hoy y mañana si cruza medianoche)', () => {
    expect(fechasDelTurno('2026-11-19T21:30:00.000Z', '2026-11-20T05:45:00.000Z')).toEqual(['2026-11-19', '2026-11-20'])
    expect(fechasDelTurno('2026-11-19T09:00:00.000Z', '2026-11-19T17:30:00.000Z')).toEqual(['2026-11-19'])
    expect(fechasDelTurno(null, undefined)).toEqual([])
  })

  it('sin fin: cubre inicio + 13 h, incluido el día siguiente si cruza medianoche', () => {
    expect(fechasDelTurno('2026-11-19T21:30:00.000Z', undefined)).toEqual(['2026-11-19', '2026-11-20'])
    expect(fechasDelTurno('2026-11-19T21:30:00.000Z', null)).toEqual(['2026-11-19', '2026-11-20'])
    expect(fechasDelTurno('2026-11-19T09:00:00.000Z', undefined)).toEqual(['2026-11-19'])
  })

  it('miles con punto también en 4 cifras', () => {
    expect(miles(4812)).toBe('4.812')
    expect(miles(812)).toBe('812')
    expect(miles(1234567)).toBe('1.234.567')
  })
})
