/**
 * Wizard principal de Análisis Grader (2 pasos):
 *  P1) Configuración: Carga de archivos + Calendario + Config Gates
 *  P2) Dashboard
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, Button } from '@/components/ui'
import { Settings2, BarChart3, ChevronRight, FolderOpen, Calendar } from 'lucide-react'
import { usePermissionsStore } from '@/store'
import { AnalisisGraderUploadPage, type FileParsed } from './AnalisisGraderUploadPage'
import { AnalisisGraderGatesConfigPage } from './AnalisisGraderGatesConfigPage'
import { AnalisisGraderDashboardPage } from './AnalisisGraderDashboardPage'
import type { ParsedMatrixData, GateAssignment, GraderAnalysisConfig } from '@/services/grader/types'

const STEPS = [
  { id: 'config', label: 'Configuración', icon: Settings2 },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
] as const

type StepId = typeof STEPS[number]['id']

export function AnalisisGraderWizardPage() {
  const { canSee } = usePermissionsStore()
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
    },
  })
  const gatesRef = useRef<HTMLDivElement>(null)

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
          <p className="text-sm text-muted-foreground mt-1">
            Análisis de datos de clasificadora de salmones
          </p>
        </div>
        <div className="flex items-center gap-2">
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
