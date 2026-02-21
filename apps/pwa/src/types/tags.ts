/**
 * @deprecated — Sistema de Tags eliminado en la simplificación a Catálogo Puro.
 * Este archivo se mantiene temporalmente para evitar errores de importación
 * en código que aún lo referencie.
 */

export interface TagGlobal {
  nombre: string;
  tipo: 'solicitud' | 'stock';
  createdAt?: Date;
}

export interface TagAsignado {
  nombre: string;
  tipo: 'solicitud' | 'stock';
  cantidad: number;
  fecha: Date;
}

export function isTagAsignado(tag: unknown): tag is TagAsignado {
  return typeof tag === 'object' && tag !== null && 'cantidad' in tag && 'tipo' in tag;
}

export function getTagNombre(tag: string | TagAsignado): string {
  return typeof tag === 'string' ? tag : tag.nombre;
}

export const DEFAULT_TAGS: TagGlobal[] = [];

export function computeTotalFromTags(): number {
  return 0;
}

export function getTotalCantidadesRepuesto(): { solicitud: number; stock: number } {
  return { solicitud: 0, stock: 0 };
}

export function getCantidadPorTag(): number {
  return 0;
}

export function getCantidadPorContexto(): number {
  return 0;
}
