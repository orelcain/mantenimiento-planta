import { describe, expect, it } from 'vitest'
import { pesosPorLinea, revisionDeLineas, type GrafoLineas } from '../modeloLineas'

/**
 * Una línea chica con los tres agujeros que el panel de revisión tiene que encontrar, y con
 * las dos cosas que NO debe marcar: un servicio de apoyo (no reparte flujo por diseño) y un
 * elemento manual que sí tiene flujo (es pendiente con SAP igual, pero no está «fuera»).
 */
const planta = (): GrafoLineas => ({
  version: 1,
  lineas: [
    { id: 'eviscerado', nombre: 'Eviscerado', zona: { x: 0, y: 0, w: 2000, h: 900 } },
    { id: 'apoyo', nombre: 'Servicios', tipo: 'apoyo', zona: { x: 2200, y: 0, w: 600, h: 400 } },
  ],
  nodos: [
    { id: 'in:eviscerado', x: 0, y: 0, zona: 'eviscerado' },
    { id: 'chiller', x: 200, y: 0, zona: 'eviscerado' },
    { id: 'manual:stunner', x: 400, y: 0, zona: 'eviscerado', nombre: 'STUNNER N1' },
    { id: 'desangrador', x: 600, y: 0, zona: 'eviscerado' },
    // Dibujado pero sin ninguna flecha que lo alcance desde la entrada.
    { id: 'climatizacion', x: 800, y: 400, zona: 'eviscerado' },
    // Los servicios nunca son hallazgo.
    { id: 'riles', x: 2300, y: 100, zona: 'apoyo' },
  ],
  aristas: [
    ['in:eviscerado', 'chiller'],
    ['chiller', 'manual:stunner'],
    ['manual:stunner', 'desangrador'],
  ],
})

const revisar = (g: GrafoLineas) => revisionDeLineas(g, pesosPorLinea(g))

describe('qué le falta al diagrama', () => {
  it('marca el equipo que no alcanza el flujo y no cuenta las entradas', () => {
    const r = revisar(planta())
    expect(r.fueraDeLinea.map((h) => h.id)).toEqual(['climatizacion'])
    expect(r.fueraDeLinea[0]?.lineaId).toBe('eviscerado')
  })

  it('NO marca los servicios de apoyo: por diseño no reparten flujo', () => {
    const r = revisar(planta())
    expect([...r.fueraDeLinea, ...r.enCirculo, ...r.sinSap].map((h) => h.id)).not.toContain('riles')
    // Tampoco entran al total de equipos ni a los que llevan flujo.
    expect(r.equipos).toBe(4)
    expect(r.conFlujo).toBe(3)
  })

  it('lista el elemento manual aunque tenga flujo perfecto: el pendiente es con SAP', () => {
    const r = revisar(planta())
    expect(r.sinSap.map((h) => h.id)).toEqual(['manual:stunner'])
    expect(r.sinSap[0]?.peso).toBe(1)
    expect(r.fueraDeLinea.map((h) => h.id)).not.toContain('manual:stunner')
  })

  it('separa el círculo de lo que está simplemente suelto', () => {
    const g = planta()
    // El desangrador vuelve al chiller: todo ese tramo queda en círculo, no «fuera».
    g.aristas.push(['desangrador', 'chiller'])
    const r = revisar(g)
    expect(r.enCirculo.map((h) => h.id)).toContain('chiller')
    expect(r.fueraDeLinea.map((h) => h.id)).toEqual(['climatizacion'])
    expect(r.conFlujo).toBe(0)
  })

  it('ordena por lo que cuesta: primero el que se lleva más de su línea', () => {
    const g = planta()
    g.nodos.push(
      { id: 'manual:buchacas', x: 800, y: 0, zona: 'eviscerado', nombre: '12 BUCHACAS' },
      { id: 'manual:flipper', x: 1000, y: 0, zona: 'eviscerado', nombre: 'FLIPPER 1' },
      { id: 'otra', x: 1000, y: 200, zona: 'eviscerado' },
    )
    // Las buchacas llevan el 100 %; el flipper es 1 de 2 y lleva la mitad.
    g.aristas.push(['desangrador', 'manual:buchacas'], ['manual:buchacas', 'manual:flipper'], ['manual:buchacas', 'otra'])
    const r = revisar(g)
    // A igual peso desempata el id, para que la lista no baile entre revisiones.
    expect(r.sinSap.map((h) => h.id)).toEqual(['manual:buchacas', 'manual:stunner', 'manual:flipper'])
    expect(r.sinSap.map((h) => h.peso)).toEqual([1, 1, 0.5])
  })

  it('un diagrama sano no reporta nada', () => {
    const g = planta()
    g.nodos = g.nodos.filter((n) => n.id !== 'climatizacion' && n.id !== 'manual:stunner')
    g.aristas = [
      ['in:eviscerado', 'chiller'],
      ['chiller', 'desangrador'],
    ]
    const r = revisar(g)
    expect(r.fueraDeLinea).toHaveLength(0)
    expect(r.enCirculo).toHaveLength(0)
    expect(r.sinSap).toHaveLength(0)
    expect(r.equipos).toBe(r.conFlujo)
  })
})
