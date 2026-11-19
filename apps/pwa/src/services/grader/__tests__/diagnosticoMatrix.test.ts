/**
 * Diagnóstico Matrix — lógica pura. Lo que estos tests protegen:
 *  - el orden «más nuevo primero» (si se invierte, el «más nuevo» sale viejo),
 *  - el tope de niveles y de entradas del recorrido,
 *  - que un error en una subcarpeta no tire la lectura entera,
 *  - los textos que el admin copia para Claude.
 */
import { describe, it, expect } from 'vitest'
import {
  armarResumenParaClaude,
  detectarNavegador,
  esArchivoExcel,
  formatearHaceX,
  formatearResumenAnalisis,
  formatearTamano,
  listarExcelsEnCarpeta,
  ordenarPorFechaDesc,
  resumirAnalisis,
  tituloListado,
  type ArchivoHandle,
  type CarpetaHandle,
  type ResultadoListado,
} from '../diagnosticoMatrix'
import type { ParsedMatrixData, PieceRecord, UploadedMatrixFile } from '../types'

const AHORA = 1_000_000_000_000
const MIN = 60_000
const HORA = 60 * MIN

function archivo(nombre: string, tamano: number, modificado: number): ArchivoHandle {
  return {
    kind: 'file',
    name: nombre,
    getFile: async () => ({ size: tamano, lastModified: modificado }) as unknown as File,
  }
}

function carpeta(
  nombre: string,
  hijos: Array<ArchivoHandle | CarpetaHandle>,
  opts: { falla?: boolean } = {},
): CarpetaHandle {
  return {
    kind: 'directory',
    name: nombre,
    values: async function* () {
      if (opts.falla) throw new Error('denied')
      for (const h of hijos) yield h
    },
  }
}

function nombresDe(r: ResultadoListado): string[] {
  return r.archivos.map((a) => a.ruta)
}

describe('ordenarPorFechaDesc', () => {
  it('pone el más nuevo primero (falla si el orden se invierte)', () => {
    const entradas = [
      { ruta: 'b.xlsx', modificado: 5 },
      { ruta: 'a.xlsx', modificado: 1 },
      { ruta: 'c.csv', modificado: 3 },
    ]
    expect(ordenarPorFechaDesc(entradas).map((e) => e.ruta)).toEqual(['b.xlsx', 'c.csv', 'a.xlsx'])
  })

  it('desempata por ruta y no muta la entrada original', () => {
    const entradas = [
      { ruta: 'z.xls', modificado: 2 },
      { ruta: 'm.xls', modificado: 2 },
    ]
    const copia = [...entradas]
    expect(ordenarPorFechaDesc(entradas).map((e) => e.ruta)).toEqual(['m.xls', 'z.xls'])
    expect(entradas).toEqual(copia)
  })
})

describe('esArchivoExcel', () => {
  it('acepta .xls, .xlsx y .csv sin importar mayúsculas', () => {
    expect(esArchivoExcel('Pieza.XLSX')).toBe(true)
    expect(esArchivoExcel('viejo.xls')).toBe(true)
    expect(esArchivoExcel('datos.csv')).toBe(true)
  })

  it('rechaza otras extensiones, incluida .xlsm y nombres que solo contienen la extensión', () => {
    expect(esArchivoExcel('nota.txt')).toBe(false)
    expect(esArchivoExcel('macro.xlsm')).toBe(false)
    expect(esArchivoExcel('copia.xlsx.bak')).toBe(false)
  })
})

describe('listarExcelsEnCarpeta', () => {
  it('junta Excel de la raíz y de dos niveles de subcarpetas, sin entrar al tercero', async () => {
    const raiz = carpeta('Matrix', [
      archivo('r.xlsx', 10, 1),
      archivo('nota.txt', 10, 9),
      carpeta('sub', [
        archivo('s.xls', 10, 2),
        carpeta('deep', [
          archivo('d.csv', 10, 3),
          carpeta('deeper', [archivo('x.xlsx', 10, 4)]),
        ]),
      ]),
    ])
    const r = await listarExcelsEnCarpeta(raiz)
    expect(nombresDe(r)).toEqual(['sub/deep/d.csv', 'sub/s.xls', 'r.xlsx'])
    expect(r.truncado).toBe(false)
    expect(r.elementosNoLeidos).toBe(0)
  })

  it('corta al tope de entradas y lo marca; exactamente en el tope no marca truncado', async () => {
    const hijos = [archivo('1.xlsx', 1, 1), archivo('2.xlsx', 1, 2), archivo('3.xlsx', 1, 3), archivo('4.xlsx', 1, 4)]
    const corto = await listarExcelsEnCarpeta(carpeta('raiz', hijos), { maxEntradas: 3 })
    expect(corto.totalEntradas).toBe(3)
    expect(corto.truncado).toBe(true)
    expect(corto.archivos).toHaveLength(3)

    const justo = await listarExcelsEnCarpeta(carpeta('raiz', hijos.slice(0, 3)), { maxEntradas: 3 })
    expect(justo.truncado).toBe(false)
    expect(justo.archivos).toHaveLength(3)
  })

  it('una subcarpeta que no se puede abrir no tira la lectura: se cuenta y se sigue', async () => {
    const raiz = carpeta('raiz', [
      carpeta('bloqueada', [archivo('no.xlsx', 1, 1)], { falla: true }),
      archivo('ok.xlsx', 1, 2),
    ])
    const r = await listarExcelsEnCarpeta(raiz)
    expect(nombresDe(r)).toEqual(['ok.xlsx'])
    expect(r.elementosNoLeidos).toBe(1)
  })

  it('un error en la carpeta raíz sí se propaga (para que la página lo explique)', async () => {
    await expect(listarExcelsEnCarpeta(carpeta('raiz', [], { falla: true }))).rejects.toThrow('denied')
  })
})

describe('formatearHaceX', () => {
  it('usa las unidades correctas y no muestra cifras negativas en fechas futuras', () => {
    expect(formatearHaceX(AHORA - 30_000, AHORA)).toBe('hace un momento')
    expect(formatearHaceX(AHORA - 5 * MIN, AHORA)).toBe('hace 5 min')
    expect(formatearHaceX(AHORA - 2 * HORA, AHORA)).toBe('hace 2 h')
    expect(formatearHaceX(AHORA - 25 * HORA, AHORA)).toBe('hace 1 día')
    expect(formatearHaceX(AHORA - 75 * HORA, AHORA)).toBe('hace 3 días')
    expect(formatearHaceX(AHORA + 1000, AHORA)).toBe('hace un momento')
  })
})

describe('formatearTamano y tituloListado', () => {
  it('formatea bytes, KB y MB con coma decimal', () => {
    expect(formatearTamano(500)).toBe('500 B')
    expect(formatearTamano(2048)).toBe('2,0 KB')
    expect(formatearTamano(1_572_864)).toBe('1,5 MB')
  })

  it('arma el encabezado del listado en singular, plural y vacío', () => {
    expect(tituloListado(0, null, AHORA)).toBe('Sin archivos Excel en esta carpeta')
    expect(tituloListado(1, AHORA - 2 * HORA, AHORA)).toBe('1 archivo Excel · el más nuevo hace 2 h')
    expect(tituloListado(3, AHORA - 5 * MIN, AHORA)).toBe('3 archivos Excel · el más nuevo hace 5 min')
  })
})

describe('resumirAnalisis', () => {
  const meta = (kind: UploadedMatrixFile['kind'], warnings: string[] = []): UploadedMatrixFile => ({
    id: 'x',
    name: 'pieza.xlsx',
    kind,
    sizeBytes: 1,
    parsedAt: '2026-08-11T00:00:00.000Z',
    warnings,
  })

  it('suma piezas y toma el rango de fechas de los registros', () => {
    const registros: PieceRecord[] = [
      { ts: '2026-08-11T10:00:00.000Z', gate: 1, pieces: 2 },
      { ts: '2026-08-11T06:00:00.000Z', gate: 1, pieces: 3 },
      { ts: '2026-08-11T18:00:00.000Z', gate: 1, pieces: 5 },
    ]
    const partial: Partial<ParsedMatrixData> = { pieceRecords: registros }
    const r = resumirAnalisis(meta('PIEZA_PIEZA', ['aviso x']), partial)
    expect(r.tipo).toBe('Pieza a pieza')
    expect(r.piezas).toBe(10)
    expect(r.desde).toBe(Date.parse('2026-08-11T06:00:00.000Z'))
    expect(r.hasta).toBe(Date.parse('2026-08-11T18:00:00.000Z'))
    expect(r.avisos).toEqual(['aviso x'])
  })

  it('sin registros de piezas deja piezas en null (no 0) y el tipo legible', () => {
    const r = resumirAnalisis(meta('PUERTA_0'), {})
    expect(r.tipo).toBe('Puerta 0')
    expect(r.piezas).toBeNull()
    expect(r.desde).toBeNull()
    expect(r.hasta).toBeNull()
  })

  it('formatea «tipo · N piezas · desde → hasta» con separador de miles', () => {
    const r = resumirAnalisis(meta('PIEZA_PIEZA'), {
      pieceRecords: [
        { ts: new Date(2026, 7, 11, 6, 0).toISOString(), gate: 1, pieces: 13366 },
        { ts: new Date(2026, 7, 11, 18, 0).toISOString(), gate: 1, pieces: 0 },
      ],
    })
    expect(formatearResumenAnalisis(r)).toBe('Pieza a pieza · 13.366 piezas · 11-08-2026 06:00 → 11-08-2026 18:00')
  })
})

describe('detectarNavegador', () => {
  it('reconoce Chrome en Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.86 Safari/537.36'
    expect(detectarNavegador(ua)).toEqual({ navegador: 'Chrome', version: '131.0.6778.86', sistema: 'Windows (NT 10.0)' })
  })

  it('reconoce Edge antes que Chrome (Edge también dice Chrome en el UA)', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70'
    expect(detectarNavegador(ua).navegador).toBe('Edge')
    expect(detectarNavegador(ua).version).toBe('131.0.2903.70')
  })
})

describe('armarResumenParaClaude', () => {
  const navegador = { navegador: 'Chrome', version: '131', sistema: 'Windows (NT 10.0)' }

  function listadoCon(n: number): ResultadoListado {
    const archivos = Array.from({ length: n }, (_, i) => ({
      ruta: `f${String(i).padStart(2, '0')}.xlsx`,
      nombre: `f${String(i).padStart(2, '0')}.xlsx`,
      tamano: 2048,
      modificado: AHORA - i * HORA,
      handle: archivo(`f${i}.xlsx`, 1, 1),
    }))
    return { archivos, totalEntradas: n, truncado: false, elementosNoLeidos: 0 }
  }

  it('lista como máximo los 20 más nuevos y dice cuántos hay en total', () => {
    const texto = armarResumenParaClaude({
      generado: AHORA,
      navegador,
      online: true,
      lecturaCarpetas: true,
      carpeta: { nombre: 'Matrix', listado: listadoCon(25) },
      analisis: null,
    })
    const filas = texto.split('\n').filter((l) => /^\s+\d+\. /.test(l))
    expect(filas).toHaveLength(20)
    expect(texto).toContain('Excel/CSV encontrados: 25')
    expect(texto).toContain('Navegador: Chrome 131 · Windows (NT 10.0) · en línea: sí · lee carpetas: sí')
    expect(texto).not.toContain('f20.xlsx')
  })

  it('sin carpeta lo dice, y un error de análisis aparece como texto legible', () => {
    const texto = armarResumenParaClaude({
      generado: AHORA,
      navegador,
      online: false,
      lecturaCarpetas: false,
      carpeta: null,
      analisis: { ok: false, nombre: 'pieza.xlsx', error: 'Archivo truncado' },
    })
    expect(texto).toContain('Carpeta elegida: ninguna')
    expect(texto).toContain('en línea: no · lee carpetas: no')
    expect(texto).toContain('Análisis de pieza.xlsx: error — Archivo truncado')
  })
})
