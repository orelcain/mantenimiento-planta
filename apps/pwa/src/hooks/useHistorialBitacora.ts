import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
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
 *
 * El rango va acotado por los DOS lados y con tope de documentos: sin el `<=`,
 * un teléfono con el reloj adelantado metía su evento «de mañana» en todos los
 * períodos; sin el tope, una temporada cargada se leía entera de una sentada
 * (techo de costo del proyecto).
 */
const TOPE_EVENTOS = 1500

export function useHistorialBitacora(dias: number) {
  const [eventos, setEventos] = useState<EventoBitacora[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const desde = useMemo(() => fechaDesde(dias), [dias])
  const hasta = useMemo(() => fechaLocal(new Date()), [dias])

  useEffect(() => {
    let vivo = true
    setCargando(true)
    setError(null)
    getDocs(
      query(
        collection(db, BITACORA_COLECCION),
        where('fechaTurno', '>=', desde),
        where('fechaTurno', '<=', hasta),
        // Descendente: si el período supera el tope, lo que se pierde es lo más
        // viejo, no lo de ayer.
        orderBy('fechaTurno', 'desc'),
        limit(TOPE_EVENTOS),
      ),
    )
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
      // El guard también aquí: sin él, la respuesta del período ANTERIOR
      // apagaba «cargando» mientras el período nuevo seguía en camino, y en esa
      // ventana Copiar/PDF salían con los números viejos (revisión 15-09).
      .finally(() => {
        if (vivo) setCargando(false)
      })
    return () => {
      vivo = false
    }
  }, [desde, hasta])

  const filas = useMemo(() => filasPorTurno(eventos), [eventos])
  const resumen = useMemo(() => resumirPeriodo(eventos, desde, hasta), [eventos, desde, hasta])

  return { eventos, filas, resumen, cargando, error }
}
