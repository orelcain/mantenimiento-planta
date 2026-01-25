import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Repuesto, TechnicalSpecs, MachineImage, TechnicalDataField } from '@/types/repuestos'

/**
 * Exporta la ficha técnica y galería de un repuesto a PDF
 */
export async function exportTechnicalSheetToPDF(
  repuesto: Repuesto,
  machineName?: string
): Promise<void> {

  // 1. Configurar documento
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  // Funciona con jsPDF para obtener ancho y alto usable
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);
  let yPos = margin;

  // --- ENCABEZADO ---
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('FICHA TÉCNICA DE REPUESTO', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Equipo: ${machineName || 'Desconocido'}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 5;
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  // --- DATOS PRINCIPALES ---
  doc.setDrawColor(200);
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, yPos, contentWidth, 30, 'FD');

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(repuesto.textoBreve || 'Sin Nombre', margin + 5, yPos + 8);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Código SAP: ${repuesto.codigoSAP || 'N/A'}`, margin + 5, yPos + 18);
  doc.text(`Descripción: ${repuesto.descripcion?.substring(0, 100) || 'Sin descripción'}`, margin + 5, yPos + 24);

  yPos += 40;

  // --- FICHA TÉCNICA ---
  const specs = repuesto.technicalSpecs;
  if (specs) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Especificaciones Técnicas', margin, yPos);
    yPos += 5;

    // Tabla de valores
    const tableData: string[][] = [];

    // Datos Standard
    if (specs.standardValues) {
        Object.entries(specs.standardValues).forEach(([key, value]) => {
           tableData.push(['Estándar', key.toUpperCase(), value.toString()]);
        });
    }

    // Datos Custom
    if (specs.customFields && specs.customFields.length > 0) {
        specs.customFields.forEach((field: TechnicalDataField) => {
            tableData.push(['Adicional', field.label || 'Campo', field.value || '-']);
        });
    }

    if (tableData.length > 0) {
        autoTable(doc, {
            head: [['Tipo', 'Dato', 'Valor']],
            body: tableData,
            startY: yPos,
            theme: 'grid',
            headStyles: { fillColor: [66, 66, 66] },
            columnStyles: {
                0: { cellWidth: 30, fontStyle: 'italic', textColor: 100 },
                1: { cellWidth: 70, fontStyle: 'bold' },
            },
            margin: { left: margin, right: margin }
        });
        
        // Actualizar yPos después de la tabla
        yPos = (doc as any).lastAutoTable.finalY + 15;
    } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100);
        doc.text('No hay datos técnicos registrados.', margin, yPos + 5);
        yPos += 15;
    }
  }

  // --- OBSERVACIONES ---
  if (specs?.notes) {
      if (yPos > pageHeight - 40) { doc.addPage(); yPos = margin; }
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0);
      doc.text('Observaciones', margin, yPos);
      yPos += 6;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(specs.notes, contentWidth);
      doc.text(lines, margin, yPos);
      yPos += (lines.length * 5) + 15;
  }

  // --- GALERÍA DE IMÁGENES ---
  const images = repuesto.gallery || [];
  if (images.length > 0) {
      if (yPos > pageHeight - 60) { doc.addPage(); yPos = margin; }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`Galería (${images.length} imágenes)`, margin, yPos);
      yPos += 10;

      // Configuración de grid
      const imgWidth = 80;
      const imgHeight = 60;
      const gap = 10;
      let xPos = margin;

      for (const img of images) {
        if (!img.url) continue;

        // Comprobar espacio vertical
        if (yPos + imgHeight > pageHeight - margin) {
            doc.addPage();
            yPos = margin;
        }

        try {
            // Intentar cargar imagen (puede fallar por CORS si no está configurado)
            // Se asume URL accesible o base64. 
            // Si es URL remota, jsPDF necesita cargarla.
            // Para simplicidad, agregamos el link si falla, o placeholder.
            
            // Nota: Para imágenes remotas en PDF client-side, a veces es complejo.
            // Vamos a intentar agregar la imagen.
            doc.addImage(img.url, 'JPEG', xPos, yPos, imgWidth, imgHeight);
            
            // Borde
            doc.setDrawColor(200);
            doc.rect(xPos, yPos, imgWidth, imgHeight);

            // Notas de imagen
            if (img.notes) {
                 doc.setFontSize(8);
                 doc.text(img.notes, xPos, yPos + imgHeight + 4);
            }

        } catch (e) {
            console.warn('No se pudo agregar imagen al PDF', e);
            doc.rect(xPos, yPos, imgWidth, imgHeight);
            doc.text('Error cargando imagen', xPos + 5, yPos + 30);
        }

        // Mover cursor grid (2 columnas)
        if (xPos === margin) {
            xPos += imgWidth + gap;
        } else {
            xPos = margin;
            yPos += imgHeight + 15;
        }
      }
  }

  // Guardar archivo
  const filename = `Ficha_${repuesto.codigoSAP || 'REP'}_${new Date().getTime()}.pdf`;
  doc.save(filename);
}
