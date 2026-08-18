/**
 * cotejoTurnos — pone el turno recién cerrado al lado de los turnos equivalentes
 * anteriores, para poder decir si la detención de hoy de verdad se notó.
 *
 * ── Para qué existe ─────────────────────────────────────────────────────────
 * Un turno con 1:52 h de falla suena mal solo. Al lado de las siete noches
 * previas puede resultar que fue la de mayor producción del mes — que es lo que
 * pasó el 2026-08-17 en Eviscerados Chonchi. Sin cotejo, el informe solo puede
 * defenderse; con cotejo puede mostrar qué mueve de verdad el volumen del turno.
 *
 * ── El emparejamiento va por VENTANA, no por nombre ─────────────────────────
 * Tentador: filtrar por `shiftId === 'Turno 1'`. No sirve, y ya rompió antes:
 *   · Chonchi tiene "Turno 1" (noche, 21:15→05:00) y ADEMÁS "Turno 1 Lunes"
 *     (00:00→07:15). Mismo prefijo, turnos distintos.
 *   · Yal tiene tres turnos; Filete llama al suyo "Turno Dia" y por eso una
 *     comparación por nombre fijo se cayó en su momento.
 *   · Los nombres los escribe gente y cambian.
 * Dos turnos son comparables si arrancan a una hora parecida y duran parecido.
 * Eso es estable aunque a alguien se le ocurra renombrar el turno mañana.
 *
 * ── Escalas de tiempo ───────────────────────────────────────────────────────
 * `scheduledStart`/`scheduledEnd` vienen en wall-clock-as-UTC: la hora de Chile
 * disfrazada de UTC. Por eso la hora de inicio se saca con getters UTC — así
 * sale la hora que marca el reloj de planta, que es lo que hay que comparar.
 * No convertir: convertir sería el bug.
 *
 * ── Costo ───────────────────────────────────────────────────────────────────
 * Los docs padre traen la producción del turno en `endBriefSnapshot.total`, así
 * que el volumen sale gratis. La detención de línea NO se puede sacar de ahí:
 * `stateAggregates` viene sumado por causa y sin marcas de tiempo, y sin
 * timestamps no hay solapamiento que calcular. Para eso hay que bajar la
 * subcolección `machines` (3 docs por turno). Por eso el resumen se cachea en
 * `resumenLinea` del doc padre: se calcula una vez, al cierre, y los cotejos
 * siguientes lo leen sin volver a bajar nada.
 */

const { impactoPorCausa, ritmoDelTurno } = require('./lineImpact')

/** Acepta Date, Timestamp o ms. */
function aMs(t) {
  if (t == null) return null
  if (typeof t === 'number') return t
  if (t instanceof Date) return t.getTime()
  if (typeof t.toDate === 'function') return t.toDate().getTime()
  if (typeof t._seconds === 'number') return t._seconds * 1000
  return null
}

/** Hora del reloj de planta, en horas decimales. Getters UTC a propósito. */
function horaDePlanta(ms) {
  const d = new Date(ms)
  return d.getUTCHours() + d.getUTCMinutes() / 60
}

/** Distancia entre dos horas del día, cruzando la medianoche. 21:30 vs 00:30 = 3 h. */
function distanciaHoraria(a, b) {
  const d = Math.abs(a - b) % 24
  return Math.min(d, 24 - d)
}

/**
 * ¿Son el mismo turno de días distintos?
 *
 * @param {object} ref      { inicioMs, finMs }
 * @param {object} cand     { inicioMs, finMs }
 * @param {number} [horas]  tolerancia en la hora de inicio
 * @param {number} [dur]    tolerancia en la duración, en horas
 */
function esComparable(ref, cand, { toleranciaHoras = 1.5, toleranciaDuracion = 2 } = {}) {
  if (!ref || !cand || ref.inicioMs == null || cand.inicioMs == null) return false
  if (distanciaHoraria(horaDePlanta(ref.inicioMs), horaDePlanta(cand.inicioMs)) > toleranciaHoras) return false
  const durRef = (ref.finMs - ref.inicioMs) / 3_600_000
  const durCand = (cand.finMs - cand.inicioMs) / 3_600_000
  if (!(durRef > 0) || !(durCand > 0)) return false
  return Math.abs(durRef - durCand) <= toleranciaDuracion
}

/**
 * Elige los turnos con los que cotejar: comparables, anteriores al de
 * referencia, con producción real, del más reciente al más antiguo.
 *
 * Dos filtros de producción, y el segundo hace falta de verdad:
 *
 * `minPiezas` saca lo que ni siquiera fue un turno (planta parada, lote de
 * prueba). Agosto 2026 tuvo tres noches así en Chonchi.
 *
 * `fraccionMinima` saca los turnos que produjeron algo pero muy por debajo de
 * lo normal — el 2026-07-31 en Chonchi hizo 759 piezas contra una mediana de
 * ~10.000, o sea corrió menos de dos horas. Pasaba el umbral de 50 y entraba al
 * cotejo, hundiendo la mediana: cualquier turno corriente quedaba pareciendo
 * excelente. Un informe que se ve mejor porque la vara está mal puesta no
 * aguanta la primera pregunta en una reunión.
 *
 * El umbral es relativo a la mediana de los propios candidatos, no un número
 * fijo: Chonchi hace ~12.000 por turno y Yal ~20.000, y un absoluto tendría que
 * mantenerse a mano por planta.
 */
function seleccionarComparables(
  candidatos,
  referencia,
  { n = 7, minPiezas = 50, fraccionMinima = 0.25, ...opts } = {},
) {
  const base = candidatos
    .filter((c) => c.id !== referencia.id)
    .filter((c) => c.inicioMs != null && c.inicioMs < referencia.inicioMs)
    .filter((c) => (c.ciclos ?? 0) >= minPiezas)
    .filter((c) => esComparable(referencia, c, opts))

  const ciclos = base.map((c) => c.ciclos).sort((a, b) => a - b)
  const mediana = ciclos.length ? ciclos[Math.floor(ciclos.length / 2)] : 0
  const piso = mediana * fraccionMinima

  return base
    .filter((c) => c.ciclos >= piso)
    .sort((a, b) => b.inicioMs - a.inicioMs)
    .slice(0, n)
}

/**
 * Resumen compacto de un turno. Es lo que se guarda en `resumenLinea` y lo que
 * el cotejo compara. Pensado para caber en el doc padre sin engordarlo.
 */
function resumirTurno({ machines, windowStart, windowEnd, clasificar, pasoMin = 5 }) {
  const causas = impactoPorCausa({ machines, windowStart, windowEnd, clasificar })
  const pausas = impactoPorCausa({
    machines, windowStart, windowEnd, clasificar,
    incluir: (s) => s.type === 'break',
  })
  const ritmo = ritmoDelTurno({ machines, windowStart, windowEnd, pasoMin })

  const ciclos = machines.reduce((a, m) => a + (m.totalCycles || 0), 0)
  const sumar = (filas, campo) => filas.reduce((a, f) => a + f[campo], 0)
  const todoJunto = detencionDeLinea(machines, windowStart, windowEnd)

  return {
    maquinas: machines.length,
    ciclos,
    inicioMs: aMs(windowStart),
    finMs: aMs(windowEnd),
    ritmoNormal: ritmo.ritmoNormal,
    bloquesLimpios: ritmo.bloquesLimpios,
    detencion: {
      sumaSec: sumar(causas, 'sumaSec'),
      unionSec: todoJunto.unionSec,
      todasSec: todoJunto.todasSec,
      equivalenteLineaSec: sumar(causas, 'equivalenteLineaSec'),
    },
    mantencionEquivSec: causas
      .filter((c) => c.imputacion && c.imputacion.esDeMantencion)
      .reduce((a, c) => a + c.equivalenteLineaSec, 0),
    sinCausaEquivSec: causas
      .filter((c) => c.imputacion && c.imputacion.sinCausa)
      .reduce((a, c) => a + c.equivalenteLineaSec, 0),
    causas,
    pausas,
  }
}

/**
 * Detención de LÍNEA de todo el turno, sin separar por causa.
 *
 * No se puede sumar la unión de cada causa: dos causas distintas pueden
 * solaparse en el tiempo y el mismo minuto se contaría dos veces. Hay que
 * recalcular el solapamiento sobre TODAS las detenciones juntas, y para eso se
 * aplasta el reason a una sola etiqueta.
 */
function detencionDeLinea(machines, windowStart, windowEnd) {
  const planas = machines.map((mq) => ({
    machineName: mq.machineName,
    states: (mq.states || [])
      .filter((s) => s.type === 'downtime')
      .map((s) => ({ ...s, reason: 'TODO', name: 'Detencion' })),
  }))
  const [total] = impactoPorCausa({ machines: planas, windowStart, windowEnd })
  return total ? { unionSec: total.unionSec, todasSec: total.todasSec } : { unionSec: 0, todasSec: 0 }
}

/**
 * Arma el cotejo del turno de referencia contra sus comparables.
 * Devuelve las filas listas para la tabla del informe, con el veredicto ya
 * calculado — que es lo que se lee en la reunión.
 */
function armarCotejo(referencia, comparables) {
  const filas = [...comparables, referencia]
    .sort((a, b) => a.inicioMs - b.inicioMs)
    .map((t) => ({
      id: t.id,
      inicioMs: t.inicioMs,
      ciclos: t.ciclos,
      detencionLineaSec: t.detencionLineaSec ?? null,
      esReferencia: t.id === referencia.id,
    }))

  const previos = comparables.map((c) => c.ciclos).filter((n) => typeof n === 'number')
  const mejorPrevio = previos.length ? Math.max(...previos) : null
  const medianaPrevios = previos.length
    ? [...previos].sort((a, b) => a - b)[Math.floor(previos.length / 2)]
    : null

  let veredicto = 'sin-comparables'
  if (previos.length >= 3 && typeof referencia.ciclos === 'number') {
    if (referencia.ciclos >= mejorPrevio) veredicto = 'mejor-del-periodo'
    else if (referencia.ciclos >= medianaPrevios) veredicto = 'sobre-la-mediana'
    else veredicto = 'bajo-la-mediana'
  }

  return {
    filas,
    comparados: previos.length,
    mejorPrevio,
    medianaPrevios,
    veredicto,
    // Cuánto se aparta de lo habitual, en piezas. Sirve para redactar la frase.
    difVsMediana: medianaPrevios != null && typeof referencia.ciclos === 'number'
      ? referencia.ciclos - medianaPrevios
      : null,
  }
}

/**
 * Lee de Firestore los turnos comparables y arma el cotejo.
 *
 * Estrategia de costo: los docs padre traen la producción en
 * `endBriefSnapshot.total` y la ventana en `scheduledStart`/`scheduledEnd`, así
 * que la selección y el volumen salen leyendo solo padres. La detención de
 * línea de cada turno previo se toma de `resumenLinea` si está cacheada; si no,
 * queda en null y el informe muestra la comparación de volumen sin la de
 * detención, en vez de gastar 3 lecturas por turno para llenar un gráfico
 * secundario.
 *
 * @param {object} p
 * @param {FirebaseFirestore.Firestore} p.db
 * @param {string} p.plant     'chonchi' | 'yal' | ...
 * @param {string} p.shiftDocId  id del doc del turno de referencia
 * @param {number} [p.dias]    cuántos días hacia atrás mirar
 * @param {number} [p.n]       cuántos turnos comparables traer
 */
async function cotejarTurnos({ db, plant, shiftDocId, dias = 21, n = 7, minPiezas = 50 }) {
  const col = db.collection('shoplogix').doc(plant).collection('shifts')
  const refDoc = await col.doc(shiftDocId).get()
  if (!refDoc.exists) throw new Error(`No existe shoplogix/${plant}/shifts/${shiftDocId}`)

  const aFila = (snap) => {
    const x = snap.data() || {}
    const resumen = x.resumenLinea || null
    return {
      id: snap.id,
      inicioMs: aMs(x.scheduledStart) ?? aMs(x.officialSchedule && x.officialSchedule.start),
      finMs: aMs(x.scheduledEnd) ?? aMs(x.officialSchedule && x.officialSchedule.end),
      ciclos: (x.endBriefSnapshot && x.endBriefSnapshot.total) ?? resumen?.ciclos ?? null,
      detencionLineaSec: resumen ? resumen.detencion.unionSec : null,
    }
  }

  const referencia = aFila(refDoc)
  if (referencia.inicioMs == null) {
    throw new Error(`El turno ${shiftDocId} no tiene ventana: no se puede cotejar por ventana`)
  }

  // Ventana de búsqueda por id de documento (los ids empiezan con la fecha).
  const desde = new Date(referencia.inicioMs - dias * 86_400_000).toISOString().slice(0, 10)
  const snap = await col
    .where('__name__', '>=', `${desde}_`)
    .where('__name__', '<=', `${shiftDocId}`)
    .get()

  const candidatos = snap.docs
    .filter((d) => !/_Unscheduled$/.test(d.id))
    .map(aFila)

  let comparables = seleccionarComparables(candidatos, referencia, { n, minPiezas })

  // Si la ventana de busqueda no alcanzo para juntar los 3 turnos que exige un
  // veredicto, se estira UNA vez y se vuelve a buscar. No es un caso raro:
  // "Turno 1 Lunes" de Chonchi existe solo los lunes, asi que en 21 dias hay 2
  // anteriores y el informe se quedaba sin lamina de cotejo por calendario, no
  // por falta de datos.
  //
  // Se estira el PLAZO, nunca la tolerancia de la ventana horaria: aflojar esa
  // mezclaria turnos distintos, que es justo lo que el emparejamiento por
  // ventana vino a evitar.
  if (comparables.length < 3 && dias < 60) {
    const desdeAmplio = new Date(referencia.inicioMs - dias * 2 * 86_400_000).toISOString().slice(0, 10)
    const snapAmplio = await col
      .where('__name__', '>=', `${desdeAmplio}_`)
      .where('__name__', '<=', `${shiftDocId}`)
      .get()
    const masCandidatos = snapAmplio.docs.filter((d) => !/_Unscheduled$/.test(d.id)).map(aFila)
    comparables = seleccionarComparables(masCandidatos, referencia, { n, minPiezas })
  }

  // NO agregar aqui un relleno que lea `machines` de los candidatos sin
  // produccion en el doc padre. Se probo y es codigo muerto: un turno sin
  // `endBriefSnapshot` es, casi siempre, un turno que NO produjo — el aviso de
  // cierre justamente se salta los turnos bajo el minimo, asi que la ausencia
  // del dato y la ausencia de produccion son la misma cosa.
  //
  // Medido el 2026-08-18 en Chonchi: de los turnos sin snapshot, los "Turno 1
  // Lunes" de julio dieron 0 ciclos reales, y los "Turno 2" dieron 0, 0, 0, 1 y
  // 17. Rellenarlos costaba 3 lecturas por turno para recuperar nada.

  return { referencia, comparables, ...armarCotejo(referencia, comparables) }
}

module.exports = {
  horaDePlanta,
  distanciaHoraria,
  esComparable,
  seleccionarComparables,
  resumirTurno,
  armarCotejo,
  cotejarTurnos,
}
