/**
 * MaintenanceWorkCard — "Trabajo de Mantención (TPM)" del período.
 *
 * Complementa a MaintenanceImpactCard (confiabilidad/grader) contando el CICLO DE
 * MEJORA: correctivo → causa raíz → prevención → madurez (proactivo) → no recurre.
 * Premisa (Orel): resolver correctivas no es el logro; el logro es convertirlas en
 * prevención para que NO vuelvan, y demostrar que Mantención es pilar de la producción.
 *
 * Presentacional: recibe `work` ya computado por la página (computeMaintenanceWork).
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Wrench, Clock, Search, ShieldCheck, TrendingUp, TrendingDown, Repeat, Loader2 } from 'lucide-react'
import { maintenanceWorkHeadline, type MaintenanceWork } from '@/services/grader/maintenanceWork'

function fmtMin(min: number | null): string {
  if (min == null) return '—'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h}h ${m}min` : `${h}h`
}
function pct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`
}

function Kpi({ label, value, sub, icon, valueColor }: {
  label: string; value: string; sub: string; icon: React.ReactNode; valueColor?: string
}) {
  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">{icon}{label}</div>
      <div className={`text-lg font-semibold tabular-nums leading-none ${valueColor ?? ''}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground/60 mt-1">{sub}</div>
    </div>
  )
}

export function MaintenanceWorkCard({ work }: { work: MaintenanceWork | null }) {
  if (!work) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wrench className="w-4 h-4 text-sky-500" /> Trabajo de Mantención (TPM)
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando incidencias y preventivas del período…
        </CardContent>
      </Card>
    )
  }

  const sinActividad =
    work.totalIncidencias === 0 && work.correctivasResueltas === 0 &&
    work.preventivasCumplidas === 0 && work.preventivasVencidas === 0

  const trendIcon = work.proactivoTrend === 'mejor'
    ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
    : work.proactivoTrend === 'peor'
      ? <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
      : <TrendingUp className="w-3.5 h-3.5" />

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2 min-w-0">
          <Wrench className="w-4 h-4 shrink-0 text-sky-500" />
          <span className="truncate">Trabajo de Mantención (TPM)</span>
          <span className="text-[11px] font-normal text-muted-foreground ml-1 hidden sm:inline">
            del correctivo a la prevención
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="pb-4 space-y-4">
        {sinActividad ? (
          <p className="text-sm text-muted-foreground">Sin incidencias ni preventivas registradas en el período.</p>
        ) : (
          <>
            {/* Frase-titular: cuenta el ciclo de mejora, no el conteo */}
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/15 px-3 py-2 text-xs text-foreground/90">
              {maintenanceWorkHeadline(work)}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Kpi
                label="Correctivas resueltas"
                value={String(work.correctivasResueltas)}
                sub={`MTTR ${fmtMin(work.mttrCorrectivoMin)}`}
                icon={<Clock className="w-3.5 h-3.5" />}
              />
              <Kpi
                label="Con causa raíz"
                value={pct(work.causaRaizPct)}
                sub={`${work.conCausaRaiz} de ${work.correctivasResueltas} · para que no vuelvan`}
                icon={<Search className="w-3.5 h-3.5" />}
                valueColor={work.causaRaizPct == null ? undefined
                  : work.causaRaizPct >= 70 ? 'text-emerald-400'
                  : work.causaRaizPct >= 40 ? 'text-amber-400' : 'text-rose-400'}
              />
              <Kpi
                label="Preventivas cumplidas"
                value={String(work.preventivasCumplidas)}
                sub={work.preventivasVencidas > 0 ? `${work.preventivasVencidas} vencidas · ${pct(work.cumplimientoPct)} cumpl.` : `${pct(work.cumplimientoPct)} cumplimiento`}
                icon={<ShieldCheck className="w-3.5 h-3.5" />}
                valueColor={work.cumplimientoPct == null ? undefined
                  : work.cumplimientoPct >= 90 ? 'text-emerald-400'
                  : work.cumplimientoPct >= 70 ? 'text-amber-400' : 'text-rose-400'}
              />
              <Kpi
                label="Trabajo proactivo"
                value={pct(work.proactivoPct)}
                sub={`${work.proactivas} de ${work.totalIncidencias} · ${work.proactivoTrend === 'mejor' ? 'en alza' : work.proactivoTrend === 'peor' ? 'a la baja' : 'madurez TPM'}`}
                icon={trendIcon}
                valueColor={work.proactivoPct == null ? undefined
                  : work.proactivoPct >= 50 ? 'text-emerald-400'
                  : work.proactivoPct >= 25 ? 'text-amber-400' : 'text-rose-400'}
              />
              <Kpi
                label="Equipos recurrentes"
                value={String(work.equiposRecurrentes)}
                sub="≥2 incidencias · objetivo: bajar"
                icon={<Repeat className="w-3.5 h-3.5" />}
                valueColor={work.equiposRecurrentes === 0 ? 'text-emerald-400'
                  : work.equiposRecurrentes <= 3 ? 'text-amber-400' : 'text-rose-400'}
              />
            </div>

            <p className="text-[11px] text-muted-foreground/70 leading-snug">
              TPM: el valor no está en apagar incendios sino en convertir cada falla en prevención
              (causa raíz → preventiva/predicción) para que el equipo no vuelva a fallar y la producción se afine.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
