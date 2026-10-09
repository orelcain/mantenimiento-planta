/**
 * Tests para graderQualityColors.ts — fuente única de colores por calidad.
 *
 * Cubre matching canónico, normalización (case + chars no alfabéticos),
 * fallback, y consistencia entre representaciones hex / tailwind.
 */

import { describe, it, expect } from 'vitest'
import { qualityColorHex, qualityColorTextClass } from '../graderQualityColors'

describe('qualityColorHex', () => {
  it('matchea calidades canónicas exactas', () => {
    expect(qualityColorHex('premium')).toBe('#6366f1')
    expect(qualityColorHex('superior')).toBe('#10b981')
    expect(qualityColorHex('primera')).toBe('#3b82f6')
    expect(qualityColorHex('segunda')).toBe('#f59e0b')
    expect(qualityColorHex('tercera')).toBe('#f97316')
    expect(qualityColorHex('industrial')).toBe('#94a3b8')
    expect(qualityColorHex('descarte')).toBe('#ef4444')
    expect(qualityColorHex('grado')).toBe('#06b6d4')
    expect(qualityColorHex('d')).toBe('#71717a')
  })

  it('normaliza case y caracteres no alfabéticos', () => {
    expect(qualityColorHex('Primera')).toBe('#3b82f6')
    expect(qualityColorHex('PREMIUM')).toBe('#6366f1')
    expect(qualityColorHex('primera-A')).toBe('#3b82f6')
    expect(qualityColorHex('Premium A1')).toBe('#6366f1')
    expect(qualityColorHex('  segunda  ')).toBe('#f59e0b')
  })

  it('usa fallback cuando la calidad es desconocida o vacía', () => {
    expect(qualityColorHex('xxx')).toBe('#6366f1')
    expect(qualityColorHex('')).toBe('#6366f1')
    expect(qualityColorHex(undefined)).toBe('#6366f1')
    expect(qualityColorHex(null)).toBe('#6366f1')
  })
})

describe('qualityColorTextClass', () => {
  it('matchea calidades canónicas con la clase tailwind correspondiente', () => {
    // Sin las variantes `pizarra:` (solo casan con la paleta Pizarra) es la clase de siempre.
    const sinPizarra = (q: string) => qualityColorTextClass(q).split(' ').filter((c) => !c.startsWith('pizarra:')).join(' ')
    expect(sinPizarra('premium')).toBe('text-indigo-400')
    expect(sinPizarra('superior')).toBe('text-emerald-400')
    expect(sinPizarra('primera')).toBe('text-blue-400')
    expect(sinPizarra('segunda')).toBe('text-amber-400')
    expect(sinPizarra('tercera')).toBe('text-orange-400')
    expect(sinPizarra('industrial')).toBe('text-slate-400')
    expect(sinPizarra('descarte')).toBe('text-red-400')
    expect(sinPizarra('grado')).toBe('text-cyan-400')
    expect(sinPizarra('d')).toBe('text-zinc-400')
    // Con Pizarra: la rampa ordinal en las tres primeras; segunda/tercera con la tinta del acero
    // (--calidad-4/5 no llegan a 4,5:1 como texto); el resto, la tinta de su serie.
    expect(qualityColorTextClass('premium')).toContain('pizarra:text-[var(--calidad-1)]')
    expect(qualityColorTextClass('superior')).toContain('pizarra:text-[var(--calidad-2)]')
    expect(qualityColorTextClass('primera')).toContain('pizarra:text-[var(--calidad-3)]')
    expect(qualityColorTextClass('segunda')).toContain('pizarra:text-cat-1-ink')
    expect(qualityColorTextClass('tercera')).toContain('pizarra:text-cat-1-ink')
    expect(qualityColorTextClass('industrial')).toContain('pizarra:text-cat-4-ink')
    expect(qualityColorTextClass('descarte')).toContain('pizarra:text-cat-6-ink')
    expect(qualityColorTextClass('grado')).toContain('pizarra:text-cat-7-ink')
    expect(qualityColorTextClass('d')).toContain('pizarra:text-cat-5-ink')
  })

  it('fallback a text-muted-foreground cuando no hay match', () => {
    expect(qualityColorTextClass('xxx')).toBe('text-muted-foreground')
    expect(qualityColorTextClass('')).toBe('text-muted-foreground')
    expect(qualityColorTextClass(undefined)).toBe('text-muted-foreground')
  })
})

describe('Consistencia entre representaciones', () => {
  it('todas las calidades canónicas resuelven textClass non-fallback', () => {
    const canon = ['premium', 'superior', 'primera', 'segunda', 'tercera', 'industrial', 'descarte', 'grado', 'd']
    for (const q of canon) {
      expect(qualityColorTextClass(q)).not.toBe('text-muted-foreground')
    }
  })

  it('hex no-fallback para todas las calidades excepto premium (que coincide con el fallback)', () => {
    // premium es el caso especial: comparte hex (#6366f1) con el fallback —
    // intencional, ambos representan el mismo "concepto" de violeta indigo.
    const nonPremium = ['superior', 'primera', 'segunda', 'tercera', 'industrial', 'descarte', 'grado', 'd']
    for (const q of nonPremium) {
      expect(qualityColorHex(q)).not.toBe('#6366f1')
    }
    expect(qualityColorHex('premium')).toBe('#6366f1')
  })
})
