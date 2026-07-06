/**
 * Versión de la aplicación
 * Mantener sincronizada con package.json y VERSION.md
 */
export const APP_VERSION = '3.84.0' as const
// Mantener sincronizada con apps/pwa/package.json y apps/pwa/public/version.json

/**
 * Fecha de la versión actual
 */
export const VERSION_DATE = '2026-07-06' as const

/**
 * Nombre de la versión (opcional)
 */
export const VERSION_NAME = 'fix(repuestos): nombres comunes editables desde el panel de detalle (antes solo columna desktop lg+, sin camino en móvil)' as const

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
