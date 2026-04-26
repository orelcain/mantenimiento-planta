import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Repuesto, TechnicalDataField } from '@/types/repuestos'
import { logger } from '@/lib/logger'

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
  } catch {
    logger.warn('Error fetching image for PDF')
    return null;
  }
}


const TECHNICAL_KEY_TRANSLATIONS: Record<string, string> = {
  // Dimensiones
  'WIDTH': 'ANCHO',
  'LENGTH': 'LARGO',
  'HEIGHT': 'ALTO',
  'WEIGHT': 'PESO',
  'DEPTH': 'PROFUNDIDAD',
  'DIAMETER': 'DIÁMETRO',
  'THICKNESS': 'ESPESOR',
  
  // Eléctrico
  'POWER': 'POTENCIA',
  'VOLTAGE': 'VOLTAJE',
  'CURRENT': 'CORRIENTE',
  'FREQUENCY': 'FRECUENCIA',
  'SPEED': 'VELOCIDAD',
  
  // Bomba/Motor
  'FLOW': 'CAUDAL',
  'PRESSURE': 'PRESIÓN',
  'HEAD': 'ALTURA',
  'MATERIAL': 'MATERIAL',
  'TYPE': 'TIPO',
  'MODEL': 'MODELO',
  'BRAND': 'MARCA',
  'SERIAL': 'SERIE',
  'RPM': 'RPM',
  'HP': 'HP',
  'KW': 'KW',
  
  // Otros
  'CAPACITY': 'CAPACIDAD',
  'RATIO': 'RELACIÓN',
  'SIZE': 'TAMAÑO'
};

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
  // Ajuste: si machineName es un ID largo (probable auto-ID), mostrar "Planta General" o similar
  const displayName = (!machineName || machineName.length > 20) ? 'Planta General / Sin Asignar' : machineName;
  doc.text(`Equipo: ${displayName}`, pageWidth / 2, yPos, { align: 'center' });
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
           // Traducir clave si existe en el diccionario
           const upperKey = key.toUpperCase();
           const label = TECHNICAL_KEY_TRANSLATIONS[upperKey] || upperKey;
           // Formato de valor si es numérico y tiene unidad conocida (simple heurística)
           // Por ahora raw
           tableData.push([label, value.toString()]);
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
              // 1. Intentar usar dimensiones guardadas (Metadata) - MÁS PRECISO Y RÁPIDO
              let ratio = img.dimensions ? (img.dimensions.width / img.dimensions.height) : 0;
              
              // 2. Si no hay metadata, calcular usando el objeto Image del navegador
              if (!ratio || isNaN(ratio)) {
                 ratio = await new Promise<number>((resolve) => {
                     const i = new Image();
                     i.onload = () => resolve(i.naturalWidth / i.naturalHeight);
                     i.onerror = () => resolve(0); // Marcar como fallido para usar fallback visual
                     i.src = base64Img;
                 });
              }

              // Fallback final si todo falla: asumir cuadrado (1:1)
              if (!ratio || isNaN(ratio) || ratio === 0) ratio = 1;

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
              
              // Detectar formato desde la cabecera Base64 (ej: data:image/webp;base64,...)
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

        } catch {
            logger.warn('No se pudo agregar imagen al PDF')
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
    const repuesto = repuestos[i];
    if (!repuesto) continue; // Skip undefined
    if (i > 0) doc.addPage();
    await addTechnicalSheetToDoc(doc, repuesto, machineName);
  }

  const filename = `Fichas_Tecnicas_Pack_${new Date().getTime()}.pdf`;
  doc.save(filename);
}
