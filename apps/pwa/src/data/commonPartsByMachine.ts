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
  // VACÍO a propósito: la lista de repuestos comunes ahora vive 100% en Firestore
  // (campo `comunEn` del doc `repuestos`, editable desde el módulo Repuestos). Los
  // 27 del Baader 142 se migraron ahí (script seed-comun-baader142.js) y los 2 que
  // faltaban se crearon en el maestro (crear-2-comunes-baader142.js). Esta config
  // queda solo como fallback si alguna vez hay que sembrar una pieza sin doc.
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
