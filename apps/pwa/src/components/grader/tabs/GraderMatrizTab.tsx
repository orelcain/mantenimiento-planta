/**
 * Tab "Matriz Q×C" del Dashboard del Grader.
 * Extraído de AnalisisGraderDashboardPage.tsx en la iter 3 de refactor 2026-04-10
 * para dividir el componente principal por tabs y reducir complejidad.
 */
import { Card, CardContent, CardHeader, CardTitle, Badge, InfoTooltip } from '@/components/ui'
import { Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import type { GraderAnalyticsResult } from '@/services/grader/types'

interface Props {
  analytics: GraderAnalyticsResult
  matrixQualities: string[]
  matrixCalibres: string[]
}

export function GraderMatrizTab({ analytics, matrixQualities, matrixCalibres }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Table2 className="h-4 w-4" />
          Matriz Calidad × Calibre
          <InfoTooltip {...getTooltipProps('matrix.qc')} />
        </CardTitle>
        {analytics.matrixEnhanced.globalHHI > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            <Badge variant="outline" className={cn(
              'text-caption',
              analytics.matrixEnhanced.globalHHI > 0.5 && 'text-ink-crit border-red-300',
              analytics.matrixEnhanced.globalHHI > 0.25 && analytics.matrixEnhanced.globalHHI <= 0.5 && 'text-ink-warn border-amber-300',
              analytics.matrixEnhanced.globalHHI <= 0.25 && 'text-ink-ok border-emerald-300',
            )}>
              Concentración: {
                analytics.matrixEnhanced.globalHHI > 0.5 ? 'Alta' :
                analytics.matrixEnhanced.globalHHI > 0.25 ? 'Media' : 'Baja ✓'
              }
              <InfoTooltip {...getTooltipProps('matrix.hhi')} iconSize={11} className="ml-1" />
            </Badge>
            <Badge variant="outline" className={cn(
              'text-caption',
              analytics.matrixEnhanced.imbalanceScore > 0.6 && 'text-ink-crit border-red-300',
              analytics.matrixEnhanced.imbalanceScore > 0.3 && analytics.matrixEnhanced.imbalanceScore <= 0.6 && 'text-ink-warn border-amber-300',
            )}>
              Desbalance: {(analytics.matrixEnhanced.imbalanceScore * 100).toFixed(1)}%
              <InfoTooltip {...getTooltipProps('matrix.imbalance')} iconSize={11} className="ml-1" />
            </Badge>
            {analytics.matrixEnhanced.maxCell && (
              <Badge variant="outline" className="text-caption">
                Celda Max: {analytics.matrixEnhanced.maxCell.quality}×{analytics.matrixEnhanced.maxCell.calibre} ({analytics.matrixEnhanced.maxCell.pct}%)
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {matrixQualities.length > 0 && matrixCalibres.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 px-2 text-left">Calidad \ Calibre</th>
                  {matrixCalibres.map((c) => (
                    <th key={c} className="py-2 px-2 text-center">{c}</th>
                  ))}
                  <th className="py-2 px-2 text-center">
                    <span className="flex items-center justify-center gap-1">
                      Conc.
                      <InfoTooltip {...getTooltipProps('matrix.hhiQuality')} iconSize={11} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrixQualities.map((q) => {
                  const hhiRow = analytics.matrixEnhanced.hhiByQuality.find(h => h.quality === q)
                  return (
                    <tr key={q} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-2 font-medium">{q}</td>
                      {matrixCalibres.map((c) => {
                        const cell = analytics.matrixQualityCalibre[q]?.[c]
                        const isMax = analytics.matrixEnhanced.maxCell?.quality === q && analytics.matrixEnhanced.maxCell?.calibre === c
                        const avgW = analytics.matrixEnhanced.avgWeightByCell[q]?.[c]
                        return (
                          <td key={c} className={cn(
                            'py-2 px-2 text-center',
                            isMax && 'bg-primary/[0.15] ring-1 ring-blue-300',
                            cell && cell.pct >= 20 && !isMax && 'bg-primary/[0.15]',
                          )}>
                            {cell ? (
                              <div>
                                <span className="font-medium">{cell.pieces.toLocaleString('es-CL')}</span>
                                <span className="text-muted-foreground text-xs ml-1">({cell.pct}%)</span>
                                {avgW != null && (
                                  <p className="text-caption text-muted-foreground">{avgW.toLocaleString('es-CL')}g</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="py-2 px-2 text-center text-xs">
                        {hhiRow ? (
                          <span className={cn(
                            'font-medium',
                            hhiRow.hhi > 0.5 && 'text-ink-crit',
                            hhiRow.hhi > 0.25 && hhiRow.hhi <= 0.5 && 'text-ink-warn',
                            hhiRow.hhi <= 0.25 && 'text-ink-ok',
                          )}>
                            {hhiRow.hhi > 0.5 ? 'Alta' : hhiRow.hhi > 0.25 ? 'Media' : 'Baja'}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
                {/* HHI by calibre row */}
                {analytics.matrixEnhanced.hhiByCalibre.length > 0 && (
                  <tr className="border-t-2 bg-muted">
                    <td className="py-2 px-2 font-medium text-xs">
                      <span className="flex items-center gap-1">
                        Conc.
                        <InfoTooltip {...getTooltipProps('matrix.hhiCalibre')} iconSize={11} />
                      </span>
                    </td>
                    {matrixCalibres.map(c => {
                      const hhiCol = analytics.matrixEnhanced.hhiByCalibre.find(h => h.calibre === c)
                      return (
                        <td key={c} className="py-2 px-2 text-center text-xs">
                          {hhiCol ? (
                            <span className={cn(
                              'font-medium',
                              hhiCol.hhi > 0.5 && 'text-ink-crit',
                              hhiCol.hhi > 0.25 && hhiCol.hhi <= 0.5 && 'text-ink-warn',
                              hhiCol.hhi <= 0.25 && 'text-ink-ok',
                            )}>
                              {hhiCol.hhi > 0.5 ? 'Alta' : hhiCol.hhi > 0.25 ? 'Media' : 'Baja'}
                            </span>
                          ) : '—'}
                        </td>
                      )
                    })}
                    <td className="py-2 px-2 text-center text-xs font-bold">
                      {analytics.matrixEnhanced.globalHHI > 0.5 ? 'Alta' : analytics.matrixEnhanced.globalHHI > 0.25 ? 'Media' : 'Baja'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Matriz no disponible. Cargue archivo pieza-pieza o % Calidad.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
