/**
 * graderHmiPractice — puente entre los runbooks Z2 y el simulador HMI Grader.
 *
 * Cada runbook con ruta de menú (`z2Path`) se mapea a un "target" navegable
 * del clon HMI (`/hmi-grader-embed.html`): la secuencia de pantallas y, si la
 * ruta entra al editor de parámetros, la zona + el parámetro a seleccionar.
 *
 * El botón "Practicar en el simulador" del expediente arma la URL
 * `/aprendizaje/hmi-grader?practica=<runbookId>`; HmiGraderPage la traduce a
 * un postMessage `hmi:goto` que el embed ejecuta con su propio navigateTo.
 *
 * Pedagogía deliberada: si la ruta real requiere la clave de servicio, el
 * simulador se detiene en la pantalla de login (como la máquina real) — la
 * clave es parte de lo que el procedimiento enseña. Tras ingresarla, el
 * editor se abre ya posicionado en el parámetro del runbook.
 */

export interface GraderHmiTarget {
  /** Paneles del embed a navegar en orden desde el home (ids de .panel). */
  screens: string[]
  /** Zona del editor de parámetros a abrir tras el login (id de PARAM_ZONES). */
  zone?: string
  /** Parámetro a seleccionar dentro de la zona (nombre exacto del campo Z2). */
  param?: string
  /** Etiqueta corta para el log del simulador. */
  label: string
}

/**
 * Mapeo runbook → target del clon. Solo runbooks cuya ruta Z2 EXISTE en el
 * clon (los físicos —presión de aire, SM221, motor tambor— y "Gate assignment"
 * —pantalla no clonada, sin pantallazo fuente— no tienen práctica simulada).
 */
export const GRADER_HMI_TARGETS: Record<string, GraderHmiTarget> = {
  'contrastacion-pocket': {
    screens: ['mn', 'servicio', 'cambiar-parametros-login'],
    zone: 'zone-pocket1',
    param: 'fsWc',
    label: 'Contrastación de pocket — ruta a fsWc',
  },
  'pocket-vacio-check': {
    // El check de tara se hace mirando los 4 indicadores del home.
    screens: [],
    label: 'Check de pocket vacío — indicadores del home',
  },
  'limpieza-fotocelula': {
    screens: ['mn', 'servicio', 'probar-entradas'],
    label: 'Verificación de fotocélula — Probar entradas',
  },
  'slow-mo-flipper': {
    screens: ['mn', 'servicio', 'probar-salidas'],
    label: 'Diagnóstico de flipper — Probar salidas',
  },
  'tachometro-cinta': {
    screens: ['mn', 'servicio', 'cambiar-parametros-login'],
    zone: 'zone-zbelt',
    param: 'deltaI',
    label: 'Tacómetro de cinta — Z-Belt / deltaI',
  },
  'ajuste-eye-sync': {
    screens: ['mn', 'servicio', 'cambiar-parametros-login'],
    zone: 'zone-sorting',
    param: 'inpEyeSync',
    label: 'Eye Sync — Sorting belt / inpEyeSync',
  },
}

/** Ids del adapter (`grader-procedure-X`, `grader-diagnosis-X`...) → id de runbook. */
export function runbookIdFromContentId(contentId: string): string {
  return contentId.replace(/^grader-(procedure|flow|diagnosis)-/, '')
}

/** URL de práctica si el runbook tiene target en el simulador; null si no. */
export function hmiPracticeUrl(contentOrRunbookId: string): string | null {
  const runbookId = runbookIdFromContentId(contentOrRunbookId)
  if (!GRADER_HMI_TARGETS[runbookId]) return null
  return `/aprendizaje/hmi-grader?practica=${runbookId}`
}

/**
 * Término del glosario (`GRADER_GLOSSARY`) → runbook cuyo target del simulador
 * ejemplifica ese concepto. Deja "ver en el simulador" en los términos que
 * apuntan a una pantalla real del clon; el resto queda como lectura.
 */
export const GLOSSARY_TERM_TO_RUNBOOK: Record<string, string> = {
  fsWc: 'contrastacion-pocket',
  eyeSync: 'ajuste-eye-sync',
  tachometro: 'tachometro-cinta',
  fotocelula: 'limpieza-fotocelula',
  flipper: 'slow-mo-flipper',
}

/** URL de práctica para un término del glosario; null si el término no la tiene. */
export function glossaryPracticeUrl(termKey: string): string | null {
  const runbookId = GLOSSARY_TERM_TO_RUNBOOK[termKey]
  return runbookId ? hmiPracticeUrl(runbookId) : null
}
