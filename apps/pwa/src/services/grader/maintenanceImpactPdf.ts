/**
 * maintenanceImpactPdf — Entregable "Reporte de Impacto de Mantención".
 *
 * One-pager PDF de la confiabilidad de Mantención del período: MTTR/MTBF macro,
 * disponibilidad atribuible, averías/intervenciones, paro de mantención y su
 * tendencia. Pensado para exponer/demostrar con datos el aporte de Mantención.
 *
 * Carga jsPDF + jspdf-autotable dinámicamente (no aumenta el bundle inicial).
 * Reutiliza el formato de `graderReliability`.
 */

import type { MaintenanceReliability } from './graderReliability'
import { formatReliabilityDuration as fmt } from './graderReliability'

interface AutoTableDoc {
  lastAutoTable: { finalY: number }
}

export async function exportMaintenanceImpactPDF(
  rel: MaintenanceReliability,
  opts: { periodLabel: string; rangeLabel?: string; lineLabel?: string },
): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as InstanceType<typeof jsPDF> & AutoTableDoc
  const pageW = doc.internal.pageSize.getWidth()
  const MARGIN = 14
  let y = 16

  // ── Encabezado ──
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Reporte de Impacto de Mantención', pageW / 2, y, { align: 'center' })
  y += 7

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const sub = [opts.lineLabel, opts.periodLabel, opts.rangeLabel].filter(Boolean).join('  |  ')
  doc.text(sub, pageW / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text(`Generado: ${new Date().toLocaleString('es-CL')}  ·  ${rel.shiftsWithData} turnos con datos`, pageW / 2, y, { align: 'center' })
  doc.setTextColor(0)
  y += 6

  // ── Frase de demostración ──
  doc.setDrawColor(249, 115, 22)
  doc.setFillColor(255, 247, 237)
  const phrase =
    rel.eventsCount > 0
      ? `Mantencion atendio ${rel.eventsCount} paros (${rel.fallasCount} fallas + ${rel.intervencionesCount} intervenciones) por ${fmt(rel.maintenanceDowntimeSec)} en el periodo.`
      : 'Sin paros clasificados como falla de equipo o intervencion de mantencion en el periodo.'
  doc.roundedRect(MARGIN, y, pageW - MARGIN * 2, 12, 2, 2, 'FD')
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize(phrase, pageW - MARGIN * 2 - 6), MARGIN + 3, y + 5)
  doc.setDrawColor(0)
  y += 17

  // ── Tabla de KPIs de confiabilidad ──
  const availTxt = rel.availabilityPct != null ? `${rel.availabilityPct.toFixed(1)} %` : '—'
  const shareTxt = rel.maintenanceShareOfDeadPct != null ? `${rel.maintenanceShareOfDeadPct.toFixed(0)} %` : '—'
  autoTable(doc, {
    startY: y,
    head: [['Indicador de confiabilidad', 'Valor']],
    body: [
      ['MTTR (averias macro)', fmt(rel.mttrMacroSec)],
      ['MTBF', rel.mtbfSec > 0 ? fmt(rel.mtbfSec) : '—'],
      ['Disponibilidad atribuible', availTxt],
      ['Averias (falla de equipo)', String(rel.fallasCount)],
      ['Intervenciones de mantencion', String(rel.intervencionesCount)],
      ['Paro total de mantencion', `${fmt(rel.maintenanceDowntimeSec)}  (${shareTxt} del muerto)`],
      ['Tiempo operativo del periodo', fmt(rel.operatingSec)],
      ['Micro-detenciones (<5min, aparte)', `${rel.microCount.toLocaleString('es-CL')}  ·  ${fmt(rel.microSec)}`],
    ],
    theme: 'striped',
    headStyles: { fillColor: [249, 115, 22] },
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 1: { halign: 'right', cellWidth: 55 } },
    margin: { left: MARGIN, right: MARGIN },
  })
  y = doc.lastAutoTable.finalY + 6

  // ── Tendencia (si hay) ──
  if (rel.trend.length > 0) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(`Tendencia del paro de mantencion ${rel.trend[0]?.grouped ? '(por semana)' : '(por dia)'}`, MARGIN, y)
    y += 2
    autoTable(doc, {
      startY: y,
      head: [['Periodo', 'Paro de mantencion', 'Eventos']],
      body: rel.trend.map((t) => [t.label, fmt(t.downtimeSec), String(t.events)]),
      theme: 'grid',
      headStyles: { fillColor: [100, 116, 139] },
      styles: { fontSize: 8.5, cellPadding: 1.5 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = doc.lastAutoTable.finalY + 6
  }

  // ── Nota de definiciones ──
  doc.setFontSize(7.5)
  doc.setTextColor(120)
  const note =
    'Definiciones: MTTR = tiempo medio de reparacion de averias macro (paros relevantes >=5min). ' +
    'MTBF = tiempo en operacion / N de averias. Disponibilidad atribuible = uptime / tiempo operativo. ' +
    'Las micro-detenciones (<5min) se reportan aparte para no distorsionar el MTTR. ' +
    'Fuente: pausas del Grader clasificadas como falla de equipo / intervencion de mantencion.'
  doc.text(doc.splitTextToSize(note, pageW - MARGIN * 2), MARGIN, y)
  doc.setTextColor(0)

  const safe = (opts.periodLabel || 'periodo').replace(/[^\w-]+/g, '_')
  doc.save(`impacto-mantencion_${safe}.pdf`)
}
