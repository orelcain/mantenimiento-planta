/**
 * Wizard principal de Análisis Grader (3 pasos):
 *  P1) Carga de archivos Excel
 *  P2) Configuración de Gates
 *  P3) Dashboard
 */

import { useState, useCallback } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Card, CardContent, Button } from '@/components/ui'
import { Upload, Settings2, BarChart3, ChevronRight, FolderOpen } from 'lucide-react'
import { usePermissionsStore } from '@/store'
import { AnalisisGraderUploadPage, type FileParsed } from './AnalisisGraderUploadPage'
import { AnalisisGraderGatesConfigPage } from './AnalisisGraderGatesConfigPage'
import { AnalisisGraderDashboardPage } from './AnalisisGraderDashboardPage'
import type { ParsedMatrixData, GateAssignment, GraderAnalysisConfig } from '@/services/grader/types'

const STEPS = [
  { id: 'upload', label: 'Carga de Archivos', icon: Upload },
  { id: 'gates', label: 'Config. Gates', icon: Settings2 },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
] as const

type StepId = typeof STEPS[number]['id']

export function AnalisisGraderWizardPage() {
  const { canSee } = usePermissionsStore()
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState<StepId>('upload')
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
    setCurrentStep('gates')
  }, [])

  const handleGatesComplete = useCallback(
    (updatedGates: GateAssignment[], updatedConfig: GraderAnalysisConfig) => {
      setGates(updatedGates)
      setConfig(updatedConfig)
      setCurrentStep('dashboard')
    },
    [],
  )

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
        <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader/sesiones')}>
          <FolderOpen className="h-4 w-4 mr-1" />
          Sesiones Guardadas
        </Button>
      </div>

      {/* Stepper */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-center gap-1 sm:gap-3">
            {STEPS.map((step, idx) => {
              const Icon = step.icon
              const isActive = step.id === currentStep
              const isClickable = true

              return (
                <div key={step.id} className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={() => isClickable && setCurrentStep(step.id)}
                    disabled={!isClickable}
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
      {currentStep === 'upload' && (
        <AnalisisGraderUploadPage
          onComplete={handleUploadComplete}
          initialFiles={uploadedFiles}
          onFilesChange={setUploadedFiles}
        />
      )}

      {currentStep === 'gates' && (
        <AnalisisGraderGatesConfigPage
          gates={gates}
          config={config}
          parsedData={fallbackParsedData}
          onComplete={handleGatesComplete}
          onBack={() => setCurrentStep('upload')}
        />
      )}

      {currentStep === 'dashboard' && (
        <AnalisisGraderDashboardPage
          parsedData={fallbackParsedData}
          gates={gates}
          config={config}
          onBack={() => setCurrentStep('gates')}
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
