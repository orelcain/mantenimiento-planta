/**
 * enviarInforme — genera el informe post-turno y lo manda por Telegram.
 *
 * Vive aparte de index.js a proposito: el enganche en `checkShiftEndBriefs` es
 * una sola llamada envuelta en try/catch. El brief de fin de turno es critico y
 * lleva meses funcionando; si el informe falla, tiene que caerse solo el
 * informe.
 *
 * ── Cuando NO se manda ──────────────────────────────────────────────────────
 * - La feature esta apagada para la planta (es lo que viene por defecto).
 * - No hay un chat de destino configurado. A proposito no hay fallback al chat
 *   general: un informe que se manda solo, a un grupo, porque alguien olvido
 *   configurar el destino, es peor que no mandarlo.
 * - No hay maquinas o el turno no produjo.
 *
 * ── Idempotencia ────────────────────────────────────────────────────────────
 * Se estampa `informePdfSentAt` en el doc del turno. `checkShiftEndBriefs` ya
 * es idempotente por `endBriefSentAt`, pero el informe se manda DESPUES: si el
 * envio del PDF falla y la corrida se repite, el brief no se repite pero el
 * informe si puede reintentarse.
 */

const { cotejarTurnos, resumirTurno } = require('./cotejoTurnos')
const { construirDatosInforme } = require('./informeTurno')
const { generarInformeTurno } = require('./turnoDefensaPdf')
const { clasificarParaInforme } = require('./imputacion')

/** Reintentos antes de rendirse con un turno. */
const MAX_INTENTOS = 3

const AREA_LABEL = {
  chonchi: 'Eviscerados Chonchi',
  yal: 'Eviscerados Yal',
  filete: 'Filete',
}

/** Nombre del archivo que ve quien lo recibe. */
function nombreArchivo(plant, shiftDocId) {
  const limpio = shiftDocId.replace(/[^\w.-]+/g, '-')
  return `informe-turno-${plant}-${limpio}.pdf`
}

/**
 * Mensaje corto que acompaña al PDF. Tiene que servir SOLO, sin abrir el
 * archivo: quien lo lee a las 5 de la mañana en el teléfono debe saber si vale
 * la pena abrirlo.
 */
function caption({ meta, datos }) {
  const r = datos.resumen
  const l = []
  l.push(`<b>${meta.areaLabel} · ${meta.turnoLabel}</b>`)
  l.push(meta.fechaLabel)
  l.push('')
  l.push(datos.textos.veredictoTitulo)
  l.push('')
  l.push(`Producción: <b>${r.ciclos.toLocaleString('es-CL')}</b> ciclos`)
  if (r.detencion.todasSec > 0) {
    l.push(`Línea detenida: ${Math.round(r.detencion.todasSec / 60)} min (todas las máquinas a la vez)`)
  } else {
    l.push('Línea detenida: 0 min')
  }
  if (r.mantencionEquivSec > 0) {
    l.push(`Atribuible a Mantención: ${Math.round(r.mantencionEquivSec / 60)} min de línea`)
  }
  return l.join('\n')
}

/**
 * Genera y envía el informe del turno.
 *
 * @param {object}   p
 * @param {*}        p.db          Firestore
 * @param {string}   p.plant
 * @param {string}   p.shiftDocId
 * @param {object}   p.config      config de notificaciones resuelta
 * @param {Function} p.enviarDocumento  (chatId, buffer, filename, caption) => Promise
 * @param {object}   [p.logger]
 * @returns {Promise<{enviado:boolean, motivo?:string, bytes?:number}>}
 */
async function enviarInformeDeTurno({ db, plant, shiftDocId, config, enviarDocumento, logger = console, forzar = false }) {
  const cfg = (config && config.shiftEnd && config.shiftEnd.informePdf) || {}
  if (!cfg.enabled) return { enviado: false, motivo: 'apagado' }

  const chatId = cfg.chatId || null
  if (!chatId) {
    // Sin fallback al chat general: mandar un informe solo, a un grupo, por un
    // destino sin configurar es peor que no mandarlo.
    logger.warn('[informeTurno] sin chatId configurado — no se envía', { plant })
    return { enviado: false, motivo: 'sin-destino' }
  }

  const ref = db.collection('shoplogix').doc(plant).collection('shifts').doc(shiftDocId)
  const padre = (await ref.get()).data() || {}
  // `forzar` lo usa el boton manual del monitor: reenviar un turno que ya salio
  // es una decision consciente de quien aprieta, no un reintento automatico.
  if (!forzar && padre.informePdfSentAt) return { enviado: false, motivo: 'ya-enviado' }

  // Tope de reintentos. Sin el, un error permanente (chat borrado, token
  // rotado) hace que cada corrida del cron —o sea cada 5 min— vuelva a armar el
  // PDF y a fallar, para siempre. Con el tope, el turno queda con el error
  // anotado y se puede ver que paso.
  const intentos = padre.informePdfIntentos || 0
  if (!forzar && intentos >= MAX_INTENTOS) return { enviado: false, motivo: 'demasiados-intentos', intentos }

  const snap = await ref.collection('machines').get()
  if (snap.empty) return { enviado: false, motivo: 'sin-maquinas' }

  const machines = snap.docs.map((d) => {
    const x = d.data()
    return {
      machineName: x.machineName || d.id,
      states: x.states || [],
      intervals: x.intervals || [],
      totalCycles: x.totalCycles || 0,
    }
  }).sort((a, b) => a.machineName.localeCompare(b.machineName, 'es'))

  const ciclos = machines.reduce((a, m) => a + m.totalCycles, 0)
  const minPiezas = (config.shiftEnd && config.shiftEnd.minPieces) || 50
  if (ciclos < minPiezas) return { enviado: false, motivo: 'sin-produccion' }

  const windowStart = snap.docs[0].data().shiftStart
  const windowEnd = snap.docs[0].data().shiftEnd

  // El cotejo puede fallar sin que el informe deje de tener sentido: sin
  // comparables las láminas 1 y 5 lo dicen y el resto sigue igual.
  let cotejo = null
  try {
    cotejo = await cotejarTurnos({ db, plant, shiftDocId })
  } catch (e) {
    logger.warn('[informeTurno] cotejo no disponible', { plant, shiftDocId, err: e.message })
  }

  const meta = {
    planta: plant,
    areaLabel: AREA_LABEL[plant] || plant,
    turnoLabel: padre.shiftId || shiftDocId.split('_').slice(1).join('_'),
    fechaLabel: shiftDocId.slice(0, 10),
  }

  const datos = construirDatosInforme({ machines, windowStart, windowEnd, cotejo, meta })
  const pdf = generarInformeTurno(datos)

  // `enviarDocumento` DEBE lanzar si el envio no se concreto. Telegram responde
  // {ok:false} sin lanzar, y si eso se toma por bueno el turno queda marcado
  // como enviado sin que nadie lo haya recibido.
  try {
    await enviarDocumento(chatId, pdf, nombreArchivo(plant, shiftDocId), caption({ meta, datos }))
  } catch (e) {
    await ref.set({
      informePdfIntentos: intentos + 1,
      informePdfError: { mensaje: String(e.message).slice(0, 300), at: new Date() },
    }, { merge: true })
    throw e
  }

  // El resumen se cachea para que los cotejos futuros no tengan que volver a
  // bajar esta subcolección. Se guarda sin `causas`/`pausas`: el detalle pesa y
  // el cotejo solo necesita los totales.
  const resumen = resumirTurno({ machines, windowStart, windowEnd, clasificar: clasificarParaInforme })
  const { causas, pausas, ...compacto } = resumen
  await ref.set({
    informePdfSentAt: new Date(),
    resumenLinea: compacto,
  }, { merge: true })

  return { enviado: true, bytes: pdf.length }
}

module.exports = { enviarInformeDeTurno, nombreArchivo, caption, AREA_LABEL, MAX_INTENTOS }
