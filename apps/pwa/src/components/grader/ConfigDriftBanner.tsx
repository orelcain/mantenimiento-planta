/**
 * Aviso: el desglose del Punto Cero de este turno se calculó con una
 * configuración de gates distinta a la vigente.
 *
 * Por qué existe: el análisis se CONGELA al guardar el turno. Editar las gates
 * después solo deja un snapshot en `configHistory` — nada recalcula el doc, así
 * que el supervisor puede estar mirando un desglose que ya no corresponde a la
 * configuración real sin ninguna señal de eso.
 *
 * Cerrado por defecto: una línea + "ver detalle". La comparación pieza a pieza
 * queda a un clic para quien necesite decidir si vale re-analizar el turno.
 */

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MATRIX_P0_CAUSES } from '@/services/grader/graderMatrixP0Causes'
import type { ConfigDriftResult } from '@/services/grader/graderConfigDrift'
import type { MatrixP0Cause } from '@/services/grader/types'

interface Props {
  drift: ConfigDriftResult
  /** Cuándo se calculó el análisis guardado (`summary.updatedAt`). */
  analyzedAt?: string
  /** Cuándo y quién hizo la última edición de gates (último snapshot). */
  lastConfigChangeAt?: string
  lastConfigChangeBy?: string
  className?: string
}

const fmt = (iso?: string) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const causeLabel = (c: MatrixP0Cause) => MATRIX_P0_CAUSES[c]?.label ?? c

export function ConfigDriftBanner({
  drift, analyzedAt, lastConfigChangeAt, lastConfigChangeBy, className,
}: Props) {
  const [open, setOpen] = useState(false)
  if (!drift.stale) return null

  const analyzed = fmt(analyzedAt)
  const changed = fmt(lastConfigChangeAt)
  // Solo afirmar "cambiaron después" cuando los timestamps lo respalden: un turno
  // recargado (bulk upload, reclassify) puede tener el análisis POSTERIOR a la
  // última edición de gates y aun así no corresponder a la config vigente.
  const changedAfterAnalysis = !!(analyzedAt && lastConfigChangeAt && lastConfigChangeAt > analyzedAt)

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left"
      >
        <AlertTriangle className="w-[18px] h-[18px] text-amber-600 dark:text-amber-400 flex-shrink-0" aria-hidden />
        <span className="flex-1 text-[13px] leading-snug text-amber-900 dark:text-amber-200">
          {changedAfterAnalysis
            ? 'Las gates cambiaron después de este análisis — el desglose de abajo no se recalculó.'
            : 'El desglose de abajo no corresponde a la configuración de gates actual.'}
        </span>
        <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 whitespace-nowrap">
          {open ? 'Ocultar' : 'Ver detalle'}
          {open
            ? <ChevronUp className="w-3.5 h-3.5" aria-hidden />
            : <ChevronDown className="w-3.5 h-3.5" aria-hidden />}
        </span>
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 pt-3 border-t border-amber-300/70 dark:border-amber-700/70">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
                <th className="text-left font-normal pb-1.5">Causa que depende de las gates</th>
                <th className="text-right font-normal pb-1.5">guardado</th>
                <th className="text-right font-normal pb-1.5 pl-3">config actual</th>
              </tr>
            </thead>
            <tbody className="text-amber-900 dark:text-amber-200">
              {drift.causes.map(({ cause, saved, current }) => (
                <tr key={cause}>
                  <td className="py-0.5">{causeLabel(cause)}</td>
                  <td className="py-0.5 text-right font-mono tabular-nums">{saved}</td>
                  <td
                    className={cn(
                      'py-0.5 pl-3 text-right font-mono tabular-nums',
                      saved !== current && 'font-medium text-amber-700 dark:text-amber-300',
                    )}
                  >
                    {current}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-2.5 text-[11px] leading-relaxed text-amber-800/80 dark:text-amber-300/70">
            {analyzed && <>Análisis: {analyzed} · </>}
            {changed && <>última edición de gates: {changed}{lastConfigChangeBy ? `, ${lastConfigChangeBy}` : ''} · </>}
            {drift.changedGateNumbers.length > 0 && (
              <>{drift.changedGateNumbers.length === 1 ? 'cambió la gate' : 'cambiaron las gates'}{' '}
                {drift.changedGateNumbers.join(', ')} · </>
            )}
            {drift.mode === 'estimated' && (
              <>estimado: este turno no guardó la configuración que usó, así que la columna «guardado»
                sale del desglose persistido · </>
            )}
            el % de punto cero no cambia — es el conteo físico de piezas que la máquina mandó a puerta 0.
            Para que el desglose refleje la configuración actual hay que volver a analizar el turno
            desde el wizard.
          </p>
        </div>
      )}
    </div>
  )
}
