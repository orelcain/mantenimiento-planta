// ===================================
// TIPOS DEL MÓDULO DE REPUESTOS
// Migrado desde Repuestos-App
// ===================================

// Tag global con su tipo definido (solicitud o stock)
export interface TagGlobal {
  nombre: string;
  tipo: 'solicitud' | 'stock';
  createdAt?: Date;
}

// Tag asignado a un repuesto con cantidad específica del evento
export interface TagAsignado {
  nombre: string;                    // Nombre del tag/evento
  tipo: 'solicitud' | 'stock';       // A qué columna aplica (heredado del TagGlobal)
  cantidad: number;                  // Cantidad en este evento
  fecha: Date;                       // Cuándo se asignó/creó el evento
}

// Helper para verificar si es un TagGlobal
export function isTagGlobal(tag: unknown): tag is TagGlobal {
  return typeof tag === 'object' && tag !== null && 'nombre' in tag && 'tipo' in tag && !('cantidad' in tag);
}

// Tipo principal de Repuesto
export interface Repuesto {
  id: string;
  codigoSAP: string;
  textoBreve: string;
  descripcion: string;
  nombreManual?: string;  // Nombre según el manual
  codigoBaader: string;
  cantidadSolicitada: number;       // DEPRECATED: usar tags para cantidades por evento
  valorUnitario: number;
  total: number;                     // DEPRECATED: se calcula desde tags
  cantidadStockBodega: number;       // DEPRECATED: usar tags para cantidades por evento
  fechaUltimaActualizacionInventario: Date | null;
  tags: (string | TagAsignado)[];    // Soporta formato antiguo (string) y nuevo (TagAsignado)
  vinculosManual: VinculoManual[];
  imagenesManual: ImagenRepuesto[];
  fotosReales: ImagenRepuesto[];
  createdAt: Date;
  updatedAt: Date;
}

// Helper para verificar si un tag es del nuevo formato
export function isTagAsignado(tag: string | TagAsignado): tag is TagAsignado {
  return typeof tag === 'object' && tag !== null && 'nombre' in tag && 'cantidad' in tag;
}

// Helper para obtener el nombre de un tag (compatible con ambos formatos)
export function getTagNombre(tag: string | TagAsignado): string {
  return typeof tag === 'string' ? tag : tag.nombre;
}

// Vínculo a página/área del manual PDF con marcador visual
export interface VinculoManual {
  id: string;
  pageNumber: number;
  area: { x: number; y: number; width: number; height: number };
  descripcion: string;
  createdAt: Date;
}

// Imagen asociada al repuesto
export interface ImagenRepuesto {
  id: string;
  url: string;
  descripcion: string;
  orden: number;
  esPrincipal: boolean;
  tipo: 'manual' | 'real';
  createdAt: Date;

  // Metadata opcional para depurar/visualizar compresión
  sizeOriginal?: number; // bytes
  sizeFinal?: number; // bytes (archivo subido)
  formatFinal?: 'webp' | 'jpeg' | 'original';
  qualityFinal?: number;
}

// Historial de cambios
export interface HistorialCambio {
  id: string;
  repuestoId: string;
  campo: string;
  valorAnterior: string | number | null;
  valorNuevo: string | number | null;
  fecha: Date;
}

// Formulario de repuesto
export interface RepuestoFormData {
  codigoSAP: string;
  textoBreve: string;
  descripcion?: string;
  nombreManual?: string;
  codigoBaader: string;
  cantidadSolicitada: number;      // DEPRECATED: usar tags para cantidades por evento
  valorUnitario: number;
  cantidadStockBodega: number;     // DEPRECATED: usar tags para cantidades por evento
  tags?: (string | TagAsignado)[];  // Soporta formato antiguo y nuevo
}

// Datos de exportación
export interface ExportData {
  repuestos: Repuesto[];
  includeImages: boolean;
  format: 'excel' | 'pdf';
}

// === SISTEMA MULTI-MÁQUINA ===

// Máquina/Equipo individual con sus datos y configuración
export interface Machine {
  id: string;                    // ID único (slug): ej. "baader-200", "marel-i-cut"
  nombre: string;                // Nombre para mostrar: "Baader 200"
  marca: string;                 // Fabricante: "Baader"
  modelo: string;                // Modelo específico: "200"
  descripcion?: string;          // Descripción adicional opcional
  activa: boolean;               // Si está activa/archivada
  color: string;                 // Color para la tab (hex): "#3b82f6"
  orden: number;                 // Orden de las tabs (para drag & drop)
  manuals?: string[];            // URLs de los manuales PDF de esta máquina
  infografias?: string[];        // URLs de infografías/diagramas (imágenes, modelos 3D)
  createdAt: Date;               // Fecha de creación
  updatedAt?: Date;              // Última modificación
}

// Estado del contexto de máquinas
export interface MachineContextType {
  currentMachine: Machine | null;
  machines: Machine[];
  loading: boolean;
  setCurrentMachine: (machineId: string) => Promise<void>;
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
  // === Datos específicos de bomba (opcionales) ===
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

// === TIPOS AUXILIARES ===

export interface ImportCantidadRow {
  codigoSAP: string;
  codigoBaader: string;
  textoBreve?: string;
  descripcion?: string;
  cantidad: number;
  valorUnitario: number;
}
