/**
 * AriaAvisaCard — tarjeta "ARIA te avisa" en el dashboard. Muestra los avisos
 * proactivos que ARIA detecta sola: KPIs de turno fuera de umbral, preventivas
 * vencidas, equipos en condición crítica (CTD) e incidencias críticas viejas. Si no
 * hay nada que avisar, no renderiza nada (no estorba). Cada aviso enlaza a su detalle.
 *
 * Sirve a la meta: pone a la vista, con datos, dónde Mantención debe actuar.
 */
import { useNavigate } from 'react-router-dom'
import { Bot, AlertTriangle, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { useAriaAlerts } from '@/hooks/useAriaAlerts'

const MAX_SHOWN = 6

export function AriaAvisaCard() {
  const navigate = useNavigate()
  const { alerts, loading } = useAriaAlerts()

  if (loading || alerts.length === 0) return null

  const hasCritical = alerts.some((a) => a.severity === 'critical')
  const shown = alerts.slice(0, MAX_SHOWN)

  return (
    <Card className={hasCritical ? 'border-rose-500/50 bg-rose-500/[0.06]' : 'border-amber-500/50 bg-amber-500/[0.06]'}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Bot className="h-5 w-5 text-primary" />
          ARIA te avisa
          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${hasCritical ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'}`}>
            {alerts.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {shown.map((a) => (
          <button
            key={a.id}
            onClick={() => { if (a.link) navigate(a.link) }}
            disabled={!a.link}
            className="w-full flex items-start gap-2 text-sm text-left rounded-md px-1.5 py-1 hover:bg-background/40 transition-colors disabled:cursor-default"
          >
            <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${a.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'}`} />
            <span className="leading-snug">{a.message}</span>
            {a.link && <ChevronRight className="h-4 w-4 ml-auto shrink-0 opacity-50" />}
          </button>
        ))}
        {alerts.length > MAX_SHOWN && (
          <p className="text-xs text-muted-foreground pl-1.5 pt-0.5">…y {alerts.length - MAX_SHOWN} aviso(s) más.</p>
        )}
      </CardContent>
    </Card>
  )
}
