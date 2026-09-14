import { describe, it, expect } from 'vitest'
import { agruparDondeSeUsa, totalDondeSeUsa, plantaCorta, opcionesDeEquipo, claveDeEquipo, equipoParaMostrar } from '../dondeSeUsa'
import { plantaDeNodo } from '../useHierarchyPaths'

/**
 * El caso real, medido en Firestore el 13-09: el cilindro CRHD-32-85 del Knuro (SAP 3300138386)
 * está vinculado a SEIS nodos. El panel decía «Dónde se usa · 3 equipos — KNURO · N1 N2 N3».
 */
const CILINDRO_2A = [
  { machineId: '23kemhGhbN22YIwHd2VN', machineName: 'KNURO N1' }, // Chonchi 720013107
  { machineId: 'Cx9PT0FWS5Cgt51oh6zb', machineName: 'KNURO N3' }, // Chonchi 720013109
  { machineId: 'Eu5FXEOF1c6QPRYamgr0', machineName: 'KNURO N1' }, // Yal     720013104
  { machineId: 'FTj1pS2TG1lsZTkgW9M0', machineName: 'KNURO N2' }, // Yal     720013105
  { machineId: 'HbtfKm7iwXfEazPs7Iu3', machineName: 'KNURO N2' }, // Chonchi 720013108
  { machineId: 'fOc1n0jIdPPQouuMBwIY', machineName: 'KNURO N3' }, // Yal     720013106
]
const CHONCHI = new Set(['23kemhGhbN22YIwHd2VN', 'Cx9PT0FWS5Cgt51oh6zb', 'HbtfKm7iwXfEazPs7Iu3'])
const plantaReal = (id: string) => (CHONCHI.has(id) ? 'PLANTA CHONCHI' : 'PLANTA YAL')

describe('el mismo nombre en dos plantas son dos equipos', () => {
  it('seis equipos, no tres', () => {
    const grupos = agruparDondeSeUsa(CILINDRO_2A, plantaReal)
    expect(totalDondeSeUsa(grupos)).toBe(6)
  })

  it('una fila por planta, cada una con N1 N2 N3', () => {
    const grupos = agruparDondeSeUsa(CILINDRO_2A, plantaReal)
    expect(grupos.map((g) => [g.familia, g.planta, g.unidades.map((u) => u.unidad).join(' ')])).toEqual([
      ['KNURO', 'PLANTA CHONCHI', 'N1 N2 N3'],
      ['KNURO', 'PLANTA YAL', 'N1 N2 N3'],
    ])
  })

  it('cada unidad lleva al nodo de SU planta — el enlace no puede cruzar de planta', () => {
    const grupos = agruparDondeSeUsa(CILINDRO_2A, plantaReal)
    const n1Chonchi = grupos.find((g) => g.planta === 'PLANTA CHONCHI')!.unidades.find((u) => u.unidad === 'N1')!
    const n1Yal = grupos.find((g) => g.planta === 'PLANTA YAL')!.unidades.find((u) => u.unidad === 'N1')!
    expect(n1Chonchi.nodeId).toBe('23kemhGhbN22YIwHd2VN')
    expect(n1Yal.nodeId).toBe('Eu5FXEOF1c6QPRYamgr0')
  })

  it('sin conocer la planta vuelve al comportamiento viejo (3), y eso es lo que se arregló', () => {
    // Documenta el defecto: sin `plantaDe`, los nombres repetidos se colapsan.
    expect(totalDondeSeUsa(agruparDondeSeUsa(CILINDRO_2A))).toBe(3)
  })
})

describe('lo que la deduplicación original sí tenía que hacer', () => {
  it('dos nodos duplicados con el mismo nombre en la MISMA planta siguen siendo uno', () => {
    const duplicados = [
      { machineId: 'a', machineName: 'BOMBA AGUA MAR' },
      { machineId: 'b', machineName: 'BOMBA AGUA MAR' },
    ]
    const grupos = agruparDondeSeUsa(duplicados, () => 'PLANTA CHONCHI')
    expect(totalDondeSeUsa(grupos)).toBe(1)
    expect(grupos[0]!.unidades[0]!.nodeId).toBe('a')
  })

  it('un equipo sin número de unidad queda con unidad vacía y su propio nombre', () => {
    const grupos = agruparDondeSeUsa([{ machineId: 'x', machineName: 'CENTRAL HIDRAULICA CHILLER' }], () => 'PLANTA YAL')
    expect(grupos[0]!.familia).toBe('CENTRAL HIDRAULICA CHILLER')
    expect(grupos[0]!.unidades[0]!.unidad).toBe('')
  })

  it('ignora entradas sin nodo o sin nombre', () => {
    expect(agruparDondeSeUsa([{ machineId: '', machineName: 'KNURO N1' }, { machineId: 'z', machineName: '  ' }])).toEqual([])
  })

  it('ordena las unidades con criterio numérico: N2 antes que N10', () => {
    const eqs = ['N10', 'N2', 'N1'].map((u, i) => ({ machineId: `m${i}`, machineName: `GRADER ${u}` }))
    expect(agruparDondeSeUsa(eqs, () => 'PLANTA YAL')[0]!.unidades.map((u) => u.unidad)).toEqual(['N1', 'N2', 'N10'])
  })
})

describe('opcionesDeEquipo — el filtro «Equipo» de Repuestos', () => {
  it('ofrece N2 y N3 aunque nunca sean el PRIMER equipo del repuesto', () => {
    // El filtro viejo leía equipos[0]: con el orden real del cilindro solo salía «KNURO N1».
    const etiquetas = opcionesDeEquipo(CILINDRO_2A, plantaReal).map((o) => o.etiqueta)
    expect(etiquetas).toEqual([
      'KNURO N1 · Chonchi',
      'KNURO N1 · Yal',
      'KNURO N2 · Chonchi',
      'KNURO N2 · Yal',
      'KNURO N3 · Chonchi',
      'KNURO N3 · Yal',
    ])
  })

  it('la opción de una planta NO trae el equipo de la otra', () => {
    const n1Yal = opcionesDeEquipo(CILINDRO_2A, plantaReal).find((o) => o.etiqueta === 'KNURO N1 · Yal')!
    expect(n1Yal.nodeIds).toEqual(['Eu5FXEOF1c6QPRYamgr0'])
    expect(n1Yal.valor).toBe(claveDeEquipo('KNURO N1', 'PLANTA YAL'))
    expect(n1Yal.valor).not.toBe(claveDeEquipo('KNURO N1', 'PLANTA CHONCHI'))
  })

  it('un nombre que existe en una sola planta no carga la planta en la etiqueta', () => {
    const opciones = opcionesDeEquipo([{ machineId: 'g', machineName: 'GRADER' }], () => 'PLANTA CHONCHI')
    expect(opciones).toEqual([{ valor: 'PLANTA CHONCHI|GRADER', etiqueta: 'GRADER', nodeIds: ['g'] }])
  })

  it('nodos duplicados en la misma planta son una sola opción con los dos nodos', () => {
    const o = opcionesDeEquipo(
      [
        { machineId: 'a', machineName: 'BOMBA AGUA MAR' },
        { machineId: 'b', machineName: 'bomba agua mar ' },
      ],
      () => 'PLANTA YAL',
    )
    expect(o).toHaveLength(1)
    expect(o[0]!.nodeIds).toEqual(['a', 'b'])
  })

  it('ordena con criterio numérico', () => {
    const eqs = ['N10', 'N2'].map((u, i) => ({ machineId: `m${i}`, machineName: `ENZUNCHADORA ${u}` }))
    expect(opcionesDeEquipo(eqs, () => 'PLANTA YAL').map((o) => o.etiqueta)).toEqual(['ENZUNCHADORA N2', 'ENZUNCHADORA N10'])
  })
})

describe('equipoParaMostrar — la columna «Equipo»', () => {
  it('con el filtro «KNURO N2 · Yal», la fila nombra ESE equipo y no «KNURO N1 +5»', () => {
    const n2Yal = (e: { machineId: string }) => e.machineId === 'FTj1pS2TG1lsZTkgW9M0'
    expect(equipoParaMostrar(CILINDRO_2A, n2Yal)).toEqual({ nombre: 'KNURO N2', mas: 5 })
  })

  it('sin filtro, el primero real', () => {
    expect(equipoParaMostrar(CILINDRO_2A)).toEqual({ nombre: 'KNURO N1', mas: 5 })
  })

  it('el marcador «Sin equipo» de un doc duplicado no es un equipo (3300138387 decía «Sin equipo +6»)', () => {
    const conDuplicado = [{ machineId: '', machineName: 'Sin equipo' }, ...CILINDRO_2A]
    expect(equipoParaMostrar(conDuplicado)).toEqual({ nombre: 'KNURO N1', mas: 5 })
  })

  it('sin ningún equipo real es transversal', () => {
    expect(equipoParaMostrar([{ machineId: '', machineName: 'Sin equipo' }])).toEqual({ nombre: 'Transversal', mas: 0 })
  })
})

describe('plantaDeNodo', () => {
  const nombres = new Map([
    ['raiz', 'Aquachile Antarfood Chonchi'],
    ['p1', 'PLANTA CHONCHI'],
    ['p2', 'PLANTA YAL'],
    ['proc', 'PROCESO'],
    ['eq', 'KNURO N1'],
  ])

  it('encuentra el ancestro que es planta', () => {
    expect(plantaDeNodo(new Set(['eq', 'proc', 'p1', 'raiz']), nombres)).toBe('PLANTA CHONCHI')
  })

  it('no confunde un nombre que CONTIENE «planta» con una planta', () => {
    const n = new Map([['x', 'BOMBA DE LA PLANTA RILES'], ['eq', 'KNURO N1']])
    expect(plantaDeNodo(new Set(['eq', 'x']), n)).toBeUndefined()
  })

  it('sin ancestros o sin planta devuelve undefined', () => {
    expect(plantaDeNodo(undefined, nombres)).toBeUndefined()
    expect(plantaDeNodo(new Set(['eq', 'proc']), nombres)).toBeUndefined()
  })
})

describe('plantaCorta', () => {
  it('quita la palabra «planta» y deja el nombre legible', () => {
    expect(plantaCorta('PLANTA CHONCHI')).toBe('Chonchi')
    expect(plantaCorta('PLANTA YAL')).toBe('Yal')
    expect(plantaCorta(undefined)).toBe('')
  })
})
