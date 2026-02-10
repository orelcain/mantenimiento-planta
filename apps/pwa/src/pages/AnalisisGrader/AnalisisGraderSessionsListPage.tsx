/**
 * Listado de sesiones de análisis Grader guardadas.
 * Agrupa las sesiones por día de producción y muestra turno/dispositivo.
 */

import { useState, useEffect, useMemo } from 'react'
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
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { usePermissionsStore } from '@/store'
import { listGraderSessions, deleteGraderSession } from '@/services/grader/graderSession.service'
import type { GraderSession } from '@/services/grader/types'

/** Derive a display date key from a session */
function getSessionDateKey(s: GraderSession): string {
  // Prefer the explicit sessionDate field
  if (s.sessionDate) return s.sessionDate
  // Fallback: derive from startAt or createdAt
  const iso = s.startAt || s.createdAt
  if (!iso) return 'sin-fecha'
  return iso.slice(0, 10)
}

/** Format YYYY-MM-DD to a user friendly label: "Lun 09/02/2026" */
function formatDateLabel(dateKey: string): string {
  if (dateKey === 'sin-fecha') return 'Sin fecha'
  try {
    const d = new Date(dateKey + 'T12:00:00') // noon to avoid TZ issues
    const dayName = d.toLocaleDateString('es-CL', { weekday: 'short' })
    const formatted = d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    return `${dayName.charAt(0).toUpperCase()}${dayName.slice(1)} ${formatted}`
  } catch {
    return dateKey
  }
}

/** Format start/end ISO to HH:MM range */
function formatTimeRange(startAt?: string, endAt?: string): string | null {
  if (!startAt || !endAt) return null
  try {
    const fmt = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    return `${fmt(startAt)} — ${fmt(endAt)}`
  } catch {
    return null
  }
}

interface DayGroup {
  dateKey: string // YYYY-MM-DD
  label: string
  sessions: GraderSession[]
  totalPieces: number
  avgP0Pct: number
}

export function AnalisisGraderSessionsListPage() {
  const { canSee, can } = usePermissionsStore()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<GraderSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())

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

  // Group sessions by production day
  const dayGroups = useMemo<DayGroup[]>(() => {
    const map = new Map<string, GraderSession[]>()
    for (const s of sessions) {
      const key = getSessionDateKey(s)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    // Sort by date descending
    const keys = [...map.keys()].sort((a, b) => b.localeCompare(a))
    return keys.map((dateKey) => {
      const group = map.get(dateKey)!
      const totalPieces = group.reduce((sum, s) => sum + (s.aggregates?.kpis?.totalPieces ?? 0), 0)
      const avgP0Pct = group.length > 0
        ? group.reduce((sum, s) => sum + (s.aggregates?.kpis?.pointZeroPct ?? 0), 0) / group.length
        : 0
      return {
        dateKey,
        label: formatDateLabel(dateKey),
        sessions: group,
        totalPieces,
        avgP0Pct: Math.round(avgP0Pct * 100) / 100,
      }
    })
  }, [sessions])

  function toggleDay(dateKey: string) {
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      if (next.has(dateKey)) next.delete(dateKey)
      else next.add(dateKey)
      return next
    })
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
              {sessions.length} sesión(es) en {dayGroups.length} día(s)
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

      {/* Sessions grouped by day */}
      {!loading && dayGroups.length > 0 && (
        <div className="space-y-3">
          {dayGroups.map((group) => {
            const isCollapsed = collapsedDays.has(group.dateKey)
            return (
              <div key={group.dateKey} className="space-y-2">
                {/* Day header */}
                <button
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left"
                  onClick={() => toggleDay(group.dateKey)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <Calendar className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-semibold text-sm">{group.label}</span>
                  <div className="flex items-center gap-2 ml-auto flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {group.sessions.length} turno(s)
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {group.totalPieces.toLocaleString()} piezas
                    </Badge>
                    <Badge
                      variant={group.avgP0Pct > 3 ? 'destructive' : 'outline'}
                      className="text-[10px]"
                    >
                      P0: {group.avgP0Pct}%
                    </Badge>
                  </div>
                </button>

                {/* Sessions in this day */}
                {!isCollapsed && (
                  <div className="grid gap-2 pl-4">
                    {group.sessions.map((session) => {
                      const totalPieces = session.aggregates?.kpis?.totalPieces ?? 0
                      const pointZeroPct = session.aggregates?.kpis?.pointZeroPct ?? 0
                      const insightsCount = session.insights?.length ?? 0
                      const hasAI = !!session.aiOutput
                      const timeRange = formatTimeRange(session.startAt, session.endAt)
                      const shiftLabel = session.shiftId || session.aggregates?.config?.shiftId

                      return (
                        <Card key={session.id} className="hover:border-primary/40 transition-colors">
                          <CardHeader className="pb-2 pt-3">
                            <div className="flex items-center justify-between gap-3">
                              <CardTitle className="text-sm flex items-center gap-2">
                                <BarChart3 className="h-4 w-4 text-primary" />
                                {session.deviceId || 'Análisis Grader'}
                                {shiftLabel && (
                                  <Badge variant="secondary" className="text-[10px] font-normal">
                                    {shiftLabel}
                                  </Badge>
                                )}
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
                          <CardContent className="pt-0 pb-3">
                            <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                              {timeRange && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  {timeRange}
                                </span>
                              )}
                              {session.deviceId && (
                                <span className="flex items-center gap-1">
                                  <Cpu className="h-3.5 w-3.5" />
                                  {session.deviceId}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
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
                                  {insightsCount} alerta(s)
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
          })}
        </div>
      )}
    </div>
  )
}
