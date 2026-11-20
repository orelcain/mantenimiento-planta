/**
 * Bloque «Grader» del día en Análisis de turno (mockup `analisis.html`): el extra
 * del grader sobre la base Shoplogix, identificable por el filete petróleo y la
 * etiqueta «Grader». Nunca desaparece: sin exporte del día deja el hueco
 * «Sin datos del grader este día» con el atajo para subir el Excel.
 */
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dec1 } from '@/utils/formatoNumeros'
import { graderDelDia } from '@/services/grader/graderDelDia'
import { p0StatusColor, p0StatusFromPct } from '@/services/grader/graderP0Thresholds'
import type { GraderDailySummary } from '@/services/grader/types'

const miles = (n: number) => Math.round(n).toLocaleString('es-CL')

export function EtiquetaGrader({ apagada }: { apagada?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-caption font-semibold', apagada ? 'text-muted-foreground' : 'text-ink-grader')}>
      <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-[2px]', apagada ? 'bg-muted-foreground/40' : 'bg-grader')} />
      Grader
    </span>
  )
}

export function GraderDelDiaBloque({ summaries, dateKey, onSubirExporte, className }: {
  summaries: GraderDailySummary[]
  dateKey: string
  onSubirExporte?: () => void
  className?: string
}) {
  const r = graderDelDia(summaries, dateKey)

  return (
    <section className={cn('border-l-[3px] border-grader pl-3', className)} aria-label="Grader del día" data-testid="grader-del-dia">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-headline font-semibold">Puerta 0 del día</h2>
        <EtiquetaGrader apagada={!r} />
      </div>

      {r ? (
        <>
          <p className="mt-1 text-footnote text-muted-foreground tabular-nums">
            <span className={cn('text-title2 font-semibold', r.p0Pct !== null && p0StatusColor(p0StatusFromPct(r.p0Pct)))}>
              {r.p0Pct !== null ? `${dec1(r.p0Pct)} %` : '—'}
            </span>{' '}
            de {miles(r.piezas)} piezas clasificadas
          </p>
          <ul className="mt-2 divide-y divide-border/60">
            {r.turnos.map((t) => (
              <li key={t.shiftId} className="flex min-h-[44px] items-center justify-between gap-3 text-subhead">
                <span className="min-w-0">
                  <span className="block truncate">{t.shiftId}</span>
                  {t.ventana && <span className="block text-footnote text-muted-foreground tabular-nums">datos {t.ventana}</span>}
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className={cn('font-semibold', p0StatusColor(p0StatusFromPct(t.p0Pct)))}>{dec1(t.p0Pct)} %</span>
                  <span className="block text-footnote text-muted-foreground">{miles(t.piezas)} pz</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-2 rounded-[14px] border-[1.5px] border-dashed border-border p-4" data-testid="grader-hueco">
          <p className="text-subhead font-semibold">Sin datos del grader este día</p>
          <p className="mt-0.5 text-footnote text-muted-foreground">
            Nadie exportó el Pieza a pieza. El resto del análisis usa Shoplogix.
          </p>
          {onSubirExporte && (
            <button
              type="button"
              onClick={onSubirExporte}
              className="tap-44 mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-muted px-4 text-subhead font-semibold text-foreground"
            >
              <Upload className="h-4 w-4" /> Subir exporte
            </button>
          )}
        </div>
      )}
    </section>
  )
}
