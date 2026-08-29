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
const { parseShoplogixTime } = require('./time')

/** Cuántas lecturas se conservan: 10 min de historia a un pulso por minuto. */
const MAX_LECTURAS = 10

/**
 * Ventana que se pide a `whiteboardproduction`: cubre el turno más largo
 * (nocturno ~10 h) para poder sumar el acumulado del turno desde los mismos
 * buckets. Los buckets de otros turnos se filtran por su campo `shift`.
 */
const VENTANA_BUCKETS_HORAS = 12

/** Un bucket de 1 min está CERRADO cuando cubrió (casi) todo su minuto. */
const BUCKET_CERRADO_MS = 59_000

/** Tope de la serie por minuto publicada (12 h = el turno más largo, entero). */
const MAX_SERIE_MINUTOS = 720

/**
 * Convierte la respuesta de `whiteboardproduction` (buckets de 1 minuto por
 * máquina) en una lectura del pulso.
 *
 * ── El dato duro (29-08, pedido de Orel) ────────────────────────────────────
 * «Que el ahora muestre el dato que la barra muestra en Shoplogix para cada
 * Baader — esa es la verdad absoluta.» Cada bucket trae las piezas CONTADAS de
 * ese minuto (`cycles`) y el esperado oficial (`rate`: Ev1=19, Ev2/3=16), así
 * que el ritmo ya no se DERIVA de un contador con refresco de 2 min: se lee.
 * Sonda del 29-08: rezago 10–65 s, buckets estables una vez cerrados; solo el
 * minuto en curso se rellena retroactivamente — por eso solo se publica el
 * último minuto CERRADO común a todas las máquinas.
 *
 * ⚠ El acumulado del turno sale de sumar los buckets del MISMO turno (campo
 * `shift` del bucket). Eso además deja fuera los buckets `Unscheduled`, que
 * duplican minutos del turno (ver memoria del proyecto).
 *
 * @returns lectura para `componerPulso` o null si no hay buckets utilizables.
 */
function lecturaDesdeProduccion(data) {
  const filas = (data?.machines || [])
    .map((m) => ({ id: m.machineId || m.machineid, buckets: m.machineProduction }))
    .filter((m) => m.id && Array.isArray(m.buckets) && m.buckets.length > 0)
  if (!filas.length) return null

  const cerrado = (b) => (b?.totalDuration ?? 0) >= BUCKET_CERRADO_MS

  /* El último minuto cerrado COMÚN: el mínimo entre los últimos cerrados de
     cada máquina — si una va un minuto atrás, se espera a esa (los buckets
     comparten rejilla, así que el minuto existe en todas). */
  let minutoComun = null
  for (const f of filas) {
    let ultimo = null
    for (let i = f.buckets.length - 1; i >= 0; i--) {
      if (cerrado(f.buckets[i])) { ultimo = f.buckets[i].start; break }
    }
    if (!ultimo) return null
    if (minutoComun === null || ultimo < minutoComun) minutoComun = ultimo
  }

  const delMinuto = filas.map((f) => ({
    id: f.id,
    bucket: f.buckets.find((b) => b.start === minutoComun) ?? null,
  }))
  const turno = delMinuto.find((x) => x.bucket)?.bucket?.shift ?? null

  const cpm = delMinuto.reduce((a, x) => a + (x.bucket?.cycles ?? 0), 0)
  const esperadoCpm = delMinuto.reduce((a, x) => a + (x.bucket?.expectedCycles ?? 0), 0)
  /* Piezas contadas no pueden ser un artefacto de reconciliación, pero un
     absurdo genérico sigue siendo un absurdo: ante eso, mejor mudo. */
  if (!(cpm >= 0) || cpm > MAX_CPM_PLAUSIBLE) return null

  /* Acumulado del turno = suma de TODOS sus buckets (cerrados y el parcial:
     las piezas del minuto en curso ya están contadas). */
  let totalCycles = 0
  const porMaquina = {}
  for (const f of filas) {
    const suyo = f.buckets
      .filter((b) => (turno == null || b.shift === turno))
      .reduce((a, b) => a + (b.cycles || 0), 0)
    porMaquina[f.id] = suyo
    totalCycles += suyo
  }

  /* La serie del turno minuto a minuto, por máquina — el gráfico de barras del
     monitor la dibuja tal cual (opción A elegida por Orel, 29-08). Rejilla
     CONTINUA desde el primer bucket del turno hasta el minuto común: los
     índices son minutos y un hueco de Shoplogix queda como 0 explícito.
     Solo buckets CERRADOS: el parcial cambia retroactivamente. */
  const serieMinuto = (() => {
    const comunMs = parseShoplogixTime(minutoComun).getTime()
    let inicioMs = comunMs
    const porId = new Map()
    for (const f of filas) {
      const mapa = new Map()
      for (const b of f.buckets) {
        if (turno != null && b.shift !== turno) continue
        if (!cerrado(b)) continue
        const ms = parseShoplogixTime(b.start).getTime()
        if (ms > comunMs) continue
        mapa.set(ms, b.cycles || 0)
        if (ms < inicioMs) inicioMs = ms
      }
      porId.set(f.id, mapa)
    }
    const n = Math.min(MAX_SERIE_MINUTOS, Math.round((comunMs - inicioMs) / 60_000) + 1)
    const desdeMs = comunMs - (n - 1) * 60_000
    return {
      desde: new Date(desdeMs).toISOString(),
      maquinas: filas.map((f) => {
        const mapa = porId.get(f.id)
        const enComun = f.buckets.find((b) => b.start === minutoComun)
        return {
          id: f.id,
          esperado: Number.isFinite(enComun?.rate) ? enComun.rate : null,
          cycles: Array.from({ length: n }, (_, i) => mapa.get(desdeMs + i * 60_000) ?? 0),
        }
      }),
    }
  })()

  return {
    at: new Date().toISOString(),
    totalCycles,
    porMaquina,
    duro: {
      cpm,
      porMaquina: delMinuto.map((x) => ({ id: x.id, cpm: x.bucket?.cycles ?? 0 })),
      esperadoCpm: Math.round(esperadoCpm * 10) / 10,
      /* El minuto que se está mostrando, en la misma base wall-clock-as-UTC
         que `series[].t` (los buckets vuelven en el marco de la consulta). */
      minuto: { desde: shoplogixIso(minutoComun), hasta: shoplogixIso(minutoComun, 60_000) },
      serieMinuto,
    },
  }
}

/** "20260829T083100.000" → ISO wall-as-UTC (más un corrimiento opcional en ms). */
function shoplogixIso(s, plusMs = 0) {
  return new Date(parseShoplogixTime(s).getTime() + plusMs).toISOString()
}

/**
 * Lee el pulso de una planta: los buckets de 1 MINUTO por máquina del área
 * (`whiteboardproduction`), el mismo dato de las barras del cronómetro de
 * Shoplogix. UN request por planta, igual que antes del swap — antes se leía
 * el rollup del whiteboard y el ritmo se derivaba del contador acumulado.
 * @returns {Promise<{at: string, totalCycles: number} | null>}
 */
async function leerPulso({ query, plantSlug, at = ahoraEnPlanta(), toShoplogixTime, logger = console }) {
  const areaId = PLANT_AREA_ID[plantSlug]
  if (!areaId) return null
  try {
    const desde = new Date(at.getTime() - VENTANA_BUCKETS_HORAS * 3_600_000)
    const data = await query({
      type: 'whiteboardproduction',
      params: { areas: areaId, start: toShoplogixTime(desde), end: toShoplogixTime(at), minutes: 1 },
    })
    const lectura = lecturaDesdeProduccion(data)
    if (!lectura) {
      logger.warn(`[pulse][${plantSlug}] sin buckets utilizables`)
      return null
    }
    return { ...lectura, diag: lectura.totalCycles === 0 ? radiografia(data) : null }
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
      machineid: String(f.machineid ?? f.machineId ?? '(sin id)').slice(0, 40),
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
function componerPulso(previo, lectura, maxCpm = MAX_CPM_PLAUSIBLE) {
  if (!lectura) return previo ?? null

  /* Discontinuidad: si el salto respecto de la última lectura implica un ritmo
     imposible, el contador no "produjo" eso — se reinició o cambió de turno.
     Se arranca la ventana de nuevo desde esta lectura en vez de promediar a
     través del salto, que es lo que publicó 3.101 pz/min.

     Que el contador BAJE es la misma discontinuidad al revés (reconciliación,
     cambio de turno) y también reinicia la ventana: dejarlo adentro tenía al
     pulso mudo hasta 5 min mientras la lectura envenenada salía sola —
     reiniciando, vuelve a hablar en ~2 (Orel lo cazó en vivo el 29-08:
     la tarjeta caía a la media de 15 min y mostraba un ritmo viejo).

     ⚠ El umbral de ESTE corte es el absurdo genérico, NO el techo físico de la
     planta (`maxCpm`): el contador se refresca cada ~2 min, así que entre dos
     lecturas de 1 min el delta aparente llega legítimamente al DOBLE del ritmo
     real — Chonchi a 40 pz/min pisa +80 en el minuto del refresco. Usar el
     techo físico acá reiniciaba la ventana en CADA refresco y el pulso quedó
     clavado entre null y un 0 falso con la línea a pleno (29-08, turno día).
     El techo físico sigue rigiendo lo que se PUBLICA (ritmoDeVentana). */
  const previas = previo?.lecturas ?? []
  const ultima = previas[previas.length - 1]
  const discontinuo = ultima && (() => {
    if (lectura.totalCycles < ultima.totalCycles) return true
    const min = (Date.parse(lectura.at) - Date.parse(ultima.at)) / 60000
    if (!(min > 0)) return false
    return (lectura.totalCycles - ultima.totalCycles) / min > MAX_CPM_PLAUSIBLE
  })()

  const lecturas = (discontinuo ? [lectura] : [...previas, lectura]).slice(-MAX_LECTURAS)

  /* El DATO DURO manda: si la lectura trae el último minuto cerrado de los
     buckets de Shoplogix (`duro`), ese ES el ritmo — piezas contadas, no
     derivadas. La ventana sobre el acumulado queda solo de respaldo para
     lecturas sin buckets. */
  const duro = lectura.duro ?? null
  const cpm = duro ? duro.cpm : ritmoDeVentana(lecturas, maxCpm)
  const porMaquina = duro
    ? (duro.porMaquina?.length ? duro.porMaquina : null)
    : (cpm != null ? ritmoPorMaquinaDeVentana(lecturas) : null)

  /* El último ritmo VIVO conocido, arrastrado mientras el cpm esté mudo: la
     pantalla lo muestra con su hora («ahora mismo · 03:15, recalibrando») en
     vez de saltar a la media de 15 min, que en un cierre con goteo decía 33
     cuando la realidad era 12. Caduca solo del lado del que publica: un vivo
     de hace >10 min ya no es «ahora» de nada. */
  const vivoPrevio = cpm != null ? null : (() => {
    const v = previo?.cpm != null
      ? { cpm: previo.cpm, at: previo.at, ...(previo.porMaquina ? { porMaquina: previo.porMaquina } : {}) }
      : previo?.vivoPrevio ?? null
    if (!v) return null
    return (Date.parse(lectura.at) - Date.parse(v.at)) <= VIVO_MAX_EDAD_MIN * 60000 ? v : null
  })()
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
    ...(vivoPrevio ? { vivoPrevio } : {}),
    /* De dónde salió el ritmo y qué minuto es: `minuto` viaja en la misma base
       wall-as-UTC que `series[].t`, para poder decir «minuto 08:31» en la
       pantalla. `esperadoCpm` es el esperado oficial de Shoplogix sumado
       (Ev1 19 + Ev2/3 16 = 51 en Chonchi). */
    ...(duro ? { fuente: 'buckets-1min', minuto: duro.minuto, esperadoCpm: duro.esperadoCpm } : {}),
    /* La serie del turno minuto a minuto (para las barras del monitor). */
    ...(duro?.serieMinuto ? { serieMinuto: duro.serieMinuto } : {}),
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

/**
 * Techo FÍSICO por planta, en pz/min de línea: la capacidad nominal sumada
 * con ~10% de holgura. El absurdo genérico de 120 dejó pasar un «60-69
 * pz/min» que Producción vio en el monitor (29-08): para Chonchi
 * (19+16+16 = 51 nominal) eso no es un ritmo, es el contador de Shoplogix
 * reconciliando piezas de golpe tras un reenganche. Sobre este techo el
 * pulso se calla (null) y el número grande cae a la media honesta.
 */
const PLANT_MAX_CPM = Object.freeze({
  chonchi: 56,
  yal: 56,
  filete: 25,
})

/** Lecturas que entran en el ritmo: ~4 min, más que el refresco de Shoplogix. */
const VENTANA_RITMO = 5
/** Cuántos minutos se arrastra el último vivo cuando el cpm queda mudo. */
const VIVO_MAX_EDAD_MIN = 10
/** Mínimo de minutos entre extremos para publicar un ritmo. */
const MIN_MINUTOS = 1.5

/**
 * Piezas por minuto entre la lectura más vieja y la más nueva de la ventana.
 *
 * Devuelve null cuando no hay con qué: menos de dos lecturas, muy juntas en el
 * tiempo, o un acumulado que BAJA — eso último es cambio de turno, no un ritmo
 * negativo.
 */
function ritmoDeVentana(lecturas, maxCpm = MAX_CPM_PLAUSIBLE) {
  if (!Array.isArray(lecturas) || lecturas.length < 2) return null
  const ventana = lecturas.slice(-VENTANA_RITMO)
  const primera = ventana[0]
  const ultima = ventana[ventana.length - 1]
  const min = (Date.parse(ultima.at) - Date.parse(primera.at)) / 60000
  const dif = ultima.totalCycles - primera.totalCycles
  if (!(min >= MIN_MINUTOS) || dif < 0) return null
  const cpm = dif / min
  // Cinturón además del tirante: si aun así sale un absurdo, no se publica.
  return cpm > maxCpm ? null : cpm
}

module.exports = {
  leerPulso, componerPulso, lecturaDesdeProduccion, ritmoDeVentana, ritmoPorMaquinaDeVentana,
  radiografia, MAX_LECTURAS, VENTANA_RITMO, MAX_CPM_PLAUSIBLE, PLANT_MAX_CPM, VIVO_MAX_EDAD_MIN,
}
