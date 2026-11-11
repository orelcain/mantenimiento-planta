import { useCallback, useEffect, useState } from 'react'
import { EVENTO_LECTURA, elegirLectura, lecturaActual } from '@/lib/modoLectura'

/** Estado reactivo del modo lectura: todos los controles montados se enteran del cambio. */
export function useModoLectura() {
  const [lectura, setLectura] = useState(lecturaActual)

  useEffect(() => {
    const alCambiar = (e: Event) => setLectura(Boolean((e as CustomEvent<boolean>).detail))
    window.addEventListener(EVENTO_LECTURA, alCambiar)
    return () => window.removeEventListener(EVENTO_LECTURA, alCambiar)
  }, [])

  const setModoLectura = useCallback((activo: boolean) => elegirLectura(activo), [])
  const alternar = useCallback(() => elegirLectura(!lecturaActual()), [])

  return { lectura, setModoLectura, alternar }
}
