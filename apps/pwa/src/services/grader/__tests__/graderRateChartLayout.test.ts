import { describe, it, expect } from 'vitest'
import {
  altoDelGrafico,
  ALTO_MIN_PLOT,
  ALTO_MAX_PLOT,
  altoDelTimeline,
} from '@/services/grader/graderRateChartLayout'

/**
 * El gráfico de tasa medía **1.109 × 123 px (ratio 9:1) a 1440 px de ancho**,
 * más bajo que los 138 px del mismo gráfico en un teléfono, porque el alto
 * dependía SOLO de cuántas filas ocupaba la leyenda: en PC entra en una sola.
 */
describe('altoDelGrafico', () => {
  it('el teléfono queda exactamente como estaba', () => {
    // Medido en el navegador a 375 px: el contenedor da 294 px y la leyenda
    // ocupa 2 filas → 138 px. Es el número que no se puede mover.
    expect(altoDelGrafico(294, 2)).toBe(138)
    expect(altoDelGrafico(294, 2)).toBe(ALTO_MIN_PLOT + 2 * 15)
  })

  it('en PC el gráfico deja de encogerse al ensancharse', () => {
    // 1.109 px de contenedor con la leyenda en una fila. Antes: 123 px.
    const alto = altoDelGrafico(1109, 1)
    expect(alto).toBe(279)
    expect(1109 / alto).toBeLessThan(4.5)
  })

  it('la relación de aspecto se mantiene legible de tablet a PC', () => {
    for (const ancho of [682, 900, 1109]) {
      const ratio = ancho / altoDelGrafico(ancho, 1)
      expect(ratio).toBeLessThan(5)
      expect(ratio).toBeGreaterThan(2.5)
    }
  })

  it('el contenedor ancho del turno (1.760 px) no vuelve a achatarlo', () => {
    // Al subir el tope de la página a 1.760 px el gráfico pasó a 1.703 px de
    // ancho; con el techo viejo de 280 quedaba en ratio 5,8:1 — el mismo
    // achatamiento que este módulo evita, provocado por ensanchar la página.
    const alto = altoDelGrafico(1703, 1)
    expect(1703 / alto).toBeLessThan(4.5)
  })

  it('no crece sin fin en un monitor muy ancho', () => {
    expect(altoDelGrafico(4000, 1)).toBe(ALTO_MAX_PLOT + 15)
  })

  it('un ancho todavía sin medir cae en el piso, no en cero', () => {
    // `wrapWidth` arranca en 0 hasta que el ResizeObserver mide.
    expect(altoDelGrafico(0, 1)).toBe(ALTO_MIN_PLOT + 15)
  })

  it('cada fila de leyenda suma su alto sin comerse el plot', () => {
    expect(altoDelGrafico(1109, 3) - altoDelGrafico(1109, 1)).toBe(30)
  })
})

/**
 * El timeline del turno tenía alto FIJO (320 px). Con el contenedor del turno
 * en 1.760 px pasó a 1.689 px de ancho: ratio 5,3:1 para barras minuto a minuto
 * de 8 h con su riel de eventos.
 */
describe('altoDelTimeline', () => {
  it('el teléfono y 1440 px quedan exactamente como estaban', () => {
    // Su piso NO es el del gráfico de tasa: es el alto que ya tenía.
    expect(altoDelTimeline(278, false)).toBe(320)
    expect(altoDelTimeline(1223, false)).toBe(320)
    expect(altoDelTimeline(278, true)).toBe(360)
  })

  it('en un monitor ancho deja de estar achatado', () => {
    const alto = altoDelTimeline(1689, false)
    expect(alto).toBeGreaterThan(320)
    expect(1689 / alto).toBeLessThan(4.5)
  })

  it('el eje del scatter nunca lo deja más bajo que sin él', () => {
    for (const ancho of [278, 1223, 1689, 4000]) {
      expect(altoDelTimeline(ancho, true)).toBeGreaterThanOrEqual(altoDelTimeline(ancho, false))
    }
  })
})
