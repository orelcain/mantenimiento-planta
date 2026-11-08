export async function exportarLamina(elemento: HTMLDivElement, formato: 'pdf' | 'png', nombre: string) {
  const { default: html2canvas } = await import('html2canvas')
  await document.fonts.ready
  const canvas = await html2canvas(elemento, { backgroundColor: '#FFFFFF', scale: 1, width: 1600, height: 1131, windowWidth: 1600, windowHeight: 1131 })
  const imagen = canvas.toDataURL('image/png')
  if (formato === 'pdf') {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    pdf.addImage(imagen, 'PNG', 0, 0, 297, 210)
    pdf.save(nombre + '.pdf')
  } else {
    const enlace = document.createElement('a')
    enlace.download = nombre + '.png'
    enlace.href = imagen
    enlace.click()
  }
}
