/**
 * Copiar al portapapeles con fallback a execCommand: en paneles embebidos
 * (p. ej. el preview del navegador integrado) `navigator.clipboard` rechaza
 * por permisos aunque haya gesto del usuario.
 */
export async function copiarTexto(texto: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = texto
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } finally { ta.remove() }
  }
}

/**
 * Copiar contenido ENRIQUECIDO (HTML + texto plano) para pegarlo en un correo
 * con formato, tablas e imágenes.
 *
 * Camino 1: `ClipboardItem` con `text/html` y `text/plain` — el destino elige.
 * Camino 2 (fallback): se renderiza el HTML en un nodo editable fuera de
 * pantalla, se selecciona y `execCommand('copy')`: el navegador copia la
 * selección con su formato, que es lo mismo que hace Ctrl+C sobre una página.
 */
export async function copiarHtml(html: string, textoPlano: string): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([textoPlano], { type: 'text/plain' }),
        }),
      ])
      return
    } catch {
      // permisos del panel embebido o navegador sin soporte: fallback abajo
    }
  }
  const nodo = document.createElement('div')
  nodo.contentEditable = 'true'
  nodo.innerHTML = html
  Object.assign(nodo.style, { position: 'fixed', left: '-10000px', top: '0', opacity: '0' })
  document.body.appendChild(nodo)
  const seleccion = window.getSelection()
  const rango = document.createRange()
  rango.selectNodeContents(nodo)
  seleccion?.removeAllRanges()
  seleccion?.addRange(rango)
  try {
    if (!document.execCommand('copy')) throw new Error('El navegador no permitió copiar.')
  } finally {
    seleccion?.removeAllRanges()
    nodo.remove()
  }
}
