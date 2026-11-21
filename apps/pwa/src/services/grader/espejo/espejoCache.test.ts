import { describe, it, expect } from 'vitest'
import { CacheHorasEspejo, horasDeVentana, recortarAVentana } from './espejoCache'

/** Fila del contrato: 11 celdas + `#n`, unidas por TAB. */
function fila(fecha: string, hora: string, n = 0): string {
  return [fecha, hora, '4,32 kg', '1', '720.260.738', '9', 'Premium', 'CONGELADO', '8 - 10 LB', 'HG', 'A', `#${n}`].join('\t')
}
function hora(fecha: string, hh: string, cuantas: number): string[] {
  return Array.from({ length: cuantas }, (_, i) =>
    fila(fecha, `${hh}:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`))
}

describe('CacheHorasEspejo: parsea solo lo que cambió', () => {
  it('un envío nuevo a una hora parsea solo sus filas nuevas, no las demás horas', () => {
    const c = new CacheHorasEspejo()
    const h21 = hora('2026-11-20', '21', 1400)
    const h22 = hora('2026-11-20', '22', 1400)
    c.actualizar('2026-11-20/21', h21)
    c.actualizar('2026-11-20/22', h22)
    expect(c.parseadas).toBe(2800)

    // arrayUnion agrega al final: llegan 3 filas nuevas a las 22.
    const extra = [fila('2026-11-20', '22:59:58'), fila('2026-11-20', '22:59:59'), fila('2026-11-20', '22:59:59', 1)]
    expect(c.actualizar('2026-11-20/22', [...h22, ...extra])).toBe(true)
    expect(c.parseadas).toBe(2803)

    // El mismo snapshot otra vez no parsea nada ni marca cambio.
    expect(c.actualizar('2026-11-20/22', [...h22, ...extra])).toBe(false)
    expect(c.parseadas).toBe(2803)

    const p = c.piezas(['2026-11-20/22', '2026-11-20/21'])
    expect(p).toHaveLength(2803)
    // Unidas en orden de hora aunque las claves lleguen desordenadas.
    expect(p[0]!.hora).toBe('21:00:00')
    expect(p[p.length - 1]!.cadena).toBe(extra[2])
  })

  it('un documento reescrito (no es prefijo) se reparsea entero, solo ese', () => {
    const c = new CacheHorasEspejo()
    c.actualizar('2026-11-20/21', hora('2026-11-20', '21', 100))
    c.actualizar('2026-11-20/22', hora('2026-11-20', '22', 100))
    c.actualizar('2026-11-20/22', hora('2026-11-20', '22', 100).reverse())
    expect(c.parseadas).toBe(300)
    expect(c.piezas(['2026-11-20/22'])).toHaveLength(100)
  })

  it('quitar saca la hora; piezas() devuelve la misma referencia si nada cambió', () => {
    const c = new CacheHorasEspejo()
    c.actualizar('2026-11-20/21', hora('2026-11-20', '21', 10))
    const a = c.piezas(['2026-11-20/21'])
    expect(c.piezas(['2026-11-20/21'])).toBe(a)
    expect(c.quitar('2026-11-20/21')).toBe(true)
    expect(c.piezas(['2026-11-20/21'])).toHaveLength(0)
  })
})

describe('horasDeVentana y recortarAVentana', () => {
  const ventana = { startMs: Date.parse('2026-11-20T21:20:00.000Z'), endMs: Date.parse('2026-11-21T05:00:00.000Z') }

  it('turno 21:20 → 05:00 con 1 h antes y 2 h después: 11 documentos, cruzando medianoche', () => {
    const h = horasDeVentana(ventana)
    expect(h).toHaveLength(11)
    expect(h[0]).toEqual({ fecha: '2026-11-20', hh: '20' })
    expect(h[h.length - 1]).toEqual({ fecha: '2026-11-21', hh: '06' })
  })

  it('sin ventana no hay documentos', () => {
    expect(horasDeVentana(null)).toEqual([])
  })

  it('recorta a la ventana con su margen', () => {
    const c = new CacheHorasEspejo()
    c.actualizar('2026-11-20/20', [fila('2026-11-20', '20:10:00'), fila('2026-11-20', '20:30:00')])
    c.actualizar('2026-11-21/07', [fila('2026-11-21', '07:00:00')])
    const r = recortarAVentana(c.piezas(['2026-11-20/20', '2026-11-21/07']), ventana)
    expect(r.map((p) => p.hora)).toEqual(['20:30:00'])
  })
})
