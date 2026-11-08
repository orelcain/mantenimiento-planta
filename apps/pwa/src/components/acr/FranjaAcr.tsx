/**
 * FranjaAcr — la franja de causa raíz dentro de cada evento de la lista del turno. Solo aparece
 * en las fallas o correctivos con detención (`aplicaAnalisis`) que se repiten sin análisis
 * («Se repite») o que ya lo tienen («Analizado»). Sin señal, no renderiza nada.
 *
 * La fila del evento es un botón entero: la franja corta la propagación (clic, teclado, puntero
 * y tacto), para que abrir el análisis no abra también la hoja del evento. Las hojas del ACR
 * van dentro de ese mismo contenedor por la misma razón: los eventos de React suben por los
 * portales hasta la fila.
 */
import { useState, type SyntheticEvent } from 'react'
import { Pill } from '@/components/piel'
import { aplicaAnalisis, resumenFuerza } from '@/services/acr/acrLogica'
import type { EventoRefAcr } from '@/services/acr/acr.types'
import { HojasAcr, type VistaAcr } from './AcrEntrada'
import type { SenalAcr } from './useSenalesAcr'

const detener = (e: SyntheticEvent) => e.stopPropagation()

export function FranjaAcr({ evento, senal }: { evento: EventoRefAcr; senal: SenalAcr | null | undefined }) {
  const [vista, setVista] = useState<VistaAcr>('ninguna')
  const visible = senal != null && aplicaAnalisis(evento)
  // Con una hoja abierta se conserva aunque la señal cambie: si no, la hoja se cerraría sola.
  if (!visible && vista === 'ninguna') return null

  const repite = senal?.tipo === 'repite'
  const acr = senal?.tipo === 'analizado' ? senal.acr : null
  const repeticion = senal?.tipo === 'repite' ? senal.repeticion : null
  const n = repeticion?.eventoIds.length ?? 0
  const pct = acr ? resumenFuerza(acr.acciones).fuertePct : null

  return (
    <div className="min-w-0" onClick={detener} onKeyDown={detener} onPointerDown={detener} onTouchStart={detener}>
      {visible && (
        <button
          type="button"
          onClick={() => setVista(repite ? 'editor' : 'lectura')}
          className={`mt-1 flex min-h-11 w-full items-center justify-between gap-3 rounded-ctl px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            repite ? 'bg-warning/[0.15]' : 'bg-ink-ok/[0.15]'
          }`}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {repite ? (
              <>
                <Pill tone="warning">Se repite</Pill>
                <span className="text-footnote text-foreground">{`${n} ${n === 1 ? 'vez' : 'veces'} en 30 días`}</span>
              </>
            ) : (
              <>
                <Pill tone="ok">Analizado</Pill>
                {pct != null && <span className="text-footnote text-foreground">{`${Math.round(pct)} % fuertes`}</span>}
              </>
            )}
          </span>
          <span className="shrink-0 text-subhead font-semibold text-primary">
            <span className="lg:hidden">{repite ? 'Analizar ›' : 'Ver ›'}</span>
            <span className="hidden lg:inline">{repite ? 'Analizar causa ›' : 'Ver análisis ›'}</span>
          </span>
        </button>
      )}
      <HojasAcr evento={evento} acr={acr} repeticion={repeticion} vista={vista} onVista={setVista} />
    </div>
  )
}
