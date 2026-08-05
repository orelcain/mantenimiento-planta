/**
 * Renderiza el comparativo de período como PNG.
 *
 * Comparte con el resumen de turno todos los bloques estructurales
 * (`graderExecutiveCanvas`) para que los dos papeles se lean como parte del
 * mismo sistema. Lo propio de esta hoja es la tabla de turnos, que el resumen
 * de turno no tiene porque habla de uno solo.
 *
 * El contenido viene entero de `buildPeriodSummary`: acá no se decide nada, solo
 * se dibuja.
 */

import type { PeriodSummary, PeriodRow } from '@/services/grader/graderPeriodSummary'
import type { TurnSeverity } from '@/services/grader/graderExecutiveSummary'
import {
  W, PAD, CONTENT_W, INK, MUTE, RULE, OK, WARN, BAD,
  SANS, MONO, wrap, measureCtx, createSheet, downloadCanvas, toneColor,
  drawSheetHeader, drawVerdict, drawKpiStrip, drawSectionTitle, drawAskBox, drawFooter,
  measureVerdict, HEADER_H, KPI_STRIP_H, SECTION_TITLE_H, FOOTER_H,
} from '@/services/grader/graderExecutiveCanvas'

const SEVERITY_COLOR: Record<TurnSeverity, string> = {
  ok: OK, warn: WARN, critical: BAD,
}

/** Columnas de la tabla, medidas desde el margen izquierdo. */
const COL_CYCLES = PAD + 560
const COL_UPTIME = PAD + 680
const COL_BREAK = PAD + 790
const COL_FLAG = PAD + 820
const ROW_H = 36
const COL_HEADER_H = 26

function drawColumnHeaders(ctx: CanvasRenderingContext2D, y: number): number {
  ctx.font = MONO(600, 11)
  ctx.fillStyle = MUTE
  ctx.fillText('TURNO', PAD, y)
  ctx.textAlign = 'right'
  ctx.fillText('CICLOS', COL_CYCLES, y)
  ctx.fillText('UPTIME', COL_UPTIME, y)
  ctx.fillText('AVERÍAS', COL_BREAK, y)
  ctx.textAlign = 'left'
  ctx.fillText('ESTADO', COL_FLAG, y)
  return y + COL_HEADER_H
}

function drawRow(ctx: CanvasRenderingContext2D, r: PeriodRow, y: number): number {
  const strong = r.tone === 'bad'

  ctx.font = SANS(strong ? 600 : 400, 18)
  ctx.fillStyle = INK
  ctx.fillText(r.label, PAD, y + 4)

  ctx.font = MONO(strong ? 600 : 400, 18)
  ctx.textAlign = 'right'
  ctx.fillStyle = INK
  ctx.fillText(r.cycles.toLocaleString('es-CL'), COL_CYCLES, y + 4)
  ctx.fillStyle = MUTE
  ctx.fillText(r.uptimePct != null ? `${Math.round(r.uptimePct)}%` : '—', COL_UPTIME, y + 4)
  // Sin Excel del Grader no hay averías que contar. Un "0" acá se leería como
  // "no hubo averías", que es una afirmación que el dato no sostiene.
  ctx.fillText(r.breakdowns != null ? String(r.breakdowns) : '—', COL_BREAK, y + 4)
  ctx.textAlign = 'left'

  if (r.flag !== '—') {
    ctx.font = MONO(600, 13)
    ctx.fillStyle = toneColor(r.tone)
    ctx.fillText(r.flag, COL_FLAG, y + 6)
  }

  ctx.strokeStyle = RULE
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, y + ROW_H - 6.5)
  ctx.lineTo(W - PAD, y + ROW_H - 6.5)
  ctx.stroke()

  return y + ROW_H
}

export interface ExportPeriodPngOptions {
  summary: PeriodSummary
  /** Sufijo del archivo. Sin esto sale `resumen-periodo.png` a secas. */
  filenameSuffix?: string
  /** Para tests: devuelve el canvas en vez de descargarlo. */
  returnCanvas?: boolean
}

export function exportPeriodSummaryPng(opts: ExportPeriodPngOptions): HTMLCanvasElement {
  const { summary: s, filenameSuffix, returnCanvas } = opts

  // ── medición previa: el canvas se borra al redimensionarse ─────────────────
  const meas = measureCtx()
  meas.font = SANS(600, 34)
  const verdictLines = wrap(meas, s.verdict, CONTENT_W - 24)
  meas.font = SANS(400, 19)
  const detailLines = s.verdictDetail ? wrap(meas, s.verdictDetail, CONTENT_W - 24) : []
  meas.font = SANS(400, 16)
  const noteLines = wrap(meas, s.rowsNote, CONTENT_W)
  meas.font = SANS(600, 20)
  const askLines = wrap(meas, s.ask, CONTENT_W - 32)

  let H = PAD
  H += HEADER_H
  H += measureVerdict(verdictLines.length, detailLines.length)
  H += s.kpis.length > 0 ? KPI_STRIP_H + 28 : 0
  H += s.rows.length > 0
    ? SECTION_TITLE_H + COL_HEADER_H + s.rows.length * ROW_H + noteLines.length * 24 + 30
    : 0
  H += 24 + askLines.length * 28 + 30
  H += FOOTER_H
  H += PAD

  const { canvas, ctx } = createSheet(H)

  let y = PAD
  y = drawSheetHeader(ctx, s.title, s.subtitle, y)
  y = drawVerdict(ctx, {
    label: 'TENDENCIA DEL PERÍODO',
    lines: verdictLines,
    detailLines,
    color: SEVERITY_COLOR[s.severity],
  }, y)
  y = drawKpiStrip(ctx, s.kpis, y)

  if (s.rows.length > 0) {
    y = drawSectionTitle(ctx, s.tableTitle, y)
    y = drawColumnHeaders(ctx, y)
    for (const r of s.rows) y = drawRow(ctx, r, y)

    y += 10
    ctx.font = SANS(400, 16)
    ctx.fillStyle = MUTE
    for (const line of noteLines) { ctx.fillText(line, PAD, y); y += 24 }
    y += 20
  }

  y = drawAskBox(ctx, { label: 'LO QUE MUESTRAN LOS DATOS', lines: askLines }, y)
  drawFooter(ctx, s.sourceNote, `Generado ${s.generatedAt.toLocaleString('es-CL')}`, y)

  if (returnCanvas) return canvas
  downloadCanvas(canvas, `resumen-periodo${filenameSuffix ? `_${filenameSuffix}` : ''}.png`)
  return canvas
}
