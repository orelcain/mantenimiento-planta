import { ETIQUETA_FOTO } from '@/config/bitacora'
import { textoSeguroPdf } from '@/utils/pdf/textoSeguroPdf'
import { tecnicosDelEvento, type EventoBitacora, type FotoEvento, type TurnoMantencion } from './bitacora.types'
import { etiquetaParada, etiquetaPendientes, lineaPendienteAnterior, partesImpacto, repuestosDistintos } from './bitacoraCorreo'
import { codigoEquipoDe, etiquetaTipo, horarioEvento, nombreRepuesto, normalizarRepuestos, tituloDe } from './presentacionEvento'
import { cargarFotoComoJpeg, type ImagenCargada } from './fotosBitacora'
import { gruposDelTurno, resumirBitacora } from './resumenBitacora'
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
const PEND_BORDE: RGB = [232, 144, 12]
const MARCA: RGB = [46, 117, 182]
const CITA_FONDO: RGB = [244, 245, 247]
const CITA_BARRA: RGB = [189, 193, 198]
const OK_FONDO: RGB = [230, 244, 234]
const CRIT_FONDO: RGB = [252, 232, 230]
const NEUTRO_FONDO: RGB = [241, 243, 244]
const BLANCO: RGB = [255, 255, 255]

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

  const relleno = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2])
  const trazo = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2])
  // Líneas que pueden ser largas (6 técnicos, equipos de nombre largo) se
  // envuelven: con pdf.text a secas se salían por el borde derecho (revisión 15-09).
  const envuelto = (texto: string, x: number, ancho: number, alto: number) => {
    for (const l of pdf.splitTextToSize(t(texto), ancho) as string[]) {
      saltoSiHaceFalta(alto)
      pdf.text(l, x, y)
      y += alto
    }
  }
  /** Título de sección («EVENTOS DEL TURNO 6») con una raya debajo. */
  const seccion = (titulo: string, cantidad: number | null, raya: RGB) => {
    saltoSiHaceFalta(30)
    y += 5
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    color(TINTA)
    const texto = t(titulo.toUpperCase())
    pdf.text(texto, M, y)
    if (cantidad != null) {
      color(SEC)
      pdf.text(String(cantidad), M + pdf.getTextWidth(texto) + 2, y)
    }
    y += 2
    trazo(raya)
    pdf.setLineWidth(0.5)
    pdf.line(M, y, W - M, y)
    pdf.setLineWidth(0.2)
    y += 2
  }

  // ── Encabezado (mockup aprobado 17-09-2026) ──
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  color(MARCA)
  pdf.text(t('BITÁCORA DE MANTENCIÓN'), M, y + 2)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  color(SEC)
  pdf.text(t(planta), W - M, y + 2, { align: 'right' })
  pdf.text(t(horarioTurno(turno).replace('–', 'a')), W - M, y + 6.5, { align: 'right' })
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  color(TINTA)
  const fecha = fechaTurnoLarga(turno)
  pdf.text(t(`${etiquetaTurno(turno)} · ${fecha.charAt(0).toUpperCase()}${fecha.slice(1)}`), M, y + 9)
  y += 12
  trazo(TINTA)
  pdf.setLineWidth(0.5)
  pdf.line(M, y, W - M, y)
  pdf.setLineWidth(0.2)
  y += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  color(SEC)
  if (tecnicos.length) envuelto(`Técnicos de turno: ${tecnicos.join(', ')}`, M, ANCHO, 4.6)

  // ── Resumen ── (cifra en tinta normal; el estado, en un punto junto al rótulo)
  const r = resumirBitacora(eventos)
  const repuestos = repuestosDistintos(eventos)
  const kpis: Array<[string, string, RGB | null]> = [
    [String(r.eventos), r.eventos === 1 ? 'evento' : 'eventos', null],
    [formatoMinutos(r.minutosParada), etiquetaParada(r), r.conParada > 0 ? PARADA : null],
    ...(r.mttrMin != null ? ([[formatoMinutos(r.mttrMin), 'MTTR', null]] as Array<[string, string, RGB | null]>) : []),
    [String(r.enVentana), 'sin detener producción', r.enVentana > 0 ? VENTANA : null],
    [String(r.pendientesDelTurno), etiquetaPendientes(r), r.pendientes > 0 ? PEND_BORDE : null],
    // Solo si hubo: es el número que demuestra la entrega de turno.
    ...(r.pendientesCerrados > 0
      ? ([[String(r.pendientesCerrados), r.pendientesCerrados === 1 ? 'pendiente cerrado' : 'pendientes cerrados', VENTANA]] as Array<
          [string, string, RGB | null]
        >)
      : []),
    ...(repuestos > 0 ? ([[String(repuestos), repuestos === 1 ? 'repuesto usado' : 'repuestos usados', null]] as Array<[string, string, RGB | null]>) : []),
  ]
  if (eventos.length) {
    y += 2
    const anchoKpi = ANCHO / kpis.length
    trazo(LINEA)
    kpis.forEach(([valor, etiqueta, punto], i) => {
      const x = M + i * anchoKpi
      pdf.rect(x, y, anchoKpi, 15)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)
      color(TINTA)
      pdf.text(t(valor), x + 3, y + 6.5)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.5)
      color(SEC)
      let xr = x + 3
      if (punto) {
        relleno(punto)
        pdf.circle(x + 3.8, y + 10.6, 0.8, 'F')
        xr += 2.6
      }
      const lineas = pdf.splitTextToSize(t(etiqueta), anchoKpi - (xr - x) - 2) as string[]
      pdf.text(lineas.slice(0, 2), xr, y + 11.5)
    })
    y += 19
  }

  /** Texto del técnico en un recuadro gris con barra (se dibuja por renglón: cruza de hoja sin romperse). */
  const cita = (texto: string, x: number, ancho: number) => {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    const lineas = pdf.splitTextToSize(t(texto.trim()), ancho - 7) as string[]
    y += 1.5
    lineas.forEach((l, i) => {
      saltoSiHaceFalta(5)
      const arriba = i === 0 ? 1.5 : 0
      const abajo = i === lineas.length - 1 ? 1.5 : 0
      relleno(CITA_FONDO)
      pdf.rect(x, y - 3.6 - arriba, ancho, 4.8 + arriba + abajo, 'F')
      relleno(CITA_BARRA)
      pdf.rect(x, y - 3.6 - arriba, 0.9, 4.8 + arriba + abajo, 'F')
      color(TINTA)
      pdf.text(l, x + 4, y)
      y += 4.8
    })
    y += 2
  }

  // ── Observación general ──
  if (observacion?.trim()) {
    seccion('Observaciones del turno', null, TINTA)
    y += 3
    cita(observacion, M, ANCHO)
  }

  // ── Eventos ──
  const SANGRIA = 9
  const ANCHO_FOTO = (ANCHO - SANGRIA - 6) / 2
  /** Etiquetas de impacto (parada en rojo, ventana y cierres en verde, lo demás gris). */
  const chips = (e: EventoBitacora, x: number, ancho: number) => {
    const partes = partesImpacto(e)
    if (!partes.length) return
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    let cx = x
    y += 1
    saltoSiHaceFalta(6)
    for (const p of partes) {
      const [fondo, tinta]: [RGB, RGB] = p.startsWith('Detuvo')
        ? [CRIT_FONDO, PARADA]
        : p.startsWith('Sin detener') || p.startsWith('Cierra pendiente') || p.startsWith('Resuelto')
          ? [OK_FONDO, VENTANA]
          : [NEUTRO_FONDO, SEC]
      const texto = t(p)
      const w = Math.min(pdf.getTextWidth(texto) + 4, ancho)
      if (cx + w > x + ancho && cx > x) {
        cx = x
        y += 5
        saltoSiHaceFalta(6)
      }
      relleno(fondo)
      pdf.roundedRect(cx, y - 3.2, w, 4.4, 2, 2, 'F')
      color(tinta)
      pdf.text(pdf.splitTextToSize(texto, w - 3)[0] as string, cx + 2, y)
      cx += w + 2
    }
    y += 5.5
  }
  /** Repuestos en tabla: código · nombre común + nombre SAP · cantidad. */
  const tablaRepuestos = (e: EventoBitacora, x: number, ancho: number) => {
    const lista = normalizarRepuestos(e.repuestos)
    if (!lista.length) return
    const cCodigo = 22
    const cCant = 12
    const cNombre = ancho - cCodigo - cCant
    saltoSiHaceFalta(12)
    y += 2
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    color(TINTA)
    pdf.text(t('Repuestos usados'), x, y)
    y += 4.2
    pdf.setFontSize(7.5)
    color(SEC)
    pdf.text(t('Código SAP'), x, y)
    pdf.text(t('Repuesto'), x + cCodigo, y)
    pdf.text(t('Cant.'), x + ancho, y, { align: 'right' })
    y += 1.3
    trazo(LINEA)
    pdf.line(x, y, x + ancho, y)
    y += 3.6
    for (const rp of lista) {
      const comun = (rp.nombreComun ?? '').trim()
      const sap = nombreRepuesto(rp)
      pdf.setFontSize(9)
      const lineas = pdf.splitTextToSize(t(comun && sap ? `${comun} · ${sap}` : comun || sap || '—'), cNombre - 2) as string[]
      saltoSiHaceFalta(lineas.length * 4 + 2)
      pdf.setFont('helvetica', 'normal')
      color(TINTA)
      pdf.text(t(rp.codigoSAP), x, y)
      pdf.text(String(rp.cantidad), x + ancho, y, { align: 'right' })
      lineas.forEach((l, i) => {
        // El nombre común en negrita (solo en el primer renglón, donde empieza).
        if (i === 0 && comun) {
          pdf.setFont('helvetica', 'bold')
          const soloComun = t(comun)
          const cabe = l.startsWith(soloComun)
          pdf.text(cabe ? soloComun : l, x + cCodigo, y)
          // El ancho se mide con la negrita puesta: medido en normal, el «·» se montaba.
          const anchoComun = pdf.getTextWidth(soloComun)
          pdf.setFont('helvetica', 'normal')
          if (cabe && l.length > soloComun.length) {
            color(SEC)
            pdf.text(l.slice(soloComun.length), x + cCodigo + anchoComun, y)
            color(TINTA)
          }
        } else {
          color(comun ? SEC : TINTA)
          pdf.text(l, x + cCodigo, y)
          color(TINTA)
        }
        if (i < lineas.length - 1) y += 4
      })
      y += 1.4
      trazo(LINEA)
      pdf.line(x, y, x + ancho, y)
      y += 3.8
    }
  }

  /**
   * Un evento (mockup aprobado 17-09-2026): número en círculo (el mismo del
   * mensaje de WhatsApp), equipo y hora en la misma línea, tipo · N° · técnicos,
   * etiquetas de impacto, texto del técnico en recuadro, repuestos y fotos.
   */
  const dibujarEvento = (e: EventoBitacora, numero: number, pendiente: boolean) => {
    const x = M + SANGRIA
    const ancho = ANCHO - SANGRIA
    const equipo = e.equipo?.trim() ?? ''
    const titulo = tituloDe(e)
    const principal = equipo || titulo || etiquetaTipo(e)
    const hora = horarioEvento(e)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    const lineasDesc = e.descripcion?.trim() ? (pdf.splitTextToSize(t(e.descripcion.trim()), ancho - 7) as string[]) : []
    // El título, lo de debajo y el texto del técnico van juntos en la misma hoja.
    saltoSiHaceFalta(22 + Math.min(lineasDesc.length, 8) * 4.8)

    y += 5
    // Número en círculo.
    relleno(pendiente ? PEND_BORDE : TINTA)
    pdf.circle(M + 3, y - 1.4, 3, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(numero > 9 ? 7.5 : 8.5)
    color(BLANCO)
    pdf.text(String(numero), M + 3, y - 0.2, { align: 'center' })
    // Hora a la derecha, en la misma línea del equipo.
    pdf.setFontSize(10)
    color(TINTA)
    const anchoHora = hora ? pdf.getTextWidth(t(hora)) + 4 : 0
    if (hora) pdf.text(t(hora), W - M, y, { align: 'right' })
    pdf.setFontSize(12)
    const lineasTitulo = pdf.splitTextToSize(t(principal), ancho - anchoHora) as string[]
    lineasTitulo.forEach((l, i) => {
      pdf.text(l, x, y)
      if (i < lineasTitulo.length - 1) y += 5
    })
    y += 4.8
    if (equipo && titulo) {
      pdf.setFontSize(10.5)
      envuelto(titulo, x, ancho, 4.6)
    }
    const cod = codigoEquipoDe(e)
    const tecnicosEvento = tecnicosDelEvento(e)
    const meta = [
      etiquetaTipo(e),
      cod ? `${/^\d+$/.test(cod) ? 'N° de equipo' : 'Ubicación técnica'} ${cod}` : '',
      tecnicosEvento.length ? `Técnicos: ${tecnicosEvento.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    color(SEC)
    envuelto(meta, x, ancho, 4.4)
    chips(e, x, ancho)
    if (lineasDesc.length) cita(e.descripcion ?? '', x, ancho)
    tablaRepuestos(e, x, ancho)

    const orden = { antes: 0, despues: 1, foto: 2 } as const
    const lista = [...(e.fotos ?? [])].sort((a, b) => orden[a.etiqueta] - orden[b.etiqueta])
    const anchoFoto = ANCHO_FOTO
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

  const { hechos, pendientes } = gruposDelTurno(turno, eventos)

  if (!eventos.length) {
    pdf.setFontSize(10)
    color(SEC)
    pdf.text(t('Sin eventos registrados en el turno.'), M, y)
  }

  const separador = () => {
    trazo(LINEA)
    pdf.line(M, y, W - M, y)
  }

  if (hechos.length) {
    seccion('Eventos del turno', hechos.length, TINTA)
    hechos.forEach((e, i) => {
      if (i > 0) separador()
      dibujarEvento(e, i + 1, false)
    })
  }

  if (pendientes.length) {
    seccion('Pendiente para el turno siguiente', pendientes.length, PEND_BORDE)
    pendientes.forEach((e, i) => {
      if (i > 0) separador()
      dibujarEvento(e, hechos.length + i + 1, true)
    })
  }

  // ── Pendientes de turnos anteriores que siguen abiertos ──
  if (pendientesAnteriores.length) {
    seccion('Sigue pendiente de turnos anteriores', pendientesAnteriores.length, PEND_BORDE)
    y += 3
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    for (const e of pendientesAnteriores) {
      const lineas = pdf.splitTextToSize(t(lineaPendienteAnterior(e)), ANCHO - 5) as string[]
      lineas.forEach((l, i) => {
        saltoSiHaceFalta(5)
        if (i === 0) {
          relleno(SEC)
          pdf.circle(M + 1.3, y - 1.3, 0.6, 'F')
        }
        color(TINTA)
        pdf.text(l, M + 5, y)
        y += 4.6
      })
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
    pdf.text(t(`Bitácora de Mantención · ${etiquetaTurno(turno)} ${turno.fecha.split('-').reverse().join('-')} · ${planta}`), M, H - 8)
    pdf.text(t(`Página ${p} de ${total}`), W - M, H - 8, { align: 'right' })
  }

  const archivo = `bitacora-${turno.fecha}-${turno.banda}.pdf`
  pdf.save(archivo)
  return { archivo, fotosFallidas }
}
