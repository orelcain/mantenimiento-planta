/**
 * Exportación de ETT a Word (.docx)
 * REPLICA EXACTA del formato AquaChile "ESPECIFICACIONES TECNICAS Y BASES"
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
  HeadingLevel,
  TableLayoutType,
  convertInchesToTwip,
} from 'docx'
import type { ETT } from '@/types'
import { logger } from '@/lib/logger'

// Colores corporativos AquaChile
const COLORS = {
  azulOscuro: '1F4E79',    // Azul oscuro encabezados
  azulClaro: '5B9BD5',     // Azul claro bordes
  grisClaro: 'F2F2F2',     // Gris claro filas alternas
  rojo: 'FF0000',          // Rojo para destacar
  negro: '000000',
  blanco: 'FFFFFF',
}

// Bordes estándar para tablas
const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.azulClaro },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.azulClaro },
  left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.azulClaro },
  right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.azulClaro },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: COLORS.azulClaro },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COLORS.azulClaro },
}

/**
 * Crea celda de encabezado (fondo azul, texto blanco)
 */
function headerCell(text: string, width?: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: true,
            color: COLORS.blanco,
            size: 20, // 10pt
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ],
    shading: { fill: COLORS.azulOscuro },
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
  })
}

/**
 * Crea celda de etiqueta (fondo gris, texto negro bold)
 */
function labelCell(text: string, width?: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: true,
            size: 20,
          }),
        ],
      }),
    ],
    shading: { fill: COLORS.grisClaro },
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
  })
}

/**
 * Crea celda de valor (fondo blanco, texto normal)
 */
function valueCell(text: string, width?: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            size: 20,
          }),
        ],
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
  })
}

/**
 * Crea celda con texto rojo (para destacar)
 */
function redTextCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: true,
            color: COLORS.rojo,
            size: 20,
          }),
        ],
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
  })
}

/**
 * Crea título de sección numerada
 */
function sectionTitle(number: number, text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: `${number}. ${text}`,
        bold: true,
        size: 24, // 12pt
        color: COLORS.azulOscuro,
      }),
    ],
    spacing: { before: 300, after: 150 },
  })
}

/**
 * Crea párrafo con viñeta (bullet point)
 */
function bulletPoint(text: string, isRed = false): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: `➤  `,
        size: 20,
      }),
      new TextRun({
        text,
        size: 20,
        color: isRed ? COLORS.rojo : COLORS.negro,
        bold: isRed,
      }),
    ],
    spacing: { after: 80 },
  })
}

/**
 * Exporta ETT a formato Word siguiendo plantilla AquaChile
 */
export async function exportETTToWord(ett: ETT): Promise<Blob> {
  try {
    const sections: (Paragraph | Table)[] = []

    // ========================================
    // ENCABEZADO CORPORATIVO
    // ========================================
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'AQUACHILE',
            bold: true,
            size: 32,
            color: COLORS.azulOscuro,
          }),
        ],
        alignment: AlignmentType.LEFT,
      })
    )

    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'ESPECIFICACIONES TECNICAS Y BASES',
            bold: true,
            size: 28,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 100 },
      })
    )

    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Adquisiciones - Servicios',
            size: 22,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    )

    // ========================================
    // TABLA DE INFORMACIÓN PRINCIPAL
    // ========================================
    const fechaStr = ett.general.fecha 
      ? new Date(ett.general.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : ''

    sections.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorders,
        rows: [
          new TableRow({
            children: [
              labelCell('FECHA REQUERIMIENTO', 30),
              valueCell(fechaStr, 70),
            ],
          }),
          new TableRow({
            children: [
              labelCell('PROYECTO O SERVICIO', 30),
              valueCell(ett.general.titulo, 70),
            ],
          }),
          new TableRow({
            children: [
              labelCell('USUARIO SOLICITANTE', 30),
              valueCell(ett.general.solicitante, 70),
            ],
          }),
          new TableRow({
            children: [
              labelCell('SECTOR DE REALIZACIÓN', 30),
              valueCell(ett.general.area || 'Planta de Procesos', 70),
            ],
          }),
          new TableRow({
            children: [
              labelCell('FECHA INICIO DEL SERVICIO', 30),
              valueCell('', 70),
            ],
          }),
          new TableRow({
            children: [
              labelCell('FECHA TÉRMINO DEL SERVICIO', 30),
              valueCell('', 70),
            ],
          }),
          new TableRow({
            children: [
              labelCell('GARANTÍA EXIGIDA', 30),
              valueCell('06 (meses) Garantía Temporada Alta', 70),
            ],
          }),
        ],
      })
    )

    // Espacio
    sections.push(new Paragraph({ text: '', spacing: { after: 200 } }))

    // ========================================
    // 1. CONSIDERACIONES PREVIAS
    // ========================================
    sections.push(sectionTitle(1, 'CONSIDERACIONES PREVIAS:'))

    // Puntos con viñetas (algunos en rojo como en el original)
    sections.push(bulletPoint(
      'Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.',
      true
    ))
    sections.push(bulletPoint(
      'La fecha estimada para el inicio del servicio queda sujeta a la planificación de gerencia, por lo que se podría extender su fecha de realización.'
    ))
    sections.push(bulletPoint(
      'Trabajo se realizará de acuerdo con la planificación de planta y áreas que involucren servicios, además se debe considerar trabajar sin restricción de día ni horario.'
    ))
    sections.push(bulletPoint(
      'Cotización debe ser abierta con la descripción de los materiales a utilizar, mano de obra, gastos generales y utilidad.'
    ))
    sections.push(bulletPoint(
      'Se debe indicar en cotización la cantidad de días requeridos, para realizar el servicio.'
    ))
    sections.push(bulletPoint(
      'Se considerará la realización de visita en terreno, para revisar condiciones de trabajo y cantidad de materiales a utilizar, a la hora de definir una propuesta.'
    ))

    // Espacio
    sections.push(new Paragraph({ text: '', spacing: { after: 200 } }))

    // ========================================
    // ESPECIFICACIÓN DEL SERVICIO
    // ========================================
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'ESPECIFICACIÓN SERVICIO:',
            bold: true,
            size: 24,
            color: COLORS.azulOscuro,
          }),
        ],
        spacing: { before: 200, after: 150 },
      })
    )

    // Área de intervención
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Área de intervención:',
            bold: true,
            size: 20,
          }),
        ],
        spacing: { after: 80 },
      })
    )

    // Descripción general del área
    if (ett.general.descripcion_general) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: ett.general.descripcion_general,
              size: 20,
            }),
          ],
          spacing: { after: 150 },
        })
      )
    }

    // Descripción del trabajo
    if (ett.trabajo_descripcion) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: ett.trabajo_descripcion,
              size: 20,
            }),
          ],
          spacing: { after: 200 },
        })
      )
    }

    // ========================================
    // 3. MATERIALES Y EQUIPOS REQUERIDOS
    // ========================================
    if (ett.materiales && ett.materiales.length > 0) {
      sections.push(sectionTitle(3, 'MATERIALES Y EQUIPOS REQUERIDOS'))

      const materialRows = [
        // Header
        new TableRow({
          children: [
            headerCell('Material', 40),
            headerCell('Cantidad', 15),
            headerCell('Especificaciones', 45),
          ],
        }),
      ]

      ett.materiales.forEach((mat) => {
        materialRows.push(
          new TableRow({
            children: [
              valueCell(mat.nombre),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${mat.cantidad} ${mat.unidad}`,
                        size: 20,
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
              }),
              valueCell(mat.especificaciones || ''),
            ],
          })
        )
      })

      sections.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: tableBorders,
          rows: materialRows,
        })
      )
    }

    // Espacio
    sections.push(new Paragraph({ text: '', spacing: { after: 200 } }))

    // ========================================
    // 4. PROCEDIMIENTOS
    // ========================================
    if (ett.procedimientos && ett.procedimientos.length > 0) {
      sections.push(sectionTitle(4, 'PROCEDIMIENTOS'))

      ett.procedimientos
        .sort((a, b) => a.numero - b.numero)
        .forEach((proc) => {
          // Título del paso
          sections.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `Paso ${proc.numero}: ${proc.titulo}`,
                  bold: true,
                  size: 20,
                }),
              ],
              spacing: { before: 120, after: 60 },
            })
          )

          // Descripción
          sections.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: proc.descripcion,
                  size: 20,
                }),
              ],
              spacing: { after: 60 },
            })
          )

          // Precauciones (si existen)
          if (proc.precauciones) {
            sections.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: '⚠️ Precauciones: ',
                    bold: true,
                    size: 18,
                  }),
                  new TextRun({
                    text: proc.precauciones,
                    italics: true,
                    size: 18,
                  }),
                ],
                spacing: { after: 100 },
              })
            )
          }
        })
    }

    // Espacio
    sections.push(new Paragraph({ text: '', spacing: { after: 200 } }))

    // ========================================
    // 5. ANÁLISIS DE RIESGOS
    // ========================================
    if (ett.riesgos && ett.riesgos.length > 0) {
      sections.push(sectionTitle(5, 'ANÁLISIS DE RIESGOS'))

      const riesgoRows = [
        // Header
        new TableRow({
          children: [
            headerCell('Peligro', 35),
            headerCell('Probabilidad', 15),
            headerCell('Medidas Preventivas', 50),
          ],
        }),
      ]

      ett.riesgos.forEach((riesgo) => {
        riesgoRows.push(
          new TableRow({
            children: [
              valueCell(riesgo.peligro),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: riesgo.probabilidad,
                        size: 20,
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                verticalAlign: VerticalAlign.CENTER,
              }),
              valueCell(riesgo.medidas_preventivas),
            ],
          })
        )
      })

      sections.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: tableBorders,
          rows: riesgoRows,
        })
      )
    }

    // Espacio
    sections.push(new Paragraph({ text: '', spacing: { after: 200 } }))

    // ========================================
    // OBSERVACIONES
    // ========================================
    if (ett.general.observaciones) {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'OBSERVACIONES',
              bold: true,
              size: 24,
              color: COLORS.azulOscuro,
            }),
          ],
          spacing: { before: 200, after: 100 },
        })
      )

      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: ett.general.observaciones,
              size: 20,
            }),
          ],
          spacing: { after: 200 },
        })
      )
    }

    // ========================================
    // BASES ADMINISTRATIVAS (Sección fija)
    // ========================================
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'BASES ADMINISTRATIVAS',
            bold: true,
            size: 24,
            color: COLORS.azulOscuro,
          }),
        ],
        spacing: { before: 300, after: 150 },
      })
    )

    const basesAdministrativas = [
      { num: '1', title: 'OFERTAS:', text: 'Las ofertas deberán indicar por separado y en desglose los ítems de Materiales y Mano de Obra. Los Gastos Generales y Utilidades, deberán estar indicados aparte con sus respectivos montos y porcentajes. Además, se debe indicar un plazo estimado de ejecución del servicio.' },
      { num: '2', title: 'SUPERVISIÓN E INSPECCIÓN TÉCNICA:', text: 'La ejecución del servicio, coordinación, gestión y supervisión estará a cargo del área Mandante.' },
      { num: '3', title: 'REGLAMENTO INTERNO Y SEGURIDAD:', text: 'Será de responsabilidad del oferente considerar en su propuesta los insumos y EPP para la correcta ejecución de los trabajos. Asimismo, ejecutar sus trabajos según las normas de calidad y buenas prácticas vigentes de la compañía.' },
      { num: '4', title: 'PROTOCOLOS COVID:', text: 'Al momento de hacer visita técnica y/o ejecución del servicio, se exige presentarse con examen PCR o test de antígeno negativo, con un máximo de 72 horas. Esta información está sujeta a confirmación para cada Centro.' },
      { num: '6', title: 'FACTURACIÓN:', text: 'Para servicios, la factura debe ser emitida una vez que adquisiciones haya enviado el número de OC (documento pdf) y el mandante haya enviado el número de HES. Los números de OC y HES deben ser indicados en la factura para que esta sea aceptada por Aquachile.' },
      { num: '7', title: 'CONDICIONES DE PAGO:', text: 'Pago a 30 días desde emisión de factura. Empresa mandante no efectuará pagos por anticipo, a excepción de aquellos requerimientos que involucre montos de mayor envergadura, cuya empresa contratista otorgue una boleta de garantía equivalente al monto del anticipo solicitado.' },
      { num: '8', title: 'PENALIZACIÓN:', text: 'Se aplicará una multa equivalente al 0,5% sobre el valor neto del presupuesto adjudicado por cada día de atraso en los tiempos de entrega del servicio mientras sea atribuible por responsabilidad del proveedor.' },
      { num: '9', title: 'GARANTÍAS:', text: 'Proveedor deberá otorgar en la cotización una garantía en caso de incumplir con lo solicitado en la EETT o con la calidad del servicio realizado.' },
      { num: '10', title: 'CERTILAP:', text: 'Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.' },
    ]

    basesAdministrativas.forEach((base) => {
      sections.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${base.num}. ${base.title} `,
              bold: true,
              size: 20,
            }),
            new TextRun({
              text: base.text,
              size: 20,
            }),
          ],
          spacing: { after: 100 },
        })
      )
    })

    // ========================================
    // CREAR DOCUMENTO
    // ========================================
    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(0.75),
                bottom: convertInchesToTwip(0.75),
                left: convertInchesToTwip(0.75),
                right: convertInchesToTwip(0.75),
              },
            },
          },
          children: sections,
        },
      ],
    })

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
