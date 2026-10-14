/**
 * Mapea la ruta del router (pathname SIN el basename `/mantenimiento-planta/`)
 * a una clave CERRADA de módulo para el contador de vistas (`moduloVistas`).
 *
 * El conjunto es cerrado a propósito: la clave termina como nombre de campo en
 * Firestore y como lista blanca en `firestore.rules`. Si agregas una clave aquí,
 * agrégala también en `moduloVistasClaves()` de `firestore.rules` (hay un test
 * que verifica que ambas listas coincidan).
 */

export const MODULOS_VISTAS = [
  'inicio',
  'incidencias',
  'bitacora',
  'repuestos',
  'bodega',
  'analisis-turno',
  'monitor',
  'aprendizaje',
  'aprendizaje-hmi-knuro',
  'aprendizaje-hmi-grader',
  'aprendizaje-hmi-bombeo-s2',
  'aprendizaje-perilla-5',
  'aprendizaje-tarjeta-a3c',
  'aprendizaje-variadores',
  'aprendizaje-planos',
  'aprendizaje-maquina',
  'aprendizaje-baader-200',
  'inspecciones',
  'equipos',
  'aria',
  'admin',
  'otro',
] as const

export type ModuloVistas = (typeof MODULOS_VISTAS)[number]

/** Herramientas del Centro de Aprendizaje: segundo segmento tras `/aprendizaje/`. */
const HERRAMIENTAS_APRENDIZAJE: Record<string, ModuloVistas> = {
  'hmi-knuro': 'aprendizaje-hmi-knuro',
  'hmi-grader': 'aprendizaje-hmi-grader',
  'hmi-bombeo-s2': 'aprendizaje-hmi-bombeo-s2',
  'perilla-5': 'aprendizaje-perilla-5',
  variadores: 'aprendizaje-variadores',
  planos: 'aprendizaje-planos',
  maquina: 'aprendizaje-maquina',
  'baader-200': 'aprendizaje-baader-200',
  // única subruta hoy: /aprendizaje/baader-142/tarjeta-a3c
  'baader-142': 'aprendizaje-tarjeta-a3c',
}

const POR_PRIMER_SEGMENTO: Record<string, ModuloVistas> = {
  dashboard: 'inicio',
  incidents: 'incidencias',
  bitacora: 'bitacora',
  repuestos: 'repuestos',
  bodega: 'bodega',
  'analisis-grader': 'analisis-turno',
  monitor: 'monitor',
  inspections: 'inspecciones',
  equipment: 'equipos',
  'aria-actions': 'aria',
  admin: 'admin',
}

export function moduloDeRuta(pathname: string): ModuloVistas {
  const limpio = (pathname || '').split(/[?#]/)[0]?.toLowerCase() ?? ''
  const seg = limpio.split('/').filter(Boolean)
  const [primero, segundo] = seg
  if (primero === undefined) return 'inicio'

  if (primero === 'aprendizaje') {
    if (segundo === 'admin') return 'admin'
    if (segundo === undefined) return 'aprendizaje'
    return HERRAMIENTAS_APRENDIZAJE[segundo] ?? 'aprendizaje'
  }
  if (primero === 'baader-200' && segundo === 'learn') return 'aprendizaje-baader-200'
  if (primero === 'hmi' && segundo === 'learn') return 'aprendizaje-hmi-knuro'

  return POR_PRIMER_SEGMENTO[primero] ?? 'otro'
}
