import { useEffect, useRef, useState } from 'react'
import type { LaminaWhatsapp } from '@/services/bitacora/bitacoraWhatsapp'
import { generarLamina, type CacheImagenes } from '@/services/bitacora/laminaWhatsapp'

export interface LaminaGenerada {
  lamina: LaminaWhatsapp
  png: Blob
  /** URL local del PNG para la vista previa (se libera sola). */
  url: string
  /** Fotos que no se pudieron cargar (salen como «Foto no disponible»). */
  fallidas: number
}

/**
 * Genera las láminas de WhatsApp mientras el panel está a la vista, para que
 * «Copiar imagen» y «Compartir» respondan al instante (el portapapeles y el
 * menú de compartir exigen que la acción ocurra dentro del toque).
 *
 * Solo redibuja las láminas que cambiaron (por su `clave`) y libera las URL
 * locales de las que ya no se usan.
 */
export function useLaminasWhatsapp(plan: readonly LaminaWhatsapp[], activo: boolean) {
  const [generadas, setGeneradas] = useState<ReadonlyMap<string, LaminaGenerada>>(new Map())
  const [generando, setGenerando] = useState(false)
  const actuales = useRef<Map<string, LaminaGenerada>>(new Map())
  const cache = useRef<CacheImagenes>(new Map())
  const planRef = useRef(plan)
  planRef.current = plan
  const firma = plan.map((l) => l.clave).join('\n')

  useEffect(() => {
    if (!activo) return
    let cancelado = false
    const creadas: LaminaGenerada[] = []
    // Una pausa corta: mientras alguien escribe en otro equipo, el plan cambia seguido.
    const t = setTimeout(async () => {
      const lista = planRef.current
      if (lista.every((l) => actuales.current.has(l.clave)) && lista.length === actuales.current.size) return
      setGenerando(true)
      const nuevas = new Map<string, LaminaGenerada>()
      for (const l of lista) {
        if (cancelado) break
        const previa = actuales.current.get(l.clave)
        if (previa) {
          nuevas.set(l.clave, previa)
          continue
        }
        try {
          const { png, fallidas } = await generarLamina(l, cache.current)
          // Cancelada mientras se dibujaba: no se crea una URL que nadie va a liberar.
          if (cancelado) break
          const g = { lamina: l, png, url: URL.createObjectURL(png), fallidas }
          creadas.push(g)
          nuevas.set(l.clave, g)
        } catch {
          /* esa lámina queda sin generar; las demás siguen */
        }
      }
      if (cancelado) return
      for (const [clave, g] of actuales.current) if (!nuevas.has(clave)) URL.revokeObjectURL(g.url)
      actuales.current = nuevas
      creadas.length = 0
      setGeneradas(nuevas)
      setGenerando(false)
    }, 350)
    return () => {
      cancelado = true
      clearTimeout(t)
      // Lo que se alcanzó a crear en una corrida cancelada no quedó en uso.
      for (const g of creadas) URL.revokeObjectURL(g.url)
      setGenerando(false)
    }
  }, [firma, activo])

  useEffect(
    () => () => {
      for (const g of actuales.current.values()) URL.revokeObjectURL(g.url)
      actuales.current = new Map()
    },
    [],
  )

  const listas = plan.map((l) => generadas.get(l.clave)).filter((g): g is LaminaGenerada => Boolean(g))
  return {
    /** En el orden del plan; solo las que ya están listas. */
    listas,
    generando,
    /** Todas las del plan están listas. */
    completas: listas.length === plan.length,
  }
}
