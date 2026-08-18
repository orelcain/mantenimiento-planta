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
 * ⚠ El ritmo se calcula contra la lectura anterior con piezas DISTINTAS: si la
 * línea está parada, dos lecturas seguidas dan el mismo acumulado y dividir da
 * 0 — que es correcto — pero si se compara contra una lectura idéntica de hace
 * segundos el resultado salta entre 0 y valores enormes por el redondeo del
 * tiempo. Se exige al menos 30 s entre lecturas para publicar un ritmo.
 */
function componerPulso(previo, lectura) {
  if (!lectura) return previo ?? null
  const lecturas = [...(previo?.lecturas ?? []), lectura].slice(-MAX_LECTURAS)

  let cpm = null
  const anterior = lecturas.length >= 2 ? lecturas[lecturas.length - 2] : null
  if (anterior) {
    const min = (Date.parse(lectura.at) - Date.parse(anterior.at)) / 60000
    const dif = lectura.totalCycles - anterior.totalCycles
    /* Un acumulado que BAJA significa que Shoplogix cambió de turno entre
       lecturas: no es un ritmo negativo, es otro turno. Se descarta. */
    if (min >= 0.5 && dif >= 0) cpm = dif / min
  }

  return { at: lectura.at, totalCycles: lectura.totalCycles, cpm, lecturas }
}

module.exports = { leerPulso, componerPulso, MAX_LECTURAS }
