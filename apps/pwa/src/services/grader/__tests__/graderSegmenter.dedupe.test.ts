/**
 * El dedupe tiene que colapsar el mismo turno venido de dos archivos distintos:
 * el Excel del mes y el recorte por turno.
 *
 * Medido sobre los reales (2025-07-08 noche): los dos traen los mismos 5.614
 * registros, pero el recorte no trae `lot`, `product`, `conservation` ni
 * `shift`. Con `lot` en la clave del dedupe las dos copias eran distintas y el
 * turno quedaba con 11.228 piezas — el doble — así guardado en producción.
 */
import { describe, it, expect } from 'vitest'
import { dedupePieceRecords, dedupeGate0Records } from '../graderSegmenter'
import type { PieceRecord, Gate0Record } from '../types'

/** Una pieza como la trae el Excel del mes: con lote, producto, conservación y turno. */
const delMes: PieceRecord = {
  ts: '2025-07-08T22:13:43.000Z',
  gate: 9,
  pieces: 1,
  weightKg: 4.37,
  quality: 'Premium',
  calibre: 'Other',
  lot: '720250351',
  product: 'DESTINO FILETE',
  conservation: 'FRESCO',
  shift: 'A',
} as PieceRecord

/** La MISMA pieza como la trae el recorte por turno: sin esas cuatro columnas. */
const delRecorte: PieceRecord = {
  ts: '2025-07-08T22:13:43.000Z',
  gate: 9,
  pieces: 1,
  weightKg: 4.37,
  quality: 'Premium',
  calibre: 'Other',
} as PieceRecord

describe('dedupePieceRecords con archivos de distinto detalle', () => {
  it('colapsa la misma pieza aunque un archivo no traiga el lote', () => {
    const r = dedupePieceRecords([delMes, delRecorte])
    expect(r.unique).toHaveLength(1)
    expect(r.duplicatesRemoved).toBe(1)
  })

  it('conserva la copia más completa, venga en el orden que venga', () => {
    expect(dedupePieceRecords([delRecorte, delMes]).unique[0]?.lot).toBe('720250351')
    expect(dedupePieceRecords([delMes, delRecorte]).unique[0]?.lot).toBe('720250351')
  })

  it('no colapsa piezas que sí son distintas', () => {
    const otra = { ...delMes, weightKg: 5.12 }
    expect(dedupePieceRecords([delMes, otra]).unique).toHaveLength(2)
    const otroGate = { ...delMes, gate: 8 }
    expect(dedupePieceRecords([delMes, otroGate]).unique).toHaveLength(2)
  })

  it('respeta el orden de aparición', () => {
    const a = { ...delMes, ts: '2025-07-08T22:00:00.000Z' }
    const b = { ...delMes, ts: '2025-07-08T23:00:00.000Z' }
    expect(dedupePieceRecords([b, a, b]).unique.map((x) => x.ts)).toEqual([b.ts, a.ts])
  })
})

/**
 * Lo mismo para Puerta 0: el recorte por turno trae `calibre` y el Excel del mes
 * no. Medido sobre el rechazo del 2025-07-08 22:14:01 — mismo registro, dos
 * claves: la ventana del turno quedaba con 838 registros en vez de 419.
 */
describe('dedupeGate0Records con archivos de distinto detalle', () => {
  const delMes = {
    ts: '2025-07-08T22:14:01.000Z',
    gate: 0,
    pieces: 1,
    weightKg: 6.88,
    weightPerPieceGrams: 6880,
    error: 'No leído por fotocélula',
    quality: 'Premium',
    lot: '720250351',
    shift: 'A',
  } as unknown as Gate0Record

  const delRecorte = {
    ts: '2025-07-08T22:14:01.000Z',
    gate: 0,
    pieces: 1,
    weightKg: 6.88,
    error: 'No leído por fotocélula',
    quality: 'Premium',
    calibre: 'Other',
  } as unknown as Gate0Record

  it('colapsa el mismo rechazo aunque un archivo traiga el calibre y el otro no', () => {
    const r = dedupeGate0Records([delMes, delRecorte])
    expect(r.unique).toHaveLength(1)
    expect(r.duplicatesRemoved).toBe(1)
  })

  it('no colapsa dos rechazos del mismo instante con distinta causa', () => {
    const otraCausa = { ...delMes, error: 'Fuera de límites' }
    expect(dedupeGate0Records([delMes, otraCausa]).unique).toHaveLength(2)
  })

  it('no colapsa dos rechazos del mismo instante con distinto peso', () => {
    const otroPeso = { ...delMes, weightKg: 3.15 }
    expect(dedupeGate0Records([delMes, otroPeso]).unique).toHaveLength(2)
  })
})
