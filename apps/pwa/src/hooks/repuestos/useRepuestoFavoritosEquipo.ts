import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getRepuestoFavLists, saveRepuestoFavLists } from '@/services/userPreferences'
import type { RepuestoIdentificable } from './identidadDeRepuesto'
import {
  alternarEnLista, alternarFavorito, contarEnLista, contarFavoritos, crearLista, eliminarLista,
  esFavoritoDelEquipo, estaEnLista, migrarListas, type ListaFavoritos,
} from '@/utils/repuestos/favoritosEquipo'

/**
 * Favoritos POR EQUIPO — se SUMAN a `useRepuestoFavoritos` (los globales, que no cambian).
 *
 *   «Favoritos (todos)»            → `useRepuestoFavoritos`: tus estrellas, valen en cualquier equipo.
 *   «Favoritos de este equipo»     → este hook: la unión de las listas con nombre de ESE equipo.
 *
 * Son dos listas distintas a propósito (un técnico marca una pieza para una máquina y no para
 * otra), pero la pantalla las rotula distinto para que ninguna contradiga a la otra
 * (ver e6c44631: «Favoritos 0» en una pestaña y «8» en otra).
 *
 * `equipKey` = clave que el hub usa al seleccionar el equipo. Sin equipo no hay nada que guardar.
 * Guarda optimista: la pantalla cambia al tocar y Firestore se entera detrás.
 */
export interface RepuestoFavoritosEquipo {
  /** Listas del equipo, con los ids viejos ya traducidos. */
  listas: ListaFavoritos[]
  cargando: boolean
  esFavorito: (rep: RepuestoIdentificable | string) => boolean
  enLista: (nombre: string, rep: RepuestoIdentificable | string) => boolean
  /** Estrella del equipo: marca (lista general) o desmarca (de todas las listas). */
  toggleFav: (rep: RepuestoIdentificable | string) => void
  toggleEnLista: (nombre: string, rep: RepuestoIdentificable | string) => void
  /** Crea la lista (con el repuesto dentro si se pasa). Ignora nombres vacíos o repetidos. */
  crearLista: (nombre: string, rep?: RepuestoIdentificable | string) => void
  eliminarLista: (nombre: string) => void
  /** Cuántas de estas filas son favoritas del equipo. */
  contarFavoritos: <T extends RepuestoIdentificable>(filas: readonly T[]) => number
  contarEnLista: <T extends RepuestoIdentificable>(nombre: string, filas: readonly T[]) => number
}

export function useRepuestoFavoritosEquipo(userId: string | undefined, equipKey: string | null | undefined): RepuestoFavoritosEquipo {
  const [listas, setListas] = useState<ListaFavoritos[]>([])
  const [cargando, setCargando] = useState(false)
  // Siempre la última, para encadenar toques rápidos sin leer una copia vieja.
  const ultima = useRef<ListaFavoritos[]>([])
  // Evita que la respuesta de un equipo anterior pise al actual.
  const vigente = useRef<string | null>(null)

  useEffect(() => {
    vigente.current = userId && equipKey ? `${userId}/${equipKey}` : null
    ultima.current = []
    setListas([])
    if (!userId || !equipKey) { setCargando(false); return }
    const miClave = vigente.current
    setCargando(true)
    getRepuestoFavLists(userId, equipKey)
      .then((raw) => {
        if (vigente.current !== miClave) return
        const l = migrarListas(raw)
        ultima.current = l
        setListas(l)
      })
      .catch(() => {})
      .finally(() => { if (vigente.current === miClave) setCargando(false) })
  }, [userId, equipKey])

  const aplicar = useCallback((fn: (prev: ListaFavoritos[]) => ListaFavoritos[]) => {
    if (!userId || !equipKey) return
    const next = fn(ultima.current)
    ultima.current = next
    setListas(next)
    void saveRepuestoFavLists(userId, equipKey, next)
  }, [userId, equipKey])

  return useMemo<RepuestoFavoritosEquipo>(() => ({
    listas,
    cargando,
    esFavorito: (rep) => esFavoritoDelEquipo(listas, rep),
    enLista: (nombre, rep) => { const l = listas.find((x) => x.name === nombre); return !!l && estaEnLista(l, rep) },
    toggleFav: (rep) => aplicar((p) => alternarFavorito(p, rep)),
    toggleEnLista: (nombre, rep) => aplicar((p) => alternarEnLista(p, nombre, rep)),
    crearLista: (nombre, rep) => aplicar((p) => crearLista(p, nombre, rep)),
    eliminarLista: (nombre) => aplicar((p) => eliminarLista(p, nombre)),
    contarFavoritos: (filas) => contarFavoritos(listas, filas),
    contarEnLista: (nombre, filas) => { const l = listas.find((x) => x.name === nombre); return l ? contarEnLista(l, filas) : 0 },
  }), [listas, cargando, aplicar])
}
