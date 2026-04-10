/**
 * Página de sesión guardada de Análisis Grader.
 * Carga una sesión desde Firestore y muestra el dashboard read-only.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { Card, CardContent, Button, Badge } from '@/components/ui'
import { ArrowLeft, Loader2, AlertCircle, BarChart3 } from 'lucide-react'
import { usePermissionsStore } from '@/store'
import { getGraderSession } from '@/services/grader/graderSession.service'
import { AnalisisGraderDashboardPage } from './AnalisisGraderDashboardPage'
import type { GraderSession, ParsedMatrixData } from '@/services/grader/types'

export function AnalisisGraderSessionPage() {
  const { canSee } = usePermissionsStore()
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<GraderSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    getGraderSession(sessionId)
      .then((s) => {
        if (!s) {
          setError('Sesión no encontrada.')
        } else {
          setSession(s)
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [sessionId])

  if (!canSee('analisisGrader')) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate('/analisis-grader')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Volver
        </Button>
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-3" />
            <p className="text-sm">{error || 'Sesión no encontrada.'}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Build a pseudo ParsedMatrixData from aggregates for the dashboard
  const pseudoData: ParsedMatrixData = {
    files: session.uploadedFilesMeta,
    pieceRecords: [],
    gate0Records: [],
    folioRecords: [],
    qualitySummary: [],
    productionSummary: [],
    inferred: {
      deviceId: session.deviceId,
      startAt: session.startAt,
      endAt: session.endAt,
    },
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Volver
        </Button>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          <h1 className="text-lg font-bold">Sesión Guardada</h1>
        </div>
        {session.deviceId && <Badge variant="outline">{session.deviceId}</Badge>}
        <span className="text-xs text-muted-foreground">
          {new Date(session.createdAt).toLocaleString()}
        </span>
      </div>

      <AnalisisGraderDashboardPage
        parsedData={pseudoData}
        gates={session.gatesConfigSnapshot}
        config={session.aggregates.config}
        onBack={() => navigate('/analisis-grader')}
        analyticsOverride={session.aggregates}
        insightsOverride={session.insights}
        initialAIOutput={session.aiOutput ?? null}
        currentSessionMeta={{
          sessionId: session.id,
          shiftId: session.shiftId,
          sessionDate: session.sessionDate,
        }}
      />
    </div>
  )
}
