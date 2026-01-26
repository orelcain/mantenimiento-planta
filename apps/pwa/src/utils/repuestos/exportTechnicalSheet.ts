import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Repuesto, TechnicalDataField } from '@/types/repuestos'

/**
 * Convierte una URL de imagen a Base64
 */
async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Error fetching image for PDF:', error);
    return null;
  }
}

/**
 * Genera el contenido de una ficha técnica en el documento PDF dado
 * @returns La posición Y final
 */
async function addTechnicalSheetToDoc(
  doc: jsPDF,
  repuesto: Repuesto,
  machineName?: string
): Promise<void> {
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
  const title = repuesto.textoBreve || 'Sin Nombre';
  doc.text(title.substring(0, 50) + (title.length > 50 ? '...' : ''), margin + 5, yPos + 8);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Código SAP: ${repuesto.codigoSAP || 'N/A'}`, margin + 5, yPos + 18);
  doc.text(`Descripción: ${repuesto.descripcion?.substring(0, 130) || 'Sin descripción'}`, margin + 5, yPos + 24);

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
           tableData.push([key.toUpperCase(), value.toString()]);
        });
    }

    // Datos Custom
    if (specs.customFields && specs.customFields.length > 0) {
        specs.customFields.forEach((field: TechnicalDataField) => {
            tableData.push([field.label || 'Campo', field.value || '-']);
        });
    }

    if (tableData.length > 0) {
        autoTable(doc, {
            head: [['Dato', 'Valor']],
            body: tableData,
            startY: yPos,
            theme: 'grid',
            headStyles: { fillColor: [66, 66, 66] },
            columnStyles: {
                0: { cellWidth: 70, fontStyle: 'bold' },
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
            xPos = margin; // Reset X on new page
        }

        try {
            // Cargar imagen como Base64
            const base64Img = await imageUrlToBase64(img.url);
            
            if (base64Img) {
              // Obtener dimensiones reales usando DOM para mayor precisión
              const ratio = await new Promise<number>((resolve) => {
                 const i = new Image();
                 i.onload = () => resolve(i.naturalWidth / i.naturalHeight);
                 i.onerror = () => resolve(1);
                 i.src = base64Img;
              });

              // Calcular dimensiones para mantener aspecto (Contain)
              const boxRatio = imgWidth / imgHeight;
              
              let drawW = imgWidth;
              let drawH = imgHeight;
              let drawX = xPos;
              let drawY = yPos;

              if (ratio > boxRatio) {
                 // La imagen es más ancha que el cuadro (ajustar al ancho)
                 drawH = imgWidth / ratio;
                 drawY = yPos + (imgHeight - drawH) / 2;
              } else {
                 // La imagen es más alta que el cuadro (ajustar al alto)
                 drawW = imgHeight * ratio;
                 drawX = xPos + (imgWidth - drawW) / 2;
              }
              
              // Detectar formato
              const format = base64Img.match(/^data:image\/(\w+);base64,/)?.[1]?.toUpperCase() || 'JPEG';
              
              // Usar coordenadas ajustadas
              doc.addImage(base64Img, format, drawX, drawY, drawW, drawH);
            } else {
               // Fallback si falla la carga
               doc.rect(xPos, yPos, imgWidth, imgHeight);
               doc.setFontSize(8);
               doc.text('Error de carga', xPos + 5, yPos + 30);
            }
            
            // Borde
            doc.setDrawColor(200);
            doc.rect(xPos, yPos, imgWidth, imgHeight);

            // Notas de imagen
            if (img.notes) {
                 doc.setFontSize(8);
                 const notePreview = img.notes.substring(0, 30) + (img.notes.length > 30 ? '...' : '');
                 doc.text(notePreview, xPos, yPos + imgHeight + 4);
            }
             
             // Info de resolución
             if (img.dimensions) {
                doc.setFontSize(7);
                doc.setTextColor(150);
                doc.text(`${img.dimensions.width}x${img.dimensions.height}`, xPos + imgWidth - 2, yPos + imgHeight - 2, { align: 'right' })
                doc.setTextColor(0);
             }

        } catch (e) {
            console.warn('No se pudo agregar imagen al PDF', e);
            doc.rect(xPos, yPos, imgWidth, imgHeight);
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
}

/**
 * Exporta la ficha técnica y galería de un repuesto a PDF
 */
export async function exportTechnicalSheetToPDF(
  repuesto: Repuesto,
  machineName?: string
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  await addTechnicalSheetToDoc(doc, repuesto, machineName);

  const filename = `Ficha_${repuesto.codigoSAP || 'REP'}_${new Date().getTime()}.pdf`;
  doc.save(filename);
}

/**
 * Exporta multiples fichas técnicas en un solo PDF
 */
export async function exportMultipleTechnicalSheetsToPDF(
  repuestos: Repuesto[],
  machineName?: string
): Promise<void> {
  if (repuestos.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Iterar y añadir página para cada uno (excepto el primero que ya tiene página por defecto)
  for (let i = 0; i < repuestos.length; i++) {
    if (i > 0) doc.addPage();
    await addTechnicalSheetToDoc(doc, repuestos[i], machineName);
  }

  const filename = `Fichas_Tecnicas_Pack_${new Date().getTime()}.pdf`;
  doc.save(filename);
}
