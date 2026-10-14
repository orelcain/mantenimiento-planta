import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Line } from 'react-chartjs-2'
import type { GraderAnalyticsResult, GraderAnalysisConfig } from '@/services/grader/types'
import { useColoresGrafico } from '@/hooks/useColoresGrafico'
import { elegirColor } from '@/lib/coloresGrafico'

interface Props {
  analytics: GraderAnalyticsResult
  config: GraderAnalysisConfig
}

export function PuntoCeroSerieTemporalCard({ analytics, config }: Props) {
  // Pizarra: re-render al cambiar Día/Penumbra (los colores de canvas se leen de los tokens al pintar).
  useColoresGrafico()
  const timeSeriesData = {
    labels: analytics.timeSeriesPointZero.map((p) => p.bucketStart),
    datasets: [
      {
        label: 'Punto Cero (piezas)',
        data: analytics.timeSeriesPointZero.map((p) => p.pointZeroPieces),
        // Pizarra: única serie del gráfico = foco (serie 1); el rojo queda para estados fuera de banda.
        borderColor: elegirColor('rgba(239,68,68,0.9)', 'serie-1', 0.9),
        backgroundColor: elegirColor('rgba(239,68,68,0.1)', 'serie-1', 0.1),
        fill: true,
        tension: 0.3,
      },
    ],
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Punto Cero en el Tiempo</CardTitle></CardHeader>
      <CardContent>
        {analytics.timeSeriesPointZero.length > 0 ? (
          <div className="w-full h-[260px] sm:h-[320px]">
            <Line
              data={timeSeriesData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: {
                    type: 'time',
                    time: { unit: config.intervalMinutes === 60 ? 'hour' : 'minute' },
                    ticks: { maxRotation: 0, autoSkip: true },
                  },
                  y: { beginAtZero: true },
                },
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">Sin serie temporal</p>
        )}
      </CardContent>
    </Card>
  )
}
