import { describe, it, expect } from 'vitest'
import type { Repuesto } from '@/types/repuestos'
import type { BomIB01, BomIB01Row } from '../exportBomSAP'
import {
  buildBomIB01,
  bomFileName,
  deriveCentro,
  toUnidadSAP,
  SAP_TEXTO_POSICION_MAX,
} from '../exportBomSAP'

/** Repuesto mínimo: solo los campos que el exportador mira. */
const rep = (p: Partial<Repuesto>): Repuesto => ({
  id: p.codigoSAP || Math.random().toString(36).slice(2),
  codigoSAP: '',
  textoBreve: '',
  descripcion: '',
  codigoFabricante: '',
  cantidadPorMaquina: 0,
  ...p,
} as Repuesto)

/** Acceso a una fila con chequeo: falla claro si la BOM salió más corta de lo esperado. */
const row = (bom: BomIB01, i = 0): BomIB01Row => {
  const r = bom.rows[i]
  if (!r) throw new Error('la BOM no tiene fila ' + i)
  return r
}

const opts = { equipoCodigo: '720004453', equipoNombre: 'EVISCERADORA BAADER 142 N3', centro: 'PLANTA CHONCHI' }

describe('buildBomIB01 — categorías de posición', () => {
  it('un código SAP da posición tipo L con el material puesto', () => {
    const bom = buildBomIB01([rep({ codigoSAP: '3300012407', textoBreve: 'Resorte' })], opts)
    expect(row(bom).categoria).toBe('L')
    expect(row(bom).material).toBe('3300012407')
  })

  it('sin código SAP la posición se omite por defecto', () => {
    const bom = buildBomIB01([rep({ codigoFabricante: '38010321', textoBreve: 'Muelle' })], opts)
    expect(bom.rows).toHaveLength(0)
  })

  it('con incluirSinSap da tipo T, sin material y con el fabricante adelante', () => {
    const bom = buildBomIB01(
      [rep({ codigoFabricante: '38010321', textoBreve: 'Muelle de tracción' })],
      { ...opts, incluirSinSap: true },
    )
    expect(row(bom).categoria).toBe('T')
    expect(row(bom).material).toBe('')
    expect(row(bom).texto.startsWith('38010321')).toBe(true)
  })

  it('un "código SAP" demasiado corto no cuenta como material de stock', () => {
    const bom = buildBomIB01([rep({ codigoSAP: '123', textoBreve: 'x' })], { ...opts, incluirSinSap: true })
    expect(row(bom).categoria).toBe('T')
  })
})

describe('buildBomIB01 — cantidades', () => {
  it('respeta la cantidad real cuando existe', () => {
    const bom = buildBomIB01([rep({ codigoSAP: '3300012407', cantidadPorMaquina: 12 })], opts)
    expect(row(bom).cantidad).toBe(12)
    expect(bom.resumen.sinCantidadReal).toBe(0)
  })

  it('cae a 1 y lo CONTABILIZA cuando no hay cantidad', () => {
    const bom = buildBomIB01([rep({ codigoSAP: '3300012407', cantidadPorMaquina: 0 })], opts)
    expect(row(bom).cantidad).toBe(1)
    expect(bom.resumen.sinCantidadReal).toBe(1)
  })

  it('una cantidad inválida no se cuela como NaN a SAP', () => {
    const bom = buildBomIB01(
      [rep({ codigoSAP: '3300012407', cantidadPorMaquina: undefined as unknown as number })],
      opts,
    )
    expect(row(bom).cantidad).toBe(1)
  })
})

describe('buildBomIB01 — numeración de posiciones', () => {
  it('numera en decenas con 4 dígitos', () => {
    const bom = buildBomIB01(
      [
        rep({ codigoSAP: '3300000001' }),
        rep({ codigoSAP: '3300000002' }),
        rep({ codigoSAP: '3300000003' }),
      ],
      opts,
    )
    expect(bom.rows.map((r) => r.posicion)).toEqual(['0010', '0020', '0030'])
  })

  it('las posiciones L van antes que las T', () => {
    const bom = buildBomIB01(
      [
        rep({ codigoFabricante: 'AAA', textoBreve: 'sin sap' }),
        rep({ codigoSAP: '3300000009', textoBreve: 'con sap' }),
      ],
      { ...opts, incluirSinSap: true },
    )
    expect(bom.rows.map((r) => r.categoria)).toEqual(['L', 'T'])
  })

  it('el orden de las L es estable entre exportaciones (por código)', () => {
    const entrada = [rep({ codigoSAP: '3300000300' }), rep({ codigoSAP: '3300000100' })]
    const a = buildBomIB01(entrada, opts)
    const b = buildBomIB01([...entrada].reverse(), opts)
    expect(a.rows.map((r) => r.material)).toEqual(b.rows.map((r) => r.material))
  })
})

describe('buildBomIB01 — límite de 40 caracteres de SAP', () => {
  it('trunca el texto de posición y conserva el completo aparte', () => {
    const largo = 'BOMBA HELICOIDAL DE DESALOJO DE VISCERAS CON MOTOR ACOPLADO'
    const bom = buildBomIB01([rep({ codigoSAP: '3300012407', textoBreve: largo })], opts)
    expect(row(bom).texto).toHaveLength(SAP_TEXTO_POSICION_MAX)
    expect(row(bom).textoCompleto).toBe(largo)
    expect(bom.resumen.textosTruncados).toBe(1)
  })

  it('no marca como truncado lo que cabe', () => {
    const bom = buildBomIB01([rep({ codigoSAP: '3300012407', textoBreve: 'Resorte' })], opts)
    expect(bom.resumen.textosTruncados).toBe(0)
  })

  it('usa la descripción cuando no hay texto breve', () => {
    const bom = buildBomIB01([rep({ codigoSAP: '3300012407', descripcion: 'Sello mecánico' })], opts)
    expect(row(bom).texto).toBe('Sello mecánico')
  })
})

describe('cabecera y resumen', () => {
  it('el uso de lista es 4 (Mantenimiento)', () => {
    expect(buildBomIB01([], opts).header.uso).toBe('4')
  })

  it('el centro viaja en la cabecera — Chonchi y Yal son BOM distintas', () => {
    const chonchi = buildBomIB01([], opts)
    const yal = buildBomIB01([], { ...opts, equipoCodigo: '720004258', centro: 'PLANTA YAL' })
    expect(chonchi.header.centro).not.toBe(yal.header.centro)
    expect(chonchi.header.equipoCodigo).not.toBe(yal.header.equipoCodigo)
  })

  it('cuenta L y T por separado', () => {
    const bom = buildBomIB01(
      [rep({ codigoSAP: '3300000001' }), rep({ codigoFabricante: 'X' }), rep({ codigoFabricante: 'Y' })],
      { ...opts, incluirSinSap: true },
    )
    expect(bom.resumen).toMatchObject({ total: 3, posicionesL: 1, posicionesT: 2 })
  })
})

describe('toUnidadSAP', () => {
  it('mapea nuestras unidades a las de SAP', () => {
    expect(toUnidadSAP('UN')).toBe('ST')
    expect(toUnidadSAP('un')).toBe('ST')
    expect(toUnidadSAP('MT')).toBe('M')
    expect(toUnidadSAP('LT')).toBe('L')
  })

  it('sin unidad asume pieza', () => {
    expect(toUnidadSAP('')).toBe('ST')
    expect(toUnidadSAP(undefined)).toBe('ST')
  })

  it('lo desconocido pasa tal cual, no se inventa', () => {
    expect(toUnidadSAP('ROLLO')).toBe('ROLLO')
  })
})

describe('deriveCentro', () => {
  const CHONCHI = ['Aquachile Antarfood Chonchi', 'PLANTA CHONCHI', 'PROCESO', 'EVISCERADO']
  const YAL = ['Aquachile Antarfood Chonchi', 'PLANTA YAL', 'PROCESO', 'EVISCERADO']

  it('distingue las dos plantas aunque la raíz diga "Chonchi" en ambas', () => {
    expect(deriveCentro(CHONCHI)).toBe('PLANTA CHONCHI')
    expect(deriveCentro(YAL)).toBe('PLANTA YAL')
  })

  it('ignora la raíz de la empresa y toma el nodo PLANTA', () => {
    expect(deriveCentro(YAL)).not.toContain('Aquachile')
  })

  it('tolera acentos y minúsculas en el nombre del nodo', () => {
    expect(deriveCentro(['Empresa', 'Plánta Yal', 'PROCESO'])).toBe('Plánta Yal')
  })

  it('sin nodo PLANTA cae al nivel 2 del árbol', () => {
    expect(deriveCentro(['Empresa', 'SITIO NORTE', 'PROCESO'])).toBe('SITIO NORTE')
  })

  it('con un árbol degenerado no revienta ni inventa un centro', () => {
    expect(deriveCentro([])).toBe('')
    expect(deriveCentro(['Empresa'])).toBe('')
  })
})

describe('bomFileName', () => {
  it('pliega acentos y no deja caracteres que rompan en Windows', () => {
    const name = bomFileName({
      equipoCodigo: '720004453',
      equipoNombre: 'EVISCERADORA BAADER 142 N°3 / Línea',
      centro: 'PLANTA CHONCHI',
      uso: '4',
      validoDesde: '2026-09-11',
    })
    expect(name).toBe('BOM_IB01_720004453_EVISCERADORA_BAADER_142_N_3_Linea_2026-09-11.xlsx')
    expect(/[^\x20-\x7e]/.test(name)).toBe(false)
  })
})
