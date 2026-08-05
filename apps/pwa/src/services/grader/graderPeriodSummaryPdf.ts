/**
 * Comparativo de período como PDF de una hoja.
 *
 * Renderiza el MISMO modelo que dibuja el PNG (`buildPeriodSummary`), igual que
 * la página 1 del PDF de turno renderiza el mismo modelo que su PNG. Que el
 * modelo sea compartido es lo que impide que la imagen que se manda por
 * Telegram y el papel que se imprime cuenten dos historias distintas del mes.
 *
 * A diferencia del PDF de turno, este NO lleva páginas de detalle: el detalle
 * del período es la matriz de turnos, que se mira en pantalla. Acá va la
 * conclusión, que es lo que se entrega.
 */

import jsPDF from 'jspdf'
import type { PeriodSummary } from '@/services/grader/graderPeriodSummary'
import {
  type PdfDoc, type RGB, MARGIN,
  INK, MUTE, RULE, OK, WARN, BAD, TONE,
} from '@/services/grader/graderExecutivePdfPage'

const SEV: Record<PeriodSummary['severity'], RGB> = { ok: OK, warn: WARN, critical: BAD }

/** Alto de fila de la tabla, en mm. */
const ROW_H = 6

/**
 * Dibuja la hoja del período y devuelve la `y` donde termina.
 *
 * Separada del `export` para poder verificar el alto ocupado con un doble de
 * jsPDF, sin generar un archivo ni mirarlo a ojo.
 */
export function drawPeriodPdfPage(doc: PdfDoc, s: PeriodSummary): number {
  const pageW = doc.internal.pageSize.getWidth()
  const contentW = pageW - MARGIN * 2
  let y = MARGIN

  const setInk = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2])
  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2])

  // ── encabezado ────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  setInk(INK)
  doc.text(s.title, MARGIN, y + 4)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setInk(MUTE)
  doc.text(s.subtitle, MARGIN, y + 10)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('ANTARFOOD', pageW - MARGIN, y + 3, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.text('Mantención Planta', pageW - MARGIN, y + 7.5, { align: 'right' })

  y += 14
  setDraw(INK)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, y, pageW - MARGIN, y)
  doc.setLineWidth(0.2)
  y += 7

  // ── veredicto ─────────────────────────────────────────────────────────────
  const vTop = y - 3
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setInk(MUTE)
  doc.text('TENDENCIA DEL PERÍODO', MARGIN + 4, y)
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setInk(INK)
  const vLines = doc.splitTextToSize(s.verdict, contentW - 6)
  doc.text(vLines, MARGIN + 4, y)
  y += vLines.length * 6

  if (s.verdictDetail) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setInk(MUTE)
    const dLines = doc.splitTextToSize(s.verdictDetail, contentW - 6)
    doc.text(dLines, MARGIN + 4, y + 1)
    y += dLines.length * 4.4 + 1
  }

  // Barra de severidad: el color entra por forma, no por fondo, para que la
  // hoja siga siendo legible impresa en blanco y negro.
  setFill(SEV[s.severity])
  doc.rect(MARGIN, vTop, 1.4, y - vTop, 'F')
  y += 6

  // ── KPIs de Mantención ────────────────────────────────────────────────────
  if (s.kpis.length > 0) {
    const cw = contentW / s.kpis.length
    setDraw(RULE)
    doc.rect(MARGIN, y, contentW, 18)
    s.kpis.forEach((k, i) => {
      const x = MARGIN + i * cw
      if (i > 0) doc.line(x, y, x, y + 18)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      setInk(MUTE)
      doc.text(k.label.toUpperCase(), x + 3, y + 4.5)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      setInk(TONE[k.tone] ?? INK)
      doc.text(k.value, x + 3, y + 11.5)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      setInk(MUTE)
      doc.text(doc.splitTextToSize(k.context, cw - 6)[0] ?? '', x + 3, y + 15.5)
    })
    y += 24
  }

  // ── tabla de turnos ───────────────────────────────────────────────────────
  if (s.rows.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setInk(MUTE)
    doc.text(s.tableTitle, MARGIN, y)
    y += 2.5
    setDraw(RULE)
    doc.line(MARGIN, y, pageW - MARGIN, y)
    y += 4.5

    const colCycles = MARGIN + 108
    const colUptime = MARGIN + 128
    const colBreak = MARGIN + 146
    const colFlag = MARGIN + 150

    doc.setFontSize(6.5)
    setInk(MUTE)
    doc.text('TURNO', MARGIN, y)
    doc.text('CICLOS', colCycles, y, { align: 'right' })
    doc.text('UPTIME', colUptime, y, { align: 'right' })
    doc.text('AVERÍAS', colBreak, y, { align: 'right' })
    doc.text('ESTADO', colFlag, y)
    y += 4

    for (const r of s.rows) {
      const strong = r.tone === 'bad'
      doc.setFont('helvetica', strong ? 'bold' : 'normal')
      doc.setFontSize(9)
      setInk(INK)
      doc.text(r.label, MARGIN, y)
      doc.text(r.cycles.toLocaleString('es-CL'), colCycles, y, { align: 'right' })
      setInk(MUTE)
      doc.text(r.uptimePct != null ? `${Math.round(r.uptimePct)}%` : '—', colUptime, y, { align: 'right' })
      // Sin Excel del Grader no hay averías que contar: un "0" se leería como
      // "no hubo averías", que el dato no sostiene.
      doc.text(r.breakdowns != null ? String(r.breakdowns) : '—', colBreak, y, { align: 'right' })

      if (r.flag !== '—') {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        setInk(TONE[r.tone] ?? MUTE)
        doc.text(r.flag, colFlag, y)
      }

      setDraw(RULE)
      doc.line(MARGIN, y + 1.8, pageW - MARGIN, y + 1.8)
      y += ROW_H
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setInk(MUTE)
    const nLines = doc.splitTextToSize(s.rowsNote, contentW)
    doc.text(nLines, MARGIN, y + 1)
    y += nLines.length * 3.6 + 6
  }

  // ── cierre ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  const askLines = doc.splitTextToSize(s.ask, contentW - 8)
  const askH = 6 + askLines.length * 4.6 + 3
  setDraw(INK)
  doc.setLineWidth(0.4)
  doc.rect(MARGIN, y, contentW, askH)
  doc.setLineWidth(0.2)
  setInk(MUTE)
  doc.text('LO QUE MUESTRAN LOS DATOS', MARGIN + 4, y + 4)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  setInk(INK)
  doc.text(askLines, MARGIN + 4, y + 9)
  y += askH + 6

  // ── pie ───────────────────────────────────────────────────────────────────
  setDraw(RULE)
  doc.line(MARGIN, y, pageW - MARGIN, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setInk(MUTE)
  doc.text(s.sourceNote, MARGIN, y)
  doc.text(`Generado ${s.generatedAt.toLocaleString('es-CL')}`, pageW - MARGIN, y, { align: 'right' })

  return y
}

export interface ExportPeriodPdfOptions {
  summary: PeriodSummary
  filenameSuffix?: string
}

export function exportPeriodSummaryPdf(opts: ExportPeriodPdfOptions): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  drawPeriodPdfPage(doc as unknown as PdfDoc, opts.summary)
  doc.save(`resumen-periodo${opts.filenameSuffix ? `_${opts.filenameSuffix}` : ''}.pdf`)
}
