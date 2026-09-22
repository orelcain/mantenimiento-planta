import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { BITACORA_COLECCION, BITACORA_PLANTA } from '@/config/bitacora'
import { fechaLocal } from '@/services/bitacora/turnoMantencion'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'

/** Más que esto en 60 días sería otra planta; el tope es un seguro, no un límite real. */
const TOPE = 1500

/**
 * Los eventos de la bitácora que nombran un equipo A MANO (sin `equipoId`), de los últimos
 * `dias`. Alimenta la bandeja «Nombrados a mano en la bitácora» del editor de líneas
 * (Orel, 21-09-2026).
 *
 * Una lectura única al abrir el editor, acotada por fecha: la misma consulta que ya usa el
 * historial (`fechaTurno` en rango, descendente, con tope), así que no pide índice nuevo.
 * ⚠ Se filtra `equipoId` en el cliente y no con `where('equipoId','==',null)`: los eventos
 * viejos no traen el campo y esa consulta se los comería.
 */
export function useEventosSinEquipo(dias = 60): { eventos: EventoBitacora[]; cargando: boolean; error: string | null } {
  const [todos, setTodos] = useState<EventoBitacora[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const desde = useMemo(() => fechaLocal(new Date(Date.now() - dias * 86_400_000)), [dias])

  useEffect(() => {
    let vivo = true
    setCargando(true)
    setError(null)
    getDocs(
      query(
        collection(db, BITACORA_COLECCION),
        where('fechaTurno', '>=', desde),
        where('fechaTurno', '<=', fechaLocal(new Date())),
        orderBy('fechaTurno', 'desc'),
        limit(TOPE),
      ),
    )
      .then((snap) => {
        if (!vivo) return
        setTodos(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EventoBitacora).filter((e) => e.plantId === BITACORA_PLANTA.id))
        setCargando(false)
      })
      .catch((e: unknown) => {
        if (!vivo) return
        setError(e instanceof Error ? e.message : 'No se pudieron leer los eventos.')
        setCargando(false)
      })
    return () => {
      vivo = false
    }
  }, [desde])

  const eventos = useMemo(() => todos.filter((e) => !e.equipoId), [todos])
  return { eventos, cargando, error }
}
