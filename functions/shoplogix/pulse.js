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
const { ahoraEnPlanta } = require('./polling')

/** Cuántas lecturas se conservan: 10 min de historia a un pulso por minuto. */
const MAX_LECTURAS = 10

/**
 * Lee el contador vivo de una planta.
 * @returns {Promise<{at: string, totalCycles: number} | null>}
 */
async function leerPulso({ query, plantSlug, at = ahoraEnPlanta(), toShoplogixTime, logger = console }) {
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
    /* El acumulado POR máquina, del mismo request: es lo que permite decir el
       «ahora» de cada Baader sumando el de la línea (pedido de Orel, 27-08).
       Verificado contra la respuesta real de Chonchi: la fila Total ES la suma
       de las filas (2.263+612+2.303 = 5.178), así que los ritmos por máquina
       de la misma ventana suman el de línea por construcción. */
    const porMaquina = {}
    for (const m of filas) {
      if (m.machineid === 'Total') continue
      porMaquina[m.machineid] = uptime(m)
    }
    return {
      at: new Date().toISOString(),
      totalCycles,
      ...(Object.keys(porMaquina).length > 0 ? { porMaquina } : {}),
      diag: totalCycles === 0 ? radiografia(data) : null,
    }
  } catch (err) {
    logger.warn(`[pulse][${plantSlug}] no disponible (no bloquea): ${err.message}`)
    return null
  }
}

/**
 * Radiografía de la respuesta cuando el contador sale en CERO.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Medido el 2026-08-19: el pulso devuelve 0 para Chonchi y Filete y funciona en
 * Yal, con las tres plantas produciendo. El mismo corte afecta al contador vivo
 * del sync (`shoplogixLive`), que usa esta misma llamada y quedó congelado
 * horas en esas dos plantas sin que nadie lo notara. Los buckets de 5 min
 * siguen llegando porque vienen de otra consulta.
 *
 * Para saber QUÉ devuelve el whiteboard en esas áreas hace falta ver la
 * respuesta real, y no se puede desde fuera de la nube: la credencial local
 * está en backoff. Esto la guarda en Firestore —no en los logs— para poder
 * leerla con el SDK admin.
 *
 * ⚠ NO guarda la respuesta completa: solo su FORMA (cuántas filas, qué ids, qué
 * tipos de estado, qué campos traen). Alcanza para el diagnóstico y evita
 * meter un blob grande en un doc que se escribe cada minuto.
 *
 * Se puede sacar en cuanto el caso esté resuelto.
 */
function radiografia(data) {
  const filas = data?.machines || []
  return {
    clavesRaiz: Object.keys(data || {}).slice(0, 12),
    // Escalares del nivel raiz: `currentSpeed` y `expectedRate` pueden ser el
    // ritmo que buscamos sin pasar por las filas.
    raizValores: Object.fromEntries(Object.entries(data || {})
      .filter(([, v]) => typeof v === 'number' || typeof v === 'string').slice(0, 10)),
    filas: filas.length,
    muestra: filas.slice(0, 4).map((f) => ({
      machineid: String(f.machineid ?? '(sin id)').slice(0, 40),
      nombre: f.name ?? f.machinename ?? null,
      turno: f.shift ?? null,
      // Segunda pasada (2026-08-19): la primera radiografia mostro que `states`
      // llega VACIO en Chonchi y Filete —por eso el contador daba 0— pero que
      // los demas campos si vienen. Ahora se guardan sus VALORES para poder
      // decidir cual es el acumulado del turno, en vez de adivinar por el
      // nombre. `fgUnits` y `target` son los candidatos; `actualRuntime` es
      // tiempo, no piezas.
      valores: Object.fromEntries(Object.entries(f)
        .filter(([k, v]) => k !== 'states' && (typeof v === 'number' || typeof v === 'string'))
        .slice(0, 16)),
      estados: (f.states || []).slice(0, 8).map((e) => ({
        type: e.type ?? null, cycles: e.cycles ?? null, name: e.name ?? null,
      })),
    })),
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

  /* Discontinuidad: si el salto respecto de la última lectura implica un ritmo
     imposible, el contador no "produjo" eso — se reinició o cambió de turno.
     Se arranca la ventana de nuevo desde esta lectura en vez de promediar a
     través del salto, que es lo que publicó 3.101 pz/min. */
  const previas = previo?.lecturas ?? []
  const ultima = previas[previas.length - 1]
  const saltoImposible = ultima && (() => {
    const min = (Date.parse(lectura.at) - Date.parse(ultima.at)) / 60000
    if (!(min > 0)) return false
    return (lectura.totalCycles - ultima.totalCycles) / min > MAX_CPM_PLAUSIBLE
  })()

  const lecturas = (saltoImposible ? [lectura] : [...previas, lectura]).slice(-MAX_LECTURAS)

  const cpm = ritmoDeVentana(lecturas)
  const porMaquina = cpm != null ? ritmoPorMaquinaDeVentana(lecturas) : null
  // El `diag` no entra al pulso: viaja aparte, a su propio doc. Acá solo va lo
  // que la pantalla necesita. `porMaquina` de cada lectura SÍ se conserva: es
  // la historia con la que la próxima corrida calcula el ritmo por máquina.
  const limpias = lecturas.map(({ at, totalCycles, porMaquina: pm }) => (
    pm ? { at, totalCycles, porMaquina: pm } : { at, totalCycles }
  ))
  return {
    at: lectura.at,
    totalCycles: lectura.totalCycles,
    cpm,
    ...(porMaquina ? { porMaquina } : {}),
    lecturas: limpias,
  }
}

/**
 * El ritmo por MÁQUINA de la misma ventana que `ritmoDeVentana`: mismos
 * extremos, mismos minutos. Por eso la suma de los ritmos por máquina ES el
 * ritmo de línea — la garantía que hace legible la columna del monitor.
 *
 * Devuelve null si algún extremo no trae el desglose o si algún contador
 * BAJÓ (reinicio/cambio de turno): publicar un reparto que no suma sería
 * peor que no publicarlo.
 */
function ritmoPorMaquinaDeVentana(lecturas) {
  if (!Array.isArray(lecturas) || lecturas.length < 2) return null
  const ventana = lecturas.slice(-VENTANA_RITMO)
  const primera = ventana[0]
  const ultima = ventana[ventana.length - 1]
  if (!primera.porMaquina || !ultima.porMaquina) return null
  const min = (Date.parse(ultima.at) - Date.parse(primera.at)) / 60000
  if (!(min >= MIN_MINUTOS)) return null
  const out = []
  for (const [id, fin] of Object.entries(ultima.porMaquina)) {
    const ini = primera.porMaquina[id]
    if (ini == null) return null
    const dif = fin - ini
    if (dif < 0) return null
    const cpm = dif / min
    if (cpm > MAX_CPM_PLAUSIBLE) return null
    out.push({ id, cpm })
  }
  return out.length > 0 ? out : null
}

/**
 * Techo de plausibilidad, en piezas por minuto de LÍNEA.
 *
 * No es una meta ni la capacidad real: es un absurdo. La línea más rápida es
 * Yal con 3 evisceradoras a 17 pz/min nominales, o sea ~51. Cualquier cosa
 * sobre 120 no es producción: es el contador que se reinició, un backfill o un
 * cambio de turno.
 *
 * Hizo falta el 2026-08-19: al desplegar el arreglo de la hora, la ventana de
 * lecturas quedó a caballo entre las de antes (0, porque preguntábamos por un
 * turno que no había empezado) y las de después (12.169). El salto de 0 a
 * 12.169 en cuatro minutos publicó **3.101 pz/min** en el pulso. Se corrigió
 * solo cuando la ventana se llenó de lecturas nuevas, pero alcanzó a estar en
 * el documento que lee la pantalla.
 *
 * El código ya se protegía de que el acumulado BAJARA (cambio de turno). Que
 * SALTE es la misma discontinuidad al revés y no estaba cubierta.
 */
const MAX_CPM_PLAUSIBLE = 120

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
  const cpm = dif / min
  // Cinturón además del tirante: si aun así sale un absurdo, no se publica.
  return cpm > MAX_CPM_PLAUSIBLE ? null : cpm
}

module.exports = {
  leerPulso, componerPulso, ritmoDeVentana, ritmoPorMaquinaDeVentana, radiografia,
  MAX_LECTURAS, VENTANA_RITMO, MAX_CPM_PLAUSIBLE,
}
