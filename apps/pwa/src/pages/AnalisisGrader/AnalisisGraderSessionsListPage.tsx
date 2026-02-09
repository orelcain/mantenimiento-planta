/**
 * Listado de sesiones de análisis Grader guardadas.
 * Permite ver, navegar a detalle y eliminar sesiones.
 */

import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui'
import {
  BarChart3,
  ArrowLeft,
  Loader2,
  Trash2,
  Eye,
  Calendar,
  Cpu,
  Package,
  AlertCircle,
} from 'lucide-react'
import { usePermissionsStore } from '@/store'
import { listGraderSessions, deleteGraderSession } from '@/services/grader/graderSession.service'
import type { GraderSession } from '@/services/grader/types'

export function AnalisisGraderSessionsListPage() {
  const { canSee, can } = usePermissionsStore()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<GraderSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadSessions()
  }, [])

  if (!canSee('analisisGrader')) {
    return <Navigate to="/" replace />
  }

  async function loadSessions() {
    setLoading(true)
    setError(null)
    try {
      const list = await listGraderSessions(100)
      setSessions(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar sesiones')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(sessionId: string) {
    if (!confirm('¿Eliminar esta sesión de análisis?')) return
    setDeleting(sessionId)
    try {
      await deleteGraderSession(sessionId)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch {
      // silent
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Nuevo Análisis
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Sesiones Guardadas
            </h1>
            <p className="text-xs text-muted-foreground">
              {sessions.length} sesión(es) de análisis Grader
            </p>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-300">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={loadSessions}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !error && sessions.length === 0 && (
        <Card>
          <CardContent className="pt-10 pb-10 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No hay sesiones guardadas aún.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => navigate('/analisis-grader')}
            >
              Crear primer análisis
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sessions list */}
      {!loading && sessions.length > 0 && (
        <div className="grid gap-3">
          {sessions.map((session) => {
            const totalPieces = session.aggregates?.kpis?.totalPieces ?? 0
            const pointZeroPct = session.aggregates?.kpis?.pointZeroPct ?? 0
            const insightsCount = session.insights?.length ?? 0
            const hasAI = !!session.aiOutput
            const createdAt = session.createdAt
              ? new Date(session.createdAt).toLocaleString()
              : '—'

            return (
              <Card key={session.id} className="hover:border-primary/40 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      {session.deviceId || 'Análisis Grader'}
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/analisis-grader/sesion/${session.id}`)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Ver
                      </Button>
                      {can('analisisGrader', 'editar') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(session.id)}
                          disabled={deleting === session.id}
                        >
                          {deleting === session.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {createdAt}
                    </span>
                    {session.deviceId && (
                      <span className="flex items-center gap-1">
                        <Cpu className="h-3.5 w-3.5" />
                        {session.deviceId}
                      </span>
                    )}
                    {session.startAt && session.endAt && (
                      <span>
                        {session.startAt} — {session.endAt}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {totalPieces.toLocaleString()} piezas
                    </Badge>
                    <Badge
                      variant={pointZeroPct > 3 ? 'destructive' : 'outline'}
                      className="text-[10px]"
                    >
                      P0: {pointZeroPct}%
                    </Badge>
                    {insightsCount > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {insightsCount} insight(s)
                      </Badge>
                    )}
                    {hasAI && (
                      <Badge className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        IA
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
