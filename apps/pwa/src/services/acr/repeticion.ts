/**
 * Detector de repetición del ACR (SPEC_ACR_R1.md §2). Función PURA: sin Firestore ni React.
 *
 * Una falla «se repite» cuando otro evento de los últimos 30 días comparte una pieza con este
 * (p. ej. «resorte») y el mismo equipo base (Baader 142 N1 ~ N2), o cuando la misma pieza aparece
 * en 2 equipos distintos el mismo día. Las piezas son sustantivos de la descripción: se normalizan
 * (minúsculas, sin tildes, singular) y se quitan stopwords, verbos de trabajo y palabras genéricas.
 */
import { fechaLocal } from '@/services/bitacora/turnoMantencion'

/** Lo que el detector necesita de un evento (un `EventoBitacora` cumple). */
export interface EventoRepeticion {
  id: string
  equipo: string
  descripcion: string
  /** YYYY-MM-DD */
  fechaTurno: string
  minutosParada: number | null
}

export interface Repeticion {
  eventoIds: string[]
  resumen: string
  minutos: number
  /** Los eventos del grupo, para listarlos como antecedentes (no se guarda en el análisis). */
  eventos?: EventoRepeticion[]
}

const VENTANA_DIAS = 30

/** Palabras que no son piezas: conectores, verbos de trabajo y de estado, y genéricas del equipo. */
const DESCARTAR = new Set<string>([
  // conectores y determinantes (de 4+ letras; las de 2-3 letras ya no pasan el filtro de largo)
  'para', 'como', 'este', 'esta', 'estos', 'estas', 'pero', 'sobre', 'entre', 'desde', 'hasta', 'tras',
  'luego', 'tambien', 'despues', 'antes', 'durante', 'ademas', 'mismo', 'misma', 'mismos', 'mismas',
  'igual', 'cada', 'todo', 'toda', 'todos', 'todas', 'nuevo', 'nueva', 'nuevos', 'nuevas', 'fuerte',
  'fuertes', 'poco', 'mucho', 'muy',
  // verbos de trabajo y de estado (formas que aparecen en la Bitácora)
  'corta', 'cortan', 'corto', 'cortado', 'cortada', 'cortados', 'cortadas', 'cortar', 'cortaron',
  'cambia', 'cambian', 'cambio', 'reemplaza', 'reemplazan', 'reemplazo', 'realiza', 'realizan',
  'realizo', 'normaliza', 'normalizan', 'normalizo', 'reutiliza', 'reutilizan', 'reutilizo',
  'revisa', 'revisan', 'revisar', 'ajusta', 'ajustan', 'ajusto', 'instala', 'instalan', 'instalo',
  // genéricas: equipo, línea, turno, tipo de falla
  'maquina', 'equipo', 'linea', 'turno', 'falla', 'parada', 'baader', 'evisceradora', 'fileteadora',
  'eviscerado', 'eviscerada',
])

/** Palabras del nombre del equipo que no van en el texto corto («Baader 142», no «Evisceradora Baader 142»). */
const TIPO_EQUIPO = new Set(['evisceradora', 'fileteadora', 'eviscerado', 'eviscerada'])

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Singular sencillo: `resortes`→`resorte`, `expulsadores`→`expulsador`. */
function singular(t: string): string {
  if (t.endsWith('es') && 'rdlnz'.includes(t.charAt(t.length - 3))) return t.slice(0, -2)
  if (t.endsWith('s')) return t.slice(0, -1)
  return t
}

/** Sustantivos de 4+ letras que describen la pieza. */
export function piezasDe(texto: string): Set<string> {
  const piezas = new Set<string>()
  for (const raw of normalizar(texto).split(/[^a-z0-9]+/)) {
    if (raw.length < 4 || /^\d+$/.test(raw)) continue
    const t = singular(raw)
    if (t.length < 4 || DESCARTAR.has(raw) || DESCARTAR.has(t)) continue
    piezas.add(t)
  }
  return piezas
}

/** Equipo sin el sufijo de línea: «EVISCERADORA BAADER 142 N1» → «evisceradora baader 142». */
export function equipoBase(equipo: string): string {
  return normalizar(equipo).replace(/\s+n\d+\s*$/, '').replace(/\s+/g, ' ').trim()
}

/** Sufijo de línea, si lo tiene: «… N2» → «N2». */
function sufijoLinea(equipo: string): string | null {
  return equipo.trim().match(/\bN(\d+)\s*$/i)?.[0].toUpperCase() ?? null
}

/** Nombre corto para mostrar: «EVISCERADORA BAADER 142 N1» → «Baader 142». */
function nombreCorto(base: string): string {
  const palabras = base.split(' ').filter((p) => !TIPO_EQUIPO.has(p))
  const texto = palabras.join(' ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function listaConY(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

/** «Baader 142 N1, N2 y Baader 200» (por equipo base, en orden de aparición). */
function equiposDelGrupo(equipos: string[]): string {
  const porBase = new Map<string, { nombre: string; lineas: string[] }>()
  for (const eq of equipos) {
    const base = equipoBase(eq)
    const entrada = porBase.get(base) ?? { nombre: nombreCorto(base), lineas: [] }
    const linea = sufijoLinea(eq)
    if (linea && !entrada.lineas.includes(linea)) entrada.lineas.push(linea)
    porBase.set(base, entrada)
  }
  return listaConY(
    [...porBase.values()].map((e) => (e.lineas.length ? `${e.nombre} ${[...e.lineas].sort().join(', ')}` : e.nombre)),
  )
}

/** `2026-09-24` → `24-09`. */
function diaMes(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return dia && mes ? `${dia}-${mes}` : iso
}

function restarDias(d: Date, dias: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dias)
}

/**
 * Repetición de `evento` frente a `recientes`, o null si no se repite.
 * `hoy` fija la ventana de 30 días (incluye hoy).
 */
export function detectarRepeticion(
  evento: EventoRepeticion,
  recientes: readonly EventoRepeticion[],
  hoy: Date = new Date(),
): Repeticion | null {
  const piezasEvento = piezasDe(evento.descripcion)
  if (piezasEvento.size === 0) return null

  const desde = fechaLocal(restarDias(hoy, VENTANA_DIAS))
  const hasta = fechaLocal(hoy)
  const baseEvento = equipoBase(evento.equipo)

  // Otros eventos de la ventana que comparten al menos una pieza con este.
  const comparten = recientes
    .filter((o) => o.id !== evento.id && o.fechaTurno >= desde && o.fechaTurno <= hasta)
    .map((o) => ({ o, comunes: [...piezasDe(o.descripcion)].filter((p) => piezasEvento.has(p)) }))
    .filter((x) => x.comunes.length > 0)
  if (comparten.length === 0) return null

  // Regla 1: el mismo equipo base. Regla 2: la misma pieza en 2 equipos el mismo día.
  const mismoEquipo = comparten.some((x) => equipoBase(x.o.equipo) === baseEvento)
  const basesDelDia = new Set([baseEvento, ...comparten
    .filter((x) => x.o.fechaTurno === evento.fechaTurno)
    .map((x) => equipoBase(x.o.equipo))])
  if (!mismoEquipo && basesDelDia.size < 2) return null

  const grupo = [evento, ...comparten.map((x) => x.o)]

  // Pieza que más se repite en el grupo; «cortado» si alguna descripción dice que se cortó.
  const conteo = new Map<string, number>()
  for (const e of grupo) {
    for (const p of piezasDe(e.descripcion)) {
      if (piezasEvento.has(p)) conteo.set(p, (conteo.get(p) ?? 0) + 1)
    }
  }
  const pieza = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? [...piezasEvento][0] ?? ''
  const cortado = grupo.some((e) => /\bcort/.test(normalizar(e.descripcion)))
  const etiqueta = `${pieza.charAt(0).toUpperCase()}${pieza.slice(1)}${cortado ? ' cortado' : ''}`

  const fechas = grupo.map((e) => e.fechaTurno).sort()
  const cuando =
    fechas[0] === fechas[fechas.length - 1]
      ? `el ${diaMes(fechas[0] ?? evento.fechaTurno)}`
      : `entre el ${diaMes(fechas[0] ?? evento.fechaTurno)} y el ${diaMes(fechas[fechas.length - 1] ?? evento.fechaTurno)}`
  const n = grupo.length
  const minutos = grupo.reduce((suma, e) => suma + (e.minutosParada ?? 0), 0)

  return {
    eventoIds: grupo.map((e) => e.id),
    resumen: `${etiqueta} · ${n} ${n === 1 ? 'vez' : 'veces'} ${cuando} · ${equiposDelGrupo(grupo.map((e) => e.equipo))} · ${minutos} min`,
    minutos,
    eventos: grupo,
  }
}
