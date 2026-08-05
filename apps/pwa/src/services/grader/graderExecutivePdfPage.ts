/**
 * Página 1 del PDF de turno: el resumen ejecutivo.
 *
 * Es el mismo modelo que dibuja el PNG (`buildExecutiveSummary`), renderizado
 * en jsPDF. Que compartan el modelo es el punto: si el PNG dice que el turno se
 * perdió por la Baader 2, el PDF no puede decir otra cosa.
 *
 * Va PRIMERO a propósito. El PDF anterior abría con el timeline minuto a
 * minuto, así que quien lo recibía tenía que leer tres páginas para saber si el
 * turno había estado bien o mal. Ahora eso se responde en el primer párrafo y
 * el detalle queda detrás para quien lo necesite.
 */

import type { ExecutiveSummary } from '@/services/grader/graderExecutiveSummary'

/** Lo mínimo de jsPDF que se usa acá — evita depender del tipo completo. */
export interface PdfDoc {
  internal: { pageSize: { getWidth(): number; getHeight(): number } }
  setFont(family: string, style?: string): void
  setFontSize(size: number): void
  setTextColor(r: number, g: number, b: number): void
  setDrawColor(r: number, g: number, b: number): void
  setFillColor(r: number, g: number, b: number): void
  setLineWidth(w: number): void
  text(text: string | string[], x: number, y: number, opts?: { align?: string }): void
  line(x1: number, y1: number, x2: number, y2: number): void
  rect(x: number, y: number, w: number, h: number, style?: string): void
  splitTextToSize(text: string, maxWidth: number): string[]
  addPage(): void
}

type RGB = readonly [number, number, number]

const INK: RGB = [20, 32, 44]
const MUTE: RGB = [92, 107, 122]
const RULE: RGB = [212, 221, 230]
const BRAND: RGB = [46, 117, 182]
const OK: RGB = [103, 149, 118]
const WARN: RGB = [168, 140, 100]
const BAD: RGB = [176, 112, 109]
const PANEL: RGB = [244, 247, 250]

const SEV: Record<ExecutiveSummary['severity'], RGB> = { ok: OK, warn: WARN, critical: BAD }
const TONE: Record<string, RGB> = { ok: OK, warn: WARN, bad: BAD, neutral: INK }

const MARGIN = 14

/**
 * Dibuja el resumen ejecutivo y devuelve la `y` donde termina.
 *
 * No llama a `addPage`: el llamador decide si el detalle sigue en esta hoja o
 * en la siguiente, porque eso depende de cuánto detalle haya.
 */
export function drawExecutivePdfPage(doc: PdfDoc, s: ExecutiveSummary): number {
  const pageW = doc.internal.pageSize.getWidth()
  const contentW = pageW - MARGIN * 2
  let y = MARGIN

  const setInk = (c: RGB) => doc.setTextColor(c[0], c[1], c[2])
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2])
  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2])

  // ── encabezado ──────────────────────────────────────────────────────────
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
  y += 8

  // ── veredicto ───────────────────────────────────────────────────────────
  const vTop = y
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setInk(MUTE)
  doc.text('RESULTADO DEL TURNO', MARGIN + 5, y)
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  setInk(INK)
  const verdictLines = doc.splitTextToSize(s.verdict, contentW - 8)
  for (const line of verdictLines) { doc.text(line, MARGIN + 5, y); y += 6.5 }

  if (s.verdictDetail) {
    y += 1.5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setInk(MUTE)
    for (const line of doc.splitTextToSize(s.verdictDetail, contentW - 8)) {
      doc.text(line, MARGIN + 5, y); y += 4.6
    }
  }
  // Barra de severidad: el color entra por forma, nunca como fondo del texto.
  setFill(SEV[s.severity])
  doc.rect(MARGIN, vTop - 3, 1.6, y - vTop + 4, 'F')
  y += 7

  // ── KPIs ────────────────────────────────────────────────────────────────
  if (s.kpis.length > 0) {
    const cw = contentW / s.kpis.length
    const boxH = 20
    setDraw(RULE)
    doc.rect(MARGIN, y, contentW, boxH)

    s.kpis.forEach((k, i) => {
      const x = MARGIN + i * cw
      if (i > 0) doc.line(x, y, x, y + boxH)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      setInk(MUTE)
      doc.text(k.label.toUpperCase(), x + 3.5, y + 4.5)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      setInk(TONE[k.tone] ?? INK)
      doc.text(k.value, x + 3.5, y + 12)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      setInk(MUTE)
      const ctxLine = doc.splitTextToSize(k.context, cw - 7)[0] ?? ''
      doc.text(ctxLine, x + 3.5, y + 17)
    })
    y += boxH + 8
  }

  // ── máquinas ────────────────────────────────────────────────────────────
  if (s.machines.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setInk(MUTE)
    doc.text('DE DÓNDE SALIÓ LA PÉRDIDA', MARGIN, y)
    y += 3
    setDraw(RULE)
    doc.line(MARGIN, y, pageW - MARGIN, y)
    y += 5

    const colCycles = MARGIN + 78
    const colUp = MARGIN + 100
    const colBar = MARGIN + 108
    const barW = 42

    for (const m of s.machines) {
      doc.setFont('helvetica', m.stopped ? 'bold' : 'normal')
      doc.setFontSize(9.5)
      setInk(INK)
      doc.text(m.name, MARGIN, y + 3)

      setInk(m.stopped ? BAD : INK)
      doc.text(m.cycles.toLocaleString('es-CL'), colCycles, y + 3, { align: 'right' })
      setInk(MUTE)
      doc.text(m.uptimePct != null ? `${Math.round(m.uptimePct)}%` : '—', colUp, y + 3, { align: 'right' })

      // Barra de ritmo. Vacía cuando la máquina no arrancó — se lee sola.
      setFill([233, 237, 241])
      doc.rect(colBar, y + 0.8, barW, 2.2, 'F')
      if (!m.stopped && m.ratePct != null) {
        const w = Math.max(0.6, Math.min(barW, (m.ratePct / 100) * barW))
        setFill(m.ratePct < 50 ? BAD : m.ratePct < 80 ? WARN : OK)
        doc.rect(colBar, y + 0.8, w, 2.2, 'F')
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      setInk(m.stopped ? BAD : MUTE)
      doc.text(m.flag, colBar + barW + 3, y + 3)

      y += 6.5
    }

    y += 2
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setInk(MUTE)
    for (const line of doc.splitTextToSize(s.cause, contentW)) { doc.text(line, MARGIN, y); y += 4.4 }
    y += 6
  }

  // ── lo que hizo Mantención ──────────────────────────────────────────────
  const maintLines = s.maintenance.map(m => doc.splitTextToSize(m, contentW - 14))
  const maintH = 9 + maintLines.reduce((a, l) => a + l.length * 4.6, 0) + 4

  setFill(PANEL)
  setDraw(RULE)
  doc.rect(MARGIN, y, contentW, maintH, 'FD')

  let my = y + 5.5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setInk(BRAND)
  doc.text('LO QUE HIZO MANTENCIÓN', MARGIN + 4, my)
  my += 5.5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  for (const lines of maintLines) {
    lines.forEach((line: string, i: number) => {
      if (i === 0) { setInk(BRAND); doc.text('•', MARGIN + 4, my) }
      setInk(INK)
      doc.text(line, MARGIN + 8, my)
      my += 4.6
    })
  }
  y += maintH + 7

  // ── lo que se necesita ──────────────────────────────────────────────────
  const askLines = doc.splitTextToSize(s.ask, contentW - 8)
  const askH = 7 + askLines.length * 5 + 3
  setDraw(INK)
  doc.setLineWidth(0.5)
  doc.rect(MARGIN, y, contentW, askH)
  doc.setLineWidth(0.2)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  setInk(MUTE)
  doc.text('LO QUE SE NECESITA', MARGIN + 4, y + 4.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setInk(INK)
  let ay = y + 10.5
  for (const line of askLines) { doc.text(line, MARGIN + 4, ay); ay += 5 }
  y += askH + 6

  // ── fuente ──────────────────────────────────────────────────────────────
  setDraw(RULE)
  doc.line(MARGIN, y, pageW - MARGIN, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setInk(MUTE)
  doc.text(s.sourceNote, MARGIN, y)
  doc.text(`Generado ${s.generatedAt.toLocaleString('es-CL')}`, pageW - MARGIN, y, { align: 'right' })

  return y + 6
}
