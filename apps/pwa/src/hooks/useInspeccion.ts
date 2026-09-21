import { useEffect, useMemo, useState } from 'react'
import { leerLineas } from '@/services/lineasProceso/lineasProceso.service'
import { pesosPorLinea, type PesoEnLinea } from '@/services/lineasProceso/modeloLineas'
import {
  escucharDesviaciones,
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
  /**
   * El peso de los elementos MANUALES por su nombre. Un `manual:` no tiene código SAP, así que
   * el evento no lo puede enlazar por `equipoId` — y son justo los que más pesan (la cinta
   * larga del grader y las 12 buchacas son el 100 % de Emparrillado).
   */
  const [pesoPorNombre, setPesoPorNombre] = useState<Map<string, PesoEnLinea>>(() => new Map())
  const [desviaciones, setDesviaciones] = useState<EventoBitacora[]>([])

  useEffect(() => escucharPauta(PAUTA_POST_ASEO.id, setPauta), [])
  useEffect(() => {
    let vivo = true
    // Sin diagrama guardado no se puede deducir: entonces ninguna se marca crítica, que es
    // mejor que marcarlas todas y que el aviso deje de significar algo.
    void leerLineas(plantId)
      .then((g) => {
        if (!vivo || !g) return
        const ps = pesosPorLinea(g)
        setPesos(ps)
        const porNombre = new Map<string, PesoEnLinea>()
        for (const n of g.nodos) {
          const p = n.nombre && ps.get(n.id)
          if (p) porNombre.set(clave(n.nombre ?? ''), p)
        }
        setPesoPorNombre(porNombre)
      })
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

  // Se leen por inspección; los eventos del turno solo sirven para verlas al instante
  // mientras Firestore confirma (el mismo evento puede llegar por las dos vías).
  useEffect(() => {
    if (!inspeccion?.id) {
      setDesviaciones([])
      return
    }
    return escucharDesviaciones(inspeccion.id, setDesviaciones)
  }, [inspeccion?.id])

  const todas = useMemo(() => {
    const m = new Map<string, EventoBitacora>()
    for (const e of desviaciones) m.set(e.id, e)
    for (const e of eventos) if (e.inspeccion?.id && e.inspeccion.id === inspeccion?.id) m.set(e.id, e)
    return [...m.values()]
  }, [desviaciones, eventos, inspeccion?.id])

  const resumen = useMemo(() => {
    const ds: DesviacionDeInspeccion[] = todas.map((e) => ({
      id: e.id,
      criterioId: e.inspeccion?.criterioId ?? '',
      // Un pendiente con cierre ya está resuelto: el cierre manda sobre la marca.
      pendiente: e.pendiente && !e.cierre,
      critica: esCritica(e, pesos, pesoPorNombre),
      desdeMin: e.posicionMin ?? null,
      hastaMin: minutosDeTermino(e),
    }))
    return resumenDeInspeccion(
      pauta,
      { resultados: inspeccion?.resultados ?? {}, notas: inspeccion?.notas, marcas: inspeccion?.marcas },
      ds,
    )
  }, [pauta, inspeccion?.resultados, inspeccion?.notas, inspeccion?.marcas, todas, pesos, pesoPorNombre])

  return { pauta, inspeccion, desviaciones: todas, resumen }
}

/**
 * ¿Esta desviación para una línea? Lo dice el diagrama: un equipo con peso de flujo detiene
 * su línea al fallar. Un elemento suelto (0 %) o un servicio de apoyo, no.
 * ⚠ Un evento escrito a mano, sin equipo del árbol, no se puede juzgar: no se marca crítica.
 */
function esCritica(
  e: EventoBitacora,
  pesos: ReadonlyMap<string, PesoEnLinea>,
  porNombre: ReadonlyMap<string, PesoEnLinea>,
): boolean | null {
  // Del árbol: la vía normal.
  const p = e.equipoId ? pesos.get(e.equipoId) : undefined
  if (p) return !p.ciclo && p.peso > 0
  // Sin código SAP: se intenta por nombre contra los elementos manuales del diagrama.
  const m = porNombre.get(clave(e.equipo ?? ''))
  if (m) return !m.ciclo && m.peso > 0
  // No se pudo juzgar. NO es lo mismo que «no es crítica».
  return null
}

/** Nombres comparables: sin tildes, sin dobles espacios y en minúscula. */
function clave(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
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
