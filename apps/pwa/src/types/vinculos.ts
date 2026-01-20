/**
 * Vínculos visuales a manuales PDF
 * Sistema de marcadores con coordenadas normalizadas para escalabilidad
 */

/**
 * Vínculo a página/área del manual PDF con marcador visual
 * Coordenadas normalizadas (0-1) permiten que los marcadores se adapten a cualquier zoom/resolución
 */
export interface VinculoManual {
  id: string;
  pagina: number;
  machineId?: string; // ID de la máquina (para multi-máquina)
  manualUrl?: string; // URL específica del manual (cuando hay múltiples)

  // Coordenadas normalizadas (0-1) relativas al tamaño de la página
  coordenadas?: {
    x: number; // Porcentaje desde la izquierda (0-1)
    y: number; // Porcentaje desde arriba (0-1)
    width: number; // Porcentaje del ancho (0-1)
    height: number; // Porcentaje del alto (0-1)
  };

  // Puntos para polígono personalizado (normalizados 0-1)
  puntos?: { x: number; y: number }[];

  // Forma del marcador
  forma: 'circulo' | 'rectangulo' | 'poligono';

  // Color del marcador (rgba o hex)
  color: string;

  // Descripción del marcador
  descripcion: string;

  // Opción para mostrar sin borde (solo relleno)
  sinBorde?: boolean;
}

/**
 * Colores predefinidos para marcadores
 */
export const MARKER_COLORS = [
  { name: 'Rojo', value: 'rgba(239, 68, 68, 0.4)', border: '#ef4444' },
  { name: 'Azul', value: 'rgba(59, 130, 246, 0.4)', border: '#3b82f6' },
  { name: 'Verde', value: 'rgba(34, 197, 94, 0.4)', border: '#22c55e' },
  { name: 'Amarillo', value: 'rgba(234, 179, 8, 0.4)', border: '#eab308' },
  { name: 'Morado', value: 'rgba(168, 85, 247, 0.4)', border: '#a855f7' },
  { name: 'Naranja', value: 'rgba(249, 115, 22, 0.4)', border: '#f97316' },
];

/**
 * Verificar si coordenadas son normalizadas (0-1)
 */
export function isNormalizedCoordinates(coords: {
  x: number;
  y: number;
  width: number;
  height: number;
}): boolean {
  return coords.x <= 1 && coords.y <= 1 && coords.width <= 1 && coords.height <= 1;
}

/**
 * Normalizar coordenadas de píxeles a porcentaje (0-1)
 */
export function normalizeCoordinates(
  pixelCoords: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: pixelCoords.x / canvasWidth,
    y: pixelCoords.y / canvasHeight,
    width: pixelCoords.width / canvasWidth,
    height: pixelCoords.height / canvasHeight,
  };
}

/**
 * Denormalizar coordenadas de porcentaje (0-1) a píxeles
 */
export function denormalizeCoordinates(
  normalizedCoords: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: normalizedCoords.x * canvasWidth,
    y: normalizedCoords.y * canvasHeight,
    width: normalizedCoords.width * canvasWidth,
    height: normalizedCoords.height * canvasHeight,
  };
}

/**
 * Normalizar puntos de polígono
 */
export function normalizePoints(
  pixelPoints: { x: number; y: number }[],
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number }[] {
  return pixelPoints.map((point) => ({
    x: point.x / canvasWidth,
    y: point.y / canvasHeight,
  }));
}

/**
 * Denormalizar puntos de polígono
 */
export function denormalizePoints(
  normalizedPoints: { x: number; y: number }[],
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number }[] {
  return normalizedPoints.map((point) => ({
    x: point.x * canvasWidth,
    y: point.y * canvasHeight,
  }));
}
