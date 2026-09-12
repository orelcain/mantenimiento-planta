import { describe, it, expect } from 'vitest'
import type { Repuesto } from '@/types/repuestos'
import type { BomIB01, BomIB01Row } from '../exportBomSAP'
import {
  buildBomIB01,
  buildBomsIB01,
  resumirBoms,
  bomsFileName,
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

describe('avisos previos a la carga en SAP', () => {
  it('cuenta los materiales con código obsoleto, sin excluirlos', () => {
    const bom = buildBomIB01(
      [
        rep({ codigoSAP: '3300100657', textoBreve: '(NO USAR) CALEFACTOR', cantidadPorMaquina: 1 }),
        rep({ codigoSAP: '3300011612', textoBreve: 'SOPORTE SECCION', cantidadPorMaquina: 30 }),
      ],
      opts,
    )
    // Se cuentan pero SIGUEN en la lista: tienen stock físico y la decisión es de quien carga.
    expect(bom.resumen.obsoletos).toBe(1)
    expect(bom.rows).toHaveLength(2)
  })

  it('reconoce la marca en minúsculas y a media frase', () => {
    const bom = buildBomIB01([rep({ codigoSAP: '3300100657', textoBreve: 'CALEFACTOR (no usar) viejo' })], opts)
    expect(bom.resumen.obsoletos).toBe(1)
  })

  it('no marca como obsoleto un texto normal', () => {
    const bom = buildBomIB01([rep({ codigoSAP: '3300011612', textoBreve: 'SOPORTE SECCION' })], opts)
    expect(bom.resumen.obsoletos).toBe(0)
  })

  it('cuenta las posiciones que salieron con la unidad asumida', () => {
    const bom = buildBomIB01(
      [
        rep({ codigoSAP: '3300011612', textoBreve: 'SOPORTE' }), // sin unidad -> ST asumido
        rep({ codigoSAP: '3300011999', textoBreve: 'CABLE', unidad: 'MT' } as Partial<Repuesto>),
      ],
      opts,
    )
    expect(bom.resumen.unidadAsumida).toBe(1)
    expect(bom.rows.map((r) => r.unidad)).toEqual(['ST', 'M'])
  })

  it('una unidad en blanco cuenta como asumida', () => {
    const bom = buildBomIB01([rep({ codigoSAP: '3300011612', unidad: '   ' } as Partial<Repuesto>)], opts)
    expect(bom.resumen.unidadAsumida).toBe(1)
  })

  it('con unidad declarada no cuenta como asumida', () => {
    const bom = buildBomIB01([rep({ codigoSAP: '3300011612', unidad: 'UN' } as Partial<Repuesto>)], opts)
    expect(bom.resumen.unidadAsumida).toBe(0)
  })

  it('detecta un material repetido — SAP rechaza la BOM entera', () => {
    const bom = buildBomIB01(
      [
        rep({ codigoSAP: '3300011612', textoBreve: 'SOPORTE' }),
        rep({ codigoSAP: '3300011612', textoBreve: 'SOPORTE (duplicado)' }),
        rep({ codigoSAP: '3300011999', textoBreve: 'OTRO' }),
      ],
      opts,
    )
    expect(bom.resumen.materialesDuplicados).toBe(1)
  })

  it('sin repetidos el contador queda en cero', () => {
    const bom = buildBomIB01(
      [rep({ codigoSAP: '3300011612' }), rep({ codigoSAP: '3300011999' })],
      opts,
    )
    expect(bom.resumen.materialesDuplicados).toBe(0)
  })

  it('las posiciones de texto no cuentan como duplicadas entre sí (no llevan material)', () => {
    const bom = buildBomIB01(
      [
        rep({ codigoFabricante: 'A-1', textoBreve: 'pieza uno' }),
        rep({ codigoFabricante: 'A-2', textoBreve: 'pieza dos' }),
      ],
      { ...opts, incluirSinSap: true },
    )
    expect(bom.resumen.materialesDuplicados).toBe(0)
  })
})

describe('resumirBoms — avisos agregados', () => {
  it('suma obsoletos y repetidos de todas las BOM', () => {
    const equipos = [
      { id: 'n1', codigo: '720000001', nombre: 'EQ1', centro: 'PLANTA CHONCHI' },
      { id: 'n2', codigo: '720000002', nombre: 'EQ2', centro: 'PLANTA YAL' },
    ]
    const boms = buildBomsIB01(
      [
        rep({ codigoSAP: '3300100657', textoBreve: '(NO USAR) CALEFACTOR', equipos: ['n1', 'n2'] } as Partial<Repuesto>),
        rep({ codigoSAP: '3300011612', textoBreve: 'SOPORTE', equipos: ['n1'] } as Partial<Repuesto>),
      ],
      equipos,
    )
    const r = resumirBoms(boms)
    expect(r.obsoletos).toBe(2) // uno por cada equipo donde aparece
    expect(r.materialesDuplicados).toBe(0)
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

describe('buildBomsIB01 — exportación masiva', () => {
  const CHONCHI_N1 = { id: 'n-cho-1', codigo: '720004441', nombre: 'BAADER 142 N1', centro: 'PLANTA CHONCHI' }
  const CHONCHI_N2 = { id: 'n-cho-2', codigo: '720004447', nombre: 'BAADER 142 N2', centro: 'PLANTA CHONCHI' }
  const YAL_N1 = { id: 'n-yal-1', codigo: '720004247', nombre: 'BAADER 142 N1', centro: 'PLANTA YAL' }

  /** Un repuesto compartido por las tres máquinas (relación N:M por modelo). */
  const comun = rep({ codigoSAP: '3300011612', textoBreve: 'SOPORTE', cantidadPorMaquina: 30,
    equipos: ['n-cho-1', 'n-cho-2', 'n-yal-1'] } as Partial<Repuesto>)
  const soloYal = rep({ codigoSAP: '3300099999', textoBreve: 'EXCLUSIVO YAL', cantidadPorMaquina: 2,
    equipos: ['n-yal-1'] } as Partial<Repuesto>)

  it('genera una BOM por equipo', () => {
    const boms = buildBomsIB01([comun, soloYal], [CHONCHI_N1, CHONCHI_N2, YAL_N1])
    expect(boms.map((b) => b.header.equipoCodigo)).toEqual(['720004441', '720004447', '720004247'])
  })

  it('un repuesto compartido aparece en la BOM de CADA equipo', () => {
    const boms = buildBomsIB01([comun], [CHONCHI_N1, CHONCHI_N2, YAL_N1])
    expect(boms).toHaveLength(3)
    boms.forEach((b) => expect(b.rows[0]?.material).toBe('3300011612'))
  })

  it('cada equipo recibe solo lo suyo', () => {
    const boms = buildBomsIB01([comun, soloYal], [CHONCHI_N1, YAL_N1])
    expect(boms[0]?.rows).toHaveLength(1)
    expect(boms[1]?.rows).toHaveLength(2)
  })

  it('cada BOM conserva SU centro — no se contagian entre plantas', () => {
    const boms = buildBomsIB01([comun], [CHONCHI_N1, YAL_N1])
    expect(boms.map((b) => b.header.centro)).toEqual(['PLANTA CHONCHI', 'PLANTA YAL'])
  })

  it('omite equipos sin posiciones: una BOM vacía no se puede cargar', () => {
    const huerfano = { id: 'n-sin-nada', codigo: '720000000', nombre: 'SIN MATERIALES', centro: 'PLANTA YAL' }
    const boms = buildBomsIB01([comun], [CHONCHI_N1, huerfano])
    expect(boms.map((b) => b.header.equipoCodigo)).toEqual(['720004441'])
  })

  it('omite equipos sin código SAP', () => {
    const sinCodigo = { id: 'n-cho-1', codigo: '', nombre: 'CINTA SIN CODIGO', centro: 'PLANTA CHONCHI' }
    expect(buildBomsIB01([comun], [sinCodigo])).toHaveLength(0)
  })

  it('la numeración de posiciones arranca de 0010 en cada equipo', () => {
    const boms = buildBomsIB01([comun, soloYal], [YAL_N1])
    expect(boms[0]?.rows.map((r) => r.posicion)).toEqual(['0010', '0020'])
  })

  it('propaga incluirSinSap a todas las BOM', () => {
    const sinSap = rep({ codigoFabricante: 'X-1', textoBreve: 'pieza', equipos: ['n-cho-1'] } as Partial<Repuesto>)
    expect(buildBomsIB01([sinSap], [CHONCHI_N1])).toHaveLength(0)
    const con = buildBomsIB01([sinSap], [CHONCHI_N1], { incluirSinSap: true })
    expect(con[0]?.rows[0]?.categoria).toBe('T')
  })

  it('un repuesto sin equipos asignados no entra en ninguna BOM', () => {
    const transversal = rep({ codigoSAP: '3300000777', textoBreve: 'GUANTE' })
    expect(buildBomsIB01([transversal], [CHONCHI_N1, YAL_N1])).toHaveLength(0)
  })
})

describe('resumirBoms', () => {
  const mk = (codigo: string, centro: string, reps: Repuesto[]) =>
    buildBomIB01(reps, { equipoCodigo: codigo, equipoNombre: 'EQ ' + codigo, centro })

  it('suma las posiciones de todas las BOM', () => {
    const boms = [
      mk('720000001', 'PLANTA CHONCHI', [rep({ codigoSAP: '3300000001', cantidadPorMaquina: 2 })]),
      mk('720000002', 'PLANTA YAL', [rep({ codigoSAP: '3300000002', cantidadPorMaquina: 1 }), rep({ codigoSAP: '3300000003', cantidadPorMaquina: 0 })]),
    ]
    expect(resumirBoms(boms)).toMatchObject({ equipos: 2, posiciones: 3, posicionesL: 3, sinCantidadReal: 1 })
  })

  it('lista los centros distintos, sin repetir', () => {
    const boms = [
      mk('720000001', 'PLANTA CHONCHI', [rep({ codigoSAP: '3300000001' })]),
      mk('720000002', 'PLANTA CHONCHI', [rep({ codigoSAP: '3300000002' })]),
      mk('720000003', 'PLANTA YAL', [rep({ codigoSAP: '3300000003' })]),
    ]
    expect(resumirBoms(boms).centros).toEqual(['PLANTA CHONCHI', 'PLANTA YAL'])
  })

  it('sin BOM no revienta', () => {
    expect(resumirBoms([])).toMatchObject({ equipos: 0, posiciones: 0, centros: [] })
  })
})

describe('bomsFileName', () => {
  it('nombra por cantidad de equipos y fecha', () => {
    const boms = buildBomsIB01(
      [rep({ codigoSAP: '3300000001', equipos: ['n1'] } as Partial<Repuesto>)],
      [{ id: 'n1', codigo: '720000001', nombre: 'EQ', centro: 'PLANTA YAL' }],
      { validoDesde: '2026-09-11' },
    )
    expect(bomsFileName(boms)).toBe('BOM_IB01_MASIVO_1_equipos_2026-09-11.xlsx')
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
