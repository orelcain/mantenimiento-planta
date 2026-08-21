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
 * ── Rastro de lo enviado ────────────────────────────────────────────────────
 * Cada envío deja su `message_id` de Telegram en `informePdfEnvios`. Sin eso no
 * se puede responder la pregunta más básica cuando alguien dice "no me llegó":
 * el 2026-08-20 un envío del botón salió con `enviado: true` y 45 KB en el log
 * de la Cloud Function, y no hubo forma de confirmar si el mensaje existía en
 * el hilo o si Telegram lo había deduplicado contra uno idéntico anterior.
 *
 * El rastro se guarda TAMBIÉN para los envíos parciales (turno en curso), que
 * son justo los que no dejaban nada. Va en un campo aparte a propósito: no es
 * la marca de idempotencia, así que anotarlo no impide que salga el informe del
 * cierre.
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
  if (datos.enCurso) l.push('⏳ <b>TURNO EN CURSO</b> — foto parcial')
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
async function enviarInformeDeTurno({ db, plant, shiftDocId, config, enviarDocumento, logger = console, forzar = false, enCurso = false }) {
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

  const datos = construirDatosInforme({ machines, windowStart, windowEnd, cotejo, meta, enCurso })
  const pdf = generarInformeTurno(datos)

  // `enviarDocumento` DEBE lanzar si el envio no se concreto. Telegram responde
  // {ok:false} sin lanzar, y si eso se toma por bueno el turno queda marcado
  // como enviado sin que nadie lo haya recibido.
  let respuesta = null
  try {
    respuesta = await enviarDocumento(chatId, pdf, nombreArchivo(plant, shiftDocId), caption({ meta, datos }))
  } catch (e) {
    await ref.set({
      informePdfIntentos: intentos + 1,
      informePdfError: { mensaje: String(e.message).slice(0, 300), at: new Date() },
    }, { merge: true })
    throw e
  }

  /* El id que devuelve Telegram. Puede faltar —un `enviarDocumento` de prueba,
     o una respuesta con otra forma— y en ese caso se anota el envio igual con
     `messageId: null`: saber que se envio y no tener el id es distinto de no
     tener rastro. */
  const messageId = (respuesta && respuesta.result && respuesta.result.message_id) || null
  const envio = {
    at: new Date(),
    messageId,
    chatId: String(chatId),
    bytes: pdf.length,
    parcial: !!enCurso,
  }
  /* Ultimos 10. Sin tope, el boton de reenviar puede engordar el doc padre —que
     se lee en cada cotejo— sin que nadie lo note.
     ⚠ Es read-modify-write sobre `padre`, que se leyo al principio: dos envios
     simultaneos del mismo turno podrian pisarse una entrada. Se acepta: no hay
     nada que decidir sobre este campo, es historial. */
  const envios = [...(padre.informePdfEnvios || []), envio].slice(-10)

  // Un informe de turno EN CURSO no deja MARCA ni cachea: el turno sigue vivo,
  // sus numeros van a cambiar, y guardarlos haria que el cotejo de manana
  // comparara contra una foto a medias. El rastro del envio si se guarda: no es
  // la marca de idempotencia y es justo lo que faltaba para poder confirmarlo.
  if (enCurso) {
    await ref.set({ informePdfEnvios: envios }, { merge: true })
    return { enviado: true, bytes: pdf.length, parcial: true, messageId }
  }

  // El resumen se cachea para que los cotejos futuros no tengan que volver a
  // bajar esta subcolección. Se guarda sin `causas`/`pausas`: el detalle pesa y
  // el cotejo solo necesita los totales.
  const resumen = resumirTurno({ machines, windowStart, windowEnd, clasificar: clasificarParaInforme })
  const { causas, pausas, ...compacto } = resumen
  await ref.set({
    informePdfSentAt: envio.at,
    // El id del ultimo envio, suelto, para poder buscarlo sin recorrer el array.
    informePdfMessageId: messageId,
    informePdfEnvios: envios,
    resumenLinea: compacto,
  }, { merge: true })

  return { enviado: true, bytes: pdf.length, messageId }
}

module.exports = { enviarInformeDeTurno, nombreArchivo, caption, AREA_LABEL, MAX_INTENTOS }
