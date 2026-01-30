/**
 * Exportación de ETT a Word (.docx)
 * Utiliza la librería docx para generar documentos profesionales
 */

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  WidthType,
  TextRun,
  AlignmentType,
  ShadingType,
} from 'docx'
import type { ETT } from '@/types'
import { logger } from '@/lib/logger'

/**
 * Crea celda de tabla con estilos
 */
function createCell(
  text: string,
  options: { bold?: boolean; fill?: string; textColor?: string } = {}
): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: options.bold,
            color: options.textColor,
          }),
        ],
      }),
    ],
    shading: options.fill
      ? { fill: options.fill, type: ShadingType.CLEAR }
      : undefined,
  })
}

/**
 * Crea párrafo con título de sección
 */
function createSectionTitle(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 28,
        color: '1F4788',
      }),
    ],
    spacing: { before: 300, after: 150 },
  })
}

/**
 * Crea párrafo de texto normal
 */
function createTextParagraph(text: string, options: { italic?: boolean } = {}): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        italics: options.italic,
      }),
    ],
    spacing: { after: 100 },
  })
}

/**
 * Exporta ETT a formato Word (.docx)
 */
export async function exportETTToWord(ett: ETT): Promise<Blob> {
  try {
    const sections: (Paragraph | Table)[] = []

    // Título principal
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'ESPECIFICACIÓN TÉCNICA DEL TRABAJO',
            bold: true,
            size: 32,
            color: '1F4788',
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      })
    )

    // Información general en tabla
    sections.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createCell('Título', { bold: true, fill: 'D9E8F5', textColor: '1F4788' }),
              createCell(ett.general.titulo),
              createCell('Fecha', { bold: true, fill: 'D9E8F5', textColor: '1F4788' }),
              createCell(new Date(ett.general.fecha).toLocaleDateString('es-ES')),
            ],
          }),
          new TableRow({
            children: [
              createCell('Solicitante', { bold: true, fill: 'D9E8F5', textColor: '1F4788' }),
              createCell(ett.general.solicitante),
              createCell('Responsable', { bold: true, fill: 'D9E8F5', textColor: '1F4788' }),
              createCell(ett.general.responsable),
            ],
          }),
        ],
      })
    )

    // Descripción general
    sections.push(createSectionTitle('1. INFORMACIÓN GENERAL'))
    sections.push(createTextParagraph(ett.general.descripcion_general || ''))

    // Descripción del trabajo
    if (ett.trabajo_descripcion) {
      sections.push(createSectionTitle('2. DESCRIPCIÓN DEL TRABAJO'))
      sections.push(createTextParagraph(ett.trabajo_descripcion))
    }

    // Materiales
    if (ett.materiales && ett.materiales.length > 0) {
      sections.push(createSectionTitle('3. MATERIALES Y EQUIPOS REQUERIDOS'))

      const materialRows = [
        new TableRow({
          children: [
            createCell('Material', { bold: true, fill: '1F4788', textColor: 'FFFFFF' }),
            createCell('Cantidad', { bold: true, fill: '1F4788', textColor: 'FFFFFF' }),
            createCell('Especificaciones', { bold: true, fill: '1F4788', textColor: 'FFFFFF' }),
          ],
        }),
      ]

      ett.materiales.forEach((mat) => {
        materialRows.push(
          new TableRow({
            children: [
              createCell(mat.nombre),
              createCell(`${mat.cantidad} ${mat.unidad}`),
              createCell(mat.especificaciones || ''),
            ],
          })
        )
      })

      sections.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: materialRows,
        })
      )
    }

    // Procedimientos
    if (ett.procedimientos && ett.procedimientos.length > 0) {
      sections.push(createSectionTitle('4. PROCEDIMIENTOS'))

      ett.procedimientos
        .sort((a, b) => a.numero - b.numero)
        .forEach((proc) => {
          sections.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `Paso ${proc.numero}: ${proc.titulo}`,
                  bold: true,
                }),
              ],
              spacing: { before: 150, after: 50 },
            })
          )

          sections.push(createTextParagraph(proc.descripcion))

          if (proc.precauciones) {
            sections.push(createTextParagraph(`⚠️ Precauciones: ${proc.precauciones}`, { italic: true }))
          }
        })
    }

    // Riesgos
    if (ett.riesgos && ett.riesgos.length > 0) {
      sections.push(createSectionTitle('5. ANÁLISIS DE RIESGOS'))

      const riesgoRows = [
        new TableRow({
          children: [
            createCell('Peligro', { bold: true, fill: '1F4788', textColor: 'FFFFFF' }),
            createCell('Probabilidad', { bold: true, fill: '1F4788', textColor: 'FFFFFF' }),
            createCell('Medidas Preventivas', { bold: true, fill: '1F4788', textColor: 'FFFFFF' }),
          ],
        }),
      ]

      ett.riesgos.forEach((riesgo) => {
        riesgoRows.push(
          new TableRow({
            children: [
              createCell(riesgo.peligro),
              createCell(riesgo.probabilidad),
              createCell(riesgo.medidas_preventivas),
            ],
          })
        )
      })

      sections.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: riesgoRows,
        })
      )
    }

    // Observaciones
    if (ett.general.observaciones) {
      sections.push(createSectionTitle('OBSERVACIONES'))
      sections.push(createTextParagraph(ett.general.observaciones))
    }

    // Crear documento
    const doc = new Document({
      sections: [
        {
          children: sections,
        },
      ],
    })

    // Convertir a blob
    const blob = await Packer.toBlob(doc)
    return blob
  } catch (error) {
    logger.error('Error exporting to Word', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Descarga el archivo Word
 */
export function downloadWord(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
