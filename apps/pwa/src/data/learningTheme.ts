/**
 * learningTheme — nombres de color del módulo Centro de Aprendizaje.
 *
 * Desde la vara iOS 27 (2026-09, DESIGN.md) el módulo NO tiene paleta propia: cada
 * nombre es una variable CSS `--lc-*` que en index.css es un ALIAS del token del
 * sistema (fondos/tinta neutros, acento = marca, estados = tinta + tinte 15 %).
 * Se conservan los nombres para no tocar los ~550 estilos inline del hub, el editor
 * admin, Variadores, Perilla 5 y Planos eléctricos.
 *
 * ⚠ Un valor LC no es un hex parseable: no usarlo con `tint()` ni concatenarle alfa
 * (`${LC.x}18`); para canvas/echarts usar colores resueltos, no LC.
 */
export const LC = {
  // Fondos (de más oscuro a más claro)
  bg:        'var(--lc-bg)',
  bgPanel:   'var(--lc-bg-panel)',
  surface:   'var(--lc-surface)',
  surfaceHi: 'var(--lc-surface-hi)',
  // Tinta / texto
  ink:       'var(--lc-ink)',
  inkMid:    'var(--lc-ink-mid)',
  inkLo:     'var(--lc-ink-lo)',
  inkGhost:  'var(--lc-ink-ghost)',
  // Acento AquaChile
  aqua:      'var(--lc-aqua)',
  aquaBright:'var(--lc-aqua-bright)',
  aquaLight: 'var(--lc-aqua-light)',
  aquaSoft:  'var(--lc-aqua-soft)',
  // Bordes
  border:    'var(--lc-border)',
  borderHi:  'var(--lc-border-hi)',
  // Estados semánticos del MÓDULO (contenido/UI)
  danger:    'var(--lc-danger)',
  dangerSoft:'var(--lc-danger-soft)',
  prep:      'var(--lc-prep)',
  prepSoft:  'var(--lc-prep-soft)',
  nuevo:     'var(--lc-nuevo)',
  nuevoSoft: 'var(--lc-nuevo-soft)',
  // Estado de STOCK — en oscuro, mismos valores que Repuestos (emerald/amber/red 500).
  ok:        'var(--lc-ok)',
  okSoft:    'var(--lc-ok-soft)',
  warn:      'var(--lc-warn)',
  warnSoft:  'var(--lc-warn-soft)',
  crit:      'var(--lc-crit)',
  // Favorito
  star:      'var(--lc-star)',
} as const

export type LearningColorKey = keyof typeof LC

/** Devuelve un color con opacidad (rgba). Reemplaza el patrón `${color}18` disperso;
 *  usar SOLO para los tints legítimos (fondo de estado activo, no para teñir todo). */
export function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
