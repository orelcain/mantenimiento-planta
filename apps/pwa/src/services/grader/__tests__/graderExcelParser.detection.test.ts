/**
 * Tests de regresión para `detectFileKind` y conteo de piezas.
 *
 * Contexto: el módulo Grader recibe Excels de DOS plantas con formatos
 * distintos. Importante mantener ambos cubiertos:
 *
 *  Chonchi (Marelec MS4/12):
 *    - Pieza-Pieza: Tiempo, Tag, Calibre, Calidad, Especie, Conservación,
 *      Producto, Lote, Peso, Peso (lectura), Cantidad, Cinta, OK, Bin, etc.
 *    - Sin columna "Error" en PP. Error vive solo en archivo Puerta 0.
 *
 *  Yal (Marelec, otra config):
 *    - Pieza-Pieza: Dispositivo, Especie, OtCosecha, Fecha, Hora,
 *      cantidad de registros, Peso de las piezas, Peso, Gate, piezas real,
 *      centrocultivo, Error
 *    - SÍ tiene columna "Error" en PP (rechazos por baja del peso aparecen
 *      como gate=0 con "No puede pesar" / "Peso por debajo del mínimo").
 *
 * Bugs históricos cubiertos por estos tests:
 *  - 2026-05-08: Yal detectado como PUERTA_0 porque tenía columna Error.
 *  - 2026-05-08: Yal sumaba peso (kg) en lugar de unidades porque la
 *    variante 'piezas' matcheaba 'peso de las piezas' por fuzzy include.
 *  - 2026-05-08: parseDatetime convertía wall-clock→UTC y desfasaba +3h/+4h.
 */
import { describe, it, expect } from 'vitest'
import { detectFileKind } from '../graderExcelParser'

// ── Helpers ─────────────────────────────────────────────────────────────────

const YAL_HEADERS = [
  'Dispositivo', 'Especie', 'OtCosecha', 'Fecha', 'Hora',
  'cantidad de registros', 'Peso de las piezas', 'Peso', 'Gate',
  'piezas real', 'centrocultivo', 'Error',
]

const YAL_SAMPLE_ROW = [
  'YAL', 'Salar', 720260297, '2026-05-07', '00:03:50',
  1, '4,5 kg', '4,5 kg', 2, 1, 'Marchant', 'No aplicable',
]

const YAL_GATE0_ROW = [
  'YAL', 'No aplicable', 0, '2026-05-07', '00:03:45',
  1, '0,0 kg', '0,0 kg', 0, 1, 'No aplicable', 'No puede pesar',
]

const CHONCHI_PP_HEADERS = [
  'Tiempo', 'Tag', 'Calibre', 'Calidad', 'Especie', 'Conservación',
  'Producto', 'Lote', 'Peso', 'Cantidad de piezas', 'Gate',
]

const CHONCHI_P0_HEADERS = [
  'Tiempo', 'Cantidad de piezas', 'Error', 'Calibre',
]

// ── Tests ────────────────────────────────────────────────────────────────────

describe('detectFileKind — formato Yal (con columna Error en PP)', () => {
  it('detecta PIEZA_PIEZA aunque tenga columna Error', () => {
    const rows = [YAL_HEADERS, YAL_SAMPLE_ROW]
    expect(detectFileKind(rows)).toBe('PIEZA_PIEZA')
  })

  it('detecta PIEZA_PIEZA con filename Yal', () => {
    const rows = [YAL_HEADERS, YAL_SAMPLE_ROW]
    expect(detectFileKind(rows, 'Pieza a Pieza Yal_ YAL (20260507_000100 - 20260507_070000).xlsx')).toBe('PIEZA_PIEZA')
  })

  it('detecta PIEZA_PIEZA con filas mixtas (gate=0 + gate=2)', () => {
    const rows = [YAL_HEADERS, YAL_GATE0_ROW, YAL_SAMPLE_ROW]
    expect(detectFileKind(rows)).toBe('PIEZA_PIEZA')
  })

  it('detecta PIEZA_PIEZA con filename neutro', () => {
    const rows = [YAL_HEADERS, YAL_SAMPLE_ROW]
    expect(detectFileKind(rows, 'export.xlsx')).toBe('PIEZA_PIEZA')
  })
})

describe('detectFileKind — formato Chonchi (sin Error en PP)', () => {
  it('detecta PIEZA_PIEZA Chonchi', () => {
    const rows = [
      CHONCHI_PP_HEADERS,
      ['10:00:00', 'tag1', '6-8', 'Premium', 'Salar', 'Refrig', 'HG', 'Lote1', '5.0', 1, 3],
    ]
    expect(detectFileKind(rows)).toBe('PIEZA_PIEZA')
  })

  it('detecta PUERTA_0 (archivo P0 puro sin Gate)', () => {
    const rows = [
      CHONCHI_P0_HEADERS,
      ['10:00:00', 1, 'fuera de límites', 'Other'],
    ]
    expect(detectFileKind(rows)).toBe('PUERTA_0')
  })

  it('detecta PUERTA_0 con filename Puerta 0', () => {
    const rows = [
      CHONCHI_P0_HEADERS,
      ['10:00:00', 1, 'fuera de límites', 'Other'],
    ]
    expect(detectFileKind(rows, 'Puerta 0 STATICGRADER1 (20250701_000000).xlsx')).toBe('PUERTA_0')
  })
})

describe('detectFileKind — UNKNOWN cuando no matchea ningún formato', () => {
  it('retorna UNKNOWN sin headers reconocibles', () => {
    const rows = [['Foo', 'Bar', 'Baz'], ['1', '2', '3']]
    expect(detectFileKind(rows)).toBe('UNKNOWN')
  })

  it('usa filename hint cuando no hay headers válidos', () => {
    const rows: unknown[][] = []
    expect(detectFileKind(rows, 'Puerta 0 abril.xlsx')).toBe('PUERTA_0')
    expect(detectFileKind(rows, 'Pieza a Pieza abril.xlsx')).toBe('PIEZA_PIEZA')
  })
})
