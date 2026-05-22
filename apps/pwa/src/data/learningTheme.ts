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
export const LC = {
  // Fondos (de más oscuro a más claro)
  bg:        '#0d1722',
  bgPanel:   '#0f1d2b',
  surface:   '#16242f',
  surfaceHi: '#1b2f3f',
  // Tinta / texto
  ink:       '#e9eef3',
  inkMid:    '#9db0c2',
  inkLo:     '#6d8298',
  inkGhost:  '#51677b',
  // Acento AquaChile
  aqua:      '#2E75B6',
  aquaBright:'#5aa6e8',
  aquaLight: '#9DC3E6',
  aquaSoft:  'rgba(46,117,182,0.16)',
  // Bordes
  border:    '#22384a',
  borderHi:  '#2f4d65',
  // Estados semánticos
  danger:    '#e0697d',
  dangerSoft:'rgba(224,105,125,0.14)',
  prep:      '#cf9f54',
  prepSoft:  'rgba(207,159,84,0.13)',
  nuevo:     '#3fb98f',
  nuevoSoft: 'rgba(63,185,143,0.14)',
  star:      '#f0c14b',
} as const

export type LearningColorKey = keyof typeof LC
