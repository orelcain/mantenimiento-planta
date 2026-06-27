/**
 * QuickInterventionCapture — Captura Rápida de Intervención (Análisis de Turno · Fase 3).
 *
 * Para líneas SIN Grader/Shoplogix (Acopio, Riles): el técnico dicta por voz lo
 * que hizo/encontró → ✨ la IA limpia la transcripción → "Analizar con IA" sugiere
 * tipo de mantención, condición (1/2/3) y un título conciso → se guarda en la
 * colección `maintenanceLog` enriquecida con `plantLineId`/`shiftId`/`origen`.
 *
 * META de la app: cada intervención registrada es evidencia cuantificable de que
 * Mantención está interviniendo en el proceso. La tira de KPIs + el historial de
 * abajo demuestran esa actividad por área, y alimentan la Lente de Mantención.
 *
 * Captura a NIVEL DE ÁREA (decisión Orel 2026-06-25): no exige elegir un equipo.
 * `equipmentId` queda como sentinel `area:{plantLineId}` para satisfacer la regla
 * Firestore (equipmentId no vacío) sin colisionar con equipos reales.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Mic, Sparkles, Wand2, Wrench, ShieldCheck, Activity, Eye,
  Loader2, CheckCircle2, ClipboardList, AlertTriangle,
  Brain, TrendingUp, Lightbulb, Pencil, FileText,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Badge } from '@/components/ui'
import { SpeechTextarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import { useEquipmentForArea, type EquipmentDisplayNode } from '@/hooks/useEquipmentForArea'
import { EquipoCombobox, AREA_LEVEL, type ComboOption } from './EquipoCombobox'
import { InterventionEditDialog } from './InterventionEditDialog'
import {
  addMaintenanceLogEntry,
  getMaintenanceLogByPlantLine,
} from '@/services/maintenanceLog'
import {
  refineText,
  suggestInterventionFields,
  analyzeAreaInterventions,
  MIN_AREA_INTERVENTIONS,
  type InterventionTipo,
  type InterventionSeveridad,
  type AreaInsights,
} from '@/services/ai'
import type { PlantLineId } from '@/config/plantLines'
import type { MaintenanceLogEntry } from '@/types'

interface QuickInterventionCaptureProps {
  plantLineId: PlantLineId
  areaNodeId?: string
  areaLabel?: string
  className?: string
}

const TIPOS: { id: InterventionTipo; label: string; icon: typeof Wrench }[] = [
  { id: 'correctivo', label: 'Correctivo', icon: Wrench },
  { id: 'preventivo', label: 'Preventivo', icon: ShieldCheck },
  { id: 'predictivo', label: 'Predictivo', icon: Activity },
  { id: 'inspeccion', label: 'Inspección', icon: Eye },
]

const SEVERIDADES: { id: InterventionSeveridad; label: string; dot: string; active: string }[] = [
  { id: 'verde', label: 'Cond. 1 · OK', dot: 'bg-emerald-500', active: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' },
  { id: 'amarillo', label: 'Cond. 2 · Atención', dot: 'bg-amber-500', active: 'border-amber-500/50 bg-amber-500/10 text-amber-300' },
  { id: 'rojo', label: 'Cond. 3 · Crítico', dot: 'bg-red-500', active: 'border-red-500/50 bg-red-500/10 text-red-300' },
]

const TIPO_LABEL: Record<string, string> = {
  correctivo: 'Correctivo', preventivo: 'Preventivo', predictivo: 'Predictivo',
  inspeccion: 'Inspección', termografia: 'Termografía', medicion: 'Medición',
}
const SEV_DOT: Record<string, string> = { verde: 'bg-emerald-500', amarillo: 'bg-amber-500', rojo: 'bg-red-500' }

const RIESGO_STYLE: Record<AreaInsights['riesgo'], { label: string; cls: string }> = {
  bajo: { label: 'Riesgo bajo', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  medio: { label: 'Riesgo medio', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
  alto: { label: 'Riesgo alto', cls: 'border-orange-500/40 bg-orange-500/10 text-orange-300' },
  critico: { label: 'Riesgo crítico', cls: 'border-red-500/40 bg-red-500/10 text-red-300' },
}

/** Turno best-effort por hora local (las líneas manuales no tienen schedule Grader). */
function currentShiftId(): string {
  const h = new Date().getHours()
  return h >= 7 && h < 19 ? 'Turno día' : 'Turno noche'
}

function fmtFecha(d: Date): string {
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

/** Aplana el árbol de equipos del área a una lista para el combobox (con sangría por nivel). */
function flattenEquipos(
  nodes: EquipmentDisplayNode[],
  depth = 0,
  acc: ComboOption[] = [],
): ComboOption[] {
  for (const n of nodes) {
    if (n.oculto) continue
    const prefix = depth > 0 ? '· '.repeat(depth) : ''
    // El alias (apodo de planta, ej. "C1") va en el label → buscable y visible.
    const alias = n.alias ? ` · ${n.alias}` : ''
    acc.push({ id: n.id, label: `${prefix}${n.nombre}${n.codigo ? ` (${n.codigo})` : ''}${alias}` })
    if (n.children?.length) flattenEquipos(n.children, depth + 1, acc)
  }
  return acc
}

export function QuickInterventionCapture({
  plantLineId, areaNodeId, areaLabel, className,
}: QuickInterventionCaptureProps) {
  const user = useAuthStore((s) => s.user)

  const [hallazgo, setHallazgo] = useState('')
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<InterventionTipo>('correctivo')
  const [severidad, setSeveridad] = useState<InterventionSeveridad>('amarillo')
  const [selectedEquipoId, setSelectedEquipoId] = useState<string>(AREA_LEVEL)
  const [sapAviso, setSapAviso] = useState('')
  const [sapOrden, setSapOrden] = useState('')
  const isAdmin = user?.rol === 'admin'

  // Equipos del área (Fase 3b) — solo si la línea tiene `areaNodeId` linkeado.
  const { equipment, loading: loadingEquip } = useEquipmentForArea(areaNodeId ?? null)
  const flatEquipos = useMemo(() => flattenEquipos(equipment), [equipment])
  const equipoLabelById = useMemo(
    () => new Map(flatEquipos.map((e) => [e.id, e.label])),
    [flatEquipos],
  )
  // Opciones del combobox: "Área general" + equipos del área.
  const equipoOptions = useMemo<ComboOption[]>(
    () => [{ id: AREA_LEVEL, label: 'Área general (sin equipo específico)' }, ...flatEquipos],
    [flatEquipos],
  )

  // Edición de una intervención existente (modal).
  const [editingEntry, setEditingEntry] = useState<MaintenanceLogEntry | null>(null)

  const [refining, setRefining] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [entries, setEntries] = useState<MaintenanceLogEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)

  // Análisis IA del área (Fase 3b)
  const [insights, setInsights] = useState<AreaInsights | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)

  const loadEntries = useCallback(async () => {
    setLoadingEntries(true)
    try {
      setEntries(await getMaintenanceLogByPlantLine(plantLineId))
      setInsights(null)        // invalidar análisis previo: los datos cambiaron
      setInsightsError(null)
    } catch {
      setEntries([])
    } finally {
      setLoadingEntries(false)
    }
  }, [plantLineId])

  useEffect(() => { loadEntries() }, [loadEntries])

  // KPI del mes en curso — la evidencia cuantificable de actividad de Mantención.
  const kpi = useMemo(() => {
    const now = new Date()
    const mes = entries.filter(
      (e) => e.fecha.getMonth() === now.getMonth() && e.fecha.getFullYear() === now.getFullYear(),
    )
    const porTipo = mes.reduce<Record<string, number>>((acc, e) => {
      acc[e.tipo] = (acc[e.tipo] ?? 0) + 1
      return acc
    }, {})
    return { totalMes: mes.length, totalAll: entries.length, porTipo }
  }, [entries])

  const canRunAreaAnalysis = entries.length >= MIN_AREA_INTERVENTIONS

  const handleAnalyzeArea = useCallback(async () => {
    if (!canRunAreaAnalysis) return
    setAnalyzing(true)
    setInsightsError(null)
    try {
      const res = await analyzeAreaInterventions(
        entries.map((e) => ({
          fecha: e.fecha, tipo: e.tipo, severidad: e.severidad, hallazgo: e.hallazgo, tecnico: e.tecnico,
        })),
        areaLabel ?? plantLineId,
      )
      if (res) setInsights(res)
      else setInsightsError('No se pudo generar el análisis. Intentá de nuevo.')
    } catch (err) {
      setInsightsError(err instanceof Error ? err.message : 'Error al analizar.')
    } finally {
      setAnalyzing(false)
    }
  }, [canRunAreaAnalysis, entries, areaLabel, plantLineId])

  const canAnalyze = hallazgo.trim().length >= 8

  const handleRefine = useCallback(async () => {
    if (!canAnalyze) return
    setRefining(true)
    try {
      setHallazgo(await refineText(hallazgo, true))
    } finally {
      setRefining(false)
    }
  }, [hallazgo, canAnalyze])

  const handleSuggest = useCallback(async () => {
    if (!canAnalyze) return
    setSuggesting(true)
    try {
      const s = await suggestInterventionFields(hallazgo)
      if (s) {
        setTitulo(s.titulo)
        setTipo(s.tipo)
        setSeveridad(s.severidad)
      }
    } finally {
      setSuggesting(false)
    }
  }, [hallazgo, canAnalyze])

  const handleSave = useCallback(async () => {
    if (hallazgo.trim().length < 3) {
      setError('Describe la intervención (dictado o texto) antes de guardar.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const tecnico = user ? `${user.nombre} ${user.apellido}`.trim() : undefined
      const hallazgoFinal = titulo.trim()
        ? `${titulo.trim()} — ${hallazgo.trim()}`
        : hallazgo.trim()
      // Si se eligió un equipo concreto, la entrada se referencia a ese equipo
      // (aparece en su expediente CTD); si no, queda a nivel de área (sentinel).
      const isEquip = selectedEquipoId !== AREA_LEVEL
      await addMaintenanceLogEntry({
        equipmentId: isEquip ? selectedEquipoId : `area:${plantLineId}`,
        hierarchyNodeId: isEquip ? selectedEquipoId : undefined,
        fecha: new Date(),
        tipo,
        severidad,
        hallazgo: hallazgoFinal,
        tecnico,
        plantLineId,
        areaNodeId,
        shiftId: currentShiftId(),
        origen: 'captura_rapida',
        sapAviso: sapAviso.trim() || undefined,
        sapOrden: sapOrden.trim() || undefined,
      })
      // Reset y feedback
      setHallazgo('')
      setTitulo('')
      setTipo('correctivo')
      setSeveridad('amarillo')
      setSelectedEquipoId(AREA_LEVEL)
      setSapAviso('')
      setSapOrden('')
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 3500)
      await loadEntries()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la intervención.')
    } finally {
      setSaving(false)
    }
  }, [hallazgo, titulo, tipo, severidad, selectedEquipoId, sapAviso, sapOrden, user, plantLineId, areaNodeId, loadEntries])

  const busy = refining || suggesting

  return (
    <div className={cn('space-y-4', className)}>
      {/* ── Panel de captura ── */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" />
            Captura Rápida de Intervención
            {areaLabel && (
              <Badge variant="outline" className="ml-1 text-[10px] font-normal text-muted-foreground border-border/50">
                {areaLabel}
              </Badge>
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Dictá lo que hiciste o encontraste. Cada registro es evidencia de que Mantención intervino en esta área.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <SpeechTextarea
            value={hallazgo}
            onChange={(e) => setHallazgo(e.target.value)}
            placeholder="Ej: Cambié el rodamiento de la bomba de acopio, estaba con ruido y vibración…"
            rows={3}
            className="text-sm bg-background/60"
          />

          {/* Acciones de IA */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button" size="sm" variant="outline"
              disabled={!canAnalyze || busy}
              onClick={handleRefine}
              className="border-sky-500/30 text-sky-300 hover:bg-sky-500/10"
              title="Corrige la transcripción de voz (errores fonéticos, muletillas)"
            >
              {refining ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
              Limpiar dictado
            </Button>
            <Button
              type="button" size="sm" variant="outline"
              disabled={!canAnalyze || busy}
              onClick={handleSuggest}
              className="border-primary/30 text-primary hover:bg-primary/10"
              title="La IA sugiere tipo, condición y un título conciso"
            >
              {suggesting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              Analizar con IA
            </Button>
          </div>

          {/* Título (sugerido / editable) */}
          {(titulo || suggesting) && (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Título</label>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Título técnico conciso"
                className="text-sm bg-background/60"
              />
            </div>
          )}

          {/* Equipo del área (opcional, con buscador) — solo si la línea tiene areaNodeId */}
          {areaNodeId && (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Equipo <span className="text-muted-foreground/60">(opcional)</span>
              </label>
              <EquipoCombobox
                options={equipoOptions}
                value={selectedEquipoId}
                onChange={setSelectedEquipoId}
                placeholder="Área general · escribí para buscar equipo…"
              />
              {loadingEquip && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Cargando equipos del área…
                </p>
              )}
            </div>
          )}

          {/* Tipo de mantención */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Tipo de mantención</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {TIPOS.map((t) => {
                const Icon = t.icon
                const active = tipo === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTipo(t.id)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 px-2 py-2 rounded-md border text-xs font-medium transition-colors',
                      active
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border bg-background/40 text-muted-foreground hover:text-foreground hover:bg-muted/40',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Condición / severidad */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Condición resultante</label>
            <div className="grid grid-cols-3 gap-1.5">
              {SEVERIDADES.map((s) => {
                const active = severidad === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSeveridad(s.id)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 px-2 py-2 rounded-md border text-xs font-medium transition-colors',
                      active ? s.active : 'border-border bg-background/40 text-muted-foreground hover:text-foreground hover:bg-muted/40',
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full shrink-0', s.dot)} />
                    {s.label}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Estado en que queda u observás el equipo (vale para cualquier tipo · NFPA 70B Cap. 9):
              {' '}🟢 <b>1</b> como nuevo, sin alertas ·{' '}🟡 <b>2</b> con desvíos, requiere seguimiento ·{' '}🔴 <b>3</b> acción correctiva inmediata / fuera de servicio.
            </p>
          </div>

          {/* Trazabilidad SAP (opcional) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" /> SAP <span className="text-muted-foreground/60">(opcional — si lo dejás vacío queda "SAP pendiente")</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Input value={sapAviso} onChange={(e) => setSapAviso(e.target.value)} placeholder="N° Aviso" className="text-sm bg-background/60" inputMode="numeric" />
              <Input value={sapOrden} onChange={(e) => setSapOrden(e.target.value)} placeholder="N° Orden (OT)" className="text-sm bg-background/60" inputMode="numeric" />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2.5 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="break-words">{error}</span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || hallazgo.trim().length < 3}
              className="bg-primary hover:bg-primary/90"
            >
              {saving
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Guardando…</>
                : <><CheckCircle2 className="h-4 w-4 mr-1.5" />Registrar intervención</>}
            </Button>
            {justSaved && (
              <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Registrada
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── KPI + historial ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Intervenciones del área
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Tira de KPIs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5">
              <span className="text-lg font-bold text-primary tabular-nums">{kpi.totalMes}</span>
              <span className="text-[11px] text-muted-foreground ml-1.5">este mes</span>
            </div>
            {TIPOS.map((t) => kpi.porTipo[t.id] ? (
              <Badge key={t.id} variant="outline" className="text-[10px] font-normal text-muted-foreground border-border/50">
                {t.label}: <b className="text-foreground ml-1">{kpi.porTipo[t.id]}</b>
              </Badge>
            ) : null)}
            {kpi.totalAll > kpi.totalMes && (
              <span className="text-[11px] text-muted-foreground">· {kpi.totalAll} histórico</span>
            )}
          </div>

          {/* Lista reciente */}
          {loadingEntries ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
            </div>
          ) : entries.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">
              Aún no hay intervenciones registradas en esta área. La primera captura aparecerá aquí.
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {entries.slice(0, 25).map((e) => {
                const equipoLabel = e.equipmentId && !e.equipmentId.startsWith('area:')
                  ? (equipoLabelById.get(e.equipmentId) ?? 'Equipo')
                  : null
                return (
                <li key={e.id} className="flex items-start gap-2.5 rounded-md border border-border/40 bg-background/40 px-2.5 py-2">
                  <span className={cn('h-2 w-2 rounded-full shrink-0 mt-1.5', SEV_DOT[e.severidad] ?? 'bg-muted')} />
                  <div className="min-w-0 flex-1">
                    {equipoLabel && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-primary/90 mb-0.5">
                        <Wrench className="h-2.5 w-2.5" /> {equipoLabel}
                      </span>
                    )}
                    <p className="text-xs text-foreground break-words">{e.hallazgo}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5">
                      <span className="uppercase tracking-wide">{TIPO_LABEL[e.tipo] ?? e.tipo}</span>
                      <span>·</span>
                      <span>{fmtFecha(e.fecha)}</span>
                      {e.tecnico && (<><span>·</span><span>{e.tecnico}</span></>)}
                      {e.shiftId && (<><span>·</span><span>{e.shiftId}</span></>)}
                    </p>
                    {/* SAP */}
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {e.sapOrden
                        ? <Badge variant="outline" className="text-[9px] text-sky-300 border-sky-500/40">OT {e.sapOrden}</Badge>
                        : <Badge variant="outline" className="text-[9px] text-amber-300 border-amber-500/40">SAP pendiente</Badge>}
                      {e.sapAviso && <Badge variant="outline" className="text-[9px] text-muted-foreground border-border/50">Aviso {e.sapAviso}</Badge>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingEntry(e)}
                    title="Editar intervención"
                    className="shrink-0 p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Análisis IA + predictivo del área (Fase 3b) ── */}
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Análisis IA del área
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            La IA lee el historial de intervenciones y detecta patrones, riesgo y la próxima acción preventiva — de "registramos" a "optimizamos".
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canRunAreaAnalysis ? (
            <p className="text-xs text-muted-foreground py-2 text-center">
              El análisis se activa con <b>{MIN_AREA_INTERVENTIONS}+</b> intervenciones registradas en esta área
              {entries.length > 0 && ` (llevás ${entries.length})`}.
            </p>
          ) : (
            <>
              <Button
                type="button" size="sm" variant="outline"
                disabled={analyzing}
                onClick={handleAnalyzeArea}
                className="border-primary/30 text-primary hover:bg-primary/10"
              >
                {analyzing
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Analizando {entries.length} intervenciones…</>
                  : <><TrendingUp className="h-3.5 w-3.5 mr-1.5" />{insights ? 'Re-analizar tendencia' : 'Analizar tendencia'}</>}
              </Button>

              {insightsError && (
                <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2.5 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="break-words">{insightsError}</span>
                </div>
              )}

              {insights && (
                <div className="space-y-3 pt-1">
                  {/* Riesgo + resumen */}
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold', RIESGO_STYLE[insights.riesgo].cls)}>
                      <Activity className="h-3 w-3" />
                      {RIESGO_STYLE[insights.riesgo].label}
                    </span>
                    {insights.confianza != null && (
                      <span className="text-[10px] text-muted-foreground self-center">
                        confianza {Math.round(insights.confianza * 100)}%
                      </span>
                    )}
                  </div>
                  {insights.resumen && (
                    <p className="text-xs text-foreground/90 leading-relaxed">{insights.resumen}</p>
                  )}

                  {/* Patrones recurrentes */}
                  {insights.patrones.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground">Patrones recurrentes</p>
                      {insights.patrones.map((p, i) => (
                        <div key={i} className="rounded-md border border-border/40 bg-background/40 px-2.5 py-2">
                          <p className="text-xs text-foreground flex items-start gap-1.5">
                            <span className="text-amber-400 font-semibold tabular-nums shrink-0">×{p.frecuencia}</span>
                            <span className="break-words">{p.descripcion}</span>
                          </p>
                          {p.recomendacion && (
                            <p className="text-[11px] text-emerald-300/80 mt-1 flex items-start gap-1">
                              <Lightbulb className="h-3 w-3 shrink-0 mt-0.5" />
                              <span className="break-words">{p.recomendacion}</span>
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Equipos a vigilar */}
                  {insights.equiposAVigilar.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">Equipos / componentes a vigilar</p>
                      <div className="flex flex-wrap gap-1.5">
                        {insights.equiposAVigilar.map((eq, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] font-normal text-amber-300 border-amber-500/30">
                            {eq}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Próxima acción preventiva */}
                  {insights.proximaAccion && (
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2">
                      <p className="text-[11px] font-medium text-primary flex items-center gap-1.5">
                        <Lightbulb className="h-3.5 w-3.5" /> Próxima acción preventiva (RCM)
                      </p>
                      <p className="text-xs text-foreground/90 mt-1 break-words">{insights.proximaAccion}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal de edición de intervención */}
      <InterventionEditDialog
        entry={editingEntry}
        plantLineId={plantLineId}
        equipoOptions={equipoOptions}
        isAdmin={isAdmin}
        onClose={() => setEditingEntry(null)}
        onSaved={() => { setEditingEntry(null); void loadEntries() }}
      />
    </div>
  )
}
