/**
 * Versión de la aplicación
 * Mantener sincronizada con package.json y VERSION.md
 */
export const APP_VERSION = '2.74.0' as const
// Mantener sincronizada con apps/pwa/package.json y apps/pwa/public/version.json




/**
 * Fecha de la versión actual
 */
export const VERSION_DATE = '2026-04-11' as const

/**
 * Nombre de la versión (opcional)
 */
export const VERSION_NAME = 'Grader iter 6: config física real (Marelec MS4/12) + Z2 dis1-12 + velocidades reales + resumen ejecutivo + insights físicos (gate sobrecargada, timing Z2 adyacente)' as const

/**
 * Nota:
 * Esta versión se sincroniza para pruebas vía GitHub Pages.
 */


/**
 * Información completa de la versión
 */
export const VERSION_INFO = {
  version: APP_VERSION,
  date: VERSION_DATE,
  name: VERSION_NAME,
  fullName: `v${APP_VERSION} - ${VERSION_NAME}`,
} as const
