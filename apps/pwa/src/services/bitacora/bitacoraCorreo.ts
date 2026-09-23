import { ETIQUETA_FOTO } from '@/config/bitacora'
import { autorVisible, tecnicosDelEvento, type EventoBitacora, type FotoEvento, type TurnoMantencion } from './bitacora.types'
import { fuePendiente, gruposDelTurno, minutosParadaDe, ordenarEventos, resumirBitacora } from './resumenBitacora'
import { filasRecoleccion, htmlRecoleccionMttr, textoRecoleccionMttr } from './recoleccionMttr'
import { explicacionMtbfMttr, mtbfDelTurno } from './mtbf'
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

import { C, FUENTE, ROTULO, SEC, TEXTO, TEXTO_FIJO, TITULO, RAYA, escaparHtml, estado, filaCifras, kpi, negrita, seccion, small } from './documentoCorreo'

// Se reexporta: el PDF y las pruebas lo importan desde aquí.
export { horarioEvento }
// La paleta, la fuente y el escape viven en `documentoCorreo` (la forma compartida de los
// correos); se reexportan para no mover a quien ya los importaba de aquí.
export { C, FUENTE, escaparHtml }

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

// Dos fotos por fila que quepan en un TELÉFONO: 2 × 156 + 8 de aire + 28 del número = 348 px,
// y el cuerpo de un correo en Outlook/Mail móvil mide ~351. Iban de 260 (2 × 260 = 536 px):
// como el correo no puede llevar reglas «solo móvil» (Word las borra al pegar), el teléfono
// ENCOGÍA todo el correo para que cupiera la fila de fotos y el texto se leía diminuto
// (correo del 23-09-2026 en el celular de Orel). En PC se ven más chicas, pero se tocan.
const ANCHO_FOTO = 156
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

export function htmlFotos(fotos: readonly FotoEvento[], fuente: (f: FotoEvento) => string): string {
  if (!fotos.length) return ''
  // Antes y después juntos y en ese orden: es la comparación que se quiere ver.
  const orden = { antes: 0, despues: 1, foto: 2 } as const
  const lista = [...fotos].sort((a, b) => orden[a.etiqueta] - orden[b.etiqueta])
  const filas: string[] = []
  for (let i = 0; i < lista.length; i += 2) {
    const celdas = lista.slice(i, i + 2).map((f) => {
      const { w, h } = dimensionesFoto(f)
      return (
        // `valign` como ATRIBUTO: Word borra `vertical-align` del estilo al pegar.
        `<td valign="top" style="padding:8px 8px 0 0;vertical-align:top;">` +
        `<img src="${escaparHtml(fuente(f))}" width="${w}"${h == null ? '' : ` height="${h}"`} alt="${escaparHtml(ETIQUETA_FOTO[f.etiqueta])}" ` +
        `style="display:block;width:${w}px;${h == null ? '' : `height:${h}px;`}border:0;border-radius:4px;">` +
        // «Foto» debajo de cada foto era ruido; solo «Antes» y «Después» dicen algo.
        (f.etiqueta === 'foto' ? '' : `<div style="font-family:${FUENTE};font-size:12px;color:${C.sec};padding-top:2px;">${small(escaparHtml(ETIQUETA_FOTO[f.etiqueta]))}</div>`) +
        `</td>`
      )
    })
    filas.push(`<tr>${celdas.join('')}</tr>`)
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${filas.join('')}</table>`
}

/** Una etiqueta de color por cada parte del impacto (parada, ventana, pendiente). */
/**
 * El impacto como punto de color y palabra, no como pastillas rellenas: el color marca, la
 * palabra dice (estándar del correo, regla 4). «Afectó sin detener» va en ámbar: es el trabajo
 * que sostuvo el proceso, ni la parada ni el «sin costo».
 */
function htmlImpacto(e: EventoBitacora): string {
  const partes = partesImpacto(e)
  if (!partes.length) return ''
  const color = (texto: string) => {
    if (texto.startsWith('Detuvo')) return C.parada
    if (texto.startsWith('Afectó')) return C.afectado
    if (texto.startsWith('Sin detener') || texto.startsWith('Cierra pendiente') || texto.startsWith('Resuelto')) return C.ventana
    return C.sec
  }
  return (
    `<div style="font-size:${SEC};line-height:1.6;color:${C.tinta};padding-top:4px;">` +
    small(partes.map((t) => estado(t, color(t))).join(' &nbsp;·&nbsp; ')) +
    `</div>`
  )
}

/** Repuestos como tabla chica: código · nombre común + nombre SAP · cantidad. */
function htmlRepuestos(e: EventoBitacora): string {
  const lista = normalizarRepuestos(e.repuestos)
  if (!lista.length) return ''
  // Anchos fijos en código y cantidad: sin ellos Outlook repartía la tabla por igual.
  const th = (t: string, alinear = 'left', ancho = '') =>
    `<th${ancho ? ` width="${ancho}"` : ''} style="${ancho ? `width:${ancho}px;` : ''}text-align:${alinear};white-space:nowrap;font-weight:600;color:${C.sec};font-size:${ROTULO};letter-spacing:.07em;text-transform:uppercase;padding:0 6px 5px 0;border-bottom:1px solid ${C.tinta};">${small(negrita(t))}</th>`
  const filas = lista
    .map((r) => {
      const comun = (r.nombreComun ?? '').trim()
      const sap = nombreRepuesto(r)
      const nombre = comun
        ? `<b>${escaparHtml(comun)}</b>${sap ? `<br><span style="color:${C.sec};">${escaparHtml(sap)}</span>` : ''}`
        : escaparHtml(sap)
      const td = `padding:5px 6px 5px 0;border-bottom:1px solid ${RAYA};vertical-align:top;line-height:1.45;`
      return (
        `<tr><td style="${td}white-space:nowrap;font-variant-numeric:tabular-nums;">${escaparHtml(r.codigoSAP)}</td>` +
        `<td style="${td}">${nombre}</td>` +
        `<td style="${td}text-align:right;font-variant-numeric:tabular-nums;">${r.cantidad}</td></tr>`
      )
    })
    .join('')
  return (
    `<div style="font-size:${ROTULO};font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:${C.sec};padding:12px 0 6px;">${small(negrita('Repuestos usados'))}</div>` +
    // Sin `width:100%`: el compositor de Outlook en el iPhone lo convierte en píxeles al pegar
    // (652 px) y el teléfono encoge el correo entero para que quepa (prueba de Orel, 23-09-2026).
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${FUENTE};font-size:${SEC};color:${C.tinta};">` +
    `<tr>${th('Código SAP', 'left', '96')}${th('Repuesto')}${th('Cant.', 'right', '48')}</tr>${filas}</table>`
  )
}

/**
 * Un evento del correo. Nació del mockup del 17-09-2026 (número, equipo y hora en una línea,
 * tipo y N° de equipo debajo, impacto, lo que escribió el técnico, repuestos, técnicos y
 * fotos) y el 21-09 pasó por el estándar del correo: el número deja el círculo relleno y va
 * en tinta —el mismo número del mensaje de WhatsApp, sin la pastilla—, la descripción deja el
 * recuadro gris con barra a la izquierda (el tic n.º 1) y va como texto, el impacto deja las
 * pastillas y va como punto y palabra, y todo cabe en los cuatro cuerpos.
 */
function htmlEvento(e: EventoBitacora, numero: number, fuente: (f: FotoEvento) => string, pendiente: boolean): string {
  const equipo = e.equipo?.trim() ?? ''
  const titulo = tituloDe(e)
  const principal = equipo || titulo || etiquetaTipo(e)
  const hora = horarioEvento(e)
  const cod = codigoEquipoDe(e)
  // La hora abre la línea de datos del evento. Iba en una tercera celda de 96 px a la derecha:
  // en el teléfono esa columna se llevaba un cuarto del ancho para dos cifras, y como Word
  // borra `vertical-align` del estilo, la hora (y el número) flotaban a media altura del
  // evento (correo del 23-09-2026 en el celular de Orel).
  // Sin equipo ni título, el tipo ya es el título: no se repite en la línea de datos («Mejora /
  // Mejora», correo del 23-09-2026).
  const meta = [hora, equipo || titulo ? etiquetaTipo(e) : '', cod ? `${/^\d+$/.test(cod) ? 'N° de equipo' : 'Ubicación técnica'} ${cod}` : ''].filter(Boolean).join(' · ')
  const tecnicos = tecnicosDelEvento(e)
  // Una sola fila de DOS celdas (número · contenido), sin tablas anidadas: Word (el motor de
  // Outlook) no respeta el 100 % de una tabla dentro de una celda (foto de Orel, 17-09).
  // `valign` como ATRIBUTO además del estilo: es lo único que Word conserva al pegar.
  const celda = `vertical-align:top;padding:14px 0;border-bottom:1px solid ${RAYA};font-family:${FUENTE};color:${C.tinta};`
  return (
    `<tr><td width="28" valign="top" style="width:28px;${celda}font-size:${TEXTO};line-height:1.5;color:${pendiente ? C.pendBorde : C.sec};font-variant-numeric:tabular-nums;">${negrita(String(numero))}</td>` +
    `<td valign="top" style="${celda}">` +
    `<div style="font-size:${TEXTO};line-height:1.5;font-weight:600;">${negrita(escaparHtml(principal))}</div>` +
    (equipo && titulo ? `<div style="font-size:${TEXTO};line-height:1.5;">${escaparHtml(titulo)}</div>` : '') +
    `<div style="font-size:${SEC};line-height:1.5;color:${C.sec};font-variant-numeric:tabular-nums;">${small(escaparHtml(meta))}</div>` +
    htmlImpacto(e) +
    (e.descripcion?.trim() ? `<div style="font-size:${TEXTO};line-height:1.5;padding-top:6px;">${conSaltos(e.descripcion)}</div>` : '') +
    htmlRepuestos(e) +
    (tecnicos.length ? `<div style="font-size:${SEC};line-height:1.5;color:${C.sec};padding-top:8px;">${small(`Técnicos: ${escaparHtml(tecnicos.join(', '))}`)}</div>` : '') +
    htmlFotos(e.fotos ?? [], fuente) +
    `</td></tr>`
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

/** «MTTR 40 min · MTBF 5 h 35 min» en una línea legible; la fórmula queda en pequeño debajo. */
function lineaMtbfMttr(turno: TurnoMantencion, r: ReturnType<typeof resumirBitacora>): string {
  if (!r.fallas) return ''
  const valorMtbf = mtbfDelTurno(turno, r)
  const partes = [`MTTR ${r.mttrMin == null ? '—' : formatoMinutos(r.mttrMin)}`, `MTBF ${valorMtbf == null ? '—' : formatoMinutos(valorMtbf)}`]
  return `<div style="font-family:${FUENTE};font-size:${TEXTO};line-height:1.5;color:${C.tinta};padding-top:8px;">${negrita(escaparHtml(partes.join(' · ')))}</div>`
}

export function bitacoraAHtmlCorreo(datos: DatosCorreoBitacora): string {
  const eventos = soloListos(datos.eventos)
  const r = resumirBitacora(eventos)
  // La planilla «Recoleccion MTTR» va ARRIBA, como la pegan hoy desde Excel; el detalle de la
  // bitácora sigue debajo (pedido de Orel, 17-09-2026). Bajo la planilla, las dos siglas con
  // su definición y su cálculo (Orel, 18-09). La planilla NO sigue el estándar del correo a
  // propósito: es una copia del Excel, y parecer una planilla es su trabajo.
  //
  // ⚠ La planilla va DENTRO del mismo ancho de 680 px que el cuerpo. Iba suelta con
  // `width:100%`, así que en Outlook se estiraba a todo el panel de lectura —mil píxeles de
  // planilla con filas altas— mientras el cuerpo quedaba en 680: por eso se veía «como letra
  // 30» (Orel, 21-09-2026). No era la letra, era el ancho.
  const recoleccion = eventos.length
    ? `<div style="max-width:680px;${TEXTO_FIJO}">${htmlRecoleccionMttr(filasRecoleccion(datos.turno, eventos))}` +
      lineaMtbfMttr(datos.turno, r) +
      `<div style="font-family:${FUENTE};font-size:${SEC};line-height:1.5;color:${C.sec};padding-top:2px;">${small(escaparHtml(explicacionMtbfMttr(datos.turno, r)))}</div>` +
      `<div style="height:14px;line-height:14px;">&nbsp;</div></div>`
    : ''
  return recoleccion + cuerpoBitacoraHtml(datos)
}

/**
 * El cuerpo del correo, del encabezado hacia abajo: lo que sigue el estándar del correo
 * (`documentoCorreo`). Separado de la planilla para que las pruebas del estándar lo midan solo.
 */
export function cuerpoBitacoraHtml({ turno, eventos: todos, tecnicos, planta, observacion, pendientesAnteriores = [], fuenteFoto }: DatosCorreoBitacora): string {
  const eventos = soloListos(todos)
  const fuente = fuenteFoto ?? ((f: FotoEvento) => f.url)
  const r = resumirBitacora(eventos)
  const { hechos, pendientes } = gruposDelTurno(turno, eventos)
  const repuestos = repuestosDistintos(eventos)

  // Eventos y pendientes siempre: son el marco de la entrega, y «0 pendientes» al cerrar un
  // turno SÍ es noticia. Lo demás, solo si hubo: un cero no es noticia.
  const cifras = eventos.length
    ? [
        kpi(String(r.eventos), r.eventos === 1 ? 'evento' : 'eventos'),
        r.conParada > 0 ? kpi(formatoMinutos(r.minutosParada), etiquetaParada(r)) : '',
        // MTTR solo con paradas: sin ellas era un «—» que no decía nada.
        r.mttrMin != null ? kpi(formatoMinutos(r.mttrMin), 'MTTR') : '',
        // Es la evidencia de que el proceso no se detuvo porque alguien lo sostuvo (la tolva
        // de riles con las cabezas a mano).
        r.afectados > 0 ? kpi(String(r.afectados), r.afectados === 1 ? 'siguió gracias a Mantención' : 'siguieron gracias a Mantención') : '',
        r.enVentana > 0 ? kpi(String(r.enVentana), 'sin detener producción') : '',
        kpi(String(r.pendientesDelTurno), etiquetaPendientes(r)),
        // Es el número que demuestra la entrega de turno.
        r.pendientesCerrados > 0 ? kpi(String(r.pendientesCerrados), r.pendientesCerrados === 1 ? 'pendiente cerrado' : 'pendientes cerrados') : '',
        repuestos > 0 ? kpi(String(repuestos), repuestos === 1 ? 'repuesto usado' : 'repuestos usados') : '',
      ]
    : []

  const encabezado =
    `<div style="font-family:${FUENTE};font-size:${ROTULO};font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:${C.sec};">` +
    `${small(negrita(`Bitácora de Mantención · ${escaparHtml(planta)}`))}</div>` +
    `<div style="font-family:${FUENTE};font-size:${TITULO};font-weight:600;line-height:1.2;color:${C.tinta};padding-top:4px;">` +
    `${negrita(`${escaparHtml(etiquetaTurno(turno))} · ${escaparHtml(capitalizarPrimera(fechaTurnoLarga(turno)))}`)}</div>` +
    `<div style="font-family:${FUENTE};font-size:${SEC};line-height:1.5;color:${C.sec};padding-top:4px;">` +
    `${small(`${escaparHtml(horarioTurno(turno).replace('–', 'a'))}${tecnicos.length ? ` · Técnicos de turno: ${escaparHtml(tecnicos.join(', '))}` : ''}`)}</div>`

  // Lo que escribió quien entrega el turno va como texto bajo su rótulo, no en un recuadro
  // gris con barra a la izquierda (el tic n.º 1 del estándar).
  const bloqueObservacion = observacion?.trim()
    ? seccion('Observaciones del turno') +
      `<div style="font-family:${FUENTE};font-size:${TEXTO};line-height:1.5;color:${C.tinta};padding-top:8px;">${conSaltos(observacion)}</div>`
    : ''

  const tablaEventos = (lista: readonly EventoBitacora[], desde: number, pendiente: boolean) =>
    // Sin `width:100%` (ver htmlRepuestos): la tabla toma el ancho del texto más largo, que en
    // un evento real siempre llena la columna.
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:4px;">${lista
      .map((e, i) => htmlEvento(e, desde + i, fuente, pendiente))
      .join('')}</table>`

  const cuerpo = !eventos.length
    ? `<p style="font-family:${FUENTE};font-size:${TEXTO};line-height:1.5;color:${C.sec};margin:28px 0 0;">Sin eventos registrados en el turno.</p>`
    : (hechos.length ? seccion('Eventos del turno', hechos.length) + tablaEventos(hechos, 1, false) : '') +
      (pendientes.length ? seccion('Pendiente para el turno siguiente', pendientes.length) + tablaEventos(pendientes, hechos.length + 1, true) : '')

  const bloqueAnteriores = pendientesAnteriores.length
    ? seccion('Sigue pendiente de turnos anteriores', pendientesAnteriores.length) +
      `<ul style="font-family:${FUENTE};font-size:${TEXTO};line-height:1.5;color:${C.tinta};margin:8px 0 0;padding-left:18px;">` +
      pendientesAnteriores.map((e) => `<li style="padding:2px 0;">${escaparHtml(lineaPendienteAnterior(e))}</li>`).join('') +
      `</ul>`
    : ''

  // Sin pie de «generado con la app»: quien recibe el correo sabe de dónde viene, y el
  // documento termina donde termina la entrega (Orel, 21-09-2026).
  return `<div style="max-width:680px;color:${C.tinta};${TEXTO_FIJO}">${encabezado}${filaCifras(cifras, 1)}${bloqueObservacion}${cuerpo}${bloqueAnteriores}</div>`
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
