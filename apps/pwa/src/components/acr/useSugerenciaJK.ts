import { useEffect, useState } from 'react'
import { BITACORA_PLANTA } from '@/config/bitacora'
import { sugerirCausaJK, type SugerenciaJK } from '@/services/acr/acrHistorial'
import type { EventoRefAcr } from '@/services/acr/acr.types'
import { resumenesJKDeFecha } from '@/services/shoplogix/jackKnife'
import { logger } from '@/lib/logger'

export interface EstadoSugerenciaJK {
  cargando: boolean
  /** null si no está activo, si la lectura falló o si no se pudo leer el turno. */
  sugerencia: SugerenciaJK | null
}

/**
 * Lee los resúmenes del turno del evento (una vez, al abrir) y calcula la causa sugerida.
 * Con `activo` en false no lee nada.
 */
export function useSugerenciaJK(evento: EventoRefAcr, activo: boolean): EstadoSugerenciaJK {
  const [estado, setEstado] = useState<EstadoSugerenciaJK>({ cargando: activo, sugerencia: null })
  const { fechaTurno, equipo, descripcion, minutosParada } = evento

  useEffect(() => {
    if (!activo) return undefined
    let vivo = true
    setEstado({ cargando: true, sugerencia: null })
    resumenesJKDeFecha(BITACORA_PLANTA.id, fechaTurno)
      .then((resumenes) => {
        if (!vivo) return
        const sugerencia = sugerirCausaJK({ equipo, texto: descripcion, minutos: minutosParada }, resumenes)
        setEstado({ cargando: false, sugerencia })
      })
      .catch((e: unknown) => {
        logger.warn('No se pudo leer el turno del Jack-Knife para sugerir la causa', {
          motivo: e instanceof Error ? e.message : String(e),
        })
        if (vivo) setEstado({ cargando: false, sugerencia: null })
      })
    return () => {
      vivo = false
    }
  }, [activo, fechaTurno, equipo, descripcion, minutosParada])

  return estado
}
