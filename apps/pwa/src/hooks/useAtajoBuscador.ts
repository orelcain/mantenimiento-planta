import { useEffect } from 'react'

/** ¿Es Ctrl+K (o ⌘K en Mac)? Sin Shift ni Alt, para no pisar otros atajos. */
export function esAtajoBuscador(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): boolean {
  return (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k'
}

/**
 * Ctrl+K / ⌘K abre o cierra el buscador rápido desde cualquier pantalla.
 * `preventDefault`: el navegador usa Ctrl+K para su propia barra de búsqueda.
 */
export function useAtajoBuscador(alternar: () => void, activo = true): void {
  useEffect(() => {
    if (!activo) return
    const onKey = (e: KeyboardEvent) => {
      if (!esAtajoBuscador(e)) return
      e.preventDefault()
      alternar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [alternar, activo])
}

/** Etiqueta del atajo según la plataforma: «⌘K» en Mac, «Ctrl K» en el resto. */
export function etiquetaAtajo(): string {
  const p = typeof navigator !== 'undefined' ? navigator.platform || navigator.userAgent : ''
  return /Mac|iPhone|iPad/i.test(p) ? '⌘K' : 'Ctrl K'
}
