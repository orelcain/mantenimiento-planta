/**
 * Versión de la aplicación
 * Mantener sincronizada con package.json y VERSION.md
 */
export const APP_VERSION = '1.3.4' as const

/**
 * Fecha de la versión actual
 */
export const VERSION_DATE = '2025-12-26' as const

/**
 * Nombre de la versión (opcional)
 */
export const VERSION_NAME = 'Date Validation Fix' as const

/**
 * Información completa de la versión
 */
export const VERSION_INFO = {
  version: APP_VERSION,
  date: VERSION_DATE,
  name: VERSION_NAME,
  fullName: `v${APP_VERSION} - ${VERSION_NAME}`,
} as const
