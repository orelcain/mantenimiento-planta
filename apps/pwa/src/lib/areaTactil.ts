/**
 * El área táctil mínima de un botón-icono — una sola definición.
 *
 * POR QUÉ EXISTE
 * --------------
 * El módulo de Repuestos se usa en planta, en el teléfono y con guantes. Medido a 375 px el
 * 13-09 sobre los elementos interactivos VISIBLES del hub con un repuesto abierto:
 * **20 de 31 estaban bajo 44×44 px**, y los peores eran justo los más usados:
 *
 *     «Copiar SAP» (panel)      18 × 18 px
 *     «Favorito» (fila)         20 × 20 px
 *     «Cerrar» / «Favorito»     24 × 24 px
 *
 * Copiar el código para pedir la pieza es lo que más hace un técnico en planta, y era el
 * target más chico de toda la pantalla. 44×44 es el mínimo de WCAG 2.5.5 y de las guías de
 * iOS y Android; con guantes, más.
 *
 * DOS TRAMPAS MEDIDAS, no supuestas
 * ---------------------------------
 * 1. **`rem` NO da 44 px.** La raíz de esta app mide **16 px en móvil pero 14 px en
 *    escritorio**, así que `min-h-11` (2.75rem) —la convención que ya usaban calendario y
 *    grader— vale 44 px en el teléfono y **38,5 px en el PC**. Si el número tiene que ser 44,
 *    va en píxeles.
 * 2. **El margen negativo no encoge una caja inline.** El primer intento fue
 *    `inline-flex min-h-11 -m-3`, y las filas de la tabla pasaron de **43 a 67 px**: en un
 *    elemento inline-level los márgenes verticales no afectan la altura de línea, así que la
 *    celda crecía igual. El área tiene que ir en un pseudo-elemento ABSOLUTO, que no
 *    participa del layout.
 *
 * CÓMO ELEGIR LA VARIANTE
 * -----------------------
 * Agrandar un target puede ROBARLE EL TAP AL VECINO, que es peor que el target chico: en esta
 * misma sesión se marcó un favorito por accidente. La elección se hace MIDIENDO el hueco libre
 * alrededor del botón en el navegador, no a ojo.
 */

/**
 * 44×44 de verdad, EMPUJANDO el layout.
 *
 * Para cuando el contenedor puede crecer: una cabecera, una barra de acciones. Es la opción
 * segura — no invade nada.
 */
export const AREA_TACTIL = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center'

/**
 * 44×44 SIN tocar el layout: el área es un pseudo-elemento absoluto centrado en el botón.
 *
 * El icono se sigue viendo igual, la línea no se estira y la fila no crece. Invade ~14 px por
 * lado alrededor de un icono de 16, así que solo se usa donde se midió que hay ese hueco.
 * Que el área invada espacio vecino es deseable cuando ese espacio es texto muerto: tocar al
 * lado del código también copia, que es lo que la persona quería.
 */
export const AREA_TACTIL_COMPACTA =
  "relative before:absolute before:left-1/2 before:top-1/2 before:h-[44px] before:w-[44px] " +
  "before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"

/**
 * Solo el alto, a 32 px y a lo ancho del propio botón.
 *
 * Para un botón que vive DENTRO de una tarjeta cuyo tap hace otra cosa. Llevarlo a 44 px se
 * comería casi la mitad de la tarjeta y el tap de «abrir la ficha» pasaría a ser «copiar»: el
 * target chico molesta, el target que hace lo que no pediste engaña. 32 px es lo que cabe.
 */
export const AREA_TACTIL_EN_TARJETA =
  "relative before:absolute before:left-0 before:top-1/2 before:h-[32px] before:w-full " +
  "before:-translate-y-1/2 before:content-['']"
