/**
 * Tipos para el módulo de Repuestos
 * Sistema multi-máquina con gestión de inventario y tags por evento
 */

import { Timestamp } from 'firebase/firestore';
import { TagAsignado } from './tags';
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

/**
 * Repuesto principal
 * Compatible con sistema legacy y nuevo con tags
 */
export interface Repuesto {
  id: string;
  codigoSAP: string;
  textoBreve: string;
  descripcion: string;
  nombreManual?: string; // Nombre según el manual del fabricante
  codigoBaader: string; // o código del fabricante
  
  // DEPRECATED: usar tags para cantidades por evento
  cantidadSolicitada: number;
  cantidadStockBodega: number;
  
  valorUnitario: number;
  total: number; // DEPRECATED: se calcula desde tags
  fechaUltimaActualizacionInventario: Date | null;
  
  // Sistema de tags: soporta formato antiguo (string) y nuevo (TagAsignado)
  tags: (string | TagAsignado)[];
  
  // Vínculos a páginas del manual con marcadores visuales
  vinculosManual: VinculoManual[];
  
  // Imágenes del manual y fotos reales
  imagenesManual: ImagenRepuesto[];
  fotosReales: ImagenRepuesto[];
  
  // Ficha Técnica y Galería (Extendido de Machine)
  technicalSpecs?: TechnicalSpecs;
  gallery?: MachineImage[];

  createdAt: Date;
  updatedAt: Date;
}

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
export type TechnicalDataType = 'motor' | 'pump' | 'conveyor' | 'reductor' | 'general';

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
}

/**
 * Formulario de repuesto
 */
export interface RepuestoFormData {
  codigoSAP: string;
  textoBreve: string;
  descripcion?: string;
  nombreManual?: string;
  codigoBaader: string;
  cantidadSolicitada: number; // DEPRECATED
  valorUnitario: number;
  cantidadStockBodega: number; // DEPRECATED
  tags?: (string | TagAsignado)[]; // soporta ambos formatos
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
 * Fila del Excel de importación
 */
export interface ImportCantidadRow {
  codigoSAP?: string;
  codigoBaader?: string;
  textoBreve?: string;
  descripcion?: string;
  cantidad: number;
  valorUnitario?: number;
  forceOverride?: {
    codigoSAP?: boolean;
    codigoBaader?: boolean;
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
