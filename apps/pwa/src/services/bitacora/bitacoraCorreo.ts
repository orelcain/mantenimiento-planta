import { ETIQUETA_FOTO } from '@/config/bitacora'
import { autorVisible, tecnicosDelEvento, type EventoBitacora, type FotoEvento, type TurnoMantencion } from './bitacora.types'
import { fuePendiente, gruposDelTurno, minutosParadaDe, ordenarEventos, resumirBitacora } from './resumenBitacora'
import { filasRecoleccion, htmlRecoleccionMttr, textoRecoleccionMttr } from './recoleccionMttr'
import { explicacionMtbfMttr } from './mtbf'
import { soloListos } from './borradores'
import { etiquetaTurno, fechaTurnoLarga, formatoMinutos, horarioTurno } from './turnoMantencion'
import { etiquetaCortaTurno } from './entregaTurno'
import {
  codigoEquipoDe,
  encabezadoEvento,
  etiquetaTipo,
  horarioEvento,
  lineasRepuestos,
  nombreRepuesto,
  normalizarRepuestos,
  tituloDe,
} from './presentacionEvento'

// Se reexporta: el PDF y las pruebas lo importan desde aquí.
export { horarioEvento }

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
  /** Pendientes de turnos anteriores que siguen abiertos (entrega de turno). */
  pendientesAnteriores?: readonly EventoBitacora[]
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
  /** Afectó sin detener: ni el rojo de la parada ni el verde del «sin costo». */
  afectado: '#8A5A00',
  pendFondo: '#FFF4E5',
  pendBorde: '#E8900C',
  marca: '#2E75B6',
  citaFondo: '#F4F5F7',
  citaBarra: '#BDC1C6',
  okFondo: '#E6F4EA',
  critFondo: '#FCE8E6',
  neutroFondo: '#F1F3F4',
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

export function capitalizarPrimera(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function tituloCorreo(turno: TurnoMantencion): string {
  return `Bitácora de Mantención · ${etiquetaTurno(turno)} ${turno.fecha.split('-').reverse().join('-')}`
}

/**
 * Lo que el evento le costó (o no) a producción y su historia de pendiente:
 * "Detuvo la máquina 35 min", "Sin detener: Colación HG", "Cierra pendiente del…".
 */
export function partesImpacto(e: EventoBitacora): string[] {
  const partes: string[] = []
  if (e.impacto === 'con-parada') partes.push(`Detuvo la máquina ${formatoMinutos(minutosParadaDe(e))}`)
  if (e.impacto === 'afecta-sin-detener') {
    partes.push(e.contingencia?.trim() ? `Afectó sin detener: ${e.contingencia.trim()}` : 'Afectó sin detener')
  }
  if (e.impacto === 'en-ventana') partes.push(e.ventana?.trim() ? `Sin detener: ${e.ventana.trim()}` : 'Sin detener producción')
  if (e.resuelvePendiente?.turnoId) partes.push(`Cierra pendiente del ${etiquetaCortaTurno(e.resuelvePendiente.turnoId)}`)
  // Un pendiente que otro turno ya cerró: sin esto, al reexportar una bitácora
  // vieja el evento aparecía como pendiente eterno (revisión 15-09).
  if (e.cierre) {
    partes.push(
      e.cierre.tipo === 'no-aplica'
        ? `Ya no aplica desde ${etiquetaCortaTurno(e.cierre.turnoId)}${e.cierre.motivo ? `: ${e.cierre.motivo}` : ''}`
        : `Resuelto en ${etiquetaCortaTurno(e.cierre.turnoId)}${e.cierre.porNombre ? ` por ${e.cierre.porNombre}` : ''}`,
    )
  }
  return partes
}

/** "Falla · Detuvo la máquina 35 min" / "Ajuste · Sin detener: Colación HG". */
export function lineaImpacto(e: EventoBitacora): string {
  return [etiquetaTipo(e), ...partesImpacto(e)].join(' · ')
}

/**
 * "Técnicos: Danilo Cortes, Lucas Adrade" — solo si hubo participantes: con un
 * solo técnico ya lo dice «Registrado por» en la cabecera y sería ruido.
 */
export function lineaTecnicos(e: EventoBitacora): string {
  if (!e.participantes?.some((p) => p.trim())) return ''
  return `Técnicos: ${tecnicosDelEvento(e).join(', ')}`
}

/**
 * Alto proporcional para reservar el espacio en el correo. Si la foto no trae
 * dimensiones (hoy no pasa: no se sube una foto que el navegador no pudo medir)
 * se manda SIN alto: inventar un 4:3 estiraba una foto vertical, que es la que
 * más sale de un celular.
 */
function dimensionesFoto(f: FotoEvento): { w: number; h: number | null } {
  if (f.ancho && f.alto && f.ancho > 0) {
    const w = Math.min(ANCHO_FOTO, f.ancho)
    return { w, h: Math.round((f.alto * w) / f.ancho) }
  }
  return { w: ANCHO_FOTO, h: null }
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
        `<img src="${escaparHtml(fuente(f))}" width="${w}"${h == null ? '' : ` height="${h}"`} alt="${escaparHtml(ETIQUETA_FOTO[f.etiqueta])}" ` +
        `style="display:block;width:${w}px;${h == null ? '' : `height:${h}px;`}border:0;border-radius:4px;">` +
        `<div style="font-family:${FUENTE};font-size:12px;color:${C.sec};padding-top:2px;">${escaparHtml(ETIQUETA_FOTO[f.etiqueta])}</div>` +
        `</td>`
      )
    })
    filas.push(`<tr>${celdas.join('')}</tr>`)
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${filas.join('')}</table>`
}

/** Una etiqueta de color por cada parte del impacto (parada, ventana, pendiente). */
function htmlChips(e: EventoBitacora): string {
  const partes = partesImpacto(e)
  if (!partes.length) return ''
  const estilo = (texto: string) => {
    if (texto.startsWith('Detuvo')) return [C.critFondo, C.parada]
    if (texto.startsWith('Sin detener') || texto.startsWith('Cierra pendiente') || texto.startsWith('Resuelto')) return [C.okFondo, C.ventana]
    return [C.neutroFondo, C.sec]
  }
  return (
    `<div style="padding-top:5px;">` +
    partes
      .map((t) => {
        const [fondo, tinta] = estilo(t)
        return `<span style="display:inline-block;background:${fondo};color:${tinta};font-size:12px;font-weight:600;border-radius:10px;padding:1px 8px;margin:0 4px 2px 0;">${escaparHtml(t)}</span>`
      })
      .join('') +
    `</div>`
  )
}

/** Repuestos como tabla chica: código · nombre común + nombre SAP · cantidad. */
function htmlRepuestos(e: EventoBitacora): string {
  const lista = normalizarRepuestos(e.repuestos)
  if (!lista.length) return ''
  // Anchos fijos en código y cantidad: sin ellos Outlook repartía la tabla por igual.
  const th = (t: string, alinear = 'left', ancho = '') =>
    `<th${ancho ? ` width="${ancho}"` : ''} style="${ancho ? `width:${ancho}px;` : ''}text-align:${alinear};white-space:nowrap;font-weight:600;color:${C.sec};font-size:11.5px;padding:3px 6px;border-bottom:1px solid ${C.linea};">${t}</th>`
  const filas = lista
    .map((r) => {
      const comun = (r.nombreComun ?? '').trim()
      const sap = nombreRepuesto(r)
      const nombre = comun
        ? `<b>${escaparHtml(comun)}</b>${sap ? `<br><span style="color:${C.sec};">${escaparHtml(sap)}</span>` : ''}`
        : escaparHtml(sap)
      return (
        `<tr><td style="padding:4px 6px;border-bottom:1px solid ${C.linea};white-space:nowrap;vertical-align:top;">${escaparHtml(r.codigoSAP)}</td>` +
        `<td style="padding:4px 6px;border-bottom:1px solid ${C.linea};vertical-align:top;">${nombre}</td>` +
        `<td style="padding:4px 6px;border-bottom:1px solid ${C.linea};text-align:right;vertical-align:top;">${r.cantidad}</td></tr>`
      )
    })
    .join('')
  return (
    `<div style="font-size:12.5px;font-weight:600;color:${C.tinta};padding-top:8px;">Repuestos usados</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;font-family:${FUENTE};font-size:12.5px;color:${C.tinta};">` +
    `<tr>${th('Código SAP', 'left', '96')}${th('Repuesto')}${th('Cant.', 'right', '48')}</tr>${filas}</table>`
  )
}

/**
 * Un evento del correo (mockup aprobado 17-09-2026): número en círculo (el
 * mismo del mensaje de WhatsApp), equipo y hora en una línea, tipo y N° de
 * equipo debajo, el impacto en etiquetas, lo que escribió el técnico en un
 * recuadro, repuestos en tabla, técnicos y fotos.
 */
function htmlEvento(e: EventoBitacora, numero: number, fuente: (f: FotoEvento) => string, pendiente: boolean): string {
  const equipo = e.equipo?.trim() ?? ''
  const titulo = tituloDe(e)
  const principal = equipo || titulo || etiquetaTipo(e)
  const hora = horarioEvento(e)
  const cod = codigoEquipoDe(e)
  const meta = [etiquetaTipo(e), cod ? `${/^\d+$/.test(cod) ? 'N° de equipo' : 'Ubicación técnica'} ${cod}` : ''].filter(Boolean).join(' · ')
  const tecnicos = tecnicosDelEvento(e)
  // Una sola fila de TRES celdas (número · contenido · hora), sin tablas anidadas:
  // Word (el motor de Outlook) no respeta el 100 % de una tabla dentro de una
  // celda, y al pegar la hora caía donde terminaba el texto y cada evento se
  // corría más a la derecha que el anterior (foto de Orel, 17-09).
  const celda = `vertical-align:top;padding:16px 0;border-bottom:1px solid ${C.linea};font-family:${FUENTE};color:${C.tinta};`
  return (
    `<tr><td width="36" style="width:36px;${celda}padding-top:17px;">` +
    `<div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:${pendiente ? C.pendBorde : C.tinta};color:#FFFFFF;font-family:${FUENTE};font-size:13px;font-weight:700;text-align:center;">${numero}</div></td>` +
    `<td style="${celda}">` +
    `<div style="font-size:16px;font-weight:600;">${escaparHtml(principal)}</div>` +
    (equipo && titulo ? `<div style="font-size:14px;font-weight:600;">${escaparHtml(titulo)}</div>` : '') +
    `<div style="font-size:12.5px;color:${C.sec};padding-top:1px;">${escaparHtml(meta)}</div>` +
    htmlChips(e) +
    (e.descripcion?.trim()
      ? `<div style="background:${C.citaFondo};border-left:3px solid ${C.citaBarra};padding:6px 10px;margin-top:8px;font-size:14px;">${conSaltos(e.descripcion)}</div>`
      : '') +
    htmlRepuestos(e) +
    (tecnicos.length ? `<div style="font-size:12.5px;color:${C.sec};padding-top:8px;">Técnicos: ${escaparHtml(tecnicos.join(', '))}</div>` : '') +
    htmlFotos(e.fotos ?? [], fuente) +
    `</td>` +
    `<td width="96" style="width:96px;${celda}padding-left:12px;padding-top:18px;text-align:right;white-space:nowrap;font-size:13px;font-weight:600;">${escaparHtml(hora)}</td>` +
    `</tr>`
  )
}

/** Título de sección: «EVENTOS DEL TURNO 6» con una raya debajo (ámbar en los pendientes). */
function htmlSeccion(titulo: string, cantidad: number | null, color: string): string {
  return (
    `<div style="font-family:${FUENTE};font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.tinta};` +
    `margin-top:20px;padding-bottom:6px;border-bottom:2px solid ${color};">${escaparHtml(titulo)}` +
    (cantidad != null ? ` <span style="color:${C.sec};font-weight:600;">${cantidad}</span>` : '') +
    `</div>`
  )
}

function htmlKpi(valor: string, etiqueta: string, punto?: string): string {
  return (
    `<td style="padding:8px 12px;border:1px solid ${C.linea};vertical-align:top;font-family:${FUENTE};">` +
    `<div style="font-size:18px;font-weight:600;color:${C.tinta};white-space:nowrap;">${escaparHtml(valor)}</div>` +
    `<div style="font-size:12px;color:${C.sec};">${punto ? `<span style="color:${punto};">●</span> ` : ''}${escaparHtml(etiqueta)}</div></td>`
  )
}

/** "de parada (2)" o "de parada (2, 1 sin duración)". */
export function etiquetaParada(r: { conParada: number; paradasSinDuracion: number }): string {
  if (!r.conParada) return 'de parada'
  return r.paradasSinDuracion ? `de parada (${r.conParada}, ${r.paradasSinDuracion} sin duración)` : `de parada (${r.conParada})`
}

/** "pendientes" o "pendientes (2 ya cerrados)" al mirar un turno viejo. */
export function etiquetaPendientes(r: { pendientesDelTurno: number; pendientesResueltosDespues: number }): string {
  const base = r.pendientesDelTurno === 1 ? 'pendiente' : 'pendientes'
  if (!r.pendientesResueltosDespues) return base
  return `${base} (${r.pendientesResueltosDespues} ya ${r.pendientesResueltosDespues === 1 ? 'cerrado' : 'cerrados'})`
}

/** "KNURO N1 · Pusher con golpes… · desde Turno día 15-09 (Leandro Igor)". */
export function lineaPendienteAnterior(e: EventoBitacora): string {
  const texto = (e.descripcion ?? '').trim().replace(/\s+/g, ' ')
  return [e.equipo?.trim(), tituloDe(e), texto.length > 140 ? `${texto.slice(0, 137)}…` : texto, `desde ${etiquetaCortaTurno(e.turnoId)} (${autorVisible(e)})`]
    .filter(Boolean)
    .join(' · ')
}

/** Cuántos repuestos distintos (por código SAP) se usaron en los eventos. */
export function repuestosDistintos(eventos: readonly EventoBitacora[]): number {
  return new Set(eventos.flatMap((e) => normalizarRepuestos(e.repuestos).map((r) => r.codigoSAP))).size
}

export function bitacoraAHtmlCorreo({ turno, eventos: todos, tecnicos, planta, observacion, pendientesAnteriores = [], fuenteFoto }: DatosCorreoBitacora): string {
  const eventos = soloListos(todos)
  const fuente = fuenteFoto ?? ((f: FotoEvento) => f.url)
  const r = resumirBitacora(eventos)
  const { hechos, pendientes } = gruposDelTurno(turno, eventos)
  const repuestos = repuestosDistintos(eventos)

  const kpis = [
    htmlKpi(String(r.eventos), r.eventos === 1 ? 'evento' : 'eventos'),
    htmlKpi(formatoMinutos(r.minutosParada), etiquetaParada(r), r.conParada > 0 ? C.parada : undefined),
    // MTTR solo con paradas: sin ellas era un «—» que no decía nada.
    r.mttrMin != null ? htmlKpi(formatoMinutos(r.mttrMin), 'MTTR') : '',
    // Solo si hubo: es la evidencia de que el proceso no se detuvo porque
    // alguien lo sostuvo (la tolva de riles con las cabezas a mano).
    r.afectados > 0 ? htmlKpi(String(r.afectados), r.afectados === 1 ? 'siguió gracias a Mantención' : 'siguieron gracias a Mantención', C.afectado) : '',
    htmlKpi(String(r.enVentana), 'sin detener producción', r.enVentana > 0 ? C.ventana : undefined),
    htmlKpi(String(r.pendientesDelTurno), etiquetaPendientes(r), r.pendientes > 0 ? C.pendBorde : undefined),
    // Solo si hubo: es el número que demuestra la entrega de turno.
    r.pendientesCerrados > 0
      ? htmlKpi(String(r.pendientesCerrados), r.pendientesCerrados === 1 ? 'pendiente cerrado' : 'pendientes cerrados', C.ventana)
      : '',
    repuestos > 0 ? htmlKpi(String(repuestos), repuestos === 1 ? 'repuesto usado' : 'repuestos usados') : '',
  ].join('')

  const encabezado =
    `<div style="font-family:${FUENTE};font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.marca};">` +
    `Bitácora de Mantención · ${escaparHtml(planta)}</div>` +
    `<div style="font-family:${FUENTE};font-size:21px;font-weight:600;color:${C.tinta};padding-top:2px;">` +
    `${escaparHtml(etiquetaTurno(turno))} · ${escaparHtml(capitalizarPrimera(fechaTurnoLarga(turno)))}</div>` +
    `<div style="font-family:${FUENTE};font-size:13px;color:${C.sec};padding-top:2px;">` +
    `${escaparHtml(horarioTurno(turno).replace('–', 'a'))}${tecnicos.length ? ` · Técnicos de turno: ${escaparHtml(tecnicos.join(', '))}` : ''}</div>`

  const tablaKpis = eventos.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:12px 0 4px;"><tr>${kpis}</tr></table>`
    : ''

  const bloqueObservacion = observacion?.trim()
    ? htmlSeccion('Observaciones del turno', null, C.tinta) +
      `<div style="font-family:${FUENTE};background:${C.citaFondo};border-left:3px solid ${C.citaBarra};padding:6px 10px;margin-top:8px;font-size:14px;color:${C.tinta};">${conSaltos(observacion)}</div>`
    : ''

  const tablaEventos = (lista: readonly EventoBitacora[], desde: number, pendiente: boolean) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;">${lista
      .map((e, i) => htmlEvento(e, desde + i, fuente, pendiente))
      .join('')}</table>`

  const cuerpo = !eventos.length
    ? `<p style="font-family:${FUENTE};font-size:14px;color:${C.sec};">Sin eventos registrados en el turno.</p>`
    : (hechos.length ? htmlSeccion('Eventos del turno', hechos.length, C.tinta) + tablaEventos(hechos, 1, false) : '') +
      (pendientes.length
        ? htmlSeccion('Pendiente para el turno siguiente', pendientes.length, C.pendBorde) + tablaEventos(pendientes, hechos.length + 1, true)
        : '')

  const bloqueAnteriores = pendientesAnteriores.length
    ? htmlSeccion('Sigue pendiente de turnos anteriores', pendientesAnteriores.length, C.pendBorde) +
      `<ul style="font-family:${FUENTE};font-size:13px;color:${C.tinta};margin:8px 0 0;padding-left:18px;">` +
      pendientesAnteriores.map((e) => `<li style="padding:2px 0;">${escaparHtml(lineaPendienteAnterior(e))}</li>`).join('') +
      `</ul>`
    : ''

  const pie =
    `<div style="font-family:${FUENTE};font-size:11px;color:${C.sec};padding-top:16px;">` +
    `Generado con la app de Mantención · ${escaparHtml(etiquetaTurno(turno))} ${escaparHtml(turno.fecha.split('-').reverse().join('-'))}</div>`

  // La planilla «Recoleccion MTTR» va ARRIBA, como la pegan hoy desde Excel; el
  // detalle de la bitácora sigue debajo (pedido de Orel, 17-09-2026).
  // Bajo la planilla, las dos siglas con su definición y su cálculo (Orel, 18-09).
  const recoleccion = eventos.length
    ? `${htmlRecoleccionMttr(filasRecoleccion(turno, eventos))}` +
      `<div style="font-family:${FUENTE};font-size:12.5px;color:${C.sec};padding-top:6px;">${escaparHtml(explicacionMtbfMttr(turno, r))}</div>` +
      `<div style="height:14px;line-height:14px;">&nbsp;</div>`
    : ''
  return `${recoleccion}<div style="max-width:680px;color:${C.tinta};">${encabezado}${tablaKpis}${bloqueObservacion}${cuerpo}${bloqueAnteriores}${pie}</div>`
}

/** "3 eventos · 35 min de parada (1) · MTTR 35 min · 1 sin detener producción · 1 pendiente" (texto plano y WhatsApp). */
export function lineaResumen(r: ReturnType<typeof resumirBitacora>): string {
  return (
    `${r.eventos} ${r.eventos === 1 ? 'evento' : 'eventos'} · ${formatoMinutos(r.minutosParada)} ${etiquetaParada(r)} · ` +
    `MTTR ${r.mttrMin == null ? '—' : formatoMinutos(r.mttrMin)} · ${r.enVentana} sin detener producción · ` +
    (r.afectados > 0 ? `${r.afectados} siguieron gracias a Mantención · ` : '') +
    `${r.pendientesDelTurno} ${etiquetaPendientes(r)}` +
    (r.pendientesCerrados > 0 ? ` · ${r.pendientesCerrados} ${r.pendientesCerrados === 1 ? 'pendiente cerrado' : 'pendientes cerrados'}` : '')
  )
}

/** Versión en texto plano: va junto al HTML en el portapapeles, por si el destino no acepta HTML. */
export function bitacoraATextoPlano({ turno, eventos: todos, tecnicos, planta, observacion, pendientesAnteriores = [] }: DatosCorreoBitacora): string {
  const eventos = soloListos(todos)
  const r = resumirBitacora(eventos)
  const ordenados = ordenarEventos(turno, eventos)
  const linea = (e: EventoBitacora) =>
    [
      encabezadoEvento(e) || etiquetaTipo(e),
      `  ${lineaImpacto(e)}`,
      lineaTecnicos(e) ? `  ${lineaTecnicos(e)}` : '',
      e.descripcion?.trim() ? `  ${e.descripcion.trim().replace(/\r?\n/g, '\n  ')}` : '',
      ...lineasRepuestos(e).map((l) => `  ${l}`),
      e.fotos?.length ? `  Fotos: ${e.fotos.length}` : '',
    ]
      .filter(Boolean)
      .join('\n')

  const hechos = ordenados.filter((e) => !fuePendiente(e))
  const pendientes = ordenados.filter(fuePendiente)
  const cabecera = [
    `Bitácora de Mantención · ${etiquetaTurno(turno)}`,
    `${capitalizarPrimera(fechaTurnoLarga(turno))} · ${horarioTurno(turno).replace('–', 'a')} · ${planta}`,
    tecnicos.length ? `Técnicos de turno: ${tecnicos.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const resumen = lineaResumen(r)
  // Bloques separados por una línea en blanco: pegado en un correo sin formato
  // cada evento se lee aparte.
  const recoleccion = eventos.length ? [textoRecoleccionMttr(filasRecoleccion(turno, eventos)), explicacionMtbfMttr(turno, r), ''] : []
  return [
    ...recoleccion,
    cabecera,
    resumen,
    ...(observacion?.trim() ? [`Observaciones del turno: ${observacion.trim()}`] : []),
    ...hechos.map(linea),
    ...(pendientes.length ? ['PENDIENTE PARA EL TURNO SIGUIENTE', ...pendientes.map(linea)] : []),
    ...(pendientesAnteriores.length
      ? ['SIGUE PENDIENTE DE TURNOS ANTERIORES', pendientesAnteriores.map((e) => `- ${lineaPendienteAnterior(e)}`).join('\n')]
      : []),
  ].join('\n\n')
}
