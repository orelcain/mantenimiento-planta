import { useEffect, useState } from 'react'
import { tocaMostrarRotulo } from '@/services/bitacora/pedirNuevoEvento'

/**
 * «Nuevo evento» sobre el «+» de la barra, las primeras veces que se entra a
 * la bitácora en un teléfono: en el resto de la app ese botón registra
 * incidencias, y aquí hace otra cosa.
 */
export function RotuloNuevoEvento({ activo }: { activo: boolean }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!activo || !tocaMostrarRotulo()) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 4000)
    return () => clearTimeout(t)
  }, [activo])
  if (!visible) return null
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 whitespace-nowrap rounded-full bg-card px-3 py-1.5 text-footnote font-semibold text-foreground shadow-[0_2px_10px_rgba(0,0,0,0.15)] piel-fade-in motion-reduce:animate-none"
    >
      Nuevo evento
    </span>
  )
}
