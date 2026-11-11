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

import { C, FUENTE, TEXTO_FIJO, escaparHtml, estado, negrita, small } from './documentoCorreo'
import { tituloTurno } from './tituloTurno'

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

const conSaltos =(t: string) => escaparHtml(t.trim()).replace(/\r?\n/g, '<br>')

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

/** `estilo: 'turno'` para el correo de turno: leyenda a 13 px sin `<small>` y sin esquinas (estándar). */
export function htmlFotos(fotos: readonly FotoEvento[], fuente: (f: FotoEvento) => string, estilo: 'inspeccion' | 'turno' = 'inspeccion'): string {
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
        `style="display:block;width:${w}px;${h == null ? '' : `height:${h}px;`}border:0;${estilo === 'turno' ? '' : 'border-radius:4px;'}">` +
        // «Foto» debajo de cada foto era ruido; solo «Antes» y «Después» dicen algo.
        (f.etiqueta === 'foto'
          ? ''
          : estilo === 'turno'
            ? `<div style="font-family:${FUENTE};font-size:13px;color:${C.sec};padding-top:2px;">${escaparHtml(ETIQUETA_FOTO[f.etiqueta])}</div>`
            : `<div style="font-family:${FUENTE};font-size:12px;color:${C.sec};padding-top:2px;">${small(escaparHtml(ETIQUETA_FOTO[f.etiqueta]))}</div>`) +
        `</td>`
      )
    })
    filas.push(`<tr>${celdas.join('')}</tr>`)
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${filas.join('')}</table>`
}

/*
 * Escala del correo de turno (mockup «Correo», 10-11-2026): título 22 px, texto 15 px, rótulos
 * y cifras 13 px. Las cifras van en monoespaciada. No se usa `small()`: el navegador la achica
 * a 1/1,2 y un texto de 13 px quedaba en 10,8.
 */
const T_TITULO = '22px'
const T_TEXTO = '15px'
const T_SEC = '13px'
const MONO = "Consolas,'Courier New',monospace"

/** Color de cada parte del impacto: la parada en rojo, lo que sostuvo el proceso en ámbar, lo que no costó en verde. */
function colorImpacto(texto: string): string {
  if (texto.startsWith('Detuvo')) return C.parada
  if (texto.startsWith('Afectó')) return C.afectado
  if (texto.startsWith('Sin detener') || texto.startsWith('Cierra pendiente') || texto.startsWith('Resuelto')) return C.ventana
  return C.sec
}

/** El impacto como punto de color y palabra, bajo el texto del técnico (estándar del correo). */
function htmlImpacto(e: EventoBitacora): string {
  const partes = partesImpacto(e)
  if (!partes.length) return ''
  return `<div style="font-size:${T_SEC};line-height:1.5;padding-top:4px;">${partes.map((t) => estado(t, colorImpacto(t))).join(' &nbsp;·&nbsp; ')}</div>`
}

/** Repuestos usados del trabajo: código SAP, nombre y cantidad, en una tabla de 13 px sin filetes verticales. */
function htmlRepuestos(e: EventoBitacora): string {
  const lista = normalizarRepuestos(e.repuestos)
  if (!lista.length) return ''
  const celda = `padding:4px 10px 4px 0;border-bottom:1px solid ${C.linea};vertical-align:top;font-size:${T_SEC};line-height:1.4;`
  const filas = lista
    .map((r) => {
      const comun = (r.nombreComun ?? '').trim()
      const sap = nombreRepuesto(r)
      const nombre = comun
        ? `<b>${escaparHtml(comun)}</b>${sap ? `<br><span style="color:${C.sec};">${escaparHtml(sap)}</span>` : ''}`
        : escaparHtml(sap)
      return (
        `<tr><td valign="top" style="${celda}white-space:nowrap;font-family:${MONO};">${escaparHtml(r.codigoSAP)}</td>` +
        `<td valign="top" style="${celda}">${nombre}</td>` +
        `<td valign="top" align="right" style="${celda}text-align:right;font-family:${MONO};">${r.cantidad}</td></tr>`
      )
    })
    .join('')
  return (
    `<div style="font-size:${T_SEC};line-height:1.5;color:${C.sec};padding-top:8px;">Repuestos usados</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${FUENTE};font-size:${T_SEC};color:${C.tinta};margin-top:4px;">${filas}</table>`
  )
}

/**
 * Un trabajo del turno: una fila con filete, como en el mockup «Correo» (10-11-2026). Número,
 * equipo y código en negrita; tipo y hora en 13 px; lo que hizo el técnico tal cual; el impacto
 * en color de aviso; repuestos, técnicos y fotos. Sin cajas ni fondos (estándar del correo).
 */
function htmlEvento(e: EventoBitacora, numero: number, fuente: (f: FotoEvento) => string, pendiente: boolean): string {
  const equipo = e.equipo?.trim() ?? ''
  const titulo = tituloDe(e)
  const principal = equipo || titulo || etiquetaTipo(e)
  const cod = codigoEquipoDe(e)
  const hora = horarioEvento(e)
  // Sin equipo ni título, el tipo ya es el título: no se repite en la línea de datos.
  const datos = [equipo || titulo ? etiquetaTipo(e) : '', hora].filter(Boolean).join(' · ')
  const repuestos = htmlRepuestos(e)
  const tecnicos = tecnicosDelEvento(e)
  const filete = `border-top:1px solid ${C.linea};`
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
    `<tr><td width="30" valign="top" style="width:30px;${filete}padding:14px 10px 14px 0;vertical-align:top;font-family:${MONO};font-size:${T_SEC};line-height:1.5;color:${pendiente ? C.pendBorde : C.sec};">${numero}</td>` +
    `<td valign="top" style="${filete}padding:14px 0;vertical-align:top;font-family:${FUENTE};color:${C.tinta};">` +
    `<div style="font-size:${T_TEXTO};line-height:1.4;font-weight:600;">${escaparHtml(principal)}${cod ? ` <span style="font-family:${MONO};font-size:${T_SEC};font-weight:400;color:${C.sec};">${escaparHtml(cod)}</span>` : ''}</div>` +
    (datos ? `<div style="font-size:${T_SEC};line-height:1.5;color:${C.sec};">${escaparHtml(datos)}</div>` : '') +
    (equipo && titulo ? `<div style="font-size:${T_TEXTO};line-height:1.5;padding-top:6px;">${escaparHtml(titulo)}</div>` : '') +
    (e.descripcion?.trim() ? `<div style="font-size:${T_TEXTO};line-height:1.5;padding-top:6px;">${conSaltos(e.descripcion)}</div>` : '') +
    htmlImpacto(e) +
    repuestos +
    (tecnicos.length ? `<div style="font-size:${T_SEC};line-height:1.5;color:${C.sec};padding-top:4px;">${escaparHtml(`Técnicos: ${tecnicos.join(', ')}`)}</div>` : '') +
    htmlFotos(e.fotos ?? [], fuente, 'turno') +
    `</td></tr></table>`
  )
}

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
  return `<div style="font-family:${FUENTE};font-size:${T_TEXTO};line-height:1.5;color:${C.tinta};padding-top:10px;">${negrita(escaparHtml(partes.join(' · ')))}</div>`
}

/**
 * El correo de turno: primero el cuerpo (estándar del correo) y al final la planilla «MTBF -
 * MTTR» con su cálculo. Lo que el turno hizo se lee antes que la planilla (mockup «Correo»,
 * 10-11-2026).
 */
export function bitacoraAHtmlCorreo(datos: DatosCorreoBitacora): string {
  return cuerpoBitacoraHtml(datos) + bloquePlanillaMttr(datos.turno, soloListos(datos.eventos))
}

/**
 * La planilla con su aspecto de Excel, a 13 px (nunca menos de 12), con todas sus filas, la
 * línea de MTTR · MTBF y la explicación del cálculo. Va dentro del mismo ancho de 680 px que el
 * cuerpo: sin el tope, en Outlook se estira al panel de lectura.
 */
function bloquePlanillaMttr(turno: TurnoMantencion, eventos: readonly EventoBitacora[]): string {
  if (!eventos.length) return ''
  const r = resumirBitacora(eventos)
  return (
    `<div style="max-width:680px;${TEXTO_FIJO}border-top:1px solid ${C.tinta};margin-top:28px;padding-top:14px;">` +
    htmlRecoleccionMttr(filasRecoleccion(turno, eventos), { tamano: T_SEC }) +
    lineaMtbfMttr(turno, r) +
    `<div style="font-family:${FUENTE};font-size:${T_SEC};line-height:1.5;color:${C.sec};padding-top:4px;">${escaparHtml(explicacionMtbfMttr(turno, r))}</div>` +
    `</div>`
  )
}

/** Un rótulo de sección: mayúsculas literales (sobreviven al pegado que aplana) y un filete encima. */
function rotuloTurno(titulo: string, cantidad?: number): string {
  return (
    `<div style="font-family:${FUENTE};font-size:${T_SEC};font-weight:600;color:${C.sec};margin-top:24px;padding-top:10px;border-top:1px solid ${C.tinta};">` +
    `${negrita(escaparHtml(titulo.toUpperCase()))}${cantidad != null ? ` <span style="color:${C.tinta};">${cantidad}</span>` : ''}</div>`
  )
}

/** La fila de cifras con filete: de a tres por fila, para que quepa en un teléfono. */
function filaCifrasTurno(cifras: readonly { valor: string; rotulo: string }[]): string {
  if (!cifras.length) return ''
  const filas: string[] = []
  for (let i = 0; i < cifras.length; i += 3) {
    const celdas = cifras.slice(i, i + 3).map(
      (c) =>
        `<td valign="top" style="padding:10px 24px 10px 0;vertical-align:top;border-top:1px solid ${i === 0 ? C.tinta : C.linea};font-family:${FUENTE};">` +
        `<div style="font-family:${MONO};font-size:${T_TEXTO};font-weight:600;line-height:1.3;color:${C.tinta};white-space:nowrap;">${escaparHtml(c.valor)}</div>` +
        `<div style="font-size:${T_SEC};line-height:1.4;color:${C.sec};padding-top:2px;">${escaparHtml(c.rotulo)}</div></td>`,
    )
    filas.push(`<tr>${celdas.join('')}</tr>`)
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:14px;">${filas.join('')}</table>`
}

/**
 * El cuerpo del correo, del encabezado hacia abajo, con la forma del mockup «Correo» (10-11-2026):
 * una línea de planta, el título de 22 px con el dato del turno, la fila de cifras con filete, las
 * observaciones, los trabajos (una fila por evento, con el texto del técnico tal cual) y lo que
 * queda pendiente. Sin cajas ni fondos. Va separado de la planilla para que las pruebas del
 * estándar lo midan solo.
 */
export function cuerpoBitacoraHtml({ turno, eventos: todos, tecnicos, planta, observacion, pendientesAnteriores = [], fuenteFoto }: DatosCorreoBitacora): string {
  const eventos = soloListos(todos)
  const fuente = fuenteFoto ?? ((f: FotoEvento) => f.url)
  const r = resumirBitacora(eventos)
  const fotos = eventos.reduce((n, e) => n + (e.fotos?.length ?? 0), 0)
  const { hechos, pendientes } = gruposDelTurno(turno, eventos)
  const repuestos = repuestosDistintos(eventos)

  // Eventos y pendientes siempre: son el marco de la entrega. Lo demás, solo si hubo (un cero no es noticia).
  const cifras = eventos.length
    ? (
        [
          { valor: String(r.eventos), rotulo: r.eventos === 1 ? 'evento' : 'eventos' },
          r.conParada > 0 ? { valor: formatoMinutos(r.minutosParada), rotulo: etiquetaParada(r) } : null,
          r.mttrMin != null ? { valor: formatoMinutos(r.mttrMin), rotulo: 'MTTR' } : null,
          r.afectados > 0
            ? { valor: String(r.afectados), rotulo: r.afectados === 1 ? 'siguió gracias a Mantención' : 'siguieron gracias a Mantención' }
            : null,
          r.enVentana > 0 ? { valor: String(r.enVentana), rotulo: 'sin detener producción' } : null,
          { valor: String(r.pendientesDelTurno), rotulo: etiquetaPendientes(r) },
          r.pendientesCerrados > 0
            ? { valor: String(r.pendientesCerrados), rotulo: r.pendientesCerrados === 1 ? 'pendiente cerrado' : 'pendientes cerrados' }
            : null,
          repuestos > 0 ? { valor: String(repuestos), rotulo: repuestos === 1 ? 'repuesto usado' : 'repuestos usados' } : null,
        ].filter((c): c is { valor: string; rotulo: string } => c !== null)
      )
    : []

  const encabezado =
    `<div style="font-family:${FUENTE};font-size:${T_SEC};line-height:1.4;color:${C.sec};">Bitácora de Mantención · ${escaparHtml(planta)}</div>` +
    `<div style="font-family:${FUENTE};font-size:${T_TITULO};font-weight:600;line-height:1.25;color:${C.tinta};padding-top:6px;">` +
    `${escaparHtml(`${etiquetaTurno(turno)} del ${fechaTurnoLarga(turno)}: ${tituloTurno(r, fotos)}`)}</div>` +
    `<div style="font-family:${FUENTE};font-size:${T_SEC};line-height:1.4;color:${C.sec};padding-top:6px;">` +
    `${escaparHtml(horarioTurno(turno).replace('–', 'a'))}${tecnicos.length ? ` · Técnicos de turno: ${escaparHtml(tecnicos.join(', '))}` : ''}</div>`

  // Lo que escribió quien entrega el turno: texto bajo su rótulo, sin recuadro.
  const bloqueObservacion = observacion?.trim()
    ? rotuloTurno('Observaciones del turno') +
      `<div style="font-family:${FUENTE};font-size:${T_TEXTO};line-height:1.5;color:${C.tinta};padding-top:6px;">${conSaltos(observacion)}</div>`
    : ''

  // Cada evento es una fila con filete; aquí solo se encadenan.
  const filasEventos = (lista: readonly EventoBitacora[], desde: number, pendiente: boolean) =>
    lista.map((e, i) => htmlEvento(e, desde + i, fuente, pendiente)).join('')

  const cuerpo = !eventos.length
    ? `<p style="font-family:${FUENTE};font-size:${T_TEXTO};line-height:1.5;color:${C.sec};margin:24px 0 0;">Sin eventos registrados en el turno.</p>`
    : (hechos.length ? rotuloTurno('Trabajos del turno', hechos.length) + filasEventos(hechos, 1, false) : '') +
      (pendientes.length
        ? rotuloTurno('Pendiente para el turno siguiente', pendientes.length) + filasEventos(pendientes, hechos.length + 1, true)
        : '')

  const bloqueAnteriores = pendientesAnteriores.length
    ? rotuloTurno('Sigue pendiente de turnos anteriores', pendientesAnteriores.length) +
      `<ul style="font-family:${FUENTE};font-size:${T_TEXTO};line-height:1.5;color:${C.tinta};margin:6px 0 0;padding-left:18px;">` +
      pendientesAnteriores.map((e) => `<li style="padding:2px 0;">${escaparHtml(lineaPendienteAnterior(e))}</li>`).join('') +
      `</ul>`
    : ''

  // Sin pie de «generado con la app»: el documento termina donde termina la entrega (Orel, 21-09-2026).
  return `<div style="max-width:680px;color:${C.tinta};${TEXTO_FIJO}">${encabezado}${filaCifrasTurno(cifras)}${bloqueObservacion}${cuerpo}${bloqueAnteriores}</div>`
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
