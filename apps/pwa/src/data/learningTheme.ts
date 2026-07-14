/**
 * learningTheme — Paleta del módulo Centro de Aprendizaje (dark + AquaChile).
 *
 * Fuente de verdad compartida entre el hub público (LearningHubPage) y el
 * editor admin (LearningAdminMachinePage / LearningAdminPage), para que ambas
 * superficies del módulo compartan una misma identidad visual, distinta del
 * shell industrial genérico de la app.
 *
 * Colores corporativos AquaChile (azulMedio #2E75B6, azulClaro #9DC3E6 —
 * fuente: utils/exportETTWord.ts). Neutros tintados hacia el azul de marca.
 */
// Desde el tema claro/oscuro global (2026-07): cada color es una VARIABLE CSS
// definida en index.css (`--lc-*`, con valores para `:root` claro y `.dark`).
// Así el hub, el admin y los primitives cambian de tema sin tocar sus 60+
// estilos inline. ⚠ Por eso un valor LC ya NO es un hex parseable: no usarlo
// con `tint()` ni concatenarle alfa (`${LC.x}18`); para canvas/echarts usar
// colores resueltos, no LC.
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
