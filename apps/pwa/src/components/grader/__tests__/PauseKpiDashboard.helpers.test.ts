/**
 * Tests para los helpers puros exportados de PauseKpiDashboard.
 *
 * Estos cálculos son los que diferencian "tiempo evitable vs ineludible"
 * — métrica accionable según el principio "info útil" (CLAUDE.md).
 */

import { describe, it, expect } from 'vitest'
import { summarizeByCategory } from '@/services/grader/pauseKpiAnalytics'

describe('summarizeByCategory — agrega tiempo muerto por categoría', () => {
  it('agrupa por operacional vs organizacional vs sin_clasificar', () => {
    const breakdown = {
      'colacion':     3600,   // organizacional: 1h
      'limpieza':     1800,   // organizacional: 30min
      'mantencion':   2400,   // operacional: 40min
      'falla_equipo': 1200,   // operacional: 20min
      '__sin_tag':    600,    // sin clasificar: 10min
    }
    const r = summarizeByCategory(breakdown)
    expect(r.organizationalSec).toBe(5400)  // 3600 + 1800
    expect(r.operationalSec).toBe(3600)     // 2400 + 1200
    expect(r.unclassifiedSec).toBe(600)
    expect(r.totalSec).toBe(9600)
  })

  it('tags desconocidos van al bucket "sin clasificar" (no asume nada)', () => {
    const breakdown = {
      'colacion':     1800,
      'tag_inventado': 600,
    }
    const r = summarizeByCategory(breakdown)
    expect(r.organizationalSec).toBe(1800)
    expect(r.operationalSec).toBe(0)
    expect(r.unclassifiedSec).toBe(600)
  })

  it('breakdown vacío retorna ceros', () => {
    expect(summarizeByCategory({})).toEqual({
      operationalSec: 0,
      organizationalSec: 0,
      unclassifiedSec: 0,
      totalSec: 0,
    })
  })

  it('solo operacionales — totalSec ≡ operationalSec', () => {
    const r = summarizeByCategory({ mantencion: 1000, falla_equipo: 500 })
    expect(r.operationalSec).toBe(1500)
    expect(r.organizationalSec).toBe(0)
    expect(r.unclassifiedSec).toBe(0)
    expect(r.totalSec).toBe(1500)
  })

  it('solo organizacionales — totalSec ≡ organizationalSec', () => {
    const r = summarizeByCategory({ colacion: 3600, ejercicios: 600 })
    expect(r.organizationalSec).toBe(4200)
    expect(r.operationalSec).toBe(0)
  })

  it('caso real: turno típico con colación dominante', () => {
    // ~10h turno, ~1h colación, ~10min falla, resto productivo
    const breakdown = {
      'colacion':     3600,
      'falla_equipo': 600,
    }
    const r = summarizeByCategory(breakdown)
    // 14% es atacable (600/4200), 86% es ineludible
    expect(r.operationalSec / r.totalSec).toBeCloseTo(600 / 4200, 3)
    expect(r.organizationalSec / r.totalSec).toBeCloseTo(3600 / 4200, 3)
  })
})
