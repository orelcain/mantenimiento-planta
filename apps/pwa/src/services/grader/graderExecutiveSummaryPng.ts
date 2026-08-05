/**
 * Renderiza el resumen ejecutivo de un turno como PNG — el archivo que se
 * manda por Telegram y se entiende sin abrir nada.
 *
 * POR QUÉ CANVAS Y NO html2canvas
 * -------------------------------
 * html2canvas está en el proyecto, pero renderiza el DOM real: depende de qué
 * CSS soporte su parser, del tema activo y de que el nodo esté visible. Para un
 * entregable que se manda a gerencia eso es demasiada superficie de falla — un
 * PNG con el layout roto se descubre cuando ya lo mandaste.
 *
 * Acá el dibujo es explícito y determinista: mismas medidas siempre, sin
 * depender del DOM ni del tema de la app. El archivo va en claro a propósito —
 * se imprime y se pega en un informe.
 *
 * El contenido NO se decide acá: viene entero de `buildExecutiveSummary`. Este
 * módulo solo lo dibuja, así que el PNG y el PDF no pueden contar dos historias
 * distintas del mismo turno.
 *
 * Los bloques comunes con el comparativo de período (encabezado, veredicto,
 * KPIs, cierre, pie) viven en `graderExecutiveCanvas` — acá queda lo que es
 * propio del turno: la tabla de máquinas y la caja de Mantención.
 */

import type { ExecutiveSummary, TurnSeverity } from '@/services/grader/graderExecutiveSummary'
import {
  PAD, CONTENT_W, INK, MUTE, RULE, BRAND, OK, WARN, BAD, TRACK, PANEL,
  SANS, MONO, wrap, measureCtx, createSheet, downloadCanvas,
  drawSheetHeader, drawVerdict, drawKpiStrip, drawSectionTitle, drawAskBox, drawFooter,
  measureVerdict, HEADER_H, KPI_STRIP_H, SECTION_TITLE_H, FOOTER_H,
} from '@/services/grader/graderExecutiveCanvas'

const SEVERITY_COLOR: Record<TurnSeverity, string> = {
  ok: OK, warn: WARN, critical: BAD,
}

export interface ExportExecutivePngOptions {
  summary: ExecutiveSummary
  /** Sufijo del archivo. Sin esto sale `resumen-turno.png` a secas. */
  filenameSuffix?: string
  /** Para tests: devuelve el canvas en vez de descargarlo. */
  returnCanvas?: boolean
}

/**
 * Dibuja y descarga el PNG. Devuelve el canvas cuando `returnCanvas`, para
 * poder verificar el alto calculado sin tocar el DOM del navegador.
 */
export function exportExecutiveSummaryPng(
  opts: ExportExecutivePngOptions,
): HTMLCanvasElement {
  const { summary: s, filenameSuffix, returnCanvas } = opts

  // ── medición: se calcula el alto ANTES de dibujar ──────────────────────────
  // Un canvas se redimensiona borrando su contenido, así que no se puede
  // "crecer sobre la marcha": hay que saber el alto final de entrada.
  const meas = measureCtx()

  meas.font = SANS(600, 34)
  const verdictLines = wrap(meas, s.verdict, CONTENT_W - 24)
  meas.font = SANS(400, 19)
  const detailLines = s.verdictDetail ? wrap(meas, s.verdictDetail, CONTENT_W - 24) : []
  const causeLines = wrap(meas, s.cause, CONTENT_W)
  const askLines = wrap(meas, s.ask, CONTENT_W - 32)
  const maintLines = s.maintenance.map(m => wrap(meas, m, CONTENT_W - 48))

  const maintH = 18 + maintLines.reduce((a, l) => a + l.length * 27, 0) + 34

  let H = PAD
  H += HEADER_H
  H += measureVerdict(verdictLines.length, detailLines.length)
  H += s.kpis.length > 0 ? KPI_STRIP_H + 28 : 0
  H += s.machines.length > 0
    ? SECTION_TITLE_H + 30 + s.machines.length * 36 + causeLines.length * 26 + 24
    : 0
  H += SECTION_TITLE_H + 18 + maintLines.reduce((a, l) => a + l.length * 27, 0) + 26
  H += 24 + askLines.length * 28 + 30
  H += FOOTER_H
  H += PAD

  const { canvas, ctx } = createSheet(H)

  let y = PAD
  y = drawSheetHeader(ctx, s.title, s.subtitle, y)

  y = drawVerdict(ctx, {
    label: 'RESULTADO DEL TURNO',
    lines: verdictLines,
    detailLines,
    color: SEVERITY_COLOR[s.severity],
  }, y)

  y = drawKpiStrip(ctx, s.kpis, y)

  // ── máquinas ──────────────────────────────────────────────────────────────
  if (s.machines.length > 0) {
    y = drawSectionTitle(ctx, 'DE DÓNDE SALIÓ LA PÉRDIDA', y)

    const colCycles = PAD + 340
    const colUp = PAD + 470
    const colBar = PAD + 560
    const barW = 200

    for (const m of s.machines) {
      ctx.font = SANS(m.stopped ? 600 : 400, 19)
      ctx.fillStyle = INK
      ctx.fillText(m.name, PAD, y + 4)

      ctx.font = MONO(m.stopped ? 600 : 400, 19)
      ctx.textAlign = 'right'
      ctx.fillStyle = m.stopped ? BAD : INK
      ctx.fillText(m.cycles.toLocaleString('es-CL'), colCycles, y + 4)
      ctx.fillStyle = MUTE
      ctx.fillText(m.uptimePct != null ? `${Math.round(m.uptimePct)}%` : '—', colUp, y + 4)
      ctx.textAlign = 'left'

      // Barra de ritmo — vacía cuando la máquina no arrancó, que se lee solo.
      ctx.fillStyle = TRACK
      ctx.fillRect(colBar, y + 10, barW, 7)
      if (!m.stopped && m.ratePct != null) {
        const w = Math.max(2, Math.min(barW, (m.ratePct / 100) * barW))
        ctx.fillStyle = m.ratePct < 50 ? BAD : m.ratePct < 80 ? WARN : OK
        ctx.fillRect(colBar, y + 10, w, 7)
      }

      ctx.font = MONO(600, 15)
      ctx.fillStyle = m.stopped ? BAD : MUTE
      ctx.fillText(m.flag, colBar + barW + 16, y + 6)

      y += 36
    }

    y += 4
    ctx.font = SANS(400, 17)
    ctx.fillStyle = MUTE
    for (const line of causeLines) { ctx.fillText(line, PAD, y); y += 26 }
    y += 24
  }

  // ── Mantención ────────────────────────────────────────────────────────────
  const mantTop = y
  ctx.fillStyle = PANEL
  ctx.fillRect(PAD, y, CONTENT_W, maintH)
  ctx.strokeStyle = RULE
  ctx.strokeRect(PAD + 0.5, y + 0.5, CONTENT_W - 1, maintH - 1)

  y += 16
  ctx.font = MONO(700, 13)
  ctx.fillStyle = BRAND
  ctx.fillText('LO QUE HIZO MANTENCIÓN', PAD + 18, y)
  y += 26

  ctx.font = SANS(400, 18)
  for (const lines of maintLines) {
    lines.forEach((line, i) => {
      if (i === 0) {
        ctx.fillStyle = BRAND
        ctx.fillText('•', PAD + 18, y)
      }
      ctx.fillStyle = INK
      ctx.fillText(line, PAD + 36, y)
      y += 27
    })
  }
  y = mantTop + maintH + 24

  y = drawAskBox(ctx, { label: 'LO QUE SE NECESITA', lines: askLines }, y)

  drawFooter(ctx, s.sourceNote, `Generado ${s.generatedAt.toLocaleString('es-CL')}`, y)

  if (returnCanvas) return canvas
  downloadCanvas(canvas, `resumen-turno${filenameSuffix ? `_${filenameSuffix}` : ''}.png`)
  return canvas
}
