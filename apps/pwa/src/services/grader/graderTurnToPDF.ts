/**
 * Export PDF de resumen de turno (M17).
 *
 * Secciones:
 *   1. Encabezado  — identificación del turno
 *   2. Timeline    — imagen PNG del gráfico ECharts (opcional)
 *   3. KPIs        — métricas clave (P0%, piezas, peso, throughput, duración)
 *   4. Pausas      — tabla con hora, duración, tier, tag y nota
 *   5. Gates       — distribución de piezas por compuerta (si disponible)
 *   6. Top P0      — causas de Punto Cero por frecuencia
 *   7. Upstream    — disponibilidad + ciclos de las Evisceradoras Baader 142 (si disponible)
 *
 * Carga jsPDF y jspdf-autotable dinámicamente (no aumenta el bundle inicial).
 */

import type { GraderDailySummary, Pause } from './types'
import { buildExecutiveSummary } from '@/services/grader/graderExecutiveSummary'
import { drawExecutivePdfPage, type PdfDoc } from '@/services/grader/graderExecutivePdfPage'
import { computeMaintenanceReliability } from '@/services/grader/graderReliability'
import { displayShiftName } from '@/services/grader/graderShiftDisplay'
import type { UpstreamLineSnapshot } from '../shoplogix/types'
import { fmtTime as fmtHHMM, fmtDurationSec as fmtDur } from './graderTimeFormat'
import { pauseTierLabel } from './graderPauseTiers'
import { DEFAULT_P0_ALERT_PCT, DEFAULT_P0_CRITICAL_PCT } from './graderP0Thresholds'

// Mínimo de autoTable para typing (acceso a lastAutoTable.finalY)
interface AutoTableDoc {
  lastAutoTable: { finalY: number }
}

// ── Helpers de formato ────────────────────────────────────────────────────────

function n(v: number | undefined, decimals = 0): string {
  if (v === undefined || isNaN(v)) return '—'
  return v.toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function exportTurnToPDF(params: {
  summary: GraderDailySummary
  pauses: Pause[]
  /** Map<tagId, tagLabel> para mostrar nombre legible en lugar de id. */
  tagLabels?: Map<string, string>
  /** Data URL PNG del gráfico ECharts (timeline P0% minuto a minuto). Si se provee, se inserta en el PDF antes de los KPIs. */
  chartImageDataUrl?: string | null
  /** Snapshot de la línea upstream (Evisceradoras Baader 142). Si se provee, se agrega sección 7. */
  upstreamSnapshot?: UpstreamLineSnapshot | null
  /**
   * Ventana REAL del turno, para el resumen ejecutivo. Si no se pasa, la
   * página 1 cae a los `startAt`/`endAt` del summary del Grader.
   */
  shiftStart?: Date | null
  shiftEnd?: Date | null
}): Promise<void> {
  const { summary, pauses, tagLabels, chartImageDataUrl, upstreamSnapshot } = params

  // Carga dinámica — no penaliza el bundle principal
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as InstanceType<typeof jsPDF> & AutoTableDoc
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const MARGIN = 14
  let y = 14

  const shiftLabel = summary.shiftId
  const dateKey    = summary.dateKey
  const generated  = new Date().toLocaleString('es-CL')

  // ── 1. Página ejecutiva ────────────────────────────────────────────────────
  // Va PRIMERO: antes el PDF abría con el timeline minuto a minuto y había que
  // leer tres páginas para saber si el turno estuvo bien o mal. Comparte modelo
  // con el PNG (`buildExecutiveSummary`), así que ambos cuentan lo mismo.
  const reliability = computeMaintenanceReliability([summary], [{ summary, pauses }])
  const executive = buildExecutiveSummary({
    summary,
    upstream: upstreamSnapshot,
    shiftLabel: displayShiftName(summary.shiftId),
    start: params.shiftStart ?? (summary.startAt ? new Date(summary.startAt) : null),
    end:   params.shiftEnd   ?? (summary.endAt   ? new Date(summary.endAt)   : null),
    reliability: {
      mttrMacroSec: reliability.mttrMacroSec,
      mtbfSec:      reliability.mtbfSec,
      macroCount:   reliability.eventsCount,
      microCount:   reliability.microCount,
      microSec:     reliability.microSec,
    },
    uptimePct: upstreamSnapshot ? upstreamSnapshot.lineAvailability * 100 : null,
  })

  drawExecutivePdfPage(doc as unknown as PdfDoc, executive)

  // El detalle arranca en hoja nueva: la página 1 se entrega sola.
  doc.addPage()
  y = 14

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`Detalle del turno — ${shiftLabel} · ${dateKey}`, MARGIN, y)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(92, 107, 122)
  doc.text(`Generado: ${generated}`, pageW - MARGIN, y, { align: 'right' })
  doc.setTextColor(0, 0, 0)
  y += 4
  doc.setDrawColor(180)
  doc.line(MARGIN, y, pageW - MARGIN, y)
  y += 6

  // ── 2. Timeline chart (si se provee imagen del gráfico ECharts) ───────────
  if (chartImageDataUrl) {
    const imgW = pageW - 2 * MARGIN
    const imgH = 52
    if (y + imgH + 12 > pageH - 20) { doc.addPage(); y = 14 }
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Timeline del turno (P0% por minuto)', MARGIN, y)
    y += 4
    try {
      doc.addImage(chartImageDataUrl, 'PNG', MARGIN, y, imgW, imgH)
      y += imgH + 8
    } catch {
      // Si la imagen falla (ECharts aún no renderizado), continuar sin ella
    }
  }

  // ── 3. KPIs ────────────────────────────────────────────────────────────────
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('KPIs del turno', MARGIN, y)
  y += 2

  const p0Color: [number, number, number] =
    summary.pointZeroPct >= DEFAULT_P0_CRITICAL_PCT ? [220, 38, 38]  // rojo
    : summary.pointZeroPct >= DEFAULT_P0_ALERT_PCT  ? [217, 119, 6]  // ámbar
    : [22, 163, 74]                                                    // verde

  // Las métricas del Grader (piezas, P0, pesos) solo se listan si hay Excel
  // cargado. Con `totalPieces = 0` la tabla imprimía "0 pz · 0,00% P0", que se
  // lee como "no hubo piezas malas" cuando en realidad NO SE MIDIÓ — es la
  // diferencia entre un turno perfecto y un turno sin datos.
  const hasGraderData = summary.totalPieces > 0
  const graderRows: Array<[string, string]> = hasGraderData
    ? [
        ['P0% (Punto Cero)', `${n(summary.pointZeroPct, 2)}%`],
        ['Piezas clasificadas (total)', n(summary.totalPieces)],
        ['Piezas P0', n(summary.pointZeroPieces)],
        ['Peso clasificado', `${n(summary.totalWeightKg, 1)} kg`],
        ['Peso promedio', `${n(summary.avgWeightGrams)} g`],
        ['Throughput', `${n(summary.productionRatePerHour)} pzas/h`],
      ]
    : [['Datos del Grader', 'sin Excel cargado']]

  autoTable(doc, {
    startY: y,
    head: [['Métrica', 'Valor']],
    body: [
      ...graderRows,
      ['Duración turno', summary.durationMinutes !== undefined ? fmtDur(summary.durationMinutes * 60) : '—'],
      ['Tiempo muerto total', summary.totalDeadTimeSec !== undefined ? fmtDur(summary.totalDeadTimeSec) : '—'],
      ['Cantidad de pausas', `${summary.pausesCount ?? pauses.length}`],
    ],
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { fontStyle: 'bold', textColor: hasGraderData ? p0Color : [92, 107, 122] } },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: MARGIN },
    tableWidth: 90,
  })
  y = doc.lastAutoTable.finalY + 8

  // ── 4. Pausas ──────────────────────────────────────────────────────────────
  if (pauses.length > 0) {
    if (y > pageH - 40) { doc.addPage(); y = 14 }
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Pausas del turno', MARGIN, y)
    y += 2

    const pauseRows = pauses.map((p) => {
      const tagLabel = p.tag
        ? (tagLabels?.get(p.tag) ?? p.tag)
        : p.autoTag
          ? `(${p.autoTag})`
          : '—'
      return [
        fmtHHMM(p.startAt),
        fmtHHMM(p.endAt),
        fmtDur(p.durationSec),
        pauseTierLabel(p.tier),
        tagLabel,
        p.note ?? '',
      ]
    })

    autoTable(doc, {
      startY: y,
      head: [['Inicio', 'Fin', 'Duración', 'Tipo', 'Tag', 'Nota']],
      body: pauseRows,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 16 },
        1: { cellWidth: 16 },
        2: { cellWidth: 22 },
        3: { cellWidth: 28 },
        4: { cellWidth: 28 },
        5: { cellWidth: 'auto' },
      },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── 5. Gates ───────────────────────────────────────────────────────────────
  if (summary.gateDistribution && summary.gateDistribution.length > 0) {
    if (y > pageH - 50) { doc.addPage(); y = 14 }
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Distribución por gate', MARGIN, y)
    y += 2

    autoTable(doc, {
      startY: y,
      head: [['Gate', 'Piezas', '%']],
      body: summary.gateDistribution.map(g => [
        `Gate ${g.gate}`,
        n(g.pieces),
        `${n(g.pct, 1)}%`,
      ]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
      margin: { left: MARGIN },
      tableWidth: 70,
    })
    y = doc.lastAutoTable.finalY + 8
  }

  // ── 6. Top causas P0 ───────────────────────────────────────────────────────
  if (summary.topP0Causes && summary.topP0Causes.length > 0) {
    if (y > pageH - 50) { doc.addPage(); y = 14 }
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Top causas Punto Cero', MARGIN, y)
    y += 2

    autoTable(doc, {
      startY: y,
      head: [['Causa', 'Piezas', '% P0']],
      body: summary.topP0Causes.map(c => [c.error, n(c.pieces), `${n(c.pct, 1)}%`]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
      margin: { left: MARGIN },
      tableWidth: 100,
    })
  }

  // ── 7. Línea upstream (Baader 142) ────────────────────────────────────────
  if (upstreamSnapshot && upstreamSnapshot.machines.length > 0) {
    if (y > pageH - 50) { doc.addPage(); y = 14 }
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Línea upstream — Evisceradoras Baader 142', MARGIN, y)
    y += 2

    const upstreamRows = upstreamSnapshot.machines.map((m) => {
      const bd = m.shiftRuntimeBreakdown
      const uptimePct = `${(m.shiftRuntime * 100).toFixed(1)}%`
      return [
        m.machineName,
        uptimePct,
        fmtDur(bd.uptimeSec),
        fmtDur(bd.breakSec),
        fmtDur(bd.downtimeSec),
        n(m.totalCycles),
      ]
    })

    autoTable(doc, {
      startY: y,
      head: [['Máquina', 'Uptime %', 'Produciendo', 'Descansos', 'Paros', 'Ciclos']],
      body: upstreamRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 24, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 24, halign: 'right' },
      },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = doc.lastAutoTable.finalY + 3

    // Nota de fuente de datos
    const syncedAt = upstreamSnapshot.machines[0]?.syncedAt
    const syncedLabel = syncedAt
      ? `Fuente: Shoplogix — sincronizado ${syncedAt instanceof Date
          ? syncedAt.toLocaleString('es-CL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
          : String(syncedAt)}`
      : 'Fuente: Shoplogix'
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(140)
    doc.text(syncedLabel, MARGIN, y)
    doc.setTextColor(0)
    y += 8
  }

  // ── Pie de página ──────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(160)
    doc.text(
      `${shiftLabel}  |  ${dateKey}  —  Pág. ${i}/${pageCount}  |  ${generated}`,
      pageW / 2,
      pageH - 6,
      { align: 'center' },
    )
    doc.setTextColor(0)
  }

  // Guardar
  const filename = `grader-turno_${dateKey}_${shiftLabel.replace(/\s+/g, '-')}.pdf`
  doc.save(filename)
}
