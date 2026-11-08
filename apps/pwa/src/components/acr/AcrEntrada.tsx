/**
 * AcrEntrada — la fila «Analizar causa» que la hoja del evento de Bitácora muestra en eventos
 * guardados que piden ACR (ver `eventoRequiereAcr`). Escucha los ACR del evento en vivo: si ya
 * hay uno, la fila dice «Ver análisis de causa» con el % de acciones fuertes.
 */
import { useEffect, useState } from 'react'
import { ListCell, ListGroup } from '@/components/piel'
import { escucharAcrDeEvento } from '@/services/acr/acrFirestore'
import { resumenFuerza } from '@/services/acr/acrLogica'
import type { Acr, EventoRefAcr } from '@/services/acr/acr.types'
import { AcrSheet } from './AcrSheet'
import { AcrLectura } from './AcrLectura'

export function AcrEntrada({ evento }: { evento: EventoRefAcr }) {
  const [acrs, setAcrs] = useState<Acr[] | null>(null)
  const [vista, setVista] = useState<'ninguna' | 'editor' | 'lectura'>('ninguna')
  /** Sin permiso de lectura (p. ej. técnico con pase de Bitácora) la fila no se muestra. */
  const [sinAcceso, setSinAcceso] = useState(false)

  useEffect(() => escucharAcrDeEvento(evento.id, setAcrs, () => setSinAcceso(true)), [evento.id])

  if (sinAcceso) return null

  // Si hay varios, manda el más reciente.
  const acr = acrs?.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
  const pct = acr ? resumenFuerza(acr.acciones).fuertePct : null

  return (
    <>
      <ListGroup title="Causa raíz" footer="El análisis se guarda en la Bitácora y cuenta en el KPI de acciones fuertes.">
        {/* Mientras no llega la lectura no se ofrece «Analizar»: con un análisis ya existente, eso duplicaría. */}
        {acrs === null ? (
          <ListCell title="Cargando análisis…" />
        ) : (
          <ListCell
            title={acr ? 'Ver análisis de causa' : 'Analizar causa'}
            subtitle={acr ? `Estado: ${acr.estado === 'cerrado' ? 'cerrado' : 'borrador'}` : 'Sin análisis todavía'}
            value={pct == null ? undefined : `${Math.round(pct)} % fuertes`}
            chevron
            onClick={() => setVista(acr ? 'lectura' : 'editor')}
          />
        )}
      </ListGroup>

      {vista === 'editor' && (
        <AcrSheet
          open
          onClose={() => setVista('ninguna')}
          evento={evento}
          acrExistente={acr}
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
