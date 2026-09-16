import { ETIQUETA_FOTO } from '@/config/bitacora'
import { textoSeguroPdf } from '@/utils/pdf/textoSeguroPdf'
import { autorVisible, type EventoBitacora, type FotoEvento, type TurnoMantencion } from './bitacora.types'
import { etiquetaPendientes, lineaImpacto, lineaPendienteAnterior, lineaTecnicos } from './bitacoraCorreo'
import { encabezadoEvento, etiquetaTipo } from './presentacionEvento'
import { cargarFotoComoJpeg, type ImagenCargada } from './fotosBitacora'
import { fuePendiente, ordenarEventos, resumirBitacora } from './resumenBitacora'
import { soloListos } from './borradores'
import { etiquetaTurno, fechaTurnoLarga, formatoMinutos, horarioTurno } from './turnoMantencion'

/**
 * PDF de la bitácora: mismo contenido y mismo orden que el correo (resumen,
 * eventos, pendientes al final) para que las dos salidas digan lo mismo.
 *
 * Todo texto pasa por `textoSeguroPdf`: la fuente base de jsPDF es cp1252 y un
 * solo carácter fuera de ese juego (un "₃" de NH₃) deja el renglón en blanco.
 */

type RGB = [number, number, number]
const TINTA: RGB = [31, 31, 31]
const SEC: RGB = [95, 99, 104]
const LINEA: RGB = [227, 227, 227]
const PARADA: RGB = [179, 38, 30]
const VENTANA: RGB = [30, 123, 52]
const PEND_FONDO: RGB = [255, 244, 229]
const PEND_BORDE: RGB = [232, 144, 12]

export interface DatosPdfBitacora {
  turno: TurnoMantencion
  eventos: readonly EventoBitacora[]
  tecnicos: readonly string[]
  planta: string
  observacion?: string
  pendientesAnteriores?: readonly EventoBitacora[]
}

export async function generarPdfBitacora({ turno, eventos: todos, tecnicos, planta, observacion, pendientesAnteriores = [] }: DatosPdfBitacora): Promise<{ archivo: string; fotosFallidas: number }> {
  const eventos = soloListos(todos)
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  // NFKC antes del saneo: convierte subíndices y superíndices a dígitos
  // normales ("NH₃" → "NH3") en vez de que el saneo los descarte ("NH").
  const t = (v: unknown) => textoSeguroPdf(v == null ? '' : String(v).normalize('NFKC'))
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const M = 15
  const ANCHO = W - 2 * M
  let y = M

  // Fotos: se descargan todas antes de dibujar, en paralelo.
  const fotos = new Map<string, ImagenCargada | null>()
  let fotosFallidas = 0
  await Promise.all(
    eventos.flatMap((e) => e.fotos ?? []).map(async (f) => {
      try {
        fotos.set(f.url, await cargarFotoComoJpeg(f.url, 1000, 0.82))
      } catch {
        fotos.set(f.url, null)
        fotosFallidas++
      }
    }),
  )

  const color = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2])
  const saltoSiHaceFalta = (alto: number) => {
    if (y + alto > H - M) {
      pdf.addPage()
      y = M
    }
  }

  // ── Encabezado ──
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  color(TINTA)
  pdf.text(t(`Bitácora de Mantención · ${etiquetaTurno(turno)}`), M, y + 5)
  y += 11
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  color(SEC)
  const fecha = fechaTurnoLarga(turno)
  pdf.text(t(`${fecha.charAt(0).toUpperCase()}${fecha.slice(1)} ·${horarioTurno(turno).replace('–', 'a')} · ${planta}`), M, y)
  y += 5
  // Líneas que pueden ser largas (6 técnicos, equipos de nombre largo) se
  // envuelven: con pdf.text a secas se salían por el borde derecho (revisión 15-09).
  const envuelto = (texto: string, x: number, ancho: number, alto: number) => {
    for (const l of pdf.splitTextToSize(t(texto), ancho) as string[]) {
      saltoSiHaceFalta(alto)
      pdf.text(l, x, y)
      y += alto
    }
  }
  if (tecnicos.length) envuelto(`Técnicos de turno: ${tecnicos.join(', ')}`, M, ANCHO, 5)
  const autores = [...new Set(eventos.map(autorVisible).filter(Boolean))]
  if (autores.length) envuelto(`Registrado por: ${autores.join(', ')}`, M, ANCHO, 5)

  // ── Resumen ──
  const r = resumirBitacora(eventos)
  const kpis: Array<[string, string, RGB]> = [
    [String(r.eventos), r.eventos === 1 ? 'evento' : 'eventos', TINTA],
    [
      formatoMinutos(r.minutosParada),
      r.conParada ? `de parada (${r.conParada}${r.paradasSinDuracion ? `, ${r.paradasSinDuracion} s/dur.` : ''})` : 'de parada',
      r.conParada > 0 ? PARADA : TINTA,
    ],
    [r.mttrMin == null ? '-' : formatoMinutos(r.mttrMin), 'MTTR', TINTA],
    [String(r.enVentana), 'sin detener producción', r.enVentana > 0 ? VENTANA : TINTA],
    [String(r.pendientesDelTurno), etiquetaPendientes(r), TINTA],
    // Solo si hubo: es el número que demuestra la entrega de turno (y hasta
    // ahora salía en el correo pero no aquí — revisión 15-09).
    ...(r.pendientesCerrados > 0
      ? ([[String(r.pendientesCerrados), r.pendientesCerrados === 1 ? 'pendiente cerrado' : 'pendientes cerrados', VENTANA]] as Array<[string, string, RGB]>)
      : []),
  ]
  y += 2
  const anchoKpi = ANCHO / kpis.length
  pdf.setDrawColor(LINEA[0], LINEA[1], LINEA[2])
  kpis.forEach(([valor, etiqueta, c], i) => {
    const x = M + i * anchoKpi
    pdf.rect(x, y, anchoKpi, 15)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    color(c)
    pdf.text(t(valor), x + 3, y + 6.5)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    color(SEC)
    pdf.text(t(etiqueta), x + 3, y + 11.5)
  })
  y += 22

  // ── Observación general ──
  if (observacion?.trim()) {
    pdf.setFontSize(10)
    const lineas = pdf.splitTextToSize(t(`Observaciones del turno: ${observacion.trim()}`), ANCHO) as string[]
    color(TINTA)
    for (const l of lineas) {
      saltoSiHaceFalta(5)
      pdf.text(l, M, y)
      y += 4.6
    }
    y += 4
  }

  // ── Eventos ──
  const ANCHO_FOTO = (ANCHO - 6) / 2
  const dibujarEvento = (e: EventoBitacora, sangria: number) => {
    const x = M + sangria
    const ancho = ANCHO - sangria
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    const lineasDesc = e.descripcion?.trim() ? (pdf.splitTextToSize(t(e.descripcion.trim()), ancho) as string[]) : []
    saltoSiHaceFalta(12 + lineasDesc.length * 4.6)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    color(TINTA)
    y += 4
    envuelto(encabezadoEvento(e) || etiquetaTipo(e), x, ancho, 5)
    y += 0.5
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    color(e.impacto === 'con-parada' ? PARADA : e.impacto === 'en-ventana' ? VENTANA : SEC)
    envuelto(lineaImpacto(e), x, ancho, 4.6)
    y += 0.4
    if (lineaTecnicos(e)) {
      color(SEC)
      envuelto(lineaTecnicos(e), x, ancho, 4.4)
    }
    if (lineasDesc.length) {
      pdf.setFontSize(10)
      color(TINTA)
      for (const l of lineasDesc) {
        saltoSiHaceFalta(5)
        pdf.text(l, x, y)
        y += 4.6
      }
    }

    const orden = { antes: 0, despues: 1, foto: 2 } as const
    const lista = [...(e.fotos ?? [])].sort((a, b) => orden[a.etiqueta] - orden[b.etiqueta])
    const anchoFoto = sangria ? (ancho - 6) / 2 : ANCHO_FOTO
    for (let i = 0; i < lista.length; i += 2) {
      const par = lista.slice(i, i + 2)
      const altos = par.map((f: FotoEvento) => {
        const img = fotos.get(f.url)
        return img ? Math.min(70, (img.alto * anchoFoto) / img.ancho) : 12
      })
      const alto = Math.max(...altos)
      saltoSiHaceFalta(alto + 9)
      y += 2
      par.forEach((f, j) => {
        const img = fotos.get(f.url)
        const fx = x + j * (anchoFoto + 6)
        if (img) {
          // Se ajusta por el lado que manda para no deformar las fotos verticales.
          let w = anchoFoto
          let h = (img.alto * w) / img.ancho
          if (h > 70) {
            h = 70
            w = (img.ancho * h) / img.alto
          }
          pdf.addImage(img.dataUrl, 'JPEG', fx, y, w, h)
        } else {
          pdf.setFontSize(8)
          color(SEC)
          pdf.text(t('(foto no disponible)'), fx, y + 6)
        }
        pdf.setFontSize(8)
        color(SEC)
        pdf.text(t(ETIQUETA_FOTO[f.etiqueta]), fx, y + alto + 4)
      })
      y += alto + 6
    }
    y += 3
  }

  const ordenados = ordenarEventos(turno, eventos)
  const hechos = ordenados.filter((e) => !fuePendiente(e))
  const pendientes = ordenados.filter(fuePendiente)

  if (!eventos.length) {
    pdf.setFontSize(10)
    color(SEC)
    pdf.text(t('Sin eventos registrados en el turno.'), M, y)
  }

  hechos.forEach((e, i) => {
    if (i > 0) {
      saltoSiHaceFalta(20)
      pdf.setDrawColor(LINEA[0], LINEA[1], LINEA[2])
      pdf.line(M, y, W - M, y)
      y += 3
    }
    dibujarEvento(e, 0)
  })

  if (pendientes.length) {
    // Franja de título en vez de un recuadro: un recuadro que cruza de página
    // queda cortado; la franja siempre entra entera con su primer evento.
    saltoSiHaceFalta(40)
    y += 4
    pdf.setFillColor(PEND_FONDO[0], PEND_FONDO[1], PEND_FONDO[2])
    pdf.rect(M, y, ANCHO, 9, 'F')
    pdf.setFillColor(PEND_BORDE[0], PEND_BORDE[1], PEND_BORDE[2])
    pdf.rect(M, y, 1.2, 9, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    color(TINTA)
    pdf.text(t('Pendiente para el turno siguiente'), M + 4, y + 6.2)
    y += 12
    pendientes.forEach((e, i) => {
      if (i > 0) {
        saltoSiHaceFalta(20)
        pdf.setDrawColor(LINEA[0], LINEA[1], LINEA[2])
        pdf.line(M + 4, y, W - M, y)
        y += 3
      }
      dibujarEvento(e, 4)
    })
  }

  // ── Pendientes de turnos anteriores que siguen abiertos ──
  if (pendientesAnteriores.length) {
    saltoSiHaceFalta(30)
    y += 4
    pdf.setFillColor(PEND_FONDO[0], PEND_FONDO[1], PEND_FONDO[2])
    pdf.rect(M, y, ANCHO, 9, 'F')
    pdf.setFillColor(PEND_BORDE[0], PEND_BORDE[1], PEND_BORDE[2])
    pdf.rect(M, y, 1.2, 9, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    color(TINTA)
    pdf.text(t('Sigue pendiente de turnos anteriores'), M + 4, y + 6.2)
    y += 13
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    for (const e of pendientesAnteriores) {
      const lineas = pdf.splitTextToSize(t(`• ${lineaPendienteAnterior(e)}`), ANCHO - 4) as string[]
      for (const l of lineas) {
        saltoSiHaceFalta(5)
        pdf.text(l, M + 4, y)
        y += 4.6
      }
      y += 1.5
    }
  }

  // ── Pie con numeración ──
  const total = pdf.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    color(SEC)
    pdf.text(t(`Bitácora de Mantención · ${turno.fecha} · ${etiquetaTurno(turno)}`), M, H - 8)
    pdf.text(t(`Página ${p} de ${total}`), W - M, H - 8, { align: 'right' })
  }

  const archivo = `bitacora-${turno.fecha}-${turno.banda}.pdf`
  pdf.save(archivo)
  return { archivo, fotosFallidas }
}
