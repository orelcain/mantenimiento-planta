/**
 * Tipos para el módulo de Repuestos
 * Catálogo puro: Área → Equipo/Máquina → Lista de repuestos
 */

import { Timestamp } from 'firebase/firestore';
import { VinculoManual } from './vinculos';

/**
 * Imagen asociada a un repuesto
 */
export interface ImagenRepuesto {
  id: string;
  url: string;
  descripcion: string;
  orden: number;
  esPrincipal: boolean;
  tipo: 'manual' | 'real'; // manual: captura del PDF, real: foto del repuesto físico
  createdAt: Date;

  // Metadata opcional para debugging de compresión
  sizeOriginal?: number; // bytes
  sizeFinal?: number; // bytes del archivo subido
  formatFinal?: 'webp' | 'jpeg' | 'original';
  qualityFinal?: number;
  width?: number;
  height?: number;

  /** Trazabilidad: quién subió la foto (nombre del usuario). */
  subidaPor?: string;
}

/**
 * Historial de cambios de un repuesto
 */
export interface HistorialCambio {
  id: string;
  repuestoId: string;
  campo: string;
  valorAnterior: string | number | null;
  valorNuevo: string | number | null;
  fecha: Date;
}

/** Origen del repuesto en vista combinada equipo+máquina */
export type RepuestoSource = 'shared' | 'own'

/**
 * Repuesto con origen — para vista combinada por equipo
 * `shared` = heredado de la máquina vinculada (machines/{id}/repuestos)
 * `own` = propio del equipo SAP individual (hierarchy/{nodeId}/repuestos)
 */
export interface EquipmentRepuesto extends Repuesto {
  source: RepuestoSource
  sourceCollection: string
}

/**
 * Repuesto principal — Catálogo puro
 * "Esta máquina usa estos repuestos"
 */
export interface Repuesto {
  id: string;
  codigoSAP: string;
  textoBreve: string;
  descripcion: string;
  /** Alias común — nombre con el que los técnicos conocen la pieza */
  alias?: string;
  /** Nombres comunes / apodos por los que los técnicos buscan la pieza */
  nombresComunes?: string[];
  nombreManual?: string; // Nombre según el manual del fabricante
  codigoFabricante: string; // o código del fabricante
  
  valorUnitario: number;

  /** Cuántas unidades de este repuesto usa la máquina (BOM simplificado) */
  cantidadPorMaquina: number;
  /** Dónde se encuentra/usa dentro de la máquina */
  ubicacionEnPlanta?: string;
  
  // Vínculos a páginas del manual con marcadores visuales
  vinculosManual: VinculoManual[];

  /** Posición confirmada manualmente en el diagrama del manual (ej. "55") */
  posicionManual?: string;
  
  // Imágenes del manual y fotos reales
  imagenesManual: ImagenRepuesto[];
  fotosReales: ImagenRepuesto[];
  
  /** Observaciones o notas adicionales del repuesto */
  observaciones?: string;

  // Campos del catálogo maestro (Excel)
  /** Tipo de repuesto: RODAMIENTO, SELLO/JUNTA, SENSOR, MOTOR, etc. */
  tipo?: string;
  /** Sección del equipo a la que pertenece el repuesto */
  seccion?: string;
  /** Número de serie del equipo (para repuestos específicos de una unidad) */
  numeroSerie?: string;

  // Ficha Técnica y Galería (Extendido de Machine)
  technicalSpecs?: TechnicalSpecs;
  gallery?: MachineImage[];

  /** Stock físico actual (unidades en bodega) — sincronizado con Mini App bot */
  stockFisico?: number;
  /** Cantidad mínima de stock — alerta si stockFisico < stockMinimo */
  stockMinimo?: number;

  // ── Colección plana `repuestos` (normalización 2026-06, modelo N:M) ──
  /** nodeIds de `hierarchy` donde sirve este repuesto (un SAP = un doc = un stock) */
  equipos?: string[];
  /** Códigos SAP de esos nodos (denormalizado, para búsqueda/legibilidad) */
  equiposCodigos?: string[];
  /** Slugs de LEARNING_MACHINES para las que este repuesto es "común / más usado"
   *  (marca manual del técnico/admin; complementa la lista estática commonPartsByMachine).
   *  Se ve en la pestaña "Repuestos comunes" de Aprendizaje y con el badge "común" acá. */
  comunEn?: string[];
  /** Sub-repuestos: docId del repuesto padre en la colección plana */
  parentRepuestoId?: string | null;
  /** Marca física (repuestos migrados desde plantAssets: motores/bombas) */
  marca?: string;
  /** Modelo/tipo físico (ej. RNYM08-1320B-30) */
  modeloTipo?: string;

  // ── Maestro unificado de materiales (Fase 6, 2026-06) ──
  /** Clasificación del material (deriva de familia SAP; equipo-bound → 'repuesto') */
  clase?: MaterialClase;
  /** ¿tiene código SAP real? (derivado — tier 1 ordenable vs tier 2 despiece) */
  tieneSap?: boolean;
  /** Familia / sub-familia SAP (del maestro absorbido de insumos) */
  familia?: string;
  subFamilia?: string;
  /** Unidad de medida SAP (UN, pza, etc.) */
  unidad?: string;
  /** Manuales/datasheets propios del material (además de los heredados del equipo) */
  manualesPropios?: { titulo: string; url: string }[];

  createdAt: Date;
  updatedAt: Date;
}

/** Clase de material en el maestro unificado (repuesto·insumo·herramienta·…). */
export type MaterialClase =
  | 'repuesto'
  | 'insumo'
  | 'herramienta'
  | 'quimico'
  | 'lubricante'
  | 'refrigeracion';

/** Etiqueta legible + estilo de cada clase, para badges en la UI. */
export const CLASE_LABEL: Record<MaterialClase, string> = {
  repuesto: 'Repuesto',
  insumo: 'Insumo',
  herramienta: 'Herramienta',
  quimico: 'Químico',
  lubricante: 'Lubricante',
  refrigeracion: 'Refrigeración',
};

/**
 * Categoría de máquinas (ahora con soporte para jerarquías)
 */
export interface MachineCategory {
  id: string; // slug: "maquinas-principales", "motores-bombas"
  nombre: string; // "Máquinas Principales"
  descripcion?: string;
  icono: string; // nombre del ícono de lucide-react: "Factory", "Zap", "Link"
  orden: number; // orden de visualización
  activa: boolean;
  visible: boolean; // mostrar como tab en la UI (false para jerarquía interna)
  parentId?: string | null; // ID de la categoría padre (para subcategorías)
  nivel?: number; // 0=raíz, 1=subcategoría, 2=sub-subcategoría
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Máquina/Equipo individual
 */
export interface Machine {
  id: string; // slug: "baader-200", "marel-i-cut"
  nombre: string; // "Baader 200"
  marca: string; // "Baader"
  modelo: string; // "200"
  descripcion?: string;
  categoryId?: string | null; // ID de la categoría de repuestos: "motores-bombas", "cintas-transportadoras"
  hierarchyNodeId?: string; // ID del nodo en la jerarquía técnica (colección 'hierarchy')
  hierarchyPath?: string; // Path legible: "CHONCHI > ACOPIO > TRATAMIENTO AGUAS"
  activa: boolean; // si está activa o archivada
  color: string; // color para la UI (hex): "#3b82f6"
  orden: number; // orden de visualización
  manuals?: string[]; // URLs de los manuales PDF
  infografias?: string[]; // URLs de infografías/diagramas
  
  // Ficha Técnica y Galería
  technicalSpecs?: TechnicalSpecs;
  gallery?: MachineImage[];

  createdAt: Date;
  updatedAt?: Date;
}

//Tipos para Ficha Técnica y Galería
export type TechnicalDataType =
  | 'motor' | 'bomba' | 'reductor' | 'cinta'
  | 'valvula' | 'sensor' | 'cilindro' | 'compresor'
  | 'intercambiador' | 'filtro' | 'general'
  // legacy aliases (backward compat)
  | 'pump' | 'conveyor';

export interface TechnicalDataField {
  id: string;
  label: string;
  value: string;
  isCustom: boolean;
}

export interface TechnicalSpecs {
  type: TechnicalDataType;
  // Valores de los campos estandar (Potencia, RPM, etc)
  standardValues: Record<string, string | number>;
  // Campos adicionales creados por el usuario
  customFields: TechnicalDataField[];
  notes?: string;
  updatedAt: number;
}

export interface MachineImage {
  id: string;
  url: string;
  type: 'plate' | 'equipment' | 'part' | 'other';
  timestamp: number;
  notes?: string;
  // Metadata de archivo
  size?: number; // bytes
  format?: string;
  dimensions?: { width: number; height: number };
  /** Trazabilidad: quién subió la imagen (nombre del usuario). */
  uploadedBy?: string;
}

/**
 * Estado del contexto de máquinas
 */
export interface MachineContextType {
  currentMachine: Machine | null;
  machines: Machine[];
  loading: boolean;
  setCurrentMachine: (machineId: string) => Promise<void>;
  setCurrentMachineDirect: (machine: Machine) => void;
  clearCurrentMachine: () => void;
}

/**
 * Formulario de repuesto — Catálogo puro
 */
export interface RepuestoFormData {
  codigoSAP: string;
  textoBreve: string;
  descripcion?: string;
  nombreManual?: string;
  codigoFabricante: string;
  /** Clase del material (insumo/repuesto/herramienta/…). Se persiste vía `extra` en el create. */
  clase?: MaterialClase;
  valorUnitario: number;
  /** Cuántas unidades de este repuesto usa la máquina */
  cantidadPorMaquina: number;
  /** Dónde se encuentra/usa dentro de la máquina */
  ubicacionEnPlanta?: string;
  /** Observaciones o notas adicionales */
  observaciones?: string;
  // ── Stock de bodega (NO va al doc del repuesto; se escribe en `bodega` por SAP) ──
  /** Stock inicial al crear (solo con SAP). */
  stockInicial?: number;
  /** Stock mínimo de alerta (solo con SAP). */
  stockMinimo?: number;
  /** Ubicación física en bodega (solo con SAP). */
  ubicacionBodega?: string;
}

/**
 * Datos de exportación
 */
export interface ExportData {
  repuestos: Repuesto[];
  includeImages: boolean;
  format: 'excel' | 'pdf';
}

/**
 * Fila del Excel de importación — Catálogo puro
 */
export interface ImportCatalogoRow {
  codigoSAP?: string;
  codigoFabricante?: string;
  textoBreve?: string;
  descripcion?: string;
  valorUnitario?: number;
  cantidadPorMaquina?: number;
  ubicacionEnPlanta?: string;
  observaciones?: string;
  forceOverride?: {
    codigoSAP?: boolean;
    codigoFabricante?: boolean;
    textoBreve?: boolean;
    descripcion?: boolean;
    valorUnitario?: boolean;
  };
}

// === MAPAS DE PLANTA ===

export interface PlantMap {
  id: string;
  nombre: string;
  imageUrl: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface PlantMapAreaPoint {
  x: number; // 0-1
  y: number; // 0-1
}

export type PlantMapAreaShape =
  | {
      kind: 'circle';
      cx: number; // 0-1
      cy: number; // 0-1
      r: number; // normalizado a ancho (fitW)
    }
  | {
      kind: 'polygon';
      points: PlantMapAreaPoint[];
    };

export interface PlantMapArea {
  id: string;
  mapId: string;
  nombre: string;
  visible: boolean;
  fillOpacity: number; // 0..1
  strokeOpacity: number; // 0..1
  shape: PlantMapAreaShape;
  createdAt: Date;
  updatedAt?: Date;
}

export interface PlantMarker {
  id: string;
  mapId: string;
  x: number; // 0-1
  y: number; // 0-1
  label?: string;
  createdAt: Date;
}

// === ACTIVOS DE PLANTA (MOTORES / BOMBAS) ===

export type PlantAssetTipo = 'motor' | 'bomba';

export interface PlantAssetReferencia {
  id: string;
  titulo: string;
  url: string;
  createdAt: Date;
}

export interface PlantAssetImagen {
  id: string;
  url: string;
  descripcion: string;
  orden: number;
  esPrincipal: boolean;
  createdAt: Date;
}

export interface PlantAsset {
  id: string;
  tipo: PlantAssetTipo;
  equipo: string;
  area: string;
  subarea: string;
  /** ID del nodo en la jerarquía técnica (colección 'hierarchy'). Vínculo área-first. */
  hierarchyNodeId?: string;
  /** Path legible: "CHONCHI > PLANTA CHONCHI > PROCESO > EVISCERADO". */
  hierarchyPath?: string;
  componente: string;
  codigoSAP: string;
  descripcionSAP: string;
  marca: string;
  modeloTipo: string;
  potencia: string;
  voltaje: string;
  relacionReduccion: string;
  corriente: string;
  eje: string;
  // Datos específicos de bomba (opcionales)
  fabricaBomba?: string;
  modeloBomba?: string;
  serieBomba?: string;
  impellerBomba?: string;
  porVoltaje?: string;
  marcaBomba?: string;
  caudal?: string;
  presion?: string;
  rpm?: string;
  materialCarcasa?: string;
  materialImpeller?: string;
  sellos?: string;
  caudalM3h?: string; // m3/h
  alturaM?: string; // H (m)
  acople?: string;
  alturaBaseCentroEjeMm?: string; // mm
  observaciones: string;
  referencias: PlantAssetReferencia[];
  imagenes: PlantAssetImagen[];
  marcadores: PlantMarker[];
  createdAt: Date;
  updatedAt?: Date;
}

// === FUNCIONES AUXILIARES ===

/**
 * Convertir Timestamp de Firestore a Date
 */
export function timestampToDate(timestamp: Timestamp | Date | undefined | null): Date {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Sanitizar imagen para Firestore (remover undefined)
 */
export function sanitizeImagen(img: ImagenRepuesto): ImagenRepuesto {
  const cleaned = Object.fromEntries(
    Object.entries(img).filter(([, v]) => v !== undefined)
  ) as ImagenRepuesto;
  return cleaned;
}
