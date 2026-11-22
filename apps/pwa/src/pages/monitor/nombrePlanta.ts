/**
 * Nombres del monitor público, calculados al mostrar desde `plantLineId` (o `plantSlug` si falta).
 * Nunca se leen los rótulos guardados en el documento (`areaLabel`, `lineLabel`, `machineKindLong`): así no hace
 * falta migrar los docs que ya existen. Módulo puro: sin React ni Firestore.
 */
import { PLANT_LINES, type PlantId, type PlantLineConfig } from '@/config/plantLines'

/** Nombre corto de la planta para los títulos: «Principal · Eviscerado», «Yal · Eviscerado». */
export const PLANTA_CORTA: Partial<Record<PlantId, string>> = { principal: 'Principal', yal: 'Yal' }

/** Orden fijo del selector: Eviscerado, Filete, Yal (no alfabético). */
export const ORDEN_SELECTOR: readonly string[] = ['chonchi-eviscerado', 'chonchi-filete', 'yal-eviscerado']

/** La línea de un monitor: por `plantLineId`; sin él, por `plantSlug` (la primera línea de esa planta). */
export function lineaDeMonitor(plantLineId: string | null | undefined, plantSlug?: string | null): PlantLineConfig | null {
  return PLANT_LINES.find((l) => l.id === plantLineId)
    ?? (plantSlug ? PLANT_LINES.find((l) => l.plantSlug === plantSlug) : undefined)
    ?? null
}

/** `${PLANTA_CORTA[plant]} · ${areaLabel}`: el h1 del monitor. Null si la línea no existe en la config. */
export function nombrePlanta(plantLineId: string | null | undefined, plantSlug?: string | null): string | null {
  const linea = lineaDeMonitor(plantLineId, plantSlug)
  if (!linea) return null
  return `${PLANTA_CORTA[linea.plant] ?? linea.label} · ${linea.areaLabel}`
}

/** Rótulo de la pestaña en el selector: «Eviscerado», «Filete», «Yal». */
export function rotuloSelector(linea: PlantLineConfig): string {
  return linea.plant === 'principal' ? linea.areaLabel : (PLANTA_CORTA[linea.plant] ?? linea.label)
}

/** Grupo de la pestaña: «Planta Principal» o «Referencia» (Yal, que mantiene otro equipo). */
export function grupoDeLinea(linea: PlantLineConfig): { clave: 'principal' | 'referencia'; titulo: string; tituloCorto: string } {
  return linea.plant === 'principal'
    ? { clave: 'principal', titulo: 'Planta Principal', tituloCorto: 'Principal' }
    : { clave: 'referencia', titulo: 'Referencia', tituloCorto: 'Referencia' }
}

/** El subtítulo de la máquina: «Evisceradora Baader 142», «Baader 200 · Línea 1». Quita el «de <área>» final. */
export function subtituloMaquina(linea: PlantLineConfig, machineLong: string): string {
  return machineLong.replace(` de ${linea.areaLabel}`, '')
}

/** Posición en el orden fijo del selector; las líneas desconocidas van al final. */
export function ordenSelector(plantLineId: string): number {
  const i = ORDEN_SELECTOR.indexOf(plantLineId)
  return i === -1 ? ORDEN_SELECTOR.length : i
}
