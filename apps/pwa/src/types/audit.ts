/**
 * Tipos para Audit Log y Papelera (Soft Delete)
 *
 * Colecciones Firestore:
 *  - audit_log/{autoId}  — registro de todas las operaciones CRUD
 *  - trash/{autoId}      — papelera restaurable (30 días)
 */

export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'relocate'

export interface AuditLogEntry {
  id: string
  action: AuditAction
  /** Ruta de la colección: 'hierarchy' | 'machines/{machineId}/repuestos' */
  collection: string
  documentId: string
  /** Nombre legible del documento (ej: "RODAMIENTO SKF 6205") */
  documentLabel: string
  userId: string
  userName: string
  timestamp: Date
  /** Snapshot antes del cambio (para update/delete) */
  before?: Record<string, unknown>
  /** Snapshot después del cambio (para create/update) */
  after?: Record<string, unknown>
  /** Contexto adicional: machineId, machineName, parentId, etc. */
  metadata?: Record<string, string>
}

export interface TrashItem {
  id: string
  /** Ruta de la colección original */
  originalCollection: string
  /** ID del documento original */
  originalId: string
  /** Nombre legible */
  documentLabel: string
  /** Snapshot completo del documento */
  data: Record<string, unknown>
  /** Subcolecciones asociadas (ej: historial de cambios) */
  subcollections?: Record<string, Record<string, unknown>[]>
  deletedBy: string
  deletedByName: string
  deletedAt: Date
  /** Se auto-purga después de esta fecha (30 días) */
  expiresAt: Date
  /** Contexto: machineId, machineName, etc. */
  metadata?: Record<string, string>
}

/** Filtros para consultar audit log */
export interface AuditLogFilters {
  action?: AuditAction
  collection?: string
  userId?: string
  fromDate?: Date
  toDate?: Date
  limit?: number
}

/** Filtros para consultar papelera */
export interface TrashFilters {
  collection?: string
  fromDate?: Date
  toDate?: Date
  limit?: number
}
