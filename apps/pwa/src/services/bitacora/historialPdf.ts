import { textoSeguroPdf } from '@/utils/pdf/textoSeguroPdf'
import { etiquetaCortaTurno } from './entregaTurno'
import { porcentaje, tesisDelPeriodo, type FilaTurno, type ResumenPeriodo } from './historialBitacora'
import { formatoMinutos } from './turnoMantencion'
import { tituloHistorial } from './historialCorreo'

/** PDF del período: la misma información del correo, para adjuntar o imprimir. */
export async function generarPdfHistorial(r: ResumenPeriodo, filas: readonly FilaTurno[], planta: string): Promise<string> {
  const [{ jsPDF }, autoTable] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  // NFKC + saneo cp1252: sin esto un "NH₃" deja el renglón en blanco.
  const t = (v: unknown) => textoSeguroPdf(v == null ? '' : String(v).normalize('NFKC'))
  const W = pdf.internal.pageSize.getWidth()
  const M = 15
  let y = M

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

  const kpis: Array<[string, string]> = [
    [String(r.eventos), r.eventos === 1 ? 'evento' : 'eventos'],
    [formatoMinutos(r.minutosParada), `de parada (${r.conParada})`],
    [r.mttrMin == null ? '-' : formatoMinutos(r.mttrMin), 'MTTR'],
    [`${r.sinDetener} · ${porcentaje(r.parteSinDetener)}`, 'sin detener'],
    [String(r.pendientesCerrados), 'pend. cerrados'],
    [String(r.pendientesAbiertos), 'pend. abiertos'],
  ]
  const ancho = (W - 2 * M) / kpis.length
  pdf.setDrawColor(227, 227, 227)
  kpis.forEach(([valor, etiqueta], i) => {
    const x = M + i * ancho
    pdf.rect(x, y, ancho, 15)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(31, 31, 31)
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
      t(etiquetaCortaTurno(f.turnoId)),
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
      const linea = `${e.equipo} · ${formatoMinutos(e.minutos)} en ${e.paradas} ${e.paradas === 1 ? 'parada' : 'paradas'} · ${porcentaje(e.parte)} del total`
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

  const archivo = `bitacora-resumen-${r.desde}_a_${r.hasta}.pdf`
  pdf.save(archivo)
  return archivo
}
