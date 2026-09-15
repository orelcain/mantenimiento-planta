import { ETIQUETA_FOTO, ETIQUETA_TIPO } from '@/config/bitacora'
import { autorVisible, tecnicosDelEvento, type EventoBitacora, type FotoEvento, type TurnoMantencion } from './bitacora.types'
import { minutosParadaDe, ordenarEventos, resumirBitacora } from './resumenBitacora'
import { etiquetaTurno, fechaTurnoLarga, formatoMinutos, horarioTurno } from './turnoMantencion'

/**
 * Convierte la bitácora en el cuerpo de un correo.
 *
 * Reglas que vienen de cómo pega Outlook, no de gusto:
 *  - TODO el estilo va en línea (`style=""`): Outlook de escritorio descarta
 *    las hojas de estilo y las clases al pegar.
 *  - Estructura con `<table>`: el motor de Word de Outlook clásico ignora flex
 *    y grid y apila todo.
 *  - Las imágenes llevan `width` y `height` como ATRIBUTOS: sin ellos Outlook
 *    clásico las pega a tamaño original (1920 px) y rompe el correo.
 *  - Por defecto las fotos van por URL (Outlook clásico las descarga al pegar).
 *    Las incrustadas en base64 las trunca; esa variante existe solo para el
 *    Outlook nuevo/web, vía `fuenteFoto`.
 */

export interface DatosCorreoBitacora {
  turno: TurnoMantencion
  eventos: readonly EventoBitacora[]
  tecnicos: readonly string[]
  planta: string
  /** Observación general del turno (opcional). */
  observacion?: string
  /** Permite reemplazar la URL de cada foto (p. ej. por un data URI). */
  fuenteFoto?: (foto: FotoEvento) => string
}

// 2 fotos por fila en 540 px: caben en la columna de vista previa y en cualquier cuerpo de correo.
const ANCHO_FOTO = 260
const C = {
  tinta: '#1F1F1F',
  sec: '#5F6368',
  linea: '#E3E3E3',
  parada: '#B3261E',
  ventana: '#1E7B34',
  pendFondo: '#FFF4E5',
  pendBorde: '#E8900C',
}
const FUENTE = "'Segoe UI', Calibri, Arial, sans-serif"

export function escaparHtml(texto: string | null | undefined): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const conSaltos = (t: string) => escaparHtml(t.trim()).replace(/\r?\n/g, '<br>')

function capitalizarPrimera(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function tituloCorreo(turno: TurnoMantencion): string {
  return `Bitácora de Mantención · ${etiquetaTurno(turno)} ${turno.fecha.split('-').reverse().join('-')}`
}

/** Horario del evento: "16:20 – 16:55" o "22:30" si sigue abierto. */
export function horarioEvento(e: Pick<EventoBitacora, 'horaInicio' | 'horaTermino'>): string {
  return e.horaTermino ? `${e.horaInicio} – ${e.horaTermino}` : e.horaInicio
}

/** "Falla · Detuvo la máquina 35 min" / "Ajuste · Sin detener: Colación HG". */
export function lineaImpacto(e: EventoBitacora): string {
  const partes = [ETIQUETA_TIPO[e.tipo]]
  if (e.impacto === 'con-parada') partes.push(`Detuvo la máquina ${formatoMinutos(minutosParadaDe(e))}`)
  if (e.impacto === 'en-ventana') partes.push(e.ventana?.trim() ? `Sin detener: ${e.ventana.trim()}` : 'Sin detener producción')
  return partes.join(' · ')
}

/**
 * "Técnicos: Danilo Cortes, Lucas Adrade" — solo si hubo participantes: con un
 * solo técnico ya lo dice «Registrado por» en la cabecera y sería ruido.
 */
export function lineaTecnicos(e: EventoBitacora): string {
  if (!e.participantes?.some((p) => p.trim())) return ''
  return `Técnicos: ${tecnicosDelEvento(e).join(', ')}`
}

function dimensionesFoto(f: FotoEvento): { w: number; h: number } {
  if (f.ancho && f.alto && f.ancho > 0) {
    const w = Math.min(ANCHO_FOTO, f.ancho)
    return { w, h: Math.round((f.alto * w) / f.ancho) }
  }
  return { w: ANCHO_FOTO, h: Math.round((ANCHO_FOTO * 3) / 4) }
}

function htmlFotos(fotos: readonly FotoEvento[], fuente: (f: FotoEvento) => string): string {
  if (!fotos.length) return ''
  // Antes y después juntos y en ese orden: es la comparación que se quiere ver.
  const orden = { antes: 0, despues: 1, foto: 2 } as const
  const lista = [...fotos].sort((a, b) => orden[a.etiqueta] - orden[b.etiqueta])
  const filas: string[] = []
  for (let i = 0; i < lista.length; i += 2) {
    const celdas = lista.slice(i, i + 2).map((f) => {
      const { w, h } = dimensionesFoto(f)
      return (
        `<td style="padding:8px 8px 0 0;vertical-align:top;">` +
        `<img src="${escaparHtml(fuente(f))}" width="${w}" height="${h}" alt="${escaparHtml(ETIQUETA_FOTO[f.etiqueta])}" ` +
        `style="display:block;width:${w}px;height:${h}px;border:0;border-radius:4px;">` +
        `<div style="font-family:${FUENTE};font-size:12px;color:${C.sec};padding-top:2px;">${escaparHtml(ETIQUETA_FOTO[f.etiqueta])}</div>` +
        `</td>`
      )
    })
    filas.push(`<tr>${celdas.join('')}</tr>`)
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${filas.join('')}</table>`
}

function htmlEvento(e: EventoBitacora, fuente: (f: FotoEvento) => string, separador: boolean): string {
  const colorImpacto = e.impacto === 'con-parada' ? C.parada : e.impacto === 'en-ventana' ? C.ventana : C.sec
  const titulo = [horarioEvento(e), e.equipo?.trim()].filter(Boolean).join(' · ')
  return (
    `<tr><td style="padding:12px 0;${separador ? `border-top:1px solid ${C.linea};` : ''}font-family:${FUENTE};">` +
    `<div style="font-size:15px;font-weight:600;color:${C.tinta};">${escaparHtml(titulo)}</div>` +
    `<div style="font-size:13px;color:${colorImpacto};padding-top:2px;">${escaparHtml(lineaImpacto(e))}</div>` +
    (lineaTecnicos(e) ? `<div style="font-size:13px;color:${C.sec};">${escaparHtml(lineaTecnicos(e))}</div>` : '') +
    (e.descripcion?.trim() ? `<div style="font-size:14px;color:${C.tinta};padding-top:4px;">${conSaltos(e.descripcion)}</div>` : '') +
    htmlFotos(e.fotos ?? [], fuente) +
    `</td></tr>`
  )
}

function htmlKpi(valor: string, etiqueta: string, color = C.tinta): string {
  return (
    `<td style="padding:8px 12px;border:1px solid ${C.linea};vertical-align:top;font-family:${FUENTE};">` +
    `<div style="font-size:18px;font-weight:600;color:${color};white-space:nowrap;">${escaparHtml(valor)}</div>` +
    `<div style="font-size:12px;color:${C.sec};">${escaparHtml(etiqueta)}</div></td>`
  )
}

export function bitacoraAHtmlCorreo({ turno, eventos, tecnicos, planta, observacion, fuenteFoto }: DatosCorreoBitacora): string {
  const fuente = fuenteFoto ?? ((f: FotoEvento) => f.url)
  const ordenados = ordenarEventos(turno, eventos)
  const r = resumirBitacora(eventos)
  const hechos = ordenados.filter((e) => !e.pendiente)
  const pendientes = ordenados.filter((e) => e.pendiente)
  const autores = [...new Set(eventos.map(autorVisible).filter(Boolean))]

  const kpis = [
    htmlKpi(String(r.eventos), r.eventos === 1 ? 'evento' : 'eventos'),
    htmlKpi(formatoMinutos(r.minutosParada), `de parada${r.conParada ? ` (${r.conParada})` : ''}`, r.minutosParada > 0 ? C.parada : C.tinta),
    htmlKpi(r.mttrMin == null ? '—' : formatoMinutos(r.mttrMin), 'MTTR'),
    htmlKpi(String(r.enVentana), 'sin detener producción', r.enVentana > 0 ? C.ventana : C.tinta),
    htmlKpi(String(r.pendientes), r.pendientes === 1 ? 'pendiente' : 'pendientes'),
  ].join('')

  const encabezado =
    `<div style="font-family:${FUENTE};font-size:20px;font-weight:600;color:${C.tinta};">Bitácora de Mantención · ${escaparHtml(etiquetaTurno(turno))}</div>` +
    `<div style="font-family:${FUENTE};font-size:13px;color:${C.sec};padding-top:2px;">` +
    `${escaparHtml(capitalizarPrimera(fechaTurnoLarga(turno)))} · ${escaparHtml(horarioTurno(turno).replace('–', 'a'))} · ${escaparHtml(planta)}</div>` +
    (tecnicos.length
      ? `<div style="font-family:${FUENTE};font-size:13px;color:${C.sec};">Técnicos de turno: ${escaparHtml(tecnicos.join(', '))}</div>`
      : '') +
    (autores.length
      ? `<div style="font-family:${FUENTE};font-size:13px;color:${C.sec};">Registrado por: ${escaparHtml(autores.join(', '))}</div>`
      : '')

  const tablaKpis =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:12px 0 4px;"><tr>${kpis}</tr></table>` +
    (observacion?.trim()
      ? `<div style="font-family:${FUENTE};font-size:14px;color:${C.tinta};padding:8px 0 4px;">` +
        `<span style="font-weight:600;">Observaciones del turno: </span>${conSaltos(observacion)}</div>`
      : '')

  const cuerpo = hechos.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:8px;">${hechos
        .map((e, i) => htmlEvento(e, fuente, i > 0))
        .join('')}</table>`
    : eventos.length
      ? ''
      : `<p style="font-family:${FUENTE};font-size:14px;color:${C.sec};">Sin eventos registrados en el turno.</p>`

  const bloquePendientes = pendientes.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:12px;">` +
      `<tr><td style="background:${C.pendFondo};border-left:3px solid ${C.pendBorde};padding:10px 12px;font-family:${FUENTE};">` +
      `<div style="font-size:15px;font-weight:600;color:${C.tinta};">Pendiente para el turno siguiente</div>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;">${pendientes
        .map((e, i) => htmlEvento(e, fuente, i > 0))
        .join('')}</table></td></tr></table>`
    : ''

  const pie = `<div style="font-family:${FUENTE};font-size:11px;color:${C.sec};padding-top:16px;">Generado con la app de Mantención.</div>`

  return `<div style="max-width:680px;color:${C.tinta};">${encabezado}${tablaKpis}${cuerpo}${bloquePendientes}${pie}</div>`
}

/** Versión en texto plano: va junto al HTML en el portapapeles, por si el destino no acepta HTML. */
export function bitacoraATextoPlano({ turno, eventos, tecnicos, planta, observacion }: DatosCorreoBitacora): string {
  const r = resumirBitacora(eventos)
  const ordenados = ordenarEventos(turno, eventos)
  const linea = (e: EventoBitacora) =>
    [
      `${horarioEvento(e)}${e.equipo?.trim() ? ` · ${e.equipo.trim()}` : ''}`,
      `  ${lineaImpacto(e)}`,
      lineaTecnicos(e) ? `  ${lineaTecnicos(e)}` : '',
      e.descripcion?.trim() ? `  ${e.descripcion.trim().replace(/\r?\n/g, '\n  ')}` : '',
      e.fotos?.length ? `  Fotos: ${e.fotos.length}` : '',
    ]
      .filter(Boolean)
      .join('\n')

  const hechos = ordenados.filter((e) => !e.pendiente)
  const pendientes = ordenados.filter((e) => e.pendiente)
  const cabecera = [
    `Bitácora de Mantención · ${etiquetaTurno(turno)}`,
    `${capitalizarPrimera(fechaTurnoLarga(turno))} · ${horarioTurno(turno).replace('–', 'a')} · ${planta}`,
    tecnicos.length ? `Técnicos de turno: ${tecnicos.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const resumen = `${r.eventos} eventos · ${formatoMinutos(r.minutosParada)} de parada · MTTR ${r.mttrMin == null ? '—' : formatoMinutos(r.mttrMin)} · ${r.enVentana} sin detener producción · ${r.pendientes} pendientes`
  // Bloques separados por una línea en blanco: pegado en un correo sin formato
  // cada evento se lee aparte.
  return [
    cabecera,
    resumen,
    ...(observacion?.trim() ? [`Observaciones del turno: ${observacion.trim()}`] : []),
    ...hechos.map(linea),
    ...(pendientes.length ? ['PENDIENTE PARA EL TURNO SIGUIENTE', ...pendientes.map(linea)] : []),
  ].join('\n\n')
}
