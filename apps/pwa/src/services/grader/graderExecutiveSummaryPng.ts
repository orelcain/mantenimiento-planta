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
 */

import type { ExecutiveSummary, TurnSeverity } from '@/services/grader/graderExecutiveSummary'

// Lienzo A4 apaisado-ish a 2x, cómodo de leer en un teléfono sin hacer zoom.
const W = 1240
const PAD = 56
const SCALE = 2

const INK = '#14202c'
const MUTE = '#5c6b7a'
const RULE = '#d4dde6'
const PAPER = '#ffffff'
const BRAND = '#2E75B6'
const OK = '#679576'
const WARN = '#a88c64'
const BAD = '#b0706d'

const SEVERITY_COLOR: Record<TurnSeverity, string> = {
  ok: OK, warn: WARN, critical: BAD,
}

const SANS = (w: number, s: number) => `${w} ${s}px "IBM Plex Sans", system-ui, sans-serif`
const MONO = (w: number, s: number) => `${w} ${s}px "IBM Plex Mono", ui-monospace, monospace`

/** Parte un texto en líneas que quepan en `maxW`. Devuelve las líneas. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line)
      line = w
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
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
  const meas = document.createElement('canvas').getContext('2d')!
  const contentW = W - PAD * 2

  meas.font = SANS(600, 34)
  const verdictLines = wrap(meas, s.verdict, contentW - 24)
  meas.font = SANS(400, 19)
  const detailLines = s.verdictDetail ? wrap(meas, s.verdictDetail, contentW - 24) : []
  const causeLines = wrap(meas, s.cause, contentW)
  const askLines = wrap(meas, s.ask, contentW - 32)
  const maintLines = s.maintenance.map(m => wrap(meas, m, contentW - 48))

  let H = PAD
  H += 74                                    // encabezado
  H += 22 + verdictLines.length * 42 + detailLines.length * 28 + 26   // veredicto
  H += s.kpis.length > 0 ? 108 + 28 : 0      // KPIs
  H += s.machines.length > 0
    ? 34 + 30 + s.machines.length * 36 + causeLines.length * 26 + 24
    : 0
  H += 34 + 18 + maintLines.reduce((a, l) => a + l.length * 27, 0) + 26  // Mantención
  H += 24 + askLines.length * 28 + 30        // pedido
  H += 46                                    // pie
  H += PAD

  // ── lienzo ────────────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = Math.round(H) * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'top'

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, H)

  let y = PAD
  const sev = SEVERITY_COLOR[s.severity]

  // ── encabezado ────────────────────────────────────────────────────────────
  ctx.fillStyle = INK
  ctx.font = SANS(600, 30)
  ctx.fillText(s.title, PAD, y)
  ctx.font = MONO(400, 17)
  ctx.fillStyle = MUTE
  ctx.fillText(s.subtitle, PAD, y + 38)

  ctx.textAlign = 'right'
  ctx.font = MONO(600, 15)
  ctx.fillStyle = MUTE
  ctx.fillText('ANTARFOOD', W - PAD, y + 2)
  ctx.font = MONO(400, 14)
  ctx.fillText('Mantención Planta', W - PAD, y + 22)
  ctx.textAlign = 'left'

  y += 66
  ctx.fillStyle = INK
  ctx.fillRect(PAD, y, contentW, 2.5)
  y += 24

  // ── veredicto ─────────────────────────────────────────────────────────────
  const verdictTop = y
  ctx.font = MONO(600, 13)
  ctx.fillStyle = MUTE
  ctx.fillText('RESULTADO DEL TURNO', PAD + 20, y)
  y += 24

  ctx.font = SANS(600, 34)
  ctx.fillStyle = INK
  for (const line of verdictLines) { ctx.fillText(line, PAD + 20, y); y += 42 }

  if (detailLines.length) {
    y += 6
    ctx.font = SANS(400, 19)
    ctx.fillStyle = MUTE
    for (const line of detailLines) { ctx.fillText(line, PAD + 20, y); y += 28 }
  }
  // Barra de severidad a la izquierda: el color entra por forma, no por fondo.
  ctx.fillStyle = sev
  ctx.fillRect(PAD, verdictTop - 4, 5, y - verdictTop + 8)
  y += 26

  // ── KPIs ──────────────────────────────────────────────────────────────────
  if (s.kpis.length > 0) {
    const cols = s.kpis.length
    const cw = contentW / cols
    ctx.strokeStyle = RULE
    ctx.lineWidth = 1
    ctx.strokeRect(PAD + 0.5, y + 0.5, contentW - 1, 100)

    s.kpis.forEach((k, i) => {
      const x = PAD + i * cw
      if (i > 0) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + 100); ctx.stroke()
      }
      ctx.font = MONO(600, 12)
      ctx.fillStyle = MUTE
      ctx.fillText(k.label.toUpperCase(), x + 16, y + 15)

      ctx.font = MONO(600, 36)
      ctx.fillStyle = k.tone === 'bad' ? BAD : k.tone === 'ok' ? OK : k.tone === 'warn' ? WARN : INK
      ctx.fillText(k.value, x + 16, y + 36)

      ctx.font = SANS(400, 14)
      ctx.fillStyle = MUTE
      const ctxLines = wrap(ctx, k.context, cw - 32)
      ctx.fillText(ctxLines[0] ?? '', x + 16, y + 78)
    })
    y += 128
  }

  // ── máquinas ──────────────────────────────────────────────────────────────
  if (s.machines.length > 0) {
    ctx.font = MONO(600, 13)
    ctx.fillStyle = MUTE
    ctx.fillText('DE DÓNDE SALIÓ LA PÉRDIDA', PAD, y)
    y += 22
    ctx.strokeStyle = RULE
    ctx.beginPath(); ctx.moveTo(PAD, y + 0.5); ctx.lineTo(W - PAD, y + 0.5); ctx.stroke()
    y += 12

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
      ctx.fillStyle = '#e9edf1'
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
  ctx.fillStyle = '#f4f7fa'
  const mantH = 18 + maintLines.reduce((a, l) => a + l.length * 27, 0) + 34
  ctx.fillRect(PAD, y, contentW, mantH)
  ctx.strokeStyle = RULE
  ctx.strokeRect(PAD + 0.5, y + 0.5, contentW - 1, mantH - 1)

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
  y = mantTop + mantH + 24

  // ── pedido ────────────────────────────────────────────────────────────────
  const askH = 22 + askLines.length * 28 + 18
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.strokeRect(PAD + 1, y + 1, contentW - 2, askH - 2)
  ctx.lineWidth = 1

  ctx.font = MONO(600, 12)
  ctx.fillStyle = MUTE
  ctx.fillText('LO QUE SE NECESITA', PAD + 18, y + 14)
  ctx.font = SANS(600, 20)
  ctx.fillStyle = INK
  let ay = y + 38
  for (const line of askLines) { ctx.fillText(line, PAD + 18, ay); ay += 28 }
  y += askH + 22

  // ── pie ───────────────────────────────────────────────────────────────────
  ctx.strokeStyle = RULE
  ctx.beginPath(); ctx.moveTo(PAD, y + 0.5); ctx.lineTo(W - PAD, y + 0.5); ctx.stroke()
  y += 12
  ctx.font = MONO(400, 13)
  ctx.fillStyle = MUTE
  ctx.fillText(s.sourceNote, PAD, y)
  ctx.textAlign = 'right'
  ctx.fillText(`Generado ${s.generatedAt.toLocaleString('es-CL')}`, W - PAD, y)
  ctx.textAlign = 'left'

  if (returnCanvas) return canvas

  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `resumen-turno${filenameSuffix ? `_${filenameSuffix}` : ''}.png`
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')

  return canvas
}
