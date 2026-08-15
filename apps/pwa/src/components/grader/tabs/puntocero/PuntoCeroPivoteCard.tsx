import { useState } from 'react'
import { compararCalibres } from '@/utils/calibres'
import { Card, CardContent, CardHeader, CardTitle, Badge, InfoTooltip } from '@/components/ui'
import { Table2 } from 'lucide-react'
import { Bar } from 'react-chartjs-2'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import { pctCalc } from '@/services/grader/graderDashboardHelpers'
import type { GraderAnalyticsResult } from '@/services/grader/types'

const errorColorMap: Record<string, string> = {
  'Fuera de rango': 'rgba(239,68,68,0.75)',
  'Fuera de límites': 'rgba(245,158,11,0.75)',
  'No leído por fotocélula': 'rgba(139,92,246,0.75)',
  'Too close or too long': 'rgba(59,130,246,0.75)',
  'Puerta no preparada': 'rgba(16,185,129,0.75)',
  'Otro / Desconocido': 'rgba(107,114,128,0.75)',
}

interface Props {
  analytics: GraderAnalyticsResult
}

export function PuntoCeroPivoteCard({ analytics }: Props) {
  const [p0ErrorFilter, setP0ErrorFilter] = useState<string | null>(null)

  const allRows = analytics.pointZeroClassification.hierarchy
  if (allRows.length === 0) return null

  const filteredRows = p0ErrorFilter
    ? allRows.filter((r) => r.error === p0ErrorFilter)
    : allRows

  const uniqueErrors = Array.from(new Set(allRows.map((r) => r.error)))
  const filteredTotal = filteredRows.reduce((sum, r) => sum + r.pieces, 0)
  // Orden físico del calibre, no alfabético ("2-4 lb" antes que "10-12 lb").
  const allCalibres = Array.from(new Set(filteredRows.map((r) => r.calibre))).sort(compararCalibres)

  const pivotBarDatasets = uniqueErrors.map((errorLabel) => {
    const data = allCalibres.map((cal) =>
      filteredRows
        .filter((r) => r.error === errorLabel && r.calibre === cal)
        .reduce((sum, r) => sum + r.pieces, 0)
    )
    return {
      label: errorLabel,
      data,
      backgroundColor: errorColorMap[errorLabel] || 'rgba(107,114,128,0.6)',
      borderColor: errorColorMap[errorLabel]?.replace('0.75', '1') || 'rgba(107,114,128,1)',
      borderWidth: 1,
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Table2 className="h-4 w-4 text-cat-6-ink" />
          Pivote Error × Calidad × Calibre
          <InfoTooltip {...getTooltipProps('pz.pivote')} />
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Desglose jerárquico: Error → Calidad → Calibre. Filtra por tipo de error.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge
            variant={p0ErrorFilter === null ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => setP0ErrorFilter(null)}
          >
            Todos ({analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString('es-CL')})
          </Badge>
          {uniqueErrors.map((errorLabel) => {
            const errorTotal = allRows.filter((r) => r.error === errorLabel).reduce((s, r) => s + r.pieces, 0)
            return (
              <Badge
                key={errorLabel}
                variant={p0ErrorFilter === errorLabel ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => setP0ErrorFilter(p0ErrorFilter === errorLabel ? null : errorLabel)}
              >
                {errorLabel} ({errorTotal.toLocaleString('es-CL')})
              </Badge>
            )
          })}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {allCalibres.length > 0 && pivotBarDatasets.length > 0 && (
          <div className="w-full" style={{ minHeight: 250 }}>
            <Bar
              data={{ labels: allCalibres, datasets: pivotBarDatasets }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: { font: { size: 10 }, boxWidth: 14 },
                  },
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        const v = ctx.parsed.y
                        if (!v) return ''
                        const pct = filteredTotal > 0 ? ((v / filteredTotal) * 100).toFixed(1) : '0'
                        return `${ctx.dataset.label}: ${v.toLocaleString('es-CL')} pz (${pct}%)`
                      },
                    },
                  },
                },
                scales: {
                  x: {
                    ticks: { font: { size: 10 } },
                    grid: { color: 'rgba(128,128,128,0.1)' },
                  },
                  y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(128,128,128,0.1)' },
                  },
                },
              }}
              height={280}
            />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-2">Etiquetas de fila</th>
                <th className="py-2 px-2 text-right">Piezas</th>
                <th className="py-2 px-2 text-right">% P.Cero</th>
                <th className="py-2 px-2 text-right">% Total</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const errorGroups = new Map<string, { cause: string; rows: typeof filteredRows; total: number }>()
                for (const r of filteredRows) {
                  const g = errorGroups.get(r.error) || { cause: r.error, rows: [], total: 0 }
                  g.rows.push(r)
                  g.total += r.pieces
                  errorGroups.set(r.error, g)
                }
                const elements: React.ReactNode[] = []
                for (const [errorLabel, eg] of Array.from(errorGroups.entries())) {
                  elements.push(
                    <tr key={`e-${errorLabel}`} className="bg-muted/60 font-bold border-b">
                      <td className="py-2 px-2">{errorLabel}</td>
                      <td className="py-2 px-2 text-right">{eg.total.toLocaleString('es-CL')}</td>
                      <td className="py-2 px-2 text-right">{pctCalc(eg.total, analytics.pointZeroClassification.totalPointZeroPieces)}%</td>
                      <td className="py-2 px-2 text-right text-muted-foreground">{pctCalc(eg.total, analytics.kpis.totalPieces)}%</td>
                    </tr>
                  )
                  const qualityGroups = new Map<string, { rows: typeof filteredRows; total: number }>()
                  for (const r of eg.rows) {
                    const qg = qualityGroups.get(r.quality) || { rows: [], total: 0 }
                    qg.rows.push(r)
                    qg.total += r.pieces
                    qualityGroups.set(r.quality, qg)
                  }
                  for (const [qualLabel, qg] of Array.from(qualityGroups.entries())) {
                    elements.push(
                      <tr key={`q-${errorLabel}-${qualLabel}`} className="font-semibold border-b hover:bg-muted/20">
                        <td className="py-1.5 px-2 pl-6">{qualLabel}</td>
                        <td className="py-1.5 px-2 text-right">{qg.total.toLocaleString('es-CL')}</td>
                        <td className="py-1.5 px-2 text-right">{pctCalc(qg.total, analytics.pointZeroClassification.totalPointZeroPieces)}%</td>
                        <td className="py-1.5 px-2 text-right text-muted-foreground">{pctCalc(qg.total, analytics.kpis.totalPieces)}%</td>
                      </tr>
                    )
                    for (const r of qg.rows.sort((a, b) => b.pieces - a.pieces)) {
                      elements.push(
                        <tr key={`c-${errorLabel}-${qualLabel}-${r.calibre}`} className="border-b hover:bg-muted/10 text-muted-foreground">
                          <td className="py-1 px-2 pl-12">{r.calibre}</td>
                          <td className="py-1 px-2 text-right">{r.pieces.toLocaleString('es-CL')}</td>
                          <td className="py-1 px-2 text-right">{r.pctOfPointZero}%</td>
                          <td className="py-1 px-2 text-right">{r.pctOfTotal}%</td>
                        </tr>
                      )
                    }
                  }
                }
                return elements
              })()}
              <tr className="border-t-2 font-bold bg-muted/50">
                <td className="py-2 px-2">{p0ErrorFilter ? `Total ${p0ErrorFilter}` : 'Total general'}</td>
                <td className="py-2 px-2 text-right">{filteredTotal.toLocaleString('es-CL')}</td>
                <td className="py-2 px-2 text-right">{pctCalc(filteredTotal, analytics.pointZeroClassification.totalPointZeroPieces)}%</td>
                <td className="py-2 px-2 text-right">{pctCalc(filteredTotal, analytics.kpis.totalPieces)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
