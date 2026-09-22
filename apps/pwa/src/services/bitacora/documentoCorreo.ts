/**
 * La forma de los correos de Mantención, decidida contra el catálogo de tics de la IA y la
 * tradición del PROTOCOLO DE ENSAYO (Orel, 21-09-2026: «primero establezcamos qué es un estilo
 * hecho por IA y reemplacémoslo por estilos profesionales ya comprobados»). Nació en el correo
 * de la inspección post-aseo y de aquí la toman el de turno y los que vengan. Las seis reglas:
 *
 * 1. **Retícula de 12.** Todo ancho de columna es un número entero de doceavos (`track`). Seis
 *    anchos improvisados es lo que delata una tabla generada.
 * 2. **Tres filetes por tabla**, nunca verticales: uno grueso bajo el encabezado, uno fino
 *    entre filas y uno sobre la fila de cierre. La reja de cuatro bordes por celda es el tic;
 *    quitarlos todos es el tic opuesto y pierde la estructura (Tufte: borrar la tinta que no
 *    es dato, no la que sí lo es).
 * 3. **Cuatro cuerpos y nada intermedio.** Dos tamaños que hay que medir para distinguirlos
 *    son uno de más (Bringhurst).
 * 4. **Color solo donde codifica** un estado: un punto y su palabra. Ni fondos de sección, ni
 *    cifras pintadas, ni pastillas.
 * 5. **Ninguna caja de color.** La conclusión se anuncia con filete y cuerpo mayor, como el
 *    total de una factura; la advertencia, con un rótulo en negrita al principio del párrafo.
 *    La tarjeta con barra de color a la izquierda es el bloque de nota de la documentación
 *    técnica web, y es el tic más reconocible de un HTML escrito por un modelo. Y el HIG
 *    («Boxes») lo explica: una caja agrupa solo si es más angosta que su contenedor; en una
 *    columna de 680 px no hay afuera, así que no agrupa nada.
 * 6. **El espacio es la estructura**: 28 px sobre una sección dicen que empieza una sección
 *    mejor que una banda de color.
 *
 * La prueba de humo: en blanco y negro tiene que seguir teniendo jerarquía. Si sin el color
 * se vuelve una lista plana, el color estaba haciendo el trabajo de la tipografía.
 *
 * Reglas que vienen de cómo pega Outlook, no de gusto: TODO el estilo en línea (`style=""`),
 * estructura en `<table>`, y las imágenes con `width`/`height` como atributos.
 */

export const C = {
  tinta: '#1F1F1F',
  sec: '#5F6368',
  linea: '#E3E3E3',
  parada: '#B3261E',
  ventana: '#1E7B34',
  /** Afectó sin detener: ni el rojo de la parada ni el verde del «sin costo». */
  afectado: '#8A5A00',
  pendFondo: '#FFF4E5',
  pendBorde: '#E8900C',
  marca: '#2E75B6',
  citaFondo: '#F4F5F7',
  citaBarra: '#BDC1C6',
  okFondo: '#E6F4EA',
  critFondo: '#FCE8E6',
  neutroFondo: '#F1F3F4',
}
export const FUENTE = "'Segoe UI', Calibri, Arial, sans-serif"

/** Los cuatro cuerpos. Nada intermedio. */
export const TITULO = '21px'
export const TEXTO = '14px'
export const SEC = '11px'
export const ROTULO = '10.5px'
/** Filete fino entre filas; el de cierre va en tinta. */
export const RAYA = '#ECECEC'
/**
 * La TABLA del documento: el estilo «bordered» de macOS, que es lo que Orel encontró agradable
 * de la primera versión y que el HIG respalda («Lists and tables»: macOS define un estilo con
 * marco y filas alternadas; «considera colores alternados en una tabla de varias columnas»).
 * Un marco fino alrededor, un encabezado con fondo tenue, filetes horizontales entre filas y
 * NINGÚN filete vertical: la reja de cuatro bordes por celda sigue siendo el tic; el marco
 * es una sola caja, y el encabezado gris es el de cualquier tabla de Apple (21-09-2026).
 */
export const TABLA = `border-collapse:collapse;width:100%;border:1px solid ${C.linea};`
/** Fondo tenue del encabezado y de las filas alternas. */
export const BANDA = C.neutroFondo
export const CELDA =
  `padding:9px 12px;border-bottom:1px solid ${RAYA};font-family:${FUENTE};font-size:${TEXTO};` +
  `line-height:1.5;color:${C.tinta};vertical-align:top;`
/**
 * Le dice al teléfono que NO infle la letra. iOS Mail (WebKit) agranda el texto de un correo por
 * su cuenta —«font boosting»— cuando el contenedor no lo prohíbe: la letra de 14 px salía como
 * de 26 en el iPhone de Orel, y como las tablas ya estaban calculadas para 680 px, el texto
 * inflado se salía por la derecha (22-09-2026). Va en cada contenedor raíz del correo.
 */
export const TEXTO_FIJO = '-webkit-text-size-adjust:100%;text-size-adjust:100%;'
/** Un doceavo del ancho útil. Las columnas ocupan tracks enteros, no porcentajes inventados. */
export const track = (n: number) => `${((n / 12) * 100).toFixed(4)}%`

export function escaparHtml(texto: string | null | undefined): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** El encabezado de una sección: un rótulo, y 28 px de aire encima. Nunca una banda de color. */
export function seccion(titulo: string, cantidad?: number): string {
  return (
    `<div style="font-family:${FUENTE};font-size:${ROTULO};font-weight:600;letter-spacing:.09em;` +
    `text-transform:uppercase;color:${C.sec};margin-top:28px;">${escaparHtml(titulo)}` +
    (cantidad != null ? ` <span style="color:${C.tinta};">${cantidad}</span>` : '') +
    `</div>`
  )
}

/** Una cifra con su rótulo. Sin caja: el número pesa por tamaño, no por borde. */
export function kpi(valor: string, etiqueta: string): string {
  return (
    `<td style="padding:0 34px 0 0;vertical-align:top;font-family:${FUENTE};">` +
    `<div style="font-size:${TITULO};font-weight:600;line-height:1.2;color:${C.tinta};white-space:nowrap;` +
    `font-variant-numeric:tabular-nums;">${escaparHtml(valor)}</div>` +
    `<div style="font-size:${SEC};color:${C.sec};padding-top:4px;white-space:nowrap;">${escaparHtml(etiqueta)}</div></td>`
  )
}

/**
 * La fila de cifras, o nada. Se gana su lugar cuando trae lo que el resto del documento no
 * dice. En la inspección, con una o dos cifras repetía la fila de cierre de la tabla («7
 * puntos · 5 conformes…») como dos números sueltos: ahí el mínimo es 3. En el correo de
 * turno no hay una tabla que cierre con eventos y pendientes, así que la fila es la única
 * que los dice y va siempre que haya eventos: `minimo` 1. (Una prueba de la entrega de turno
 * lo cazó: «1 pendiente (1 ya cerrado)» desaparecía con el mínimo de 3.)
 */
export function filaCifras(cifras: readonly string[], minimo = 3): string {
  const vivas = cifras.filter(Boolean)
  return vivas.length >= minimo
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:22px 0 2px;"><tr>${vivas.join('')}</tr></table>`
    : ''
}

/**
 * Una advertencia: rótulo en negrita al principio del párrafo, bajo un filete. Antes era una
 * tarjeta con fondo tenue y barra de color a la izquierda — el tic n.º 1.
 */
export function nota(html: string): string {
  return (
    `<div style="font-family:${FUENTE};border-top:1px solid ${C.linea};margin-top:16px;padding-top:12px;` +
    `font-size:${TEXTO};line-height:1.5;color:${C.tinta};">${html}</div>`
  )
}

/** Un estado: el punto de color y su palabra. El color marca, la palabra dice. */
export function estado(texto: string, color: string): string {
  return `<span style="color:${color};">●</span> ${escaparHtml(texto)}`
}

/**
 * El estado como celda. Antes cada celda iba pintada entera: seis bloques de color por tabla,
 * que es lo que le da a un documento ese aire de tablero generado en serie
 * (HIG «Color»: https://developer.apple.com/design/human-interface-guidelines/color).
 */
export function celdaTono(texto: string, color: string, ancho?: string): string {
  return `<td style="${CELDA}white-space:nowrap;${ancho ? `width:${ancho};` : ''}">${estado(texto, color)}</td>`
}

/** La fila de cierre: el «total» del protocolo. Dice de qué se compone el resultado. */
export function filaCierre(columnas: number, izquierda: string, derecha: string): string {
  const td = `padding:9px 12px;border-top:1px solid ${C.tinta};background:${BANDA};font-family:${FUENTE};font-size:${SEC};color:${C.sec};vertical-align:top;`
  return (
    `<tr><td style="${td}">${escaparHtml(izquierda)}</td>` +
    `<td colspan="${columnas - 1}" style="${td}">${escaparHtml(derecha)}</td></tr>`
  )
}

/** Una hora: cifras tabulares para que las columnas se lean en vertical (HIG «Typography»). */
export function celdaHora(hhmm: string, ancho: string): string {
  return (
    `<td style="${CELDA}color:${C.sec};white-space:nowrap;font-variant-numeric:tabular-nums;width:${ancho};">` +
    `${escaparHtml(hhmm)}</td>`
  )
}

/** Una celda cuyo contenido ya viene armado (para meterle más de una línea). */
export function celdaHtml(html: string, ancho?: string): string {
  return `<td style="${CELDA}${ancho ? `width:${ancho};` : ''}">${html}</td>`
}

/** El encabezado de una tabla: rótulos sobre una banda tenue, como el de una tabla de macOS. */
export function encabezadoTabla(columnas: readonly string[]): string {
  return (
    `<tr>${columnas
      .map(
        (t) =>
          `<th align="left" style="padding:8px 12px;background:${BANDA};border-bottom:1px solid ${C.linea};` +
          `font-family:${FUENTE};font-size:${ROTULO};font-weight:600;letter-spacing:.07em;text-transform:uppercase;` +
          `color:${C.sec};">${escaparHtml(t)}</th>`,
      )
      .join('')}</tr>`
  )
}

/** Un texto en una línea; el completo vive en otra parte del documento. */
export function recortar(texto: string, largo: number): string {
  const t = texto.trim().replace(/\s+/g, ' ')
  return t.length <= largo ? t : `${t.slice(0, largo - 1).trimEnd()}…`
}
