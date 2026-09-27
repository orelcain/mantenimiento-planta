/**
 * HIG «Activity views»: exportar y compartir pasan por la hoja del sistema, no por
 * una descarga silenciosa. En el iPhone, «Exportar PDF» y «Bajar Excel MTTR»
 * terminaban en Descargas y había que ir a buscarlos para adjuntarlos a Outlook o
 * WhatsApp — la planilla MTTR es justo el entregable que prueba el aporte de
 * Mantención. En el PC, o si el navegador no admite compartir archivos, se cae a
 * la descarga de siempre.
 */

/** ¿El dispositivo puede compartir un archivo de este tipo con otras apps? */
export function puedeCompartirArchivo(tipo: string): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], 'archivo', { type: tipo })] })
    )
  } catch {
    return false
  }
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function compartirOBajarArchivo(blob: Blob, nombre: string, tipo: string): Promise<'compartido' | 'descargado' | 'cancelado'> {
  if (puedeCompartirArchivo(tipo)) {
    try {
      await navigator.share({ files: [new File([blob], nombre, { type: tipo })] })
      return 'compartido'
    } catch (e) {
      // AbortError: la persona cerró la hoja sin elegir nada — no es un error, ni se descarga solo.
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelado'
      // Cualquier otro fallo de compartir: mejor la descarga de siempre que dejarlo sin nada.
    }
  }
  descargar(blob, nombre)
  return 'descargado'
}
