/**
 * Versión de la aplicación
 * Mantener sincronizada con package.json y VERSION.md
 */
export const APP_VERSION = '3.89.1' as const
// Mantener sincronizada con apps/pwa/package.json y apps/pwa/public/version.json

/**
 * Fecha de la versión actual
 */
export const VERSION_DATE = '2026-07-10' as const

/**
 * Nombre de la versión (opcional)
 */
export const VERSION_NAME = 'fix(hmi-grader): teclado no interfiere con inputs reales + árbol de Cambiar Parametros con expand/collapse real' as const

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
