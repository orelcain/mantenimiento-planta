/**
 * P3) Dashboard de Análisis Grader
 *
 * KPIs, Punto Cero, distribuciones, matriz, balance de gates,
 * insights, panel IA, exportación y guardado de sesión.
 */

import { useState, useMemo, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'
import {
  ChevronLeft,
  Download,
  Save,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Brain,
  BarChart3,
  PieChart,
  Table2,
  Target,
  Zap,
  Loader2,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  FileText,
} from 'lucide-react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
} from 'chart.js'
import 'chartjs-adapter-date-fns'

import { useAuthStore } from '@/store'
import { cn } from '@/lib/utils'
import { computeAnalytics } from '@/services/grader/graderAnalytics'
import { computeDeterministicInsights, computePointZeroTrend } from '@/services/grader/graderInsights'
import { analyzeGrader, parseAIResponse } from '@/services/ai/aiProvider'
import { saveGraderSession } from '@/services/grader/graderSession.service'
import type {
  ParsedMatrixData,
  GateAssignment,
  GraderAnalysisConfig,
  GraderAnalyticsResult,
  DeterministicInsight,
  AIGraderInput,
  AIGraderOutput,
} from '@/services/grader/types'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, TimeScale, Filler)

interface Props {
  parsedData: ParsedMatrixData
  gates: GateAssignment[]
  config: GraderAnalysisConfig
  onBack: () => void
}

export function AnalisisGraderDashboardPage({ parsedData, gates, config, onBack }: Props) {
  const user = useAuthStore((s) => s.user)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiOutput, setAiOutput] = useState<AIGraderOutput | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiRawText, setAiRawText] = useState<string | null>(null)
  const dashRef = useRef<HTMLDivElement>(null)

  // Compute analytics
  const analytics = useMemo<GraderAnalyticsResult>(
    () => computeAnalytics(parsedData, config, gates),
    [parsedData, config, gates],
  )

  const insights = useMemo<DeterministicInsight[]>(
    () => computeDeterministicInsights(analytics),
    [analytics],
  )

  const trend = useMemo(() => computePointZeroTrend(analytics), [analytics])

  // ——— AI ———
  const handleAnalyzeAI = async () => {
    setAiLoading(true)
    setAiError(null)
    setAiRawText(null)

    const payload: AIGraderInput = {
      version: '1.0',
      metadata: {
        deviceId: config.deviceId,
        startAt: analytics.config.startAt,
        endAt: analytics.config.endAt,
        timezone: config.timezone,
        totalPieces: analytics.kpis.totalPieces,
      },
      thresholds: config.errorThresholds,
      kpis: analytics.kpis,
      distributions: {
        byCalibre: analytics.distributionByCalibre,
        byQuality: analytics.distributionByQuality,
        pointZeroByError: analytics.pointZeroByError,
      },
      timeSeriesPointZero: analytics.timeSeriesPointZero,
      gateAssignments: gates,
      gateBalance: analytics.gateBalance,
      dataCompleteness: {
        hasPieceRecords: parsedData.pieceRecords.length > 0,
        hasGate0Records: parsedData.gate0Records.length > 0,
        hasQualitySummary: parsedData.qualitySummary.length > 0,
        hasProductionSummary: parsedData.productionSummary.length > 0,
        hasFolioRecords: parsedData.folioRecords.length > 0,
        notes: analytics.notes,
      },
    }

    try {
      const result = await analyzeGrader(payload)
      setAiOutput(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Try to parse as raw text
      const parsed = parseAIResponse(msg)
      if (parsed.parsed) {
        setAiOutput(parsed.parsed)
      } else {
        setAiError(parsed.error || msg)
        setAiRawText(parsed.rawText || null)
      }
    } finally {
      setAiLoading(false)
    }
  }

  // ——— SAVE SESSION ———
  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    try {
      await saveGraderSession({
        deviceId: config.deviceId,
        startAt: analytics.config.startAt,
        endAt: analytics.config.endAt,
        uploadedFilesMeta: parsedData.files,
        gatesConfigSnapshot: gates,
        aggregates: analytics,
        insights,
        aiOutput: aiOutput || undefined,
        createdBy: user.id,
      })
      setSaved(true)
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  // ——— EXPORT JSON ———
  const handleExport = () => {
    const blob = new Blob(
      [JSON.stringify({ analytics, insights, aiOutput, trend }, null, 2)],
      { type: 'application/json' },
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `grader-analysis-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }

  // ——— EXPORT EXCEL ———
  const handleExportExcel = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    // KPIs sheet
    const kpiRows = [
      ['Métrica', 'Valor'],
      ['Total Piezas', kpis.totalPieces],
      ['Peso Total (kg)', kpis.totalWeightKg],
      ['Punto Cero Piezas', kpis.pointZeroPieces],
      ['Punto Cero %', kpis.pointZeroPct],
      ['Calibre Dominante', kpis.dominantCalibre ? `${kpis.dominantCalibre.calibre} (${kpis.dominantCalibre.pct}%)` : 'N/D'],
      ['Calidad Dominante', kpis.dominantQuality ? `${kpis.dominantQuality.quality} (${kpis.dominantQuality.pct}%)` : 'N/D'],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiRows), 'KPIs')

    // Distribution by calibre
    if (analytics.distributionByCalibre.length > 0) {
      const calRows = [['Calibre', 'Piezas', '%', 'Peso (kg)'], ...analytics.distributionByCalibre.map(d => [d.key, d.pieces, d.pct, d.weightKg ?? ''])]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(calRows), 'Dist. Calibre')
    }

    // Distribution by quality
    if (analytics.distributionByQuality.length > 0) {
      const qualRows = [['Calidad', 'Piezas', '%', 'Peso (kg)'], ...analytics.distributionByQuality.map(d => [d.key, d.pieces, d.pct, d.weightKg ?? ''])]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(qualRows), 'Dist. Calidad')
    }

    // Punto Cero by error
    if (analytics.pointZeroByError.length > 0) {
      const p0Rows = [['Error', 'Piezas', '%', 'Peso (kg)'], ...analytics.pointZeroByError.map(e => [e.error, e.pieces, e.pct, e.weightKg ?? ''])]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(p0Rows), 'Punto Cero')
    }

    // Clasificación Punto Cero (100%)
    if (analytics.pointZeroClassification.causes.length > 0) {
      const classRows = [
        ['Causa', 'Piezas', '% Punto Cero', '% Total', 'Peso (kg)'],
        ...analytics.pointZeroClassification.causes.map(c => [c.label, c.pieces, c.pctOfPointZero, c.pctOfTotal, c.weightKg ?? '']),
        ['TOTAL', analytics.pointZeroClassification.totalPointZeroPieces, 100, kpis.pointZeroPct, ''],
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(classRows), 'Clasif. Pto Cero')
    }

    // Fuera de Rango por peso
    if (analytics.pointZeroClassification.outOfRangeByWeight.length > 0) {
      const orRows = [
        ['Rango Peso', 'Piezas', '%'],
        ...analytics.pointZeroClassification.outOfRangeByWeight.map(d => [d.rangeLabel, d.pieces, d.pct]),
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(orRows), 'Fuera de Rango')
    }

    // Rangos de Calibre (referencia)
    const rangeRows = [
      ['Calibre', 'Mín (g)', 'Máx (g)'],
      ...analytics.pointZeroClassification.calibreWeightRanges.map(r => [r.calibre, r.minGrams, r.maxGrams]),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rangeRows), 'Rangos Calibre')

    // Matrix Q×C
    if (matrixQualities.length > 0 && matrixCalibres.length > 0) {
      const header = ['Calidad \\ Calibre', ...matrixCalibres]
      const matRows = matrixQualities.map(q => {
        const row: (string | number)[] = [q]
        matrixCalibres.forEach(c => {
          const cell = analytics.matrixQualityCalibre[q]?.[c]
          row.push(cell ? cell.pieces : 0)
        })
        return row
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...matRows]), 'Matriz QxC')
    }

    // Gate Balance
    if (analytics.gateBalance.length > 0) {
      const gbRows = [['Calibre', 'Demanda %', 'Gates Asignados', 'Severidad', 'Mensaje'], ...analytics.gateBalance.map(g => [g.calibre, g.demandPct, g.gatesAssigned, g.severity, g.message])]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(gbRows), 'Balance Gates')
    }

    // Insights
    if (insights.length > 0) {
      const insRows = [['Severidad', 'Título', 'Evidencia', 'Recomendaciones'], ...insights.map(i => [i.severity, i.title, i.evidence.join('; '), i.recommendations.join('; ')])]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(insRows), 'Insights')
    }

    XLSX.writeFile(wb, `grader-analysis-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ——— EXPORT PDF ———
  const handleExportPDF = async () => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const pdfDoc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = pdfDoc.internal.pageSize.getWidth()
    let y = 15

    // Title
    pdfDoc.setFontSize(16)
    pdfDoc.text('Análisis Grader — Reporte', pageW / 2, y, { align: 'center' })
    y += 8
    pdfDoc.setFontSize(9)
    pdfDoc.text(`Generado: ${new Date().toLocaleString()} | Dispositivo: ${config.deviceId || 'N/D'} | Período: ${analytics.config.startAt || '?'} — ${analytics.config.endAt || '?'}`, pageW / 2, y, { align: 'center' })
    y += 10

    // KPI table
    pdfDoc.setFontSize(12)
    pdfDoc.text('KPIs', 14, y)
    y += 2
    autoTable(pdfDoc, {
      startY: y,
      head: [['Métrica', 'Valor']],
      body: [
        ['Total Piezas', kpis.totalPieces.toLocaleString()],
        ['Peso Total (kg)', kpis.totalWeightKg?.toLocaleString() ?? 'N/D'],
        ['Punto Cero Piezas', kpis.pointZeroPieces.toLocaleString()],
        ['Punto Cero %', `${kpis.pointZeroPct}%`],
        ['Calibre Dominante', kpis.dominantCalibre ? `${kpis.dominantCalibre.calibre} (${kpis.dominantCalibre.pct}%)` : 'N/D'],
        ['Calidad Dominante', kpis.dominantQuality ? `${kpis.dominantQuality.quality} (${kpis.dominantQuality.pct}%)` : 'N/D'],
      ],
      theme: 'grid',
      styles: { fontSize: 8 },
      margin: { left: 14 },
    })
    y = (pdfDoc as any).lastAutoTable.finalY + 8

    // Distribution tables
    if (analytics.distributionByCalibre.length > 0) {
      if (y > 170) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Distribución por Calibre', 14, y)
      y += 2
      autoTable(pdfDoc, {
        startY: y,
        head: [['Calibre', 'Piezas', '%']],
        body: analytics.distributionByCalibre.map(d => [d.key, d.pieces.toLocaleString(), `${d.pct}%`]),
        theme: 'striped',
        styles: { fontSize: 8 },
        margin: { left: 14 },
      })
      y = (pdfDoc as any).lastAutoTable.finalY + 8
    }

    // Punto Cero
    if (analytics.pointZeroByError.length > 0) {
      if (y > 170) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Punto Cero por Causa', 14, y)
      y += 2
      autoTable(pdfDoc, {
        startY: y,
        head: [['Error', 'Piezas', '%']],
        body: analytics.pointZeroByError.map(e => [e.error, e.pieces.toLocaleString(), `${e.pct}%`]),
        theme: 'striped',
        styles: { fontSize: 8 },
        margin: { left: 14 },
      })
      y = (pdfDoc as any).lastAutoTable.finalY + 8
    }

    // Clasificación Punto Cero 100%
    if (analytics.pointZeroClassification.causes.length > 0) {
      if (y > 150) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Clasificación Punto Cero — 100%', 14, y)
      y += 2
      autoTable(pdfDoc, {
        startY: y,
        head: [['Causa', 'Piezas', '% P.Cero', '% Total']],
        body: [
          ...analytics.pointZeroClassification.causes.map(c => [c.label, c.pieces.toLocaleString(), `${c.pctOfPointZero}%`, `${c.pctOfTotal}%`]),
          ['TOTAL', analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString(), '100%', `${kpis.pointZeroPct}%`],
        ],
        theme: 'grid',
        styles: { fontSize: 8 },
        margin: { left: 14 },
      })
      y = (pdfDoc as any).lastAutoTable.finalY + 8
    }

    // Fuera de Rango por peso
    if (analytics.pointZeroClassification.outOfRangeByWeight.length > 0) {
      if (y > 160) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Fuera de Rango — Distribución por Peso', 14, y)
      y += 2
      autoTable(pdfDoc, {
        startY: y,
        head: [['Rango Peso', 'Piezas', '%']],
        body: analytics.pointZeroClassification.outOfRangeByWeight.map(d => [d.rangeLabel, d.pieces.toLocaleString(), `${d.pct}%`]),
        theme: 'striped',
        styles: { fontSize: 8 },
        margin: { left: 14 },
      })
      y = (pdfDoc as any).lastAutoTable.finalY + 8
    }

    // Matrix Q×C
    if (matrixQualities.length > 0 && matrixCalibres.length > 0) {
      if (y > 140) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Matriz Calidad × Calibre', 14, y)
      y += 2
      autoTable(pdfDoc, {
        startY: y,
        head: [['Calidad', ...matrixCalibres]],
        body: matrixQualities.map(q => {
          const cells: string[] = [q]
          matrixCalibres.forEach(c => {
            const cell = analytics.matrixQualityCalibre[q]?.[c]
            cells.push(cell ? `${cell.pieces} (${cell.pct}%)` : '—')
          })
          return cells
        }),
        theme: 'grid',
        styles: { fontSize: 7 },
        margin: { left: 14 },
      })
      y = (pdfDoc as any).lastAutoTable.finalY + 8
    }

    // Insights
    if (insights.length > 0) {
      if (y > 150) { pdfDoc.addPage(); y = 15 }
      pdfDoc.setFontSize(12)
      pdfDoc.text('Insights Determinísticos', 14, y)
      y += 2
      autoTable(pdfDoc, {
        startY: y,
        head: [['Severidad', 'Título', 'Evidencia', 'Recomendaciones']],
        body: insights.map(i => [i.severity.toUpperCase(), i.title, i.evidence.join('; '), i.recommendations.join('; ')]),
        theme: 'striped',
        styles: { fontSize: 7, cellWidth: 'wrap' },
        columnStyles: { 2: { cellWidth: 80 }, 3: { cellWidth: 80 } },
        margin: { left: 14 },
      })
    }

    pdfDoc.save(`grader-analysis-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const { kpis } = analytics

  // ——— CHART DATA ———
  const calibreChartData = {
    labels: analytics.distributionByCalibre.map((d) => d.key),
    datasets: [
      {
        label: 'Piezas',
        data: analytics.distributionByCalibre.map((d) => d.pieces),
        backgroundColor: [
          'rgba(59,130,246,0.7)',
          'rgba(16,185,129,0.7)',
          'rgba(245,158,11,0.7)',
          'rgba(139,92,246,0.7)',
          'rgba(239,68,68,0.7)',
          'rgba(107,114,128,0.7)',
        ],
      },
    ],
  }

  const qualityChartData = {
    labels: analytics.distributionByQuality.map((d) => d.key),
    datasets: [
      {
        label: 'Piezas',
        data: analytics.distributionByQuality.map((d) => d.pieces),
        backgroundColor: [
          'rgba(16,185,129,0.7)',
          'rgba(59,130,246,0.7)',
          'rgba(245,158,11,0.7)',
          'rgba(239,68,68,0.7)',
          'rgba(107,114,128,0.7)',
        ],
      },
    ],
  }

  const pointZeroErrorData = {
    labels: analytics.pointZeroByError.map((d) => d.error),
    datasets: [
      {
        label: 'Piezas Punto Cero',
        data: analytics.pointZeroByError.map((d) => d.pieces),
        backgroundColor: 'rgba(239,68,68,0.7)',
      },
    ],
  }

  // Classification donut for Punto Cero
  const classificationColors = [
    'rgba(239,68,68,0.8)',   // fuera_de_rango (red)
    'rgba(245,158,11,0.8)',  // fuera_de_limites (amber)
    'rgba(139,92,246,0.8)',  // no_leido_fotocelula (purple)
    'rgba(59,130,246,0.8)',  // too_close_too_long (blue)
    'rgba(16,185,129,0.8)',  // puerta_no_preparada (green)
    'rgba(107,114,128,0.8)', // otro (gray)
  ]

  const classificationChartData = {
    labels: analytics.pointZeroClassification.causes.map((c) => c.label),
    datasets: [
      {
        data: analytics.pointZeroClassification.causes.map((c) => c.pieces),
        backgroundColor: analytics.pointZeroClassification.causes.map((_, i) => classificationColors[i % classificationColors.length]),
      },
    ],
  }

  const timeSeriesData = {
    labels: analytics.timeSeriesPointZero.map((p) => p.bucketStart),
    datasets: [
      {
        label: 'Punto Cero (piezas)',
        data: analytics.timeSeriesPointZero.map((p) => p.pointZeroPieces),
        borderColor: 'rgba(239,68,68,0.9)',
        backgroundColor: 'rgba(239,68,68,0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  }

  // Collect all unique qualities and calibres for matrix
  const matrixQualities = Object.keys(analytics.matrixQualityCalibre)
  const matrixCalibresSet = new Set<string>()
  for (const q of matrixQualities) {
    const row = analytics.matrixQualityCalibre[q]
    if (row) {
      for (const c of Object.keys(row)) {
        matrixCalibresSet.add(c)
      }
    }
  }
  const matrixCalibres = Array.from(matrixCalibresSet)

  return (
    <div ref={dashRef} className="space-y-4">
      {/* Top actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Volver a Config
        </Button>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            JSON
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 mr-1" />
            PDF
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || saved}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : saved ? (
              <CheckCircle className="h-4 w-4 mr-1" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            {saved ? 'Guardado' : 'Guardar Sesión'}
          </Button>
        </div>
      </div>

      {/* Data notes */}
      {analytics.notes.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-900/10">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                {analytics.notes.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ——— KPIs ——— */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Total Piezas" value={kpis.totalPieces.toLocaleString()} icon={BarChart3} />
        <KPICard
          label="Punto Cero"
          value={`${kpis.pointZeroPieces.toLocaleString()} (${kpis.pointZeroPct}%)`}
          icon={Target}
          severity={kpis.pointZeroPct > 3 ? 'critical' : kpis.pointZeroPct > 1.5 ? 'warn' : 'ok'}
        />
        <KPICard
          label="Calibre Dominante"
          value={kpis.dominantCalibre ? `${kpis.dominantCalibre.calibre} (${kpis.dominantCalibre.pct}%)` : 'N/D'}
          icon={BarChart3}
        />
        <KPICard
          label="Calidad Dominante"
          value={kpis.dominantQuality ? `${kpis.dominantQuality.quality} (${kpis.dominantQuality.pct}%)` : 'N/D'}
          icon={PieChart}
        />
      </div>

      {/* Trend summary */}
      {analytics.timeSeriesPointZero.length >= 3 && (
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            {trend.direction === 'increasing' ? (
              <TrendingUp className="h-5 w-5 text-red-500" />
            ) : trend.direction === 'decreasing' ? (
              <TrendingDown className="h-5 w-5 text-green-500" />
            ) : (
              <Minus className="h-5 w-5 text-muted-foreground" />
            )}
            <div className="text-sm">
              <span className="font-medium">Tendencia Punto Cero: </span>
              {trend.direction === 'increasing'
                ? `Creciente (+${trend.slopePerHour} pz/hora)`
                : trend.direction === 'decreasing'
                ? `Decreciente (${trend.slopePerHour} pz/hora)`
                : 'Estable'}
              {trend.projectedPctIn2h != null && (
                <span className="text-muted-foreground ml-2">
                  | Proyección 2h: {trend.projectedPctIn2h}%
                </span>
              )}
              {trend.anomalyBuckets.length > 0 && (
                <Badge variant="destructive" className="ml-2 text-[10px]">
                  {trend.anomalyBuckets.length} anomalía(s)
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ——— TABS ——— */}
      <Tabs defaultValue="punto-cero" className="w-full">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="punto-cero" className="text-xs">Punto Cero</TabsTrigger>
          <TabsTrigger value="distribuciones" className="text-xs">Distribuciones</TabsTrigger>
          <TabsTrigger value="matriz" className="text-xs">Matriz Q×C</TabsTrigger>
          <TabsTrigger value="balance" className="text-xs">Balance Gates</TabsTrigger>
          <TabsTrigger value="insights" className="text-xs">Insights</TabsTrigger>
        </TabsList>

        {/* PUNTO CERO */}
        <TabsContent value="punto-cero" className="space-y-4">
          {/* Clasificación 100% Punto Cero */}
          {analytics.pointZeroClassification.causes.length > 0 && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-red-500" />
                  Clasificación Punto Cero — 100%
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString()} piezas totales en Punto Cero
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Donut chart */}
                  <div className="flex items-center justify-center">
                    <div className="w-full max-w-[280px]">
                      <Doughnut
                        data={classificationChartData}
                        options={{
                          responsive: true,
                          plugins: {
                            legend: { position: 'bottom', labels: { font: { size: 11 } } },
                            tooltip: {
                              callbacks: {
                                label: (ctx) => {
                                  const cause = analytics.pointZeroClassification.causes[ctx.dataIndex]
                                  return cause
                                    ? `${cause.label}: ${cause.pieces.toLocaleString()} pz (${cause.pctOfPointZero}%)`
                                    : ''
                                },
                              },
                            },
                          },
                        }}
                      />
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 px-2">Causa</th>
                          <th className="py-2 px-2 text-right">Piezas</th>
                          <th className="py-2 px-2 text-right">% P.Cero</th>
                          <th className="py-2 px-2 text-right">% Total</th>
                          <th className="py-2 px-2 text-right">Peso (kg)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.pointZeroClassification.causes.map((c, i) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2">
                              <div>
                                <span className="font-medium">{c.label}</span>
                                <p className="text-[10px] text-muted-foreground">{c.description}</p>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right font-medium">{c.pieces.toLocaleString()}</td>
                            <td className="py-2 px-2 text-right">
                              <span className={cn(
                                'font-medium',
                                c.pctOfPointZero >= 50 && 'text-red-600',
                                c.pctOfPointZero >= 10 && c.pctOfPointZero < 50 && 'text-amber-600',
                              )}>
                                {c.pctOfPointZero}%
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right text-muted-foreground">{c.pctOfTotal}%</td>
                            <td className="py-2 px-2 text-right">{c.weightKg ? c.weightKg.toLocaleString() : '—'}</td>
                          </tr>
                        ))}
                        {/* Total row */}
                        <tr className="border-t-2 font-bold bg-muted/50">
                          <td className="py-2 px-2">TOTAL</td>
                          <td className="py-2 px-2 text-right">{analytics.pointZeroClassification.totalPointZeroPieces.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right">100%</td>
                          <td className="py-2 px-2 text-right">{kpis.pointZeroPct}%</td>
                          <td className="py-2 px-2 text-right">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fuera de Rango — Distribución por Peso */}
          {analytics.pointZeroClassification.outOfRangeByWeight.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Fuera de Rango — Distribución por Peso
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Piezas clasificadas como &quot;fuera de rango&quot; agrupadas por el calibre al que pertenecerían según su peso
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Bar chart */}
                  <Bar
                    data={{
                      labels: analytics.pointZeroClassification.outOfRangeByWeight.map((d) => d.rangeLabel),
                      datasets: [
                        {
                          label: 'Piezas fuera de rango',
                          data: analytics.pointZeroClassification.outOfRangeByWeight.map((d) => d.pieces),
                          backgroundColor: 'rgba(245,158,11,0.7)',
                        },
                      ],
                    }}
                    options={{
                      indexAxis: 'y',
                      responsive: true,
                      plugins: { legend: { display: false } },
                      scales: { x: { beginAtZero: true } },
                    }}
                  />

                  {/* Weight ranges reference table */}
                  <div>
                    <p className="text-xs font-medium mb-2">Rangos de Calibre (referencia)</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="py-1 px-2 text-left">Calibre</th>
                          <th className="py-1 px-2 text-right">Mín (g)</th>
                          <th className="py-1 px-2 text-right">Máx (g)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.pointZeroClassification.calibreWeightRanges.map((r, i) => (
                          <tr key={i} className="border-b">
                            <td className="py-1 px-2">{r.calibre}</td>
                            <td className="py-1 px-2 text-right">{r.minGrams.toLocaleString()}</td>
                            <td className="py-1 px-2 text-right">{r.maxGrams.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Out of range detail table */}
                    <p className="text-xs font-medium mt-4 mb-2">Desglose Fuera de Rango</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="py-1 px-2 text-left">Rango</th>
                          <th className="py-1 px-2 text-right">Piezas</th>
                          <th className="py-1 px-2 text-right">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.pointZeroClassification.outOfRangeByWeight.map((d, i) => (
                          <tr key={i} className="border-b">
                            <td className="py-1 px-2">{d.rangeLabel}</td>
                            <td className="py-1 px-2 text-right">{d.pieces.toLocaleString()}</td>
                            <td className="py-1 px-2 text-right">{d.pct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Punto Cero por Causa (original) + Serie temporal */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Punto Cero por Error (detalle)</CardTitle></CardHeader>
              <CardContent>
                {analytics.pointZeroByError.length > 0 ? (
                  <Bar
                    data={pointZeroErrorData}
                    options={{
                      indexAxis: 'y',
                      responsive: true,
                      plugins: { legend: { display: false } },
                      scales: { x: { beginAtZero: true } },
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin datos de Punto Cero</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Punto Cero en el Tiempo</CardTitle></CardHeader>
              <CardContent>
                {analytics.timeSeriesPointZero.length > 0 ? (
                  <Line
                    data={timeSeriesData}
                    options={{
                      responsive: true,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: {
                          type: 'time',
                          time: { unit: config.intervalMinutes === 60 ? 'hour' : 'minute' },
                        },
                        y: { beginAtZero: true },
                      },
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin serie temporal</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Punto Zero table */}
          {analytics.pointZeroByError.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Desglose por Error Original</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 px-2">Error</th>
                        <th className="py-2 px-2 text-right">Piezas</th>
                        <th className="py-2 px-2 text-right">%</th>
                        <th className="py-2 px-2 text-right">Peso (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.pointZeroByError.map((e, i) => (
                        <tr key={i} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-2">{e.error}</td>
                          <td className="py-2 px-2 text-right">{e.pieces.toLocaleString()}</td>
                          <td className="py-2 px-2 text-right">{e.pct}%</td>
                          <td className="py-2 px-2 text-right">
                            {e.weightKg ? e.weightKg.toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* DISTRIBUCIONES */}
        <TabsContent value="distribuciones" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Distribución por Calibre</CardTitle></CardHeader>
              <CardContent>
                {analytics.distributionByCalibre.length > 0 ? (
                  <Doughnut
                    data={calibreChartData}
                    options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Distribución por Calidad</CardTitle></CardHeader>
              <CardContent>
                {analytics.distributionByQuality.length > 0 ? (
                  <Doughnut
                    data={qualityChartData}
                    options={{ responsive: true, plugins: { legend: { position: 'bottom' } } }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Distribution tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Tabla Calibre</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-1 px-2">Calibre</th>
                      <th className="py-1 px-2 text-right">Piezas</th>
                      <th className="py-1 px-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.distributionByCalibre.map((d, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1 px-2">{d.key}</td>
                        <td className="py-1 px-2 text-right">{d.pieces.toLocaleString()}</td>
                        <td className="py-1 px-2 text-right">{d.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Tabla Calidad</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-1 px-2">Calidad</th>
                      <th className="py-1 px-2 text-right">Piezas</th>
                      <th className="py-1 px-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.distributionByQuality.map((d, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1 px-2">{d.key}</td>
                        <td className="py-1 px-2 text-right">{d.pieces.toLocaleString()}</td>
                        <td className="py-1 px-2 text-right">{d.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* MATRIZ Q×C */}
        <TabsContent value="matriz">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Table2 className="h-4 w-4" />
                Matriz Calidad × Calibre
              </CardTitle>
            </CardHeader>
            <CardContent>
              {matrixQualities.length > 0 && matrixCalibres.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 px-2 text-left">Calidad \ Calibre</th>
                        {matrixCalibres.map((c) => (
                          <th key={c} className="py-2 px-2 text-center">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrixQualities.map((q) => (
                        <tr key={q} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-2 font-medium">{q}</td>
                          {matrixCalibres.map((c) => {
                            const cell = analytics.matrixQualityCalibre[q]?.[c]
                            return (
                              <td key={c} className="py-2 px-2 text-center">
                                {cell ? (
                                  <div>
                                    <span className="font-medium">{cell.pieces.toLocaleString()}</span>
                                    <span className="text-muted-foreground text-xs ml-1">({cell.pct}%)</span>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Matriz no disponible. Cargue archivo pieza-pieza o % Calidad.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* BALANCE GATES */}
        <TabsContent value="balance">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Balance Demanda vs Gates Asignados
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.gateBalance.length > 0 ? (
                <div className="space-y-3">
                  {analytics.gateBalance.map((gb, i) => (
                    <div
                      key={i}
                      className={cn(
                        'p-3 rounded-lg border flex items-start gap-3',
                        gb.severity === 'critical'
                          ? 'border-red-300 bg-red-50 dark:bg-red-900/10'
                          : gb.severity === 'warn'
                          ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/10'
                          : 'border-muted bg-muted/30',
                      )}
                    >
                      {gb.severity === 'critical' ? (
                        <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                      ) : gb.severity === 'warn' ? (
                        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                      ) : (
                        <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{gb.calibre}</Badge>
                          <span className="text-sm font-medium">
                            Demanda {gb.demandPct}% — {gb.gatesAssigned} gate(s)
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{gb.message}</p>
                      </div>
                    </div>
                  ))}

                  {/* Bar chart: demand vs gates */}
                  <div className="mt-4">
                    <Bar
                      data={{
                        labels: analytics.gateBalance.map((g) => g.calibre),
                        datasets: [
                          {
                            label: 'Demanda (%)',
                            data: analytics.gateBalance.map((g) => g.demandPct),
                            backgroundColor: 'rgba(59,130,246,0.7)',
                          },
                          {
                            label: 'Gates Asignados',
                            data: analytics.gateBalance.map((g) => g.gatesAssigned),
                            backgroundColor: 'rgba(16,185,129,0.7)',
                          },
                        ],
                      }}
                      options={{
                        responsive: true,
                        plugins: { legend: { position: 'bottom' } },
                        scales: { y: { beginAtZero: true } },
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Configure los gates para ver el balance de demanda.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* INSIGHTS */}
        <TabsContent value="insights" className="space-y-4">
          {/* Deterministic insights */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Insights Determinísticos ({insights.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No se detectaron alertas con los umbrales actuales.
                </p>
              )}
              {insights.map((ins) => (
                <InsightCard key={ins.id} insight={ins} />
              ))}
            </CardContent>
          </Card>

          {/* AI Panel */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Diagnóstico IA
              </CardTitle>
              <Button
                size="sm"
                onClick={handleAnalyzeAI}
                disabled={aiLoading}
              >
                {aiLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Brain className="h-4 w-4 mr-1" />
                )}
                {aiLoading ? 'Analizando...' : 'Analizar con IA'}
              </Button>
            </CardHeader>
            <CardContent>
              {!aiOutput && !aiError && !aiLoading && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Presiona "Analizar con IA" para obtener un diagnóstico basado en los datos cargados.
                </p>
              )}

              {aiError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-300 text-sm">
                  <div className="flex items-center gap-2 text-red-600">
                    <XCircle className="h-4 w-4" />
                    <span className="font-medium">Error de parseo IA</span>
                  </div>
                  <p className="mt-1 text-xs text-red-500">{aiError}</p>
                  {aiRawText && (
                    <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-40">
                      {aiRawText}
                    </pre>
                  )}
                </div>
              )}

              {aiOutput && <AIOutputPanel output={aiOutput} />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function KPICard({
  label,
  value,
  icon: Icon,
  severity,
}: {
  label: string
  value: string
  icon: React.ElementType
  severity?: 'ok' | 'warn' | 'critical'
}) {
  return (
    <Card
      className={cn(
        severity === 'critical' && 'border-red-300',
        severity === 'warn' && 'border-amber-300',
      )}
    >
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p
          className={cn(
            'text-lg font-bold',
            severity === 'critical' && 'text-red-600',
            severity === 'warn' && 'text-amber-600',
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function InsightCard({ insight }: { insight: DeterministicInsight }) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border',
        insight.severity === 'critical'
          ? 'border-red-300 bg-red-50 dark:bg-red-900/10'
          : insight.severity === 'warn'
          ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/10'
          : 'border-blue-200 bg-blue-50 dark:bg-blue-900/10',
      )}
    >
      <div className="flex items-center gap-2">
        <Badge
          variant={insight.severity === 'critical' ? 'destructive' : 'outline'}
          className="text-[10px]"
        >
          {insight.severity.toUpperCase()}
        </Badge>
        <span className="text-sm font-medium">{insight.title}</span>
      </div>
      <div className="mt-2 space-y-0.5">
        {insight.evidence.map((e, i) => (
          <p key={i} className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="text-blue-500">📊</span> {e}
          </p>
        ))}
      </div>
      <div className="mt-2 space-y-0.5">
        {insight.recommendations.map((r, i) => (
          <p key={i} className="text-xs flex items-center gap-1">
            <span className="text-green-500">💡</span> {r}
          </p>
        ))}
      </div>
    </div>
  )
}

function AIOutputPanel({ output }: { output: AIGraderOutput }) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div>
        <h4 className="text-sm font-medium mb-2">Resumen</h4>
        <ul className="space-y-1">
          {output.summaryBullets.map((b, i) => (
            <li key={i} className="text-sm text-muted-foreground flex gap-2">
              <span className="shrink-0">•</span>
              {b}
            </li>
          ))}
        </ul>
      </div>

      {/* Causes */}
      {output.likelyCauses.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Causas Probables</h4>
          <div className="space-y-2">
            {output.likelyCauses.map((c, i) => (
              <div key={i} className="p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      c.confidence === 'high' && 'text-red-600',
                      c.confidence === 'medium' && 'text-amber-600',
                    )}
                  >
                    {c.confidence}
                  </Badge>
                  <span className="text-sm font-medium">{c.cause}</span>
                </div>
                {c.evidence.length > 0 ? (
                  <div className="mt-1 space-y-0.5">
                    {c.evidence.map((e, j) => (
                      <p key={j} className="text-xs text-muted-foreground ml-4">📊 {e}</p>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-amber-500 mt-1 ml-4">
                    ⚠ Sin evidencia numérica
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended Actions */}
      {output.recommendedActions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Acciones Recomendadas</h4>
          <div className="space-y-2">
            {output.recommendedActions.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] mt-0.5',
                    a.priority === 'high' && 'text-red-600 border-red-300',
                    a.priority === 'medium' && 'text-amber-600 border-amber-300',
                  )}
                >
                  {a.priority}
                </Badge>
                <div>
                  <span className="font-medium">{a.action}</span>
                  <p className="text-xs text-muted-foreground">{a.why}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Checklist */}
      {output.whatToCheckNext.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Qué Verificar</h4>
          <ul className="space-y-1">
            {output.whatToCheckNext.map((c, i) => (
              <li key={i} className="text-sm text-muted-foreground flex gap-2">
                <span>☐</span> {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disclaimers */}
      {output.disclaimers && output.disclaimers.length > 0 && (
        <div className="p-2 bg-amber-50 dark:bg-amber-900/10 rounded-lg">
          <p className="text-xs font-medium text-amber-700 mb-1">Advertencias:</p>
          {output.disclaimers.map((d, i) => (
            <p key={i} className="text-xs text-amber-600">{d}</p>
          ))}
        </div>
      )}
    </div>
  )
}
