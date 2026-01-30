/**
 * Exportación de ETT a PDF
 * Utiliza html2canvas + jsPDF para generar documentos profesionales
 */

import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import type { ETT } from '@/types'
import { logger } from '@/lib/logger'

/**
 * Crea HTML temporal para renderizar a PDF
 */
function createETTHTML(ett: ETT): HTMLElement {
  const container = document.createElement('div')
  container.style.width = '210mm'
  container.style.padding = '20mm'
  container.style.fontFamily = 'Arial, sans-serif'
  container.style.fontSize = '11px'
  container.style.backgroundColor = '#FFFFFF'
  container.style.color = '#1F4788'

  let html = `
    <h1 style="color: #1F4788; margin-bottom: 20px;">ESPECIFICACIÓN TÉCNICA DEL TRABAJO</h1>
    
    <div style="margin-bottom: 20px; padding: 10px; border: 1px solid #4472C4; background-color: #D9E8F5;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="font-weight: bold; width: 30%; padding: 5px;">Título:</td>
          <td style="padding: 5px;">${ett.general.titulo}</td>
          <td style="font-weight: bold; width: 30%; padding: 5px;">Fecha:</td>
          <td style="padding: 5px;">${new Date(ett.general.fecha).toLocaleDateString('es-ES')}</td>
        </tr>
        <tr>
          <td style="font-weight: bold; padding: 5px;">Solicitante:</td>
          <td style="padding: 5px;">${ett.general.solicitante}</td>
          <td style="font-weight: bold; padding: 5px;">Responsable:</td>
          <td style="padding: 5px;">${ett.general.responsable}</td>
        </tr>
        ${
          ett.general.descripcion_general
            ? `<tr><td colspan="4" style="font-weight: bold; padding: 5px;">Descripción General:</td></tr>
             <tr><td colspan="4" style="padding: 5px;">${ett.general.descripcion_general}</td></tr>`
            : ''
        }
      </table>
    </div>
  `

  // Trabajo
  if (ett.trabajo_descripcion) {
    html += `
      <div style="margin-bottom: 20px;">
        <h2 style="color: #1F4788; border-bottom: 2px solid #4472C4; padding-bottom: 5px;">1. DESCRIPCIÓN DEL TRABAJO</h2>
        <p style="white-space: pre-wrap; background-color: #D9E8F5; padding: 10px; margin-top: 10px;">${ett.trabajo_descripcion}</p>
      </div>
    `
  }

  // Materiales
  if (ett.materiales && ett.materiales.length > 0) {
    html += `
      <div style="margin-bottom: 20px;">
        <h2 style="color: #1F4788; border-bottom: 2px solid #4472C4; padding-bottom: 5px;">2. MATERIALES Y EQUIPOS</h2>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background-color: #1F4788; color: white;">
              <th style="border: 1px solid #4472C4; padding: 5px; text-align: left;">Material</th>
              <th style="border: 1px solid #4472C4; padding: 5px; text-align: center;">Cantidad</th>
              <th style="border: 1px solid #4472C4; padding: 5px; text-align: left;">Especificaciones</th>
            </tr>
          </thead>
          <tbody>
            ${ett.materiales
              .map(
                m => `
              <tr>
                <td style="border: 1px solid #4472C4; padding: 5px;"><strong>${m.nombre}</strong></td>
                <td style="border: 1px solid #4472C4; padding: 5px; text-align: center;">${m.cantidad} ${m.unidad}</td>
                <td style="border: 1px solid #4472C4; padding: 5px;">${m.especificaciones || ''}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
  }

  // Procedimientos
  if (ett.procedimientos && ett.procedimientos.length > 0) {
    html += `
      <div style="margin-bottom: 20px;">
        <h2 style="color: #1F4788; border-bottom: 2px solid #4472C4; padding-bottom: 5px;">3. PROCEDIMIENTOS</h2>
        ${ett.procedimientos
          .sort((a, b) => a.numero - b.numero)
          .map(
            p => `
          <div style="margin-top: 10px; padding: 10px; background-color: #D9E8F5; border-left: 3px solid #4472C4;">
            <p style="font-weight: bold; margin: 0 0 5px 0;">Paso ${p.numero}: ${p.titulo}</p>
            <p style="margin: 0 0 5px 0;">${p.descripcion || ''}</p>
            ${p.tiempo_estimado ? `<p style="margin: 0; font-size: 9px;">⏱️ Tiempo: ${p.tiempo_estimado}</p>` : ''}
            ${p.precauciones ? `<p style="margin-top: 5px; padding: 5px; background-color: #FFF3CD; font-size: 9px;"><strong>⚠️ Precauciones:</strong> ${p.precauciones}</p>` : ''}
          </div>
        `
          )
          .join('')}
      </div>
    `
  }

  // Riesgos
  if (ett.riesgos && ett.riesgos.length > 0) {
    html += `
      <div style="margin-bottom: 20px;">
        <h2 style="color: #1F4788; border-bottom: 2px solid #4472C4; padding-bottom: 5px;">4. ANÁLISIS DE RIESGOS</h2>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background-color: #1F4788; color: white;">
              <th style="border: 1px solid #4472C4; padding: 5px; text-align: left;">Peligro</th>
              <th style="border: 1px solid #4472C4; padding: 5px; text-align: center;">Probabilidad</th>
              <th style="border: 1px solid #4472C4; padding: 5px; text-align: left;">Medidas Preventivas</th>
            </tr>
          </thead>
          <tbody>
            ${ett.riesgos
              .map(
                r => `
              <tr>
                <td style="border: 1px solid #4472C4; padding: 5px; background-color: #FFF3F3;"><strong>${r.peligro}</strong></td>
                <td style="border: 1px solid #4472C4; padding: 5px; text-align: center;">${r.probabilidad}</td>
                <td style="border: 1px solid #4472C4; padding: 5px;">${r.medidas_preventivas}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
  }

  // Observaciones
  if (ett.general.observaciones) {
    html += `
      <div style="margin-top: 20px; padding-top: 10px; border-top: 2px solid #4472C4;">
        <p style="font-weight: bold; margin: 0 0 10px 0;">OBSERVACIONES:</p>
        <p style="white-space: pre-wrap; margin: 0;">${ett.general.observaciones}</p>
      </div>
    `
  }

  container.innerHTML = html
  return container
}

/**
 * Exporta ETT a PDF
 */
export async function exportETTToPDF(ett: ETT): Promise<Blob> {
  try {
    const htmlElement = createETTHTML(ett)
    document.body.appendChild(htmlElement)

    const canvas = await html2canvas(htmlElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#FFFFFF',
    })

    document.body.removeChild(htmlElement)

    const pdf = new jsPDF('p', 'mm', 'a4')
    const imgData = canvas.toDataURL('image/png')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()

    const imgHeight = (canvas.height * pageWidth) / canvas.width
    let position = 0

    while (position < imgHeight) {
      if (position > 0) {
        pdf.addPage()
      }

      pdf.addImage(imgData, 'PNG', 0, -position, pageWidth, imgHeight)
      position += pageHeight
    }

    return pdf.output('blob')
  } catch (error) {
    logger.error('Error exporting to PDF', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Descarga el PDF
 */
export function downloadPDF(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
