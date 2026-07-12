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
 * baader-142: transcrito de la planilla oficial de planta "repuestos baader 142
 * mas comunes" (27 ítems). El `codigoManual` es el código del catálogo de
 * recambios Baader; `sapAlt` cubre los ítems con dos SAP equivalentes.
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
  'baader-142': [
    // RESORTES
    { tipo: 'Resortes', nombre: 'Resorte chapaleta de entrada', sap: '3300126381', codigoManual: '38010111' },
    { tipo: 'Resortes', nombre: 'Resorte de tracción (herramienta C)', sap: '3300111948', codigoManual: '38010068' },
    { tipo: 'Resortes', nombre: 'Resorte medidor largo', sap: '3300012407', codigoManual: '38010321' },
    { tipo: 'Resortes', nombre: 'Resorte de medidor de altura y centrador', sap: '3300012430', codigoManual: '38010604' },
    { tipo: 'Resortes', nombre: 'Resorte carros (abrazadera / mordaza)', sap: '3300011875', sapAlt: '3300106055', codigoManual: '38010160' },
    { tipo: 'Resortes', nombre: 'Resorte dedos palpadores', sap: '3300048553', codigoManual: '38010080' },
    // CORREAS
    { tipo: 'Correas', nombre: 'Correa 800 5M', sap: '3300084243' },
    { tipo: 'Correas', nombre: 'Correa 835 5M', sap: '3300035260' },
    { tipo: 'Correas', nombre: 'Correa registrador N° de revoluciones (encoder)', sap: '3300012306', codigoManual: '37750003' },
    { tipo: 'Correas', nombre: 'Correa circular sin fin verde', sap: '3300106148', codigoManual: '37230030' },
    { tipo: 'Correas', nombre: 'Correa cuchilla circular', sap: '3300011872', codigoManual: '37750006' },
    // CUCHILLOS
    { tipo: 'Cuchillos', nombre: 'Cuchilla membrana (aspirador)', sap: '3300011880', codigoManual: '1424101101' },
    { tipo: 'Cuchillos', nombre: 'Cuchilla guillotina', sap: '3300012256', codigoManual: '1424101003' },
    { tipo: 'Cuchillos', nombre: 'Cuchillo circular', sap: '3300012257', codigoManual: '94010405' },
    { tipo: 'Cuchillos', nombre: 'Cuchillo excavador A', sap: '3300105943', codigoManual: '1424102001' },
    { tipo: 'Cuchillos', nombre: 'Hoja móvil (guillotina)', sap: '3300012256', codigoManual: '1424201003' },
    // REPUESTOS
    { tipo: 'Repuestos', nombre: 'Eslabón cadena cinta prisma', sap: '3300035316', codigoManual: '37310123' },
    { tipo: 'Repuestos', nombre: 'Soporte empujador', sap: '3300115674', codigoManual: '1425703016' },
    { tipo: 'Repuestos', nombre: 'Pasador y perno expulsador', sap: '3300074792', codigoManual: '1421202029(28)' },
    { tipo: 'Repuestos', nombre: 'Bujes de expulsador', sap: '3300035285', codigoManual: '1421202012' },
    { tipo: 'Repuestos', nombre: 'Casquillo (polea superior cinta salida)', sap: '3300058572', codigoManual: '33442017' },
    { tipo: 'Repuestos', nombre: 'Punto de engrase (ancho)', sap: '3300027307', codigoManual: '1424101003' },
    // SENSORES
    { tipo: 'Sensores', nombre: 'Sensor herramienta C', sap: '3300098470', codigoManual: '42303107' },
    { tipo: 'Sensores', nombre: 'Sensor inductivo con cable', sap: '3300012350', codigoManual: '42303077' },
    { tipo: 'Sensores', nombre: 'Sensor sonda nivel tolva repaso', sap: '3300128967' },
    { tipo: 'Sensores', nombre: 'Sensor de flujo capacitivo IFM SI5004 (cable)', sap: '3300103402' },
    // BOMBA SOPLADORA
    { tipo: 'Bomba sopladora', nombre: 'Bomba de vacío sopladora SB 1100D0', sap: '3300083785' },
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
