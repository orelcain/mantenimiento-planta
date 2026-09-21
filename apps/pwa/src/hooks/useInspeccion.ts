import { useEffect, useMemo, useState } from 'react'
import { leerLineas } from '@/services/lineasProceso/lineasProceso.service'
import { pesosPorLinea, type PesoEnLinea } from '@/services/lineasProceso/modeloLineas'
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
  /**
   * Qué parte de su línea lleva cada equipo. Es lo que responde si una desviación abierta es
   * CRÍTICA (§8: «compromete el funcionamiento del proceso») sin preguntárselo a nadie: si el
   * equipo lleva flujo, su falla para la línea. Se lee una vez.
   */
  const [pesos, setPesos] = useState<Map<string, PesoEnLinea>>(() => new Map())

  useEffect(() => escucharPauta(PAUTA_POST_ASEO.id, setPauta), [])
  useEffect(() => {
    let vivo = true
    // Sin diagrama guardado no se puede deducir: entonces ninguna se marca crítica, que es
    // mejor que marcarlas todas y que el aviso deje de significar algo.
    void leerLineas(plantId)
      .then((g) => vivo && g && setPesos(pesosPorLinea(g)))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [plantId])
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
      critica: esCritica(e, pesos),
      desdeMin: e.posicionMin ?? null,
      hastaMin: minutosDeTermino(e),
    }))
    return resumenDeInspeccion(
      pauta,
      { resultados: inspeccion?.resultados ?? {}, notas: inspeccion?.notas, marcas: inspeccion?.marcas },
      ds,
    )
  }, [pauta, inspeccion?.resultados, inspeccion?.notas, inspeccion?.marcas, desviaciones, pesos])

  return { pauta, inspeccion, desviaciones, resumen }
}

/**
 * ¿Esta desviación para una línea? Lo dice el diagrama: un equipo con peso de flujo detiene
 * su línea al fallar. Un elemento suelto (0 %) o un servicio de apoyo, no.
 * ⚠ Un evento escrito a mano, sin equipo del árbol, no se puede juzgar: no se marca crítica.
 */
function esCritica(e: EventoBitacora, pesos: ReadonlyMap<string, PesoEnLinea>): boolean {
  if (!e.equipoId) return false
  const p = pesos.get(e.equipoId)
  return !!p && !p.ciclo && p.peso > 0
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
