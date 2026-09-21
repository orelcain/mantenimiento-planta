import { C, FUENTE, escaparHtml, htmlFotos, htmlKpi, htmlSeccion } from '@/services/bitacora/bitacoraCorreo'
import { etiquetaTurno, fechaTurnoLarga, horarioTurno } from '@/services/bitacora/turnoMantencion'
import { codigoEquipoDe, horarioEvento, tituloDe } from '@/services/bitacora/presentacionEvento'
import { autorVisible, type EventoBitacora, type FotoEvento, type TurnoMantencion } from '@/services/bitacora/bitacora.types'
import {
  TEXTO_LIBERACION,
  frasePorLiberacion,
  type Inspeccion,
  type PautaInspeccion,
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

/** `HH:mm` de un ISO, o guion si no se puede. */
function hora(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function tituloCorreoInspeccion({ turno, planta }: Pick<DatosCorreoInspeccion, 'turno' | 'planta'>): string {
  return `Inspección de planta post-aseo · ${planta} · ${etiquetaTurno(turno)} ${turno.fecha.split('-').reverse().join('-')}`
}

/** El estado del punto con el color que le toca. */
function celdaEstado(estado: string | undefined): string {
  const [texto, fondo, color] =
    estado === 'conforme'
      ? ['Conforme', C.okFondo, C.ventana]
      : // Se encontró algo y se resolvió antes de entregar: libera, pero no es lo mismo que
        // un punto que estaba bien (§8, «corregidas o controladas antes de la puesta en marcha»).
        estado === 'corregido'
        ? ['Corregido', C.pendFondo, C.afectado]
        : estado === 'no-conforme'
          ? ['No conforme', C.critFondo, C.parada]
          : ['Sin revisar', C.neutroFondo, C.sec]
  return (
    `<td style="padding:6px 10px;border:1px solid ${C.linea};background:${fondo};font-family:${FUENTE};` +
    `font-size:13px;font-weight:600;color:${color};white-space:nowrap;">${texto}</td>`
  )
}

function celda(texto: string, ancho?: string, gris?: boolean): string {
  return (
    `<td style="padding:6px 10px;border:1px solid ${C.linea};font-family:${FUENTE};font-size:13px;` +
    `color:${gris ? C.sec : C.tinta};vertical-align:top;${ancho ? `width:${ancho};` : ''}">${escaparHtml(texto) || '—'}</td>`
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
function accionDe(e: EventoBitacora): string {
  if (abierta(e)) return 'Pendiente — queda para el turno siguiente'
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
    ` · Inicio ${hora(inspeccion.iniciadaEn)} · Pauta v${inspeccion.pautaVersion}</div>`

  const kpis = [
    htmlKpi(`${resumen.revisados} de ${resumen.total}`, 'puntos revisados'),
    resumen.corregidos > 0
      ? htmlKpi(String(resumen.corregidos), resumen.corregidos === 1 ? 'corregido al pasar' : 'corregidos al pasar', C.afectado)
      : '',
    htmlKpi(String(resumen.noConformes), resumen.noConformes === 1 ? 'no conforme' : 'no conformes', resumen.noConformes ? C.parada : undefined),
    resumen.desviaciones > 0
      ? htmlKpi(String(resumen.desviaciones), resumen.desviaciones === 1 ? 'desviación' : 'desviaciones')
      : '',
    // La CORRIDA: lo que se alcanzó a arreglar antes de entregar. Es el trabajo que no se ve.
    resumen.minutosDeCorrida != null ? htmlKpi(`${resumen.minutosDeCorrida} min`, 'corrigiendo antes del arranque', C.ventana) : '',
    resumen.pendientesCriticos > 0
      ? htmlKpi(String(resumen.pendientesCriticos), resumen.pendientesCriticos === 1 ? 'crítica abierta' : 'críticas abiertas', C.parada)
      : '',
    resumen.minutosDeRecorrido ? htmlKpi(`${resumen.minutosDeRecorrido} min`, 'de recorrido') : '',
  ].join('')

  // §10 · Criterio de liberación.
  const filasCriterios = pauta.criterios
    .map((c) => {
      const nota = (inspeccion.notas?.[c.id] ?? '').trim()
      return (
        `<tr>${celda(c.titulo, '34%')}${celdaEstado(inspeccion.resultados[c.id])}` +
        celda(hora(inspeccion.marcas?.[c.id]), '12%', true) +
        celda(nota, undefined, !nota) +
        `</tr>`
      )
    })
    .join('')

  const tablaCriterios =
    htmlSeccion('Criterio de liberación', null, C.marca) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:8px;">` +
    encabezadoTabla(['Punto de la pauta', 'Estado', 'Hora', 'Observación']) +
    filasCriterios +
    `</table>`

  // §8 · Registro de desviaciones.
  const filasDesviaciones = desviaciones
    .map((e) => {
      const equipo = [e.equipo || 'Sin equipo', codigoEquipoDe(e)].filter(Boolean).join(' · ')
      const fila =
        `<tr>${celda(equipo, '20%')}${celda(tituloDe(e) || e.descripcion, '22%')}${celda(e.descripcion, '26%')}` +
        celda(accionDe(e), '16%') +
        celda(autorVisible(e), '16%') +
        celdaEstado('no-conforme') +
        `</tr>`
      // La «condición encontrada» de §8 se ve mejor que se cuenta: antes y después van juntos.
      const fotos = (e.fotos ?? []).length
        ? `<tr><td colspan="6" style="padding:0 10px 10px;border:1px solid ${C.linea};border-top:0;">` +
          htmlFotos(e.fotos ?? [], fuente) +
          `</td></tr>`
        : ''
      return fila + fotos
    })
    .join('')

  const tablaDesviaciones = desviaciones.length
    ? htmlSeccion('Registro de desviaciones', desviaciones.length, C.pendBorde) +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:8px;">` +
      encabezadoTabla(['Equipo o área', 'Anomalía', 'Condición encontrada', 'Acción realizada o pendiente', 'Responsable', 'Estado']) +
      filasDesviaciones +
      `</table>`
    : htmlSeccion('Registro de desviaciones', null, resumen.noConformesSinDesviacion ? C.pendBorde : C.linea) +
      `<p style="font-family:${FUENTE};font-size:14px;color:${C.sec};margin:8px 0 0;">` +
      (resumen.noConformesSinDesviacion
        ? // Decirlo es lo unico honesto: el punto quedo en no conforme y no se anoto nada.
          `${resumen.noConformesSinDesviacion} ${resumen.noConformesSinDesviacion === 1 ? 'punto quedó' : 'puntos quedaron'} en «no conforme» sin una desviación anotada. Ver el criterio de liberación, arriba.`
        : 'Sin desviaciones detectadas durante la inspección.') +
      `</p>`

  const sinJuzgar = resumen.sinEvaluar
    ? `<div style="font-family:${FUENTE};background:${C.pendFondo};border-left:3px solid ${C.pendBorde};padding:8px 12px;margin-top:10px;font-size:13px;color:${C.tinta};">` +
      `<b>Sin evaluar:</b> ${resumen.sinEvaluar} ${resumen.sinEvaluar === 1 ? 'desviación abierta no tiene' : 'desviaciones abiertas no tienen'} un equipo reconocible en el diagrama de líneas, ` +
      `así que no se pudo determinar si detienen una línea de proceso.</div>`
    : ''

  const aviso = resumen.pendientesCriticos
    ? `<div style="font-family:${FUENTE};background:${C.critFondo};border-left:3px solid ${C.parada};padding:8px 12px;margin-top:10px;font-size:13px;color:${C.tinta};">` +
      `<b>Atención:</b> ${resumen.pendientesCriticos} ${resumen.pendientesCriticos === 1 ? 'desviación abierta detiene' : 'desviaciones abiertas detienen'} una línea de proceso.</div>`
    : ''

  // §10 · Resultado final.
  const resultado = l
    ? htmlSeccion('Resultado final', null, l.estado === 'no-liberada' ? C.parada : C.ventana) +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin-top:8px;">` +
      `<tr><td style="padding:12px 14px;border:1px solid ${C.linea};background:${l.estado === 'no-liberada' ? C.critFondo : C.okFondo};font-family:${FUENTE};">` +
      `<div style="font-size:17px;font-weight:700;color:${l.estado === 'no-liberada' ? C.parada : C.ventana};">` +
      `${escaparHtml(l.estado === 'no-liberada' ? 'PLANTA NO LIBERADA — REQUIERE ACCIÓN CORRECTIVA' : 'PLANTA LIBERADA PARA OPERACIÓN')}</div>` +
      `<div style="font-size:13px;color:${C.tinta};padding-top:4px;">${escaparHtml(TEXTO_LIBERACION[l.estado].titulo)} — ${escaparHtml(frasePorLiberacion(l.estado, resumen))}</div>` +
      `<div style="font-size:12.5px;color:${C.sec};padding-top:6px;">Liberada ${hora(l.en)} · ${escaparHtml(l.porNombre)}` +
      `${l.nota ? ` · ${escaparHtml(l.nota)}` : ''}</div>` +
      `</td></tr></table>`
    : htmlSeccion('Resultado final', null, C.pendBorde) +
      `<p style="font-family:${FUENTE};font-size:14px;color:${C.sec};margin:8px 0 0;">La planta todavía no se ha liberado.</p>`

  const pie =
    `<div style="font-family:${FUENTE};font-size:11px;color:${C.sec};padding-top:16px;">` +
    `Generado con la app de Mantención · ${escaparHtml(etiquetaTurno(turno))} ${escaparHtml(turno.fecha.split('-').reverse().join('-'))}` +
    ` · Las desviaciones quedan también en la bitácora del turno.</div>`

  return `<div style="max-width:680px;color:${C.tinta};">${encabezado}` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:12px 0 4px;"><tr>${kpis}</tr></table>` +
    `${tablaCriterios}${tablaDesviaciones}${aviso}${sinJuzgar}${resultado}${cambios}${pie}</div>`
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
    return r === 'conforme' ? 'Conforme' : r === 'corregido' ? 'Corregido' : r === 'no-conforme' ? 'NO CONFORME' : 'Sin revisar'
  }

  const partes: string[] = [
    `${pauta.nombre.toUpperCase()} · ${planta}`,
    `${etiquetaTurno(turno)} · ${fechaTurnoLarga(turno)}`,
    `Realizada por ${inspeccion.iniciadaPorNombre} · Inicio ${hora(inspeccion.iniciadaEn)} · Pauta v${inspeccion.pautaVersion}`,
    '',
    'CRITERIO DE LIBERACIÓN',
    ...pauta.criterios.map((c) => {
      const nota = (inspeccion.notas?.[c.id] ?? '').trim()
      return `- ${c.titulo}: ${etiqueta(c.id)}${nota ? ` — ${nota}` : ''}`
    }),
    '',
    'REGISTRO DE DESVIACIONES',
  ]

  if (!desviaciones.length) {
    partes.push(
      resumen.noConformesSinDesviacion
        ? `${resumen.noConformesSinDesviacion} ${resumen.noConformesSinDesviacion === 1 ? 'punto quedó' : 'puntos quedaron'} en «no conforme» sin una desviación anotada.`
        : 'Sin desviaciones detectadas durante la inspección.',
    )
  }
  else {
    for (const e of desviaciones) {
      const fotos = (e.fotos ?? []).length
      partes.push(
        `- ${[e.equipo || 'Sin equipo', codigoEquipoDe(e)].filter(Boolean).join(' · ')}: ${e.descripcion}` +
          ` | ${accionDe(e)} | ${autorVisible(e)}` +
          (fotos ? ` | ${fotos} ${fotos === 1 ? 'foto' : 'fotos'}` : ''),
      )
    }
  }

  if (resumen.sinEvaluar) {
    partes.push('', `SIN EVALUAR: ${resumen.sinEvaluar} desviación(es) abierta(s) sin equipo reconocible en el diagrama.`)
  }
  if (resumen.pendientesCriticos) {
    partes.push('', `ATENCIÓN: ${resumen.pendientesCriticos} ${resumen.pendientesCriticos === 1 ? 'desviación abierta detiene' : 'desviaciones abiertas detienen'} una línea de proceso.`)
  }

  partes.push('', 'RESULTADO FINAL')
  partes.push(
    l
      ? `${l.estado === 'no-liberada' ? 'PLANTA NO LIBERADA — REQUIERE ACCIÓN CORRECTIVA' : 'PLANTA LIBERADA PARA OPERACIÓN'}\n` +
        `${TEXTO_LIBERACION[l.estado].titulo} — ${frasePorLiberacion(l.estado, resumen)}\n` +
        `Liberada ${hora(l.en)} · ${l.porNombre}`
      : 'La planta todavía no se ha liberado.',
  )
  partes.push('', `${resumen.revisados} de ${resumen.total} puntos revisados${resumen.minutosDeRecorrido != null ? ` en ${resumen.minutosDeRecorrido} min` : ''}.`)
  return partes.join('\n')
}
