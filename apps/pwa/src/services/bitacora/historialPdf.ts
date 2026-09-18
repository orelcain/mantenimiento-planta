import { textoSeguroPdf } from '@/utils/pdf/textoSeguroPdf'
import { lineaRepuestoDelPeriodo, porcentaje, tesisDelPeriodo, type FilaTurno, type ResumenPeriodo } from './historialBitacora'
import { formatoMinutos } from './turnoMantencion'
import { etiquetaFilaTurno, tituloHistorial } from './historialCorreo'
import type { EventoBitacora } from './bitacora.types'
import { filasRecoleccionPeriodo } from './recoleccionMttr'
import { explicacionMtbfMttrPeriodo } from './mtbf'
import { dibujarRecoleccionMttr } from './recoleccionMttrPdf'

type RGB = [number, number, number]

/** PDF del período: la misma información del correo, para adjuntar o imprimir. */
export async function generarPdfHistorial(r: ResumenPeriodo, filas: readonly FilaTurno[], planta: string, eventos: readonly EventoBitacora[] = []): Promise<string> {
  const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  // NFKC + saneo cp1252: sin esto un "NH₃" deja el renglón en blanco.
  const t = (v: unknown) => textoSeguroPdf(v == null ? '' : String(v).normalize('NFKC'))
  const W = pdf.internal.pageSize.getWidth()
  const M = 15
  let y = M

  // La planilla «Recoleccion MTTR» del período, arriba (17-09-2026).
  if (eventos.length) {
    y = await dibujarRecoleccionMttr(pdf, filasRecoleccionPeriodo(eventos), M, y, W - 2 * M, t) - 4
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(95, 99, 104)
    for (const l of pdf.splitTextToSize(t(explicacionMtbfMttrPeriodo(r.minutosTurnos, r.turnos, r)), W - 2 * M) as string[]) {
      pdf.text(l, M, y)
      y += 3.8
    }
    y += 4
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text(t(tituloHistorial(r)), M, y + 5)
  y += 11
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(95, 99, 104)
  pdf.text(t(`${r.turnos} turnos registrados · ${planta}`), M, y)
  y += 7
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.setTextColor(30, 123, 52)
  for (const l of pdf.splitTextToSize(t(tesisDelPeriodo(r)), W - 2 * M) as string[]) {
    pdf.text(l, M, y)
    y += 6
  }
  y += 2

  const TINTA: RGB = [31, 31, 31]
  const PARADA: RGB = [176, 42, 55]
  const VENTANA: RGB = [30, 123, 52]
  // Mismo código de color que la pantalla y el correo: impreso o archivado, el
  // PDF tiene que señalar lo mismo (revisión 15-09).
  const kpis: Array<[string, string, RGB]> = [
    [String(r.eventos), r.eventos === 1 ? 'evento' : 'eventos', TINTA],
    [formatoMinutos(r.minutosParada), `de parada (${r.conParada})`, r.minutosParada > 0 ? PARADA : TINTA],
    [r.mttrMin == null ? '-' : formatoMinutos(r.mttrMin), 'MTTR', TINTA],
    [r.mtbfMin == null ? '-' : formatoMinutos(r.mtbfMin), 'MTBF', TINTA],
    [
      r.conImpacto > 0 ? `${r.sinDetener} · ${porcentaje(r.parteSinDetener)}` : String(r.sinDetener),
      'sin detener',
      r.sinDetener > 0 ? VENTANA : TINTA,
    ],
    [String(r.pendientesCerrados), 'pend. cerrados', r.pendientesCerrados > 0 ? VENTANA : TINTA],
    [String(r.pendientesAbiertos), 'pend. abiertos', TINTA],
    [String(r.repuestos.length), r.repuestos.length === 1 ? 'repuesto usado' : 'repuestos usados', TINTA],
    [String(r.unidadesRepuestos), 'unidades', TINTA],
  ]
  const ancho = (W - 2 * M) / kpis.length
  pdf.setDrawColor(227, 227, 227)
  kpis.forEach(([valor, etiqueta, color], i) => {
    const x = M + i * ancho
    pdf.rect(x, y, ancho, 15)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(color[0], color[1], color[2])
    pdf.text(t(valor), x + 2.5, y + 6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(95, 99, 104)
    pdf.text(t(etiqueta), x + 2.5, y + 11.5)
  })
  y += 22

  const tabla = (autoTable as { default: (doc: unknown, opciones: Record<string, unknown>) => void }).default
  tabla(pdf, {
    startY: y,
    head: [['Turno', 'Eventos', 'Parada', 'Sin detener', 'Pendientes']],
    body: filas.map((f) => [
      t(etiquetaFilaTurno(f)),
      String(f.resumen.eventos),
      f.resumen.conParada ? t(formatoMinutos(f.resumen.minutosParada)) : '-',
      String(f.resumen.enVentana),
      f.pendientesAbiertos ? String(f.pendientesAbiertos) : '-',
    ]),
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [242, 242, 247], textColor: [95, 99, 104] },
    margin: { left: M, right: M },
  })

  const finTabla = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
  let yy = finTabla + 10
  if (r.equipos.length) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.setTextColor(31, 31, 31)
    pdf.text(t('Equipos que más pararon'), M, yy)
    yy += 6
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    for (const e of r.equipos) {
      const linea = `${e.equipo} · ${formatoMinutos(e.minutos)} en ${e.paradas} ${e.paradas === 1 ? 'parada' : 'paradas'} · ${porcentaje(e.parte)} del total${
        e.mtbfMin == null ? '' : ` · MTBF ${formatoMinutos(e.mtbfMin)}`
      }`
      for (const l of pdf.splitTextToSize(t(linea), W - 2 * M) as string[]) {
        if (yy > pdf.internal.pageSize.getHeight() - M) {
          pdf.addPage()
          yy = M
        }
        pdf.text(l, M, yy)
        yy += 5
      }
    }
  }

  if (r.repuestos.length) {
    yy += 4
    if (yy > pdf.internal.pageSize.getHeight() - M - 12) {
      pdf.addPage()
      yy = M
    }
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.setTextColor(31, 31, 31)
    pdf.text(t('Repuestos usados'), M, yy)
    yy += 6
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    for (const x of r.repuestos) {
      for (const l of pdf.splitTextToSize(t(`- ${lineaRepuestoDelPeriodo(x)}`), W - 2 * M) as string[]) {
        if (yy > pdf.internal.pageSize.getHeight() - M) {
          pdf.addPage()
          yy = M
        }
        pdf.text(l, M, yy)
        yy += 5
      }
    }
  }

  const archivo = `bitacora-resumen-${r.desde}_a_${r.hasta}.pdf`
  pdf.save(archivo)
  return archivo
}
