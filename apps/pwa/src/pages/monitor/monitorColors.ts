/**
 * Los colores del monitor, como TRES ROLES y no como una paleta de días.
 *
 * Antes esto era un arreglo de siete hex (celeste, violeta, rosa, verde,
 * naranja, gris, púrpura), herencia de cuando el comparador dibujaba todos los
 * días a la vez. Desde que muestra "hoy contra UNA referencia" solo se usaba
 * `COLORES[0]`: los otros seis eran código muerto, y el celeste `#38bdf8` y el
 * ámbar `#f59e0b` daban 1,9:1 sobre el card en tema claro — por debajo del 3:1
 * que WCAG pide para un trazo, o sea invisibles a pleno sol.
 *
 * Ahora cada rol apunta a una variable CSS (definida en `index.css`, valores
 * distintos por tema). Se usan como variable y no como hex para que el trazo
 * cambie solo al togglear el tema: `useTheme` no tiene contexto —cada llamada
 * crea su propio estado— así que leer el tema desde estos componentes daría
 * valores desincronizados.
 *
 * ⚠ En SVG hay que pasarlos por `style`, nunca por el atributo: `stroke="var(…)"`
 * es un atributo de presentación XML y NO resuelve `var()`. `style={{ stroke }}`
 * sí, porque ahí es una declaración CSS.
 */

/** Hoy. Lo único que el operador mira: el contraste más alto de los tres. */
export const COLOR_HOY = 'var(--mon-hoy)'

/** La cuota: la vara contra la que se mide. */
export const COLOR_CUOTA = 'var(--mon-cuota)'

/** El día contra el que se compara. Neutro a propósito: es el fondo del cuento. */
export const COLOR_REF = 'var(--mon-ref)'

/** Relleno de la brecha cuando hoy va arriba / abajo de la referencia. */
export const FILL_ARRIBA = 'var(--mon-arriba-soft)'
export const FILL_ABAJO = 'var(--mon-abajo-soft)'
