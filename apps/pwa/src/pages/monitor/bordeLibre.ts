/**
 * Lo fijo de la página que tapa lo que se dibuja encima de las tarjetas, y cómo traer un globo a la vista sin dejarlo debajo de ello.
 *
 * Los globos de «Ritmo en vivo» (el de la micro, el del minuto y el ⓘ del resumen de causas) se abren encima de la tarjeta y pueden sobresalir por arriba de ella:
 * si lo hacen bajo el encabezado fijo (`.v2-cabecera` y la barra de PC `.v2-barra-pc`, sticky z-20) o bajo la banda de la detención en curso (`.rv-banda`, sticky bajo
 * la cabecera en PC, z-10), se pierde justo lo que identifica la micro y su causa. Medido el 03-11 en 1366 × 768: con la banda en pantalla, el globo cerrado quedaba
 * con el borde de arriba en 57 px y el abierto en 86 y 103 px, contra el borde de abajo de la banda en 108 px.
 */

/** Aire (px) entre lo fijo de la página y el borde de arriba de un globo. */
export const AIRE_BORDE = 8

/**
 * El primer px de la ventana que lo fijo de la página no tapa: el borde de abajo de la cabecera y de la banda. La banda cuenta solo si está pegada (sticky): en el
 * celular va en el flujo de la página y no tapa nada.
 */
export function bordeLibreArriba(): number {
  const bordes = Array.from(document.querySelectorAll<HTMLElement>('.v2-cabecera, .v2-barra-pc, .rv-banda'))
    .filter((b) => !b.classList.contains('rv-banda') || getComputedStyle(b).position === 'sticky')
    .map((b) => {
      const r = b.getBoundingClientRect()
      return r.height > 0 ? r.bottom : 0
    })
  return Math.max(0, ...bordes)
}

/** Trae un elemento a la vista, lo mínimo (`block: 'nearest'`), sin dejarlo bajo lo fijo de la página (`scroll-margin-top`). Sin movimiento si el usuario lo pidió así. */
export function traerALaVista(el: HTMLElement): void {
  el.style.scrollMarginTop = `${bordeLibreArriba() + AIRE_BORDE}px`
  const reducido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  el.scrollIntoView?.({ block: 'nearest', behavior: reducido ? 'auto' : 'smooth' })
}
