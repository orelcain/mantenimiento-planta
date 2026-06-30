/**
 * AriaAvisaCard — tarjeta "ARIA te avisa" en el dashboard. Muestra los avisos
 * proactivos del último turno (KPIs fuera de umbral) que ARIA detecta sola. Si el
 * turno está sano (o no hay datos), no renderiza nada (no estorba).
 *
 * Sirve a la meta: pone a la vista, con datos, dónde Mantención debe actuar — cada
 * aviso ata un número (MTTR alto, MTBF bajo) a una acción.
 */
import { useNavigate } from 'react-router-dom'
import { Bot, AlertTriangle, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import { useAriaKpiAlerts } from '@/hooks/useAriaKpiAlerts'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'

export function AriaAvisaCard({ plantSlug = 'chonchi' }: { plantSlug?: PlantSlug }) {
  const navigate = useNavigate()
  const { alerts, loading } = useAriaKpiAlerts(plantSlug)

  if (loading || alerts.length === 0) return null

  const hasCritical = alerts.some((a) => a.severity === 'critical')
  const { plantLabel, shiftLabel } = alerts[0]!

  return (
    <Card className={hasCritical ? 'border-rose-500/50 bg-rose-500/[0.06]' : 'border-amber-500/50 bg-amber-500/[0.06]'}>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Bot className="h-5 w-5 text-primary" />
          ARIA te avisa
          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${hasCritical ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'}`}>
            {alerts.length}
          </span>
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {plantLabel} · {shiftLabel}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((a) => (
          <div key={a.id} className="flex items-start gap-2 text-sm">
            <AlertTriangle
              className={`h-4 w-4 mt-0.5 shrink-0 ${a.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'}`}
            />
            <p className="leading-snug">{a.message}</p>
          </div>
        ))}
        <Button variant="ghost" size="sm" className="mt-1 -ml-2" onClick={() => navigate('/analisis-grader')}>
          Ver Análisis de Turno
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </CardContent>
    </Card>
  )
}
