import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Equipment, Incident, MaintenanceLogEntry } from '@/types'

/**
 * Reporte PDF del expediente de un equipo (handoff de auditoría NFPA 70B).
 * Usa jsPDF + jspdf-autotable (ya en deps). Une placa, programa de inspección
 * e historial (maintenanceLog + incidencias) en un documento imprimible.
 */

const CRIT_LABEL: Record<Equipment['criticidad'], string> = {
  alta: 'Alta (A)',
  media: 'Media (B)',
  baja: 'Baja (C)',
}
const ESTADO_LABEL: Record<Equipment['estado'], string> = {
  operativo: 'Operativo',
  en_mantenimiento: 'En mantención',
  fuera_servicio: 'Fuera de servicio',
}
const COND_LABEL: Record<1 | 2 | 3, string> = {
  1: '1 · como nuevo',
  2: '2 · con desvíos',
  3: '3 · acción requerida',
}
const SEV_LABEL: Record<MaintenanceLogEntry['severidad'], string> = {
  verde: 'Verde',
  amarillo: 'Amarillo',
  rojo: 'Rojo',
}

function fmt(d: Date | string | undefined): string {
  if (!d) return '—'
  const t = new Date(d).getTime()
  return Number.isNaN(t) ? '—' : new Date(t).toLocaleDateString()
}

function lastY(doc: jsPDF, fallback: number): number {
  const v = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
  return typeof v === 'number' ? v : fallback
}

export function generarReporteEquipo(
  equipment: Equipment,
  incidents: Incident[],
  log: MaintenanceLogEntry[],
): void {
  const doc = new jsPDF()
  const f = equipment.fichaTecnica ?? {}
  const headColor: [number, number, number] = [30, 41, 59]

  let y = 16
  doc.setFontSize(14)
  doc.text('Expediente técnico — NFPA 70B', 14, y)
  y += 7
  doc.setFontSize(11)
  doc.text(`${equipment.nombre}  (${equipment.codigo})`, 14, y)
  y += 5
  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text(equipment.hierarchyPath ?? '', 14, y, { maxWidth: 182 })
  doc.setTextColor(0)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Datos generales', '']],
    body: [
      ['Criticidad', CRIT_LABEL[equipment.criticidad] ?? '—'],
      ['Estado', ESTADO_LABEL[equipment.estado] ?? '—'],
      ['Condición', f.condicion ? (COND_LABEL[f.condicion] ?? '—') : '—'],
      ['Tipo', equipment.tipo ?? '—'],
      ['Marca', equipment.marca ?? '—'],
      ['Modelo', equipment.modelo ?? '—'],
      ['N° serie', equipment.numeroSerie ?? '—'],
    ],
    theme: 'striped',
    styles: { fontSize: 9 },
    headStyles: { fillColor: headColor },
  })

  autoTable(doc, {
    startY: lastY(doc, y) + 6,
    head: [['Placa eléctrica (NFPA 70B §2.2)', '']],
    body: [
      ['Potencia (kW)', f.potenciaKw != null ? String(f.potenciaKw) : '—'],
      ['Voltaje (V)', f.voltajeV != null ? String(f.voltajeV) : '—'],
      ['Corriente (A)', f.corrienteA != null ? String(f.corrienteA) : '—'],
      ['RPM', f.rpm != null ? String(f.rpm) : '—'],
      ['Factor de servicio', f.factorServicio != null ? String(f.factorServicio) : '—'],
      ['Clase de aislamiento', f.claseAislamiento ?? '—'],
      ['Grado IP', f.gradoIP ?? '—'],
    ],
    theme: 'striped',
    styles: { fontSize: 9 },
    headStyles: { fillColor: headColor },
  })

  autoTable(doc, {
    startY: lastY(doc, y) + 6,
    head: [['Programa de inspección', '']],
    body: [
      ['Próxima inspección', fmt(f.proximaInspeccion)],
      ['Frecuencia (días)', f.frecuenciaInspeccionDias != null ? String(f.frecuenciaInspeccionDias) : '—'],
      ['Vida útil (años)', f.vidaUtilAnios != null ? String(f.vidaUtilAnios) : '—'],
    ],
    theme: 'striped',
    styles: { fontSize: 9 },
    headStyles: { fillColor: headColor },
  })

  // Historial: maintenanceLog + incidencias, más reciente primero.
  type Row = { fecha: Date; tipo: string; sev: string; texto: string }
  const filas: Row[] = [
    ...log.map((e) => ({
      fecha: e.fecha instanceof Date ? e.fecha : new Date(e.fecha),
      tipo: e.tipo,
      sev: SEV_LABEL[e.severidad] ?? '',
      texto: `${e.tecnico ? `${e.tecnico} — ` : ''}${e.hallazgo}`,
    })),
    ...incidents.map((i) => ({
      fecha: new Date(i.createdAt),
      tipo: 'incidencia',
      sev: i.prioridad,
      texto: i.titulo,
    })),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())

  autoTable(doc, {
    startY: lastY(doc, y) + 6,
    head: [['Fecha', 'Tipo', 'Sev.', 'Hallazgo']],
    body:
      filas.length > 0
        ? filas.map((r) => [fmt(r.fecha), r.tipo, r.sev, r.texto])
        : [['—', '—', '—', 'Sin historial registrado']],
    theme: 'grid',
    styles: { fontSize: 8, cellWidth: 'wrap' },
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 26 }, 2: { cellWidth: 20 }, 3: { cellWidth: 112 } },
    headStyles: { fillColor: headColor },
  })

  const fecha = new Date().toLocaleString()
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text(`Generado ${fecha} · Centro Técnico Documental · pág. ${p}/${pages}`, 14, 290)
    doc.setTextColor(0)
  }

  doc.save(`expediente-${equipment.codigo}.pdf`)
}
