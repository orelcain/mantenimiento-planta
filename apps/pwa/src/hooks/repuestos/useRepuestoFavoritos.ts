import { useCallback, useEffect, useState } from 'react'
import { getRepuestoFavs, saveRepuestoFavs } from '@/services/userPreferences'
import { rowKeyDeRepuesto, type RepuestoIdentificable } from './identidadDeRepuesto'

/**
 * «Mis favoritos» de repuestos — UNA sola lista y UNA sola implementación.
 *
 * POR QUÉ EXISTE
 * --------------
 * La lógica (cargar `repuestoFavs`, alternar, persistir) estaba COPIADA en el hub de áreas y
 * en el Centro Técnico Documental, y la pestaña Bodega tenía **una tercera lista distinta**
 * sobre otra colección (`bodegaWatchlist`), con la misma palabra y el mismo icono de estrella.
 *
 * Lo que veía el técnico el 13-09:
 *
 *     pestaña Áreas   ⭐ «Mis favoritos (8)»
 *     pestaña Bodega  ⭐ «Favoritos 0»
 *
 * Las dos cifras eran ciertas y las dos pantallas mentían juntas: el usuario tiene favoritos y
 * una de ellas dice que no. Medido en Firestore: `repuestoFavs` tenía 8 y 2 en los dos únicos
 * usuarios con preferencias; `bodegaWatchlist` estaba **vacía para todos**, así que unificarlas
 * no le borra una marca a nadie.
 *
 * La decisión ya estaba escrita en el Centro Técnico Documental: *«marcar aquí un material se
 * ve marcado allá, que es lo que uno espera de mis favoritos — no una segunda lista
 * paralela»*. Esto la aplica al último sitio que faltaba.
 *
 * La clave es la identidad estable de la pieza (`identidadDeRepuesto.ts`), no el docId: un
 * repuesto aparece N veces en el catálogo, una por equipo, y el favorito sigue a la pieza.
 */
export interface RepuestoFavoritos {
  /** Las claves marcadas. Para filtrar con `esFavoritoDe(favKeys)` de `filtrosDeRepuestos`. */
  favKeys: Set<string>
  /** ¿Está marcada esta pieza? Acepta el repuesto o su rowKey ya calculado. */
  esFavorito: (rep: RepuestoIdentificable | string) => boolean
  /** Marca o desmarca. Acepta el repuesto o su rowKey ya calculado. */
  toggleFav: (rep: RepuestoIdentificable | string) => void
}

const claveDe = (rep: RepuestoIdentificable | string): string =>
  typeof rep === 'string' ? rep : rowKeyDeRepuesto(rep)

export function useRepuestoFavoritos(userId: string | undefined): RepuestoFavoritos {
  const [favKeys, setFavKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!userId) return
    getRepuestoFavs(userId)
      .then((arr) => setFavKeys(new Set(arr)))
      .catch(() => {})
  }, [userId])

  const toggleFav = useCallback(
    (rep: RepuestoIdentificable | string) => {
      if (!userId) return
      const key = claveDe(rep)
      setFavKeys((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        void saveRepuestoFavs(userId, [...next])
        return next
      })
    },
    [userId],
  )

  const esFavorito = useCallback((rep: RepuestoIdentificable | string) => favKeys.has(claveDe(rep)), [favKeys])

  return { favKeys, esFavorito, toggleFav }
}
