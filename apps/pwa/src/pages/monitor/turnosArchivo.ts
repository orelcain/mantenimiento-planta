/**
 * «Ver otro día» del monitor público: la lista completa de turnos navegables
 * (los 6 que viajan en el doc + los del archivo de 45 días) y la carga a
 * pedido de UN turno que no viaja en el doc.
 *
 * Por qué así y no más turnos en el doc: ver `buildTurnoArchivo` en
 * functions/publicMonitor.js (tope de 1 MB, peso en el celular, costo del
 * refresco).
 *
 * ⚠ Convención de tiempos: `scheduledStart` y `extraordinario.desde` son hora
 * de planta guardada como UTC → `getUTC*`.
 */
import { useEffect, useState } from 'react'
import {
  pedirTurnoArchivo,
  type PublicShiftMonitorDoc,
  type TurnoMonitorEntrada,
} from '@/services/shoplogix/publicShiftMonitor.service'

/** Un turno de la lista navegable. `enDoc` = su `live` ya viaja en el doc (flecha instantánea). */
export interface TurnoNavegable {
  shiftDocId: string
  dateKey: string
  shiftId: string
  /** HH:MM de arranque (hora de planta), si se sabe. */
  ini: string | null
  piezas: number | null
  enDoc: boolean
  extraordinario: boolean
}

function hhmm(isoWall: string | null | undefined): string | null {
  const t = Date.parse(isoWall ?? '')
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/**
 * Todos los turnos que se pueden mirar, del más nuevo (el actual) al más viejo.
 *
 * El primero SIEMPRE es `vistas[0]` (el vigente). Ordena por fecha y, dentro
 * del día, por hora de arranque real: en Chonchi «Turno 1» arranca 21:30 y
 * «Turno 2» a las 09:00, por nombre quedarían al revés.
 *
 * Fuente del archivo: `archivoTurnos` (45 días, liviano). Docs anteriores a
 * ese campo caen a `shiftStats` (tope de 62 turnos).
 */
export function listaNavegable(
  vistas: TurnoMonitorEntrada[],
  doc: Pick<PublicShiftMonitorDoc, 'archivoTurnos' | 'shiftStats'> | null | undefined,
): TurnoNavegable[] {
  if (vistas.length === 0) return []
  const porId = new Map<string, TurnoNavegable>()
  for (const v of vistas) {
    porId.set(v.shiftDocId, {
      shiftDocId: v.shiftDocId,
      dateKey: v.dateKey,
      shiftId: v.shiftId,
      ini: hhmm(v.extraordinario?.desde ?? v.live?.scheduledStart),
      piezas: v.live?.totalPieces ?? null,
      enDoc: true,
      extraordinario: Boolean(v.extraordinario),
    })
  }
  const archivo = doc?.archivoTurnos
    ?? (doc?.shiftStats ?? []).map((s) => ({ id: s.shiftDocId, ini: null, pz: s.total }))
  for (const a of archivo) {
    if (!a?.id || porId.has(a.id)) continue
    porId.set(a.id, {
      shiftDocId: a.id,
      dateKey: a.id.slice(0, 10),
      shiftId: a.id.slice(11),
      ini: a.ini ?? null,
      piezas: a.pz ?? null,
      enDoc: false,
      extraordinario: false,
    })
  }
  const actual = porId.get(vistas[0]!.shiftDocId)!
  const resto = [...porId.values()].filter((t) => t !== actual)
  resto.sort((a, b) =>
    b.dateKey.localeCompare(a.dateKey)
    || (b.ini ?? '').localeCompare(a.ini ?? '')
    || b.shiftId.localeCompare(a.shiftId))
  return [actual, ...resto]
}

/** El turno a `delta` posiciones (+1 = más viejo, −1 = más nuevo), o null si no hay. */
export function vecinoEnLista(lista: TurnoNavegable[], shiftDocId: string | null | undefined, delta: number): TurnoNavegable | null {
  const i = lista.findIndex((t) => t.shiftDocId === shiftDocId)
  if (i < 0) return null
  return lista[i + delta] ?? null
}

/** Agrupa por día, en el mismo orden de la lista. */
export function agruparPorDia(lista: TurnoNavegable[]): Array<{ dateKey: string; turnos: TurnoNavegable[] }> {
  const out: Array<{ dateKey: string; turnos: TurnoNavegable[] }> = []
  for (const t of lista) {
    const ult = out[out.length - 1]
    if (ult && ult.dateKey === t.dateKey) ult.turnos.push(t)
    else out.push({ dateKey: t.dateKey, turnos: [t] })
  }
  return out
}

/* ── Carga a pedido ─────────────────────────────────────────────────────── */

/**
 * Caché a nivel de módulo: la página se REMONTA al navegar (ver la nota de
 * `turnoParam`), y con un `useState` cada flecha volvería a pedir el turno.
 */
const cache = new Map<string, TurnoMonitorEntrada>()
const claveDe = (token: string, id: string) => `${token}|${id}`

export type EstadoArchivo =
  | { estado: 'nada' }
  | { estado: 'cargando'; shiftDocId: string }
  | { estado: 'ok'; entrada: TurnoMonitorEntrada }
  | { estado: 'error'; shiftDocId: string; reintentar: () => void }

/**
 * Trae el turno de `?turno=` cuando NO viaja en el doc. Depende solo del token,
 * del id pedido y de si está en el doc: un snapshot nuevo del monitor (cada
 * ~5 min) no lo vuelve a pedir.
 */
export function useTurnoArchivo(token: string | undefined, turnoPedido: string | null, estaEnDoc: boolean, docListo: boolean): EstadoArchivo {
  const [intento, setIntento] = useState(0)
  const [, setVersion] = useState(0)
  const [fallido, setFallido] = useState<string | null>(null)
  const necesita = Boolean(token && turnoPedido && docListo && !estaEnDoc)
  const enCache = necesita ? cache.get(claveDe(token!, turnoPedido!)) : undefined

  useEffect(() => {
    if (!necesita || enCache) return
    let vivo = true
    setFallido(null)
    pedirTurnoArchivo(token!, turnoPedido!).then((entrada) => {
      if (!vivo) return
      if (entrada) {
        cache.set(claveDe(token!, turnoPedido!), entrada)
        setVersion((v) => v + 1)
      } else {
        setFallido(turnoPedido)
      }
    })
    return () => { vivo = false }
    // `enCache` no va: cuando aparece, este efecto ya terminó su trabajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [necesita, token, turnoPedido, intento])

  if (!necesita) return { estado: 'nada' }
  if (enCache) return { estado: 'ok', entrada: enCache }
  if (fallido === turnoPedido) return { estado: 'error', shiftDocId: turnoPedido!, reintentar: () => setIntento((n) => n + 1) }
  return { estado: 'cargando', shiftDocId: turnoPedido! }
}

/** Solo para tests. */
export function _limpiarCacheArchivo() { cache.clear() }
