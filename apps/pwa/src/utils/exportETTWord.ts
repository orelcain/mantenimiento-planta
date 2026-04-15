/**
 * Exportación de ETT a Word (.docx)
 *
 * Formato corporativo AquaChile — ESPECIFICACIONES TÉCNICAS Y BASES
 * Adquisiciones / Servicios
 *
 * Replica pixel-perfect los documentos reales:
 *   - "Reubicación tablero control - Paneles R.E. (PIR) Cielo Baader/Grader"
 *   - "Cambio y estandarización de collarines, piping y mejoras en líneas
 *      de agua – Planta Principal"
 *
 * Consume el nuevo modelo `ETT` con bloques tipados (párrafo/lista/tabla/subtítulo).
 *
 * Estructura del documento generado:
 *
 *   1. ENCABEZADO FIJO      (AQUACHILE / ESPECIFICACIONES TECNICAS Y BASES)
 *   2. TABLA CABECERA       (7 filas editables, una por campo)
 *   3. CONSIDERACIONES      (texto fijo, 6 viñetas, 1ra en rojo)
 *   4. ESPECIFICACIÓN
 *        - Área de intervención     (texto editable)
 *        - Descripción de trabajos  (bloques flexibles)
 *        - Responsabilidades        (lista editable)
 *        - Imágenes de referencia   (si hay adjuntos)
 *   5. BLOQUE FIJO FINAL   (MATERIAL GRÁFICO / SUMINISTROS / EQUIPOS / ASEO)
 *   6. BASES ADMINISTRATIVAS (texto fijo, 10 cláusulas)
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
import type {
  ETT,
  ETTBloque,
  ETTBloqueLista,
  ETTBloqueParrafo,
  ETTBloqueSubtitulo,
  ETTBloqueTabla,
  ETTListItem,
} from '@/types'
import { logger } from '@/lib/logger'

// ============================================================================
// COLORES Y ESTILOS CORPORATIVOS AQUACHILE
// ============================================================================

const COLORS = {
  azulOscuro: '1F4E79',
  azulMedio: '2E75B6',
  azulClaro: '9DC3E6',
  azulCelda: 'DEEAF6',
  grisOscuro: 'D0CECE',
  grisClaro: 'F2F2F2',
  rojo: 'FF0000',
  negro: '000000',
  blanco: 'FFFFFF',
} as const

const BORDER_STYLE = {
  style: BorderStyle.SINGLE,
  size: 8,
  color: COLORS.azulClaro,
}

const CELL_BORDERS = {
  top: BORDER_STYLE,
  bottom: BORDER_STYLE,
  left: BORDER_STYLE,
  right: BORDER_STYLE,
}

const TABLE_BORDERS = {
  ...CELL_BORDERS,
  insideHorizontal: { ...BORDER_STYLE, size: 4 },
  insideVertical: { ...BORDER_STYLE, size: 4 },
}

// ============================================================================
// HELPERS DE FORMATO
// ============================================================================

/** Formatea fecha al formato chileno dd-mm-yyyy */
function formatDate(fecha: Date | undefined | null): string {
  if (!fecha) return ''
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Crea un TextRun con tipografía corporativa Arial tamaño 20 por defecto */
function run(
  text: string,
  opts: { bold?: boolean; size?: number; color?: string; italic?: boolean } = {},
): TextRun {
  return new TextRun({
    text,
    font: 'Arial',
    size: opts.size ?? 20,
    bold: opts.bold,
    color: opts.color,
    italics: opts.italic,
  })
}

// ============================================================================
// HELPERS PARA CELDAS DE TABLA
// ============================================================================

/** Celda etiqueta de la tabla de cabecera (fondo gris, texto bold) */
function labelCell(text: string, width?: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [run(text, { bold: true })],
      }),
    ],
    shading: { fill: COLORS.grisOscuro },
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: CELL_BORDERS,
  })
}

/** Celda de valor (fondo blanco, centrado) */
function valueCell(text: string, width?: number): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [run(text || '')],
        alignment: AlignmentType.CENTER,
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    borders: CELL_BORDERS,
  })
}

/** Celda de encabezado (fondo azul, texto blanco bold) — usado en tablas de datos */
function headerCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [run(text, { bold: true, color: COLORS.blanco })],
        alignment: AlignmentType.CENTER,
      }),
    ],
    shading: { fill: COLORS.azulOscuro },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    borders: CELL_BORDERS,
  })
}

/** Celda de datos (fondo blanco, centrado) — usado en tablas técnicas */
function dataCell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [run(text || '')],
        alignment: AlignmentType.CENTER,
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    borders: CELL_BORDERS,
  })
}

// ============================================================================
// SECCIONES FIJAS DEL DOCUMENTO
// ============================================================================

/** Encabezado AQUACHILE + título del documento */
function buildEncabezado(): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  run('AQUACHILE', {
                    bold: true,
                    size: 36,
                    color: COLORS.azulOscuro,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
            width: { size: 25, type: WidthType.PERCENTAGE },
            rowSpan: 2,
            borders: CELL_BORDERS,
            margins: { top: 100, bottom: 100, left: 100, right: 100 },
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [run('ESPECIFICACIONES TECNICAS Y BASES', { bold: true, size: 28 })],
                alignment: AlignmentType.CENTER,
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
            width: { size: 75, type: WidthType.PERCENTAGE },
            borders: { ...CELL_BORDERS, bottom: { ...BORDER_STYLE, size: 2 } },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                children: [run('Adquisiciones - Servicios', { size: 22 })],
                alignment: AlignmentType.CENTER,
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
            borders: { ...CELL_BORDERS, top: { ...BORDER_STYLE, size: 2 } },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
          }),
        ],
      }),
    ],
  })
}

/** Tabla de información principal (7 filas editables) */
function buildCabeceraTable(ett: ETT): Table {
  const { cabecera } = ett
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          labelCell('FECHA REQUERIMIENTO', 35),
          valueCell(formatDate(cabecera.fecha_requerimiento), 65),
        ],
      }),
      new TableRow({
        children: [
          labelCell('PROYECTO O SERVICIO', 35),
          valueCell(cabecera.proyecto, 65),
        ],
      }),
      new TableRow({
        children: [
          labelCell('USUARIO SOLICITANTE', 35),
          valueCell(cabecera.usuario_solicitante, 65),
        ],
      }),
      new TableRow({
        children: [
          labelCell('SECTOR DE REALIZACIÓN', 35),
          valueCell(cabecera.sector_realizacion, 65),
        ],
      }),
      new TableRow({
        children: [
          labelCell('FECHA INICIO DEL SERVICIO', 35),
          valueCell(formatDate(cabecera.fecha_inicio), 65),
        ],
      }),
      new TableRow({
        children: [
          labelCell('FECHA TÉRMINO DEL SERVICIO', 35),
          valueCell(formatDate(cabecera.fecha_termino), 65),
        ],
      }),
      new TableRow({
        children: [
          labelCell('GARANTÍA EXIGIDA', 35),
          valueCell(cabecera.garantia_texto, 65),
        ],
      }),
    ],
  })
}

/** Consideraciones previas — texto fijo, 6 viñetas (1ra en rojo) */
function buildConsideracionesPrevias(): Paragraph[] {
  const bullet = (texto: string, rojo = false): Paragraph =>
    new Paragraph({
      children: [
        run('➤\t'),
        run(texto, { color: rojo ? COLORS.rojo : COLORS.negro, bold: rojo }),
      ],
      spacing: { after: 60 },
      indent: { left: 360 },
    })

  return [
    new Paragraph({
      children: [
        run('1.\tCONSIDERACIONES PREVIAS:', {
          bold: true,
          size: 22,
          color: COLORS.azulMedio,
        }),
      ],
      spacing: { before: 250, after: 120 },
    }),
    bullet(
      'Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.',
      true,
    ),
    bullet(
      'La fecha estimada para el inicio del servicio queda sujeta a la planificación de gerencia, por lo que se podría extender su fecha de realización.',
    ),
    bullet(
      'Trabajo se realizará de acuerdo con la planificación de planta y áreas que involucren servicios, además se debe considerar trabajar sin restricción de día ni horario.',
    ),
    bullet(
      'Cotización debe ser abierta con la descripción de los materiales a utilizar, mano de obra, gastos generales y utilidad.',
    ),
    bullet('Se debe indicar en cotización la cantidad de días requeridos, para realizar el servicio.'),
    bullet(
      'Se considerará la realización de visita en terreno, para revisar condiciones de trabajo y cantidad de materiales a utilizar, a la hora de definir una propuesta.',
    ),
    new Paragraph({ text: '', spacing: { after: 150 } }),
  ]
}

// ============================================================================
// RENDERIZADO DE BLOQUES VARIABLES
// ============================================================================

/** Renderiza un bloque de párrafo */
function renderParrafo(bloque: ETTBloqueParrafo): Paragraph {
  const color =
    bloque.color === 'rojo'
      ? COLORS.rojo
      : bloque.color === 'azul'
        ? COLORS.azulMedio
        : COLORS.negro

  return new Paragraph({
    children: [run(bloque.texto, { bold: bloque.negrita, color })],
    spacing: { after: 80 },
  })
}

/** Renderiza un bloque de subtítulo (negrita, tamaño mayor) */
function renderSubtitulo(bloque: ETTBloqueSubtitulo): Paragraph {
  return new Paragraph({
    children: [run(bloque.texto, { bold: true, size: 22 })],
    spacing: { before: 150, after: 80 },
  })
}

/**
 * Renderiza un bloque de lista — soporta sub-items anidados.
 * Usa viñetas unicode para bullets, números para numerada, guiones para dash.
 */
function renderLista(bloque: ETTBloqueLista): Paragraph[] {
  const estilo = bloque.estilo ?? 'bullets'
  const paragraphs: Paragraph[] = []

  bloque.items.forEach((item, idx) => {
    // Viñeta para el item principal
    const prefix =
      estilo === 'numerada'
        ? `${idx + 1}. `
        : estilo === 'dash'
          ? '— '
          : '• '

    paragraphs.push(
      new Paragraph({
        children: [run(prefix + item.texto)],
        spacing: { after: 40 },
        indent: { left: 360 },
      }),
    )

    // Sub-items (indentados, siempre con guiones)
    if (item.subitems && item.subitems.length > 0) {
      item.subitems.forEach((sub: ETTListItem) => {
        paragraphs.push(
          new Paragraph({
            children: [run('• ' + sub.texto)],
            spacing: { after: 30 },
            indent: { left: 720 },
          }),
        )
      })
    }
  })

  paragraphs.push(new Paragraph({ text: '', spacing: { after: 80 } }))
  return paragraphs
}

/** Renderiza un bloque de tabla con columnas dinámicas */
function renderTabla(bloque: ETTBloqueTabla): Table {
  const rows: TableRow[] = []

  // Fila de encabezado con las columnas
  rows.push(
    new TableRow({
      children: bloque.columnas.map((col) => headerCell(col)),
    }),
  )

  // Filas de datos
  bloque.filas.forEach((fila) => {
    rows.push(
      new TableRow({
        children: fila.celdas.map((valor) => dataCell(valor)),
      }),
    )
  })

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows,
  })
}

/** Renderiza un bloque cualquiera, devolviendo el array de elementos a insertar */
function renderBloque(bloque: ETTBloque): (Paragraph | Table)[] {
  switch (bloque.tipo) {
    case 'parrafo':
      return [renderParrafo(bloque)]
    case 'subtitulo':
      return [renderSubtitulo(bloque)]
    case 'lista':
      return renderLista(bloque)
    case 'tabla':
      return [renderTabla(bloque), new Paragraph({ text: '', spacing: { after: 100 } })]
  }
}

// ============================================================================
// BLOQUE "ESPECIFICACIÓN SERVICIO"
// ============================================================================

function buildEspecificacionServicio(ett: ETT): (Paragraph | Table)[] {
  const content: (Paragraph | Table)[] = []

  // Título "ESPECIFICACIÓN SERVICIO:"
  content.push(
    new Paragraph({
      children: [
        run('ESPECIFICACIÓN SERVICIO:', {
          bold: true,
          size: 22,
          color: COLORS.azulMedio,
        }),
      ],
      spacing: { before: 200, after: 120 },
    }),
  )

  // Subtítulo "Área de intervención:"
  content.push(
    new Paragraph({
      children: [run('Área de intervención:', { bold: true })],
      spacing: { after: 60 },
    }),
  )

  // Texto del área
  if (ett.area_intervencion) {
    content.push(
      new Paragraph({
        children: [run(ett.area_intervencion)],
        spacing: { after: 120 },
      }),
    )
  }

  // Bloques de descripción de trabajos
  ett.descripcion_trabajos.forEach((bloque) => {
    renderBloque(bloque).forEach((el) => content.push(el))
  })

  // Responsabilidades del contratista
  if (ett.responsabilidades_contratista.length > 0) {
    content.push(
      new Paragraph({
        children: [run('Responsabilidades del contratista:', { bold: true })],
        spacing: { before: 150, after: 60 },
      }),
    )
    ett.responsabilidades_contratista.forEach((r) => {
      content.push(
        new Paragraph({
          children: [run('• ' + r)],
          spacing: { after: 40 },
          indent: { left: 360 },
        }),
      )
    })
    content.push(new Paragraph({ text: '', spacing: { after: 100 } }))
  }

  // Imágenes de referencia (si hay)
  if (ett.imagenes.length > 0) {
    content.push(
      new Paragraph({
        children: [run('Imágenes de referencia:', { bold: true })],
        spacing: { before: 150, after: 60 },
      }),
    )
    content.push(
      new Paragraph({
        children: [
          run(
            `Se adjuntan ${ett.imagenes.length} fotografía${ett.imagenes.length > 1 ? 's' : ''} del área desde diferentes ángulos, donde se identifica claramente la zona a intervenir.`,
          ),
        ],
        spacing: { after: 80 },
      }),
    )
    ett.imagenes.forEach((img, idx) => {
      content.push(
        new Paragraph({
          children: [
            run(`${idx + 1}. ${img.nombre}`, { bold: true }),
            run(img.descripcion ? ` — ${img.descripcion}` : ''),
          ],
          spacing: { after: 40 },
          indent: { left: 360 },
        }),
      )
    })
    content.push(new Paragraph({ text: '', spacing: { after: 100 } }))
  }

  return content
}

// ============================================================================
// BLOQUE FIJO FINAL (SUMINISTROS, EQUIPOS, ASEO)
// ============================================================================

function buildBloqueFijoFinal(): Paragraph[] {
  return [
    new Paragraph({
      children: [run('MATERIAL GRAFICO: ', { bold: true })],
      spacing: { before: 200, after: 100 },
    }),
    new Paragraph({
      children: [run('SUMINISTROS: ', { bold: true }), run('Parte de la oferta')],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        run('EQUIPOS Y HERRAMIENTAS: ', { bold: true }),
        run(
          'Todas las herramientas deberán ser suministrados por la empresa contratista y será de su exclusiva responsabilidad el cuidado y deterioro de estas producto del servicio o proyecto.',
        ),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        run('ASEO Y ENTREGA: ', { bold: true }),
        run(
          'Se deberá entregar para recepción del servicio o proyecto, todas las zonas intervenidas en perfecto estado de limpieza. Los escombros o desechos resultantes de la ejecución deberán destinarse a los sectores de segregación, incorporándose en las respectivas tolvas de desecho o reciclaje.',
        ),
      ],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [
        run(
          'El contratista deberá cumplir con todas las normas de buenas prácticas de protección de alimentos, tomando todas las medidas necesarias durante su desarrollo y al término de este para prevenir la contaminación de los productos por materias extrañas a consecuencia de su trabajo, ya sea este al interior o exterior de los recintos productivos y almacenamiento.',
        ),
      ],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [
        run(
          'En caso de ocurrir daños a la propiedad o inmueble, contratista deberá reponerlos en su totalidad.',
        ),
      ],
      spacing: { after: 200 },
    }),
  ]
}

// ============================================================================
// BASES ADMINISTRATIVAS (10 cláusulas estándar)
// ============================================================================

interface BaseAdministrativa {
  num: string
  titulo: string
  texto: string
}

const BASES_ADMINISTRATIVAS: BaseAdministrativa[] = [
  {
    num: '1',
    titulo: 'OFERTAS:',
    texto:
      'Las ofertas deberán indicar por separado y en desglose los ítems de Materiales y Mano de Obra. Los Gastos Generales y Utilidades, deberán estar indicados aparte con sus respectivos montos y porcentajes. Además, se debe indicar un plazo estimado de ejecución del servicio.',
  },
  {
    num: '2',
    titulo: 'SUPERVISIÓN E INSPECCIÓN TÉCNICA:',
    texto:
      'La ejecución del servicio, coordinación, gestión y supervisión estará a cargo del área Mandante.',
  },
  {
    num: '3',
    titulo: 'REGLAMENTO INTERNO Y SEGURIDAD:',
    texto:
      'Será de responsabilidad del oferente considerar en su propuesta los insumos y EPP para la correcta ejecución de los trabajos. Asimismo, ejecutar sus trabajos según las normas de calidad y buenas prácticas vigentes de la compañía.',
  },
  {
    num: '4',
    titulo: 'PROTOCOLOS COVID:',
    texto:
      'Al momento de hacer visita técnica y/o ejecución del servicio, se exige presentarse con examen PCR o test de antígeno negativo, con un máximo de 72 horas. Esta información está sujeta a confirmación para cada Centro.',
  },
  {
    num: '6',
    titulo: 'FACTURACIÓN:',
    texto:
      'Para servicios, la factura debe ser emitida una vez que adquisiciones haya enviado el número de OC (documento pdf) y el mandante (usuario directo de servicio) haya enviado el número de HES. Los números de OC y HES deben ser indicados en la factura para que esta sea aceptada por Aquachile, de lo contrario esta será reclamada automáticamente por el servicio de impuestos internos.',
  },
  {
    num: '7',
    titulo: 'CONDICIONES DE PAGO:',
    texto:
      'Pago a 30 días desde emisión de factura. Empresa mandante no efectuará pagos por anticipo, a excepción de aquellos requerimientos que involucre montos de mayor envergadura, cuya empresa contratista otorgue una boleta de garantía equivalente al monto del anticipo solicitado.',
  },
  {
    num: '8',
    titulo: 'PENALIZACIÓN:',
    texto:
      'Se aplicará una multa equivalente al 0,5% sobre el valor neto del presupuesto adjudicado por cada día de atraso en los tiempos de entrega del servicio mientras sea atribuible por responsabilidad del proveedor.',
  },
  {
    num: '9',
    titulo: 'GARANTÍAS:',
    texto:
      'Proveedor deberá otorgar en la cotización una garantía en caso de incumplir con lo solicitado en la EETT o con la calidad del servicio realizado.',
  },
  {
    num: '10',
    titulo: 'CERTILAP:',
    texto:
      'Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.',
  },
]

function buildBasesAdministrativas(): Paragraph[] {
  const paragraphs: Paragraph[] = []

  paragraphs.push(
    new Paragraph({
      children: [
        run('BASES ADMINISTRATIVAS', {
          bold: true,
          size: 24,
          color: COLORS.azulOscuro,
        }),
      ],
      spacing: { before: 300, after: 150 },
      alignment: AlignmentType.CENTER,
    }),
  )

  BASES_ADMINISTRATIVAS.forEach((base) => {
    paragraphs.push(
      new Paragraph({
        children: [
          run(`${base.num}. ${base.titulo} `, { bold: true }),
          run(base.texto),
        ],
        spacing: { after: 80 },
      }),
    )
  })

  return paragraphs
}

// ============================================================================
// FUNCIÓN PRINCIPAL DE EXPORTACIÓN
// ============================================================================

/**
 * Exporta una ETT al formato Word (.docx) corporativo AquaChile.
 * Devuelve un Blob listo para descargar.
 */
export async function exportETTToWord(ett: ETT): Promise<Blob> {
  try {
    const content: (Paragraph | Table)[] = []

    // 1. Encabezado AQUACHILE
    content.push(buildEncabezado())
    content.push(new Paragraph({ text: '', spacing: { after: 200 } }))

    // 2. Tabla de cabecera (7 filas editables)
    content.push(buildCabeceraTable(ett))
    content.push(new Paragraph({ text: '', spacing: { after: 200 } }))

    // 3. Consideraciones previas (fijo)
    buildConsideracionesPrevias().forEach((p) => content.push(p))

    // 4. Especificación del servicio (bloques flexibles)
    buildEspecificacionServicio(ett).forEach((el) => content.push(el))

    // 5. Bloque fijo final (suministros, equipos, aseo)
    buildBloqueFijoFinal().forEach((p) => content.push(p))

    // 6. Bases administrativas (fijo, 10 cláusulas)
    buildBasesAdministrativas().forEach((p) => content.push(p))

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
              size: { orientation: PageOrientation.PORTRAIT },
            },
          },
          children: content,
        },
      ],
    })

    const blob = await Packer.toBlob(doc)
    logger.info('ETT exportada a Word exitosamente', { id: ett.id })
    return blob
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Error exportando ETT a Word', new Error(message))
    throw new Error(`Error al exportar ETT: ${message}`)
  }
}

/**
 * Descarga el Blob generado como archivo Word.
 * Uso:
 *   const blob = await exportETTToWord(ett)
 *   downloadWord(blob, `ETT_${ett.cabecera.proyecto}.docx`)
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
