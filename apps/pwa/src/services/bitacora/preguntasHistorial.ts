/**
 * Las preguntas que responde el Historial (Orel, 19-09-2026: «los datos responden
 * preguntas claras y precisas»; mockup aprobado
 * https://claude.ai/artifact/M3eDjf8oHto5U3wp7j3tTa). Cada función devuelve los
 * datos del gráfico Y la respuesta en una frase: el título del gráfico ES la
 * respuesta, calculada con los mismos datos que se dibujan.
 *
 *   1 · ¿La línea está parando más o menos?        → serieParada + respuestaTendencia
 *   2 · ¿Dónde se concentra la parada?             → paretoEquipos
 *   3 · ¿Mantención interviene sin detener la línea? → serieIntervenciones + respuestaIntervenciones
 *   4 · ¿Cuánto tardamos en reparar?                → duracionesFallas + respuestaReparacion
 *   5 · ¿Qué falla se está repitiendo?              → fallasRepetidas
 *
 * Criterios de _GUIAS/_DESTILADO_VISUALIZACION.md: evolución → línea; comparar
 * nominal → barras ordenadas por valor con % acumulado; duración con cola larga →
 * mediana, no promedio; «subió/bajó» solo con cambio que importe.
 */
import type { EventoBitacora } from './bitacora.types'
import { soloListos } from './borradores'
import { etiquetaCortaTurno } from './entregaTurno'
import { normalizarEquipo, porcentaje, porcentajeFino, type FilaTurno, type ResumenPeriodo } from './historialBitacora'
import { MINUTOS_SIN_PRODUCCION_POR_TURNO, minutosDelTurno } from './mtbf'
import { esFalla, minutosParadaDe } from './resumenBitacora'
import { formatoMinutos } from './turnoMantencion'

export type Agrupacion = 'dia' | 'semana'

/** Hasta 14 días, un punto por día; más, por semana (30 puntos diarios ya son ruido). */
export function agrupacionPara(dias: number): Agrupacion {
  return dias <= 14 ? 'dia' : 'semana'
}

/** Cambio relativo menor a esto entre mitades = «estable» (no se anuncia ruido como tendencia). */
const CAMBIO_QUE_IMPORTA = 0.1
/** Menos puntos que esto no alcanzan para hablar de tendencia. */
const PUNTOS_PARA_TENDENCIA = 4

/** `YYYY-MM-DD` → el lunes de esa semana. */
function lunesDe(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  const t = new Date(Date.UTC(a!, m! - 1, d!))
  const dow = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - dow)
  return t.toISOString().slice(0, 10)
}

const ddmm = (fecha: string) => `${fecha.slice(8, 10)}-${fecha.slice(5, 7)}`

function claveDe(f: Pick<FilaTurno, 'turno'>, agrupar: Agrupacion): { clave: string; etiqueta: string } {
  const fecha = f.turno.fecha
  if (agrupar === 'dia') return { clave: fecha, etiqueta: ddmm(fecha) }
  const lunes = lunesDe(fecha)
  return { clave: lunes, etiqueta: `sem. ${ddmm(lunes)}` }
}

// ── 1 · ¿La línea está parando más o menos? ─────────────────────────────────

export interface PuntoParada {
  clave: string
  etiqueta: string
  minutosParada: number
  minutosProduccion: number
  /** Parte del tiempo de producción parado (0–1). */
  parte: number
  /** Incluye el turno EN CURSO: sus números son parciales y no cuentan para promedio ni tendencia. */
  parcial: boolean
}

/** % del tiempo de producción parado, por día o por semana, en orden (el orden ES el dato). */
export function serieParada(filas: readonly FilaTurno[], agrupar: Agrupacion): PuntoParada[] {
  const mapa = new Map<string, PuntoParada>()
  for (const f of filas) {
    const { clave, etiqueta } = claveDe(f, agrupar)
    const p = mapa.get(clave) ?? { clave, etiqueta, minutosParada: 0, minutosProduccion: 0, parte: 0, parcial: false }
    if (f.enCurso) p.parcial = true
    p.minutosParada += f.resumen.minutosParada
    p.minutosProduccion += Math.max(0, minutosDelTurno(f.turno) - MINUTOS_SIN_PRODUCCION_POR_TURNO)
    mapa.set(clave, p)
  }
  return [...mapa.values()]
    .map((p) => ({ ...p, parte: p.minutosProduccion > 0 ? Math.min(1, p.minutosParada / p.minutosProduccion) : 0 }))
    .sort((a, b) => a.clave.localeCompare(b.clave))
}

const ponderada = (ps: readonly PuntoParada[]) => {
  const prod = ps.reduce((n, p) => n + p.minutosProduccion, 0)
  return prod > 0 ? ps.reduce((n, p) => n + p.minutosParada, 0) / prod : 0
}

export function respuestaTendencia(todos: readonly PuntoParada[]): { titulo: string; promedio: number } {
  // El día del turno en curso se dibuja, pero no se juzga: su parada todavía está corriendo
  // y se leía como una caída que no existió (capturas 19-09-2026).
  const serie = todos.filter((p) => !p.parcial)
  const promedio = ponderada(serie)
  if (!serie.length) return { titulo: 'Sin turnos registrados en el período', promedio }
  if (serie.length < PUNTOS_PARA_TENDENCIA) {
    return { titulo: `${porcentajeFino(promedio)} del tiempo de producción parado — pocos días para ver tendencia`, promedio }
  }
  const mitad = Math.floor(serie.length / 2)
  const a = ponderada(serie.slice(0, mitad))
  const b = ponderada(serie.slice(serie.length - mitad))
  const cambio = a > 0 ? (b - a) / a : b > 0 ? 1 : 0
  if (Math.abs(cambio) < CAMBIO_QUE_IMPORTA) return { titulo: `Parada estable: ${porcentajeFino(promedio)} del tiempo de producción`, promedio }
  return {
    titulo: `${cambio < 0 ? 'Parando menos' : 'Parando más'}: de ${porcentajeFino(a)} a ${porcentajeFino(b)} del tiempo de producción`,
    promedio,
  }
}

// ── 2 · ¿Dónde se concentra la parada? ──────────────────────────────────────

export interface BarraPareto {
  nombre: string
  minutos: number
  /** Parte del total (0–1). */
  parte: number
  /** Parte ACUMULADA hasta esta barra (0–1): convierte el ranking en Pareto. */
  acumulado: number
  esOtros: boolean
  /** Está entre los que juntos llegan al 70 %: los que hay que atacar. */
  prioridad: boolean
}

/** Umbral del Pareto: los equipos que juntos suman esto son «donde se concentra». */
const CORTE_PARETO = 0.7

export function paretoEquipos(r: Pick<ResumenPeriodo, 'equipos' | 'minutosParada'>): { barras: BarraPareto[]; titulo: string } {
  const total = r.minutosParada
  if (total <= 0 || !r.equipos.length) return { barras: [], titulo: 'Ninguna parada con equipo en el período' }
  const lista = r.equipos.map((e) => ({ nombre: e.equipo, minutos: e.minutos, esOtros: false }))
  const resto = total - lista.reduce((n, e) => n + e.minutos, 0)
  if (resto > 0) lista.push({ nombre: 'Otros', minutos: resto, esOtros: true })
  let acc = 0
  let alcanzado = false
  const barras = lista.map((e) => {
    acc += e.minutos
    const prioridad = !e.esOtros && !alcanzado
    if (acc / total >= CORTE_PARETO) alcanzado = true
    return { ...e, parte: e.minutos / total, acumulado: Math.min(1, acc / total), prioridad }
  })
  const clave = barras.filter((b) => b.prioridad)
  const suma = clave[clave.length - 1]?.acumulado ?? 0
  const titulo =
    clave.length === 1
      ? `${clave[0]!.nombre} es el ${porcentaje(suma)} de la parada`
      : `${clave.length} equipos son el ${porcentaje(suma)} de la parada`
  return { barras, titulo }
}

// ── 3 · ¿Mantención interviene sin detener la línea? ─────────────────────────

export interface PuntoIntervenciones {
  clave: string
  etiqueta: string
  sinDetener: number
  conParada: number
}

export function serieIntervenciones(filas: readonly FilaTurno[], agrupar: Agrupacion): PuntoIntervenciones[] {
  const mapa = new Map<string, PuntoIntervenciones>()
  for (const f of filas) {
    const { clave, etiqueta } = claveDe(f, agrupar)
    const p = mapa.get(clave) ?? { clave, etiqueta, sinDetener: 0, conParada: 0 }
    p.sinDetener += f.resumen.enVentana
    p.conParada += f.resumen.conParada
    mapa.set(clave, p)
  }
  return [...mapa.values()].sort((a, b) => a.clave.localeCompare(b.clave))
}

const parteSin = (ps: readonly PuntoIntervenciones[]) => {
  const sin = ps.reduce((n, p) => n + p.sinDetener, 0)
  const tot = sin + ps.reduce((n, p) => n + p.conParada, 0)
  return tot > 0 ? sin / tot : 0
}

export function respuestaIntervenciones(serie: readonly PuntoIntervenciones[]): { titulo: string; parte: number } {
  const total = serie.reduce((n, p) => n + p.sinDetener + p.conParada, 0)
  const parte = parteSin(serie)
  if (!total) return { titulo: 'Sin intervenciones sobre la línea en el período', parte }
  let cola = ''
  if (serie.length >= PUNTOS_PARA_TENDENCIA) {
    const mitad = Math.floor(serie.length / 2)
    const a = parteSin(serie.slice(0, mitad))
    const b = parteSin(serie.slice(serie.length - mitad))
    const cambio = a > 0 ? (b - a) / a : b > 0 ? 1 : 0
    if (Math.abs(cambio) >= CAMBIO_QUE_IMPORTA) cola = cambio > 0 ? ', y subiendo' : ', y bajando'
  }
  return { titulo: `${porcentaje(parte)} de las intervenciones, sin detener la línea${cola}`, parte }
}

// ── 4 · ¿Cuánto tardamos en reparar? ─────────────────────────────────────────

/** Minutos de parada de cada falla publicada con duración, de menor a mayor. */
export function duracionesFallas(eventos: readonly EventoBitacora[]): number[] {
  return soloListos(eventos)
    .filter((e) => esFalla(e))
    .map((e) => minutosParadaDe(e))
    .filter((m): m is number => m != null && m > 0)
    .sort((a, b) => a - b)
}

/** Menos fallas que esto: se nombran una por una en vez de hablar de mitades y de «8 de cada 10». */
const FALLAS_PARA_ESTADISTICA = 5

export function respuestaReparacion(d: readonly number[]): { titulo: string; mediana: number | null; p80: number | null; promedio: number | null } {
  if (!d.length) return { titulo: 'Sin fallas con duración en el período', mediana: null, p80: null, promedio: null }
  const n = d.length
  const mediana = n % 2 ? d[(n - 1) / 2]! : (d[n / 2 - 1]! + d[n / 2]!) / 2
  const p80 = d[Math.ceil(0.8 * n) - 1]!
  const promedio = d.reduce((a, b) => a + b, 0) / n
  if (n < FALLAS_PARA_ESTADISTICA) {
    const lista = d.map((m) => formatoMinutos(m))
    const texto = lista.length === 1 ? lista[0]! : `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`
    return { titulo: `${n} ${n === 1 ? 'falla' : 'fallas'} en el período: ${texto}`, mediana, p80, promedio }
  }
  return {
    titulo: `La mitad de las fallas se resolvió en ${formatoMinutos(Math.round(mediana))} o menos; 8 de cada 10, en ${formatoMinutos(p80)} o menos`,
    mediana,
    p80,
    promedio,
  }
}

// ── 5 · ¿Qué falla se está repitiendo? ───────────────────────────────────────

export interface FallaRepetida {
  equipo: string
  fallas: number
  ultimoTurnoId: string
  /** Lo que dice la última falla (título o el comienzo de la descripción). */
  ultima: string
}

/** Equipos con 2 o más fallas en el período: la alerta temprana. El más repetido primero; a igualdad, el más reciente. */
export function fallasRepetidas(eventos: readonly EventoBitacora[]): FallaRepetida[] {
  const mapa = new Map<string, FallaRepetida & { ms: string }>()
  for (const e of soloListos(eventos)) {
    if (!esFalla(e) || !e.equipo?.trim() || !e.turnoId) continue
    const k = normalizarEquipo(e.equipo)
    const actual = mapa.get(k) ?? { equipo: e.equipo.trim(), fallas: 0, ultimoTurnoId: '', ultima: '', ms: '' }
    actual.fallas += 1
    const orden = `${e.turnoId}|${e.horaInicio ?? ''}`
    if (orden > actual.ms) {
      actual.ms = orden
      actual.ultimoTurnoId = e.turnoId
      const texto = (e.titulo?.trim() || e.descripcion?.trim() || '').replace(/\s+/g, ' ')
      actual.ultima = texto.length > 70 ? `${texto.slice(0, 69)}…` : texto
    }
    mapa.set(k, actual)
  }
  return [...mapa.values()]
    .filter((x) => x.fallas >= 2)
    .sort((a, b) => b.fallas - a.fallas || b.ms.localeCompare(a.ms))
    .map(({ ms: _ms, ...x }) => x)
}

export function respuestaRepetidas(lista: readonly FallaRepetida[], dias: number): string {
  const top = lista[0]
  if (!top) return 'Ninguna falla repetida en el período'
  return `${top.equipo}: ${top.fallas} fallas en ${dias} días, la última en el ${etiquetaCortaTurno(top.ultimoTurnoId).toLowerCase()}`
}
