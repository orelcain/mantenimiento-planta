import { C, FUENTE, escaparHtml, htmlFotos, htmlKpi, htmlSeccion } from '@/services/bitacora/bitacoraCorreo'
import { etiquetaTurno, fechaTurnoLarga, horarioTurno } from '@/services/bitacora/turnoMantencion'
import { codigoEquipoDe, horarioEvento, tituloDe } from '@/services/bitacora/presentacionEvento'
import { autorVisible, type EventoBitacora, type FotoEvento, type TurnoMantencion } from '@/services/bitacora/bitacora.types'
import {
  TEXTO_LIBERACION,
  frasePorLiberacion,
  titularLiberacion,
  type Inspeccion,
  type PautaInspeccion,
  type ResultadoCriterio,
  type ResumenInspeccion,
} from './modeloInspeccion'

/**
 * La inspección de planta como cuerpo de correo, con el MISMO formato que la bitácora del
 * turno (Orel, 21-09-2026: «debe generarse como se genera en turno»). Reusa sus colores,
 * tipografía y bloques desde `bitacoraCorreo`, así que las dos se ven de la misma familia y
 * pegan igual en Outlook: todo el estilo en línea y la estructura en `<table>`.
 *
 * El contenido sigue el procedimiento, no el gusto:
 *  - §10 «Criterio de liberación» → la tabla de los 7 puntos con Conforme / No conforme.
 *  - §8 «Registro de desviaciones» → una fila por desviación con las SEIS columnas que pide:
 *    equipo o área · descripción · condición encontrada · acción realizada o pendiente ·
 *    responsable · estado.
 *  - §9/§10 «Resultado final» → el recuadro de cierre con hora y responsable.
 */

export interface DatosCorreoInspeccion {
  inspeccion: Inspeccion
  pauta: PautaInspeccion
  resumen: ResumenInspeccion
  desviaciones: readonly EventoBitacora[]
  turno: TurnoMantencion
  planta: string
  /**
   * Por defecto las fotos van por URL (Outlook clásico las descarga al pegar). La variante
   * incrustada en base64 existe solo para Outlook nuevo/web, que sí las acepta.
   */
  fuenteFoto?: (foto: FotoEvento) => string
}

const abierta = (e: EventoBitacora) => e.pendiente && !e.cierre

/**
 * `HH:mm` de un ISO, o cadena vacía si no hay hora.
 *
 * ⚠ Vacío, NO un guion ni la hora de ahora: si el punto se marcó sin hora, el correo no
 * inventa una (Orel, 21-09-2026). Quien lee tiene que poder distinguir «se revisó a las 04:16»
 * de «se revisó, no sabemos a qué hora».
 */
function hora(iso: string | undefined | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function tituloCorreoInspeccion({ turno, planta }: Pick<DatosCorreoInspeccion, 'turno' | 'planta'>): string {
  return `Inspección de planta post-aseo · ${planta} · ${etiquetaTurno(turno)} ${turno.fecha.split('-').reverse().join('-')}`
}

/**
 * El estado, como un punto de color y su palabra. Antes cada celda iba pintada entera: seis
 * bloques de color por tabla, que es lo que le da a un documento ese aire de tablero generado
 * en serie. El color marca, la palabra dice — igual que los KPI de la bitácora, que ya llevan
 * el punto en el rótulo y la cifra en tinta
 * (HIG «Color»: https://developer.apple.com/design/human-interface-guidelines/color).
 */
function celdaTono(texto: string, color: string): string {
  return (
    `<td style="padding:6px 10px;border:1px solid ${C.linea};font-family:${FUENTE};font-size:13px;` +
    `color:${C.tinta};white-space:nowrap;"><span style="color:${color};">●</span> ${texto}</td>`
  )
}

/** El estado del punto con el color que le toca. */
function celdaEstado(estado: ResultadoCriterio | undefined): string {
  const [texto, color] =
    estado === 'conforme'
      ? ['Conforme', C.ventana]
      : // Se encontró algo y se resolvió antes de entregar: libera, pero no es lo mismo que
        // un punto que estaba bien (§8, «corregidas o controladas antes de la puesta en marcha»).
        estado === 'corregido'
        ? ['Corregido', C.afectado]
        : // La otra mitad de §8: sigue mal, pero opera con una medida transitoria.
          estado === 'controlado'
          ? ['Controlado', C.pendBorde]
          : estado === 'no-conforme'
            ? ['No conforme', C.parada]
            : ['Sin revisar', C.sec]
  return celdaTono(texto, color)
}

/**
 * El estado de una DESVIACIÓN (§8). Antes decía «No conforme» en todas, incluso en las ya
 * resueltas: la columna no estaba diciendo nada. Sale de lo que el evento y su punto guardan.
 */
function celdaEstadoDesviacion(e: EventoBitacora, inspeccion: Inspeccion): string {
  if (!abierta(e)) return celdaTono('Resuelta', C.ventana)
  return inspeccion.resultados[e.inspeccion?.criterioId ?? ''] === 'controlado'
    ? celdaTono('Controlada', C.pendBorde)
    : celdaTono('Pendiente', C.parada)
}

function celda(texto: string, ancho?: string, gris?: boolean): string {
  return (
    `<td style="padding:6px 10px;border:1px solid ${C.linea};font-family:${FUENTE};font-size:13px;` +
    `color:${gris ? C.sec : C.tinta};vertical-align:top;${ancho ? `width:${ancho};` : ''}">${escaparHtml(texto) || '—'}</td>`
  )
}

/** Una hora: cifras tabulares para que las columnas se lean en vertical (HIG «Typography»). */
function celdaHora(hhmm: string, ancho: string): string {
  return (
    `<td style="padding:6px 10px;border:1px solid ${C.linea};font-family:${FUENTE};font-size:13px;` +
    `color:${C.sec};vertical-align:top;white-space:nowrap;font-variant-numeric:tabular-nums;width:${ancho};">` +
    `${escaparHtml(hhmm) || '—'}</td>`
  )
}

/** Una celda cuyo contenido ya viene armado (para meterle más de una línea). */
function celdaHtml(html: string, ancho?: string): string {
  return (
    `<td style="padding:6px 10px;border:1px solid ${C.linea};font-family:${FUENTE};font-size:13px;` +
    `color:${C.tinta};vertical-align:top;${ancho ? `width:${ancho};` : ''}">${html}</td>`
  )
}

function encabezadoTabla(columnas: readonly string[]): string {
  return (
    `<tr>${columnas
      .map(
        (t) =>
          `<th align="left" style="padding:6px 10px;border:1px solid ${C.linea};background:${C.neutroFondo};` +
          `font-family:${FUENTE};font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;` +
          `color:${C.sec};">${escaparHtml(t)}</th>`,
      )
      .join('')}</tr>`
  )
}

/**
 * «Acción realizada o pendiente» (§8). No se inventa: sale de lo que el evento ya guarda —
 * si está resuelto, con cuánto tardó; si no, que queda para el turno siguiente.
 */
function accionDe(e: EventoBitacora, inspeccion: Inspeccion): string {
  if (abierta(e)) {
    return inspeccion.resultados[e.inspeccion?.criterioId ?? ''] === 'controlado'
      ? 'Contingencia aplicada. Falta la solución final, queda para el turno siguiente'
      : 'Pendiente, queda para el turno siguiente'
  }
  const h = horarioEvento(e)
  return h ? `Resuelta (${h})` : 'Resuelta'
}

export function inspeccionAHtmlCorreo({ inspeccion, pauta, resumen: vivo, desviaciones, turno, planta, fuenteFoto }: DatosCorreoInspeccion): string {
  const l = inspeccion.liberacion
  const fuente = fuenteFoto ?? ((f: FotoEvento) => f.url)
  // Entregada: manda la FOTO de ese momento. Sin foto (entregas anteriores a este cambio) o
  // sin entregar todavía, el resumen en vivo.
  const resumen = l?.resumen ?? vivo
  const cambios = l?.resumen ? cambiosDesdeLaEntrega(l.resumen, vivo) : ''

  const encabezado =
    `<div style="font-family:${FUENTE};font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.marca};">` +
    `${escaparHtml(pauta.nombre)} · ${escaparHtml(planta)}</div>` +
    `<div style="font-family:${FUENTE};font-size:21px;font-weight:600;color:${C.tinta};padding-top:2px;">` +
    `${escaparHtml(etiquetaTurno(turno))} · ${escaparHtml(fechaTurnoLarga(turno))}</div>` +
    `<div style="font-family:${FUENTE};font-size:13px;color:${C.sec};padding-top:2px;">` +
    `${escaparHtml(horarioTurno(turno).replace('–', 'a'))} · Realizada por ${escaparHtml(inspeccion.iniciadaPorNombre)}` +
    `${hora(inspeccion.iniciadaEn) ? ` · Inicio ${hora(inspeccion.iniciadaEn)}` : ''} · Pauta v${inspeccion.pautaVersion}</div>`

  const kpis = [
    htmlKpi(`${resumen.revisados} de ${resumen.total}`, 'puntos revisados'),
    resumen.corregidos > 0
      ? htmlKpi(String(resumen.corregidos), resumen.corregidos === 1 ? 'corregido' : 'corregidos', C.afectado)
      : '',
    // El trabajo que hizo que la planta produjera igual: sin esto el correo solo cuenta la falla.
    resumen.controlados > 0
      ? htmlKpi(String(resumen.controlados), resumen.controlados === 1 ? 'con contingencia' : 'con contingencia', C.pendBorde)
      : '',
    htmlKpi(String(resumen.noConformes), resumen.noConformes === 1 ? 'no conforme' : 'no conformes', resumen.noConformes ? C.parada : undefined),
    resumen.desviaciones > 0
      ? htmlKpi(String(resumen.desviaciones), resumen.desviaciones === 1 ? 'desviación' : 'desviaciones')
      : '',
    // La CORRIDA: lo que se alcanzó a arreglar antes de entregar. Es el trabajo que no se ve.
    resumen.minutosDeCorrida != null ? htmlKpi(`${resumen.minutosDeCorrida} min`, 'corrigiendo antes de arrancar', C.ventana) : '',
    resumen.pendientesCriticos > 0
      ? htmlKpi(String(resumen.pendientesCriticos), resumen.pendientesCriticos === 1 ? 'crítica abierta' : 'críticas abiertas', C.parada)
      : '',
    resumen.minutosDeRecorrido ? htmlKpi(`${resumen.minutosDeRecorrido} min`, 'de recorrido') : '',
  ].join('')

  /**
   * Las desviaciones ordenadas POR PUNTO DE LA PAUTA. Un punto puede tener varias, y hasta
   * ahora el correo las tiraba todas en una lista suelta: «Sistema eléctrico: No conforme» con
   * la observación vacía arriba, y abajo un evento que no se sabía de dónde salía
   * (Orel, 21-09-2026). Van enlazadas en los dos sentidos.
   */
  const porCriterio = new Map<string, EventoBitacora[]>()
  for (const e of desviaciones) {
    const k = e.inspeccion?.criterioId ?? ''
    porCriterio.set(k, [...(porCriterio.get(k) ?? []), e])
  }
  /** Las que no calzan con ningún punto (la pauta cambió, o el evento llegó sin criterio). */
  const sueltas = desviaciones.filter((e) => !pauta.criterios.some((c) => c.id === e.inspeccion?.criterioId))

  // §10 · Criterio de liberación. La columna Hora solo existe si ALGÚN punto tiene hora: una
  // columna entera de guiones no informa, estorba.
  const hayHoras = pauta.criterios.some((c) => hora(inspeccion.marcas?.[c.id]))
  const filasCriterios = pauta.criterios
    .map((c) => {
      const nota = (inspeccion.notas?.[c.id] ?? '').trim()
      const suyas = porCriterio.get(c.id) ?? []
      // La observación del punto no puede quedar en blanco cuando SÍ hubo algo: si no se
      // escribió una nota, lo dicen las desviaciones que cuelgan de él.
      const cuerpo =
        [
          nota ? `<div>${escaparHtml(nota)}</div>` : '',
          suyas.length
            ? `<div style="font-size:12px;color:${C.sec};${nota ? 'padding-top:3px;' : ''}">` +
              `${suyas.length} ${suyas.length === 1 ? 'desviación' : 'desviaciones'}: ` +
              `${escaparHtml(suyas.map((e) => e.equipo || tituloDe(e) || 'sin equipo').join(' · '))}</div>`
            : '',
        ]
          .filter(Boolean)
          .join('') || `<span style="color:${C.sec};">—</span>`
      return (
        `<tr>${celda(c.titulo, '34%')}${celdaEstado(inspeccion.resultados[c.id])}` +
        (hayHoras ? celdaHora(hora(inspeccion.marcas?.[c.id]), '12%') : '') +
        celdaHtml(cuerpo) +
        `</tr>`
      )
    })
    .join('')

  const tablaCriterios =
    htmlSeccion('Criterio de liberación', null, C.marca) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:8px;">` +
    encabezadoTabla(['Punto de la pauta', 'Estado', ...(hayHoras ? ['Hora'] : []), 'Observación']) +
    filasCriterios +
    `</table>`

  // §8 · Registro de desviaciones, AGRUPADO por punto de la pauta: un punto puede tener
  // varias, y una fila suelta no deja saber de dónde salió.
  const filaDesviacion = (e: EventoBitacora) => {
    const equipo = [e.equipo || 'Sin equipo', codigoEquipoDe(e)].filter(Boolean).join(' · ')
    const fila =
      `<tr>${celda(equipo, '20%')}${celda(tituloDe(e) || e.descripcion, '22%')}${celda(e.descripcion, '26%')}` +
      celda(accionDe(e, inspeccion), '16%') +
      celda(autorVisible(e), '16%') +
      celdaEstadoDesviacion(e, inspeccion) +
      `</tr>`
    // La «condición encontrada» de §8 se ve mejor que se cuenta: antes y después van juntos.
    const fotos = (e.fotos ?? []).length
      ? `<tr><td colspan="6" style="padding:0 10px 10px;border:1px solid ${C.linea};border-top:0;">` +
        htmlFotos(e.fotos ?? [], fuente) +
        `</td></tr>`
      : ''
    return fila + fotos
  }

  const grupo = (titulo: string, cuantas: number) =>
    `<tr><td colspan="6" style="padding:7px 10px;border:1px solid ${C.linea};background:${C.neutroFondo};` +
    `font-family:${FUENTE};font-size:12px;font-weight:700;color:${C.tinta};">${escaparHtml(titulo)}` +
    `<span style="font-weight:400;color:${C.sec};"> · ${cuantas} ${cuantas === 1 ? 'desviación' : 'desviaciones'}</span></td></tr>`

  const filasDesviaciones =
    pauta.criterios
      .map((c) => {
        const suyas = porCriterio.get(c.id) ?? []
        return suyas.length ? grupo(c.titulo, suyas.length) + suyas.map(filaDesviacion).join('') : ''
      })
      .join('') + (sueltas.length ? grupo('Sin punto de la pauta', sueltas.length) + sueltas.map(filaDesviacion).join('') : '')

  const tablaDesviaciones = desviaciones.length
    ? htmlSeccion('Registro de desviaciones', desviaciones.length, C.pendBorde) +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:8px;">` +
      encabezadoTabla(['Equipo o área', 'Anomalía', 'Condición encontrada', 'Acción realizada o pendiente', 'Responsable', 'Estado']) +
      filasDesviaciones +
      `</table>`
    : htmlSeccion('Registro de desviaciones', null, resumen.noConformesSinDesviacion ? C.pendBorde : C.linea) +
      `<p style="font-family:${FUENTE};font-size:14px;color:${C.sec};margin:8px 0 0;">` +
      (resumen.noConformesSinDesviacion
        ? // Decirlo es lo unico honesto: el punto quedo abierto y no se anoto nada.
          `${resumen.noConformesSinDesviacion} ${resumen.noConformesSinDesviacion === 1 ? 'punto quedó' : 'puntos quedaron'} sin resolver y sin una desviación anotada. Ver el criterio de liberación, arriba.`
        : 'Sin desviaciones detectadas durante la inspección.') +
      `</p>`

  const sinJuzgar = resumen.sinEvaluar
    ? `<div style="font-family:${FUENTE};background:${C.pendFondo};border-left:3px solid ${C.pendBorde};padding:8px 12px;margin-top:10px;font-size:13px;color:${C.tinta};">` +
      `<b>Sin evaluar.</b> ${resumen.sinEvaluar} ${resumen.sinEvaluar === 1 ? 'desviación abierta no calza' : 'desviaciones abiertas no calzan'} con ningún equipo del diagrama de líneas, ` +
      `así que no se sabe si ${resumen.sinEvaluar === 1 ? 'detiene' : 'detienen'} una línea.</div>`
    : ''

  const aviso = resumen.pendientesCriticos
    ? `<div style="font-family:${FUENTE};background:${C.critFondo};border-left:3px solid ${C.parada};padding:8px 12px;margin-top:10px;font-size:13px;color:${C.tinta};">` +
      `<b>Atención.</b> ${resumen.pendientesCriticos} ${resumen.pendientesCriticos === 1 ? 'desviación abierta detiene' : 'desviaciones abiertas detienen'} una línea de proceso.</div>`
    : ''

  // §10 · Resultado final.
  const resultado = l
    ? htmlSeccion('Resultado final', null, l.estado === 'no-liberada' ? C.parada : C.ventana) +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:8px;">` +
      `<tr><td style="padding:12px 14px;border:1px solid ${C.linea};background:${l.estado === 'no-liberada' ? C.critFondo : C.okFondo};font-family:${FUENTE};">` +
      `<div style="font-size:19px;font-weight:600;color:${l.estado === 'no-liberada' ? C.parada : C.ventana};">` +
      `${escaparHtml(titularLiberacion(l.estado))}</div>` +
      `<div style="font-size:13.5px;color:${C.tinta};padding-top:5px;">` +
      `<b style="font-weight:600;">${escaparHtml(TEXTO_LIBERACION[l.estado].titulo)}.</b> ${escaparHtml(frasePorLiberacion(l.estado, resumen))}</div>` +
      `<div style="font-size:12.5px;color:${C.sec};padding-top:7px;">Entregada${hora(l.en) ? ` a las ${hora(l.en)}` : ''} por ${escaparHtml(l.porNombre)}` +
      `${l.nota ? ` · ${escaparHtml(l.nota)}` : ''}</div>` +
      `</td></tr></table>`
    : // Sin entrega marcada el correo NO puede decir que la planta está entregada; pero tampoco
      // puede quedarse en una frase gris que se lee como «la planta está parada». Es un aviso
      // al que lo está por enviar: falta un paso en la app (Orel, 21-09-2026).
      htmlSeccion('Resultado final', null, C.pendBorde) +
      `<div style="font-family:${FUENTE};background:${C.pendFondo};border-left:3px solid ${C.pendBorde};padding:10px 12px;margin-top:8px;font-size:13px;color:${C.tinta};">` +
      `<b>Falta marcar la entrega de la planta.</b> El recorrido está registrado; todavía no se dice en qué condición quedó la planta ` +
      `al pasar a Producción. Se marca en la app, en «Liberación de planta».</div>`

  /**
   * Qué hay DETRÁS de cada punto. «Sistema eléctrico: Conforme» no le dice nada a quien no
   * recorrió la pauta; el procedimiento sí lo detalla (§§3-7). Va al final y en letra chica:
   * es material de consulta para el que quiera verificar qué se revisó, no parte del resumen
   * (Orel, 21-09-2026).
   */
  const queSeRevisa =
    `<div style="font-family:${FUENTE};border-top:1px solid ${C.linea};margin-top:18px;padding-top:10px;">` +
    `<div style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${C.sec};">` +
    `Qué se revisa en cada punto</div>` +
    pauta.criterios
      .map(
        (c) =>
          `<div style="font-size:11.5px;line-height:1.45;color:${C.sec};padding-top:5px;">` +
          `<b style="color:${C.tinta};">${escaparHtml(c.titulo)}.</b> ${escaparHtml(c.ayuda)}</div>`,
      )
      .join('') +
    `<div style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${C.sec};padding-top:12px;">` +
    `Qué dice cada estado</div>` +
    [
      ['Conforme', C.ventana, 'se revisó y estaba bien'],
      ['Corregido', C.afectado, 'se encontró algo y se resolvió antes de entregar'],
      ['Controlado', C.pendBorde, 'sigue abierto; se opera con una medida transitoria'],
      ['No conforme', C.parada, 'sigue abierto, sin contingencia'],
    ]
      .map(
        ([nombre, color, que]) =>
          `<div style="font-size:11.5px;line-height:1.45;color:${C.sec};padding-top:4px;">` +
          `<span style="color:${color};">●</span> <b style="color:${C.tinta};font-weight:600;">${nombre}</b> · ${que}</div>`,
      )
      .join('') +
    `</div>`

  const pie =
    `<div style="font-family:${FUENTE};font-size:11px;color:${C.sec};padding-top:16px;">` +
    `Generado con la app de Mantención · ${escaparHtml(etiquetaTurno(turno))} ${escaparHtml(turno.fecha.split('-').reverse().join('-'))}` +
    ` · Las desviaciones quedan también en la bitácora del turno.</div>`

  return `<div style="max-width:680px;color:${C.tinta};">${encabezado}` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:12px 0 4px;"><tr>${kpis}</tr></table>` +
    `${tablaCriterios}${tablaDesviaciones}${aviso}${sinJuzgar}${resultado}${cambios}${queSeRevisa}${pie}</div>`
}

/**
 * Lo que cambió DESPUÉS de entregar la planta. No reescribe la entrega —esa es una foto— pero
 * tampoco la deja incompleta: si un pendiente se cerró al día siguiente, se dice aparte.
 */
function cambiosDesdeLaEntrega(foto: ResumenInspeccion, ahora: ResumenInspeccion): string {
  const partes: string[] = []
  const cerradas = foto.pendientes - ahora.pendientes
  if (cerradas > 0) partes.push(`${cerradas} ${cerradas === 1 ? 'pendiente se resolvió' : 'pendientes se resolvieron'}`)
  const nuevas = ahora.desviaciones - foto.desviaciones
  if (nuevas > 0) partes.push(`${nuevas} ${nuevas === 1 ? 'desviación nueva' : 'desviaciones nuevas'}`)
  if (!partes.length) return ''
  return (
    `<div style="font-family:${FUENTE};font-size:12.5px;color:${C.sec};padding-top:10px;border-top:1px solid ${C.linea};margin-top:12px;">` +
    `Después de la entrega: ${escaparHtml(partes.join(' · '))}. Los números de arriba son los del momento de liberar.</div>`
  )
}

/** La misma inspección en texto plano, para el cuerpo alterno del correo y para WhatsApp. */
export function inspeccionATextoPlano({ inspeccion, pauta, resumen: vivo, desviaciones, turno, planta }: DatosCorreoInspeccion): string {
  const l = inspeccion.liberacion
  const resumen = l?.resumen ?? vivo
  const etiqueta = (id: string) => {
    const r = inspeccion.resultados[id]
    return r === 'conforme'
      ? 'Conforme'
      : r === 'corregido'
        ? 'Corregido'
        : r === 'controlado'
          ? 'Controlado'
          : r === 'no-conforme'
            ? 'No conforme'
            : 'Sin revisar'
  }

  const partes: string[] = [
    `${pauta.nombre.toUpperCase()} · ${planta}`,
    `${etiquetaTurno(turno)} · ${fechaTurnoLarga(turno)}`,
    `Realizada por ${inspeccion.iniciadaPorNombre}${hora(inspeccion.iniciadaEn) ? ` · Inicio ${hora(inspeccion.iniciadaEn)}` : ''} · Pauta v${inspeccion.pautaVersion}`,
    '',
    'CRITERIO DE LIBERACIÓN',
    ...pauta.criterios.map((c) => {
      const nota = (inspeccion.notas?.[c.id] ?? '').trim()
      const h = hora(inspeccion.marcas?.[c.id])
      const suyas = desviaciones.filter((e) => e.inspeccion?.criterioId === c.id)
      const cuelgan = suyas.length ? `. ${suyas.length} ${suyas.length === 1 ? 'desviación' : 'desviaciones'} en el registro` : ''
      return `- ${c.titulo}: ${etiqueta(c.id)}${h ? ` (${h})` : ''}${nota ? `. ${nota}` : ''}${cuelgan}`
    }),
    '',
    'REGISTRO DE DESVIACIONES',
  ]

  if (!desviaciones.length) {
    partes.push(
      resumen.noConformesSinDesviacion
        ? `${resumen.noConformesSinDesviacion} ${resumen.noConformesSinDesviacion === 1 ? 'punto quedó' : 'puntos quedaron'} sin resolver y sin una desviación anotada.`
        : 'Sin desviaciones detectadas durante la inspección.',
    )
  }
  else {
    // Agrupadas por punto de la pauta, igual que en el HTML: una desviación suelta no deja
    // saber de qué punto salió.
    const linea = (e: EventoBitacora) => {
      const fotos = (e.fotos ?? []).length
      return (
        `  - ${[e.equipo || 'Sin equipo', codigoEquipoDe(e)].filter(Boolean).join(' · ')}: ${e.descripcion}` +
        ` | ${accionDe(e, inspeccion)} | ${autorVisible(e)}` +
        (fotos ? ` | ${fotos} ${fotos === 1 ? 'foto' : 'fotos'}` : '')
      )
    }
    for (const c of pauta.criterios) {
      const suyas = desviaciones.filter((e) => e.inspeccion?.criterioId === c.id)
      if (suyas.length) partes.push(`${c.titulo}:`, ...suyas.map(linea))
    }
    const sueltas = desviaciones.filter((e) => !pauta.criterios.some((c) => c.id === e.inspeccion?.criterioId))
    if (sueltas.length) partes.push('Sin punto de la pauta:', ...sueltas.map(linea))
  }

  if (resumen.sinEvaluar) {
    const n = resumen.sinEvaluar
    partes.push(
      '',
      `Sin evaluar: ${n} ${n === 1 ? 'desviación abierta no calza' : 'desviaciones abiertas no calzan'} con ningún equipo del diagrama de líneas.`,
    )
  }
  if (resumen.pendientesCriticos) {
    partes.push('', `Atención: ${resumen.pendientesCriticos} ${resumen.pendientesCriticos === 1 ? 'desviación abierta detiene' : 'desviaciones abiertas detienen'} una línea de proceso.`)
  }

  partes.push('', 'RESULTADO FINAL')
  partes.push(
    l
      ? `${titularLiberacion(l.estado)}\n` +
        `${TEXTO_LIBERACION[l.estado].titulo}. ${frasePorLiberacion(l.estado, resumen)}\n` +
        `Entregada${hora(l.en) ? ` a las ${hora(l.en)}` : ''} por ${l.porNombre}`
      : 'Falta marcar la entrega de la planta. El recorrido está registrado; todavía no se dice en qué condición quedó la planta al pasar a Producción.',
  )
  partes.push('', `${resumen.revisados} de ${resumen.total} puntos revisados${resumen.minutosDeRecorrido != null ? ` en ${resumen.minutosDeRecorrido} min` : ''}.`)
  partes.push('', 'QUÉ SE REVISA EN CADA PUNTO', ...pauta.criterios.map((c) => `- ${c.titulo}: ${c.ayuda}`))
  return partes.join('\n')
}
