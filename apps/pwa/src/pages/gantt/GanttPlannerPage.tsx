import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, Calendar, GripVertical, Plus, Search, Trash2, ZoomIn, ZoomOut,
} from 'lucide-react'
import {
  Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, Textarea,
} from '@/components/ui'
import { useCan } from '@/store'
import {
  calculateCPM, createGanttTask, deleteGanttTask, getGanttProjects,
  getGanttTasks, updateGanttTask,
} from '@/services/gantt'
import type { GanttCPMResult, GanttProject, GanttTask, GanttTaskStatus } from '@/types'

// ─── Constantes ──────────────────────────────────────────────────────
type ZoomLevel = 'day' | 'week' | 'month'
const ZOOM_COL: Record<ZoomLevel, number> = { day: 40, week: 100, month: 200 }
const MS_DAY = 86_400_000

const STATUS_COLORS: Record<GanttTaskStatus, string> = {
  planificada: 'bg-primary/[0.15]',
  en_progreso: 'bg-amber-500/[0.15]',
  bloqueada: 'bg-red-500/[0.15]',
  completada: 'bg-emerald-500/[0.15]',
}
const STATUS_LABELS: Record<GanttTaskStatus, string> = {
  planificada: 'Planificada',
  en_progreso: 'En Progreso',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
}

const ROW_H = 40
const HEADER_H = 48

function fmtDate(d: Date) {
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}
function toInput(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// ─── Componente principal ────────────────────────────────────────────
export function GanttPlannerPage() {
  const canEdit = useCan('gantt', 'editar')
  const canCreate = useCan('gantt', 'crear')
  const canDelete = useCan('gantt', 'eliminar')

  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [projects, setProjects] = useState<GanttProject[]>([])
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState<ZoomLevel>('week')
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [editTask, setEditTask] = useState<GanttTask | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [splitterX, setSplitterX] = useState(() => {
    const saved = localStorage.getItem('gantt-splitter-x')
    return saved ? Math.max(200, Math.min(700, Number(saved))) : 420
  })

  useEffect(() => {
    try { localStorage.setItem('gantt-splitter-x', String(splitterX)) } catch { /* storage full */ }
  }, [splitterX])

  // CPM
  const cpm = useMemo<GanttCPMResult>(() => calculateCPM(tasks), [tasks])
  const criticalSet = useMemo(() => new Set(cpm.criticalPath), [cpm])

  // ─── Data loading ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, p] = await Promise.all([getGanttTasks(), getGanttProjects()])
      setTasks(t)
      setProjects(p)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ─── Filters ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return tasks
    const q = search.toLowerCase()
    return tasks.filter(
      (t) =>
        t.titulo.toLowerCase().includes(q) ||
        t.equipmentNombre?.toLowerCase().includes(q) ||
        t.responsibleName?.toLowerCase().includes(q) ||
        t.projectName?.toLowerCase().includes(q),
    )
  }, [tasks, search])

  // ─── Timeline range ────────────────────────────────────────────────
  const { rangeStart, rangeEnd, colWidth, columns } = useMemo(() => {
    const now = new Date()
    let minD = new Date(now.getFullYear(), now.getMonth(), 1)
    let maxD = new Date(now.getFullYear(), now.getMonth() + 3, 0)

    filtered.forEach((t) => {
      if (t.startDate < minD) minD = new Date(t.startDate)
      if (t.endDate > maxD) maxD = new Date(t.endDate)
    })

    // Padding
    minD = new Date(minD.getTime() - 7 * MS_DAY)
    maxD = new Date(maxD.getTime() + 7 * MS_DAY)

    const cw = ZOOM_COL[zoom]
    const cols: { label: string; date: Date }[] = []
    const cur = new Date(minD)

    if (zoom === 'day') {
      while (cur <= maxD) {
        cols.push({ label: fmtDate(cur), date: new Date(cur) })
        cur.setDate(cur.getDate() + 1)
      }
    } else if (zoom === 'week') {
      cur.setDate(cur.getDate() - cur.getDay() + 1) // lunes
      while (cur <= maxD) {
        cols.push({ label: `Sem ${fmtDate(cur)}`, date: new Date(cur) })
        cur.setDate(cur.getDate() + 7)
      }
    } else {
      cur.setDate(1)
      while (cur <= maxD) {
        cols.push({
          label: cur.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }),
          date: new Date(cur),
        })
        cur.setMonth(cur.getMonth() + 1)
      }
    }

    return { rangeStart: minD, rangeEnd: maxD, colWidth: cw, columns: cols }
  }, [filtered, zoom])

  const totalTimelineW = columns.length * colWidth
  const rangeDuration = rangeEnd.getTime() - rangeStart.getTime()

  function dateToX(d: Date) {
    return ((d.getTime() - rangeStart.getTime()) / rangeDuration) * totalTimelineW
  }

  // ─── Today marker ─────────────────────────────────────────────────
  const todayX = dateToX(new Date())

  // ─── Splitter drag ─────────────────────────────────────────────────
  const dragging = useRef(false)
  function onSplitterDown(e: React.MouseEvent) {
    e.preventDefault()
    dragging.current = true
    const startX = e.clientX
    const startW = splitterX
    function onMove(ev: MouseEvent) {
      if (!dragging.current) return
      const dx = ev.clientX - startX
      setSplitterX(Math.max(200, Math.min(700, startW + dx)))
    }
    function onUp() {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // ─── Scroll sync ──────────────────────────────────────────────────
  const tableBodyRef = useRef<HTMLDivElement>(null)
  const timelineBodyRef = useRef<HTMLDivElement>(null)
  const timelineWrapRef = useRef<HTMLDivElement>(null)

  function syncScroll(src: 'table' | 'timeline') {
    const tb = tableBodyRef.current
    const tl = timelineBodyRef.current
    if (!tb || !tl) return
    if (src === 'table') tl.scrollTop = tb.scrollTop
    else tb.scrollTop = tl.scrollTop
  }

  // Scroll to today on first load
  useEffect(() => {
    if (!loading && timelineWrapRef.current && totalTimelineW > 0) {
      const container = timelineWrapRef.current
      const scrollTo = Math.max(0, todayX - container.clientWidth / 3)
      container.scrollLeft = scrollTo
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // ─── Actions ───────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    await deleteGanttTask(id)
    setDeleteConfirm(null)
    await load()
  }

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar tarea, equipo, responsable..."
            value={search}
            onChange={(e) => {
                const v = e.target.value
                setSearch(v)
                setSearchParams(p => { if (v) p.set('q', v); else p.delete('q'); return p }, { replace: true })
              }}
          />
        </div>
        <div className="flex items-center gap-1 border rounded-ctl px-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom('day')} title="Día">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium px-2 select-none">
            {zoom === 'day' ? 'Día' : zoom === 'week' ? 'Semana' : 'Mes'}
          </span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom('month')} title="Mes">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          {(['day', 'week', 'month'] as ZoomLevel[]).map((z) => (
            <Button
              key={z}
              size="sm"
              variant={zoom === z ? 'default' : 'ghost'}
              className="h-7 text-xs px-2"
              onClick={() => setZoom(z)}
            >
              {z === 'day' ? 'D' : z === 'week' ? 'S' : 'M'}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (timelineWrapRef.current) {
              timelineWrapRef.current.scrollLeft = Math.max(0, todayX - timelineWrapRef.current.clientWidth / 3)
            }
          }}
        >
          <Calendar className="h-4 w-4 mr-1" /> Hoy
        </Button>
        {canCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nueva tarea
          </Button>
        )}
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">{filtered.length} tareas</Badge>
        <Badge variant="outline" className="bg-emerald-500/[0.15] text-ink-ok border-emerald-500/[0.25]">
          {filtered.filter((t) => t.status === 'completada').length} completadas
        </Badge>
        <Badge variant="outline" className="bg-amber-500/[0.15] text-ink-warn border-amber-500/[0.25]">
          {filtered.filter((t) => t.status === 'en_progreso').length} en progreso
        </Badge>
        <Badge variant="outline" className="bg-red-500/[0.15] text-ink-crit border-red-500/[0.25]">
          {cpm.criticalPath.length} ruta crítica
        </Badge>
      </div>

      {loading ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Cargando planificador...</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {tasks.length === 0
              ? 'No hay tareas Gantt. Crea la primera tarea para comenzar.'
              : 'Sin resultados para la búsqueda.'}
          </CardContent>
        </Card>
      ) : (
        /* Main split view */
        <div className="border rounded-card overflow-hidden bg-card" style={{ height: Math.min(700, HEADER_H + filtered.length * ROW_H + 2) }}>
          <div className="flex h-full">
            {/* ─── LEFT TABLE ─────────────────────────────────── */}
            <div style={{ width: splitterX, minWidth: 200 }} className="flex flex-col border-r bg-[var(--panel-surface)] dark:bg-transparent">
              {/* Table header */}
              <div className="flex items-center text-xs font-semibold text-muted-foreground border-b bg-muted/50 select-none"
                style={{ height: HEADER_H }}>
                <span className="flex-1 px-3">Tarea</span>
                <span className="w-24 text-center">Estado</span>
                <span className="w-14 text-center">%</span>
              </div>
              {/* Table body */}
              <div
                ref={tableBodyRef}
                className="flex-1 overflow-y-auto overflow-x-hidden"
                onScroll={() => syncScroll('table')}
              >
                {filtered.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center border-b text-xs hover:bg-muted/30 cursor-pointer transition-colors ${
                      criticalSet.has(task.id) ? 'bg-red-500/[0.15]' : ''
                    }`}
                    style={{ height: ROW_H }}
                    onClick={() => setEditTask(task)}
                  >
                    <div className="flex-1 px-3 truncate flex items-center gap-1.5">
                      {criticalSet.has(task.id) && <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />}
                      <span className="truncate font-medium">{task.titulo}</span>
                    </div>
                    <div className="w-24 text-center">
                      <Badge
                        variant={task.status === 'completada' ? 'success' : task.status === 'bloqueada' ? 'destructive' : 'outline'}
                        className="text-caption px-1.5 py-0"
                      >
                        {STATUS_LABELS[task.status]}
                      </Badge>
                    </div>
                    <div className="w-14 text-center tabular-nums">{task.progress}%</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ─── SPLITTER ───────────────────────────────────── */}
            <div
              className="w-1.5 bg-border hover:bg-primary/50 cursor-col-resize flex items-center justify-center shrink-0 select-none"
              onMouseDown={onSplitterDown}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* ─── RIGHT TIMELINE ─────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Timeline scrollable area */}
              <div
                ref={timelineWrapRef}
                className="overflow-x-auto flex-1"
              >
                <div style={{ width: totalTimelineW, minHeight: '100%' }} className="relative">
                  {/* Header columns */}
                  <div className="flex border-b bg-muted/50 sticky top-0 z-10" style={{ height: HEADER_H }}>
                    {columns.map((col, i) => (
                      <div
                        key={i}
                        className="text-caption text-muted-foreground border-r flex items-center justify-center select-none shrink-0"
                        style={{ width: colWidth }}
                      >
                        {col.label}
                      </div>
                    ))}
                  </div>

                  {/* Body area */}
                  <div ref={timelineBodyRef} onScroll={() => syncScroll('timeline')}>
                    {/* Grid lines */}
                    {columns.map((_, i) => (
                      <div
                        key={i}
                        className="absolute border-r border-border/30"
                        style={{
                          left: i * colWidth,
                          top: HEADER_H,
                          width: 1,
                          height: filtered.length * ROW_H,
                        }}
                      />
                    ))}

                    {/* Today line */}
                    {todayX >= 0 && todayX <= totalTimelineW && (
                      <div
                        className="absolute z-20"
                        style={{ left: todayX, top: 0, width: 2, height: HEADER_H + filtered.length * ROW_H }}
                      >
                        <div className="w-0.5 h-full bg-primary" />
                        <div className="absolute -top-0 -left-2 bg-primary text-primary-foreground text-caption px-1 rounded-b font-semibold">
                          Hoy
                        </div>
                      </div>
                    )}

                    {/* Task bars */}
                    {filtered.map((task, idx) => {
                      const left = dateToX(task.startDate)
                      const right = dateToX(task.endDate)
                      const barW = Math.max(right - left, 8)
                      const top = HEADER_H + idx * ROW_H + 8
                      const barH = ROW_H - 16
                      const isCritical = criticalSet.has(task.id)

                      return (
                        <div key={task.id}>
                          {/* Background row stripe */}
                          <div
                            className={`absolute w-full ${idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/40'}`}
                            style={{ top: HEADER_H + idx * ROW_H, height: ROW_H }}
                          />

                          {/* Baseline bar */}
                          {task.baselineStartDate && task.baselineEndDate && (
                            <div
                              className="absolute rounded-ctl bg-muted-foreground/20"
                              style={{
                                left: dateToX(task.baselineStartDate),
                                width: Math.max(dateToX(task.baselineEndDate) - dateToX(task.baselineStartDate), 4),
                                top: top + barH - 3,
                                height: 3,
                              }}
                            />
                          )}

                          {/* Main bar */}
                          <div
                            className={`absolute rounded-ctl cursor-pointer transition-all hover:brightness-110 ${
                              isCritical ? 'ring-1 ring-red-400' : ''
                            } ${STATUS_COLORS[task.status]}`}
                            style={{ left, width: barW, top, height: barH }}
                            title={`${task.titulo} (${task.progress}%)`}
                            onClick={() => setEditTask(task)}
                          >
                            {/* Progress fill */}
                            <div
                              className="absolute inset-0 rounded-ctl bg-white/20"
                              style={{ width: `${task.progress}%` }}
                            />
                            {/* Label */}
                            {barW > 60 && (
                              <span className="absolute inset-0 flex items-center px-2 text-caption font-medium text-white truncate">
                                {task.titulo}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── EDIT TASK DIALOG ─────────────────────────────────────── */}
      {editTask && (
        <TaskDialog
          task={editTask}
          canEdit={canEdit}
          canDelete={canDelete}
          onClose={() => setEditTask(null)}
          onSave={async (patch) => {
            await updateGanttTask(editTask.id, patch)
            setEditTask(null)
            await load()
          }}
          onDelete={() => setDeleteConfirm(editTask.id)}
        />
      )}

      {/* ─── CREATE TASK DIALOG ───────────────────────────────────── */}
      {showCreate && (
        <CreateTaskDialog
          projects={projects}
          onClose={() => setShowCreate(false)}
          onSave={async (data) => {
            await createGanttTask(data)
            setShowCreate(false)
            await load()
          }}
        />
      )}

      {/* ─── DELETE CONFIRM ───────────────────────────────────────── */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar esta tarea?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Task Edit Dialog ────────────────────────────────────────────────
function TaskDialog({
  task, canEdit, canDelete, onClose, onSave, onDelete,
}: {
  task: GanttTask
  canEdit: boolean
  canDelete: boolean
  onClose: () => void
  onSave: (patch: Partial<GanttTask>) => Promise<void>
  onDelete: () => void
}) {
  const [titulo, setTitulo] = useState(task.titulo)
  const [descripcion, setDescripcion] = useState(task.descripcion ?? '')
  const [status, setStatus] = useState<GanttTaskStatus>(task.status)
  const [progress, setProgress] = useState(task.progress)
  const [startDate, setStartDate] = useState(toInput(task.startDate))
  const [endDate, setEndDate] = useState(toInput(task.endDate))
  const [saving, setSaving] = useState(false)

  const dateError = startDate && endDate && startDate > endDate
    ? 'La fecha de inicio no puede ser posterior a la fecha de fin'
    : null

  async function handleSave() {
    if (dateError) return
    setSaving(true)
    try {
      await onSave({
        titulo,
        descripcion: descripcion || undefined,
        status,
        progress: status === 'completada' ? 100 : progress,
        startDate: new Date(startDate + 'T08:00:00'),
        endDate: new Date(endDate + 'T17:00:00'),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar tarea</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={!canEdit} />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={!canEdit} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Estado</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as GanttTaskStatus)} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planificada">Planificada</SelectItem>
                  <SelectItem value="en_progreso">En Progreso</SelectItem>
                  <SelectItem value="bloqueada">Bloqueada</SelectItem>
                  <SelectItem value="completada">Completada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Progreso ({progress}%)</Label>
              <Input
                type="range" min={0} max={100} step={5}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                disabled={!canEdit}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Inicio</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!canEdit} className={dateError ? 'border-red-500' : ''} />
            </div>
            <div>
              <Label>Fin</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!canEdit} className={dateError ? 'border-red-500' : ''} />
            </div>
          </div>
          {dateError && <p className="text-xs text-red-500">{dateError}</p>}
          {/* Info */}
          <div className="text-xs text-muted-foreground space-y-0.5">
            {task.responsibleName && <p>Responsable: {task.responsibleName}</p>}
            {task.equipmentNombre && <p>Equipo: {task.equipmentNombre}</p>}
            {task.projectName && <p>Proyecto: {task.projectName}</p>}
            <p>Horas estimadas: {task.estimatedHours}h</p>
            {task.dependencies.length > 0 && <p>Dependencias: {task.dependencies.length}</p>}
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          <div>
            {canDelete && (
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            {canEdit && (
              <Button onClick={handleSave} disabled={saving || !titulo.trim() || !!dateError}>
                {saving ? 'Guardando...' : 'Guardar'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Create Task Dialog ──────────────────────────────────────────────
function CreateTaskDialog({
  projects, onClose, onSave,
}: {
  projects: GanttProject[]
  onClose: () => void
  onSave: (data: Omit<GanttTask, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
}) {
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [projectId, setProjectId] = useState('')
  const [prioridad, setPrioridad] = useState<'baja' | 'media' | 'alta' | 'critica'>('media')
  const [startDate, setStartDate] = useState(toInput(new Date()))
  const [endDate, setEndDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return toInput(d)
  })
  const [estimatedHours, setEstimatedHours] = useState(8)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const project = projects.find((p) => p.id === projectId)
      await onSave({
        titulo,
        descripcion: descripcion || undefined,
        projectId: projectId || undefined,
        projectName: project?.name,
        status: 'planificada',
        prioridad,
        startDate: new Date(startDate + 'T08:00:00'),
        endDate: new Date(endDate + 'T17:00:00'),
        progress: 0,
        estimatedHours,
        dependencies: [],
        createdBy: 'current-user',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva tarea Gantt</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Mantención preventiva Baader 142" />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Proyecto</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Sin proyecto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin proyecto</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridad</Label>
              <Select value={prioridad} onValueChange={(v) => setPrioridad(v as typeof prioridad)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baja">Baja</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha inicio</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Fecha fin</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Horas estimadas</Label>
            <Input type="number" min={1} value={estimatedHours} onChange={(e) => setEstimatedHours(Number(e.target.value))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !titulo.trim()}>
            {saving ? 'Creando...' : 'Crear tarea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
