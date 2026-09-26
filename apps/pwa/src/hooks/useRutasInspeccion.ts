import { useEffect, useMemo, useState } from 'react'
import { escucharRecorridos, escucharRutas, type RecorridoGuardado } from '@/services/inspecciones/rutas.service'
import { RUTAS_CHONCHI } from '@/services/inspecciones/rutasChonchi'
import { rutasPorAtencion, type RutaInspeccion } from '@/services/inspecciones/modeloRuta'

/** Cuántos recorridos se traen para calcular «hace N días» y la tendencia. */
const TOPE = 120

/**
 * Las rutas de la planta, sus recorridos recientes y el de este turno.
 *
 * Los recorridos se leen UNA vez para todo: el «hace N días» de cada ruta y la historia de cada
 * equipo salen del mismo arreglo, repartido en el cliente. Con 5 rutas y un puñado de rondas al
 * mes, 120 documentos cubren varios meses sin índices compuestos ni una consulta por ruta.
 */
export function useRutasInspeccion(
  plantId: string,
  turnoId: string,
): {
  rutas: RutaInspeccion[]
  recorridos: RecorridoGuardado[]
  /** El recorrido de cada ruta en ESTE turno, si existe. */
  deEsteTurno: Map<string, RecorridoGuardado>
  /** ISO del último recorrido de cada ruta, para «hace N días». */
  ultimoPorRuta: Map<string, string>
  /** Las rutas ordenadas por la que lleva más sin recorrerse. */
  porAtencion: Array<{ ruta: RutaInspeccion; dias: number | null }>
} {
  const [rutas, setRutas] = useState<RutaInspeccion[]>(RUTAS_CHONCHI)
  const [recorridos, setRecorridos] = useState<RecorridoGuardado[]>([])

  useEffect(() => escucharRutas(setRutas), [])
  useEffect(() => escucharRecorridos(plantId, TOPE, setRecorridos), [plantId])

  const deEsteTurno = useMemo(() => {
    const m = new Map<string, RecorridoGuardado>()
    for (const r of recorridos) if (r.turnoId === turnoId) m.set(r.rutaId, r)
    return m
  }, [recorridos, turnoId])

  const ultimoPorRuta = useMemo(() => {
    const m = new Map<string, string>()
    // Vienen del más nuevo al más viejo: el primero de cada ruta es el último recorrido.
    for (const r of recorridos) if (!m.has(r.rutaId)) m.set(r.rutaId, r.iniciadoEn)
    return m
  }, [recorridos])

  const porAtencion = useMemo(() => rutasPorAtencion(rutas, ultimoPorRuta), [rutas, ultimoPorRuta])

  return { rutas, recorridos, deEsteTurno, ultimoPorRuta, porAtencion }
}
