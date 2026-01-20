/**
 * Sistema de Tags/Eventos para Repuestos
 * Permite asociar cantidades específicas a eventos (solicitudes, stock, etc.)
 */

/**
 * Tag global con su tipo definido
 * Se almacena en machines/{machineId}/settings/tags
 */
export interface TagGlobal {
  nombre: string;
  tipo: 'solicitud' | 'stock';
  createdAt?: Date;
}

/**
 * Tag asignado a un repuesto con cantidad específica del evento
 * Permite rastrear cantidades por evento sin perder histórico
 * 
 * Ejemplo: 
 * - "Solicitud Dic 2025" con cantidad 5
 * - "Stock Bodega Dic 2025" con cantidad 3
 */
export interface TagAsignado {
  nombre: string; // Nombre del tag/evento
  tipo: 'solicitud' | 'stock'; // A qué columna aplica (heredado del TagGlobal)
  cantidad: number; // Cantidad en este evento
  fecha: Date; // Cuándo se asignó/creó el evento
}

/**
 * Verificar si un tag es TagGlobal
 */
export function isTagGlobal(tag: unknown): tag is TagGlobal {
  return (
    typeof tag === 'object' &&
    tag !== null &&
    'nombre' in tag &&
    'tipo' in tag &&
    !('cantidad' in tag)
  );
}

/**
 * Verificar si un tag es TagAsignado (nuevo formato)
 */
export function isTagAsignado(tag: string | TagAsignado): tag is TagAsignado {
  return typeof tag === 'object' && tag !== null && 'cantidad' in tag && 'tipo' in tag;
}

/**
 * Obtener el nombre de un tag (compatible con ambos formatos)
 */
export function getTagNombre(tag: string | TagAsignado): string {
  return typeof tag === 'string' ? tag : tag.nombre;
}

/**
 * Tags predefinidos por defecto
 */
export const DEFAULT_TAGS: TagGlobal[] = [
  { nombre: 'Overhaul temporada baja', tipo: 'solicitud' },
  { nombre: 'Urgentes este mes', tipo: 'solicitud' },
  { nombre: 'Críticos', tipo: 'solicitud' },
  { nombre: 'En espera proveedor', tipo: 'solicitud' },
  { nombre: 'Pedido realizado', tipo: 'solicitud' },
  { nombre: 'Stock mínimo', tipo: 'stock' },
  { nombre: 'Repuestos varios', tipo: 'stock' },
  { nombre: 'Preventivo mensual', tipo: 'solicitud' },
];

/**
 * Calcular total desde tags (suma de solicitud + stock * valorUnitario)
 */
export function computeTotalFromTags(
  tags: (string | TagAsignado)[],
  valorUnitario: number
): number {
  let totalSolicitud = 0;
  let totalStock = 0;

  tags.forEach((tag) => {
    if (isTagAsignado(tag)) {
      if (tag.tipo === 'solicitud') {
        totalSolicitud += tag.cantidad;
      } else if (tag.tipo === 'stock') {
        totalStock += tag.cantidad;
      }
    }
  });

  return (totalSolicitud + totalStock) * valorUnitario;
}

/**
 * Obtener totales de cantidades por tipo desde tags
 */
export function getTotalCantidadesRepuesto(repuesto: {
  tags: (string | TagAsignado)[];
}): { solicitud: number; stock: number } {
  let solicitud = 0;
  let stock = 0;

  repuesto.tags.forEach((tag) => {
    if (isTagAsignado(tag)) {
      if (tag.tipo === 'solicitud') {
        solicitud += tag.cantidad;
      } else if (tag.tipo === 'stock') {
        stock += tag.cantidad;
      }
    }
  });

  return { solicitud, stock };
}

/**
 * Obtener cantidad de un tag específico por nombre
 */
export function getCantidadPorTag(
  repuesto: { tags: (string | TagAsignado)[] },
  tagNombre: string
): number {
  const tag = repuesto.tags.find((t) => getTagNombre(t) === tagNombre);
  return tag && isTagAsignado(tag) ? tag.cantidad : 0;
}

/**
 * Obtener cantidad de un contexto específico por nombre y tipo
 */
export function getCantidadPorContexto(
  repuesto: { tags: (string | TagAsignado)[] },
  contexto: string,
  tipo: 'solicitud' | 'stock'
): number {
  const tag = repuesto.tags.find(
    (t) => getTagNombre(t) === contexto && isTagAsignado(t) && t.tipo === tipo
  );
  return tag && isTagAsignado(tag) ? tag.cantidad : 0;
}
