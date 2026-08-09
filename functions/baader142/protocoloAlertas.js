/**
 * protocoloAlertas — convierte las lecturas del protocolo de las BAADER 142 en avisos.
 *
 * Por qué existe: el módulo Perilla 5 ya deja registrar los 13 contadores del Upgrade
 * Kit y graficar la tendencia, pero hay que acordarse de ir a mirarla. La promesa del
 * módulo es "intervenir ANTES de que la máquina pare", y eso solo se cumple si el dato
 * sale a buscar a la persona.
 *
 * Dos avisos, con criterios distintos a propósito:
 *  - RECORDATORIO (viernes): solo si falta registrar alguna máquina. Si están las tres,
 *    silencio — un aviso que llega siempre se deja de leer.
 *  - ALERTA (al guardar una lectura): cuando una herramienta cruza umbral, cuando su
 *    tasa sube dos lecturas seguidas, o cuando paró sin correcciones previas.
 *
 * Todo acá es función pura sobre datos ya leídos: se puede probar sin Firestore.
 */

/** Las cinco herramientas vigiladas por el kit, en el orden del protocolo. */
const HERRAMIENTAS = [
  { c: 'e821c', s: 'e821', nombre: 'Centraje', sm: 'SM1', ind: 'B1' },
  { c: 'e822c', s: 'e822', nombre: 'Cuchilla hendedora', sm: 'SM2', ind: 'B2' },
  { c: 'e823c', s: 'e823', nombre: 'Aspirador', sm: 'SM3', ind: 'B3' },
  { c: 'e824c', s: 'e824', nombre: 'Excavador A', sm: 'SM4', ind: 'B4' },
  { c: 'e825c', s: 'e825', nombre: 'Excavador B', sm: 'SM5', ind: 'B5' },
]

/**
 * Umbrales por cada 1000 pescados. Criterio interno de Mantención ANTARFOOD
 * (el manual no los trae): provisorios hasta tener cuatro semanas de registro real.
 */
const UMBRALES = { vigilar: 5, intervenir: 30, critico: 100 }

/** Nombre de cada máquina en el orden de planta. */
const MAQUINAS = {
  'baader-n1': 'Baader 142 N1 (antigua)',
  'baader-n2': 'Baader 142 N2',
  'baader-n3': 'Baader 142 N3',
}

const URL_PROTOCOLO =
  'https://orelcain.github.io/mantenimiento-planta/aprendizaje/perilla-5?vista=protocolo'

/** Tasa por cada 1000 pescados, como la muestra el display (/1000Fi). */
function tasa1000(n, fish) {
  const f = Number(fish) || 0
  if (f <= 0) return 0
  return Math.round((Number(n) || 0) * 1000 / f)
}

function nivelDeTasa(r) {
  if (r >= UMBRALES.critico) return 'critico'
  if (r >= UMBRALES.intervenir) return 'intervenir'
  if (r >= UMBRALES.vigilar) return 'vigilar'
  return 'normal'
}

/**
 * Evalúa una lectura recién guardada contra las anteriores de la MISMA máquina.
 *
 * @param {object} actual — lectura nueva (los 17 contadores + fecha)
 * @param {object[]} previas — lecturas anteriores, de la más NUEVA a la más vieja
 * @returns {{maquina:string, fecha:string, fish:number, alertas:object[]}}
 *
 * Reglas, y por qué cada una:
 *  - `umbral`: la tasa de correcciones llegó a intervenir/crítico. Es el estado, no el
 *     movimiento: aunque no haya subido esta semana, sigue sin arreglarse.
 *  - `tendencia`: subió en las dos últimas lecturas seguidas. Se exige que además haya
 *     llegado al menos a "vigilar", porque 0→1→2 por mil es ruido, no una tendencia.
 *  - `falla-dura`: paró sin correcciones previas. No es desgaste: es inductivo, cable o
 *     bloqueo. Avisa aunque la tasa sea baja, porque la máquina ya se detuvo.
 */
function evaluarLectura(actual, previas = []) {
  const fish = Number(actual.fish) || 0
  const prev1 = previas[0] || null
  const prev2 = previas[1] || null
  const alertas = []

  for (const h of HERRAMIENTAS) {
    const r = tasa1000(actual[h.c], fish)
    const paradas = Number(actual[h.s]) || 0
    const correcciones = Number(actual[h.c]) || 0
    const rPrev1 = prev1 ? tasa1000(prev1[h.c], prev1.fish) : null
    const rPrev2 = prev2 ? tasa1000(prev2[h.c], prev2.fish) : null

    if (paradas > 0 && correcciones === 0) {
      alertas.push({
        tipo: 'falla-dura', herramienta: h.nombre, sm: h.sm, ind: h.ind,
        tasa: r, paradas, nivel: 'critico',
      })
      continue // ya es lo más grave que se puede decir de esta herramienta
    }

    const sube2 =
      rPrev1 !== null && rPrev2 !== null && r > rPrev1 && rPrev1 > rPrev2 && r >= UMBRALES.vigilar
    const niv = nivelDeTasa(r)

    if (niv === 'critico' || niv === 'intervenir') {
      alertas.push({
        tipo: 'umbral', herramienta: h.nombre, sm: h.sm, ind: h.ind,
        tasa: r, tasaPrevia: rPrev1, correcciones, nivel: niv, subiendo: sube2,
        // Sin cambio respecto a la semana pasada: se dice, para que no parezca nuevo.
        igual: rPrev1 !== null && r === rPrev1,
      })
    } else if (sube2) {
      alertas.push({
        tipo: 'tendencia', herramienta: h.nombre, sm: h.sm, ind: h.ind,
        tasa: r, tasaPrevia: rPrev1, tasaPrevia2: rPrev2, correcciones, nivel: 'vigilar',
      })
    }
  }

  // La que más correcciones concentra manda el orden: es por donde hay que empezar.
  const orden = { critico: 0, intervenir: 1, vigilar: 2 }
  alertas.sort((a, b) => (orden[a.nivel] - orden[b.nivel]) || (b.tasa - a.tasa))

  return { maquina: actual.maquina, fecha: actual.fecha, fish, alertas }
}

/**
 * Mensaje de alerta para Telegram (HTML). Devuelve null si no hay nada que decir:
 * el llamador no debe mandar mensajes vacíos.
 */
function componerAlerta(ev) {
  if (!ev || !ev.alertas || ev.alertas.length === 0) return null
  const maq = MAQUINAS[ev.maquina] || ev.maquina
  const peor = ev.alertas[0].nivel
  const emoji = peor === 'critico' ? '🔴' : peor === 'intervenir' ? '🟠' : '🟡'

  const l = [
    `${emoji} <b>Protocolo · ${maq}</b>`,
    `Lectura del ${ev.fecha} · ${fmtNum(ev.fish)} pescados`,
    '',
  ]

  for (const a of ev.alertas) {
    if (a.tipo === 'falla-dura') {
      l.push(`🔴 <b>${a.herramienta} ${a.sm}</b> — ${a.paradas} parada${a.paradas === 1 ? '' : 's'} sin correcciones previas`)
      l.push(`   No es desgaste: apuntá al inductivo ${a.ind}, su cable o un bloqueo.`)
    } else if (a.tipo === 'umbral') {
      const cab = a.nivel === 'critico' ? '🔴 CRÍTICO' : '🟠 Intervenir'
      l.push(`${cab} · <b>${a.herramienta} ${a.sm}</b>: <b>${a.tasa}</b> correcciones /1000`)
      l.push(`   ${textoMovimiento(a)}`)
    } else {
      l.push(`🟡 <b>${a.herramienta} ${a.sm}</b>: subió dos lecturas seguidas`)
      l.push(`   ${a.tasaPrevia2} → ${a.tasaPrevia} → <b>${a.tasa}</b> /1000. Todavía es barato mirarlo.`)
    }
  }

  l.push('')
  l.push(`🔗 <a href="${URL_PROTOCOLO}">Ver la tendencia</a>`)
  return l.join('\n')
}

/** Cómo se movió respecto a la lectura anterior, en palabras. */
function textoMovimiento(a) {
  if (a.tasaPrevia === null || a.tasaPrevia === undefined) return 'Primera lectura de esta herramienta.'
  if (a.igual) return `Igual que la lectura anterior (${a.tasaPrevia}): sigue sin corregirse.`
  const d = a.tasa - a.tasaPrevia
  if (d > 0) return `Venía en ${a.tasaPrevia} /1000: subió ${d}.`
  return `Venía en ${a.tasaPrevia} /1000: bajó ${Math.abs(d)}, pero sigue sobre el umbral.`
}

/**
 * Recordatorio del viernes. Devuelve null cuando ya se registraron todas: un aviso
 * que llega siempre se vuelve invisible, así que solo se manda si falta alguna.
 *
 * @param {string[]} registradas — ids de máquina con lectura dentro de la ventana
 * @param {Record<string,string>} ultimaFecha — id de máquina → fecha de su última lectura
 */
function componerRecordatorio(registradas = [], ultimaFecha = {}) {
  const ids = Object.keys(MAQUINAS)
  const faltan = ids.filter((id) => !registradas.includes(id))
  if (faltan.length === 0) return null

  const l = [
    '📋 <b>Protocolo de las Baader 142 — registro semanal</b>',
    'Antes de terminar el turno, leer el protocolo (perilla 5 → posición 1, se navega con la perilla 4) y cargar los 13 contadores.',
    '',
  ]
  for (const id of faltan) {
    const u = ultimaFecha[id]
    l.push(`  ⬜ ${MAQUINAS[id]}${u ? ` — última: ${u}` : ' — sin registros todavía'}`)
  }
  const hechas = ids.filter((id) => registradas.includes(id))
  for (const id of hechas) l.push(`  ✅ ${MAQUINAS[id]} — registrada`)

  l.push('')
  l.push('⚠️ Y lo de siempre: <b>no resetear el protocolo</b> sin registrar antes los valores.')
  l.push(`🔗 <a href="${URL_PROTOCOLO}">Cargar la lectura</a>`)
  return l.join('\n')
}

function fmtNum(n) {
  return new Intl.NumberFormat('es-CL').format(Number(n) || 0)
}

module.exports = {
  HERRAMIENTAS,
  UMBRALES,
  MAQUINAS,
  URL_PROTOCOLO,
  tasa1000,
  nivelDeTasa,
  evaluarLectura,
  componerAlerta,
  componerRecordatorio,
}
