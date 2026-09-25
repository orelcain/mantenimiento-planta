import { useEffect, useState } from 'react'

/**
 * true desde 1024 px de ancho (y se actualiza si cambia la ventana). Ahí caben
 * la columna de filtros y una tabla ancha; más angosto va la vista de celular.
 */
export function useEsPC(): boolean {
  const q = '(min-width: 1024px)'
  const [es, setEs] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches === true)
  useEffect(() => {
    const m = window.matchMedia?.(q)
    if (!m) return
    const f = () => setEs(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return es
}
