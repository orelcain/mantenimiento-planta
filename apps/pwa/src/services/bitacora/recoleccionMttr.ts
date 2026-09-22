import type { EventoBitacora, TurnoMantencion } from './bitacora.types'
import { soloListos } from './borradores'
import { compartirOBajarArchivo } from './compartirArchivo'
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

/** La descripción partida en su primera frase (hasta la primera coma o punto) y el resto. */
function primeraFrase(descripcion: string): { frase: string; resto: string } {
  const texto = descripcion.trim()
  const corte = texto.search(/(?<=[.;:,])\s|\n/)
  const frase = (corte < 0 ? texto : texto.slice(0, corte)).trim().replace(/[.;:,]$/, '')
  const resto = (corte < 0 ? '' : texto.slice(corte)).trim().replace(/\s*\n+\s*/g, ' ')
  return { frase, resto: resto ? resto.charAt(0).toUpperCase() + resto.slice(1) : '' }
}

/** «Falla» de la planilla: el título del evento; sin título, la primera frase de lo que escribió el técnico. */
function fallaDe(e: EventoBitacora): string {
  const titulo = tituloDe(e)
  if (titulo) return titulo
  // La planilla lleva la falla en pocas palabras.
  const { frase } = primeraFrase(e.descripcion ?? '')
  return frase ? (frase.length > 70 ? `${frase.slice(0, 67).trimEnd()}…` : frase) : etiquetaTipo(e)
}

function observacionesDe(e: EventoBitacora): string {
  const descripcion = (e.descripcion ?? '').trim().replace(/\s*\n+\s*/g, ' ')
  // Sin repetir lo que ya dice «Falla»: en el celular cada palabra de más alarga
  // la fila (revisión 17-09). Sin título, «Falla» ya lleva la primera frase y aquí
  // va el resto; con título igual a la descripción, aquí no va nada.
  const texto = tituloDe(e)
    ? descripcion.replace(/[.;:,]$/, '').toLowerCase() === tituloDe(e).toLowerCase()
      ? ''
      : descripcion
    : primeraFrase(e.descripcion ?? '').resto
  const partes = [texto]
  const repuestos = normalizarRepuestos(e.repuestos)
  if (repuestos.length) partes.push(`Repuestos: ${repuestos.map((r) => `${r.codigoSAP} ${nombreConComun(r)} ×${r.cantidad}`.replace(/\s+×/, ' ×')).join('; ')}.`)
  if (e.impacto === 'afecta-sin-detener') {
    partes.push(e.contingencia?.trim() ? `Afectó sin detener: ${e.contingencia.trim()}.` : 'Afectó sin detener la producción.')
  }
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
// En proporción y no en píxeles: en el celular el correo se adapta al ancho de la
// pantalla y los anchos fijos dejaban a Observaciones sin espacio (revisión 17-09).
// En PC (≈960 px) dan 115/154/211/96/384 px, cerca de la planilla.
const ANCHOS = { fecha: 14, maquina: 16, falla: 21, duracion: 9 }

export function htmlRecoleccionMttr(filas: readonly FilaRecoleccion[], opciones: { logo?: string } = {}): string {
  const logo = opciones.logo ?? LOGO_RECOLECCION_DATA_URI
  // 9 pt y no 10: en Outlook la planilla se leía «como letra 30» al lado del cuerpo del correo
  // (Orel, 21-09-2026). Sigue siendo la copia del Excel —banda azul, filas alternadas, logo—,
  // pero al tamaño del documento que la sigue, no al de una hoja de cálculo a pantalla completa.
  const th = (t: string, ancho?: number) =>
    `<th${ancho ? ` width="${ancho}%"` : ''} style="${ancho ? `width:${ancho}%;` : ''}background:${AZUL};color:#FFFFFF;font-family:${CAL};font-size:9pt;line-height:1.25;font-weight:bold;text-align:center;vertical-align:bottom;padding:3px 5px;">${t}</th>`
  const td = (t: string, i: number, izq = false, nowrap = false) =>
    // TableStyleMedium2 pinta la PRIMERA fila de datos y luego alterna.
    // `overflow-wrap:anywhere`: en el celular una palabra larga («EMPACADORA») se
    // montaba sobre la columna vecina en vez de partirse.
    `<td style="background:${i % 2 ? '#FFFFFF' : BANDA};color:#000000;font-family:${CAL};font-size:9pt;line-height:1.3;text-align:${izq ? 'left' : 'center'};vertical-align:bottom;padding:3px 5px;overflow-wrap:anywhere;word-break:break-word;${nowrap ? 'white-space:nowrap;' : ''}">${escaparHtml(t)}</td>`
  const cuerpo = filas.length
    ? filas
        .map((f, i) => `<tr>${td(f.fecha, i)}${td(f.maquina, i)}${td(f.falla, i)}${td(f.duracion, i, false, true)}${td(f.observaciones, i, true)}</tr>`)
        .join('')
    : `<tr>${td('', 0, false, true)}${td('', 0)}${td('', 0)}${td('', 0)}${td('', 0, true)}</tr>`
  return (
    // La banda va en su propia tabla: con `table-layout:fixed` la primera fila fija
    // los anchos, y la celda del logo (146 px) no debe mandar sobre la columna Fecha.
    `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;font-family:${CAL};">` +
    // La banda baja de 56 a 40 px y el título de 16 a 12 pt. El logo NO se escala (se recortó
    // el PNG a propósito): 120×28 entra en 40 px con 6 px de aire arriba y abajo.
    `<tr><td width="134" style="width:134px;height:40px;background:${GRIS};padding:0 0 0 12px;vertical-align:middle;">` +
    `<img src="${logo}" width="120" height="28" alt="" style="display:block;width:120px;height:28px;"></td>` +
    `<td style="background:${AZUL};color:#FFFFFF;font-family:${CAL};font-size:12pt;font-weight:bold;height:40px;padding:0 8px;vertical-align:middle;">MTBF - MTTR</td></tr></table>` +
    `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;table-layout:fixed;width:100%;font-family:${CAL};">` +
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

export async function generarExcelRecoleccion(filas: readonly FilaRecoleccion[], nombre: string): Promise<'compartido' | 'descargado' | 'cancelado'> {
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
  const tipo = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const blob = new Blob([salida as BlobPart], { type: tipo })
  return compartirOBajarArchivo(blob, nombre, tipo)
}

/** «Recoleccion MTTR Turno dia 17-09-2026.xlsx», con el nombre que usan ellos. */
export function nombreExcelRecoleccion(turno: TurnoMantencion): string {
  return `Recoleccion MTTR ${etiquetaTurno(turno)} ${turno.fecha.split('-').reverse().join('-')}.xlsx`.normalize('NFD').replace(/[̀-ͯ]/g, '')
}
