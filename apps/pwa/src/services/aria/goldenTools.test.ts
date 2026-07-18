/**
 * Golden-questions (C) — no-regresión de la SELECCIÓN de tools.
 *
 * La capa LLM (selectedTools) no es determinista → no se testea acá. Lo que SÍ
 * se blinda es que:
 *  1. La capa regex (matchTools, vía resolveToolNames) siga cubriendo las
 *     preguntas canónicas que YA cubría.
 *  2. La UNIÓN regex + LLM (resolveToolNames con extraToolNames) funcione:
 *     dedup, cap, descartar tools inventadas, y que una tool elegida por el LLM
 *     que el regex NO detecta igual se ejecute (rompe el techo del regex).
 */
import { describe, it, expect } from 'vitest'
import { resolveToolNames, buildToolCatalog } from './contextEngine'

describe('resolveToolNames — unión regex + LLM (aditiva)', () => {
  it('regex solo: pregunta canónica dispara su tool', () => {
    // "producción total del día" → shift.dayProduction por trigger regex
    expect(resolveToolNames('cuánto se produjo hoy en total')).toContain('shift.dayProduction')
  })

  it('LLM rompe el techo: tool elegida por intención aunque el regex NO la detecte', () => {
    // Frase sin gatillo exacto de dayProduction; el LLM la elige igual.
    const msg = 'y sumando los tres turnos cómo cerramos'
    const soloRegex = resolveToolNames(msg)
    const conLLM = resolveToolNames(msg, ['shift.dayProduction'])
    expect(conLLM).toContain('shift.dayProduction')
    // Aporta cobertura que el regex no tenía
    expect(conLLM.length).toBeGreaterThanOrEqual(soloRegex.length)
  })

  it('descarta tools inventadas por el LLM (no están en el registry)', () => {
    const r = resolveToolNames('hola', ['tool.inexistente', 'otra.fake'])
    expect(r).not.toContain('tool.inexistente')
    expect(r).not.toContain('otra.fake')
  })

  it('dedup: LLM + regex que coinciden no duplican', () => {
    const r = resolveToolNames('cuánto se produjo hoy en total', ['shift.dayProduction'])
    expect(r.filter(n => n === 'shift.dayProduction')).toHaveLength(1)
  })

  it('cap: nunca más de 4 tools', () => {
    const r = resolveToolNames(
      'producción total del día y por qué está detenida y kpis y en vivo del turno',
      ['shift.dayProduction', 'shift.stops', 'shift.kpis', 'shift.live', 'shift.today'],
    )
    expect(r.length).toBeLessThanOrEqual(4)
  })

  it('LLM primero: la tool elegida por intención encabeza', () => {
    const r = resolveToolNames('cuánto se produjo hoy en total', ['shift.stops'])
    expect(r[0]).toBe('shift.stops')
  })
})

describe('buildToolCatalog — catálogo para el LLM', () => {
  it('lista tools clave con su descripción', () => {
    const cat = buildToolCatalog()
    expect(cat).toContain('shift.dayProduction:')
    expect(cat).toContain('shift.today:')
    expect(cat).toContain('shift.stops:')
  })
})
