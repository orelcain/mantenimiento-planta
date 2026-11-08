import { useEffect, useState } from 'react'
import { BITACORA_PLANTA } from '@/config/bitacora'
import {
  calcularJackKnife,
  cargarTurnosCrudos,
  nivelPrioridad,
  prepararTurnos,
  ventanaJK,
  type PuntoJK,
} from '@/services/shoplogix/jackKnife'
import { logger } from '@/lib/logger'

export type UbicacionJK =
  | { estado: 'cargando' }
  | { estado: 'error' }
  | {
      estado: 'listo'
      /** Punto de la causa en la ventana de 90 días, o null si no tuvo detenciones. */
      punto: PuntoJK | null
      /** Nivel de prioridad 1 a 5 (ver `nivelPrioridad`); null sin punto. */
      nivel: number | null
      /** Turnos de la ventana (90 días). */
      turnos: number
    }

/**
 * Dónde cae una causa en el Jack-Knife de la planta (ventana de 90 días, vista «imp»).
 * Usa la caché de turnos de Jack-Knife: no agrega lecturas por sesión.
 */
export function useUbicacionJK(causa: string): UbicacionJK {
  const [estado, setEstado] = useState<UbicacionJK>({ estado: 'cargando' })

  useEffect(() => {
    let vivo = true
    setEstado({ estado: 'cargando' })
    cargarTurnosCrudos(BITACORA_PLANTA.id)
      .then((crudos) => {
        if (!vivo) return
        const { turnos } = prepararTurnos(crudos)
        if (turnos.length === 0) {
          setEstado({ estado: 'listo', punto: null, nivel: null, turnos: 0 })
          return
        }
        const { desde, hasta } = ventanaJK(turnos, '90')
        const calc = calcularJackKnife(turnos, desde, hasta, 'imp')
        const punto = calc.pts.find((p) => p.k === causa) ?? null
        setEstado({
          estado: 'listo',
          punto,
          nivel: punto ? nivelPrioridad(punto, calc.un, calc.um) : null,
          turnos: hasta - desde + 1,
        })
      })
      .catch((e: unknown) => {
        logger.error('No se pudo leer el Jack-Knife para ubicar la causa', e instanceof Error ? e : undefined, { causa })
        if (vivo) setEstado({ estado: 'error' })
      })
    return () => {
      vivo = false
    }
  }, [causa])

  return estado
}
