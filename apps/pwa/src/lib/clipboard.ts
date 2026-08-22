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
