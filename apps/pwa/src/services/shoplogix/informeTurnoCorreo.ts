/**
 * Informe de turno para llevar al correo: lo arma la Cloud Function
 * `informeTurnoCorreo` (el mismo informe que va a Telegram) y acá se copia al
 * portapapeles con formato o se descarga el PDF para adjuntarlo.
 *
 * No hay envío de correo desde el servidor a propósito: quien lo pega lo manda
 * desde su propio Outlook, a quien quiera, sin credenciales guardadas.
 */

import { getFunctions, httpsCallable } from 'firebase/functions'

export interface InformeCorreo {
  asunto: string
  html: string
  pdfBase64: string
  nombreArchivo: string
  enCurso: boolean
}

type Respuesta = InformeCorreo | { motivo: string }

const MOTIVOS: Record<string, string> = {
  'sin-maquinas': 'el turno no tiene máquinas',
  'sin-produccion': 'el turno no alcanzó el mínimo de piezas',
}

export async function pedirInformeCorreo(plant: string, shiftDocId: string): Promise<InformeCorreo> {
  const fn = httpsCallable<{ plant: string; shiftDocId: string }, Respuesta>(
    getFunctions(undefined, 'us-central1'), 'informeTurnoCorreo',
  )
  const { data } = await fn({ plant, shiftDocId })
  if ('motivo' in data) throw new Error(`No hay informe: ${MOTIVOS[data.motivo] ?? data.motivo}.`)
  return data
}

/** El cuerpo sin `<title>`: algunos editores lo pegan como una línea de texto suelta. */
function cuerpoParaPegar(html: string): string {
  return html.replace(/<title>[\s\S]*?<\/title>/i, '')
}

function textoPlano(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.innerText
}

/**
 * Copia el correo con formato. Recibe la PROMESA del informe y no el informe:
 * Safari exige que `clipboard.write` se llame dentro del clic, antes de
 * cualquier `await`, y acepta un `ClipboardItem` que se resuelve después.
 */
export async function copiarCorreo(informe: Promise<InformeCorreo>): Promise<InformeCorreo> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const html = informe.then((r) => new Blob([cuerpoParaPegar(r.html)], { type: 'text/html' }))
    const texto = informe.then((r) => new Blob([textoPlano(r.html)], { type: 'text/plain' }))
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': html, 'text/plain': texto })])
    return informe
  }
  // Navegador sin portapapeles con formato: al menos el texto.
  const r = await informe
  await navigator.clipboard.writeText(textoPlano(r.html))
  return r
}

export function descargarPdf(r: InformeCorreo): void {
  const bytes = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = r.nombreArchivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
