/**
 * AcrEntrada — la fila «Analizar causa» que la hoja del evento de Bitácora muestra en eventos
 * guardados que piden ACR (ver `eventoRequiereAcr`). Escucha los ACR del evento en vivo: si ya
 * hay uno, la fila dice «Ver análisis de causa» con el % de acciones fuertes.
 */
import { useEffect, useMemo, useState } from 'react'
import { ListCell, ListGroup, Pill } from '@/components/piel'
import { escucharAcrDeEvento, listarEventosRecientes } from '@/services/acr/acrFirestore'
import { aplicaAnalisis, resumenFuerza } from '@/services/acr/acrLogica'
import { detectarRepeticion, type EventoRepeticion, type Repeticion } from '@/services/acr/repeticion'
import type { Acr, EventoRefAcr } from '@/services/acr/acr.types'
import { logger } from '@/lib/logger'
import { AcrRapidoSheet } from './AcrRapidoSheet'
import { AcrLectura } from './AcrLectura'
import { PREGUNTA_TUTORIAL, PROPUESTA_TUTORIAL, REPETICION_TUTORIAL } from './tutorialAcr'

/** Ventana del detector de repetición (SPEC_ACR_R1.md §2). */
const DIAS_REPETICION = 30

/**
 * Vitrina `/dev/bitacora`: la hoja del evento real con datos de ejemplo, sin Firestore ni sesión.
 * `import.meta.env.DEV` la deja fuera de la versión publicada.
 */
const EN_VITRINA =
  import.meta.env.DEV && typeof window !== 'undefined' && window.location.pathname.includes('/dev/bitacora')
const PROPS_VITRINA = EN_VITRINA
  ? {
      onGuardar: () => {},
      proponer: () => Promise.resolve({ ...PROPUESTA_TUTORIAL, modelo: 'vitrina' }),
      preguntar: () => Promise.resolve(PREGUNTA_TUTORIAL),
    }
  : {}

export function AcrEntrada({ evento }: { evento: EventoRefAcr }) {
  const [acrs, setAcrs] = useState<Acr[] | null>(EN_VITRINA ? [] : null)
  const [recientes, setRecientes] = useState<EventoRepeticion[] | null>(null)
  const [vista, setVista] = useState<'ninguna' | 'editor' | 'lectura'>('ninguna')
  /** Sin permiso de lectura (p. ej. técnico con pase de Bitácora) la fila no se muestra. */
  const [sinAcceso, setSinAcceso] = useState(false)

  useEffect(
    () => (EN_VITRINA ? undefined : escucharAcrDeEvento(evento.id, setAcrs, () => setSinAcceso(true))),
    [evento.id],
  )

  // Eventos de los últimos 30 días para ver si la falla se repite. Si la lectura falla, no hay
  // aviso de repetición: se registra y el resto de la fila sigue igual.
  useEffect(() => {
    if (EN_VITRINA) return undefined
    let vivo = true
    listarEventosRecientes(DIAS_REPETICION)
      .then((lista) => { if (vivo) setRecientes(lista) })
      .catch((e: unknown) => {
        logger.warn('No se pudieron leer los eventos recientes para detectar repetición', {
          motivo: e instanceof Error ? e.message : String(e),
        })
        if (vivo) setRecientes([])
      })
    return () => { vivo = false }
  }, [])

  const repeticion = useMemo<Repeticion | null>(
    () => {
      if (!aplicaAnalisis(evento)) return null
      if (EN_VITRINA) return REPETICION_TUTORIAL
      return recientes ? detectarRepeticion(evento, recientes) : null
    },
    [evento, recientes],
  )

  if (sinAcceso) return null

  // Si hay varios, manda el más reciente.
  const acr = acrs?.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null

  return (
    <>
      <FilaAnalisis
        acr={acr}
        cargando={acrs === null}
        aplica={aplicaAnalisis(evento)}
        repeticion={repeticion}
        onVer={() => setVista('lectura')}
        onAnalizar={() => setVista('editor')}
      />

      {vista === 'editor' && (
        <AcrRapidoSheet
          open
          onClose={() => setVista('ninguna')}
          evento={evento}
          acrExistente={acr}
          repeticion={repeticion}
          {...PROPS_VITRINA}
        />
      )}
      {vista === 'lectura' && acr && (
        <AcrLectura
          open
          onClose={() => setVista('ninguna')}
          acr={acr}
          onEditar={() => setVista('editor')}
        />
      )}
    </>
  )
}

export interface FilaAnalisisProps {
  acr: Acr | null
  /** Todavía no llegó la lectura de los ACR del evento. */
  cargando: boolean
  /** Falla correctiva con detención (ver `aplicaAnalisis`). */
  aplica: boolean
  repeticion: Repeticion | null
  onVer: () => void
  onAnalizar: () => void
  /** Sin título ni pie (el tutorial muestra las tres formas juntas y debe caber en el celular). */
  compacta?: boolean
}

/**
 * La fila del análisis, sin Firestore (la vitrina la usa con datos de ejemplo). Cuatro estados:
 * - hay ACR → «Ver análisis de causa · N % fuertes»;
 * - se repite → fila destacada «Se repite: …» que abre la tarjeta;
 * - falla con detención → «Analizar causa (opcional)»;
 * - otros eventos → nada.
 */
export function FilaAnalisis({ acr, cargando, aplica, repeticion, onVer, onAnalizar, compacta = false }: FilaAnalisisProps) {
  const pct = acr ? resumenFuerza(acr.acciones).fuertePct : null

  // Mientras no llega la lectura no se ofrece «Analizar»: con un análisis ya existente, eso duplicaría.
  if (cargando) {
    return aplica ? (
      <ListGroup title={compacta ? undefined : 'Causa raíz'}>
        <ListCell title="Cargando análisis…" />
      </ListGroup>
    ) : null
  }

  if (acr) {
    return (
      <ListGroup
        title={compacta ? undefined : 'Causa raíz'}
        footer={compacta ? undefined : 'El análisis se guarda en la Bitácora y cuenta en el KPI de acciones fuertes.'}
      >
        <ListCell
          title="Ver análisis de causa"
          subtitle={`Estado: ${acr.estado === 'cerrado' ? 'cerrado' : 'borrador'}`}
          value={pct == null ? undefined : `${Math.round(pct)} % fuertes`}
          chevron
          onClick={onVer}
        />
      </ListGroup>
    )
  }

  if (!aplica) return null

  if (repeticion) {
    return (
      <ListGroup title={compacta ? undefined : 'Causa raíz'}>
        <button
          type="button"
          onClick={onAnalizar}
          className="flex min-h-11 w-full flex-col items-start gap-1.5 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Pill tone="warning">Se repite</Pill>
          <span className="text-body text-foreground">{repeticion.resumen}</span>
          <span className="text-body font-semibold text-primary">Analizar causa ›</span>
        </button>
      </ListGroup>
    )
  }

  return (
    <ListGroup title={compacta ? undefined : 'Causa raíz'}>
      <ListCell title="Analizar causa (opcional)" subtitle="Sin análisis todavía" chevron onClick={onAnalizar} />
    </ListGroup>
  )
}
