/**
 * FallasRepetidasCard — los paros de Mantención del turno que son la VUELTA de
 * la misma causa en la misma máquina en ≤ 8 h de operación.
 *
 * La decisión que habilita: qué reparación revisar. Una causa que vuelve es una
 * falla que no quedó resuelta (Orel, 28-10-2026), y nombrar la máquina dice a
 * quién atender. Opción 1A del mockup «Falla repetida».
 *
 * Definiciones en `services/shoplogix/fallaRepetida.ts`. Horas a la vista con
 * `getUTCHours`: Shoplogix guarda wall-clock como UTC.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight, Repeat } from 'lucide-react'
import { FALLA_REPETIDA } from '@/services/shoplogix/fallaRepetida'
import { useFallasRepetidas } from '@/hooks/useFallasRepetidas'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import { dec1 } from '@/utils/formatoNumeros'

function hhmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function FallasRepetidasCard({
  machines,
  plantSlug,
}: {
  machines: UpstreamMachineShift[]
  plantSlug: PlantSlug
}) {
  const [expanded, setExpanded] = useState(true)
  const { grupos, episodiosTurno, turnosPrevios, loading } = useFallasRepetidas(plantSlug, machines)
  const repeticiones = grupos.reduce((n, g) => n + g.repeticiones, 0)

  return (
    <div className="mb-4 pb-4 border-b border-border/60" data-testid="fallas-repetidas">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full min-h-11 flex items-center gap-2 rounded-ctl border border-transparent bg-primary/[0.15] px-3 py-2 hover:bg-primary/[0.15] transition-colors"
        aria-expanded={expanded}
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-ink-info shrink-0" />
          : <ChevronRight className="w-4 h-4 text-ink-info shrink-0" />}
        <Repeat className="w-4 h-4 text-ink-info shrink-0" />
        <span className="text-footnote font-semibold text-foreground/90">Fallas repetidas</span>
        <span className="text-caption text-muted-foreground hidden sm:inline">¿qué reparación no quedó resuelta?</span>
        <span className="ml-auto text-caption tabular-nums text-foreground/85">
          {loading && repeticiones === 0
            ? <span className="text-muted-foreground">revisando turnos previos…</span>
            : <>
                <b className={repeticiones > 0 ? 'text-sm text-ink-warn' : 'text-sm text-ink-ok'}>{repeticiones}</b>
                {' '}de {episodiosTurno} {episodiosTurno === 1 ? 'paro' : 'paros'} volvió
              </>}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {grupos.length === 0 ? (
            <div className="rounded-ctl border border-dashed border-border px-3 py-2.5 text-caption text-muted-foreground">
              {episodiosTurno === 0
                ? 'No hubo paros de Mantención en este turno.'
                : `Ningún paro de Mantención repitió su causa en la misma máquina dentro de ${FALLA_REPETIDA.ventanaOpH} h de operación.`}
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {grupos.map((g) => (
                <li key={`${g.machineid}|${g.causa}`} className="flex min-h-11 items-center gap-3 py-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-footnote font-medium text-foreground/90">{g.machineName}</span>
                    <span className="block truncate text-caption text-muted-foreground">
                      {g.causa}
                      {g.ultimaRepeticion && (
                        <> · última {hhmm(g.ultimaRepeticion)}
                          {g.opHUltima !== null && <>, {dec1(g.opHUltima)} h de operación después</>}
                        </>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-footnote font-semibold tabular-nums text-ink-warn">
                      {g.repeticiones} {g.repeticiones === 1 ? 'vez' : 'veces'}
                    </span>
                    <span className="block text-caption tabular-nums text-muted-foreground">
                      de {g.episodios} en el turno
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="text-caption text-muted-foreground">
            Se repite = misma causa y misma máquina antes de {FALLA_REPETIDA.ventanaOpH} h de operación desde el paro
            anterior. Paros de ≥ 2 min; «Ajuste mantenimiento» no cuenta.
            {!loading && turnosPrevios === 0 && ' Sin turnos previos: solo se ven las vueltas dentro de este turno.'}
          </p>
        </div>
      )}
    </div>
  )
}
