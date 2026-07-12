/**
 * commonPartsByMachine — lista CURADA y COMPARTIDA de "repuestos comunes / más
 * usados" por máquina del Centro de Aprendizaje.
 *
 * Fuente única: esta config (keyed por slug de learningMachines). Se muestra en:
 *   - la ficha de aprendizaje, pestaña "Repuestos comunes" (con foto/stock reales
 *     resueltos por código SAP contra el maestro `repuestos`), y
 *   - el módulo Repuestos, como distintivo "común" (ver isCommonPartSap).
 *
 * Los datos de cada repuesto (foto, stock, ubicación) NO se duplican acá: se
 * resuelven en vivo por `sap` contra la colección `repuestos` (docId = codigoSAP).
 * Acá solo vive la CURACIÓN (qué repuestos son comunes de cada máquina + su orden
 * y agrupación por tipo), tal como la definió Mantención.
 *
 * MIGRACIÓN 2026-07-12: los repuestos comunes ahora se editan desde la UI
 * (campo `comunEn` en el doc `repuestos`, ver script scripts/seed-comun-baader142.js
 * y la acción "Marcar como común" del módulo Repuestos). Esta config quedó SOLO como
 * fallback para piezas de la planilla que NO existen en el maestro `repuestos` (y por
 * eso no se pueden marcar por UI). Se agrupan por su `tipo` real del maestro; estas
 * 2 llevan un tipo manual para caer en el mismo grupo.
 */

export interface CommonPart {
  /** Familia para agrupar (RESORTES, CORREAS, CUCHILLOS, REPUESTOS, SENSORES, ...). */
  tipo: string
  nombre: string
  /** Código SAP (clave para resolver el repuesto real: docId del maestro). */
  sap: string
  /** Segundo SAP equivalente, si la planilla lista dos. */
  sapAlt?: string
  /** Código del catálogo de recambios del fabricante, si lo hay. */
  codigoManual?: string
}

export const COMMON_PARTS_BY_MACHINE: Record<string, CommonPart[]> = {
  // Solo las 2 piezas de la planilla que NO existen en el maestro `repuestos` (no
  // se pueden marcar por UI). Las otras 25 se migraron a `comunEn` en Firestore y
  // se editan desde el módulo Repuestos. `tipo` en el mismo estilo del maestro
  // (singular) para agrupar junto a las marcadas.
  'baader-142': [
    { tipo: 'CORREA', nombre: 'Correa 835 5M', sap: '3300035260' },
    { tipo: 'REPUESTO', nombre: 'Punto de engrase (ancho)', sap: '3300027307', codigoManual: '1424101003' },
  ],
}

/** Lista curada de repuestos comunes de una máquina (vacía si no hay). */
export function getCommonParts(slug: string): CommonPart[] {
  return COMMON_PARTS_BY_MACHINE[slug] ?? []
}

/** Todos los códigos SAP que son "comunes" de alguna máquina (para el badge en Repuestos). */
const COMMON_SAPS: Set<string> = new Set(
  Object.values(COMMON_PARTS_BY_MACHINE)
    .flat()
    .flatMap(p => [p.sap, p.sapAlt])
    .filter((s): s is string => !!s),
)

/** True si el SAP es repuesto común de alguna máquina (distintivo en el módulo Repuestos). */
export function isCommonPartSap(sap: string | undefined | null): boolean {
  return !!sap && COMMON_SAPS.has(String(sap).trim())
}

/** Slugs de máquinas para las que ese SAP es común (para tooltip "común de: …"). */
export function machinesForCommonSap(sap: string): string[] {
  return Object.entries(COMMON_PARTS_BY_MACHINE)
    .filter(([, parts]) => parts.some(p => p.sap === sap || p.sapAlt === sap))
    .map(([slug]) => slug)
}
