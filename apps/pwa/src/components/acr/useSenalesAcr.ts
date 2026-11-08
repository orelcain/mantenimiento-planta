/**
 * Señales del ACR para la lista del turno: qué evento se repite sin análisis y cuál ya tiene
 * análisis. Una sola lectura de los eventos de 30 días por página, y los ACR de los eventos del
 * turno en tandas (ver `escucharAcrDeEventos`). Si una lectura falla, el mapa queda vacío y se
 * registra: la lista sigue igual, sin franja.
 */
import { useEffect, useMemo, useState } from 'react'
import { logger } from '@/lib/logger'
import { escucharAcrDeEventos, eventosRecientesConCache } from '@/services/acr/acrFirestore'
import { aplicaAnalisis } from '@/services/acr/acrLogica'
import { detectarRepeticion, type EventoRepeticion, type Repeticion } from '@/services/acr/repeticion'
import type { Acr } from '@/services/acr/acr.types'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'

/** Ventana del detector de repetición (SPEC_ACR_R1.md §2). */
export const DIAS_REPETICION = 30

export type SenalAcr =
  | { tipo: 'repite'; repeticion: Repeticion }
  | { tipo: 'analizado'; acr: Acr }

/**
 * Cálculo puro. Solo cuentan los eventos que `aplicaAnalisis`. Si ya hay un ACR, gana «analizado»
 * (con el más reciente si hay varios); si no, se mira la repetición.
 */
export function calcularSenales(
  eventos: readonly EventoBitacora[],
  recientes: readonly EventoRepeticion[],
  acrs: readonly Acr[],
  hoy: Date = new Date(),
): Map<string, SenalAcr> {
  const senales = new Map<string, SenalAcr>()
  for (const evento of eventos) {
    if (!aplicaAnalisis(evento)) continue
    const acrDelEvento = acrs
      .filter((a) => a.eventoBitacoraIds.includes(evento.id))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    if (acrDelEvento) {
      senales.set(evento.id, { tipo: 'analizado', acr: acrDelEvento })
      continue
    }
    const repeticion = detectarRepeticion(evento, recientes, hoy)
    if (repeticion) senales.set(evento.id, { tipo: 'repite', repeticion })
  }
  return senales
}

export function useSenalesAcr(eventos: readonly EventoBitacora[]): Map<string, SenalAcr> {
  const [recientes, setRecientes] = useState<EventoBitacora[] | null>(null)
  const [acrs, setAcrs] = useState<Acr[] | null>(null)
  const [fallo, setFallo] = useState(false)

  // Solo se leen los 30 días si este turno tiene alguna falla con detención, y la lectura se
  // reutiliza 15 minutos (son hasta 1000 documentos).
  const hayFallas = eventos.some(aplicaAnalisis)
  useEffect(() => {
    if (!hayFallas) return undefined
    let vivo = true
    eventosRecientesConCache(DIAS_REPETICION)
      .then((lista) => { if (vivo) setRecientes(lista) })
      .catch((e: unknown) => {
        logger.warn('No se pudieron leer los eventos recientes para las señales de análisis', {
          motivo: e instanceof Error ? e.message : String(e),
        })
        if (vivo) setFallo(true)
      })
    return () => { vivo = false }
  }, [hayFallas])

  // Solo los ids que importan; la clave evita volver a suscribirse en cada render.
  const clave = useMemo(
    () => eventos.filter(aplicaAnalisis).map((e) => e.id).join('|'),
    [eventos],
  )

  useEffect(() => {
    const ids = clave ? clave.split('|') : []
    if (ids.length === 0) {
      setAcrs([])
      return undefined
    }
    return escucharAcrDeEventos(ids, setAcrs, () => {
      logger.warn('Sin permiso o sin lectura de los análisis de causa; la lista no muestra señales')
      setFallo(true)
    })
  }, [clave])

  return useMemo(
    () => (fallo ? new Map<string, SenalAcr>() : calcularSenales(eventos, recientes ?? [], acrs ?? [])),
    [eventos, recientes, acrs, fallo],
  )
}
