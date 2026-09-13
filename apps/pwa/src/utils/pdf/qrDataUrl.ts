import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { QRCodeCanvas } from 'qrcode.react'

/**
 * Convierte una URL en un PNG (dataURL) para incrustar en un PDF.
 *
 * `qrcode.react` solo expone componentes de React, y jsPDF necesita una imagen. Se monta un
 * `QRCodeCanvas` en un contenedor fuera de pantalla, se lee el canvas y se desmonta: tres
 * líneas en un sitio, en vez de un canvas oculto colgando del árbol solo por si alguien
 * exporta.
 *
 * `flushSync` no es opcional: sin él React monta en el siguiente tick y el canvas todavía no
 * existe cuando se le pide el dataURL — devolvería un PNG en blanco.
 */
export function qrComoPng(url: string, tamano = 256): string | undefined {
  if (typeof document === 'undefined') return undefined
  const caja = document.createElement('div')
  caja.style.position = 'fixed'
  caja.style.left = '-9999px'
  caja.style.top = '0'
  document.body.appendChild(caja)
  const root = createRoot(caja)
  try {
    flushSync(() => {
      root.render(
        createElement(QRCodeCanvas, {
          value: url,
          size: tamano,
          level: 'M',
          // Fondo blanco explícito: el PDF es papel, no hereda el tema de la app.
          bgColor: '#FFFFFF',
          fgColor: '#000000',
        }),
      )
    })
    const canvas = caja.querySelector('canvas')
    return canvas ? canvas.toDataURL('image/png') : undefined
  } catch {
    // Un QR que no sale no puede impedir que se emita el expediente.
    return undefined
  } finally {
    root.unmount()
    caja.remove()
  }
}
