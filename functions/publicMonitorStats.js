/**
 * Telemetría de uso del monitor público — anónima por diseño.
 *
 * Responde a "¿Control de Producción está usando el link o lo ignoran?", que es
 * lo que permite defender la herramienta con datos en vez de con impresiones.
 *
 * ⚠ NO identifica a nadie y no debe hacerlo nunca: quien abre el link no tiene
 * sesión, no dio consentimiento y muchas veces ni siquiera trabaja en la
 * empresa. Lo único que se guarda por dispositivo es un `viewerId` ALEATORIO
 * que genera el propio navegador y vive en su localStorage — no viene de nada
 * del aparato ni de la persona, y borrar los datos del navegador lo reinicia.
 * Explícitamente fuera: IP, geolocalización, user-agent crudo, nombres, correos.
 * Del user-agent solo se deriva "móvil" o "escritorio".
 *
 * Los contadores viven en `publicShiftMonitorStats/{token}`, SEPARADOS del doc
 * del monitor: ese doc es de lectura pública y ahí la telemetría quedaría
 * expuesta a los propios visitantes, además de engordar lo que se descarga en
 * cada refresco.
 */

const COLLECTION_STATS = 'publicShiftMonitorStats'

/** Dispositivos guardados en detalle. Sobre eso se poda el más antiguo. */
const MAX_VIEWERS = 60
/** Días de historial diario. */
const MAX_DAYS = 14
/** Tope de viewerIds únicos por día. El link es público (sin sesión): sin este
 *  techo, pings con viewerIds aleatorios engordarían el array del día hasta
 *  romper el doc de 1 MB. Por encima del tope el conteo diario se subestima,
 *  cosa aceptable para telemetría; el uso real no se acerca. */
const MAX_DAY_VIEWERS = 500
/** Una apertura del mismo dispositivo no vuelve a contar antes de esto. */
const OPEN_DEDUPE_MS = 10 * 60 * 1000
/** Tope de segundos que puede sumar un solo latido (evita inflar el total). */
const MAX_HEARTBEAT_SEC = 300

/** viewerId aceptable: hex/uuid corto. Cualquier otra cosa se descarta. */
function sanitizeViewerId(raw) {
  const s = String(raw || '').trim().toLowerCase()
  return /^[a-f0-9-]{8,64}$/.test(s) ? s : null
}

/** Solo la categoría gruesa; el user-agent crudo no se guarda. */
function deviceKind(userAgent) {
  return /mobile|android|iphone|ipad|ipod/i.test(String(userAgent || '')) ? 'movil' : 'escritorio'
}

/** dateKey en hora de planta, para que "hoy" signifique el día de la faena. */
function plantDateKey(nowWall) {
  return nowWall.toISOString().slice(0, 10)
}

/**
 * Aplica un evento de uso sobre el doc de stats.
 *
 * Es una función pura sobre el estado previo: así se puede testear el
 * comportamiento (dedupe, poda, topes) sin Firestore.
 *
 * @param {object|null} prev — doc anterior
 * @param {object} ev — { viewerId, event: 'open'|'ping', device, secs, viewingPast, nowMs, nowWall }
 */
function applyEvent(prev, ev) {
  const s = {
    opens: 0,
    secondsViewed: 0,
    viewersCount: 0,
    viewers: {},
    byDay: {},
    byHour: {},
    devices: { movil: 0, escritorio: 0 },
    shiftViews: { actual: 0, anteriores: 0 },
    firstOpenAt: null,
    ...(prev || {}),
  }
  // Las secciones anidadas se copian para no mutar el objeto recibido.
  s.viewers = { ...(s.viewers || {}) }
  s.byDay = { ...(s.byDay || {}) }
  s.byHour = { ...(s.byHour || {}) }
  s.devices = { ...(s.devices || { movil: 0, escritorio: 0 }) }
  s.shiftViews = { ...(s.shiftViews || { actual: 0, anteriores: 0 }) }

  const { viewerId, nowMs } = ev
  const dia = plantDateKey(ev.nowWall)
  const hora = String(ev.nowWall.getUTCHours())
  const prevViewer = s.viewers[viewerId]
  const nuevoDispositivo = !prevViewer

  // El día se COPIA: `{...s.byDay}` es superficial, así que sin esto se estaría
  // mutando el objeto del estado previo (y el llamador vería cambios que aún no
  // se han confirmado en la transacción).
  const díaPrev = s.byDay[dia]
  const día = {
    opens: 0,
    secs: 0,
    ...(díaPrev || {}),
    viewers: Array.isArray(díaPrev?.viewers) ? [...díaPrev.viewers] : [],
  }

  if (ev.event === 'open') {
    // Dedupe: recargar la pestaña cinco veces no son cinco visitas.
    const recien = prevViewer && nowMs - (prevViewer.lastOpenAt || 0) < OPEN_DEDUPE_MS
    if (!recien) {
      s.opens += 1
      día.opens += 1
      s.byHour[hora] = (s.byHour[hora] || 0) + 1
      if (nuevoDispositivo) {
        s.viewersCount += 1
        s.devices[ev.device] = (s.devices[ev.device] || 0) + 1
      }
      if (!día.viewers.includes(viewerId) && día.viewers.length < MAX_DAY_VIEWERS) día.viewers.push(viewerId)
    }
    s.viewers[viewerId] = {
      ...(prevViewer || { firstSeen: nowMs, opens: 0, secs: 0 }),
      device: ev.device,
      lastSeen: nowMs,
      lastOpenAt: recien ? prevViewer.lastOpenAt : nowMs,
      opens: (prevViewer?.opens || 0) + (recien ? 0 : 1),
    }
    if (!s.firstOpenAt) s.firstOpenAt = nowMs
  } else {
    // Latido: suma tiempo mirado. Sin apertura previa igual se registra el
    // dispositivo — puede haber llegado por un link viejo ya deduplicado.
    const secs = Math.max(0, Math.min(MAX_HEARTBEAT_SEC, Number(ev.secs) || 0))
    s.secondsViewed += secs
    día.secs += secs
    s.viewers[viewerId] = {
      ...(prevViewer || { firstSeen: nowMs, opens: 0, lastOpenAt: 0 }),
      device: ev.device,
      lastSeen: nowMs,
      secs: (prevViewer?.secs || 0) + secs,
    }
    if (nuevoDispositivo) s.viewersCount += 1
    if (!día.viewers.includes(viewerId) && día.viewers.length < MAX_DAY_VIEWERS) día.viewers.push(viewerId)
  }

  if (ev.viewingPast) s.shiftViews.anteriores += 1
  else s.shiftViews.actual += 1

  s.byDay[dia] = día
  s.lastOpenAt = nowMs

  // Poda: el doc no puede crecer sin techo. Se van los dispositivos que hace
  // más tiempo no aparecen; `viewersCount` NO se toca, porque es el acumulado
  // histórico y no la cantidad de filas guardadas.
  const ids = Object.keys(s.viewers)
  if (ids.length > MAX_VIEWERS) {
    ids.sort((a, b) => (s.viewers[a].lastSeen || 0) - (s.viewers[b].lastSeen || 0))
    for (const id of ids.slice(0, ids.length - MAX_VIEWERS)) delete s.viewers[id]
  }
  const dias = Object.keys(s.byDay).sort()
  for (const d of dias.slice(0, Math.max(0, dias.length - MAX_DAYS))) delete s.byDay[d]

  s.updatedAt = nowMs
  return s
}

module.exports = {
  COLLECTION_STATS,
  MAX_VIEWERS,
  MAX_DAYS,
  MAX_DAY_VIEWERS,
  OPEN_DEDUPE_MS,
  MAX_HEARTBEAT_SEC,
  sanitizeViewerId,
  deviceKind,
  applyEvent,
}
