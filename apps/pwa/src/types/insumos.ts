/**
 * Tipos para el módulo de Insumos
 * Catálogo plano transversal — items que se usan en toda la planta
 * y no encajan en una máquina específica (EPP, ferretería, químicos,
 * empaque, lubricantes, etc.).
 *
 * Origen: import desde STOCK ALMACENES.xlsx vía scripts/import-insumos.js
 */

import { Timestamp } from 'firebase/firestore';

/** Familia top-level de un insumo (origen: columna `Familia` del Excel) */
export type InsumoFamilia =
  | 'REPUESTOS'
  | 'INSUMOS_MANT'
  | 'AREA'
  | 'REFRIGERACION'
  | 'QUIMICOS'
  | 'HERRAMIENTAS'
  | 'EMPAQUE'
  | 'COMBUSTIBLE'
  | 'LUBRICANTES'
  | 'SIN_FAMILIA';

/** Estado del insumo en el catálogo SAP */
export type InsumoStatus = 'activo' | 'obsoleto' | 'trasladar';

/** Almacén físico donde se guarda el stock real */
export type InsumoAlmacen = 'M001' | 'M004' | 'M008';

/**
 * Insumo — documento en colección Firestore raíz `insumos/{codigoSAP}`.
 * No anidado bajo máquinas (a diferencia de Repuesto).
 */
export interface Insumo {
  /** id = codigoSAP (mismo string) */
  id: string;
  codigoSAP: string;

  /** Descripción breve SAP (columna "texto breve de material") */
  textoBreve: string;

  familia: InsumoFamilia;
  subFamilia?: string | null;

  /** Ubicación de catalogación (Excel Clasificacion, ej "B-4-44") */
  ubicacion?: string | null;

  /** Ubicación física actual del stock (Excel MATERIALES, ej "CAJA C") */
  ubicacionFisica?: string | null;

  /** Unidad de medida base (UN / M / KG / L / etc.) */
  unidadMedida?: string | null;

  status: InsumoStatus;

  /** Cantidad física en bodega — null si no está en MATERIALES QUE SE QUEDAN */
  stockFisico?: number | null;

  /** Almacén donde está el stock físico */
  almacen?: InsumoAlmacen | null;

  /** Stock mínimo configurado manualmente (default null) */
  stockMinimo?: number | null;

  /** True si el SAP también existe en `machines/{id}/repuestos` (informativo) */
  existeEnRepuestos?: boolean | null;

  /** Notas libres del operador */
  observaciones?: string | null;

  /** Origen del registro — para diferenciar imports vs entries manuales */
  importedFrom?: 'STOCK_ALMACENES_xlsx' | 'manual' | null;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Filtros que aplica la UI al listar */
export interface InsumoFilter {
  familia?: InsumoFamilia | 'all';
  subFamilia?: string;
  status?: InsumoStatus | 'all';
  almacen?: InsumoAlmacen | 'all';
  conStockSolo?: boolean;
  /** Texto libre — busca en codigoSAP, textoBreve, subFamilia, ubicacion */
  search?: string;
}

/** Resumen agregado para dashboards / KPI */
export interface InsumoStats {
  total: number;
  activos: number;
  obsoletos: number;
  trasladar: number;
  conStockReal: number;
  bajoMinimo: number;
  porFamilia: Record<InsumoFamilia, number>;
}

/** Etiquetas legibles para mostrar en UI */
export const INSUMO_FAMILIA_LABEL: Record<InsumoFamilia, string> = {
  REPUESTOS: 'Repuestos',
  INSUMOS_MANT: 'Insumos mantenimiento',
  AREA: 'Áreas / EPP',
  REFRIGERACION: 'Refrigeración',
  QUIMICOS: 'Químicos',
  HERRAMIENTAS: 'Herramientas',
  EMPAQUE: 'Empaque',
  COMBUSTIBLE: 'Combustible',
  LUBRICANTES: 'Lubricantes',
  SIN_FAMILIA: 'Sin clasificar',
};

export const INSUMO_STATUS_LABEL: Record<InsumoStatus, string> = {
  activo: 'Activo',
  obsoleto: 'Obsoleto',
  trasladar: 'Trasladar',
};
