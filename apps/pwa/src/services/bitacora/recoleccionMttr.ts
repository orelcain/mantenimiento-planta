import type { EventoBitacora, TurnoMantencion } from './bitacora.types'
import { soloListos } from './borradores'
import { LOGO_RECOLECCION_DATA_URI } from './logoRecoleccion'
import { etiquetaTipo, nombreConComun, normalizarRepuestos, tituloDe } from './presentacionEvento'
import { gruposDelTurno, minutosParadaDe } from './resumenBitacora'
import { etiquetaTurno, turnoDesdeId } from './turnoMantencion'

/**
 * La planilla «Recoleccion MTTR» que Mantención pega arriba del correo del
 * turno (pedido de Orel, 17-09-2026): la misma tabla, con el mismo aspecto,
 * llenada sola desde la bitácora. Una fila por evento publicado, en el orden
 * del correo (lo hecho y después lo pendiente).
 */
export interface FilaRecoleccion {
  /** «17-sept-2026 jue», solo en la primera fila de cada fecha, como la llenan ellos. */
  fecha: string
  /** La fecha completa (AAAA-MM-DD), para el Excel. */
  fechaIso: string
  maquina: string
  falla: string
  /** «35min», o «0» cuando no detuvo la máquina (así lo escriben). */
  duracion: string
  /** Minutos de parada, para la celda numérica del Excel. */
  minutos: number
  observaciones: string
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/** «2026-09-17» → «17-sept-2026 jue» (el formato `dd/mmm/yyyy ddd` de la planilla, en español de Chile). */
export function fechaRecoleccion(fechaIso: string): string {
  const [a, m, d] = fechaIso.split('-').map(Number)
  if (!a || !m || !d) return fechaIso
  const fecha = new Date(a, m - 1, d)
  return `${String(d).padStart(2, '0')}-${MESES[m - 1]}-${a} ${DIAS[fecha.getDay()]}`
}

/** «Falla» de la planilla: el título del evento; sin título, la primera frase de lo que escribió el técnico. */
function fallaDe(e: EventoBitacora): string {
  const titulo = tituloDe(e)
  if (titulo) return titulo
  // Hasta la primera coma o punto: la planilla lleva la falla en pocas palabras.
  const primera = (e.descripcion ?? '').trim().split(/(?<=[.;:,])\s|\n/)[0]?.trim().replace(/[.;:,]$/, '') ?? ''
  return primera ? (primera.length > 70 ? `${primera.slice(0, 67).trimEnd()}…` : primera) : etiquetaTipo(e)
}

function observacionesDe(e: EventoBitacora): string {
  const partes = [(e.descripcion ?? '').trim().replace(/\s*\n+\s*/g, ' ')]
  const repuestos = normalizarRepuestos(e.repuestos)
  if (repuestos.length) partes.push(`Repuestos: ${repuestos.map((r) => `${r.codigoSAP} ${nombreConComun(r)} ×${r.cantidad}`.replace(/\s+×/, ' ×')).join('; ')}.`)
  if (e.impacto === 'en-ventana') partes.push(e.ventana?.trim() ? `Sin detener: ${e.ventana.trim()}.` : 'Sin detener producción.')
  if (e.pendiente) partes.push('Queda pendiente para el turno siguiente.')
  return partes.filter(Boolean).join(' ')
}

function filaDe(e: EventoBitacora, fechaIso: string, conFecha: boolean): FilaRecoleccion {
  const minutos = e.impacto === 'con-parada' ? Math.max(0, Math.round(minutosParadaDe(e) ?? 0)) : 0
  return {
    fecha: conFecha ? fechaRecoleccion(fechaIso) : '',
    fechaIso,
    maquina: e.equipo?.trim() || etiquetaTipo(e),
    falla: fallaDe(e),
    duracion: minutos > 0 ? `${minutos}min` : '0',
    minutos,
    observaciones: observacionesDe(e),
  }
}

/** Las filas del turno: lo hecho y luego lo pendiente, la fecha solo en la primera. */
export function filasRecoleccion(turno: TurnoMantencion, eventos: readonly EventoBitacora[]): FilaRecoleccion[] {
  const { hechos, pendientes } = gruposDelTurno(turno, eventos)
  return [...hechos, ...pendientes].map((e, i) => filaDe(e, turno.fecha, i === 0))
}

/** Las filas de un período (historial): turno por turno, del más nuevo al más viejo. */
export function filasRecoleccionPeriodo(eventos: readonly EventoBitacora[]): FilaRecoleccion[] {
  const porTurno = new Map<string, EventoBitacora[]>()
  for (const e of soloListos(eventos)) {
    if (!e.turnoId) continue
    porTurno.set(e.turnoId, [...(porTurno.get(e.turnoId) ?? []), e])
  }
  const turnos = [...porTurno.keys()]
    .map((id) => turnoDesdeId(id))
    .filter((t): t is TurnoMantencion => Boolean(t))
    .sort((a, b) => b.inicio.getTime() - a.inicio.getTime())
  const filas: FilaRecoleccion[] = []
  let fechaAnterior = ''
  for (const t of turnos) {
    const { hechos, pendientes } = gruposDelTurno(t, porTurno.get(t.id) ?? [])
    for (const e of [...hechos, ...pendientes]) {
      filas.push(filaDe(e, t.fecha, t.fecha !== fechaAnterior))
      fechaAnterior = t.fecha
    }
  }
  return filas
}

// ── HTML con el aspecto exacto de la planilla ──
// Valores leídos del archivo: banda B1:E1 en #00557F con Calibri 16 blanca y 42 pt de alto;
// A1 gris #F2F2F2 con el logo a 13 px del borde; encabezados en #00557F, negrita, centrados;
// tabla «Captura» con estilo TableStyleMedium2 (bandas blanco / #D9E1F2); Fecha, Máquina,
// Falla y Duración centradas, Observaciones a la izquierda; anchos 146/184/317/171/929 px.
const CAL = "Calibri,'Segoe UI',sans-serif"
const AZUL = '#00557F'
const BANDA = '#D9E1F2'
const GRIS = '#F2F2F2'
const ANCHOS = { fecha: 112, maquina: 132, falla: 214, duracion: 96 }

export function htmlRecoleccionMttr(filas: readonly FilaRecoleccion[], opciones: { logo?: string } = {}): string {
  const logo = opciones.logo ?? LOGO_RECOLECCION_DATA_URI
  const th = (t: string, ancho?: number) =>
    `<th${ancho ? ` width="${ancho}"` : ''} style="${ancho ? `width:${ancho}px;` : ''}background:${AZUL};color:#FFFFFF;font-family:${CAL};font-size:10pt;font-weight:bold;text-align:center;vertical-align:bottom;padding:3px 4px;">${t}</th>`
  const td = (t: string, i: number, izq = false, nowrap = false) =>
    // TableStyleMedium2 pinta la PRIMERA fila de datos y luego alterna.
    `<td style="background:${i % 2 ? '#FFFFFF' : BANDA};color:#000000;font-family:${CAL};font-size:10pt;text-align:${izq ? 'left' : 'center'};vertical-align:bottom;padding:3px 4px;${nowrap ? 'white-space:nowrap;' : ''}">${escaparHtml(t)}</td>`
  const cuerpo = filas.length
    ? filas
        .map((f, i) => `<tr>${td(f.fecha, i, false, true)}${td(f.maquina, i)}${td(f.falla, i)}${td(f.duracion, i, false, true)}${td(f.observaciones, i, true)}</tr>`)
        .join('')
    : `<tr>${td('', 0, false, true)}${td('', 0)}${td('', 0)}${td('', 0)}${td('', 0, true)}</tr>`
  return (
    `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;font-family:${CAL};">` +
    `<tr><td width="146" style="width:146px;height:56px;background:${GRIS};padding:0 0 0 13px;vertical-align:middle;">` +
    `<img src="${logo}" width="120" height="28" alt="" style="display:block;width:120px;height:28px;"></td>` +
    `<td colspan="4" style="background:${AZUL};color:#FFFFFF;font-family:${CAL};font-size:16pt;font-weight:bold;height:56px;padding:0 8px;vertical-align:middle;">MTBF - MTTR</td></tr>` +
    `<tr>${th('Fecha', ANCHOS.fecha)}${th('Máquina', ANCHOS.maquina)}${th('Falla', ANCHOS.falla)}${th('Duración Falla (Min)', ANCHOS.duracion)}${th('Observaciones')}</tr>` +
    cuerpo +
    `</table>`
  )
}

/** Texto plano de la tabla (una fila por línea, columnas con tabulador: pega bien en Excel). */
export function textoRecoleccionMttr(filas: readonly FilaRecoleccion[]): string {
  return ['Fecha\tMáquina\tFalla\tDuración Falla (Min)\tObservaciones', ...filas.map((f) => [f.fecha, f.maquina, f.falla, f.duracion, f.observaciones].join('\t'))].join('\n')
}

// ── El archivo .xlsx: la plantilla con la tabla «Captura» y sus estilos, llenada ──
// La plantilla (public/plantillas/recoleccion-mttr.xlsx) trae una fila de datos de
// muestra en la fila 4; aquí se reemplaza por las filas reales y se ajusta el rango
// de la tabla. Los índices de estilo (s="…") son los de esa plantilla.
const ESTILO = { fecha: 5, centrado: 6, numero: 7 }

// Propio y no el de bitacoraCorreo: ese módulo importa este y sería un ciclo.
function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function xml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Número de serie de Excel de una fecha AAAA-MM-DD (días desde el 30-12-1899). */
export function serieExcel(fechaIso: string): number {
  const [a = 0, m = 1, d = 1] = fechaIso.split('-').map(Number)
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000)
}

/** Las filas de datos en XML de la hoja, desde la fila 4. Exportado para probarlo. */
export function filasAXml(filas: readonly FilaRecoleccion[]): string {
  const celda = (ref: string, texto: string, estilo?: number) =>
    `<c r="${ref}"${estilo != null ? ` s="${estilo}"` : ''} t="inlineStr"><is><t xml:space="preserve">${xml(texto)}</t></is></c>`
  return filas
    .map((f, i) => {
      const r = i + 4
      return (
        `<row r="${r}">` +
        (f.fecha ? `<c r="A${r}" s="${ESTILO.fecha}"><v>${serieExcel(f.fechaIso)}</v></c>` : `<c r="A${r}" s="${ESTILO.fecha}"/>`) +
        celda(`B${r}`, f.maquina, ESTILO.centrado) +
        celda(`C${r}`, f.falla, ESTILO.centrado) +
        `<c r="D${r}" s="${ESTILO.numero}"><v>${f.minutos}</v></c>` +
        celda(`E${r}`, f.observaciones) +
        `</row>`
      )
    })
    .join('')
}

export async function generarExcelRecoleccion(filas: readonly FilaRecoleccion[], nombre: string): Promise<void> {
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import('fflate')
  const respuesta = await fetch(`${import.meta.env.BASE_URL}plantillas/recoleccion-mttr.xlsx`)
  if (!respuesta.ok) throw new Error('No se pudo cargar la plantilla del Excel')
  const archivos = unzipSync(new Uint8Array(await respuesta.arrayBuffer()))
  const hojaOriginal = archivos['xl/worksheets/sheet1.xml']
  const tablaOriginal = archivos['xl/tables/table1.xml']
  if (!hojaOriginal || !tablaOriginal) throw new Error('La plantilla del Excel no trae la hoja o la tabla')
  const lista = filas.length ? filas : [{ fecha: '', fechaIso: '', maquina: '', falla: '', duracion: '0', minutos: 0, observaciones: '' }]
  const ultima = lista.length + 3
  const hoja = strFromU8(hojaOriginal)
    .replace(/<row r="4">.*?<\/row>/s, filasAXml(lista))
    .replace(/<dimension ref="[^"]*"/, `<dimension ref="A1:E${ultima}"`)
  const tabla = strFromU8(tablaOriginal).replace(/ref="A3:E\d+"/g, `ref="A3:E${ultima}"`)
  const salida = zipSync({ ...archivos, 'xl/worksheets/sheet1.xml': strToU8(hoja), 'xl/tables/table1.xml': strToU8(tabla) })
  const blob = new Blob([salida as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** «Recoleccion MTTR Turno dia 17-09-2026.xlsx», con el nombre que usan ellos. */
export function nombreExcelRecoleccion(turno: TurnoMantencion): string {
  return `Recoleccion MTTR ${etiquetaTurno(turno)} ${turno.fecha.split('-').reverse().join('-')}.xlsx`.normalize('NFD').replace(/[̀-ͯ]/g, '')
}
