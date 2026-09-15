import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { BITACORA_COLECCION, BITACORA_PLANTA } from '@/config/bitacora'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'
import { fechaDesde, filasPorTurno, resumirPeriodo } from '@/services/bitacora/historialBitacora'
import { fechaLocal } from '@/services/bitacora/turnoMantencion'

/**
 * Eventos del período para el Historial.
 *
 * Una sola consulta por RANGO de `fechaTurno` (sin igualdad de `plantId`, que
 * exigiría índice compuesto): la planta se filtra en el teléfono. Es una lectura
 * puntual por período elegido, no un listener: el historial se mira, no se vigila.
 */
export function useHistorialBitacora(dias: number) {
  const [eventos, setEventos] = useState<EventoBitacora[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const desde = useMemo(() => fechaDesde(dias), [dias])

  useEffect(() => {
    let vivo = true
    setCargando(true)
    getDocs(query(collection(db, BITACORA_COLECCION), where('fechaTurno', '>=', desde)))
      .then((snap) => {
        if (!vivo) return
        setEventos(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as EventoBitacora)
            .filter((e) => e.plantId === BITACORA_PLANTA.id),
        )
        setError(null)
      })
      .catch((e: { code?: string }) => {
        if (!vivo) return
        setError(
          e?.code === 'permission-denied'
            ? 'No tienes permiso para ver el historial.'
            : 'No se pudo cargar el historial. Revisa la conexión.',
        )
      })
      .finally(() => setCargando(false))
    return () => {
      vivo = false
    }
  }, [desde])

  const filas = useMemo(() => filasPorTurno(eventos), [eventos])
  const resumen = useMemo(() => resumirPeriodo(eventos, desde, fechaLocal(new Date())), [eventos, desde])

  return { eventos, filas, resumen, cargando, error }
}
