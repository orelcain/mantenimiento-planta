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
import { Card, CardContent, CardHeader, CardTitle, InfoTooltip } from '@/components/ui'
import { SkeletonPanel } from '@/components/piel'
import { Wrench, Clock, Search, ShieldCheck, Target, TrendingUp, TrendingDown, Repeat } from 'lucide-react'
import { useState } from 'react'
import { maintenanceWorkHeadline, type MaintenanceWork } from '@/services/grader/maintenanceWork'
import { usePermissions } from '@/hooks/usePermissions'
import { RevisionSemanalSheet } from '@/components/acr/RevisionSemanalSheet'
import type { Acr } from '@/services/acr/acr.types'

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

function Kpi({ label, value, sub, icon, valueColor, onClick }: {
  label: string; value: string; sub: string; icon: React.ReactNode; valueColor?: string; onClick?: () => void
}) {
  const contenido = (
    <>
      <div className="flex items-center gap-1.5 text-caption text-muted-foreground mb-1">{icon}{label}</div>
      <div className={`text-lg font-semibold tabular-nums leading-none ${valueColor ?? ''}`}>{value}</div>
      <div className="text-caption text-muted-foreground/60 mt-1">{sub}</div>
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-card border border-border bg-muted px-3 py-2.5 text-left min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {contenido}
      </button>
    )
  }
  return <div className="rounded-card border border-border bg-muted px-3 py-2.5">{contenido}</div>
}

export function MaintenanceWorkCard({ work, acrs = [], periodo = '' }: {
  work: MaintenanceWork | null
  /** ACR del período: la revisión semanal lista sus acciones. */
  acrs?: Acr[]
  /** Texto del período para la revisión semanal. */
  periodo?: string
}) {
  const { isSupervisor, isAdmin } = usePermissions()
  const [revisando, setRevisando] = useState(false)

  if (!work) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wrench className="w-4 h-4 text-ink-info" /> Trabajo de Mantención (TPM)
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          <SkeletonPanel label="Cargando trabajo de mantención" kpis={4} lineas={1} />
        </CardContent>
      </Card>
    )
  }

  const sinActividad =
    work.totalIncidencias === 0 && work.correctivasResueltas === 0 &&
    work.preventivasCumplidas === 0 && work.preventivasVencidas === 0

  const trendIcon = work.proactivoTrend === 'mejor'
    ? <TrendingUp className="w-3.5 h-3.5 text-ink-ok" />
    : work.proactivoTrend === 'peor'
      ? <TrendingDown className="w-3.5 h-3.5 text-ink-crit" />
      : <TrendingUp className="w-3.5 h-3.5" />

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2 min-w-0">
          <Wrench className="w-4 h-4 shrink-0 text-ink-info" />
          <span className="truncate">Trabajo de Mantención (TPM)</span>
          <span className="text-caption font-normal text-muted-foreground ml-1 hidden sm:inline">
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
            <div className="rounded-card border border-transparent bg-primary/[0.15] px-3 py-2 text-xs text-foreground/90">
              {maintenanceWorkHeadline(work)}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
                // Número grande (text-lg en Kpi): sin rótulo/punto chico
                // propio al lado, queda en la tinta de etiqueta.
                valueColor={work.causaRaizPct == null ? undefined : 'text-foreground'}
              />
              <Kpi
                label="Preventivas cumplidas"
                value={String(work.preventivasCumplidas)}
                sub={work.preventivasVencidas > 0 ? `${work.preventivasVencidas} vencidas · ${pct(work.cumplimientoPct)} cumpl.` : `${pct(work.cumplimientoPct)} cumplimiento`}
                icon={<ShieldCheck className="w-3.5 h-3.5" />}
                valueColor={work.cumplimientoPct == null ? undefined : 'text-foreground'}
              />
              <Kpi
                label="Trabajo proactivo"
                value={pct(work.proactivoPct)}
                sub={`${work.proactivas} de ${work.totalIncidencias} · ${work.proactivoTrend === 'mejor' ? 'en alza' : work.proactivoTrend === 'peor' ? 'a la baja' : 'madurez TPM'}`}
                icon={trendIcon}
                valueColor={work.proactivoPct == null ? undefined : 'text-foreground'}
              />
              <Kpi
                label="Equipos recurrentes"
                value={String(work.equiposRecurrentes)}
                sub="≥2 incidencias · objetivo: bajar"
                icon={<Repeat className="w-3.5 h-3.5" />}
                valueColor="text-foreground"
              />
              <Kpi
                label="Acciones fuertes"
                value={pct(work.accionesFuertesPct)}
                sub={work.accionesAcr > 0
                  ? `${work.accionesFuertes} de ${work.accionesAcr} acciones de ACR · eliminan la causa`
                  : 'Sin ACR en el período'}
                icon={<Target className="w-3.5 h-3.5" />}
                valueColor={work.accionesFuertesPct == null ? undefined : 'text-foreground'}
                onClick={() => setRevisando(true)}
              />
            </div>

            <p className="text-caption text-muted-foreground leading-snug">
              TPM: cada falla debe terminar en prevención, no en apagar incendios.{' '}
              <InfoTooltip text={"TPM: el valor no está en apagar incendios sino en convertir cada falla en prevención (causa raíz → preventiva/predicción) para que el equipo no vuelva a fallar y la producción se afine."} iconSize={11} />
            </p>
          </>
        )}
      </CardContent>
      <RevisionSemanalSheet
        open={revisando}
        onClose={() => setRevisando(false)}
        acrs={acrs}
        periodo={periodo}
        puedeEditar={isSupervisor || isAdmin}
      />
    </Card>
  )
}
