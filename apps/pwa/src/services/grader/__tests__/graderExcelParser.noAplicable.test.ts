/**
 * Los registros "No aplicable" del informe pieza-a-pieza.
 *
 * Caso real Chonchi 11-ago-2026: el Matrix mostraba "se han recuperado 13.529
 * registros" y la app 13.366 piezas. Las 163 de diferencia eran filas con
 * `Cantidad de piezas` en 0 y `Peso de las piezas` en "No aplicable" — eventos
 * que el grader registra sin pieza detrás.
 *
 * El parser las descartaba en silencio, así que la diferencia parecía
 * producción perdida y costó una tarde de búsqueda. Ahora se cuentan aparte:
 * no suman piezas (no lo son), pero permiten cuadrar con el letrero del Matrix.
 */
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseFile } from '../graderExcelParser'

/** Cabecera REAL del informe de Chonchi, en su orden. */
const HEADERS = [
  'Fecha', 'Hora', 'Peso de las piezas', 'Cantidad de piezas', 'Lote',
  'Gate', 'Calidad', 'Conservacion', 'Calibre', 'Producto', 'Turno',
]

const pieza = (hora: string, gate: number) =>
  ['2026-08-11', hora, 4.52, 1, '720260404', gate, 'Premium', 'CONGELADO', '8 - 10 LB', 'HG', 'B']

/** Fila tal como la emite el grader cuando no hubo pieza. */
const noAplicable = (hora: string) =>
  ['2026-08-11', hora, 'No aplicable', 0, '720260404', 0, 'Premium', 'CONGELADO', '8 - 10 LB', 'HG', 'B']

function excelFile(rows: unknown[][], name = 'Pieza pieza Grader STATICGRADER1.xlsx'): File {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Pieza pieza Grader'],
    ['Dispositivo: STATICGRADER1'],
    HEADERS,
    ...rows,
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([buf], name)
}

describe('registros "No aplicable"', () => {
  it('no se cuentan como piezas pero sí quedan registrados', async () => {
    const { partialData } = await parseFile(excelFile([
      pieza('07:26:47', 8),
      noAplicable('07:27:10'),
      pieza('07:27:30', 10),
      noAplicable('07:28:00'),
      noAplicable('07:29:00'),
    ]))

    expect(partialData.pieceRecords).toHaveLength(2)
    expect(partialData.pieceRecords!.reduce((a, r) => a + r.pieces, 0)).toBe(2)
    expect(partialData.notApplicableRecords).toHaveLength(3)
  })

  it('conservan su hora, para poder repartirlas por turno', async () => {
    const { partialData } = await parseFile(excelFile([
      pieza('10:00:00', 8),
      noAplicable('22:15:00'),
    ]))
    expect(partialData.notApplicableRecords![0]!.ts).toContain('22:15')
    expect(partialData.notApplicableRecords![0]!.pieces).toBe(0)
  })

  it('un archivo sin "No aplicable" no declara el campo', async () => {
    const { partialData } = await parseFile(excelFile([pieza('10:00:00', 8)]))
    expect(partialData.notApplicableRecords).toBeUndefined()
  })

  it('la suma de piezas + no aplicables da los registros que reporta el Matrix', async () => {
    // Es la comprobación que importa en planta: el número del letrero tiene que
    // poder reconstruirse desde lo que muestra la app.
    const filas = [
      ...Array.from({ length: 20 }, (_, i) => pieza(`08:0${i % 10}:00`, 8)),
      ...Array.from({ length: 3 }, (_, i) => noAplicable(`09:0${i}:00`)),
    ]
    const { partialData } = await parseFile(excelFile(filas))

    const piezas = partialData.pieceRecords!.reduce((a, r) => a + r.pieces, 0)
    const noAplicables = partialData.notApplicableRecords!.length
    expect(piezas).toBe(20)
    expect(noAplicables).toBe(3)
    expect(piezas + noAplicables).toBe(filas.length)
  })
})
