/**
 * Exporta la rueda a un PNG de alta resolución, para llevarla a una reunión sin
 * depender del link ni de que alguien tenga la app abierta.
 *
 * El detalle que hace o rompe esto: el SVG se dibuja con clases de Tailwind
 * (`fill-cat-1-tint`, `stroke-muted-foreground`…). Al serializarlo con
 * `XMLSerializer` esas clases viajan como texto pero la hoja de estilos NO, así
 * que el navegador lo rasteriza en negro. Por eso hay que copiar los estilos
 * COMPUTADOS a atributos de presentación antes de serializar — es la diferencia
 * entre un PNG correcto y una silueta negra.
 */

/** Propiedades que hay que fijar en el clon; el resto no afecta al rasterizado. */
const PROPIEDADES = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
] as const

function inlinearEstilos(origen: SVGSVGElement, clon: SVGSVGElement): void {
  const nodosOrigen = [origen, ...origen.querySelectorAll('*')]
  const nodosClon = [clon, ...clon.querySelectorAll('*')]
  nodosOrigen.forEach((nodo, i) => {
    const destino = nodosClon[i]
    if (!(destino instanceof SVGElement) || !(nodo instanceof SVGElement)) return
    const cs = getComputedStyle(nodo)
    for (const prop of PROPIEDADES) {
      const valor = cs.getPropertyValue(prop)
      if (valor && valor !== 'none' && valor !== 'normal') {
        destino.setAttribute(prop, valor.trim())
      }
    }
    destino.removeAttribute('class')
  })
}

export interface OpcionesExport {
  titulo: string
  subtitulo?: string
  /** Pie con la leyenda de colores, una entrada por línea. */
  leyenda?: Array<{ color: string; texto: string }>
  /** Multiplicador de resolución. 3 deja la rueda sobre 1200 px de lado. */
  escala?: number
  /** Fondo del PNG. Sólido a propósito: un PNG transparente se ve roto en Slack. */
  fondo?: string
  /** Color del texto del encabezado. */
  tinta?: string
  nombreArchivo: string
}

const MARGEN = 28
const ALTO_ENCABEZADO = 92

/**
 * Rasteriza el SVG y lo compone con encabezado y leyenda. Devuelve `false` si el
 * navegador bloqueó la descarga, para poder avisar en vez de fallar en silencio.
 */
export async function exportarRuedaPng(
  svg: SVGSVGElement,
  opciones: OpcionesExport,
): Promise<boolean> {
  const escala = opciones.escala ?? 3
  const fondo = opciones.fondo ?? '#ffffff'
  const tinta = opciones.tinta ?? '#111827'

  const caja = svg.getBoundingClientRect()
  const ladoCss = Math.max(caja.width, 320)

  const clon = svg.cloneNode(true) as SVGSVGElement
  inlinearEstilos(svg, clon)
  clon.setAttribute('width', String(ladoCss))
  clon.setAttribute('height', String(ladoCss))
  clon.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const texto = new XMLSerializer().serializeToString(clon)
  // encodeURIComponent y no btoa: el SVG lleva acentos y «·», y btoa revienta
  // con cualquier carácter fuera de latin1.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(texto)}`

  const img = new Image()
  const cargada = new Promise<boolean>((resolve) => {
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
  })
  img.src = url
  if (!(await cargada)) return false

  const filasLeyenda = opciones.leyenda?.length ?? 0
  const altoLeyenda = filasLeyenda ? 26 + filasLeyenda * 24 : 0
  const anchoCss = ladoCss + MARGEN * 2
  const altoCss = ALTO_ENCABEZADO + ladoCss + altoLeyenda + MARGEN

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(anchoCss * escala)
  canvas.height = Math.round(altoCss * escala)
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  ctx.scale(escala, escala)

  ctx.fillStyle = fondo
  ctx.fillRect(0, 0, anchoCss, altoCss)

  ctx.fillStyle = tinta
  ctx.font = '600 22px -apple-system, "Segoe UI", system-ui, sans-serif'
  ctx.fillText(opciones.titulo, MARGEN, 40)
  if (opciones.subtitulo) {
    ctx.globalAlpha = 0.65
    ctx.font = '400 14px -apple-system, "Segoe UI", system-ui, sans-serif'
    ctx.fillText(opciones.subtitulo, MARGEN, 64)
    ctx.globalAlpha = 1
  }

  ctx.drawImage(img, MARGEN, ALTO_ENCABEZADO, ladoCss, ladoCss)

  if (opciones.leyenda?.length) {
    let y = ALTO_ENCABEZADO + ladoCss + 20
    ctx.font = '400 13px -apple-system, "Segoe UI", system-ui, sans-serif'
    for (const item of opciones.leyenda) {
      ctx.fillStyle = item.color
      ctx.fillRect(MARGEN, y - 9, 12, 12)
      ctx.fillStyle = tinta
      ctx.globalAlpha = 0.8
      ctx.fillText(item.texto, MARGEN + 20, y + 1)
      ctx.globalAlpha = 1
      y += 24
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return false

  const enlace = document.createElement('a')
  enlace.href = URL.createObjectURL(blob)
  enlace.download = opciones.nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  // Se revoca tarde: revocarlo en el mismo tick cancela la descarga en algunos
  // navegadores antes de que empiece.
  setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000)
  return true
}
