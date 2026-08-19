/**
 * lineImpact — traduce el tiempo detenido de VARIAS máquinas en paralelo al
 * tiempo que estuvo afectada la LÍNEA.
 *
 * ── El problema que resuelve ────────────────────────────────────────────────
 * El resumen de área de Shoplogix SUMA las máquinas. Un turno de 7:45 h con 3
 * evisceradoras aparece como "Duración 24:00:00" y una falla se informa como la
 * suma de lo que estuvo caída cada máquina. Caso real (Eviscerados Chonchi,
 * turno noche del 2026-08-17): "FALLA MECANICA 01:52:15". Pero de esos 112
 * minutos las tres máquinas estuvieron caídas a la vez solo 18 — el resto la
 * línea siguió produciendo con capacidad reducida. Informar el 1:52 como
 * impacto sobreestima por 3.
 *
 * Este módulo entrega las cuatro medidas y deja que quien informe elija:
 *   sumaSec     → lo que muestra Shoplogix (horas-máquina). Sirve para cotejar.
 *   unionSec    → al menos una máquina detenida.
 *   todasSec    → TODAS detenidas a la vez = línea muerta de verdad.
 *   equivalente → sumaSec / nº de máquinas = pérdida de capacidad, en minutos
 *                 de línea completa. Es la que se traduce a piezas.
 *
 * ── Qué NO hace este módulo ─────────────────────────────────────────────────
 * No estima piezas perdidas. Decir "sin la falla habríamos hecho X más" supone
 * que había materia prima esperando y que todo lo demás se habría comportado
 * igual: un turno ideal que no ocurrió. Lo que sí se puede afirmar —cuánto cayó
 * el ritmo y cuánto demoró en volver— sale de `ritmoDelTurno` y `recuperacion`.
 *
 * ── Limitación conocida: el denominador ─────────────────────────────────────
 * `equivalenteLineaSec` divide por TODAS las máquinas del turno. Si una queda
 * fuera de servicio la noche entera (mantención mayor, repuesto que no llegó),
 * la línea corrió con 2 y el equivalente igual divide por 3: subestima el
 * impacto de cada falla en un tercio.
 *
 * No se corrige acá a propósito. Para saber que una máquina "no estaba" hay que
 * distinguir tres cosas que desde `states` se ven casi iguales: fuera de
 * servicio, disponible pero sin producto, y detenida por la falla que estamos
 * midiendo. Elegir mal cambia el denominador y por lo tanto la cifra que se
 * lleva a la reunión — es peor equivocarse en silencio que dividir de más.
 *
 * Mitigación mientras tanto: `porMaquina` viene siempre en cada fila. Una
 * máquina con 0 eventos y 0 ciclos en todo el turno es la señal de que hay que
 * mirar el caso a mano. Decisión de Orel el 2026-08-18: documentarlo y seguir.
 *
 * ── Escalas de tiempo ───────────────────────────────────────────────────────
 * Todo acá es aritmética de DURACIONES, así que es inmune al enredo de
 * wall-clock-as-UTC que arrastra el resto del pipeline (ver el comentario largo
 * en checkShiftEndBriefs). Los instantes se devuelven en ms tal como llegaron,
 * SIN convertir: quien formatee debe usar getters UTC, igual que el resto del
 * código que toca `intervals`/`states`.
 *
 * ── Taxonomía ───────────────────────────────────────────────────────────────
 * A propósito NO importa el árbol de imputación: agrupa por el `reason` crudo y
 * acepta un `clasificar(reason)` opcional para colgarle etiquetas. Así este
 * archivo se testea solo y la taxonomía se enchufa aparte.
 */

// ── Helpers de tiempo ────────────────────────────────────────────────────────

/** Acepta Date, Firestore Timestamp o ms. Devuelve ms (o null si no se puede). */
function aMs(t) {
  if (t == null) return null
  if (typeof t === 'number') return t
  if (t instanceof Date) return t.getTime()
  if (typeof t.toDate === 'function') return t.toDate().getTime()
  if (typeof t._seconds === 'number') return t._seconds * 1000 + Math.round((t._nanoseconds || 0) / 1e6)
  return null
}

/**
 * Recorta [a,b] contra la ventana. Devuelve null si no se tocan.
 * Sin este recorte, un paro que cruza el borde del turno se cuenta completo en
 * los dos turnos adyacentes — la misma duplicación que ya arregló
 * `clipStateToWindow` en normalizer.js.
 */
function recortar(a, b, desde, hasta) {
  const ini = desde == null ? a : Math.max(a, desde)
  const fin = hasta == null ? b : Math.min(b, hasta)
  return fin > ini ? [ini, fin] : null
}

/** Une intervalos solapados de UNA máquina para no contar dos veces el mismo instante. */
function fusionar(intervalos) {
  const orden = intervalos.filter(Boolean).slice().sort((x, y) => x[0] - y[0])
  const out = []
  for (const iv of orden) {
    const ult = out[out.length - 1]
    if (ult && iv[0] <= ult[1]) ult[1] = Math.max(ult[1], iv[1])
    else out.push([iv[0], iv[1]])
  }
  return out
}

// ── Solapamiento ─────────────────────────────────────────────────────────────

/**
 * Perfil de solapamiento por barrido de eventos.
 *
 * `porMaquina` es un array (una entrada por máquina) de arrays de [inicioMs, finMs].
 * Devuelve cuántos segundos hubo con exactamente k máquinas detenidas, para
 * k = 0..n, más los agregados que se usan al informar.
 */
function perfilDeSolapamiento(porMaquina) {
  const n = porMaquina.length
  const puntos = []
  for (const lista of porMaquina) {
    for (const [a, b] of fusionar(lista)) {
      puntos.push([a, 1])
      puntos.push([b, -1])
    }
  }
  // El cierre (-1) va antes que la apertura (+1) en el mismo instante: dos
  // paros que se tocan exactamente no son un instante con 2 máquinas caídas.
  puntos.sort((x, y) => x[0] - y[0] || x[1] - y[1])

  const porNivel = new Array(n + 1).fill(0)
  let nivel = 0
  let previo = null
  for (const [t, delta] of puntos) {
    if (previo !== null && t > previo) porNivel[nivel] += t - previo
    nivel += delta
    previo = t
  }

  const seg = (ms) => Math.round(ms / 1000)
  const porNivelSec = porNivel.map(seg)
  return {
    maquinas: n,
    porNivelSec,                                                   // idx = nº de máquinas caídas
    unionSec: porNivelSec.slice(1).reduce((a, b) => a + b, 0),     // al menos una
    todasSec: n > 0 ? porNivelSec[n] : 0,                          // línea muerta
  }
}

// ── Impacto por causa ────────────────────────────────────────────────────────

/** Un state cuenta como detención no programada. `break` (colación) va aparte. */
function esDetencion(s) {
  return s.type === 'downtime'
}

/**
 * Impacto de cada causa, medido contra la línea.
 *
 * @param {object}   p
 * @param {Array}    p.machines      docs de máquina con `states[]` y `machineName`
 * @param {*}        [p.windowStart] recorta los states a la ventana del turno
 * @param {*}        [p.windowEnd]
 * @param {Function} [p.incluir]     filtro (state) => bool. Por defecto, detenciones
 * @param {Function} [p.clasificar]  (reason) => {label, categoria, bucket} para etiquetar
 * @returns {Array} una fila por causa, ordenada por equivalente de línea desc
 */
function impactoPorCausa({ machines, windowStart, windowEnd, incluir = esDetencion, clasificar }) {
  const desde = aMs(windowStart)
  const hasta = aMs(windowEnd)
  const nMaquinas = machines.length

  // reason → { porMaquina: Map(nombre → intervalos), eventos }
  const porCausa = new Map()

  for (const m of machines) {
    const nombre = m.machineName || m.machineid || '(sin nombre)'
    for (const s of m.states || []) {
      if (!incluir(s)) continue
      const a = aMs(s.startAt)
      const b = aMs(s.endAt)
      if (a == null || b == null) continue
      const iv = recortar(a, b, desde, hasta)
      if (!iv) continue

      // El reason vacío es un dato en sí: son los paros que nadie imputó, y hay
      // que mostrarlos, no esconderlos dentro de otra causa.
      const reason = (s.reason || '').trim() || '(sin causa imputada)'
      // Micro Detencion llega SIEMPRE con reason vacío: separarla de los paros
      // grandes sin imputar, o el informe acusa de "sin causa" al ruido normal.
      const clave = s.name === 'Micro Detencion' ? '(micro detenciones)' : reason

      let e = porCausa.get(clave)
      if (!e) {
        e = {
          porMaquina: new Map(),
          eventos: 0,
          // El reason TAL CUAL llegó, aunque venga vacío: el clasificador
          // necesita distinguir "nadie imputó" de "imputó algo raro", y si acá
          // se guardara el texto de relleno "(sin causa imputada)" lo leería
          // como una causal desconocida.
          reasonCrudo: s.reason || '',
          esMicro: s.name === 'Micro Detencion',
        }
        porCausa.set(clave, e)
      }
      if (!e.porMaquina.has(nombre)) e.porMaquina.set(nombre, [])
      e.porMaquina.get(nombre).push(iv)
      e.eventos += 1
    }
  }

  const filas = []
  for (const [causa, e] of porCausa) {
    // Máquinas SIN esta causa entran como lista vacía: el perfil necesita saber
    // cuántas máquinas hay en total para que "todas detenidas" sea correcto.
    const listas = machines.map((m) => e.porMaquina.get(m.machineName || m.machineid) || [])
    const perfil = perfilDeSolapamiento(listas)

    const porMaquina = machines.map((m) => {
      const nombre = m.machineName || m.machineid || '(sin nombre)'
      const ivs = fusionar(e.porMaquina.get(nombre) || [])
      return {
        maquina: nombre,
        sec: Math.round(ivs.reduce((a, [x, y]) => a + (y - x), 0) / 1000),
        eventos: (e.porMaquina.get(nombre) || []).length,
      }
    })

    const sumaSec = porMaquina.reduce((a, x) => a + x.sec, 0)
    filas.push({
      causa,
      // Las micro detenciones no llevan causal por diseño, no por descuido:
      // marcarlas para que el informe no las acuse de "sin imputar" ni de
      // "causal desconocida".
      esMicro: e.esMicro,
      eventos: e.eventos,
      sumaSec,                                                        // lo que muestra Shoplogix
      unionSec: perfil.unionSec,                                      // ≥1 máquina detenida
      todasSec: perfil.todasSec,                                      // línea muerta
      equivalenteLineaSec: nMaquinas > 0 ? Math.round(sumaSec / nMaquinas) : 0,
      porNivelSec: perfil.porNivelSec,
      porMaquina,
      imputacion: clasificar ? clasificar(e.reasonCrudo, { esMicro: e.esMicro }) : null,
    })
  }

  return filas.sort((a, b) => b.equivalenteLineaSec - a.equivalenteLineaSec)
}

// ── Ritmo del turno ──────────────────────────────────────────────────────────

/**
 * Parte el turno en bloques de `pasoMin` y calcula el ritmo de la LÍNEA en cada
 * uno, sumando los ciclos de las tres máquinas.
 *
 * `ritmoNormal` es la mediana de los bloques limpios: bloques que ningún paro
 * grande ni pausa programada toca. Las micro detenciones NO descalifican un
 * bloque — son parte de andar normal, y si se excluyeran no quedaría casi
 * ningún bloque limpio.
 *
 * Ojo: es la velocidad que la línea DEMOSTRÓ esa misma noche, no una meta. Por
 * eso sirve de vara — nadie puede discutir que era alcanzable.
 */
function ritmoDelTurno({ machines, windowStart, windowEnd, pasoMin = 5 }) {
  const pasoMs = pasoMin * 60_000
  const desde = aMs(windowStart)
  const hasta = aMs(windowEnd)

  // Ciclos por bloque, sumando las máquinas. Se usa el inicio del interval como
  // clave: Shoplogix ya los entrega alineados a la misma grilla en todas.
  const ciclos = new Map()
  const sucios = []
  for (const m of machines) {
    for (const iv of m.intervals || []) {
      const a = aMs(iv.startAt)
      if (a == null) continue
      if (desde != null && a < desde) continue
      if (hasta != null && a >= hasta) continue
      const k = Math.floor(a / pasoMs) * pasoMs
      ciclos.set(k, (ciclos.get(k) || 0) + (iv.cycles || 0))
    }
    for (const s of m.states || []) {
      const esParoGrande = s.type === 'downtime' && s.name !== 'Micro Detencion'
      const esPausa = s.type === 'break'
      if (!esParoGrande && !esPausa) continue
      const a = aMs(s.startAt)
      const b = aMs(s.endAt)
      if (a == null || b == null) continue
      const iv = recortar(a, b, desde, hasta)
      if (iv) sucios.push(iv)
    }
  }

  const claves = [...ciclos.keys()].sort((a, b) => a - b)
  const sucioFusionado = fusionar(sucios)
  const tocado = (ini) => sucioFusionado.some(([a, b]) => a < ini + pasoMs && b > ini)

  const bloques = claves.map((k) => ({
    inicioMs: k,
    ciclos: ciclos.get(k),
    piezasPorMin: ciclos.get(k) / pasoMin,
    limpio: !tocado(k),
  }))

  const limpios = bloques.filter((b) => b.limpio).map((b) => b.piezasPorMin).sort((a, b) => a - b)
  const ritmoNormal = limpios.length ? limpios[Math.floor(limpios.length / 2)] : null

  return { pasoMin, bloques, ritmoNormal, bloquesLimpios: limpios.length }
}

/**
 * Cuánto demoró la línea en volver a su ritmo normal después de `desdeMs`.
 *
 * Es la medida de CONTENCIÓN: lo que Mantención controla de verdad. Una falla
 * larga que se recupera en 7 minutos y no deja arrastre es un turno bien
 * manejado; una falla corta que deja la línea a media máquina el resto de la
 * noche, no.
 *
 * @param {number} [umbral=0.9] fracción del ritmo normal que cuenta como "volvió"
 * @returns {{volvioMs:number|null, minutos:number|null}}
 */
function recuperacion({ bloques, ritmoNormal, desdeMs, umbral = 0.9 }) {
  if (!ritmoNormal) return { volvioMs: null, minutos: null }
  const objetivo = ritmoNormal * umbral
  const b = bloques.find((x) => x.inicioMs >= desdeMs && x.piezasPorMin >= objetivo)
  if (!b) return { volvioMs: null, minutos: null }
  return { volvioMs: b.inicioMs, minutos: Math.round((b.inicioMs - desdeMs) / 60_000) }
}

/**
 * Agrupa los bloques en tramos consecutivos por encima/debajo del ritmo normal.
 * Es lo que arma la tabla "tramo por tramo" del informe.
 *
 * `minMinutos` existe porque sin él esto no sirve para informar: contra el turno
 * real del 17-08 salían 26 tramos, la mitad de 5 minutos, porque un bloque al
 * 89% y el siguiente al 91% abren y cierran tramo. Eso no es información, es
 * parpadeo del umbral. Los tramos más cortos que `minMinutos` se absorben en el
 * vecino y el estado se recalcula sobre el tramo ya fusionado, así que un bache
 * corto solo parte el turno si de verdad arrastra al tramo entero bajo el
 * umbral. Con 15 min el mismo turno queda en 6 tramos, que es lo que se lee.
 */
function tramosDeRitmo({ bloques, ritmoNormal, pasoMin, umbral = 0.9, minMinutos = 15 }) {
  if (!ritmoNormal || !bloques.length) return []
  const objetivo = ritmoNormal * umbral
  const tramos = []
  for (const b of bloques) {
    const enRitmo = b.piezasPorMin >= objetivo
    const ult = tramos[tramos.length - 1]
    if (ult && ult.enRitmo === enRitmo) {
      ult.finMs = b.inicioMs + pasoMin * 60_000
      ult.ciclos += b.ciclos
      ult.bloques += 1
    } else {
      tramos.push({
        enRitmo,
        inicioMs: b.inicioMs,
        finMs: b.inicioMs + pasoMin * 60_000,
        ciclos: b.ciclos,
        bloques: 1,
      })
    }
  }
  // Absorber los tramos demasiado cortos para informar.
  const objetivoRitmo = ritmoNormal * umbral

  /**
   * Une vecinos que quedaron del mismo estado. Hace falta después de cada
   * absorción: al fusionar un bache dentro del tramo anterior, ese tramo puede
   * volver a estar EN RITMO y quedar pegado al que venía después — dos tramos
   * idénticos seguidos, que en la tabla se leen como si algo hubiera pasado
   * entre medio cuando no pasó nada.
   */
  const unirVecinosIguales = () => {
    for (let k = tramos.length - 1; k > 0; k--) {
      if (tramos[k].enRitmo !== tramos[k - 1].enRitmo) continue
      tramos[k - 1] = {
        ...tramos[k - 1],
        finMs: tramos[k].finMs,
        ciclos: tramos[k - 1].ciclos + tramos[k].ciclos,
        bloques: tramos[k - 1].bloques + tramos[k].bloques,
      }
      tramos.splice(k, 1)
    }
  }

  while (tramos.length > 1) {
    const i = tramos.findIndex((t) => t.bloques * pasoMin < minMinutos)
    if (i === -1) break
    // El primero solo puede fusionarse hacia adelante; el resto, hacia atrás.
    const j = i === 0 ? 1 : i - 1
    const [a, b] = i < j ? [tramos[i], tramos[j]] : [tramos[j], tramos[i]]
    const unido = {
      inicioMs: a.inicioMs,
      finMs: b.finMs,
      ciclos: a.ciclos + b.ciclos,
      bloques: a.bloques + b.bloques,
      enRitmo: false,
    }
    unido.enRitmo = (unido.ciclos / (unido.bloques * pasoMin)) >= objetivoRitmo
    tramos.splice(Math.min(i, j), 2, unido)
    unirVecinosIguales()
  }

  return tramos.map((t) => {
    const min = t.bloques * pasoMin
    return { ...t, minutos: min, piezasPorMin: t.ciclos / min, pctDelRitmo: (t.ciclos / min) / ritmoNormal }
  })
}

/**
 * Reparte las piezas que faltaron para el ritmo normal segun EN QUE ESTABA la
 * linea cuando faltaron. Es la medida de contencion.
 *
 * Las fallas van a ocurrir siempre; lo que se puede mejorar es cuanto de la
 * perdida ocurre con la linea parada —inevitable— y cuanto despues, mientras
 * vuelve a tomar ritmo. Por eso se separan tres cosas que se arreglan distinto:
 *
 *   parado      La linea no produce (bajo `umbralParo` del ritmo normal).
 *   reenganche  Desde que vuelve a producir hasta alcanzar el ritmo. ESTE es el
 *               que se acorta conteniendo bien.
 *   degradado   Anda bajo el ritmo SIN paro grande. No es contencion: son micro
 *               detenciones o abastecimiento, y se ataca con otra palanca.
 *
 * ── Por que el reenganche va acotado ────────────────────────────────────────
 * Sin tope, cualquier tramo lento posterior a una caida se cuenta como
 * "arranque lento". Medido contra el turno real del 2026-08-18 en Chonchi, una
 * version sin tope atribuia 2.766 piezas a un arranque de 90 minutos — y al
 * mirar los eventos, la linea habia estado PRODUCIENDO todo ese rato, llena de
 * micro detenciones y acumulacion de rechazo. Eso no es un reenganche lento y
 * cargarselo a Mantencion seria apuntar al culpable equivocado.
 *
 * Por eso el reenganche se corta a los `maxReengancheMin` y se interrumpe si la
 * linea vuelve a caer o entra una pausa. Lo que queda afuera cae en `degradado`,
 * que es lo que de verdad es.
 *
 * El tope se calibra con la realidad de la maquina, no con la teoria: partio en
 * 20 min y Orel lo subio a 30 el 2026-08-18, despues de ver que en el turno del
 * 17-08 una de las tres caidas tocaba el tope exacto — señal de que la Baader
 * tarda mas que eso en tomar ritmo y que el corte estaba mandando reenganche
 * real al saco de `degradado`.
 *
 * Las pausas programadas se contabilizan aparte: no son perdida por falla.
 */
function repartoDePerdida({
  machines, bloques, ritmoNormal, pasoMin,
  maxReengancheMin = 30, umbralParo = 0.5, umbralRitmo = 0.9,
}) {
  const vacio = { paradoPz: 0, reenganchePz: 0, degradadoPz: 0, pausadoPz: 0, totalPz: 0, eventos: [] }
  if (!ritmoNormal || !bloques || !bloques.length) return vacio

  const pausas = fusionar(
    (machines || []).flatMap((m) => (m.states || [])
      .filter((s) => s.type === 'break')
      .map((s) => [aMs(s.startAt), aMs(s.endAt)])
      .filter(([a, b]) => a != null && b != null)),
  )
  const pasoMs = pasoMin * 60_000
  const esPausa = (ini) => pausas.some(([a, b]) => a < ini + pasoMs && b > ini)
  const potencial = pasoMin * ritmoNormal
  const falta = (b) => Math.max(potencial - b.ciclos, 0)

  let paradoPz = 0
  let reenganchePz = 0
  let degradadoPz = 0
  let pausadoPz = 0
  const eventos = []

  let i = 0
  while (i < bloques.length) {
    const b = bloques[i]
    if (esPausa(b.inicioMs)) { pausadoPz += falta(b); i++; continue }

    if (b.piezasPorMin < ritmoNormal * umbralParo) {
      const ini = i
      let pzParo = 0
      while (i < bloques.length
             && bloques[i].piezasPorMin < ritmoNormal * umbralParo
             && !esPausa(bloques[i].inicioMs)) {
        pzParo += falta(bloques[i]); i++
      }
      let j = i
      let pzRe = 0
      while (j < bloques.length
             && bloques[j].piezasPorMin < ritmoNormal * umbralRitmo
             && bloques[j].piezasPorMin >= ritmoNormal * umbralParo
             && !esPausa(bloques[j].inicioMs)
             && (j - i) * pasoMin < maxReengancheMin) {
        pzRe += falta(bloques[j]); j++
      }
      paradoPz += pzParo
      reenganchePz += pzRe
      eventos.push({
        inicioMs: bloques[ini].inicioMs,
        minParo: (i - ini) * pasoMin,
        minReenganche: (j - i) * pasoMin,
        pzParo: Math.round(pzParo),
        pzReenganche: Math.round(pzRe),
      })
      i = j
    } else if (b.piezasPorMin < ritmoNormal * umbralRitmo) {
      degradadoPz += falta(b); i++
    } else i++
  }

  const redondear = (n) => Math.round(n)
  return {
    paradoPz: redondear(paradoPz),
    reenganchePz: redondear(reenganchePz),
    degradadoPz: redondear(degradadoPz),
    pausadoPz: redondear(pausadoPz),
    totalPz: redondear(paradoPz + reenganchePz + degradadoPz),
    eventos,
    maxReengancheMin,
  }
}

/**
 * Ocupación de la cadena: qué fracción de la capacidad que PASÓ se llenó.
 *
 * ── Qué mide y por qué no es "velocidad" ────────────────────────────────────
 * En Filete la Baader 200 la alimenta un operador: la cadena gira siempre a su
 * velocidad nominal (18 pz/min, 5 silletas) y el sensor cuenta cada vez que se
 * posiciona un pescado. Si el operador se salta silletas, el sensor cuenta
 * menos — pero la maquina nunca bajo el ritmo.
 *
 * Shoplogix compara lo contado contra la capacidad nominal y llama a la
 * diferencia "perdida de velocidad" (verificado: su `expectedTotalCycles` de un
 * turno de Filete equivale exactamente a 18 pz/min). Ese nombre manda a buscar
 * el problema en la maquina, cuando lo que hubo fueron silletas vacias.
 *
 * Este calculo dice lo mismo con el nombre correcto: de cada 10 silletas que
 * pasaron, cuantas iban llenas.
 *
 * ── Evidencia de que el modelo es el correcto ───────────────────────────────
 * Seis turnos de Filete (ago-2026): el bucket mas rapido de toda la muestra
 * marco 17,0 pz/min y NINGUNO paso de 18. Si el sensor midiera otra cosa o la
 * maquina pudiera correr mas, habria valores por encima del nominal. No los hay.
 *
 * ⚠ El nominal es de la MAQUINA, no una meta de produccion: es la capacidad
 * fisica que pasa por el sensor. Cambiarlo por un objetivo comercial convierte
 * esto en otra cosa.
 *
 * ⚠ Solo se cuenta el tiempo en que la cadena estaba EN MARCHA (uptime). Una
 * maquina detenida no deja pasar silletas vacias: eso ya lo mide el paro.
 */
function ocupacionDeCadena({ machines, ritmoNominal, windowStart, windowEnd }) {
  if (!(ritmoNominal > 0) || !machines || !machines.length) return null
  const desde = aMs(windowStart)
  const hasta = aMs(windowEnd)

  let minutosEnMarcha = 0
  for (const m of machines) {
    for (const st of m.states || []) {
      if (st.type !== 'uptime') continue
      const a = aMs(st.startAt)
      const b = aMs(st.endAt)
      if (a == null || b == null) continue
      const iv = recortar(a, b, desde, hasta)
      if (iv) minutosEnMarcha += (iv[1] - iv[0]) / 60_000
    }
  }
  if (!(minutosEnMarcha > 0)) return null

  const llenas = machines.reduce((a, m) => a + (m.totalCycles || 0), 0)
  const pasaron = Math.round(ritmoNominal * minutosEnMarcha)
  const vacias = Math.max(pasaron - llenas, 0)
  return {
    ritmoNominal,
    minutosEnMarcha: Math.round(minutosEnMarcha),
    pasaron,
    llenas,
    vacias,
    ocupacion: pasaron > 0 ? llenas / pasaron : null,
  }
}

module.exports = {
  aMs,
  repartoDePerdida,
  ocupacionDeCadena,
  recortar,
  fusionar,
  perfilDeSolapamiento,
  impactoPorCausa,
  ritmoDelTurno,
  recuperacion,
  tramosDeRitmo,
}
