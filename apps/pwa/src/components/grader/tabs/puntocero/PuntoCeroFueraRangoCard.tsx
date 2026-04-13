import { Card, CardContent, CardHeader, CardTitle, InfoTooltip } from '@/components/ui'
import { AlertTriangle } from 'lucide-react'
import { Bar } from 'react-chartjs-2'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import type { GraderAnalyticsResult } from '@/services/grader/types'

interface Props {
  analytics: GraderAnalyticsResult
}

export function PuntoCeroFueraRangoCard({ analytics }: Props) {
  const outOfRange = analytics.pointZeroClassification.outOfRangeByWeight
  if (outOfRange.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Fuera de Rango — Distribución por Peso
          <InfoTooltip {...getTooltipProps('pz.fueraRango')} />
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Piezas clasificadas como &quot;fuera de rango&quot; agrupadas por el calibre al que pertenecerían según su peso
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="w-full" style={{ maxHeight: 220 }}>
            <Bar
              data={{
                labels: outOfRange.map((d) => d.rangeLabel),
                datasets: [
                  {
                    label: 'Piezas fuera de rango',
                    data: outOfRange.map((d) => d.pieces),
                    backgroundColor: outOfRange.map((_, i, arr) => {
                      const t = arr.length > 1 ? i / (arr.length - 1) : 0
                      const r = Math.round(239 + (245 - 239) * t)
                      const g = Math.round(68 + (158 - 68) * t)
                      const b = Math.round(68 + (11 - 68) * t)
                      return `rgba(${r},${g},${b},0.75)`
                    }),
                    borderRadius: 4,
                    barThickness: 24,
                  },
                ],
              }}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const d = outOfRange[ctx.dataIndex]
                        return d ? `${d.pieces.toLocaleString()} piezas (${d.pct}%)` : ''
                      },
                    },
                  },
                },
                scales: {
                  x: { beginAtZero: true, grid: { color: 'rgba(128,128,128,0.1)' } },
                  y: { ticks: { font: { size: 11 } } },
                },
              }}
              height={Math.max(80, outOfRange.length * 40)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium mb-2">Rangos de Calibre (referencia)</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="py-1 px-2 text-left">Calibre</th>
                    <th className="py-1 px-2 text-right">Mín (g)</th>
                    <th className="py-1 px-2 text-right">Máx (g)</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.pointZeroClassification.calibreWeightRanges.map((r, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-1 px-2">{r.calibre}</td>
                      <td className="py-1 px-2 text-right font-mono">{r.minGrams.toLocaleString()}</td>
                      <td className="py-1 px-2 text-right font-mono">{r.maxGrams.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <p className="text-xs font-medium mb-2">Desglose Fuera de Rango</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="py-1 px-2 text-left">Rango</th>
                    <th className="py-1 px-2 text-right">Piezas</th>
                    <th className="py-1 px-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {outOfRange.map((d, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="py-1 px-2">{d.rangeLabel}</td>
                      <td className="py-1 px-2 text-right font-medium">{d.pieces.toLocaleString()}</td>
                      <td className="py-1 px-2 text-right">{d.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
