/**
 * Vigía intra-turno: señales sintéticas de anomalía con anti-ruido, colgado
 * del scheduler del pulso (una evaluación por minuto, cero costo extra de
 * requests a Shoplogix).
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * La alerta por detención de `onShoplogixMachineUpdated` dispara por CADA
 * paro ≥3 min de CUALQUIER máquina: en el turno noche del 27-08 habrían sido
 * decenas. Lo que faltaba era el otro nivel — las señales que un humano
 * vigilando el monitor encuentra importantes (medido esa misma noche, con un
 * vigía corrido a mano):
 *
 *   · la LÍNEA entera sin producir un rato (con la causa a la vista)
 *   · UNA máquina muerta mientras las demás corren (la Ev 1 estuvo 4 h así)
 *   · una parada pactada que se alarga más de lo pactado
 *   · el contador vivo sin responder
 *   · el ritmo desplomado de forma sostenida
 *
 * Cada señal abre un CICLO que después se cierra («volvió a producir») — una
 * alerta sin cierre deja al que la lee esperando para siempre. Y cada señal
 * exige N lecturas consecutivas antes de hablar: sin eso, el vaivén normal de
 * la línea (micro-paradas, buckets vacíos) se vuelve spam.
 *
 * La evaluación es PURA (`evaluarVigia`): estado + lectura → eventos + estado
 * nuevo. El IO (Firestore + Telegram) vive en `correrVigiaTurno`.
 */

/**
 * Causas de detención PACTADAS: no alarman al empezar, solo si se alargan.
 * OJO: Shoplogix también manda el nombre del estado en inglés («Planned
 * Downtime») — sin él, la colación del 27-08 a las 23:20 salió avisada como
 * paro no pactado (pagado en la guardia real de esa noche).
 */
const RE_PROGRAMADA = ['COLACION', 'PROGRAMADA', 'EJERCICIO', 'REUNION', 'CHARLA', 'PLANNED']

/** Umbrales, en lecturas consecutivas (el scheduler corre cada 1 min). */
const UMBRALES = Object.freeze({
  paroNoPactadoMin: 8,
  paroPactadoMin: 50,
  maquinaCeroMin: 12,
  lentoMin: 10,
  contadorCaidoMin: 12,
  /** Bajo esto la línea «va muy lenta» (pz/min del pulso, andando). */
  cpmLento: 10,
  /** Sobre esto el ritmo «se recuperó» (histéresis para no parpadear). */
  cpmRecuperado: 18,
  /** Un pulso por máquina bajo esto cuenta como «en cero». */
  cpmMaquinaCero: 0.2,
})

function esPactada(reason) {
  const r = String(reason || '').toUpperCase()
  return RE_PROGRAMADA.some((k) => r.includes(k))
}

/**
 * Una evaluación del vigía. Sin efectos: recibe la lectura y el estado
 * previo, devuelve los eventos nuevos y el estado siguiente.
 *
 * @param {object} lectura
 *   @param {string}  lectura.shiftDocId     doc del turno vigente
 *   @param {boolean} lectura.shiftClosed
 *   @param {string}  lectura.status         'produciendo' | 'detenida' | ...
 *   @param {string}  lectura.reason         causa actual (de la línea)
 *   @param {number}  lectura.totalPieces
 *   @param {number|null} lectura.pulsoCpm   cpm del pulso de línea
 *   @param {Array<{id:string,cpm:number}>|null} lectura.porMaquina
 *   @param {boolean} lectura.lecturaFallo   leerPulso devolvió null
 * @param {object} st  estado previo (plano, Firestore-safe)
 * @param {Map<string,string>} nombres  machineid → nombre corto
 * @returns {{eventos: string[], estado: object}}
 */
function evaluarVigia(lectura, st, nombres) {
  const ev = []
  st = { ...st }
  const nom = (id) => (nombres && nombres.get(id)) || id.slice(0, 8)

  // ── Cambio de turno: borrón y cuenta nueva, sin avisar (el brief de
  //    arranque ya existe y es de otro módulo). ─────────────────────────────
  if (st.doc && lectura.shiftDocId && lectura.shiftDocId !== st.doc) {
    st = { doc: lectura.shiftDocId }
  }
  st.doc = lectura.shiftDocId || st.doc || null

  // ── Contador caído: se evalúa SIEMPRE (incluso sin turno en curso el
  //    scheduler solo corre con monitores vivos, así que no molesta de más).
  if (lectura.lecturaFallo) {
    st.falloN = (st.falloN || 0) + 1
    if (st.falloN === UMBRALES.contadorCaidoMin) {
      ev.push(`📡 <b>Contador sin responder</b>: el pulso de Shoplogix lleva ~${UMBRALES.contadorCaidoMin} min sin contestar.`)
      st.falloAvisado = true
    }
  } else {
    if (st.falloAvisado) ev.push('📡 <b>Contador de vuelta</b>: el pulso volvió a responder.')
    st.falloN = 0
    st.falloAvisado = false
  }

  // Con el turno cerrado no hay nada más que vigilar: se apagan los ciclos
  // abiertos sin avisos de cierre (el turno terminó, no «se arregló»).
  if (lectura.shiftClosed) {
    st.paroN = 0; st.paroAvisado = false
    st.maqCeroN = {}; st.maqAvisada = {}
    st.lentoN = 0; st.lentoAvisado = false
    return { eventos: ev, estado: st }
  }

  const pz = Math.round(lectura.totalPieces || 0)

  // ── Paro de línea ────────────────────────────────────────────────────────
  if (lectura.status !== 'produciendo') {
    st.paroN = (st.paroN || 0) + 1
    const pactada = esPactada(lectura.reason)
    const umbral = pactada ? UMBRALES.paroPactadoMin : UMBRALES.paroNoPactadoMin
    if (st.paroN === umbral) {
      const causa = lectura.reason || '(sin causa anotada)'
      ev.push(pactada
        ? `🕐 <b>Parada pactada que se alarga</b>: la línea lleva ~${umbral} min sin producir · ${causa} · ${pz.toLocaleString()} pz`
        : `⛔ <b>Línea detenida</b> hace ~${umbral} min · causa: ${causa} · ${pz.toLocaleString()} pz`)
      st.paroAvisado = true
    }
  } else {
    if (st.paroAvisado) ev.push(`✅ <b>Reenganche</b>: la línea volvió a producir (${pz.toLocaleString()} pz).`)
    st.paroN = 0
    st.paroAvisado = false
  }

  // ── Una máquina muerta con la línea andando ──────────────────────────────
  if (lectura.status === 'produciendo' && Array.isArray(lectura.porMaquina) && lectura.porMaquina.length > 1) {
    const ceros = { ...(st.maqCeroN || {}) }
    const avisadas = { ...(st.maqAvisada || {}) }
    for (const { id, cpm } of lectura.porMaquina) {
      if (cpm <= UMBRALES.cpmMaquinaCero) {
        ceros[id] = (ceros[id] || 0) + 1
        if (ceros[id] === UMBRALES.maquinaCeroMin) {
          ev.push(`🟠 <b>${nom(id)} parada</b>: lleva ~${UMBRALES.maquinaCeroMin} min en 0 con la línea produciendo.`)
          avisadas[id] = true
        }
      } else {
        if (avisadas[id]) ev.push(`✅ <b>${nom(id)} de vuelta</b>: volvió a producir (${cpm.toFixed(1)} pz/min).`)
        ceros[id] = 0
        avisadas[id] = false
      }
    }
    st.maqCeroN = ceros
    st.maqAvisada = avisadas
  }

  // ── Ritmo desplomado (andando pero muy lento, sostenido) ─────────────────
  if (lectura.status === 'produciendo' && lectura.pulsoCpm != null) {
    if (lectura.pulsoCpm < UMBRALES.cpmLento) {
      st.lentoN = (st.lentoN || 0) + 1
      if (st.lentoN === UMBRALES.lentoMin) {
        ev.push(`🐌 <b>Línea muy lenta</b>: pulso a ${lectura.pulsoCpm.toFixed(1)} pz/min hace ~${UMBRALES.lentoMin} min.`)
        st.lentoAvisado = true
      }
    } else {
      if (lectura.pulsoCpm >= UMBRALES.cpmRecuperado && st.lentoAvisado) {
        ev.push(`✅ <b>Ritmo recuperado</b>: pulso a ${lectura.pulsoCpm.toFixed(1)} pz/min.`)
        st.lentoAvisado = false
      }
      if (lectura.pulsoCpm >= UMBRALES.cpmLento) st.lentoN = 0
    }
  }

  return { eventos: ev, estado: st }
}

/**
 * La corrida con IO: carga el estado de Firestore, evalúa y despacha.
 *
 * @param {object} args
 *   @param {object}   args.db          Firestore admin
 *   @param {string}   args.plantSlug
 *   @param {object}   args.config      notif config resuelta (usa .vigia.enabled)
 *   @param {object}   args.lectura     ver evaluarVigia
 *   @param {Map}      args.nombres     machineid → nombre
 *   @param {Function} args.enviar      async (msg: string) => void
 *   @param {object}   [args.logger]
 */
async function correrVigiaTurno({ db, plantSlug, config, lectura, nombres, enviar, logger = console }) {
  if (!config?.vigia?.enabled) return
  const ref = db.doc(`vigiaTurno/${plantSlug}`)
  let st = {}
  try {
    const snap = await ref.get()
    if (snap.exists) st = snap.data() || {}
  } catch (e) {
    logger.warn(`[vigia][${plantSlug}] no se pudo leer estado: ${e.message}`)
  }
  const { eventos, estado } = evaluarVigia(lectura, st, nombres)
  for (const msg of eventos) {
    try {
      await enviar(msg)
    } catch (e) {
      logger.warn(`[vigia][${plantSlug}] no se pudo enviar: ${e.message}`)
    }
  }
  estado.updatedAt = new Date()
  await ref.set(estado).catch((e) => logger.warn(`[vigia][${plantSlug}] no se pudo guardar estado: ${e.message}`))
  if (eventos.length) logger.info(`[vigia][${plantSlug}] ${eventos.length} evento(s)`)
}

module.exports = { evaluarVigia, correrVigiaTurno, UMBRALES, RE_PROGRAMADA, esPactada }
