/**
 * Wizard principal de Análisis Grader (2 pasos):
 *  P1) Configuración: Carga de archivos + Calendario + Config Gates
 *  P2) Dashboard
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, Button, Badge, InfoTooltip } from '@/components/ui'
import { Settings2, BarChart3, ChevronRight, FolderOpen, Calendar, Loader2 } from 'lucide-react'
import { useAuthStore, usePermissionsStore } from '@/store'
import { AnalisisGraderUploadPage, type FileParsed } from './AnalisisGraderUploadPage'
import { AnalisisGraderGatesConfigPage } from './AnalisisGraderGatesConfigPage'
import { AnalisisGraderDashboardPage } from './AnalisisGraderDashboardPage'
import { getLatestGraderAutosaveDraft, saveGraderAutosaveDraft } from '@/services/grader/graderSession.service'
import type { ParsedMatrixData, GateAssignment, GraderAnalysisConfig } from '@/services/grader/types'

const STEPS = [
  { id: 'config', label: 'Configuración', icon: Settings2 },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
] as const

type StepId = typeof STEPS[number]['id']
type AutosaveMode = 'normal' | 'ahorro'
const GRADER_WIZARD_DRAFT_KEY = 'grader_wizard_draft_v1'
const AUTOSAVE_MODE_KEY = 'grader_autosave_mode_v1'
const AUTOSAVE_POLICY: Record<AutosaveMode, { debounceMs: number; minIntervalMs: number; configIdleMs: number }> = {
  normal: {
    debounceMs: 4_000,
    minIntervalMs: 20_000,
    configIdleMs: 8_000,
  },
  ahorro: {
    debounceMs: 8_000,
    minIntervalMs: 45_000,
    configIdleMs: 30_000,
  },
}

function estimateWritesPerHour(mode: AutosaveMode): number {
  const policy = AUTOSAVE_POLICY[mode]
  return Math.max(1, Math.floor(3_600_000 / policy.minIntervalMs))
}

function getDefaultAutosaveModeByEnv(): AutosaveMode {
  const useEmulators = String(import.meta.env.VITE_USE_EMULATORS || '').toLowerCase() === 'true'
  if (useEmulators) return 'ahorro'
  return import.meta.env.PROD ? 'normal' : 'ahorro'
}

export function AnalisisGraderWizardPage() {
  const { canSee } = usePermissionsStore()
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [currentStep, setCurrentStep] = useState<StepId>('config')
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
  const [autosaveMode, setAutosaveMode] = useState<AutosaveMode>(getDefaultAutosaveModeByEnv)
  const [autosaveState, setAutosaveState] = useState<'idle' | 'queued' | 'saving' | 'saved' | 'error'>('idle')
  const [autosaveUpdatedAt, setAutosaveUpdatedAt] = useState<string | null>(null)
  const gatesRef = useRef<HTMLDivElement>(null)
  const localDraftLoadedRef = useRef(false)
  const cloudDraftHydratedRef = useRef(false)
  const lastCloudSaveAtRef = useRef<number>(0)
  const lastCloudFingerprintRef = useRef<string>('')
  const lastConfigMutationAtRef = useRef<number>(Date.now())
  const previousStepRef = useRef<StepId>('config')

  useEffect(() => {
    try {
      const savedMode = localStorage.getItem(AUTOSAVE_MODE_KEY)
      if (savedMode === 'normal' || savedMode === 'ahorro') {
        setAutosaveMode(savedMode)
      }
    } catch {
      // localStorage no disponible
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(AUTOSAVE_MODE_KEY, autosaveMode)
    } catch {
      // localStorage no disponible
    }
  }, [autosaveMode])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GRADER_WIZARD_DRAFT_KEY)
      if (!raw) return
      localDraftLoadedRef.current = true
      const parsed = JSON.parse(raw) as {
        gates?: GateAssignment[]
        config?: GraderAnalysisConfig
        currentStep?: StepId
      }
      if (Array.isArray(parsed.gates) && parsed.gates.length > 0) {
        setGates(parsed.gates)
      }
      if (parsed.config && typeof parsed.config === 'object') {
        const parsedConfig = parsed.config
        setConfig((prev) => ({
          ...prev,
          ...parsedConfig,
          errorThresholds: {
            photocellPctWarn: parsedConfig.errorThresholds?.photocellPctWarn ?? prev.errorThresholds?.photocellPctWarn ?? 1,
            outOfLimitsPctWarn: parsedConfig.errorThresholds?.outOfLimitsPctWarn ?? prev.errorThresholds?.outOfLimitsPctWarn ?? 3,
            pointZeroPctWarn: parsedConfig.errorThresholds?.pointZeroPctWarn ?? prev.errorThresholds?.pointZeroPctWarn ?? 2,
            pointZeroPctCritical: parsedConfig.errorThresholds?.pointZeroPctCritical ?? prev.errorThresholds?.pointZeroPctCritical ?? 3.5,
          },
        }))
      }
      if (parsed.currentStep === 'config' || parsed.currentStep === 'dashboard') {
        setCurrentStep(parsed.currentStep)
      }
    } catch {
      // localStorage no disponible o dato inválido
    }
  }, [])

  useEffect(() => {
    try {
      const draft = {
        gates,
        config,
        currentStep,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(GRADER_WIZARD_DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // localStorage no disponible
    }
  }, [config, currentStep, gates])

  useEffect(() => {
    if (currentStep === 'config') {
      lastConfigMutationAtRef.current = Date.now()
    }
  }, [config, currentStep, gates])

  useEffect(() => {
    if (!user?.id) return
    if (localDraftLoadedRef.current) return
    if (cloudDraftHydratedRef.current) return

    let cancelled = false
    ;(async () => {
      try {
        const draft = await getLatestGraderAutosaveDraft(user.id)
        if (!draft || cancelled) return

        if (Array.isArray(draft.gatesConfigSnapshot) && draft.gatesConfigSnapshot.length > 0) {
          setGates(draft.gatesConfigSnapshot)
        }
        if (draft.config && typeof draft.config === 'object') {
          setConfig((prev) => ({
            ...prev,
            ...draft.config,
            errorThresholds: {
              photocellPctWarn: draft.config.errorThresholds?.photocellPctWarn ?? prev.errorThresholds?.photocellPctWarn ?? 1,
              outOfLimitsPctWarn: draft.config.errorThresholds?.outOfLimitsPctWarn ?? prev.errorThresholds?.outOfLimitsPctWarn ?? 3,
              pointZeroPctWarn: draft.config.errorThresholds?.pointZeroPctWarn ?? prev.errorThresholds?.pointZeroPctWarn ?? 2,
              pointZeroPctCritical: draft.config.errorThresholds?.pointZeroPctCritical ?? prev.errorThresholds?.pointZeroPctCritical ?? 3.5,
            },
          }))
        }
        if (draft.currentStep === 'config' || draft.currentStep === 'dashboard') {
          setCurrentStep(draft.currentStep)
        }
        setAutosaveUpdatedAt(draft.updatedAt || null)
        setAutosaveState('saved')
      } catch {
        // fallback silencioso
      } finally {
        cloudDraftHydratedRef.current = true
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    const policy = AUTOSAVE_POLICY[autosaveMode]
    const sessionDate = config.startAt?.slice(0, 10)
    const hasMeaningfulContext = Boolean(config.deviceId || config.shiftId || config.startAt || parsedData?.files.length)
    if (!hasMeaningfulContext) {
      setAutosaveState('idle')
      return
    }

    const fingerprint = JSON.stringify({
      config,
      gates,
      sessionDate,
      deviceId: config.deviceId,
      shiftId: config.shiftId,
    })

    if (fingerprint === lastCloudFingerprintRef.current) {
      return
    }

    const elapsed = Date.now() - lastCloudSaveAtRef.current
    const throttleWait = Math.max(0, policy.minIntervalMs - elapsed)
    const configIdleElapsed = Date.now() - lastConfigMutationAtRef.current
    const configIdleWait = currentStep === 'dashboard'
      ? 0
      : Math.max(0, policy.configIdleMs - configIdleElapsed)
    const waitMs = Math.max(policy.debounceMs, throttleWait, configIdleWait)

    if (waitMs > policy.debounceMs || currentStep === 'config') {
      setAutosaveState('queued')
    }

    const timer = window.setTimeout(() => {
      setAutosaveState('saving')
      saveGraderAutosaveDraft({
        createdBy: user.id,
        deviceId: config.deviceId,
        shiftId: config.shiftId,
        sessionDate,
        config,
        gatesConfigSnapshot: gates,
        currentStep,
      })
        .then((draft) => {
          lastCloudSaveAtRef.current = Date.now()
          lastCloudFingerprintRef.current = fingerprint
          setAutosaveUpdatedAt(draft.updatedAt)
          setAutosaveState('saved')
        })
        .catch(() => {
          setAutosaveState('error')
          // fallback silencioso: existe draft local
        })
    }, waitMs)

    return () => {
      window.clearTimeout(timer)
    }
  }, [autosaveMode, config, currentStep, gates, parsedData?.files.length, user?.id])

  useEffect(() => {
    if (!user?.id) return
    const previousStep = previousStepRef.current
    previousStepRef.current = currentStep

    if (!(previousStep === 'config' && currentStep === 'dashboard')) return

    const sessionDate = config.startAt?.slice(0, 10)
    const hasMeaningfulContext = Boolean(config.deviceId || config.shiftId || config.startAt || parsedData?.files.length)
    if (!hasMeaningfulContext) return

    const fingerprint = JSON.stringify({
      config,
      gates,
      sessionDate,
      deviceId: config.deviceId,
      shiftId: config.shiftId,
    })

    if (fingerprint === lastCloudFingerprintRef.current) return

    setAutosaveState('saving')
    saveGraderAutosaveDraft({
      createdBy: user.id,
      deviceId: config.deviceId,
      shiftId: config.shiftId,
      sessionDate,
      config,
      gatesConfigSnapshot: gates,
      currentStep,
    })
      .then((draft) => {
        lastCloudSaveAtRef.current = Date.now()
        lastCloudFingerprintRef.current = fingerprint
        setAutosaveUpdatedAt(draft.updatedAt)
        setAutosaveState('saved')
      })
      .catch(() => {
        setAutosaveState('error')
      })
  }, [config, currentStep, gates, parsedData?.files.length, user?.id])

  // Restaurar último turno desde localStorage al iniciar
  useEffect(() => {
    // Si hay params en URL, no restaurar
    if (searchParams.get('date') || searchParams.get('autoload')) return
    try {
      const saved = localStorage.getItem('grader_last_session')
      if (saved) {
        const { date, shiftId } = JSON.parse(saved)
        if (date && shiftId) {
          // Inyectar en URL para que UploadPage los use
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
    files: [],
    pieceRecords: [],
    gate0Records: [],
    folioRecords: [],
    qualitySummary: [],
    productionSummary: [],
    inferred: {},
  }

  const handleUploadComplete = useCallback((data: ParsedMatrixData) => {
    setParsedData(data)
    // Auto-fill config from inferred data
    setConfig((prev) => ({
      ...prev,
      startAt: data.inferred.startAt || prev.startAt,
      endAt: data.inferred.endAt || prev.endAt,
    }))
    // Scroll hacia la configuración de gates
    setTimeout(() => {
      gatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [])

  const handleGatesComplete = useCallback(
    (updatedGates: GateAssignment[], updatedConfig: GraderAnalysisConfig) => {
      setGates(updatedGates)
      setConfig(updatedConfig)
      setCurrentStep('dashboard')
    },
    [],
  )

  const handleApplyGateSuggestion = useCallback((payload: { gateNumber: number; calibre: string; quality: string }) => {
    setGates((prev) => prev.map((gate) => {
      if (gate.gateNumber !== payload.gateNumber) return gate
      return {
        ...gate,
        assignedCalibre: payload.calibre,
        assignedQuality: payload.quality as GateAssignment['assignedQuality'],
      }
    }))
    setCurrentStep('config')
    setTimeout(() => {
      gatesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
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

  // Permission gate: redirect if user cannot see this module
  if (!canSee('analisisGrader')) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Análisis Grader
          </h1>
          <div className="flex items-center flex-wrap gap-2 mt-1">
            <p className="text-sm text-muted-foreground">
              Análisis de datos de clasificadora de salmones
            </p>
            <Badge
              variant="outline"
              className={
                autosaveState === 'saved'
                  ? 'text-emerald-600 border-emerald-500/40'
                  : autosaveState === 'queued'
                  ? 'text-amber-600 border-amber-500/40'
                  : autosaveState === 'saving'
                  ? 'text-sky-600 border-sky-500/40'
                  : autosaveState === 'error'
                  ? 'text-amber-600 border-amber-500/40'
                  : 'text-muted-foreground'
              }
            >
              {autosaveState === 'saving' ? (
                <><Loader2 className="h-3 w-3 animate-spin mr-1" />Autoguardando…</>
              ) : autosaveState === 'queued' ? (
                <>Autoguardado pendiente ({autosaveMode === 'ahorro' ? 'modo ahorro' : 'modo normal'})</>
              ) : autosaveState === 'saved' ? (
                <>Autoguardado {autosaveUpdatedAt ? new Date(autosaveUpdatedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : 'OK'}</>
              ) : autosaveState === 'error' ? (
                <>Autoguardado nube con error (respaldo local activo)</>
              ) : (
                <>Autoguardado en espera</>
              )}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 rounded-md border p-1">
            <Button
              type="button"
              size="sm"
              variant={autosaveMode === 'normal' ? 'default' : 'ghost'}
              onClick={() => setAutosaveMode('normal')}
              className="h-7 px-2 text-[11px]"
            >
              Modo normal
            </Button>
            <Button
              type="button"
              size="sm"
              variant={autosaveMode === 'ahorro' ? 'default' : 'ghost'}
              onClick={() => setAutosaveMode('ahorro')}
              className="h-7 px-2 text-[11px]"
            >
              Modo ahorro
            </Button>
          </div>
          <InfoTooltip
            iconSize={12}
            position="bottom"
            title="Modo de autoguardado"
            text={`Normal: debounce ${Math.round(AUTOSAVE_POLICY.normal.debounceMs / 1000)}s, intervalo mín ${Math.round(AUTOSAVE_POLICY.normal.minIntervalMs / 1000)}s, inactividad config ${Math.round(AUTOSAVE_POLICY.normal.configIdleMs / 1000)}s, tope teórico ${estimateWritesPerHour('normal')} writes/h. Ahorro: debounce ${Math.round(AUTOSAVE_POLICY.ahorro.debounceMs / 1000)}s, intervalo mín ${Math.round(AUTOSAVE_POLICY.ahorro.minIntervalMs / 1000)}s, inactividad config ${Math.round(AUTOSAVE_POLICY.ahorro.configIdleMs / 1000)}s, tope teórico ${estimateWritesPerHour('ahorro')} writes/h.`}
            className="hidden sm:inline-flex"
          />
          <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader/calendario')}>
            <Calendar className="h-4 w-4 mr-1" />
            Calendario
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader/sesiones')}>
            <FolderOpen className="h-4 w-4 mr-1" />
            Sesiones Guardadas
          </Button>
        </div>
      </div>

      {/* Stepper */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-center gap-1 sm:gap-3">
            {STEPS.map((step, idx) => {
              const Icon = step.icon
              const isActive = step.id === currentStep

              return (
                <div key={step.id} className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={() => setCurrentStep(step.id)}
                    className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                  {idx < STEPS.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      {currentStep === 'config' && (
        <>
          {/* Carga de archivos + calendario */}
          <AnalisisGraderUploadPage
            onComplete={handleUploadComplete}
            initialFiles={uploadedFiles}
            onFilesChange={setUploadedFiles}
          />

          {/* Configuración de Gates — siempre visible debajo */}
          <div ref={gatesRef}>
            <AnalisisGraderGatesConfigPage
              gates={gates}
              config={config}
              parsedData={fallbackParsedData}
              onComplete={handleGatesComplete}
            />
          </div>
        </>
      )}

      {currentStep === 'dashboard' && (
        <AnalisisGraderDashboardPage
          parsedData={fallbackParsedData}
          gates={gates}
          config={config}
          onBack={() => setCurrentStep('config')}
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
