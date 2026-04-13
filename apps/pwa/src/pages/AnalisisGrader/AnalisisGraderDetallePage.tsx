/**
 * Página de detalle de un turno histórico del Grader.
 *
 * Lee `?date=YYYY-MM-DD&shift=Turno%20día` de la URL, hace fetch del
 * `GraderDailySummary` correspondiente desde Firestore y lo renderiza con
 * `<GraderTurnoDetailView />`. Si el summary no existe, muestra un estado
 * vacío con botón para volver al calendario.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom'
import { Card, CardContent, Button } from '@/components/ui'
import { ArrowLeft, Calendar, Loader2, AlertCircle } from 'lucide-react'
import { usePermissionsStore } from '@/store'
import { getDailySummary, listDailySummariesByRange } from '@/services/grader/graderDailySummary.service'
import type { GraderDailySummary } from '@/services/grader/types'
import { GraderTurnoDetailView } from '@/components/grader/GraderTurnoDetailView'

// Cuántos días antes/después buscar para navegación + tendencia
const CONTEXT_DAYS_BEFORE = 45
const CONTEXT_DAYS_AFTER = 45

function offsetDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function AnalisisGraderDetallePage() {
  const { canSee } = usePermissionsStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const dateKey = searchParams.get('date')
  const shiftId = searchParams.get('shift')

  const [summary, setSummary] = useState<GraderDailySummary | null>(null)
  const [recentTurns, setRecentTurns] = useState<GraderDailySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!dateKey || !shiftId) {
      setError('Parámetros inválidos. Falta `date` o `shift` en la URL.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const contextStart = offsetDays(dateKey, -CONTEXT_DAYS_BEFORE)
    const contextEnd = offsetDays(dateKey, CONTEXT_DAYS_AFTER)
    Promise.all([
      getDailySummary(dateKey, shiftId),
      listDailySummariesByRange(contextStart, contextEnd).catch(() => []),
    ])
      .then(([s, recent]) => {
        if (!s) {
          setError(`No se encontró el turno ${shiftId} del ${dateKey} en el historial.`)
        } else {
          setSummary(s)
          // excluir el propio turno del contexto (puede estar duplicado)
          setRecentTurns(recent.filter((t) => t.id !== s.id))
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al cargar el turno.')
      })
      .finally(() => setLoading(false))
  }, [dateKey, shiftId])

  if (!canSee('analisisGrader')) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-4">
      {/* Header con Volver */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && error && (
        <Card className="border-red-300">
          <CardContent className="pt-6 pb-6 text-center space-y-3">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
            <p className="text-sm text-destructive">{error}</p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader')}>
                <Calendar className="h-4 w-4 mr-1" />
                Ir al inicio
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && !error && summary && (
        <GraderTurnoDetailView summary={summary} recentTurns={recentTurns} />
      )}
    </div>
  )
}
