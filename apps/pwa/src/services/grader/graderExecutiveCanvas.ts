/**
 * Primitivas de dibujo de las hojas ejecutivas (turno y período).
 *
 * POR QUÉ EXISTE
 * --------------
 * El resumen de turno y el comparativo de período son DOS entregables distintos
 * que tienen que verse como parte de la misma familia: mismo encabezado, mismo
 * bloque de veredicto, misma tira de KPIs, mismo pie. Si cada renderer dibujara
 * lo suyo, la primera divergencia (un padding, un gris) pasaría inadvertida y
 * los dos papeles dejarían de parecer del mismo sistema.
 *
 * Acá viven las medidas y los colores UNA vez. Cada hoja compone estos bloques y
 * agrega lo que sí le es propio (la tabla de máquinas del turno, la de turnos
 * del período).
 *
 * MEDIR Y DIBUJAR VAN JUNTOS. Un canvas se borra al redimensionarse, así que el
 * alto se calcula antes de pintar un solo pixel. Por eso cada bloque expone su
 * `measure*` al lado de su `draw*`: si cambia el dibujo y no la medida, la hoja
 * se corta por abajo. Manteniéndolos vecinos es difícil olvidar uno.
 */

/** Ancho fijo del lienzo. Cómodo de leer en un teléfono sin hacer zoom. */
export const W = 1240
export const PAD = 56
export const SCALE = 2
export const CONTENT_W = W - PAD * 2

export const INK = '#14202c'
export const MUTE = '#5c6b7a'
export const RULE = '#d4dde6'
export const PAPER = '#ffffff'
export const BRAND = '#2E75B6'
export const OK = '#679576'
export const WARN = '#a88c64'
export const BAD = '#b0706d'
/** Fondo de barras vacías y de la caja de Mantención. */
export const TRACK = '#e9edf1'
export const PANEL = '#f4f7fa'

export type Tone = 'ok' | 'warn' | 'bad' | 'neutral'

export const SANS = (w: number, s: number) => `${w} ${s}px "IBM Plex Sans", system-ui, sans-serif`
export const MONO = (w: number, s: number) => `${w} ${s}px "IBM Plex Mono", ui-monospace, monospace`

export function toneColor(tone: Tone): string {
  return tone === 'bad' ? BAD : tone === 'ok' ? OK : tone === 'warn' ? WARN : INK
}

/** Parte un texto en líneas que quepan en `maxW`. Devuelve las líneas. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
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

/** Contexto suelto, solo para medir texto antes de existir el lienzo real. */
export function measureCtx(): CanvasRenderingContext2D {
  return document.createElement('canvas').getContext('2d')!
}

/** Crea el lienzo con el alto ya resuelto y el fondo papel pintado. */
export function createSheet(height: number): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
} {
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = Math.round(height) * SCALE
  const ctx = canvas.getContext('2d')!
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'top'
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, height)
  return { canvas, ctx }
}

// ── encabezado ────────────────────────────────────────────────────────────────

export const HEADER_H = 74

/** Título + subtítulo a la izquierda, sello de la empresa a la derecha. */
export function drawSheetHeader(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  y: number,
): number {
  ctx.fillStyle = INK
  ctx.font = SANS(600, 30)
  ctx.fillText(title, PAD, y)
  ctx.font = MONO(400, 17)
  ctx.fillStyle = MUTE
  ctx.fillText(subtitle, PAD, y + 38)

  ctx.textAlign = 'right'
  ctx.font = MONO(600, 15)
  ctx.fillStyle = MUTE
  ctx.fillText('ANTARFOOD', W - PAD, y + 2)
  ctx.font = MONO(400, 14)
  ctx.fillText('Mantención Planta', W - PAD, y + 22)
  ctx.textAlign = 'left'

  const ruleY = y + 66
  ctx.fillStyle = INK
  ctx.fillRect(PAD, ruleY, CONTENT_W, 2.5)
  return ruleY + 24
}

// ── veredicto ─────────────────────────────────────────────────────────────────

export function measureVerdict(verdictLines: number, detailLines: number): number {
  return 22 + verdictLines * 42 + detailLines * 28 + 26
}

/**
 * El bloque que se lee primero. La barra de color va a la IZQUIERDA y se pinta
 * al final, cuando ya se sabe el alto real: el color entra por forma, no por
 * fondo, así el papel sigue siendo imprimible en blanco y negro.
 */
export function drawVerdict(
  ctx: CanvasRenderingContext2D,
  opts: { label: string; lines: string[]; detailLines: string[]; color: string },
  y: number,
): number {
  const top = y
  ctx.font = MONO(600, 13)
  ctx.fillStyle = MUTE
  ctx.fillText(opts.label, PAD + 20, y)
  y += 24

  ctx.font = SANS(600, 34)
  ctx.fillStyle = INK
  for (const line of opts.lines) { ctx.fillText(line, PAD + 20, y); y += 42 }

  if (opts.detailLines.length) {
    y += 6
    ctx.font = SANS(400, 19)
    ctx.fillStyle = MUTE
    for (const line of opts.detailLines) { ctx.fillText(line, PAD + 20, y); y += 28 }
  }

  ctx.fillStyle = opts.color
  ctx.fillRect(PAD, top - 4, 5, y - top + 8)
  return y + 26
}

// ── tira de KPIs ──────────────────────────────────────────────────────────────

export const KPI_STRIP_H = 128

export interface CanvasKpi {
  label: string
  value: string
  context: string
  tone: Tone
}

/**
 * Los KPIs en una tira de columnas iguales. Cada uno lleva SU contexto debajo:
 * un "39 %" suelto no dice nada, "39 % de 7 h 09 de turno" sí.
 */
export function drawKpiStrip(
  ctx: CanvasRenderingContext2D,
  kpis: readonly CanvasKpi[],
  y: number,
): number {
  if (kpis.length === 0) return y
  const cw = CONTENT_W / kpis.length
  ctx.strokeStyle = RULE
  ctx.lineWidth = 1
  ctx.strokeRect(PAD + 0.5, y + 0.5, CONTENT_W - 1, 100)

  kpis.forEach((k, i) => {
    const x = PAD + i * cw
    if (i > 0) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + 100); ctx.stroke()
    }
    ctx.font = MONO(600, 12)
    ctx.fillStyle = MUTE
    ctx.fillText(k.label.toUpperCase(), x + 16, y + 15)

    ctx.font = MONO(600, 36)
    ctx.fillStyle = toneColor(k.tone)
    ctx.fillText(k.value, x + 16, y + 36)

    ctx.font = SANS(400, 14)
    ctx.fillStyle = MUTE
    const ctxLines = wrap(ctx, k.context, cw - 32)
    ctx.fillText(ctxLines[0] ?? '', x + 16, y + 78)
  })
  return y + KPI_STRIP_H
}

// ── título de sección ─────────────────────────────────────────────────────────

export const SECTION_TITLE_H = 34

/** Rótulo en versalitas con su regla debajo. Abre cada bloque de la hoja. */
export function drawSectionTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
): number {
  ctx.font = MONO(600, 13)
  ctx.fillStyle = MUTE
  ctx.fillText(text, PAD, y)
  y += 22
  ctx.strokeStyle = RULE
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD, y + 0.5); ctx.lineTo(W - PAD, y + 0.5); ctx.stroke()
  return y + 12
}

// ── caja de cierre ────────────────────────────────────────────────────────────

export function measureAskBox(lines: number): number {
  return 22 + lines * 28 + 18
}

/** La conclusión, enmarcada. La hoja siempre termina en texto, no en un gráfico. */
export function drawAskBox(
  ctx: CanvasRenderingContext2D,
  opts: { label: string; lines: string[] },
  y: number,
): number {
  const h = measureAskBox(opts.lines.length)
  ctx.strokeStyle = INK
  ctx.lineWidth = 2
  ctx.strokeRect(PAD + 1, y + 1, CONTENT_W - 2, h - 2)
  ctx.lineWidth = 1

  ctx.font = MONO(600, 12)
  ctx.fillStyle = MUTE
  ctx.fillText(opts.label, PAD + 18, y + 14)
  ctx.font = SANS(600, 20)
  ctx.fillStyle = INK
  let ay = y + 38
  for (const line of opts.lines) { ctx.fillText(line, PAD + 18, ay); ay += 28 }
  return y + h + 22
}

// ── pie ───────────────────────────────────────────────────────────────────────

export const FOOTER_H = 46

/** De dónde salieron los datos y cuándo se generó. Nunca se omite. */
export function drawFooter(
  ctx: CanvasRenderingContext2D,
  left: string,
  right: string,
  y: number,
): void {
  ctx.strokeStyle = RULE
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PAD, y + 0.5); ctx.lineTo(W - PAD, y + 0.5); ctx.stroke()
  y += 12
  ctx.font = MONO(400, 13)
  ctx.fillStyle = MUTE
  ctx.fillText(left, PAD, y)
  ctx.textAlign = 'right'
  ctx.fillText(right, W - PAD, y)
  ctx.textAlign = 'left'
}

// ── descarga ──────────────────────────────────────────────────────────────────

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
