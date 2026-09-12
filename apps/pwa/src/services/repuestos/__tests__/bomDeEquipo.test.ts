import { describe, it, expect } from 'vitest'
import { particionarRepuestosDeEquipo, filtrarRepuestosDeEquipo, opcionesBomDesdeEquipo } from '../bomDeEquipo'

/** Filas reales de la EVISCERADORA BAADER 142 N1. */
const CON_CODIGO = [
  { id: 'a', codigoSAP: '3300120608', nombre: 'ACOPLAMIENTO 34753111', tipo: 'RACOR/FITTING', cantidadPorMaquina: 4 },
  { id: 'b', codigoSAP: '3300120607', nombre: 'ABRAZADERA 34752009', tipo: 'ABRAZADERA', cantidadPorMaquina: 40 },
  { id: 'c', codigoSAP: '3300011873', nombre: 'ABRAZADERA 38030218', tipo: 'RESORTE', cantidadPorMaquina: 19 },
]
const SIN_CODIGO = [
  { id: 'd', codigoSAP: '', nombre: 'Soporte', tipo: 'SOPORTE' },
  { id: 'e', codigoSAP: '', nombre: 'soporte', tipo: 'SOPORTE' },
  { id: 'f', codigoSAP: '', nombre: 'Soporte', tipo: '' },
  { id: 'g', codigoSAP: '—', nombre: 'Arandela', tipo: 'ARANDELA' },
]

describe('particionarRepuestosDeEquipo', () => {
  it('manda al BOM solo lo que tiene código SAP', () => {
    const r = particionarRepuestosDeEquipo([...CON_CODIGO, ...SIN_CODIGO])
    expect(r.bom.map((x) => x.id)).toEqual(['c', 'b', 'a'])
    expect(r.filasSinCodigo).toBe(4)
  })

  it('ordena el BOM por código, que es como se carga en IB01', () => {
    const r = particionarRepuestosDeEquipo(CON_CODIGO)
    expect(r.bom.map((x) => x.codigoSAP)).toEqual(['3300011873', '3300120607', '3300120608'])
  })

  it('agrupa el despiece por nombre sin importar mayúsculas', () => {
    const r = particionarRepuestosDeEquipo(SIN_CODIGO)
    expect(r.despiece).toHaveLength(2)
    const soporte = r.despiece[0]!
    expect(soporte.nombre).toBe('Soporte')
    expect(soporte.veces).toBe(3)
    expect(soporte.ids).toEqual(['d', 'e', 'f'])
  })

  it('conserva el tipo de la fila que sí lo trae', () => {
    const r = particionarRepuestosDeEquipo([
      { id: 'x', codigoSAP: '', nombre: 'Soporte', tipo: '' },
      { id: 'y', codigoSAP: '', nombre: 'Soporte', tipo: 'SOPORTE' },
    ])
    expect(r.despiece[0]?.tipo).toBe('SOPORTE')
  })

  it('ordena el despiece por cuántas veces aparece', () => {
    const r = particionarRepuestosDeEquipo(SIN_CODIGO)
    expect(r.despiece.map((g) => [g.nombre, g.veces])).toEqual([['Soporte', 3], ['Arandela', 1]])
  })

  it('un guion no es un código SAP', () => {
    const r = particionarRepuestosDeEquipo([{ id: 'g', codigoSAP: '—', nombre: 'Arandela' }])
    expect(r.bom).toHaveLength(0)
  })

  it('un código de menos de 6 dígitos tampoco', () => {
    const r = particionarRepuestosDeEquipo([{ id: 'h', codigoSAP: '4600001', nombre: 'X' }])
    expect(r.bom).toHaveLength(1) // 7 dígitos: sí
    expect(particionarRepuestosDeEquipo([{ id: 'i', codigoSAP: '12345', nombre: 'Y' }]).bom).toHaveLength(0)
  })

  it('con un equipo sin repuestos no devuelve nada', () => {
    const r = particionarRepuestosDeEquipo([])
    expect(r.bom).toHaveLength(0)
    expect(r.despiece).toHaveLength(0)
    expect(r.filasSinCodigo).toBe(0)
  })
})

describe('opcionesBomDesdeEquipo', () => {
  /** Ficha real de la EVISCERADORA BAADER 142 N1 de Yal. */
  const YAL = {
    codigo: '720004247',
    nombre: 'EVISCERADORA BAADER 142 N1',
    hierarchyPath: 'Aquachile Antarfood Chonchi > PLANTA YAL > PROCESO > EVISCERADO > EVISCERADORA BAADER 142 N1',
  }

  it('arma la cabecera con el código del equipo', () => {
    expect(opcionesBomDesdeEquipo(YAL)).toEqual({
      equipoCodigo: '720004247',
      equipoNombre: 'EVISCERADORA BAADER 142 N1',
      centro: 'PLANTA YAL',
    })
  })

  it('saca el centro del ÁRBOL: el nombre no distingue las plantas', () => {
    const chonchi = { ...YAL, hierarchyPath: YAL.hierarchyPath.replace('PLANTA YAL', 'PLANTA CHONCHI') }
    expect(opcionesBomDesdeEquipo(chonchi)?.centro).toBe('PLANTA CHONCHI')
    // Mismo nombre de equipo, distinto centro: es justo lo que hay que no confundir.
    expect(opcionesBomDesdeEquipo(chonchi)?.equipoNombre).toBe(opcionesBomDesdeEquipo(YAL)?.equipoNombre)
  })

  it('sin código de equipo no hay cabecera posible', () => {
    expect(opcionesBomDesdeEquipo({ ...YAL, codigo: '' })).toBeNull()
    expect(opcionesBomDesdeEquipo({ ...YAL, codigo: '   ' })).toBeNull()
    expect(opcionesBomDesdeEquipo({ nombre: 'X' })).toBeNull()
  })

  it('sin nombre usa el código, para no dejar la cabecera vacía', () => {
    expect(opcionesBomDesdeEquipo({ codigo: '720004247' })?.equipoNombre).toBe('720004247')
  })
})
describe('filtrarRepuestosDeEquipo', () => {
  /** Filas reales de la Baader 142 N1. */
  const REPS = [
    { id: 'a', codigoSAP: '3300120607', nombre: 'ABRAZADERA 34752009', tipo: 'ABRAZADERA' },
    { id: 'b', codigoSAP: '3300011873', nombre: 'ABRAZADERA 38030218', tipo: 'RESORTE' },
    { id: 'c', codigoSAP: '3300098563', nombre: 'AMORTIGUADOR 1420704000', tipo: 'AMORTIGUADOR' },
    { id: 'd', codigoSAP: '', nombre: 'Ángulo', tipo: 'ÁNGULO/PERFIL' },
    { id: 'e', codigoSAP: '', nombre: 'Canal para cables', tipo: 'CABLE/CONECT.' },
  ]

  it('sin consulta devuelve todo', () => {
    expect(filtrarRepuestosDeEquipo(REPS, '')).toHaveLength(5)
    expect(filtrarRepuestosDeEquipo(REPS, '   ')).toHaveLength(5)
  })

  it('busca por código SAP, incluso por un trozo', () => {
    expect(filtrarRepuestosDeEquipo(REPS, '3300011873').map((r) => r.id)).toEqual(['b'])
    expect(filtrarRepuestosDeEquipo(REPS, '33001206').map((r) => r.id)).toEqual(['a'])
  })

  it('busca por nombre sin importar acentos ni mayúsculas', () => {
    expect(filtrarRepuestosDeEquipo(REPS, 'angulo').map((r) => r.id)).toEqual(['d'])
    expect(filtrarRepuestosDeEquipo(REPS, 'ABRAZADERA')).toHaveLength(2)
  })

  it('busca por tipo', () => {
    expect(filtrarRepuestosDeEquipo(REPS, 'resorte').map((r) => r.id)).toEqual(['b'])
  })

  it('exige todos los términos, en cualquier orden', () => {
    expect(filtrarRepuestosDeEquipo(REPS, 'abrazadera resorte').map((r) => r.id)).toEqual(['b'])
    expect(filtrarRepuestosDeEquipo(REPS, 'resorte abrazadera').map((r) => r.id)).toEqual(['b'])
  })

  it('encuentra el singular buscando en plural', () => {
    expect(filtrarRepuestosDeEquipo(REPS, 'cables').map((r) => r.id)).toEqual(['e'])
  })

  it('sin coincidencias devuelve vacío, no todo', () => {
    expect(filtrarRepuestosDeEquipo(REPS, 'turbina')).toHaveLength(0)
  })
})
