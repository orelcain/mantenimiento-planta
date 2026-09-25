import { useCallback, useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'
import { cargarCatalogos } from './catalogosFabricante'

/**
 * De un código de fabricante a sus dos "dónde":
 *  - el DIBUJO: la figura del despiece navegable (zoom a la posición, y el
 *    recorrido ‹ 1 de N › si va en varios lugares).
 *  - el MANUAL: el PDF del fabricante abierto en su página.
 * Lo usan Códigos fabricante y el inventario por máquina.
 */

/**
 * Mapa código de fabricante → figura del despiece navegable.
 * Se carga aparte (~39 KB por máquina) en vez de leer los índices completos
 * (~770 KB c/u). Son DOS máquinas con despiece navegable.
 */
export const DESPIECES = [
  { slug: 'baader-142-despiece', archivo: 'despiece-142-figuras.json', maquina: 'BAADER 142' },
  { slug: 'baader-200-despiece', archivo: 'despiece-200-figuras.json', maquina: 'BAADER 200' },
]

/** Dónde vive un código dentro de un despiece. */
export type EnDespiece = { hoja: number; fig: string; slug: string; maquina: string }

export function useFigurasDespiece() {
  const [mapa, setMapa] = useState<Record<string, EnDespiece[]> | null>(null)
  useEffect(() => {
    let vivo = true
    Promise.all(
      DESPIECES.map(({ slug, archivo, maquina }) =>
        fetch(`${import.meta.env.BASE_URL}data/${archivo}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { codigos?: Record<string, [number, string]> } | null) =>
            Object.entries(d?.codigos ?? {}).map(
              ([cod, [hoja, fig]]) => [cod, { hoja, fig, slug, maquina }] as const,
            ))
          .catch(() => []),
      ),
    ).then((partes) => {
      if (!vivo) return
      const acc: Record<string, EnDespiece[]> = {}
      for (const [cod, donde] of partes.flat()) (acc[cod] ??= []).push(donde)
      setMapa(acc)
    })
    return () => {
      vivo = false
    }
  }, [])
  return mapa
}

/**
 * Ruta del visor de planos para un código, dentro de la app (sin BASE_URL).
 * `?ap=<código>` abre la ficha de la pieza y, si va en varios lugares, el
 * recorrido ‹ 1 de N › ya cargado.
 */
export function rutaDibujo(
  figuras: Record<string, EnDespiece[]> | null,
  codigo: string,
  maquina?: string,
): string | null {
  const donde = figuras?.[codigo.trim()]
  if (!donde?.length) return null
  const d = (maquina && donde.find((x) => x.maquina === maquina)) || donde[0]!
  return `/aprendizaje/planos/${d.slug}?hoja=${d.hoja}&ap=${encodeURIComponent(codigo.trim())}`
}

/**
 * Página del manual del fabricante para un código. Carga el catálogo (el mismo
 * que ya usa Códigos fabricante, cacheado por sesión) y las URL de `manuales`
 * SOLO cuando `activo` pasa a true: en el teléfono, recién al pedirlo.
 */
export function useManualesPieza(activo: boolean) {
  const [paginas, setPaginas] = useState<Map<string, { manualId: string; pagina: number }> | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!activo || paginas) return
    let vivo = true
    cargarCatalogos()
      .then((ps) => {
        if (!vivo) return
        const m = new Map<string, { manualId: string; pagina: number }>()
        for (const p of ps) {
          if (!p.manualId || !p.pagina) continue
          const k = `${p.maquina}|${p.codigo}`
          if (!m.has(k)) m.set(k, { manualId: p.manualId, pagina: p.pagina })
        }
        setPaginas(m)
      })
      .catch((e) => { if (vivo) setError(true); logger.warn('manuales: catálogo', { error: e instanceof Error ? e.message : String(e) }) })
    getDocs(collection(db, 'manuales'))
      .then((snap) => {
        if (!vivo) return
        const u: Record<string, string> = {}
        snap.forEach((d) => { const x = d.data().url; if (x) u[d.id] = x })
        setUrls(u)
      })
      .catch((e) => logger.warn('manuales: URL', { error: e instanceof Error ? e.message : String(e) }))
    return () => { vivo = false }
  }, [activo, paginas])

  const manualDe = useCallback(
    // url null = la pieza SÍ tiene página, pero el PDF no se pudo leer (sin
    // sesión o sin señal): no es lo mismo que "no está en el manual".
    (codigo: string, maquina?: string): { url: string | null; pagina: number } | null => {
      if (!paginas || !maquina) return null
      const e = paginas.get(`${maquina}|${codigo.trim()}`)
      if (!e) return null
      const base = urls[e.manualId]
      return { url: base ? `${base}#page=${e.pagina}` : null, pagina: e.pagina }
    },
    [paginas, urls],
  )

  return { manualDe, cargando: activo && !paginas && !error }
}
