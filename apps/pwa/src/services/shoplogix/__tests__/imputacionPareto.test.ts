/**
 * Tests del pareto por categoría.
 *
 * El turno de referencia reproduce la mezcla real de Yal julio 2026 a escala:
 * las mismas causales, en la misma proporción de dueños.
 */

import { describe, it, expect } from 'vitest'
import { paretoByCategoria, SIN_CAUSAL } from '../imputacionPareto'

const st = (type: string, reason: string, min: number, name = 'Detencion') =>
  ({ type, name, reason, durationSec: min * 60 })

describe('paretoByCategoria', () => {
  it('agrupa por categoría del árbol y ordena por impacto', () => {
    const p = paretoByCategoria([
      st('uptime', '', 300),
      st('break', 'COLACION', 60),
      st('downtime', 'FALTA MMPP', 40),
      st('downtime', 'LOGICA', 20),
      st('downtime', 'AJUSTE MANTENIMIENTO', 10),
    ])
    expect(p.categorias.slice(0, 4).map((c) => c.label)).toEqual([
      'Paros Programados', 'MMPP', 'Falla Eléctrica', 'Operacionales',
    ])
    expect(p.totalSec).toBe(130 * 60)
  })

  it('excluye uptime y Planned Downtime del total', () => {
    const p = paretoByCategoria([
      st('uptime', '', 480),
      st('break', 'Planned Downtime', 600),
      st('downtime', 'AIRE', 15),
    ])
    expect(p.totalSec).toBe(15 * 60)
    expect(p.cobertura).toBe(1)
    expect(p.categorias.find((c) => c.label === SIN_CAUSAL)).toBeUndefined()
  })

  it('muestra las 6 categorías del árbol aunque el turno no tenga ninguna', () => {
    // Una categoría ausente es información: en julio nadie anotó una falla
    // mecánica. Esconder la fila la disfrazaría de inexistente.
    const p = paretoByCategoria([st('downtime', 'LOGICA', 10)])
    const labels = p.categorias.map((c) => c.label)
    expect(labels).toContain('Falla Mecánica')
    expect(p.categorias.find((c) => c.label === 'Falla Mecánica')?.durationSec).toBe(0)
    expect(labels).toHaveLength(6)
  })

  it('junta las causales ambiguas en su propio grupo y las marca', () => {
    const p = paretoByCategoria([st('downtime', 'BOMBAS', 30), st('downtime', 'CINTAS', 10)])
    const amb = p.categorias.find((c) => c.key === 'electrica|mecanica')
    expect(amb?.label).toBe('Eléctrica o Mecánica')
    expect(amb?.durationSec).toBe(40 * 60)
    expect(amb?.causales.map((c) => c.label)).toEqual(['Bombas', 'Cintas'])
    expect(amb?.causales.every((c) => c.ambigua)).toBe(true)
  })

  it('separa la micro detención del paro largo sin anotar', () => {
    const p = paretoByCategoria([
      st('downtime', '', 3, 'Micro Detencion'),
      st('downtime', '', 2, 'Micro Detencion'),
      st('downtime', '', 45, 'Detencion'),
    ])
    const sc = p.categorias.find((c) => c.label === SIN_CAUSAL)!
    expect(sc.causales.map((c) => [c.label, c.count])).toEqual([
      ['Detención (sin causal)', 1],
      ['Micro detención (sin causal)', 2],
    ])
    expect(p.cobertura).toBe(0)
  })

  it('cobertura = tiempo con causal / tiempo detenido', () => {
    const p = paretoByCategoria([
      st('downtime', 'FALTA MMPP', 90),
      st('downtime', '', 10, 'Detencion'),
    ])
    expect(p.imputadoSec).toBe(90 * 60)
    expect(p.cobertura).toBeCloseTo(0.9)
  })

  it('turno de Chonchi: nadie imputó nada → cobertura 0, sin dividir por cero', () => {
    const p = paretoByCategoria([st('uptime', '', 400), st('break', 'Planned Downtime', 600)])
    expect(p.totalSec).toBe(0)
    expect(p.cobertura).toBe(0)
  })

  it('la barra apilada reparte la categoría entre sus dueños', () => {
    // Paros Programados mezcla planificado (colación) con externo (cuota):
    // la misma categoría del árbol, dos dueños distintos en la cascada.
    const p = paretoByCategoria([
      st('break', 'COLACION', 60),
      st('break', 'CUMPLIMIENTO CUOTA', 20),
    ])
    const prog = p.categorias.find((c) => c.label === 'Paros Programados')!
    expect(prog.porDueno).toEqual([
      { bucket: 'planificado', durationSec: 3600 },
      { bucket: 'externo', durationSec: 1200 },
    ])
  })
})
