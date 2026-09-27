import type { EventoBitacora } from './bitacora.types'
import { filasRecoleccionPeriodo, htmlRecoleccionMttr } from './recoleccionMttr'
import { explicacionMtbfMttrPeriodo } from './mtbf'
import { escaparHtml } from './bitacoraCorreo'
import { etiquetaCortaTurno } from './entregaTurno'
import { formatoMinutos } from './turnoMantencion'
import { lineaRepuestoDelPeriodo, parteParada, porcentaje, porcentajeFino, tesisDelPeriodo, type FilaTurno, type ResumenPeriodo } from './historialBitacora'

/**
 * Resumen del período para pegar en el correo (informe semanal a jefatura).
 * Mismas reglas que el correo del turno: estilos en línea y tablas, que es lo
 * único que respeta Outlook al pegar.
 */

const FUENTE = "'Segoe UI', Calibri, Arial, sans-serif"
const C = { tinta: '#1F1F1F', sec: '#5F6368', linea: '#E3E3E3', parada: '#B3261E', ventana: '#1E7B34' }

const fechaCorta = (f: string) => f.split('-').slice(1).reverse().join('-')
const fechaConAnio = (f: string) => f.split('-').reverse().join('-')

/**
 * "04-09 al 17-09-2026": el resumen se archiva, así que el año va siempre; una
 * sola vez si el período cae en un mismo año, en las dos fechas si lo cruza.
 */
export function rangoDelPeriodo(desde: string, hasta: string): string {
  return desde.slice(0, 4) === hasta.slice(0, 4)
    ? `${fechaCorta(desde)} al ${fechaConAnio(hasta)}`
    : `${fechaConAnio(desde)} al ${fechaConAnio(hasta)}`
}

export function tituloHistorial(r: ResumenPeriodo): string {
  return `Bitácora de Mantención · Resumen ${rangoDelPeriodo(r.desde, r.hasta)}`
}

function kpi(valor: string, etiqueta: string, color = C.tinta): string {
  return (
    `<td style="padding:8px 12px;border:1px solid ${C.linea};vertical-align:top;font-family:${FUENTE};">` +
    `<div style="font-size:18px;font-weight:600;color:${color};white-space:nowrap;">${escaparHtml(valor)}</div>` +
    `<div style="font-size:12px;color:${C.sec};">${escaparHtml(etiqueta)}</div></td>`
  )
}

/** "Turno tarde 15-09" o "Turno tarde 15-09 (en curso)" si todavía corre. */
export function etiquetaFilaTurno(f: FilaTurno): string {
  return f.enCurso ? `${etiquetaCortaTurno(f.turnoId)} (en curso)` : etiquetaCortaTurno(f.turnoId)
}

export function historialAHtmlCorreo(r: ResumenPeriodo, filas: readonly FilaTurno[], planta: string, eventos: readonly EventoBitacora[] = []): string {
  // La planilla «Recoleccion MTTR» del período arriba, como en el correo del turno (17-09-2026).
  const recoleccion = eventos.length
    ? `${htmlRecoleccionMttr(filasRecoleccionPeriodo(eventos))}` +
      `<div style="font-family:${FUENTE};font-size:12.5px;color:${C.sec};padding-top:6px;">${escaparHtml(explicacionMtbfMttrPeriodo(r.minutosTurnos, r.turnos, r))}</div>` +
      `<div style="height:14px;line-height:14px;">&nbsp;</div>`
    : ''
  const cabecera =
    `<div style="font-family:${FUENTE};font-size:20px;font-weight:600;color:${C.tinta};">${escaparHtml(tituloHistorial(r))}</div>` +
    `<div style="font-family:${FUENTE};font-size:13px;color:${C.sec};padding-top:2px;">${r.turnos} turnos registrados · ${escaparHtml(planta)}</div>` +
    `<div style="font-family:${FUENTE};font-size:16px;font-weight:600;color:${C.ventana};padding:10px 0 2px;">${escaparHtml(tesisDelPeriodo(r))}</div>`

  const kpis =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0 4px;"><tr>` +
    kpi(String(r.eventos), r.eventos === 1 ? 'evento' : 'eventos') +
    kpi(formatoMinutos(r.minutosParada), `de parada (${r.conParada})${parteParada(r) != null ? ` · ${porcentajeFino(parteParada(r)!)} del tiempo de producción` : ''}`, r.minutosParada > 0 ? C.parada : C.tinta) +
    kpi(r.mttrMin == null ? '—' : formatoMinutos(r.mttrMin), 'MTTR') +
    kpi(r.mtbfMin == null ? '—' : formatoMinutos(r.mtbfMin), 'MTBF') +
    kpi(
      r.conImpacto > 0 ? `${r.sinDetener} · ${porcentaje(r.parteSinDetener)}` : String(r.sinDetener),
      'sin detener producción',
      r.sinDetener > 0 ? C.ventana : C.tinta,
    ) +
    kpi(String(r.pendientesCerrados), 'pendientes cerrados', r.pendientesCerrados > 0 ? C.ventana : C.tinta) +
    kpi(String(r.pendientesAbiertos), 'pendientes abiertos') +
    kpi(String(r.repuestos.length), r.repuestos.length === 1 ? 'repuesto usado' : 'repuestos usados') +
    kpi(String(r.unidadesRepuestos), 'unidades') +
    `</tr></table>`

  const celda = (t: string, extra = '') => `<td style="border:1px solid ${C.linea};padding:6px 10px;font-size:13px;${extra}">${escaparHtml(t)}</td>`
  const tabla = filas.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;font-family:${FUENTE};">` +
      `<tr>${['Turno', 'Eventos', 'Parada', 'Sin detener', 'Pendientes']
        .map((h) => `<th style="border:1px solid ${C.linea};padding:6px 10px;font-size:12px;color:${C.sec};text-align:left;">${h}</th>`)
        .join('')}</tr>` +
      filas
        .map((f) =>
          `<tr>${celda(etiquetaFilaTurno(f))}${celda(String(f.resumen.eventos))}${celda(
            f.resumen.conParada ? formatoMinutos(f.resumen.minutosParada) : '—',
            f.resumen.minutosParada > 0 ? `color:${C.parada};` : '',
          )}${celda(String(f.resumen.enVentana))}${celda(
            f.pendientesAbiertos ? `${f.pendientesAbiertos} abierto${f.pendientesAbiertos === 1 ? '' : 's'}` : '—',
          )}</tr>`,
        )
        .join('') +
      `</table>`
    : `<p style="font-family:${FUENTE};font-size:14px;color:${C.sec};">Sin turnos registrados en el período.</p>`

  const equipos = r.equipos.length
    ? `<div style="font-family:${FUENTE};font-size:15px;font-weight:600;color:${C.tinta};padding-top:14px;">Equipos que más pararon</div>` +
      r.equipos
        .map(
          (e) =>
            `<div style="font-family:${FUENTE};font-size:13px;color:${C.tinta};padding-top:3px;">${escaparHtml(e.equipo)} · ${escaparHtml(
              formatoMinutos(e.minutos),
            )} en ${e.paradas} ${e.paradas === 1 ? 'parada' : 'paradas'} · ${porcentaje(e.parte)} del total${
              e.mtbfMin == null ? '' : ` · MTBF ${escaparHtml(formatoMinutos(e.mtbfMin))}`
            }</div>`,
        )
        .join('')
    : ''

  const repuestos = r.repuestos.length
    ? `<div style="font-family:${FUENTE};font-size:15px;font-weight:600;color:${C.tinta};padding-top:14px;">Repuestos usados</div>` +
      `<ul style="font-family:${FUENTE};font-size:13px;color:${C.tinta};margin:4px 0 0;padding-left:18px;">` +
      r.repuestos.map((x) => `<li style="padding:2px 0;">${escaparHtml(lineaRepuestoDelPeriodo(x))}</li>`).join('') +
      `</ul>`
    : ''

  const pie = `<div style="font-family:${FUENTE};font-size:11px;color:${C.sec};padding-top:16px;">Generado con la app de Mantención.</div>`
  return `${recoleccion}<div style="max-width:680px;color:${C.tinta};">${cabecera}${kpis}${tabla}${equipos}${repuestos}${pie}</div>`
}

export function historialATextoPlano(r: ResumenPeriodo, filas: readonly FilaTurno[], planta: string): string {
  return [
    `${tituloHistorial(r)}\n${r.turnos} turnos registrados · ${planta}`,
    tesisDelPeriodo(r),
    `${r.eventos} eventos · ${formatoMinutos(r.minutosParada)} de parada (${r.conParada}${parteParada(r) != null ? `, ${porcentajeFino(parteParada(r)!)} del tiempo de producción` : ''}) · MTTR ${
      r.mttrMin == null ? '—' : formatoMinutos(r.mttrMin)
    } · MTBF ${r.mtbfMin == null ? '—' : formatoMinutos(r.mtbfMin)} · ${r.sinDetener} sin detener${r.conImpacto > 0 ? ` (${porcentaje(r.parteSinDetener)})` : ''} · ${r.pendientesCerrados} pendientes cerrados · ${r.pendientesAbiertos} abiertos · ${
      r.repuestos.length
    } repuestos usados (${r.unidadesRepuestos} unidades)`,
    filas
      .map(
        (f) =>
          `${etiquetaFilaTurno(f)}: ${f.resumen.eventos} eventos · ${
            f.resumen.conParada ? formatoMinutos(f.resumen.minutosParada) : 'sin paradas'
          } · ${f.resumen.enVentana} sin detener${f.pendientesAbiertos ? ` · ${f.pendientesAbiertos} pendiente(s)` : ''}`,
      )
      .join('\n'),
    r.equipos.length
      ? ['EQUIPOS QUE MÁS PARARON', ...r.equipos.map((e) => `- ${e.equipo}: ${formatoMinutos(e.minutos)} en ${e.paradas} (${porcentaje(e.parte)})`)].join('\n')
      : '',
    r.repuestos.length ? ['REPUESTOS USADOS', ...r.repuestos.map((x) => `- ${lineaRepuestoDelPeriodo(x)}`)].join('\n') : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}
