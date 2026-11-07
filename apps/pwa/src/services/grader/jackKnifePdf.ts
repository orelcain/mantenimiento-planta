/**
 * jackKnifePdf — Informe Jack-Knife de Mantención en PDF.
 *
 * Trae lo mismo que «Generar informe» en la tarjeta: resultado, causas que mejoraron
 * y empeoraron, prioridad 1, tabla por causa cada 10 turnos con veredicto, comentarios
 * clave y la regla. Un QR abre la vista con los mismos filtros (hash #jk=…, como /nuevos).
 *
 * Carga jsPDF, autotable, react-dom/server y qrcode.react dinámicamente. Sin animaciones
 * (solo Acrobat de escritorio las muestra). jsPDF helvetica no renderiza tildes ni flechas:
 * el texto se escribe en ASCII, igual que maintenanceImpactPdf.
 */

import { createElement } from 'react'
import type { InformeJK } from '@/services/shoplogix/jackKnife'
import { ETIQUETA_VEREDICTO } from '@/services/shoplogix/jackKnife'
import { dec, dec1 } from '@/utils/formatoNumeros'

interface AutoTableDoc {
  lastAutoTable: { finalY: number }
}

export interface OpcionesInformeJK {
  planta: string
  informe: InformeJK
  ahoraTxt: string
  antesTxt: string
  horasAhora: number
  horasAntes: number
  vistaTxt: string
  /** Enlace a la vista con los mismos filtros. */
  url: string
}

/** Sin tildes ni flechas: helvetica de jsPDF solo tiene WinAnsi. */
function ascii(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/→/g, '->')
    .replace(/−/g, '-')
}

const horas = (m: number) => (m < 60 ? `${dec(m, 0)} min` : `${dec1(m / 60)} h`)
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

/** QR del enlace como PNG: el SVG de qrcode.react se dibuja en un canvas de 480 px. */
async function qrPng(url: string): Promise<string> {
  const [{ renderToStaticMarkup }, { QRCodeSVG }] = await Promise.all([
    import('react-dom/server'),
    import('qrcode.react'),
  ])
  let svg = renderToStaticMarkup(createElement(QRCodeSVG, { value: url, size: 240, level: 'M', includeMargin: true }))
  if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = 480
  canvas.height = 480
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas no disponible')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 480, 480)
  ctx.drawImage(img, 0, 0, 480, 480)
  return canvas.toDataURL('image/png')
}

export async function exportarInformeJackKnifePDF(o: OpcionesInformeJK): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }, qr] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    qrPng(o.url),
  ])

  const i = o.informe
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true }) as InstanceType<typeof jsPDF> & AutoTableDoc
  const pageW = doc.internal.pageSize.getWidth()
  const M = 14
  const ancho = pageW - M * 2
  const LIMITE = 280
  let y = 16

  const salto = (alto: number) => {
    if (y + alto > LIMITE) {
      doc.addPage()
      y = 16
    }
  }
  const parrafo = (texto: string, tam = 9.5, estilo: 'normal' | 'bold' = 'normal', color = 0) => {
    doc.setFontSize(tam)
    doc.setFont('helvetica', estilo)
    doc.setTextColor(color)
    const lineas = doc.splitTextToSize(ascii(texto), ancho) as string[]
    const alto = lineas.length * (tam * 0.42) + 1.5
    salto(alto)
    doc.text(lineas, M, y + tam * 0.35)
    y += alto
  }
  const titulo = (texto: string) => {
    y += 2
    parrafo(texto, 11, 'bold')
    y += 0.5
  }

  // Encabezado
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(ascii(`Informe Jack-Knife de Mantencion · ${o.planta}`), pageW / 2, y, { align: 'center' })
  y += 7
  parrafo(
    `Ahora: ${o.ahoraTxt} (${i.nAhora} ${plural(i.nAhora, 'turno', 'turnos')}) · Antes: ${o.antesTxt} (${i.nAntes} ${plural(i.nAntes, 'turno', 'turnos')}) · ${o.vistaTxt}`,
    9,
    'normal',
    90,
  )
  parrafo(
    `Fuente: detenciones imputadas en Shoplogix, causas del balde Mantencion. Generado: ${new Date().toLocaleString('es-CL')}`,
    8,
    'normal',
    120,
  )
  y += 3

  // Resultado
  const signo = i.variacionPct <= 0 ? '-' : '+'
  const resultadoTxt = i.resultado === 'se_mantiene' ? 'se mantiene' : i.resultado === 'mejoro' ? 'mejoro' : 'empeoro'
  titulo('Resultado')
  parrafo(
    `La detencion atribuida a Mantencion paso de ${dec1(i.minTurnoAntes)} a ${dec1(i.minTurnoAhora)} min por turno (${signo}${dec(Math.abs(i.variacionPct), 0)} %): ${resultadoTxt}. En total, ${horas(o.horasAntes)} antes y ${horas(o.horasAhora)} ahora.`,
  )
  parrafo(`Mejoraron (${i.mejoraron.length}): ${i.mejoraron.join(', ') || 'ninguna'}.`)
  parrafo(`Empeoraron o aparecieron (${i.empeoraron.length}): ${i.empeoraron.join(', ') || 'ninguna'}.`)
  if (i.prioridad1.length > 0) {
    parrafo(`Prioridad 1 ahora: ${i.prioridad1.join(', ')}: se repiten mas que el promedio y tardan mas en repararse.`)
  }

  // Tabla por causa, cada 10 turnos
  titulo('Detalle por causa (por cada 10 turnos)')
  salto(20)
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Causa', 'Eventos antes', 'Eventos ahora', 'MTTR antes', 'MTTR ahora', 'Min. antes', 'Min. ahora', 'Resultado']],
    body: i.filas.map((f) => [
      ascii(f.causa),
      f.antes ? dec1(f.evAntes10) : '-',
      f.ahora ? dec1(f.evAhora10) : '-',
      f.antes ? `${dec1(f.antes.mttr)} min` : '-',
      f.ahora ? `${dec1(f.ahora.mttr)} min` : '-',
      dec(f.minAntes10, 0),
      dec(f.minAhora10, 0),
      ETIQUETA_VEREDICTO[f.veredicto],
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [60, 60, 67] },
  })
  y = doc.lastAutoTable.finalY + 4

  // Comentarios clave
  titulo('Que dicen los comentarios')
  if (i.comentariosClave.length === 0) {
    parrafo('Sin causas prioritarias ni empeoradas.')
  }
  for (const g of i.comentariosClave) {
    const txt = g.top.length
      ? g.top.map((t) => `"${t.texto}"${t.n > 1 ? ` x${t.n}` : ''}`).join(' | ')
      : 'sin comentarios en el periodo.'
    parrafo(`${g.causa}: ${txt}`)
  }

  // Regla
  titulo('Regla')
  parrafo(
    'Una causa mejora o empeora si sus minutos por turno cambian mas de 10 %. Las horas y los eventos se llevan a cada 10 turnos para comparar periodos de distinto largo.',
    8.5,
    'normal',
    90,
  )

  // QR a la vista con los mismos filtros
  y += 4
  salto(40)
  doc.addImage(qr, 'PNG', M, y, 34, 34)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0)
  doc.text('Abrir esta vista con los mismos filtros', M + 40, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(90)
  doc.text(doc.splitTextToSize(o.url, ancho - 40) as string[], M + 40, y + 12)
  doc.setTextColor(0)

  const planta = o.planta.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  doc.save(`jack-knife-mantencion_${planta}.pdf`)
}
