/**
 * Tests de la parte PURA de useHierarchyPaths (sin Firestore): `build`
 * (nodeId → ancestros incl. self) y `unionAncestors` (base de `computeAreaIds`,
 * el campo `areaIds` que permite filtrar repuestos por área del lado del
 * servidor en vez de bajar el maestro completo).
 */
import { describe, it, expect } from 'vitest'
import { build, unionAncestors } from '../useHierarchyPaths'

// Árbol de prueba: root → planta → area → equipo
//   root
//     └─ planta
//          └─ area
//               └─ equipo1
//               └─ equipo2 (mismo padre que equipo1)
//          └─ area2
//               └─ equipo3
const NODES = [
  { id: 'root', parentId: null, path: [] },
  { id: 'planta', parentId: 'root', path: [] },
  { id: 'area', parentId: 'planta', path: [] },
  { id: 'area2', parentId: 'planta', path: [] },
  { id: 'equipo1', parentId: 'area', path: [] },
  { id: 'equipo2', parentId: 'area', path: [] },
  { id: 'equipo3', parentId: 'area2', path: [] },
]

describe('build', () => {
  it('incluye al propio nodo y a todos sus ancestros vía parentId', () => {
    const map = build(NODES)
    expect([...map.get('equipo1')!].sort()).toEqual(['area', 'equipo1', 'planta', 'root'])
  })

  it('la raíz solo se contiene a sí misma', () => {
    const map = build(NODES)
    expect([...map.get('root')!]).toEqual(['root'])
  })

  it('usa el campo `path` como autoritativo además de parentId (compat docs con path poblado)', () => {
    const withPath = [
      { id: 'huerfano', parentId: null, path: ['root', 'planta', 'otra-area'] },
      ...NODES,
    ]
    const map = build(withPath)
    expect([...map.get('huerfano')!].sort()).toEqual(['huerfano', 'otra-area', 'planta', 'root'])
  })

  it('nodos de áreas hermanas no comparten ancestros propios', () => {
    const map = build(NODES)
    expect(map.get('equipo3')!.has('area')).toBe(false)
    expect(map.get('equipo1')!.has('area2')).toBe(false)
  })
})

describe('unionAncestors (base de computeAreaIds)', () => {
  it('un solo equipo → sus ancestros + él mismo', () => {
    const map = build(NODES)
    expect(unionAncestors(map, ['equipo1']).sort()).toEqual(['area', 'equipo1', 'planta', 'root'])
  })

  it('varios equipos en distintas áreas → unión de ambas cadenas (repuesto compartido entre áreas)', () => {
    const map = build(NODES)
    const ids = unionAncestors(map, ['equipo1', 'equipo3']).sort()
    expect(ids).toEqual(['area', 'area2', 'equipo1', 'equipo3', 'planta', 'root'])
  })

  it('equipos hermanos bajo la misma área → la unión no duplica el área común', () => {
    const map = build(NODES)
    const ids = unionAncestors(map, ['equipo1', 'equipo2'])
    expect(ids.filter((id) => id === 'area').length).toBe(1)
  })

  it('nodeId inexistente en el árbol (doc corrupto/borrado) → se mantiene matcheable por su propio id, no se descarta', () => {
    const map = build(NODES)
    expect(unionAncestors(map, ['nodo-fantasma'])).toEqual(['nodo-fantasma'])
  })

  it('lista vacía de equipos → sin áreas', () => {
    const map = build(NODES)
    expect(unionAncestors(map, [])).toEqual([])
  })
})
