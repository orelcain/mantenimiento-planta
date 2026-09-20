import { useEffect, useMemo, useState } from 'react'
import {
  escucharInspeccion,
  escucharPauta,
  type InspeccionGuardada,
} from '@/services/inspecciones/inspecciones.service'
import {
  PAUTA_POST_ASEO,
  resumenDeInspeccion,
  type DesviacionDeInspeccion,
  type PautaInspeccion,
  type ResumenInspeccion,
} from '@/services/inspecciones/modeloInspeccion'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'

/**
 * La inspección del turno y su pauta, en vivo. Las desviaciones NO se leen aparte: son los
 * eventos de la bitácora que apuntan a esta inspección, así que se derivan de los que la página
 * ya tiene cargados (una lectura menos y siempre coherentes con lo que se ve en pantalla).
 */
export function useInspeccion(
  plantId: string,
  turnoId: string,
  eventos: readonly EventoBitacora[],
): {
  pauta: PautaInspeccion
  inspeccion: InspeccionGuardada | null
  desviaciones: EventoBitacora[]
  resumen: ResumenInspeccion
} {
  const [pauta, setPauta] = useState<PautaInspeccion>(PAUTA_POST_ASEO)
  const [inspeccion, setInspeccion] = useState<InspeccionGuardada | null>(null)

  useEffect(() => escucharPauta(PAUTA_POST_ASEO.id, setPauta), [])
  useEffect(() => {
    if (!turnoId) return
    setInspeccion(null)
    return escucharInspeccion(plantId, turnoId, setInspeccion)
  }, [plantId, turnoId])

  const desviaciones = useMemo(
    () => eventos.filter((e) => !!e.inspeccion?.id && e.inspeccion.id === inspeccion?.id),
    [eventos, inspeccion?.id],
  )

  const resumen = useMemo(() => {
    const ds: DesviacionDeInspeccion[] = desviaciones.map((e) => ({
      id: e.id,
      criterioId: e.inspeccion?.criterioId ?? '',
      // Un pendiente con cierre ya está resuelto: el cierre manda sobre la marca.
      pendiente: e.pendiente && !e.cierre,
      desdeMin: e.posicionMin ?? null,
      hastaMin: minutosDeTermino(e),
    }))
    return resumenDeInspeccion(pauta, { resultados: inspeccion?.resultados ?? {} }, ds)
  }, [pauta, inspeccion?.resultados, desviaciones])

  return { pauta, inspeccion, desviaciones, resumen }
}

/**
 * Cuándo se cerró, en minutos desde el inicio del turno. Se calcula desde `posicionMin` y la
 * diferencia de reloj entre inicio y término, en vez de restar `HH:mm` a secas: los turnos
 * cruzan la medianoche y ahí la resta de reloj sale negativa.
 */
function minutosDeTermino(e: EventoBitacora): number | null {
  if (e.posicionMin == null || !e.horaInicio || !e.horaTermino) return null
  const a = enMinutos(e.horaInicio)
  const b = enMinutos(e.horaTermino)
  if (a == null || b == null) return null
  const duracion = b >= a ? b - a : b + 24 * 60 - a
  return e.posicionMin + duracion
}

function enMinutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}
