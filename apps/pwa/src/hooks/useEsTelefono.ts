import { useEffect, useState } from 'react'

/**
 * true por debajo de 768 px (el teléfono). La tablet (768–1023) y el PC quedan fuera:
 * ahí la Bitácora tiene su columna del correo o su expediente.
 */
export function useEsTelefono(): boolean {
  const q = '(max-width: 767px)'
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
