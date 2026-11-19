import { describe, it, expect } from 'vitest'
import {
  CM_DATO_VIEJO_MS,
  CM_REGISTROS_CORTE,
  CM_VENTANA_MS,
  claveArchivo,
  derivarEstado,
  esDatoViejo,
  esExporteCortado,
  esNombrePiezaAPieza,
  recortarProcesados,
  seleccionarCandidatos,
  type CandidatoCarpeta,
  type HechosCarpeta,
} from '../carpetaMatrix'

const AHORA = Date.UTC(2026, 10, 19, 12, 0, 0)
const HORA = 3_600_000
const MIN = 60_000

function archivo(ruta: string, hacia: number, tamano = 1000): CandidatoCarpeta {
  return { ruta, tamano, modificado: AHORA - hacia }
}

function hechos(extra: Partial<HechosCarpeta> = {}): HechosCarpeta {
  return {
    autorizada: true,
    permisoConcedido: true,
    ultimoResultado: null,
    ultimoPiezaAPieza: AHORA - HORA,
    errorReciente: false,
    ahora: AHORA,
    ...extra,
  }
}

describe('seleccionarCandidatos', () => {
  it('ignora archivos fuera de la ventana de 48 h y deja los de dentro', () => {
    const dentro = archivo('Pieza pieza hoy.xlsx', 47 * HORA)
    const fuera = archivo('Pieza pieza vieja.xlsx', CM_VENTANA_MS + HORA)
    const res = seleccionarCandidatos([dentro, fuera], AHORA, new Set())
    expect(res.map((c) => c.ruta)).toEqual(['Pieza pieza hoy.xlsx'])
  })

  it('no toma archivos inestables (modificados hace 30 s o menos)', () => {
    const inestable = archivo('escribiendo.xlsx', 10_000)
    const exactamente30 = archivo('limite.xlsx', 30_000)
    const estable = archivo('listo.xlsx', 31_000)
    const res = seleccionarCandidatos([inestable, exactamente30, estable], AHORA, new Set())
    expect(res.map((c) => c.ruta)).toEqual(['listo.xlsx'])
  })

  it('no vuelve a procesar un archivo ya procesado, pero sí si cambió de tamaño o fecha', () => {
    const a = archivo('pieza.xlsx', 5 * MIN, 500)
    const procesados = new Set([claveArchivo(a)])
    expect(seleccionarCandidatos([a], AHORA, procesados)).toHaveLength(0)
    const cambiado = { ...a, tamano: 501 }
    expect(seleccionarCandidatos([cambiado], AHORA, procesados)).toHaveLength(1)
    const otraFecha = { ...a, modificado: a.modificado + 1 }
    expect(seleccionarCandidatos([otraFecha], AHORA, procesados)).toHaveLength(1)
  })

  it('ordena del más nuevo al más viejo', () => {
    const res = seleccionarCandidatos(
      [archivo('viejo.xlsx', 20 * HORA), archivo('nuevo.xlsx', 2 * HORA), archivo('medio.xlsx', 9 * HORA)],
      AHORA,
      new Set(),
    )
    expect(res.map((c) => c.ruta)).toEqual(['nuevo.xlsx', 'medio.xlsx', 'viejo.xlsx'])
  })
})

describe('esExporteCortado', () => {
  it('marca un Pieza a pieza con exactamente 10.000 registros', () => {
    expect(CM_REGISTROS_CORTE).toBe(10_000)
    expect(esExporteCortado('PIEZA_PIEZA', 10_000)).toBe(true)
  })

  it('no marca 9.999 ni 10.001, ni otro tipo de archivo con 10.000', () => {
    expect(esExporteCortado('PIEZA_PIEZA', 9_999)).toBe(false)
    expect(esExporteCortado('PIEZA_PIEZA', 10_001)).toBe(false)
    expect(esExporteCortado('PUERTA_0', 10_000)).toBe(false)
  })
})

describe('esDatoViejo', () => {
  it('es viejo con más de 3 días y no con 2 días', () => {
    expect(esDatoViejo(AHORA - (CM_DATO_VIEJO_MS + HORA), AHORA)).toBe(true)
    expect(esDatoViejo(AHORA - 2 * 86_400_000, AHORA)).toBe(false)
  })

  it('sin ningún Pieza a pieza en la carpeta también es dato viejo', () => {
    expect(esDatoViejo(null, AHORA)).toBe(false)
  })
})

describe('derivarEstado', () => {
  it('sin handle guardado: sin autorizar', () => {
    expect(derivarEstado(hechos({ autorizada: false }))).toBe('sin-autorizar')
  })

  it('permiso perdido tras reiniciar: permiso por renovar', () => {
    expect(derivarEstado(hechos({ permisoConcedido: false }))).toBe('permiso')
  })

  it('exporte cortado tiene prioridad sobre dato viejo', () => {
    const cortado = { tipo: 'cortado' as const, archivo: 'p.xlsx', registros: 10_000, detectadoEn: AHORA }
    const res = derivarEstado(hechos({ ultimoResultado: cortado, ultimoPiezaAPieza: AHORA - 7 * 86_400_000 }))
    expect(res).toBe('cortado')
  })

  it('dato viejo sin cortado: viejo', () => {
    expect(derivarEstado(hechos({ ultimoPiezaAPieza: AHORA - 7 * 86_400_000 }))).toBe('viejo')
  })

  it('archivo nuevo cargado y dato al día: cargado; sin nada: vigilando', () => {
    const cargado = {
      tipo: 'cargado' as const, archivo: 'p.xlsx', piezas: 27_371, desde: null, hasta: null, cargadoEn: AHORA,
    }
    expect(derivarEstado(hechos({ ultimoResultado: cargado }))).toBe('cargado')
    expect(derivarEstado(hechos())).toBe('vigilando')
  })
})

describe('nombre del Pieza a pieza', () => {
  it('reconoce el nombre del parser (pieza o piece)', () => {
    expect(esNombrePiezaAPieza('Pieza pieza Grader STATICGRADER1 (20261119_000000 - 20261120_000000).xlsx')).toBe(true)
    expect(esNombrePiezaAPieza('Puerta 0.xlsx')).toBe(false)
  })
})

describe('recortarProcesados', () => {
  it('deja solo los últimos N', () => {
    expect(recortarProcesados(['a', 'b', 'c', 'd'], 2)).toEqual(['c', 'd'])
    expect(recortarProcesados(['a'], 2)).toEqual(['a'])
  })
})
