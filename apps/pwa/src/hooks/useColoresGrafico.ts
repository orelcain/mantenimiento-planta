/**
 * Hook de colores de gráficos (Pizarra). Devuelve `elegir(hoy, token, alfa)` — ver
 * lib/coloresGrafico.ts — y se actualiza cuando cambia la intensidad (Día · Penumbra ·
 * Automático) o la paleta (activarla o quitarla en caliente), para que los canvas
 * (Chart.js / ECharts) se redibujen con los tokens nuevos.
 *
 * Sin Pizarra: `elegir` devuelve siempre el literal `hoy`. El hook observa el <html>
 * igual, pero solo renderiza de nuevo si cambia lo que altera los colores (la firma):
 * sin Pizarra, alternar la clase `dark` no cambia nada y no provoca renders.
 *
 * Uso: `const { elegir, version } = useColoresGrafico()` y poner `elegir` (o `version`)
 * entre las dependencias de los `useMemo` que arman datos/opciones del gráfico.
 */
import { useEffect, useMemo, useState } from 'react'
import { EVENTO_INTENSIDAD } from '@/lib/intensidad'
import { elegirColor, hayPizarra, limpiarCacheColores, porPaleta } from '@/lib/coloresGrafico'

export interface ColoresGrafico {
  /** ¿Pizarra activa en este render? */
  pizarra: boolean
  /** Sube cada vez que hay que volver a leer los tokens (0 mientras nada haya cambiado). */
  version: number
  /** `hoy` sin Pizarra; con Pizarra, el token resuelto (con opacidad opcional). */
  elegir: (hoy: string, token: string, alfa?: number) => string
  /** Valor no-color: `hoy` sin Pizarra, `con` con Pizarra. */
  porPaleta: <T>(hoy: T, con: T) => T
}

/**
 * Firma de lo que cambia los tokens: sin Pizarra siempre 'n'; con Pizarra, 'pl' (Día)
 * o 'pd' (Penumbra).
 */
function leerFirma(): string {
  if (typeof document === 'undefined' || !hayPizarra()) return 'n'
  return document.documentElement.classList.contains('dark') ? 'pd' : 'pl'
}

export function useColoresGrafico(): ColoresGrafico {
  const [estado, setEstado] = useState(() => ({ firma: leerFirma(), version: 0 }))

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    // Se compara antes de actualizar: sin cambio real de firma no hay render (evita bucles).
    const releer = () => {
      limpiarCacheColores()
      const firma = leerFirma()
      setEstado((prev) => (prev.firma === firma ? prev : { firma, version: prev.version + 1 }))
    }
    // SIEMPRE se observa (haya Pizarra o no): activarla o quitarla en caliente debe repintar.
    const obs = new MutationObserver(releer)
    obs.observe(root, { attributes: true, attributeFilter: ['class', 'data-paleta'] })
    // El evento sale ANTES de aplicar la clase: se relee en el cuadro siguiente.
    let raf = 0
    const alIntensidad = () => {
      if (typeof requestAnimationFrame === 'function') {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(releer)
      } else releer()
    }
    window.addEventListener(EVENTO_INTENSIDAD, alIntensidad)
    releer() // por si cambió entre el render y el efecto
    return () => {
      obs.disconnect()
      window.removeEventListener(EVENTO_INTENSIDAD, alIntensidad)
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
    }
  }, [])

  const { firma, version } = estado
  const pizarra = firma !== 'n'
  // `elegir` es un cierre NUEVO por versión: así basta ponerlo en las deps de un `useMemo`
  // para que los datos/opciones del gráfico se recalculen al releer los tokens.
  return useMemo<ColoresGrafico>(
    () => ({ pizarra, version, elegir: (hoy, token, alfa) => elegirColor(hoy, token, alfa), porPaleta }),
    [pizarra, version],
  )
}
