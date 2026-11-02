/**
 * Dónde va el globo de una micro en PC (dos columnas, 640 px de ancho y de 250 a 430 px de alto según lo que diga) respecto del gráfico.
 *
 * Lógica PURA (sin React ni DOM): recibe medidas en píxeles y devuelve el `top` y el `left` dentro del lienzo. Lo usa `GloboMicroPc`, que mide.
 *
 * Qué resuelve. El globo se apoya 10 px sobre la primera fila Ev y centrado en la marca, para no tapar las filas ni la marca. Con el gráfico de
 * 1366 × 768 (379 px de alto) solo hay 226 px entre el borde de arriba del gráfico y esa fila, y el globo mide casi siempre más: sobresale por
 * arriba. Eso no es grave mientras se vea entero, pero el encabezado fijo de la página (sticky, z-20) queda ENCIMA de la tarjeta: con la
 * página al final del scroll (la posición natural para ver las tres filas) el globo quedaba parcialmente bajo el encabezado y la línea
 * que dice de qué micro habla se perdía. Medido en 70 globos reales de Chonchi: en 32 el borde de arriba quedaba bajo el encabezado y
 * en 26 la línea de la hora y la Baader se tapaba en parte (9 por completo).
 *
 * La regla:
 *  1. Encima de la fila Ev 1, centrado en la marca, si cabe sin quedar bajo el encabezado.
 *  2. Si no cabe, se baja lo justo para que arranque justo debajo del encabezado (la identificación de la micro, que es lo que manda, queda a
 *     la vista). Bajado así tapa el borde de arriba de las filas Ev; para no tapar la MARCA que el usuario está señalando, se corre hacia un
 *     lado de ella (a su derecha si cabe en el gráfico; si no, a su izquierda; si ninguna cabe, queda centrado).
 */

/** Aire (px) entre el borde de abajo del globo y la parte alta de la primera fila Ev. */
export const GLOBO_SOBRE_FILA = 10
/** Aire (px) entre la marca y el borde del globo cuando se corre a un lado. */
export const GLOBO_AIRE_MARCA = 14

export interface EntradaUbicacion {
  /** Parte alta del lienzo del gráfico en la ventana (`getBoundingClientRect().top`), en px. */
  lienzoTop: number
  /** Parte alta de la primera fila Ev dentro del lienzo, en px. */
  filaTop: number
  /** Alto del globo ya dibujado, en px. */
  alto: number
  /** Primer px de la ventana que el encabezado fijo no tapa (su borde de abajo más el aire), en px. */
  minTop: number
  /** x de la marca de la micro dentro del lienzo, en px. */
  marcaX: number
  /** Ancho del globo, en px. */
  ancho: number
  /** El menor `left` y el mayor borde derecho que el globo puede tener dentro del lienzo, en px. */
  izqMin: number
  derMax: number
}

export interface Ubicacion {
  /** `top` del globo dentro del lienzo (negativo: sobresale por arriba del gráfico). */
  top: number
  /** `left` del globo dentro del lienzo. */
  left: number
  /** `arriba`: cabe sobre la fila Ev 1, como siempre. `bajado`: se bajó lo justo para no quedar bajo el encabezado. */
  lado: 'arriba' | 'bajado'
}

export function ubicarGloboPc(e: EntradaUbicacion): Ubicacion {
  const acota = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
  /* Centrado en la marca y dentro del gráfico. */
  const centrado = acota(e.marcaX - e.ancho / 2, e.izqMin, e.derMax - e.ancho)
  /* Con el borde de abajo GLOBO_SOBRE_FILA px sobre la fila Ev 1. */
  const ideal = e.filaTop - GLOBO_SOBRE_FILA - e.alto
  /* El menor `top` (en el lienzo) cuyo borde de arriba queda debajo del encabezado fijo. */
  const minimo = e.minTop - e.lienzoTop
  if (ideal >= minimo) return { top: ideal, left: centrado, lado: 'arriba' }
  /* Bajado: si llega a pasar sobre la primera fila Ev, se corre a un lado de la marca para no taparla. */
  const pasaSobreLaFila = minimo + e.alto > e.filaTop
  if (pasaSobreLaFila) {
    const aLaDerecha = e.marcaX + GLOBO_AIRE_MARCA
    if (aLaDerecha + e.ancho <= e.derMax) return { top: minimo, left: aLaDerecha, lado: 'bajado' }
    const aLaIzquierda = e.marcaX - GLOBO_AIRE_MARCA - e.ancho
    if (aLaIzquierda >= e.izqMin) return { top: minimo, left: aLaIzquierda, lado: 'bajado' }
  }
  return { top: minimo, left: centrado, lado: 'bajado' }
}
