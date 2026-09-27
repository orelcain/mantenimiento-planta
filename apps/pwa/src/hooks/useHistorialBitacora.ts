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
 * Lee el período elegido Y el anterior del mismo largo en la MISMA consulta
 * (desde `2 × días`): el anterior es la referencia «¿mejoramos?» de las cifras
 * (19-09-2026). La bitácora trae pocos eventos, así que el costo es el mismo orden.
 *
 * El rango va acotado por los DOS lados y con tope de documentos: sin el `<=`,
 * un teléfono con el reloj adelantado metía su evento «de mañana» en todos los
 * períodos; sin el tope, una temporada cargada se leía entera de una sentada
 * (techo de costo del proyecto).
 */
const TOPE_EVENTOS = 1500

export function useHistorialBitacora(dias: number) {
  const [todos, setTodos] = useState<EventoBitacora[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const desde = useMemo(() => fechaDesde(dias), [dias])
  const desdeAnterior = useMemo(() => fechaDesde(dias * 2), [dias])
  const hasta = useMemo(() => fechaLocal(new Date()), [dias])

  useEffect(() => {
    let vivo = true
    setCargando(true)
    setError(null)
    getDocs(
      query(
        collection(db, BITACORA_COLECCION),
        where('fechaTurno', '>=', desdeAnterior),
        where('fechaTurno', '<=', hasta),
        // Descendente: si el período supera el tope, lo que se pierde es lo más
        // viejo, no lo de ayer.
        orderBy('fechaTurno', 'desc'),
        limit(TOPE_EVENTOS),
      ),
    )
      .then((snap) => {
        if (!vivo) return
        setTodos(
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
  }, [desdeAnterior, hasta])

  // El período elegido y el anterior salen de la misma lectura.
  const actuales = useMemo(() => todos.filter((e) => e.fechaTurno >= desde), [todos, desde])
  const anteriores = useMemo(() => todos.filter((e) => e.fechaTurno < desde), [todos, desde])
  const filas = useMemo(() => filasPorTurno(actuales), [actuales])
  const resumen = useMemo(() => resumirPeriodo(actuales, desde, hasta), [actuales, desde, hasta])
  const resumenAnterior = useMemo(
    () => (anteriores.length ? resumirPeriodo(anteriores, desdeAnterior, anteriores[0]!.fechaTurno) : null),
    [anteriores, desdeAnterior],
  )

  return { eventos: actuales, filas, resumen, resumenAnterior, cargando, error }
}
