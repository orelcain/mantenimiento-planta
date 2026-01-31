/**
 * Script para crear la plantilla ETT con marcadores
 * Genera un archivo .docx con {{marcadores}} para usar con docxtemplater
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
  ImageRun,
  convertInchesToTwip,
  Header,
  Footer,
} from 'docx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Colores corporativos AquaChile
const COLORS = {
  azulOscuro: '1F4E79',
  azulClaro: '5B9BD5',
  grisClaro: 'F2F2F2',
  rojo: 'C00000',
  negro: '000000',
  blanco: 'FFFFFF',
}

const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.azulClaro },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.azulClaro },
  left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.azulClaro },
  right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.azulClaro },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: COLORS.azulClaro },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: COLORS.azulClaro },
}

function labelCell(text, width) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 20, font: 'Arial' })],
      }),
    ],
    shading: { fill: COLORS.grisClaro },
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
  })
}

function valueCell(text, width) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 20, font: 'Arial' })],
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
  })
}

async function createTemplate() {
  const sections = []

  // ENCABEZADO
  sections.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
      rows: [
        new TableRow({
          children: [
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
                }),
              ],
              width: { size: 30, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              rowSpan: 2,
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'ESPECIFICACIONES TECNICAS Y BASES',
                      bold: true,
                      size: 24,
                      font: 'Arial',
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                }),
              ],
              columnSpan: 2,
              verticalAlign: VerticalAlign.CENTER,
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: 'Adquisiciones - Servicios',
                      size: 20,
                      font: 'Arial',
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                }),
              ],
              columnSpan: 2,
              verticalAlign: VerticalAlign.CENTER,
            }),
          ],
        }),
      ],
    })
  )

  sections.push(new Paragraph({ text: '' }))

  // TABLA INFORMACIÓN PRINCIPAL
  sections.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorders,
      rows: [
        new TableRow({ children: [labelCell('FECHA REQUERIMIENTO', 35), valueCell('{{fecha}}', 65)] }),
        new TableRow({ children: [labelCell('PROYECTO O SERVICIO', 35), valueCell('{{titulo}}', 65)] }),
        new TableRow({ children: [labelCell('USUARIO SOLICITANTE', 35), valueCell('{{solicitante}}', 65)] }),
        new TableRow({ children: [labelCell('SECTOR DE REALIZACIÓN', 35), valueCell('{{sector}}', 65)] }),
        new TableRow({ children: [labelCell('FECHA INICIO DEL SERVICIO', 35), valueCell('{{fecha_inicio}}', 65)] }),
        new TableRow({ children: [labelCell('FECHA TÉRMINO DEL SERVICIO', 35), valueCell('{{fecha_termino}}', 65)] }),
        new TableRow({ children: [labelCell('GARANTÍA EXIGIDA', 35), valueCell('{{garantia}}', 65)] }),
      ],
    })
  )

  sections.push(new Paragraph({ text: '' }))

  // 1. CONSIDERACIONES PREVIAS
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '1.\tCONSIDERACIONES PREVIAS:',
          bold: true,
          size: 22,
          font: 'Arial',
        }),
      ],
      spacing: { before: 200, after: 100 },
    })
  )

  const consideraciones = [
    { text: 'Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.', red: true },
    { text: 'La fecha estimada para el inicio del servicio queda sujeta a la planificación de gerencia, por lo que se podría extender su fecha de realización.', red: false },
    { text: 'Trabajo se realizará de acuerdo con la planificación de planta y áreas que involucren servicios, además se debe considerar trabajar sin restricción de día ni horario.', red: false },
    { text: 'Cotización debe ser abierta con la descripción de los materiales a utilizar, mano de obra, gastos generales y utilidad.', red: false },
    { text: 'Se debe indicar en cotización la cantidad de días requeridos, para realizar el servicio.', red: false },
    { text: 'Se considerará la realización de visita en terreno, para revisar condiciones de trabajo y cantidad de materiales a utilizar, a la hora de definir una propuesta.', red: false },
  ]

  consideraciones.forEach((item) => {
    sections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: '➤\t',
            size: 20,
            font: 'Arial',
          }),
          new TextRun({
            text: item.text,
            size: 20,
            font: 'Arial',
            color: item.red ? COLORS.rojo : COLORS.negro,
            bold: item.red,
          }),
        ],
        spacing: { after: 60 },
        indent: { left: 360 },
      })
    )
  })

  sections.push(new Paragraph({ text: '' }))

  // ESPECIFICACIÓN SERVICIO
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'ESPECIFICACIÓN SERVICIO:',
          bold: true,
          size: 22,
          font: 'Arial',
          color: COLORS.azulOscuro,
        }),
      ],
      spacing: { before: 200, after: 100 },
    })
  )

  sections.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Área de intervención:', bold: true, size: 20, font: 'Arial' }),
      ],
      spacing: { after: 60 },
    })
  )

  sections.push(
    new Paragraph({
      children: [new TextRun({ text: '{{descripcion_general}}', size: 20, font: 'Arial' })],
      spacing: { after: 100 },
    })
  )

  sections.push(
    new Paragraph({
      children: [new TextRun({ text: '{{trabajo_descripcion}}', size: 20, font: 'Arial' })],
      spacing: { after: 200 },
    })
  )

  // MATERIALES - Marcador para loop
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '{{#if materiales}}',
          size: 2,
          color: COLORS.blanco,
        }),
      ],
    })
  )

  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '3.\tMATERIALES Y EQUIPOS REQUERIDOS',
          bold: true,
          size: 22,
          font: 'Arial',
          color: COLORS.azulOscuro,
        }),
      ],
      spacing: { before: 200, after: 100 },
    })
  )

  sections.push(
    new Paragraph({
      children: [new TextRun({ text: '{{materiales_tabla}}', size: 20, font: 'Arial' })],
      spacing: { after: 200 },
    })
  )

  sections.push(
    new Paragraph({
      children: [new TextRun({ text: '{{/if}}', size: 2, color: COLORS.blanco })],
    })
  )

  // PROCEDIMIENTOS
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '4.\tPROCEDIMIENTOS',
          bold: true,
          size: 22,
          font: 'Arial',
          color: COLORS.azulOscuro,
        }),
      ],
      spacing: { before: 200, after: 100 },
    })
  )

  sections.push(
    new Paragraph({
      children: [new TextRun({ text: '{{procedimientos_lista}}', size: 20, font: 'Arial' })],
      spacing: { after: 200 },
    })
  )

  // RIESGOS
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: '5.\tANÁLISIS DE RIESGOS',
          bold: true,
          size: 22,
          font: 'Arial',
          color: COLORS.azulOscuro,
        }),
      ],
      spacing: { before: 200, after: 100 },
    })
  )

  sections.push(
    new Paragraph({
      children: [new TextRun({ text: '{{riesgos_tabla}}', size: 20, font: 'Arial' })],
      spacing: { after: 200 },
    })
  )

  // OBSERVACIONES
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'OBSERVACIONES',
          bold: true,
          size: 22,
          font: 'Arial',
          color: COLORS.azulOscuro,
        }),
      ],
      spacing: { before: 200, after: 100 },
    })
  )

  sections.push(
    new Paragraph({
      children: [new TextRun({ text: '{{observaciones}}', size: 20, font: 'Arial' })],
      spacing: { after: 200 },
    })
  )

  // BASES ADMINISTRATIVAS (texto fijo)
  sections.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'BASES ADMINISTRATIVAS',
          bold: true,
          size: 22,
          font: 'Arial',
          color: COLORS.azulOscuro,
        }),
      ],
      spacing: { before: 300, after: 100 },
    })
  )

  const bases = [
    { num: '1', title: 'OFERTAS:', text: 'Las ofertas deberán indicar por separado y en desglose los ítems de Materiales y Mano de Obra. Los Gastos Generales y Utilidades, deberán estar indicados aparte con sus respectivos montos y porcentajes. Además, se debe indicar un plazo estimado de ejecución del servicio.' },
    { num: '2', title: 'SUPERVISIÓN E INSPECCIÓN TÉCNICA:', text: 'La ejecución del servicio, coordinación, gestión y supervisión estará a cargo del área Mandante.' },
    { num: '3', title: 'REGLAMENTO INTERNO Y SEGURIDAD:', text: 'Será de responsabilidad del oferente considerar en su propuesta los insumos y EPP para la correcta ejecución de los trabajos. Asimismo, ejecutar sus trabajos según las normas de calidad y buenas prácticas vigentes de la compañía.' },
    { num: '4', title: 'PROTOCOLOS COVID:', text: 'Al momento de hacer visita técnica y/o ejecución del servicio, se exige presentarse con examen PCR o test de antígeno negativo, con un máximo de 72 horas. Esta información está sujeta a confirmación para cada Centro.' },
    { num: '6', title: 'FACTURACIÓN:', text: 'Para servicios, la factura debe ser emitida una vez que adquisiciones haya enviado el número de OC (documento pdf) y el mandante (usuario directo de servicio) haya enviado el número de HES. Los números de OC y HES deben ser indicados en la factura para que esta sea aceptada por Aquachile, de lo contrario esta será reclamada automáticamente por el servicio de impuestos internos.' },
    { num: '7', title: 'CONDICIONES DE PAGO:', text: 'Pago a 30 días desde emisión de factura. Empresa mandante no efectuará pagos por anticipo, a excepción de aquellos requerimientos que involucre montos de mayor envergadura, cuya empresa contratista otorgue una boleta de garantía equivalente al monto del anticipo solicitado.' },
    { num: '8', title: 'PENALIZACIÓN:', text: 'Se aplicará una multa equivalente al 0,5% sobre el valor neto del presupuesto adjudicado por cada día de atraso en los tiempos de entrega del servicio mientras sea atribuible por responsabilidad del proveedor.' },
    { num: '9', title: 'GARANTÍAS:', text: 'Proveedor deberá otorgar en la cotización una garantía en caso de incumplir con lo solicitado en la EETT o con la calidad del servicio realizado.' },
    { num: '10', title: 'CERTILAP:', text: 'Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.' },
  ]

  bases.forEach((base) => {
    sections.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${base.num}. ${base.title} `, bold: true, size: 20, font: 'Arial' }),
          new TextRun({ text: base.text, size: 20, font: 'Arial' }),
        ],
        spacing: { after: 80 },
      })
    )
  })

  // Crear documento
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
          },
        },
        children: sections,
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  const outputPath = path.join(__dirname, '..', 'apps', 'pwa', 'public', 'templates', 'ETT_TEMPLATE.docx')
  fs.writeFileSync(outputPath, buffer)
  console.log('✅ Plantilla creada:', outputPath)
}

createTemplate().catch(console.error)
