/**
 * Configuración de notificaciones Shoplogix por planta.
 *
 * Tres capas, de menor a mayor prioridad:
 *   1. DEFAULTS        — base común
 *   2. PLANT_DEFAULTS  — lo que cambia por realidad de la línea (acá abajo)
 *   3. Firestore       — `notificationConfig/{plantSlug}`, lo que ajusta el admin
 *
 * Por qué hace falta la capa 2: los umbrales estaban pensados para el
 * eviscerado (3 Baader, decenas de miles de piezas por turno). Filete tiene UNA
 * máquina y volúmenes mucho menores, así que el mismo número significa cosas
 * distintas: con el umbral de 50 piezas, un lote de PRUEBA de 59 piezas
 * (2026-07-28, real) disparó un brief de fin de turno como si hubiera sido un
 * turno productivo.
 */

const DEFAULTS = Object.freeze({
  // telegramDest: 'bot' = solo DM del admin con @antarfood_mant_bot (rodaje),
  // 'grupo' = grupo Telegram (topic General), 'ambos' = los dos.
  channels:      { push: true, telegram: false, telegramDest: 'bot' },
  shiftStart:    { enabled: true, gracePeriodMinutes: 20 },
  /**
   * Brief de FIN de turno. `delayMinutes` = margen tras el fin para que el
   * último sync (cada 5 min) alcance a dejar la data completa.
   * `minPieces` = piezas mínimas para considerar que hubo turno productivo;
   * bajo eso no se molesta a nadie (bucket de ruido o lote de prueba).
   */
  shiftEnd:      { enabled: true, delayMinutes: 10, minPieces: 50 },
  firstPiece:    { enabled: true },
  pieceInterval: { enabled: false, every: 1000 },
  // stoppageMinMinutes: umbral para alertar detenciones (≥N min). Bajo eso es
  // ruido operacional (y las "Micro Detencion" tienen su propio toggle aparte).
  events:        { stoppage: true, stoppageMinMinutes: 3, microStoppage: false },
  /**
   * Link del monitor público al arrancar el turno (el que se le reenvía a
   * Control de Producción). Va por su PROPIO flag y no por `channels.telegram`:
   * así una línea puede recibir el link sin que se le abra todo el canal de
   * alertas. `ttlDays` es la vigencia del link de línea, que se renueva sola en
   * cada arranque — el token NO cambia, para que el QR impreso siga sirviendo.
   */
  monitorLink:   { enabled: true, ttlDays: 30 },
})

/**
 * Ajustes por planta. Solo lo que DIFIERE de DEFAULTS — todo lo demás se hereda.
 */
const PLANT_DEFAULTS = Object.freeze({
  filete: {
    // Una sola máquina a ~20 pz/min: un turno real son miles de piezas. 200
    // deja pasar cualquier turno de verdad y filtra las pruebas de línea.
    shiftEnd:      { minPieces: 200 },
    // Con una máquina, avisar cada 1.000 piezas es demasiado silencio: si algún
    // día se activa el aviso por hitos, que sea a una escala que se note.
    pieceInterval: { every: 500 },
  },
})

/** Secciones que se mergean campo por campo. */
const SECTIONS = ['channels', 'shiftStart', 'shiftEnd', 'firstPiece', 'pieceInterval', 'events', 'monitorLink']

/**
 * Resuelve la config efectiva de una planta.
 * @param {string} plantSlug
 * @param {object|null} stored — doc `notificationConfig/{plantSlug}` (o null)
 */
function resolveNotifConfig(plantSlug, stored) {
  const plant = PLANT_DEFAULTS[plantSlug] || {}
  const doc = stored || {}
  const out = {}
  for (const section of SECTIONS) {
    out[section] = { ...DEFAULTS[section], ...(plant[section] || {}), ...(doc[section] || {}) }
  }
  return out
}

module.exports = { DEFAULTS, PLANT_DEFAULTS, SECTIONS, resolveNotifConfig }
