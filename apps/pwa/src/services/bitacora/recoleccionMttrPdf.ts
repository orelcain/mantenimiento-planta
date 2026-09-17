import type { jsPDF } from 'jspdf'
import { LOGO_RECOLECCION_DATA_URI } from './logoRecoleccion'
import type { FilaRecoleccion } from './recoleccionMttr'

/**
 * La planilla «Recoleccion MTTR» dibujada arriba del PDF, con su aspecto: banda
 * azul #00557F con el logo a la izquierda, encabezados azules con letra blanca y
 * filas en bandas blanco / #D9E1F2 (TableStyleMedium2). Devuelve la Y siguiente.
 */
export async function dibujarRecoleccionMttr(
  pdf: jsPDF,
  filas: readonly FilaRecoleccion[],
  x: number,
  y: number,
  ancho: number,
  t: (v: unknown) => string,
): Promise<number> {
  const { default: autoTable } = await import('jspdf-autotable')
  const AZUL: [number, number, number] = [0, 85, 127]
  const LOGO_ANCHO = 26
  // Fila 1 de la planilla: A1 gris con el logo (120×28 px → 21,4×5 mm) y B1:E1 azul.
  pdf.setFillColor(242, 242, 242)
  pdf.rect(x, y, LOGO_ANCHO, 10, 'F')
  pdf.addImage(LOGO_RECOLECCION_DATA_URI, 'PNG', x + 2.3, y + 2.5, 21.4, 5)
  pdf.setFillColor(...AZUL)
  pdf.rect(x + LOGO_ANCHO, y, ancho - LOGO_ANCHO, 10, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.setTextColor(255, 255, 255)
  pdf.text('MTBF - MTTR', x + LOGO_ANCHO + 3, y + 6.6)
  y += 10

  const cuerpo = filas.length ? filas.map((f) => [f.fecha, f.maquina, f.falla, f.duracion, f.observaciones].map(t)) : [['', '', '', '', '']]
  autoTable(pdf, {
    startY: y,
    margin: { left: x, right: x },
    tableWidth: ancho,
    theme: 'plain',
    head: [['Fecha', 'Máquina', 'Falla', 'Duración Falla (Min)', 'Observaciones'].map(t)],
    body: cuerpo,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.2, textColor: [0, 0, 0], lineWidth: 0, valign: 'bottom', overflow: 'linebreak' },
    headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [217, 225, 242] },
    // Proporción de la planilla (146/184/317/171/929 px), con la fecha y la duración sin partirse.
    columnStyles: {
      0: { cellWidth: 24, halign: 'center' },
      1: { cellWidth: 28, halign: 'center' },
      2: { cellWidth: 40, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { halign: 'left' },
    },
  })
  const final = (pdf as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY
  pdf.setTextColor(0, 0, 0)
  return (final ?? y) + 8
}
