/**
 * Página principal de Análisis Grader — flujo simplificado.
 *
 * Página única (sin stepper):
 *  1. Upload de archivos (siempre visible)
 *  2. Configuración de gates (colapsable)
 *  3. Alertas + Dashboard (aparecen automáticamente al cargar archivos)
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, Button, Badge } from '@/components/ui'
import { Settings2, BarChart3, FolderOpen, Calendar, Loader2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from 'lucide-react'
import { useAuthStore, usePermissionsStore } from '@/store'
import { AnalisisGraderUploadPage, type FileParsed } from './AnalisisGraderUploadPage'
import { AnalisisGraderGatesConfigPage } from './AnalisisGraderGatesConfigPage'
import { AnalisisGraderDashboardPage } from './AnalisisGraderDashboardPage'
import { getLatestGraderAutosaveDraft, saveGraderAutosaveDraft } from '@/services/grader/graderSession.service'
import { computeAnalytics } from '@/services/grader/graderAnalytics'
import { computeDeterministicInsights } from '@/services/grader/graderInsights'
import type { ParsedMatrixData, GateAssignment, GraderAnalysisConfig } from '@/services/grader/types'

const GRADER_WIZARD_DRAFT_KEY = 'grader_wizard_draft_v1'

// Autosave conservador — el usuario no necesita controlar esto
const AUTOSAVE_POLICY = {
  debounceMs: 8_000,
  minIntervalMs: 45_000,
  configIdleMs: 30_000,
}

export function AnalisisGraderWizardPage() {
  const { canSee } = usePermissionsStore()
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [parsedData, setParsedData] = useState<ParsedMatrixData | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<FileParsed[]>([])
  const [gates, setGates] = useState<GateAssignment[]>(getDefaultGates())
  const [config, setConfig] = useState<GraderAnalysisConfig>({
    intervalMinutes: 15,
    errorThresholds: {
      photocellPctWarn: 1,
      outOfLimitsPctWarn: 3,
      pointZeroPctWarn: 2,
      pointZeroPctCritical: 3.5,
    },
  })
  const [gatesOpen, setGatesOpen] = useState(false)
  const [autosaveState, setAutosaveState] = useState<'idle' | 'queued' | 'saving' | 'saved' | 'error'>('idle')
  const [autosaveUpdatedAt, setAutosaveUpdatedAt] = useState<string | null>(null)

  const localDraftLoadedRef = useRef(false)
  const cloudDraftHydratedRef = useRef(false)
  const lastCloudSaveAtRef = useRef<number>(0)
  const lastCloudFingerprintRef = useRef<string>('')
  const lastConfigMutationAtRef = useRef<number>(Date.now())

  // Alertas calculadas desde los datos cargados
  const alertInsights = useMemo(() => {
    if (!parsedData || parsedData.pieceRecords.length === 0) return []
    try {
      const result = computeAnalytics(parsedData, config, gates)
      return computeDeterministicInsights(result)
    } catch {
      return []
    }
  }, [parsedData, config, gates])

  // Restaurar draft local
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GRADER_WIZARD_DRAFT_KEY)
      if (!raw) return
      localDraftLoadedRef.current = true
      const saved = JSON.parse(raw) as { gates?: GateAssignment[]; config?: GraderAnalysisConfig }
      if (Array.isArray(saved.gates) && saved.gates.length > 0) setGates(saved.gates)
      if (saved.config && typeof saved.config === 'object') {
        const c = saved.config
        setConfig((prev) => ({
          ...prev,
          ...c,
          errorThresholds: {
            photocellPctWarn: c.errorThresholds?.photocellPctWarn ?? prev.errorThresholds?.photocellPctWarn ?? 1,
            outOfLimitsPctWarn: c.errorThresholds?.outOfLimitsPctWarn ?? prev.errorThresholds?.outOfLimitsPctWarn ?? 3,
            pointZeroPctWarn: c.errorThresholds?.pointZeroPctWarn ?? prev.errorThresholds?.pointZeroPctWarn ?? 2,
            pointZeroPctCritical: c.errorThresholds?.pointZeroPctCritical ?? prev.errorThresholds?.pointZeroPctCritical ?? 3.5,
          },
        }))
      }
    } catch { /* localStorage no disponible */ }
  }, [])

  // Persistir draft local
  useEffect(() => {
    try {
      localStorage.setItem(GRADER_WIZARD_DRAFT_KEY, JSON.stringify({ gates, config, updatedAt: new Date().toISOString() }))
    } catch { /* localStorage no disponible */ }
  }, [config, gates])

  // Seguimiento de mutaciones para autosave
  useEffect(() => {
    lastConfigMutationAtRef.current = Date.now()
  }, [config, gates])

  // Restaurar draft desde cloud
  useEffect(() => {
    if (!user?.id || localDraftLoadedRef.current || cloudDraftHydratedRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const draft = await getLatestGraderAutosaveDraft(user.id)
        if (!draft || cancelled) return
        if (Array.isArray(draft.gatesConfigSnapshot) && draft.gatesConfigSnapshot.length > 0) setGates(draft.gatesConfigSnapshot)
        if (draft.config && typeof draft.config === 'object') {
          const c = draft.config
          setConfig((prev) => ({
            ...prev,
            ...c,
            errorThresholds: {
              photocellPctWarn: c.errorThresholds?.photocellPctWarn ?? prev.errorThresholds?.photocellPctWarn ?? 1,
              outOfLimitsPctWarn: c.errorThresholds?.outOfLimitsPctWarn ?? prev.errorThresholds?.outOfLimitsPctWarn ?? 3,
              pointZeroPctWarn: c.errorThresholds?.pointZeroPctWarn ?? prev.errorThresholds?.pointZeroPctWarn ?? 2,
              pointZeroPctCritical: c.errorThresholds?.pointZeroPctCritical ?? prev.errorThresholds?.pointZeroPctCritical ?? 3.5,
            },
          }))
        }
        setAutosaveUpdatedAt(draft.updatedAt || null)
        setAutosaveState('saved')
      } catch { /* fallback silencioso */ }
      finally { cloudDraftHydratedRef.current = true }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  // Autosave cloud
  useEffect(() => {
    if (!user?.id) return
    const sessionDate = config.startAt?.slice(0, 10)
    const hasMeaningfulContext = Boolean(config.deviceId || config.shiftId || config.startAt || parsedData?.files.length)
    if (!hasMeaningfulContext) { setAutosaveState('idle'); return }

    const fingerprint = JSON.stringify({ config, gates, sessionDate })
    if (fingerprint === lastCloudFingerprintRef.current) return

    const elapsed = Date.now() - lastCloudSaveAtRef.current
    const throttleWait = Math.max(0, AUTOSAVE_POLICY.minIntervalMs - elapsed)
    const configIdleElapsed = Date.now() - lastConfigMutationAtRef.current
    const configIdleWait = Math.max(0, AUTOSAVE_POLICY.configIdleMs - configIdleElapsed)
    const waitMs = Math.max(AUTOSAVE_POLICY.debounceMs, throttleWait, configIdleWait)

    setAutosaveState('queued')
    const timer = window.setTimeout(() => {
      setAutosaveState('saving')
      saveGraderAutosaveDraft({
        createdBy: user.id,
        deviceId: config.deviceId,
        shiftId: config.shiftId,
        sessionDate,
        config,
        gatesConfigSnapshot: gates,
        currentStep: 'config',
      })
        .then((draft) => {
          lastCloudSaveAtRef.current = Date.now()
          lastCloudFingerprintRef.current = fingerprint
          setAutosaveUpdatedAt(draft.updatedAt)
          setAutosaveState('saved')
        })
        .catch(() => setAutosaveState('error'))
    }, waitMs)
    return () => window.clearTimeout(timer)
  }, [config, gates, parsedData?.files.length, user?.id])

  // Restaurar último turno desde localStorage
  useEffect(() => {
    if (searchParams.get('date') || searchParams.get('autoload')) return
    try {
      const saved = localStorage.getItem('grader_last_session')
      if (saved) {
        const { date, shiftId } = JSON.parse(saved)
        if (date && shiftId) {
          const newParams = new URLSearchParams(searchParams)
          newParams.set('date', date)
          newParams.set('shift', shiftId)
          newParams.set('autoload', '1')
          navigate(`?${newParams.toString()}`, { replace: true })
        }
      }
    } catch { /* localStorage no disponible */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fallbackParsedData: ParsedMatrixData = parsedData || {
    files: [], pieceRecords: [], gate0Records: [], folioRecords: [], qualitySummary: [], productionSummary: [], inferred: {},
  }

  const handleUploadComplete = useCallback((data: ParsedMatrixData) => {
    setParsedData(data)
    setConfig((prev) => ({
      ...prev,
      startAt: data.inferred.startAt || prev.startAt,
      endAt: data.inferred.endAt || prev.endAt,
    }))
  }, [])

  const handleGatesApply = useCallback((updatedGates: GateAssignment[], updatedConfig: GraderAnalysisConfig) => {
    setGates(updatedGates)
    setConfig(updatedConfig)
    setGatesOpen(false)
  }, [])

  const handleApplyGateSuggestion = useCallback((payload: { gateNumber: number; calibre: string; quality: string }) => {
    setGates((prev) => prev.map((gate) => {
      if (gate.gateNumber !== payload.gateNumber) return gate
      return { ...gate, assignedCalibre: payload.calibre, assignedQuality: payload.quality as GateAssignment['assignedQuality'] }
    }))
    setGatesOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleUpdatePointZeroWarnThreshold = useCallback((value: number) => {
    setConfig((prev) => ({
      ...prev,
      errorThresholds: {
        photocellPctWarn: prev.errorThresholds?.photocellPctWarn ?? 1,
        outOfLimitsPctWarn: prev.errorThresholds?.outOfLimitsPctWarn ?? 3,
        pointZeroPctWarn: value,
        pointZeroPctCritical: prev.errorThresholds?.pointZeroPctCritical ?? Math.max(value + 0.5, value * 1.5),
      },
    }))
  }, [])

  const handleUpdatePointZeroCriticalThreshold = useCallback((value: number) => {
    setConfig((prev) => ({
      ...prev,
      errorThresholds: {
        photocellPctWarn: prev.errorThresholds?.photocellPctWarn ?? 1,
        outOfLimitsPctWarn: prev.errorThresholds?.outOfLimitsPctWarn ?? 3,
        pointZeroPctWarn: prev.errorThresholds?.pointZeroPctWarn ?? 2,
        pointZeroPctCritical: value,
      },
    }))
  }, [])

  if (!canSee('analisisGrader')) return <Navigate to="/" replace />

  const hasData = Boolean(parsedData && parsedData.pieceRecords.length > 0)
  const criticalInsights = alertInsights.filter((i) => i.severity === 'critical')
  const warnInsights = alertInsights.filter((i) => i.severity === 'warn')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Análisis Grader
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Clasificadora de salmones — análisis en tiempo real
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {autosaveState !== 'idle' && (
            <Badge
              variant="outline"
              className={
                autosaveState === 'saved' ? 'text-emerald-600 border-emerald-500/40' :
                autosaveState === 'saving' ? 'text-sky-600 border-sky-500/40' :
                autosaveState === 'error' ? 'text-amber-600 border-amber-500/40' :
                'text-muted-foreground border-muted'
              }
            >
              {autosaveState === 'saving' && <><Loader2 className="h-3 w-3 animate-spin mr-1" />Guardando…</>}
              {autosaveState === 'saved' && <>Guardado {autosaveUpdatedAt ? new Date(autosaveUpdatedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''}</>}
              {autosaveState === 'error' && <>Error al guardar (respaldo local activo)</>}
              {autosaveState === 'queued' && <>Guardado pendiente</>}
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate('/analisis-grader/calendario')}>
            <Calendar className="h-4 w-4 mr-1" />
            Calendario
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/analisis-grader/sesiones')}>
            <FolderOpen className="h-4 w-4 mr-1" />
            Historial
          </Button>
        </div>
      </div>

      {/* Upload de archivos */}
      <AnalisisGraderUploadPage
        onComplete={handleUploadComplete}
        initialFiles={uploadedFiles}
        onFilesChange={setUploadedFiles}
      />

      {/* Configuración de gates — colapsable */}
      <Card>
        <button
          type="button"
          onClick={() => setGatesOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors rounded-lg"
        >
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            Configurar compuertas
            <Badge variant="outline" className="text-xs font-normal">
              {gates.filter((g) => g.active).length} activas
            </Badge>
          </span>
          {gatesOpen
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />
          }
        </button>
        {gatesOpen && (
          <CardContent className="pt-0 pb-4">
            <AnalisisGraderGatesConfigPage
              gates={gates}
              config={config}
              parsedData={fallbackParsedData}
              onComplete={handleGatesApply}
            />
          </CardContent>
        )}
      </Card>

      {/* Alertas — visibles en cuanto hay datos */}
      {hasData && alertInsights.length > 0 && (
        <div className="space-y-2">
          {criticalInsights.map((insight) => (
            <div key={insight.id} className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">{insight.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{insight.evidence[0]}</p>
                {insight.recommendations[0] && (
                  <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">→ {insight.recommendations[0]}</p>
                )}
              </div>
            </div>
          ))}
          {warnInsights.map((insight) => (
            <div key={insight.id} className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{insight.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{insight.evidence[0]}</p>
                {insight.recommendations[0] && (
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">→ {insight.recommendations[0]}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {hasData && alertInsights.length === 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            Todo dentro de parámetros normales
          </p>
        </div>
      )}

      {/* Dashboard — aparece automáticamente al cargar archivos */}
      {hasData && (
        <AnalisisGraderDashboardPage
          parsedData={fallbackParsedData}
          gates={gates}
          config={config}
          onBack={() => {}}
          onApplyGateSuggestion={handleApplyGateSuggestion}
          onUpdatePointZeroWarnThreshold={handleUpdatePointZeroWarnThreshold}
          onUpdatePointZeroCriticalThreshold={handleUpdatePointZeroCriticalThreshold}
        />
      )}
    </div>
  )
}

function getDefaultGates(): GateAssignment[] {
  const calibres: Array<{ calibre: import('@/services/grader/types').CalibreRange; quality: import('@/services/grader/types').GraderQuality }> = [
    { calibre: '2-4 lb', quality: 'Grado' },
    { calibre: '4-6 lb', quality: 'Grado' },
    { calibre: '4-6 lb', quality: 'Premium' },
    { calibre: '6-8 lb', quality: 'Grado' },
    { calibre: '6-8 lb', quality: 'Premium' },
    { calibre: '6-8 lb', quality: 'Industrial' },
    { calibre: '8-10 lb', quality: 'Grado' },
    { calibre: '8-10 lb', quality: 'Premium' },
    { calibre: '8-10 lb', quality: 'Industrial' },
    { calibre: '10-12 lb', quality: 'Grado' },
    { calibre: '10-12 lb', quality: 'Premium' },
    { calibre: '10-12 lb', quality: 'D' },
  ]

  return calibres.map((c, i) => ({
    gateNumber: i + 1,
    assignedCalibre: c.calibre,
    assignedQuality: c.quality,
    active: true,
  }))
}
