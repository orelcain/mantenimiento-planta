/**
 * Calendario de uploads Grader con resumen diario y por turno.
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui'
import { Calendar, ChevronLeft, ChevronRight, Loader2, ArrowLeft, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissionsStore } from '@/store'
import { listGraderUploads } from '@/services/grader/graderUpload.service'
import { parseFile, mergeParsedData } from '@/services/grader/graderExcelParser'
import type { GraderUpload } from '@/services/grader/types'

interface TurnoSummary {
  totalPieces: number
  pointZeroPieces: number
  pointZeroPct: number
  startAt?: string
  endAt?: string
}

interface SummaryState {
  loading: boolean
  error: string | null
  data?: TurnoSummary
}

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']

function toDateKey(iso?: string): string {
  if (!iso) return new Date().toISOString().slice(0, 10)
  return iso.slice(0, 10)
}

function inferShiftId(startAt?: string): string {
  if (!startAt) return 'Turno noche'
  const d = new Date(startAt)
  const hour = d.getHours()
  return hour >= 7 && hour < 19 ? 'Turno dia' : 'Turno noche'
}

function isToday(date: Date): boolean {
  const today = new Date()
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  )
}

function getDaysInMonth(date: Date): (Date | null)[] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startDayOfWeek = firstDay.getDay()

  const days: (Date | null)[] = []

  for (let i = 0; i < startDayOfWeek; i += 1) {
    days.push(null)
  }

  for (let i = 1; i <= daysInMonth; i += 1) {
    days.push(new Date(year, month, i))
  }

  return days
}

export function AnalisisGraderCalendarPage() {
  const { canSee } = usePermissionsStore()
  const navigate = useNavigate()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [uploads, setUploads] = useState<GraderUpload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<Record<string, SummaryState>>({})

  useEffect(() => {
    setLoading(true)
    setError(null)
    listGraderUploads()
      .then(setUploads)
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar uploads'))
      .finally(() => setLoading(false))
  }, [])

  const days = getDaysInMonth(currentMonth)

  const uploadsByDate = useMemo(() => {
    const map = new Map<string, GraderUpload[]>()
    for (const u of uploads) {
      const key = u.sessionDate || toDateKey(u.inferred?.startAt)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(u)
    }
    return map
  }, [uploads])

  const selectedKey = selectedDate ? selectedDate.toISOString().slice(0, 10) : null
  const selectedUploads = selectedKey ? uploadsByDate.get(selectedKey) || [] : []

  const turnos = useMemo(() => {
    const map = new Map<string, GraderUpload[]>()
    for (const u of selectedUploads) {
      const shift = u.shiftId || inferShiftId(u.inferred?.startAt)
      if (!map.has(shift)) map.set(shift, [])
      map.get(shift)!.push(u)
    }
    return map
  }, [selectedUploads])

  if (!canSee('analisisGrader')) {
    return <Navigate to="/" replace />
  }

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const handleLoadTurno = (dateKey: string, shiftId: string) => {
    navigate(`/analisis-grader?date=${dateKey}&shift=${encodeURIComponent(shiftId)}&autoload=1`)
  }

  const handleComputeSummary = async (dateKey: string, shiftId: string) => {
    const key = `${dateKey}::${shiftId}`
    if (summaries[key]?.loading) return

    setSummaries((prev) => ({
      ...prev,
      [key]: { loading: true, error: null },
    }))

    try {
      const turnoUploads = (uploadsByDate.get(dateKey) || []).filter((u) => {
        const shift = u.shiftId || inferShiftId(u.inferred?.startAt)
        return shift === shiftId
      })

      const parsed: Array<{ fileMeta: any; partialData: any }> = []
      for (const u of turnoUploads) {
        if (!u.fileMeta.downloadURL) continue
        const res = await fetch(u.fileMeta.downloadURL)
        const blob = await res.blob()
        const file = new File([blob], u.fileMeta.name, {
          type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        const result = await parseFile(file)
        parsed.push(result)
      }

      if (parsed.length === 0) {
        setSummaries((prev) => ({
          ...prev,
          [key]: { loading: false, error: 'No hay archivos con URL en Storage.' },
        }))
        return
      }

      const merged = mergeParsedData(parsed)
      const totalPieces = merged.pieceRecords.reduce((sum, r) => sum + r.pieces, 0)
      const pointZeroPieces = merged.gate0Records.reduce((sum, r) => sum + r.pieces, 0)
      const pointZeroPct = totalPieces > 0 ? Math.round((pointZeroPieces / totalPieces) * 10000) / 100 : 0

      setSummaries((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: null,
          data: {
            totalPieces,
            pointZeroPieces,
            pointZeroPct,
            startAt: merged.inferred.startAt,
            endAt: merged.inferred.endAt,
          },
        },
      }))
    } catch {
      setSummaries((prev) => ({
        ...prev,
        [key]: { loading: false, error: 'Error al generar resumen.' },
      }))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver a Analisis
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Calendario Grader
            </h1>
            <p className="text-xs text-muted-foreground">
              Archivos guardados por dia y turno
            </p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <Card className="border-red-300">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={handlePrevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-lg">
                  {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </CardTitle>
                <Button variant="outline" size="icon" onClick={handleNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {dayNames.map((day) => (
                  <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, index) => {
                  if (!day) return <div key={`empty-${index}`} className="h-20" />

                  const dayKey = day.toISOString().slice(0, 10)
                  const dayUploads = uploadsByDate.get(dayKey) || []
                  const turnosCount = new Set(dayUploads.map((u) => u.shiftId || inferShiftId(u.inferred?.startAt))).size

                  return (
                    <button
                      key={dayKey}
                      className={cn(
                        'h-20 p-2 border rounded-lg text-left transition-colors',
                        isToday(day) && 'bg-primary/5 border-primary',
                        selectedDate?.toDateString() === day.toDateString() && 'ring-2 ring-primary',
                      )}
                      onClick={() => setSelectedDate(day)}
                    >
                      <div className="flex items-center justify-between">
                        <span className={cn('text-sm font-medium', isToday(day) && 'text-primary')}>
                          {day.getDate()}
                        </span>
                        {dayUploads.length > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            {dayUploads.length}
                          </Badge>
                        )}
                      </div>
                      {dayUploads.length > 0 && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {turnosCount} turno(s)
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {selectedKey ? `Resumen ${selectedKey}` : 'Resumen diario'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedUploads.length === 0 && (
                <div className="text-sm text-muted-foreground">No hay archivos para este dia.</div>
              )}
              {selectedUploads.length > 0 && (
                <div className="space-y-3">
                  {Array.from(turnos.entries()).map(([shiftId, items]) => {
                    const key = `${selectedKey}::${shiftId}`
                    const summary = summaries[key]
                    const minStart = items
                      .map((i) => i.inferred?.startAt)
                      .filter(Boolean)
                      .sort()[0]
                    const maxEnd = items
                      .map((i) => i.inferred?.endAt)
                      .filter(Boolean)
                      .sort()
                      .slice(-1)[0]

                    return (
                      <div key={shiftId} className="border border-muted/60 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{shiftId}</p>
                            <p className="text-xs text-muted-foreground">
                              {items.length} archivo(s)
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleLoadTurno(selectedKey!, shiftId)}>
                              Cargar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleComputeSummary(selectedKey!, shiftId)}>
                              Resumen
                            </Button>
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {minStart && maxEnd
                            ? `${new Date(minStart).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} - ${new Date(maxEnd).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
                            : 'Horario no detectado'}
                        </div>

                        {summary?.loading && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Calculando resumen...
                          </div>
                        )}
                        {summary?.error && (
                          <div className="text-xs text-destructive">{summary.error}</div>
                        )}
                        {summary?.data && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2 rounded bg-muted/40">
                              <div className="text-muted-foreground">Piezas</div>
                              <div className="font-semibold">{summary.data.totalPieces.toLocaleString()}</div>
                            </div>
                            <div className="p-2 rounded bg-muted/40">
                              <div className="text-muted-foreground">P0 %</div>
                              <div className="font-semibold">{summary.data.pointZeroPct}%</div>
                            </div>
                            <div className="p-2 rounded bg-muted/40 col-span-2">
                              <div className="text-muted-foreground">P0 piezas</div>
                              <div className="font-semibold">{summary.data.pointZeroPieces.toLocaleString()}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
