/**
 * Card colapsable "Timeline segundo a segundo" para el tab Tendencia.
 * Wrappea GraderTimelineChart con datos in-memory (PieceRecord[])
 * convertidos a FirestorePieceRecord[] via buildDedupeKey.
 *
 * Colapsado por defecto para evitar renderizar 100k+ puntos scatter
 * sin necesidad. Al expandir, convierte y renderiza.
 */
import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui'
import { ChevronDown, ChevronUp, ScatterChart } from 'lucide-react'
import { GraderTimelineChart } from '@/components/grader/GraderTimelineChart'
import { buildDedupeKey } from '@/services/grader/graderDailySummary.service'
import type { PieceRecord } from '@/services/grader/types'
import type { FirestorePieceRecord } from '@/services/grader/graderDailySummary.service'

interface Props {
  pieceRecords: PieceRecord[]
  shiftId: string
  dateKey: string
}

export function TendenciaTimelineCard({ pieceRecords, shiftId, dateKey }: Props) {
  const [expanded, setExpanded] = useState(false)

  const firestoreRecords = useMemo<FirestorePieceRecord[]>(() => {
    if (!expanded) return []
    return pieceRecords.map((r) => ({
      ts: r.ts,
      gate: r.gate,
      pieces: r.pieces,
      weightKg: r.weightKg,
      weightPerPieceGrams: r.weightPerPieceGrams,
      quality: r.quality,
      calibre: r.calibre,
      error: r.error,
      dedupeKey: buildDedupeKey(r),
    }))
  }, [pieceRecords, expanded])

  const withWeight = pieceRecords.filter((r) => r.weightPerPieceGrams != null && r.weightPerPieceGrams > 0)
  const gate0Count = pieceRecords.filter((r) => r.gate === 0).length

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScatterChart className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Timeline segundo a segundo</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-caption">
              {pieceRecords.length.toLocaleString('es-CL')} registros
            </Badge>
            {withWeight.length > 0 && (
              <Badge variant="outline" className="text-caption">
                {withWeight.length.toLocaleString('es-CL')} con peso
              </Badge>
            )}
            {gate0Count > 0 && (
              <Badge variant="outline" className="text-caption text-red-500">
                {gate0Count.toLocaleString('es-CL')} P0
              </Badge>
            )}
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
        {!expanded && (
          <p className="text-xs text-muted-foreground mt-1">
            Scatter de pesos individuales, P0% rolling, errores y piezas/min. Click para expandir.
          </p>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          {firestoreRecords.length > 0 ? (
            <GraderTimelineChart
              records={firestoreRecords}
              shiftId={shiftId}
              dateKey={dateKey}
            />
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">Cargando...</p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
