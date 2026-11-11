/**
 * Cálculo del zoom/paneo del visor de imágenes (ImageLightbox), sin React ni DOM, para probarlo.
 *
 * Modelo: la imagen está centrada en el contenedor y se dibuja con
 * `translate(x, y) scale(z)` y `transform-origin` en su centro. Un punto de la imagen a
 * distancia `q` de su centro (en px sin zoom) queda en pantalla en `c + t + z·q`, donde `c`
 * es el centro del contenedor y `t = (x, y)`. Todos los puntos que reciben estas funciones
 * son relativos al centro del contenedor.
 */
export interface Vista {
  z: number
  x: number
  y: number
}

export interface Medidas {
  /** Tamaño de la imagen dibujada sin zoom (object-contain). */
  imgW: number
  imgH: number
  /** Tamaño del área visible. */
  contW: number
  contH: number
}

export const ZOOM_MIN = 1
export const ZOOM_MAX = 5

export const acotarZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(z) ? z : 1))

/**
 * Paneo permitido: la imagen no se puede arrastrar más allá de sus bordes. Si con el zoom
 * actual cabe entera en un eje, en ese eje queda centrada.
 */
export function acotarPaneo(v: Vista, m: Medidas): Vista {
  const limX = Math.max(0, (m.imgW * v.z - m.contW) / 2)
  const limY = Math.max(0, (m.imgH * v.z - m.contH) / 2)
  // `+ 0` normaliza -0 a 0
  return { z: v.z, x: Math.min(limX, Math.max(-limX, v.x)) + 0, y: Math.min(limY, Math.max(-limY, v.y)) + 0 }
}

/**
 * Zoom manteniendo fijo bajo `punto` lo que estaba bajo `puntoInicial` (pellizco: el punto
 * medio entre los dedos; rueda o doble toque: el cursor). Si el punto se mueve (dos dedos que
 * además se desplazan), la imagen acompaña ese desplazamiento.
 */
export function zoomEnPunto(
  inicio: Vista,
  zNuevo: number,
  puntoInicial: { x: number; y: number },
  punto: { x: number; y: number } = puntoInicial,
): Vista {
  const z = acotarZoom(zNuevo)
  const qx = (puntoInicial.x - inicio.x) / inicio.z
  const qy = (puntoInicial.y - inicio.y) / inicio.z
  return { z, x: punto.x - z * qx, y: punto.y - z * qy }
}

export const VISTA_INICIAL: Vista = { z: 1, x: 0, y: 0 }
