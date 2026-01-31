/**
 * Exportación de ETT a PDF
 * REPLICA EXACTA del formato AquaChile "ESPECIFICACIONES TECNICAS Y BASES"
 */

import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import type { ETT } from '@/types'
import { logger } from '@/lib/logger'

/**
 * Crea HTML con formato exacto de AquaChile
 */
function createETTHTML(ett: ETT): HTMLElement {
  const container = document.createElement('div')
  container.style.width = '210mm'
  container.style.padding = '15mm 20mm'
  container.style.fontFamily = 'Arial, Helvetica, sans-serif'
  container.style.fontSize = '10pt'
  container.style.backgroundColor = '#FFFFFF'
  container.style.color = '#000000'
  container.style.lineHeight = '1.4'

  const fechaStr = ett.general.fecha 
    ? new Date(ett.general.fecha).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  let html = `
    <!-- ENCABEZADO CORPORATIVO -->
    <div style="margin-bottom: 15px;">
      <div style="font-size: 18pt; font-weight: bold; color: #1F4E79;">AQUACHILE</div>
      <div style="text-align: center; font-size: 14pt; font-weight: bold; margin-top: 5px;">ESPECIFICACIONES TECNICAS Y BASES</div>
      <div style="text-align: center; font-size: 11pt;">Adquisiciones - Servicios</div>
    </div>

    <!-- TABLA DE INFORMACIÓN PRINCIPAL -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10pt;">
      <tr>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px; background-color: #F2F2F2; font-weight: bold; width: 30%;">FECHA REQUERIMIENTO</td>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px;">${fechaStr}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px; background-color: #F2F2F2; font-weight: bold;">PROYECTO O SERVICIO</td>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px;">${ett.general.titulo}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px; background-color: #F2F2F2; font-weight: bold;">USUARIO SOLICITANTE</td>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px;">${ett.general.solicitante}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px; background-color: #F2F2F2; font-weight: bold;">SECTOR DE REALIZACIÓN</td>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px;">${ett.general.area || 'Planta de Procesos'}</td>
      </tr>
      <tr>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px; background-color: #F2F2F2; font-weight: bold;">FECHA INICIO DEL SERVICIO</td>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px;"></td>
      </tr>
      <tr>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px; background-color: #F2F2F2; font-weight: bold;">FECHA TÉRMINO DEL SERVICIO</td>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px;"></td>
      </tr>
      <tr>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px; background-color: #F2F2F2; font-weight: bold;">GARANTÍA EXIGIDA</td>
        <td style="border: 1px solid #5B9BD5; padding: 6px 10px;">06 (meses) Garantía Temporada Alta</td>
      </tr>
    </table>

    <!-- 1. CONSIDERACIONES PREVIAS -->
    <div style="margin-bottom: 15px;">
      <h2 style="color: #1F4E79; font-size: 12pt; margin-bottom: 10px;">1. CONSIDERACIONES PREVIAS:</h2>
      <p style="margin: 5px 0; padding-left: 15px;">
        <span style="color: #FF0000; font-weight: bold;">➤ Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.</span>
      </p>
      <p style="margin: 5px 0; padding-left: 15px;">➤ La fecha estimada para el inicio del servicio queda sujeta a la planificación de gerencia, por lo que se podría extender su fecha de realización.</p>
      <p style="margin: 5px 0; padding-left: 15px;">➤ Trabajo se realizará de acuerdo con la planificación de planta y áreas que involucren servicios, además se debe considerar trabajar sin restricción de día ni horario.</p>
      <p style="margin: 5px 0; padding-left: 15px;">➤ Cotización debe ser abierta con la descripción de los materiales a utilizar, mano de obra, gastos generales y utilidad.</p>
      <p style="margin: 5px 0; padding-left: 15px;">➤ Se debe indicar en cotización la cantidad de días requeridos, para realizar el servicio.</p>
      <p style="margin: 5px 0; padding-left: 15px;">➤ Se considerará la realización de visita en terreno, para revisar condiciones de trabajo y cantidad de materiales a utilizar, a la hora de definir una propuesta.</p>
    </div>

    <!-- ESPECIFICACIÓN DEL SERVICIO -->
    <div style="margin-bottom: 15px;">
      <h2 style="color: #1F4E79; font-size: 12pt; margin-bottom: 10px;">ESPECIFICACIÓN SERVICIO:</h2>
      <p style="font-weight: bold; margin-bottom: 5px;">Área de intervención:</p>
      ${ett.general.descripcion_general ? `<p style="margin-bottom: 10px;">${ett.general.descripcion_general}</p>` : ''}
      ${ett.trabajo_descripcion ? `<p style="margin-bottom: 15px; white-space: pre-wrap;">${ett.trabajo_descripcion}</p>` : ''}
    </div>
  `

  // MATERIALES Y EQUIPOS
  if (ett.materiales && ett.materiales.length > 0) {
    html += `
      <div style="margin-bottom: 15px;">
        <h2 style="color: #1F4E79; font-size: 12pt; margin-bottom: 10px;">3. MATERIALES Y EQUIPOS REQUERIDOS</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
          <thead>
            <tr>
              <th style="border: 1px solid #5B9BD5; padding: 6px; background-color: #1F4E79; color: white; text-align: left; width: 40%;">Material</th>
              <th style="border: 1px solid #5B9BD5; padding: 6px; background-color: #1F4E79; color: white; text-align: center; width: 15%;">Cantidad</th>
              <th style="border: 1px solid #5B9BD5; padding: 6px; background-color: #1F4E79; color: white; text-align: left; width: 45%;">Especificaciones</th>
            </tr>
          </thead>
          <tbody>
            ${ett.materiales.map(mat => `
              <tr>
                <td style="border: 1px solid #5B9BD5; padding: 5px;">${mat.nombre}</td>
                <td style="border: 1px solid #5B9BD5; padding: 5px; text-align: center;">${mat.cantidad} ${mat.unidad}</td>
                <td style="border: 1px solid #5B9BD5; padding: 5px;">${mat.especificaciones || ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  // PROCEDIMIENTOS
  if (ett.procedimientos && ett.procedimientos.length > 0) {
    html += `
      <div style="margin-bottom: 15px;">
        <h2 style="color: #1F4E79; font-size: 12pt; margin-bottom: 10px;">4. PROCEDIMIENTOS</h2>
        ${ett.procedimientos
          .sort((a, b) => a.numero - b.numero)
          .map(proc => `
            <div style="margin-bottom: 10px;">
              <p style="font-weight: bold; margin-bottom: 3px;">Paso ${proc.numero}: ${proc.titulo}</p>
              <p style="margin-bottom: 3px;">${proc.descripcion}</p>
              ${proc.precauciones ? `<p style="font-size: 9pt; font-style: italic;">⚠️ Precauciones: ${proc.precauciones}</p>` : ''}
            </div>
          `).join('')}
      </div>
    `
  }

  // ANÁLISIS DE RIESGOS
  if (ett.riesgos && ett.riesgos.length > 0) {
    html += `
      <div style="margin-bottom: 15px;">
        <h2 style="color: #1F4E79; font-size: 12pt; margin-bottom: 10px;">5. ANÁLISIS DE RIESGOS</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
          <thead>
            <tr>
              <th style="border: 1px solid #5B9BD5; padding: 6px; background-color: #1F4E79; color: white; text-align: left; width: 35%;">Peligro</th>
              <th style="border: 1px solid #5B9BD5; padding: 6px; background-color: #1F4E79; color: white; text-align: center; width: 15%;">Probabilidad</th>
              <th style="border: 1px solid #5B9BD5; padding: 6px; background-color: #1F4E79; color: white; text-align: left; width: 50%;">Medidas Preventivas</th>
            </tr>
          </thead>
          <tbody>
            ${ett.riesgos.map(riesgo => `
              <tr>
                <td style="border: 1px solid #5B9BD5; padding: 5px;">${riesgo.peligro}</td>
                <td style="border: 1px solid #5B9BD5; padding: 5px; text-align: center;">${riesgo.probabilidad}</td>
                <td style="border: 1px solid #5B9BD5; padding: 5px;">${riesgo.medidas_preventivas}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  // OBSERVACIONES
  if (ett.general.observaciones) {
    html += `
      <div style="margin-bottom: 15px;">
        <h2 style="color: #1F4E79; font-size: 12pt; margin-bottom: 10px;">OBSERVACIONES</h2>
        <p style="white-space: pre-wrap;">${ett.general.observaciones}</p>
      </div>
    `
  }

  // BASES ADMINISTRATIVAS
  html += `
    <div style="margin-top: 20px; page-break-before: auto;">
      <h2 style="color: #1F4E79; font-size: 12pt; margin-bottom: 10px;">BASES ADMINISTRATIVAS</h2>
      
      <p style="margin-bottom: 8px;"><strong>1. OFERTAS:</strong> Las ofertas deberán indicar por separado y en desglose los ítems de Materiales y Mano de Obra. Los Gastos Generales y Utilidades, deberán estar indicados aparte con sus respectivos montos y porcentajes. Además, se debe indicar un plazo estimado de ejecución del servicio.</p>
      
      <p style="margin-bottom: 8px;"><strong>2. SUPERVISIÓN E INSPECCIÓN TÉCNICA:</strong> La ejecución del servicio, coordinación, gestión y supervisión estará a cargo del área Mandante.</p>
      
      <p style="margin-bottom: 8px;"><strong>3. REGLAMENTO INTERNO Y SEGURIDAD:</strong> Será de responsabilidad del oferente considerar en su propuesta los insumos y EPP para la correcta ejecución de los trabajos. Asimismo, ejecutar sus trabajos según las normas de calidad y buenas prácticas vigentes de la compañía.</p>
      
      <p style="margin-bottom: 8px;"><strong>4. PROTOCOLOS COVID:</strong> Al momento de hacer visita técnica y/o ejecución del servicio, se exige presentarse con examen PCR o test de antígeno negativo, con un máximo de 72 horas.</p>
      
      <p style="margin-bottom: 8px;"><strong>6. FACTURACIÓN:</strong> Para servicios, la factura debe ser emitida una vez que adquisiciones haya enviado el número de OC y el mandante haya enviado el número de HES.</p>
      
      <p style="margin-bottom: 8px;"><strong>7. CONDICIONES DE PAGO:</strong> Pago a 30 días desde emisión de factura.</p>
      
      <p style="margin-bottom: 8px;"><strong>8. PENALIZACIÓN:</strong> Se aplicará una multa equivalente al 0,5% sobre el valor neto del presupuesto adjudicado por cada día de atraso.</p>
      
      <p style="margin-bottom: 8px;"><strong>9. GARANTÍAS:</strong> Proveedor deberá otorgar en la cotización una garantía en caso de incumplir con lo solicitado en la EETT.</p>
      
      <p style="margin-bottom: 8px;"><strong>10. CERTILAP:</strong> Personal en faena debe estar correctamente habilitado en plataforma de contratistas Ksec, requisito excluyente.</p>
    </div>
  `

  container.innerHTML = html
  return container
}

/**
 * Exporta ETT a PDF
 */
export async function exportETTToPDF(ett: ETT): Promise<Blob> {
  try {
    const htmlElement = createETTHTML(ett)
    
    // Agregar al DOM temporalmente (oculto)
    htmlElement.style.position = 'absolute'
    htmlElement.style.left = '-9999px'
    htmlElement.style.top = '0'
    document.body.appendChild(htmlElement)

    const canvas = await html2canvas(htmlElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#FFFFFF',
      windowWidth: 794, // A4 width in px at 96dpi
    })

    document.body.removeChild(htmlElement)

    const pdf = new jsPDF('p', 'mm', 'a4')
    const imgData = canvas.toDataURL('image/png')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()

    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    
    let heightLeft = imgHeight
    let position = 0

    // Primera página
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight

    // Páginas adicionales si es necesario
    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
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
