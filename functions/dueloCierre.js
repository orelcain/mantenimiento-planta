/**
 * Cierre congelado del Duelo de equipos: jornada, semana, ciclo y mes (fase 2 de
 * ARIA_MANTENIMIENTO_PLANTA/docs/PLAN_CIERRE_DUELO.md, 29-10-2026).
 *
 * Por qué existe: el Duelo «Semana y mes» se recalculaba en cada corrida desde
 * `shiftStats`, así que lo ya jugado podía cambiar (una imputación tardía, una
 * corrección de equipo, o el arranque de Eviscerado que queda «sin dato» cuando
 * su serie minuto a minuto sale del archivo de 6 turnos). Acá cada jornada se
 * sella a los 3 días de gracia y semana, ciclo y mes se suman desde lo sellado.
 *
 * ⚠ La regla del marcador NO vive acá: sale de `lib/dueloNucleo.cjs`, el mismo
 * código de la PWA empaquetado (`scripts/build-duelo-nucleo.mjs`). Este módulo
 * solo decide QUÉ se recalcula, QUÉ se sella y DÓNDE se guarda.
 *
 * Puro (sin Firestore): la Function `cerrarDuelo` lee los insumos y escribe.
 */
const N = require('./lib/dueloNucleo.cjs')

/** Versión de esta lógica de cierre. Lo sellado con otra versión NO se recalcula. */
const CIERRE_V = 1
/** Días de gracia: el re-sync de Shoplogix trae imputaciones hasta J+3 a las 12:00; se sella en J+4. */
const GRACIA_DIAS = 3
/** Primer mes con cierre: `shiftStats` (62 turnos) arranca el 24-09 y septiembre quedaría cojo. */
const CIERRE_DESDE = '2026-10'

const DIA_MS = 86_400_000
const sumarDias = (dk, n) => new Date(Date.parse(`${dk}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10)
const lunesDe = (dk) => sumarDias(dk, -((new Date(`${dk}T12:00:00Z`).getUTCDay() + 6) % 7))
const ultimoDiaDelMes = (mes) => {
  const [y, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10)
}
const mesAnterior = (mes) => sumarDias(`${mes}-01`, -1).slice(0, 7)
/** Un período que termina en `fin` queda fijo cuando su última jornada ya se selló. */
const vencido = (fin, hoyKey) => hoyKey >= sumarDias(fin, GRACIA_DIAS + 1)
/** Firestore rechaza `undefined` y el write cae ENTERO (gotcha del 16-08): todo pasa por JSON. */
const limpio = (x) => JSON.parse(JSON.stringify(x))
const r1 = (v) => Math.round(v * 10) / 10

/** El marcador del día contra la noche de su jornada, sin las filas de texto (se rearman desde los resúmenes). */
function marcadorCompacto(m) {
  if (!m) return null
  if (m.sinDuelo) return { sinDuelo: true, motivo: m.motivo }
  return {
    ganador: m.ganador,
    pA: m.puntosA,
    pB: m.puntosB,
    posibles: m.puntosPosibles,
    kpis: m.kpis.map((k) => [k.id, k.ganador]),
    puestos: m.puestos.map((p) => [p.etiqueta, p.ganador]),
  }
}

/** Lo que se guarda de un turno: su resumen del duelo + la micro del stat (para sumar por equipo y por Baader). */
function turnoGuardado(resumen, stat) {
  return {
    r: resumen,
    mic: stat?.duelo?.mic ?? null,
    micM: Array.isArray(stat?.duelo?.micM) ? stat.duelo.micM : [],
    maq: Array.isArray(stat?.porMaquina) ? stat.porMaquina.map((m) => m.n) : [],
  }
}

/**
 * ⚠ La serie minuto a minuto solo se archiva para los últimos 6 turnos (3 jornadas), menos que la gracia: sin ella el
 * arranque de Eviscerado (`ritmo90`) cae a «sin dato». Si la provisoria anterior ya lo tenía medido, se conserva.
 */
function conArranqueConservado(nuevo, anterior) {
  const a = anterior?.r
  if (!a || nuevo.arranqueMin != null || a.arranqueMin == null || a.arranqueModo !== nuevo.arranqueModo) return nuevo
  return { ...nuevo, arranqueMin: a.arranqueMin }
}

/** Una jornada provisoria con sus dos turnos; el marcador lo da el núcleo, igual que en pantalla. */
function armarJornada(jornada, turnos, anterior, ahoraIso) {
  const noche = turnos.find((t) => t.r.esNoche) ?? null
  const dia = turnos.find((t) => !t.r.esNoche) ?? null
  const n = noche ? { ...noche, r: conArranqueConservado(noche.r, anterior?.noche) } : anterior?.noche ?? null
  const d = dia ? { ...dia, r: conArranqueConservado(dia.r, anterior?.dia) } : anterior?.dia ?? null
  /* Mismo cruce que `duelosDeTurnos`: el día contra la noche de su jornada, si son de equipos distintos. */
  const hayDuelo = n && d && n.r.equipo !== d.r.equipo
  return {
    jornada,
    estado: 'provisoria',
    calculadaAt: ahoraIso,
    ...(n ? { noche: n } : {}),
    ...(d ? { dia: d } : {}),
    marcador: hayDuelo ? marcadorCompacto(N.compararTurnos(d.r, n.r)) : null,
  }
}

/** Resumen de un período desde las jornadas guardadas: puntos con el núcleo + piezas, costo y micro por equipo. */
function resumenPeriodo(tipo, clave, jornadas, hoyKey) {
  const resumenes = []
  const micro = { rebolledo: 0, cardenas: 0 }
  const microBaader = {}
  const pzTotal = { rebolledo: 0, cardenas: 0 }
  for (const j of jornadas) {
    for (const t of [j.noche, j.dia]) {
      if (!t) continue
      resumenes.push(t.r)
      pzTotal[t.r.equipo] += t.r.piezas || 0
      micro[t.r.equipo] += t.mic || 0
      t.micM.forEach((v, i) => {
        const k = t.maq[i] ?? `#${i + 1}`
        microBaader[k] = microBaader[k] || { rebolledo: 0, cardenas: 0 }
        microBaader[k][t.r.equipo] += v || 0
      })
    }
  }
  const duelos = N.duelosDeTurnos(resumenes)
  const base = tipo === 'ciclo'
    ? N.marcadorDeCiclo(duelos, N.cicloDe(clave).indice, N.cicloDe(hoyKey).indice)
    : N.marcadorDePeriodo(duelos, tipo, clave, hoyKey)
  for (const e of N.EQUIPOS) micro[e] = r1(micro[e])
  for (const k of Object.keys(microBaader)) for (const e of N.EQUIPOS) microBaader[k][e] = r1(microBaader[k][e])
  return { marcador: base, pzTotal, costo: N.costoMantencion(resumenes), micro, microBaader, jornadas: jornadas.length }
}

/**
 * El doc del mes `mes` para una línea.
 *
 * @param {object} p
 * @param {string} p.mes                    `YYYY-MM` (por JORNADA, no por reloj: la noche del 31-10 21:00 es del 01-11).
 * @param {Array}  p.stats                  `shiftStats` del monitor de línea.
 * @param {object} [p.overrides]            `monitor_config/{token}.duelo.overrides`.
 * @param {Array}  [p.maquinas]             `live.machines` (decide el modo de arranque: Baader 142 = ritmo 90 %).
 * @param {Array}  [p.series]               `seriesMinuto` archivadas.
 * @param {object} [p.previo]               doc de este mes ya guardado (o null).
 * @param {object} [p.previoAnterior]       doc del mes anterior (semanas y ciclos que cruzan el borde).
 * @param {string} p.hoyKey                 jornada de hoy (hora de planta).
 * @param {string} [p.ahoraIso]
 * @returns {{ doc: object, sellados: string[] }} `sellados` = turnos que pasaron a sellados en esta corrida (para el cuadre).
 */
function calcularMes({ planta, mes, stats, overrides = {}, maquinas = [], series = [], previo = null, previoAnterior = null, hoyKey, ahoraIso = new Date().toISOString() }) {
  const modo = N.modoArranqueDe(N.unidadDeMaquinas(maquinas))
  const stat = new Map((stats || []).map((s) => [s.shiftDocId, s]))
  const resumenes = N.resumenesDeStats(stats || [], overrides, modo, series)
  const porJornada = new Map()
  for (const r of resumenes) {
    if (r.jornada.slice(0, 7) !== mes) continue
    if (!porJornada.has(r.jornada)) porJornada.set(r.jornada, [])
    porJornada.get(r.jornada).push(turnoGuardado(r, stat.get(r.shiftDocId)))
  }

  const antes = previo?.jornadas || {}
  const jornadas = {}
  const sellados = []
  const claves = new Set([...Object.keys(antes), ...porJornada.keys()])
  for (const j of [...claves].sort()) {
    const viejo = antes[j]
    if (viejo?.estado === 'sellada') { jornadas[j] = viejo; continue }
    /* Una jornada que todavía no termina (su día no cerró) no se guarda: la noche sola no compite. */
    if (j > hoyKey) continue
    const nueva = porJornada.has(j) ? armarJornada(j, porJornada.get(j), viejo, ahoraIso) : viejo
    if (!nueva) continue
    if (vencido(j, hoyKey)) {
      nueva.estado = 'sellada'
      nueva.selladaAt = ahoraIso
      for (const t of [nueva.noche, nueva.dia]) if (t) sellados.push(t.r.shiftDocId)
    }
    jornadas[j] = nueva
  }

  /* Semanas y ciclos se guardan en el mes de su ÚLTIMO día; pueden necesitar jornadas del mes anterior. */
  const todas = { ...(previoAnterior?.jornadas || {}), ...jornadas }
  const entre = (ini, fin) => Object.keys(todas).filter((k) => k >= ini && k <= fin).sort().map((k) => todas[k])
  const periodo = (tipo, clave, ini, fin, viejo) => {
    if (viejo?.estado === 'sellado') return viejo
    /* Un período que empieza antes del primer mes con cierre quedaría a medias: no se arma. */
    if (ini < `${CIERRE_DESDE}-01`) return null
    const js = entre(ini, fin)
    if (js.length === 0) return null
    const sellable = vencido(fin, hoyKey) && js.every((x) => x.estado === 'sellada')
    return { estado: sellable ? 'sellado' : 'provisorio', inicio: ini, fin, ...resumenPeriodo(tipo, clave, js, hoyKey), ...(sellable ? { selladoAt: ahoraIso } : {}) }
  }

  const semanas = {}
  const ciclos = {}
  const fechas = Object.keys(jornadas)
  for (const lunes of new Set(fechas.map(lunesDe))) {
    const dom = sumarDias(lunes, 6)
    if (dom.slice(0, 7) !== mes) continue
    const s = periodo('semana', lunes, lunes, dom, previo?.semanas?.[lunes])
    if (s) semanas[lunes] = s
  }
  for (const c of new Set(fechas.map((k) => N.cicloDe(k).inicio))) {
    const { fin } = N.cicloDe(c)
    if (fin.slice(0, 7) !== mes) continue
    const s = periodo('ciclo', c, c, fin, previo?.ciclos?.[c])
    if (s) ciclos[c] = s
  }
  const resMes = periodo('mes', mes, `${mes}-01`, ultimoDiaDelMes(mes), previo?.mes)

  const doc = limpio({
    v: CIERRE_V,
    planta,
    mes,
    actualizadoAt: ahoraIso,
    modoArranque: modo,
    jornadas,
    semanas,
    ciclos,
    ...(resMes ? { resumen: resMes } : {}),
  })
  return { doc, sellados }
}

/**
 * Meses a recalcular hoy: los de las jornadas aún en gracia o recién vencidas, y el anterior mientras no esté sellado
 * (si la corrida del día 4 falla, el mes se sella en la siguiente). Nunca antes de CIERRE_DESDE.
 */
function mesesAProcesar(hoyKey, anteriorSellado = false) {
  const meses = new Set([sumarDias(hoyKey, -(GRACIA_DIAS + 1)).slice(0, 7), hoyKey.slice(0, 7)])
  if (!anteriorSellado) meses.add(mesAnterior(hoyKey.slice(0, 7)))
  return [...meses].filter((m) => m >= CIERRE_DESDE).sort()
}

const PLANTAS_DUELO = Object.freeze(['chonchi', 'filete'])
const COLECCION = 'dueloCierres'

/** Piezas del turno según Shoplogix (`officialLive`, o la suma de máquinas del padre). null sin dato. */
function piezasShoplogix(padre) {
  if (!padre) return null
  if (Number.isFinite(padre.officialLive?.totalCycles)) return padre.officialLive.totalCycles
  const ms = Array.isArray(padre.machines) ? padre.machines : []
  return ms.length ? ms.reduce((a, m) => a + (m.totalCycles || 0), 0) : null
}

/**
 * Una corrida para una planta: lee el monitor de línea, recalcula los meses abiertos y escribe `dueloCierres`.
 * Lecturas: monitor (1) + config (1) + docs de mes (≤ 3) + padres de los turnos que se sellan (≈ 2 por día).
 */
async function ejecutarCierre(db, planta, { hoyKey, ahoraIso = new Date().toISOString(), logger = console } = {}) {
  const snap = await db.collection('publicShiftMonitors').where('scope', '==', `line|${planta}`).limit(1).get()
  if (snap.empty) { logger.warn(`[cerrarDuelo][${planta}] sin monitor de línea`); return { planta, meses: [] } }
  const monitorDoc = snap.docs[0]
  const monitor = monitorDoc.data() || {}
  const config = (await db.doc(`monitor_config/${monitorDoc.id}`).get()).data() || {}
  const insumos = {
    planta,
    stats: monitor.shiftStats || [],
    overrides: config.duelo?.overrides || {},
    maquinas: (monitor.live?.machines || []).map((m) => ({ name: m.name, model: m.model ?? null })),
    series: monitor.seriesMinuto || [],
    hoyKey,
    ahoraIso,
  }
  const refMes = (m) => db.doc(`${COLECCION}/${planta}_${m}`)
  const leer = async (m) => (m >= CIERRE_DESDE ? (await refMes(m).get()).data() || null : null)

  const mesHoy = hoyKey.slice(0, 7)
  const anterior = await leer(mesAnterior(mesHoy))
  const meses = mesesAProcesar(hoyKey, anterior?.resumen?.estado === 'sellado')
  const cache = new Map([[mesAnterior(mesHoy), anterior]])
  const resultado = []
  for (const mes of meses) {
    const previo = cache.has(mes) ? cache.get(mes) : await leer(mes)
    const prevAnt = cache.has(mesAnterior(mes)) ? cache.get(mesAnterior(mes)) : await leer(mesAnterior(mes))
    const { doc, sellados } = calcularMes({ ...insumos, mes, previo, previoAnterior: prevAnt })
    if (sellados.length) {
      const padres = await db.getAll(...sellados.map((id) => db.doc(`shoplogix/${planta}/shifts/${id}`)))
      const slx = new Map(padres.map((p) => [p.id, piezasShoplogix(p.exists ? p.data() : null)]))
      for (const j of Object.values(doc.jornadas)) {
        for (const t of [j.noche, j.dia]) {
          if (!t || !slx.has(t.r.shiftDocId) || t.cuadre) continue
          const pz = slx.get(t.r.shiftDocId)
          t.cuadre = pz == null ? { slx: null } : { slx: pz, dif: (t.r.piezas || 0) - pz }
        }
      }
    }
    await refMes(mes).set(doc)
    cache.set(mes, doc)
    resultado.push({ mes, jornadas: Object.keys(doc.jornadas).length, sellados: sellados.length })
  }
  logger.info(`[cerrarDuelo][${planta}] ${JSON.stringify(resultado)}`)
  return { planta, meses: resultado }
}

module.exports = { calcularMes, mesesAProcesar, ejecutarCierre, piezasShoplogix, mesAnterior, lunesDe, sumarDias, CIERRE_V, GRACIA_DIAS, CIERRE_DESDE, PLANTAS_DUELO, COLECCION }
