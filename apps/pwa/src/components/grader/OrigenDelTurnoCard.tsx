/**
 * «¿Vino de la línea?» — el veredicto de la pestaña Línea.
 *
 * Reemplaza en reposo a las dos tarjetas de correlación (`UpstreamCorrelationCard`
 * y `UpstreamScatterCard`), que juntas medían **1.153 px a 375 px** y que en la
 * mayoría de los turnos solo servían para decir que no había nada: la de paros
 * señala algo en 6 de 40 turnos y la de ritmo alcanza R² ≥ 0,10 en 11 de 28.
 *
 * Las dos siguen existiendo, íntegras, dentro de la hoja de detalle — lo que
 * cambia es que ahora se abren cuando se las busca. Lo que se lee sin tocar
 * nada es la conclusión, que es lo que el turno necesita.
 *
 * Mockup de decisión (opción C de tres, con los descartes):
 * https://claude.ai/code/artifact/df42faa3-6466-49eb-9309-45f73324c9f8
 */

import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Pause, TimelineBucket } from '@/services/grader/types'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import {
  correlatePausesWithUpstream,
  summarizeCorrelations,
} from '@/services/shoplogix/shoplogixCorrelation'
import {
  veredictoOrigenDelTurno,
  type TonoOrigen,
} from '@/services/shoplogix/origenDelTurno'
import { buildScatterData, scatterSlopeMagnitude } from './shiftTimelineHelpers'
import { UpstreamCorrelationCard } from './UpstreamCorrelationCard'
import { UpstreamScatterCard } from './UpstreamScatterCard'

interface Props {
  pauses: Pause[]
  snapshot: UpstreamLineSnapshot | null | undefined
  timelineBuckets: TimelineBucket[]
  criticalThreshold?: number
  /**
   * ¿El snapshot de la línea todavía está cargando?
   *
   * Hace falta porque el veredicto es una afirmación categórica y el snapshot
   * llega en más de una emisión. Visto en el turno 17-08 mientras se construía
   * esto: con las máquinas todavía vacías la correlación da cero y la tarjeta
   * anunciaba «Las causas son internas del Grader»; con el snapshot completo el
   * mismo turno decía «30 min vinieron de la línea, casi todos de Evisceradora
   * 3». Dos veredictos opuestos para el mismo turno, y el primero tranquiliza.
   */
  loading?: boolean
}

/** El punto NUNCA es el único canal: la frase ya dice el veredicto (§8). */
const TONO_PUNTO: Record<TonoOrigen, string> = {
  ok:   'bg-ink-ok',
  warn: 'bg-ink-warn',
  crit: 'bg-ink-crit',
}

export function OrigenDelTurnoCard({
  pauses,
  snapshot,
  timelineBuckets,
  criticalThreshold,
  loading = false,
}: Props) {
  const [abierto, setAbierto] = useState(false)

  const correlations = useMemo(
    () => correlatePausesWithUpstream(pauses, snapshot),
    [pauses, snapshot],
  )
  const resumen = useMemo(() => summarizeCorrelations(correlations), [correlations])

  // El R² del ritmo. Se recalcula acá porque el veredicto lo necesita aunque
  // la nube no se dibuje; es el mismo cálculo que hace el scatter con los
  // mismos datos, así que no puede dar otra cosa.
  const ritmo = useMemo(() => {
    if (!snapshot) return null
    const series = buildScatterData(snapshot, timelineBuckets)
    return scatterSlopeMagnitude(series)
  }, [snapshot, timelineBuckets])

  // Paros que cayeron en colación o reunión de las Baader: coinciden, pero no
  // son causa.
  const programadas = useMemo(
    () => correlations.filter(c => c.kind === 'coincidental_planned').length,
    [correlations],
  )

  const veredicto = useMemo(() => veredictoOrigenDelTurno({
    totalParos:    resumen.total,
    parosUpstream: resumen.upstreamCaused,
    segUpstream:   resumen.upstreamCausedDurSec,
    segParosTotal: pauses.reduce((a, p) => a + p.durationSec, 0),
    porMaquina:    resumen.byMachine,
    parosProgramados: programadas,
    ritmoPctExplicado: ritmo?.r2Max != null ? Math.round(ritmo.r2Max * 100) : null,
    ritmoExplica:      ritmo?.explica ?? false,
  }), [resumen, pauses, ritmo, programadas])

  // Callar es mejor que tranquilizar de más: sin máquinas en el snapshot la
  // correlación da cero por falta de datos, no por ausencia de causa.
  if (loading || !snapshot || snapshot.machines.length === 0 || !veredicto) return null

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-2.5">
            <span
              className={cn('w-2.5 h-2.5 rounded-full shrink-0 mt-1.5', TONO_PUNTO[veredicto.tono])}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p className="text-headline text-foreground">{veredicto.veredicto}</p>
              <p className="text-footnote text-muted-foreground mt-1.5">{veredicto.evidencia}</p>
              {/* Solo con solape: ahí el aviso explica por qué el conteo causal
                  deja filas afuera. Sin solape la frase ya lo dice, y repetirlo
                  se leía como que se contradice a sí misma. */}
              {programadas > 0 && resumen.upstreamCaused > 0 && (
                <p className="text-footnote text-muted-foreground mt-1.5">
                  Otro{programadas === 1 ? '' : 's'} {programadas} cayó
                  {programadas === 1 ? '' : 'eron'} en colación o reunión de las Baader —
                  coincide{programadas === 1 ? '' : 'n'}, pero no es causa.
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAbierto(true)}
            // `text-brand-ink`, no `text-primary`: sobre el fondo de tarjeta en
            // tema claro el primary da 4,2:1 y no llega a AA para texto de 14 px.
            className="mt-3.5 w-full min-h-[44px] flex items-center justify-between text-sm font-medium text-brand-ink"
          >
            {veredicto.tono === 'ok' ? 'Ver la evidencia' : 'Ver los paros y la nube'}
            <ChevronRight className="w-4 h-4 opacity-55" />
          </button>
        </CardContent>
      </Card>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="p-4 sm:p-6 sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Origen del turno</DialogTitle>
            <DialogDescription>{veredicto.evidencia}</DialogDescription>
          </DialogHeader>
          {/* Las dos tarjetas van enteras: el trabajo de #937 (paleta por tema,
              puntos usables, tope del eje Y) sigue valiendo, y acá sí hay ancho
              para leer la nube. */}
          <div className="overflow-y-auto flex-1 space-y-3">
            <UpstreamCorrelationCard pauses={pauses} snapshot={snapshot} />
            <UpstreamScatterCard
              snapshot={snapshot}
              timelineBuckets={timelineBuckets}
              criticalThreshold={criticalThreshold}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
