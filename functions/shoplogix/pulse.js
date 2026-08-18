/**
 * El PULSO: el contador vivo de Shoplogix, leído cada minuto.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * Los tramos de producción vienen en buckets de 5 minutos, y un bucket no
 * existe hasta que cierra: por eso el monitor mostraba entre 1,5 y 8 min de
 * atraso (medido en el turno del 17-08). Pero el sensor no manda cada 5 min —
 * manda continuo, y Shoplogix expone el acumulado del instante en el mismo
 * endpoint que alimenta el whiteboard de la pantalla de planta.
 *
 * Ese contador ya se leía UNA vez por corrida de sync. Acá se lee cada minuto,
 * que es la opción barata: UN request liviano por planta, sin tocar los buckets
 * ni multiplicar por cinco lo que se guarda.
 *
 * ── Lo que habilita ────────────────────────────────────────────────────────
 *
 * Con dos lecturas consecutivas sale el **ritmo instantáneo**: las piezas que
 * entraron entre una y otra, divididas por los minutos que pasaron. Eso es lo
 * que no se podía ver con buckets de 5 min, y es la pregunta que se hace quien
 * mira la pantalla: «¿la línea está corriendo AHORA?».
 *
 * ⚠ El acumulado es del TURNO, no un detalle por minuto: sirve para «cuántas
 * van» y para el ritmo entre lecturas, no para reconstruir la curva fina. Esa
 * sigue saliendo de los buckets.
 */
const { PLANT_AREA_ID } = require('./machines')

/** Cuántas lecturas se conservan: 10 min de historia a un pulso por minuto. */
const MAX_LECTURAS = 10

/**
 * Lee el contador vivo de una planta.
 * @returns {Promise<{at: string, totalCycles: number} | null>}
 */
async function leerPulso({ query, plantSlug, at = new Date(), toShoplogixTime, logger = console }) {
  const areaId = PLANT_AREA_ID[plantSlug]
  if (!areaId) return null
  try {
    const data = await query({
      type: 'whiteboard',
      params: { rollup: 1, areas: areaId, start: toShoplogixTime(at) },
    })
    const filas = (data?.machines || []).filter((m) => m.machineid)
    if (!filas.length) return null
    /* El acumulado real del turno: los estados «Uptime» de cada fila. Es el
       MISMO número que muestra la pantalla de planta. */
    const uptime = (row) => (row.states || [])
      .filter((s) => s.type === 'Uptime')
      .reduce((a, s) => a + (s.cycles || 0), 0)
    const total = filas.find((m) => m.machineid === 'Total')
    const totalCycles = total
      ? uptime(total)
      : filas.reduce((a, m) => a + uptime(m), 0)
    if (!(totalCycles >= 0)) return null
    return { at: new Date().toISOString(), totalCycles }
  } catch (err) {
    logger.warn(`[pulse][${plantSlug}] no disponible (no bloquea): ${err.message}`)
    return null
  }
}

/**
 * Arma el pulso nuevo a partir del anterior y la lectura recién hecha.
 *
 * ⚠⚠ EL RITMO NO SE CALCULA ENTRE LECTURAS CONSECUTIVAS.
 *
 * Medido en producción con el turno del 18-08: aunque preguntemos cada minuto,
 * el contador de Shoplogix se refresca cada DOS. Las lecturas reales fueron
 * 1453 → 1476 → 1476 → 1495 → 1495: el ritmo entre consecutivas alterna 23, 0,
 * 19, 0 — y ese 0 no es que la línea pare, es que el número todavía no cambió.
 * Un indicador que parpadea entre «va rápido» y «parada» cada minuto no se
 * puede mirar.
 *
 * Por eso el ritmo se mide sobre la VENTANA de las últimas lecturas: piezas
 * ganadas entre la más vieja y la más nueva, divididas por los minutos que las
 * separan. Con 5 lecturas eso son ~4 minutos, suficiente para absorber el
 * refresco de 2 min y seguir siendo «casi instantáneo» comparado con los
 * buckets de 5.
 */
function componerPulso(previo, lectura) {
  if (!lectura) return previo ?? null
  const lecturas = [...(previo?.lecturas ?? []), lectura].slice(-MAX_LECTURAS)

  const cpm = ritmoDeVentana(lecturas)
  return { at: lectura.at, totalCycles: lectura.totalCycles, cpm, lecturas }
}

/** Lecturas que entran en el ritmo: ~4 min, más que el refresco de Shoplogix. */
const VENTANA_RITMO = 5
/** Mínimo de minutos entre extremos para publicar un ritmo. */
const MIN_MINUTOS = 1.5

/**
 * Piezas por minuto entre la lectura más vieja y la más nueva de la ventana.
 *
 * Devuelve null cuando no hay con qué: menos de dos lecturas, muy juntas en el
 * tiempo, o un acumulado que BAJA — eso último es cambio de turno, no un ritmo
 * negativo.
 */
function ritmoDeVentana(lecturas) {
  if (!Array.isArray(lecturas) || lecturas.length < 2) return null
  const ventana = lecturas.slice(-VENTANA_RITMO)
  const primera = ventana[0]
  const ultima = ventana[ventana.length - 1]
  const min = (Date.parse(ultima.at) - Date.parse(primera.at)) / 60000
  const dif = ultima.totalCycles - primera.totalCycles
  if (!(min >= MIN_MINUTOS) || dif < 0) return null
  return dif / min
}

module.exports = { leerPulso, componerPulso, ritmoDeVentana, MAX_LECTURAS, VENTANA_RITMO }
