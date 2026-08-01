/**
 * Tests de deriveSuggestions — función pura que genera el plan de acción.
 *
 * Cubrimos:
 *   - Acciones existentes según p0Pct y dominantCause (regresión)
 *   - Nuevas acciones basadas en contexto upstream (v2.99.2)
 *   - Magnitud del scatter convertida en sugerencia "investigar ritmo"
 */

import { describe, it, expect } from 'vitest'
import { deriveSuggestions } from '@/services/grader/actionPlanSuggestions'
import type { MachineImpact } from '@/services/shoplogix/shoplogixCorrelation'

describe('deriveSuggestions — base (sin context)', () => {
  it('agrega "P0 crítico" cuando p0Pct >= 4', () => {
    const out = deriveSuggestions(4.5, 'fuera_de_limites')
    expect(out.find(a => a.id === 'p0-critical-general')).toBeDefined()
  })

  it('NO agrega "P0 crítico" cuando p0Pct < 4', () => {
    const out = deriveSuggestions(3.9, 'fuera_de_limites')
    expect(out.find(a => a.id === 'p0-critical-general')).toBeUndefined()
  })

  it('agrega 3 acciones específicas para fuera_de_limites', () => {
    const out = deriveSuggestions(3.0, 'fuera_de_limites')
    expect(out.find(a => a.id === 'fl-calibration-terreno')).toBeDefined()
    expect(out.find(a => a.id === 'fl-config-limits-oficina')).toBeDefined()
    expect(out.find(a => a.id === 'fl-verify-species')).toBeDefined()
  })

  it('agrega "monitorear" cuando p0Pct ∈ [2,4) y no hay verificar', () => {
    const out = deriveSuggestions(2.5, null)
    expect(out.find(a => a.id === 'general-verify')).toBeDefined()
  })

  it('NO agrega "monitorear" cuando p0Pct >= 4 (porque ya hay critical-general)', () => {
    const out = deriveSuggestions(4.5, null)
    expect(out.find(a => a.id === 'general-verify')).toBeUndefined()
  })
})

describe('deriveSuggestions — context upstream (v2.99.2)', () => {
  function mkMachineImpact(overrides: Partial<MachineImpact> = {}): MachineImpact {
    return {
      machineid: 'e2-uuid',
      machineName: 'Evisceradora 2',
      pauseCount: 3,
      totalOverlapSec: 1800,
      ...overrides,
    }
  }

  it('agrega "Atender máquina top" cuando overlap >= 5 min', () => {
    const out = deriveSuggestions(2.5, null, {
      upstreamByMachine: [
        mkMachineImpact({ totalOverlapSec: 600 }),
        mkMachineImpact({ machineid: 'e3-uuid', machineName: 'Evisceradora 3', totalOverlapSec: 200 }),
      ],
      upstreamCausedDurSec: 400,
    })
    const action = out.find(a => a.id === 'upstream-attend-e2-uuid')
    expect(action).toBeDefined()
    // Nombre unificado: la planta les dice "Baader", no "Evisceradora".
    expect(action!.title).toContain('Baader 2')
    expect(action!.category).toBe('terreno')
    expect(action!.description).toContain('10 min')   // 600 sec → "10 min"
    // 600 de 800 (600+200) = 75%. El denominador es la SUMA de los solapes por
    // máquina, no la unión del tiempo muerto (400 acá): con la unión, dos
    // Baader paradas a la vez cubren el mismo paro del Grader y una sola daba
    // 150% — el caso real mostraba 114%.
    expect(action!.description).toContain('75%')
  })

  it('nunca informa una participación mayor al 100%', () => {
    // Caso real 31-jul-2026: la unión del tiempo muerto era MENOR que el solape
    // de una sola máquina, y el panel mostraba "114% del tiempo muerto".
    const out = deriveSuggestions(2.5, null, {
      upstreamByMachine: [mkMachineImpact({ totalOverlapSec: 4980 })],
      upstreamCausedDurSec: 4380,
    })
    const action = out.find(a => a.id === 'upstream-attend-e2-uuid')
    expect(action!.description).toContain('100%')
    expect(action!.description).not.toMatch(/1[1-9]\d%|[2-9]\d\d%/)
  })

  it('NO agrega "Atender máquina" si overlap < 5 min (no significativo)', () => {
    const out = deriveSuggestions(2.5, null, {
      upstreamByMachine: [mkMachineImpact({ totalOverlapSec: 200 })],
      upstreamCausedDurSec: 200,
    })
    expect(out.find(a => a.id?.startsWith('upstream-attend-'))).toBeUndefined()
  })

  it('severity=critical cuando overlap >= 30 min', () => {
    const out = deriveSuggestions(2.5, null, {
      upstreamByMachine: [mkMachineImpact({ totalOverlapSec: 1800 })],  // 30 min
      upstreamCausedDurSec: 1800,
    })
    const action = out.find(a => a.id === 'upstream-attend-e2-uuid')
    expect(action!.severity).toBe('critical')
  })

  it('severity=warning cuando overlap < 30 min', () => {
    const out = deriveSuggestions(2.5, null, {
      upstreamByMachine: [mkMachineImpact({ totalOverlapSec: 600 })],  // 10 min
      upstreamCausedDurSec: 1200,
    })
    const action = out.find(a => a.id === 'upstream-attend-e2-uuid')
    expect(action!.severity).toBe('warning')
  })

  it('agrega "investigar ritmo Baader" cuando scatter neg con magnitud >= 0.3', () => {
    const out = deriveSuggestions(2.5, null, {
      scatterSlope: { direction: 'neg', deltaP0_per_minus10cycles: 0.4 },
    })
    const action = out.find(a => a.id === 'scatter-baader-rate')
    expect(action).toBeDefined()
    expect(action!.category).toBe('oficina')
    expect(action!.description).toContain('+0.40')
  })

  it('NO agrega "investigar ritmo" cuando direction es flat', () => {
    const out = deriveSuggestions(2.5, null, {
      scatterSlope: { direction: 'flat', deltaP0_per_minus10cycles: 0.05 },
    })
    expect(out.find(a => a.id === 'scatter-baader-rate')).toBeUndefined()
  })

  it('NO agrega "investigar ritmo" cuando direction es pos (anti-intuitivo, no sirve como acción)', () => {
    const out = deriveSuggestions(2.5, null, {
      scatterSlope: { direction: 'pos', deltaP0_per_minus10cycles: -0.5 },
    })
    expect(out.find(a => a.id === 'scatter-baader-rate')).toBeUndefined()
  })

  it('NO agrega "investigar ritmo" cuando magnitud es < 0.3 (umbral de relevancia)', () => {
    const out = deriveSuggestions(2.5, null, {
      scatterSlope: { direction: 'neg', deltaP0_per_minus10cycles: 0.2 },
    })
    expect(out.find(a => a.id === 'scatter-baader-rate')).toBeUndefined()
  })

  it('combina sugerencias base + contexto upstream', () => {
    const out = deriveSuggestions(3.5, 'fuera_de_limites', {
      upstreamByMachine: [
        { machineid: 'e1', machineName: 'Evisceradora 1', pauseCount: 2, totalOverlapSec: 1200 },
      ],
      upstreamCausedDurSec: 1500,
      scatterSlope: { direction: 'neg', deltaP0_per_minus10cycles: 0.5 },
    })
    // Base: fl-* específicas
    expect(out.find(a => a.id === 'fl-calibration-terreno')).toBeDefined()
    // Context: máquina + scatter
    expect(out.find(a => a.id === 'upstream-attend-e1')).toBeDefined()
    expect(out.find(a => a.id === 'scatter-baader-rate')).toBeDefined()
  })

  it('sin context retorna solo sugerencias base (backward compat)', () => {
    const out = deriveSuggestions(2.0, null)
    expect(out.find(a => a.id?.startsWith('upstream-'))).toBeUndefined()
    expect(out.find(a => a.id === 'scatter-baader-rate')).toBeUndefined()
  })
})
