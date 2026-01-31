/**
 * Exportación de ETT a Word (.docx)
 * FORMATO CORPORATIVO AquaChile - ESPECIFICACIONES TECNICAS Y BASES
 * 
 * Basado en el formato real de los documentos de Adquisiciones - Servicios
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
  BorderStyle,
  VerticalAlign,
  TableLayoutType,
  convertInchesToTwip,
  PageOrientation,
} from 'docx'
import type { ETT } from '@/types'
import { logger } from '@/lib/logger'

// ============================================================================
// COLORES Y ESTILOS CORPORATIVOS AQUACHILE
// ============================================================================
const COLORS = {
  // Azules corporativos
  azulOscuro: '1F4E79',     // Encabezados principales
  azulMedio: '2E75B6',      // Títulos de sección
  azulClaro: '9DC3E6',      // Bordes de tablas
  azulCelda: 'DEEAF6',      // Fondo celdas encabezado
  
  // Grises
  grisOscuro: 'D0CECE',     // Fondo celdas etiqueta
  grisClaro: 'F2F2F2',      // Fondo alterno
  
  // Otros
  rojo: 'FF0000',           // Texto destacado/advertencia
  negro: '000000',
  blanco: 'FFFFFF',
}

// Estilos de borde para tablas
const BORDER_STYLE = {
  style: BorderStyle.SINGLE,
  size: 8,
  color: COLORS.azulClaro,
}

const tableBorders = {
  top: BORDER_STYLE,
  bottom: BORDER_STYLE,
  left: BORDER_STYLE,
  right: BORDER_STYLE,
  insideHorizontal: { ...BORDER_STYLE, size: 4 },
  insideVertical: { ...BORDER_STYLE, size: 4 },
}

// ============================================================================
// FUNCIONES HELPER PARA CELDAS
// ============================================================================

/** Celda de encabezado de tabla (fondo azul oscuro, texto blanco) */
function headerCell(text: string, width?: number, colSpan?: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: true,
            color: COLORS.blanco,
            size: 20,
            font: 'Arial',
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    shading: { fill: COLORS.azulOscuro },
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: colSpan,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    borders: {
      top: BORDER_STYLE,
      bottom: BORDER_STYLE,
      left: BORDER_STYLE,
      right: BORDER_STYLE,
    },
  })
}

/** Celda de etiqueta (fondo gris, texto negro bold) */
function labelCell(text: string, width?: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: true,
            size: 20,
            font: 'Arial',
          }),
        ],
      }),
    ],
    shading: { fill: COLORS.grisOscuro },
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: {
      top: BORDER_STYLE,
      bottom: BORDER_STYLE,
      left: BORDER_STYLE,
      right: BORDER_STYLE,
    },
  })
}

/** Celda de valor (fondo blanco, texto normal) */
function valueCell(text: string, width?: number, colSpan?: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text || '',
            size: 20,
            font: 'Arial',
          }),
        ],
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: colSpan,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: {
      top: BORDER_STYLE,
      bottom: BORDER_STYLE,
      left: BORDER_STYLE,
      right: BORDER_STYLE,
    },
  })
}

/** Celda centrada */
function centeredCell(text: string, width?: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text || '',
            size: 20,
            font: 'Arial',
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    borders: {
      top: BORDER_STYLE,
      bottom: BORDER_STYLE,
      left: BORDER_STYLE,
      right: BORDER_STYLE,
    },
  })
}

/** Celda numerada (para listas) */
function numberCell(num: number, width?: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: String(num),
            size: 20,
            font: 'Arial',
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    borders: {
      top: BORDER_STYLE,
      bottom: BORDER_STYLE,
      left: BORDER_STYLE,
      right: BORDER_STYLE,
    },
  })
}

// ============================================================================
// FUNCIONES PARA CREAR SECCIONES
// ============================================================================

/** Crea título de sección numerada */
function sectionTitle(number: number, text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: `${number}.\t${text}`,
        bold: true,
        size: 22,
        color: COLORS.azulMedio,
        font: 'Arial',
      }),
    ],
    spacing: { before: 250, after: 120 },
  })
}

/** Crea párrafo con viñeta */
function bulletPoint(text: string, isRed = false): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: '➤\t',
        size: 20,
        font: 'Arial',
      }),
      new TextRun({
        text,
        size: 20,
        font: 'Arial',
        color: isRed ? COLORS.rojo : COLORS.negro,
        bold: isRed,
      }),
    ],
    spacing: { after: 60 },
    indent: { left: 360 },
  })
}

/** Formatea fecha a formato chileno */
function formatDate(fecha: Date | number | string | undefined): string {
  if (!fecha) return ''
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ============================================================================
// FUNCIÓN PRINCIPAL DE EXPORTACIÓN
// ============================================================================

/**
 * Exporta ETT a formato Word (.docx)
 * Genera documento con formato corporativo AquaChile idéntico al original
 */
export async function exportETTToWord(ett: ETT): Promise<Blob> {
  try {
    const content: (Paragraph | Table)[] = []

    // ========================================================================
    // ENCABEZADO CORPORATIVO (Tabla 2x2 como en el original)
    // ========================================================================
    content.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        borders: tableBorders,
        rows: [
          // Fila 1: Logo + Título
          new TableRow({
            children: [
              // Celda Logo AQUACHILE (rowSpan 2)
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'AQUACHILE',
                        bold: true,
                        size: 36,
                        color: COLORS.azulOscuro,
                        font: 'Arial',
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                width: { size: 25, type: WidthType.PERCENTAGE },
                rowSpan: 2,
                borders: {
                  top: BORDER_STYLE,
                  bottom: BORDER_STYLE,
                  left: BORDER_STYLE,
                  right: BORDER_STYLE,
                },
                margins: { top: 100, bottom: 100, left: 100, right: 100 },
              }),
              // Celda Título principal
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'ESPECIFICACIONES TECNICAS Y BASES',
                        bold: true,
                        size: 28,
                        font: 'Arial',
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                width: { size: 75, type: WidthType.PERCENTAGE },
                borders: {
                  top: BORDER_STYLE,
                  bottom: { ...BORDER_STYLE, size: 2 },
                  left: BORDER_STYLE,
                  right: BORDER_STYLE,
                },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
              }),
            ],
          }),
          // Fila 2: Subtítulo
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'Adquisiciones - Servicios',
                        size: 22,
                        font: 'Arial',
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
                borders: {
                  top: { ...BORDER_STYLE, size: 2 },
                  bottom: BORDER_STYLE,
                  left: BORDER_STYLE,
                  right: BORDER_STYLE,
                },
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
              }),
            ],
          }),
        ],
      })
    )

    content.push(new Paragraph({ text: '', spacing: { after: 200 } }))

    // ========================================================================
    // TABLA DE INFORMACIÓN PRINCIPAL
    // ========================================================================
    content.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        borders: tableBorders,
        rows: [
          new TableRow({
            children: [
              labelCell('FECHA REQUERIMIENTO', 35),
              valueCell(formatDate(ett.general.fecha), 65),
            ],
          }),
          new TableRow({
            children: [
              labelCell('PROYECTO O SERVICIO', 35),
              valueCell(ett.general.titulo, 65),
            ],
          }),
          new TableRow({
            children: [
              labelCell('USUARIO SOLICITANTE', 35),
              valueCell(ett.general.solicitante, 65),
            ],
          }),
          new TableRow({
            children: [
              labelCell('SECTOR DE REALIZACIÓN', 35),
              valueCell(ett.general.area || '', 65),
            ],
          }),
          new TableRow({
            children: [
              labelCell('FECHA INICIO DEL SERVICIO', 35),
              valueCell('', 65),
            ],
          }),
          new TableRow({
            children: [
              labelCell('FECHA TÉRMINO DEL SERVICIO', 35),
              valueCell('', 65),
            ],
          }),
          new TableRow({
            children: [
              labelCell('GARANTÍA EXIGIDA', 35),
              valueCell('06 (meses) Garantía Temporada Alta', 65),
            ],
          }),
        ],
      })
    )

    content.push(new Paragraph({ text: '', spacing: { after: 200 } }))

    // ========================================================================
    // 1. CONSIDERACIONES PREVIAS
    // ========================================================================
    content.push(sectionTitle(1, 'CONSIDERACIONES PREVIAS:'))
    
    content.push(bulletPoint(
      'Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.',
      true // texto en rojo
    ))
    content.push(bulletPoint(
      'La fecha estimada para el inicio del servicio queda sujeta a la planificación de gerencia, por lo que se podría extender su fecha de realización.'
    ))
    content.push(bulletPoint(
      'Trabajo se realizará de acuerdo con la planificación de planta y áreas que involucren servicios, además se debe considerar trabajar sin restricción de día ni horario.'
    ))
    content.push(bulletPoint(
      'Cotización debe ser abierta con la descripción de los materiales a utilizar, mano de obra, gastos generales y utilidad.'
    ))
    content.push(bulletPoint(
      'Se debe indicar en cotización la cantidad de días requeridos, para realizar el servicio.'
    ))
    content.push(bulletPoint(
      'Se considerará la realización de visita en terreno, para revisar condiciones de trabajo y cantidad de materiales a utilizar, a la hora de definir una propuesta.'
    ))

    content.push(new Paragraph({ text: '', spacing: { after: 150 } }))

    // ========================================================================
    // ESPECIFICACIÓN DEL SERVICIO
    // ========================================================================
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'ESPECIFICACIÓN SERVICIO:',
            bold: true,
            size: 22,
            color: COLORS.azulMedio,
            font: 'Arial',
          }),
        ],
        spacing: { before: 200, after: 120 },
      })
    )

    // Área de intervención
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Área de intervención:',
            bold: true,
            size: 20,
            font: 'Arial',
          }),
        ],
        spacing: { after: 60 },
      })
    )

    // Descripción general
    if (ett.general.descripcion_general) {
      // Dividir por líneas para preservar formato
      const lineas = ett.general.descripcion_general.split('\n')
      lineas.forEach(linea => {
        content.push(
          new Paragraph({
            children: [
              new TextRun({
                text: linea,
                size: 20,
                font: 'Arial',
              }),
            ],
            spacing: { after: 40 },
          })
        )
      })
    }

    content.push(new Paragraph({ text: '', spacing: { after: 100 } }))

    // ========================================================================
    // 2. DESCRIPCIÓN DEL TRABAJO
    // ========================================================================
    if (ett.trabajo_descripcion) {
      content.push(sectionTitle(2, 'DESCRIPCIÓN DEL TRABAJO A REALIZAR:'))
      
      // Dividir por líneas para preservar formato
      const lineas = ett.trabajo_descripcion.split('\n')
      lineas.forEach(linea => {
        const isBullet = linea.trim().startsWith('•') || linea.trim().startsWith('-') || linea.trim().startsWith('*')
        content.push(
          new Paragraph({
            children: [
              new TextRun({
                text: linea,
                size: 20,
                font: 'Arial',
              }),
            ],
            spacing: { after: 40 },
            indent: isBullet ? { left: 360 } : undefined,
          })
        )
      })
      
      content.push(new Paragraph({ text: '', spacing: { after: 150 } }))
    }

    // ========================================================================
    // 3. MATERIALES Y EQUIPOS REQUERIDOS
    // ========================================================================
    if (ett.materiales && ett.materiales.length > 0) {
      content.push(sectionTitle(3, 'MATERIALES Y EQUIPOS REQUERIDOS'))
      
      const rows: TableRow[] = [
        // Encabezado
        new TableRow({
          children: [
            headerCell('N°', 8),
            headerCell('MATERIAL / EQUIPO', 42),
            headerCell('CANTIDAD', 12),
            headerCell('UNIDAD', 12),
            headerCell('ESPECIFICACIONES', 26),
          ],
        }),
      ]

      ett.materiales.forEach((mat, idx) => {
        rows.push(
          new TableRow({
            children: [
              numberCell(idx + 1, 8),
              valueCell(mat.nombre, 42),
              centeredCell(String(mat.cantidad || ''), 12),
              centeredCell(mat.unidad || '', 12),
              valueCell(mat.especificaciones || '', 26),
            ],
          })
        )
      })

      content.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          borders: tableBorders,
          rows,
        })
      )
      
      content.push(new Paragraph({ text: '', spacing: { after: 150 } }))
    }

    // ========================================================================
    // 4. PROCEDIMIENTOS
    // ========================================================================
    if (ett.procedimientos && ett.procedimientos.length > 0) {
      content.push(sectionTitle(4, 'PROCEDIMIENTOS'))
      
      const rows: TableRow[] = [
        // Encabezado
        new TableRow({
          children: [
            headerCell('N°', 8),
            headerCell('TÍTULO', 25),
            headerCell('DESCRIPCIÓN', 47),
            headerCell('PRECAUCIONES', 20),
          ],
        }),
      ]

      // Ordenar por número
      const procedimientosOrdenados = [...ett.procedimientos].sort((a, b) => a.numero - b.numero)
      
      procedimientosOrdenados.forEach((proc, idx) => {
        rows.push(
          new TableRow({
            children: [
              numberCell(proc.numero || idx + 1, 8),
              valueCell(proc.titulo, 25),
              valueCell(proc.descripcion, 47),
              valueCell(proc.precauciones || '', 20),
            ],
          })
        )
      })

      content.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          borders: tableBorders,
          rows,
        })
      )
      
      content.push(new Paragraph({ text: '', spacing: { after: 150 } }))
    }

    // ========================================================================
    // 5. ANÁLISIS DE RIESGOS
    // ========================================================================
    if (ett.riesgos && ett.riesgos.length > 0) {
      content.push(sectionTitle(5, 'ANÁLISIS DE RIESGOS'))
      
      const rows: TableRow[] = [
        // Encabezado
        new TableRow({
          children: [
            headerCell('N°', 6),
            headerCell('PELIGRO / RIESGO', 30),
            headerCell('PROBABILIDAD', 12),
            headerCell('CONSECUENCIA', 12),
            headerCell('MEDIDAS PREVENTIVAS', 40),
          ],
        }),
      ]

      ett.riesgos.forEach((riesgo, idx) => {
        rows.push(
          new TableRow({
            children: [
              numberCell(idx + 1, 6),
              valueCell(riesgo.peligro, 30),
              centeredCell(riesgo.probabilidad, 12),
              centeredCell(riesgo.consecuencia, 12),
              valueCell(riesgo.medidas_preventivas, 40),
            ],
          })
        )
      })

      content.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          borders: tableBorders,
          rows,
        })
      )
      
      content.push(new Paragraph({ text: '', spacing: { after: 150 } }))
    }

    // ========================================================================
    // OBSERVACIONES (si existen)
    // ========================================================================
    if (ett.general.observaciones) {
      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'OBSERVACIONES:',
              bold: true,
              size: 22,
              color: COLORS.azulMedio,
              font: 'Arial',
            }),
          ],
          spacing: { before: 200, after: 100 },
        })
      )

      const lineas = ett.general.observaciones.split('\n')
      lineas.forEach(linea => {
        const isBullet = linea.trim().startsWith('•') || linea.trim().startsWith('-')
        content.push(
          new Paragraph({
            children: [
              new TextRun({
                text: linea,
                size: 20,
                font: 'Arial',
              }),
            ],
            spacing: { after: 40 },
            indent: isBullet ? { left: 360 } : undefined,
          })
        )
      })
      
      content.push(new Paragraph({ text: '', spacing: { after: 150 } }))
    }

    // ========================================================================
    // BASES ADMINISTRATIVAS (Texto estándar corporativo)
    // ========================================================================
    content.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'BASES ADMINISTRATIVAS',
            bold: true,
            size: 24,
            color: COLORS.azulOscuro,
            font: 'Arial',
          }),
        ],
        spacing: { before: 300, after: 150 },
        alignment: AlignmentType.CENTER,
      })
    )

    const basesAdministrativas = [
      { num: '1', titulo: 'OFERTAS:', texto: 'Las ofertas deberán indicar por separado y en desglose los ítems de Materiales y Mano de Obra. Los Gastos Generales y Utilidades, deberán estar indicados aparte con sus respectivos montos y porcentajes. Además, se debe indicar un plazo estimado de ejecución del servicio.' },
      { num: '2', titulo: 'SUPERVISIÓN E INSPECCIÓN TÉCNICA:', texto: 'La ejecución del servicio, coordinación, gestión y supervisión estará a cargo del área Mandante.' },
      { num: '3', titulo: 'REGLAMENTO INTERNO Y SEGURIDAD:', texto: 'Será de responsabilidad del oferente considerar en su propuesta los insumos y EPP para la correcta ejecución de los trabajos. Asimismo, ejecutar sus trabajos según las normas de calidad y buenas prácticas vigentes de la compañía.' },
      { num: '4', titulo: 'PROTOCOLOS COVID:', texto: 'Al momento de hacer visita técnica y/o ejecución del servicio, se exige presentarse con examen PCR o test de antígeno negativo, con un máximo de 72 horas. Esta información está sujeta a confirmación para cada Centro.' },
      { num: '5', titulo: 'FACTURACIÓN:', texto: 'Para servicios, la factura debe ser emitida una vez que adquisiciones haya enviado el número de OC (documento pdf) y el mandante (usuario directo de servicio) haya enviado el número de HES. Los números de OC y HES deben ser indicados en la factura para que esta sea aceptada por Aquachile, de lo contrario esta será reclamada automáticamente por el servicio de impuestos internos.' },
      { num: '6', titulo: 'CONDICIONES DE PAGO:', texto: 'Pago a 30 días desde emisión de factura. Empresa mandante no efectuará pagos por anticipo, a excepción de aquellos requerimientos que involucre montos de mayor envergadura, cuya empresa contratista otorgue una boleta de garantía equivalente al monto del anticipo solicitado.' },
      { num: '7', titulo: 'PENALIZACIÓN:', texto: 'Se aplicará una multa equivalente al 0,5% sobre el valor neto del presupuesto adjudicado por cada día de atraso en los tiempos de entrega del servicio mientras sea atribuible por responsabilidad del proveedor.' },
      { num: '8', titulo: 'GARANTÍAS:', texto: 'Proveedor deberá otorgar en la cotización una garantía en caso de incumplir con lo solicitado en la EETT o con la calidad del servicio realizado.' },
      { num: '9', titulo: 'CERTILAP:', texto: 'Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.' },
    ]

    basesAdministrativas.forEach(base => {
      content.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${base.num}. ${base.titulo} `,
              bold: true,
              size: 20,
              font: 'Arial',
            }),
            new TextRun({
              text: base.texto,
              size: 20,
              font: 'Arial',
            }),
          ],
          spacing: { after: 80 },
        })
      )
    })

    // ========================================================================
    // CREAR DOCUMENTO FINAL
    // ========================================================================
    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(0.6),
                bottom: convertInchesToTwip(0.6),
                left: convertInchesToTwip(0.7),
                right: convertInchesToTwip(0.7),
              },
              size: {
                orientation: PageOrientation.PORTRAIT,
              },
            },
          },
          children: content,
        },
      ],
    })

    const blob = await Packer.toBlob(doc)
    logger.info('ETT exportado a Word exitosamente', { id: ett.id })
    return blob

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Error exportando ETT a Word', new Error(message))
    throw new Error(`Error al exportar ETT: ${message}`)
  }
}

/**
 * Descarga el archivo Word generado
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
