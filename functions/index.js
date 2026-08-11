// Cloud Functions – mantenimiento-planta  (secret GROQ_API_KEY v3)
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { logger } = require('firebase-functions')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue, FieldPath } = require('firebase-admin/firestore')
const { getDatabase } = require('firebase-admin/database')
const { getMessaging } = require('firebase-admin/messaging')
const { getStorage } = require('firebase-admin/storage')
const { randomUUID, createHmac, timingSafeEqual } = require('crypto')
const { getAuth } = require('firebase-admin/auth')

initializeApp()

const db = getFirestore()

// Dominios permitidos para CORS (produccion + dev)
const ALLOWED_ORIGINS = [
  'https://orelcain.github.io',
  'https://mantenimiento-planta-771a3.web.app',
  'https://mantenimiento-planta-771a3.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
]

// ── Gate para endpoints HTTP administrativos (setup/diagnóstico manual) ──────
// Estos endpoints no los llama la PWA; son herramientas manuales one-shot.
// Fail-closed: sin ADMIN_SETUP_KEY configurada NO se ejecutan (503).
// Con key configurada exigen ?key=<valor> o header x-admin-key.
// Configurar ADMIN_SETUP_KEY dentro del secret FUNCTIONS_ENV (GitHub → Settings
// → Secrets → Actions) para que llegue a producción.
function requireAdminKey(req, res) {
  const expected = process.env.ADMIN_SETUP_KEY
  if (!expected) {
    res.status(503).json({ error: 'ADMIN_KEY_NOT_CONFIGURED', message: 'Configurar ADMIN_SETUP_KEY en FUNCTIONS_ENV' })
    return false
  }
  const got = String(req.get('x-admin-key') || req.query.key || '')
  // Comparación en tiempo constante (mismo criterio que mintTelegramAuthToken):
  // timingSafeEqual exige buffers del mismo largo, así que igualamos con un pad
  // que garantiza el rechazo (nunca compara igual) cuando el largo no calza.
  const gotBuf = Buffer.from(got)
  const expectedBuf = Buffer.from(expected)
  const lengthOk = gotBuf.length === expectedBuf.length
  const safeGot = lengthOk ? gotBuf : Buffer.alloc(expectedBuf.length)
  if (!lengthOk || !timingSafeEqual(safeGot, expectedBuf)) {
    res.status(403).json({ error: 'FORBIDDEN' })
    return false
  }
  return true
}

// RTDB se inicializa lazy (getDatabase() requiere FIREBASE_CONFIG, solo disponible en Cloud Functions runtime)
let _rtdb = null
function getRtdb() {
  if (!_rtdb) _rtdb = getDatabase()
  return _rtdb
}

// Storage lazy init
let _bucket = null
function getStorageBucket() {
  if (!_bucket) _bucket = getStorage().bucket('mantenimiento-planta-771a3.firebasestorage.app')
  return _bucket
}

// ==================== CONSTANTES ====================

/** Retención máxima de lecturas de sensores en RTDB: 30 días */
const SENSOR_RETENTION_DAYS = 30

/** Base URL de la Telegram Bot API */
const TELEGRAM_API_BASE = 'https://api.telegram.org'

/**
 * La GEMINI_API_KEY quedó restringida por HTTP referrers (hardening 2026-07-05):
 * las llamadas server-side (sin Referer) empezaron a recibir 403 "referer <empty>
 * blocked" — eso dejó CIEGA la visión de ARIA-Telegram y rompió el fallback
 * Groq→Gemini. Las functions son uso legítimo de la misma key, así que mandan el
 * referer permitido de la PWA. (Hallado 2026-07-06 al probar foto→repuesto.)
 */
const GEMINI_KEY_REFERER = 'https://orelcain.github.io/mantenimiento-planta/'

// ==================== HELPERS ====================

/**
 * Enviar un mensaje a Telegram (con soporte de Forum Topics).
 * @param {string} text  - Texto del mensaje (HTML permitido)
 * @param {string} [chatId] - Chat destino. Si se omite usa process.env.TELEGRAM_CHAT_ID
 * @param {object} [opts] - Opciones extra
 * @param {number} [opts.topicId] - message_thread_id para enviar a un topic específico
 */
async function sendTelegramMessage(text, chatId, opts = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    logger.warn('TELEGRAM_BOT_TOKEN no configurado — mensaje omitido')
    return
  }

  const target = chatId || process.env.TELEGRAM_CHAT_ID
  if (!target) {
    logger.warn('TELEGRAM_CHAT_ID no configurado — mensaje omitido')
    return
  }

  const payload = {
    chat_id: target,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }

  // Soporte de Forum Topics
  if (opts.topicId) {
    payload.message_thread_id = opts.topicId
  }

  const enviar = async (body) => {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { ok: response.ok, status: response.status, err: response.ok ? null : await response.text() }
  }

  try {
    let r = await enviar(payload)

    // Un topic borrado del grupo devuelve 400 "message thread not found" y el
    // mensaje se pierde EN SILENCIO (esto no lanza). Pasó de verdad con el topic
    // de equipos: la alerta se evaluaba bien y nunca llegaba a nadie. Antes de
    // darlo por perdido, se reintenta en el hilo principal del grupo.
    if (!r.ok && payload.message_thread_id && /thread not found/i.test(r.err || '')) {
      logger.warn('Telegram: el topic no existe, se reintenta en el hilo principal', {
        topicId: payload.message_thread_id,
      })
      const { message_thread_id: _omitido, ...sinTopic } = payload
      r = await enviar(sinTopic)
    }

    if (!r.ok) {
      logger.error('Telegram sendMessage error', { status: r.status, err: r.err })
    }
  } catch (error) {
    logger.error('Telegram fetch error', error)
  }
}

/**
 * Helper genérico para llamar cualquier método de la Telegram Bot API.
 */
async function callTelegramApi(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return null
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    if (!result.ok) logger.error(`Telegram ${method} error`, result)
    return result
  } catch (error) {
    logger.error(`Telegram ${method} fetch error`, error)
    return null
  }
}

/**
 * Enviar mensaje con inline keyboard (botones interactivos).
 * @param {string} text - Texto HTML
 * @param {string} chatId
 * @param {Array<Array<object>>} buttons - Filas de botones [{text, callback_data} o {text, web_app:{url}}]
 * @param {object} [opts] - {topicId}
 */
async function sendTelegramButtons(text, chatId, buttons, opts = {}) {
  const payload = {
    chat_id: chatId || process.env.TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons },
  }
  if (opts.topicId) payload.message_thread_id = opts.topicId
  return callTelegramApi('sendMessage', payload)
}

/**
 * Editar un mensaje existente (para navegación in-place sin spam).
 */
async function editTelegramMessage(chatId, messageId, text, buttons) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }
  if (buttons) payload.reply_markup = { inline_keyboard: buttons }
  return callTelegramApi('editMessageText', payload)
}

/**
 * Enviar una foto con caption y botones opcionales.
 */
async function sendTelegramPhoto(chatId, photoUrl, caption, buttons, opts = {}) {
  const payload = {
    chat_id: chatId || process.env.TELEGRAM_CHAT_ID,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML',
  }
  if (buttons) payload.reply_markup = { inline_keyboard: buttons }
  if (opts.topicId) payload.message_thread_id = opts.topicId
  return callTelegramApi('sendPhoto', payload)
}

/**
 * Responder a un callback query (quita el "loading" del botón).
 */
async function answerCallbackQuery(callbackQueryId, text) {
  return callTelegramApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text: text || undefined,
  })
}



/**
 * Obtener tokens de un usuario específico
 */
async function getTokensForUser(userId) {
  if (!userId) return []
  
  const snapshot = await db.collection('fcmTokens').where('userId', '==', userId).get()
  const tokens = []
  
  snapshot.forEach((doc) => {
    const data = doc.data()
    if (data?.token && typeof data.token === 'string') {
      tokens.push(data.token)
    }
  })
  
  return Array.from(new Set(tokens))
}

/**
 * Obtener tokens de múltiples usuarios
 */
async function getTokensForUsers(userIds) {
  if (!userIds || userIds.length === 0) return []

  const snapshot = await db.collection('fcmTokens').get()
  const tokens = []

  snapshot.forEach((doc) => {
    const data = doc.data()
    if (data?.userId && userIds.includes(data.userId) && typeof data.token === 'string') {
      tokens.push(data.token)
    }
  })

  return Array.from(new Set(tokens))
}

/**
 * Obtener todos los admins y supervisores activos
 */
async function getSupervisorsAndAdmins() {
  const snapshot = await db
    .collection('users')
    .where('activo', '==', true)
    .where('rol', 'in', ['admin', 'supervisor'])
    .get()

  return snapshot.docs.map((doc) => doc.id)
}

function dedupeTokens(list) {
  return Array.from(new Set(list.filter(Boolean)))
}

/**
 * Enviar notificación a tokens específicos.
 * Limpia automáticamente tokens inválidos/expirados de Firestore.
 */
async function sendNotification(tokens, title, body, data = {}) {
  if (tokens.length === 0) {
    logger.warn('No tokens to send notification', { title })
    return
  }

  // Data-only message: evita doble notificación en Web/PWA.
  // Si incluyéramos `notification: { title, body }`, el SDK FCM auto-muestra
  // una notificación + nuestro SW ejecuta `onBackgroundMessage` con
  // `showNotification` → el usuario ve la misma alerta dos veces (y tres si
  // la app estaba en foreground y el listener llama showLocalNotification).
  // Con data-only, la pantalla la pinta solo el SW (background) o el
  // listener (foreground), nunca ambos.
  const payload = {
    data: {
      title:     String(title || ''),
      body:      String(body  || ''),
      timestamp: Date.now().toString(),
      ...Object.fromEntries(
        Object.entries(data || {}).map(([k, v]) => [k, v == null ? '' : String(v)]),
      ),
    },
  }

  try {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      ...payload,
    })

    logger.info('Notification sent', {
      title,
      successCount: response.successCount,
      failureCount: response.failureCount,
    })

    // Limpiar tokens inválidos de Firestore
    if (response.failureCount > 0) {
      const invalidCodes = ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']
      const batch = db.batch()
      let cleaned = 0
      response.responses.forEach((r, i) => {
        if (r.error && invalidCodes.includes(r.error.code)) {
          batch.delete(db.collection('fcmTokens').doc(tokens[i]))
          cleaned++
        }
      })
      if (cleaned > 0) {
        await batch.commit()
        logger.info('Cleaned invalid FCM tokens', { cleaned })
      }
    }

    return response
  } catch (error) {
    logger.error('Error sending notification', error)
    throw error
  }
}

exports.sendGanttAlert = onCall({ region: 'us-central1' }, async (request) => {
  const callerId = request.auth?.uid
  if (!callerId) {
    throw new Error('User not authenticated')
  }

  const {
    taskId,
    title,
    body,
    responsibleUserId,
    url,
    severity = 'critical_delay',
  } = request.data || {}

  if (!taskId || !title || !body) {
    throw new Error('Missing required fields: taskId, title, body')
  }

  const logId = `${taskId}_${severity}`
  const logRef = db.collection('ganttNotificationLog').doc(logId)
  const logSnap = await logRef.get()

  const now = Date.now()
  if (logSnap.exists) {
    const lastSentAt = logSnap.data()?.lastSentAt?.toMillis?.() || 0
    const elapsed = now - lastSentAt
    const minIntervalMs = 2 * 60 * 60 * 1000
    if (elapsed < minIntervalMs) {
      return {
        success: true,
        skipped: true,
        reason: 'throttled',
        sent: 0,
      }
    }
  }

  const supervisors = await getSupervisorsAndAdmins()
  const recipients = new Set(supervisors)
  if (responsibleUserId) {
    recipients.add(responsibleUserId)
  }

  const tokens = await getTokensForUsers(Array.from(recipients))
  if (tokens.length === 0) {
    await logRef.set({
      taskId,
      severity,
      lastSentAt: new Date(),
      lastSentBy: callerId,
      sent: 0,
      recipients: Array.from(recipients),
      skippedNoTokens: true,
    }, { merge: true })

    return {
      success: true,
      skipped: true,
      reason: 'no_tokens',
      sent: 0,
    }
  }

  const response = await sendNotification(tokens, title, body, {
    type: 'GANTT_ALERT',
    taskId,
    severity,
    url: url || '/mantenimiento-planta/gantt?tab=planificador',
  })

  await logRef.set({
    taskId,
    severity,
    lastSentAt: new Date(),
    lastSentBy: callerId,
    sent: response?.successCount || 0,
    failed: response?.failureCount || 0,
    recipients: Array.from(recipients),
  }, { merge: true })

  return {
    success: true,
    skipped: false,
    sent: response?.successCount || 0,
    failed: response?.failureCount || 0,
  }
})

// ==================== TRIGGERS ====================

/**
 * 1. Nueva incidencia creada → Notificar a supervisores y admins
 */
exports.onIncidentCreated = onDocumentCreated('incidents/{incidentId}', async (event) => {
  const incident = event.data?.data()
  const incidentId = event.params.incidentId

  if (!incident) return

  // Obtener supervisores y admins
  const userIds = await getSupervisorsAndAdmins()
  const tokens = await getTokensForUsers(userIds)

  if (tokens.length === 0) {
    logger.warn('No recipients for new incident', { incidentId })
    return
  }

  const priorityEmoji = {
    critica: '🔴',
    alta: '🟠',
    media: '🟡',
    baja: '⚪',
  }[incident.prioridad] || '📋'

  const title = `${priorityEmoji} Nueva incidencia ${incident.prioridad}`
  const body = incident.titulo || 'Nueva incidencia reportada'

  await sendNotification(tokens, title, body, {
    type: 'INCIDENT_CREATED',
    incidentId,
    prioridad: incident.prioridad,
    url: `/mantenimiento-planta/incidents/${incidentId}`,
  })

  // Telegram: alertar para incidencias criticas y altas (rutear al topic de incidencias)
  if (incident.prioridad === 'critica' || incident.prioridad === 'alta') {
    const origenLabel = incident.origen === 'telegram' ? ' <i>(vía Telegram)</i>' : ''
    const incTopicId = getTopicId('incidencias')
    const alertaHtml =
      `${priorityEmoji} <b>Nueva incidencia ${incident.prioridad}${origenLabel}</b>\n\n` +
      `📋 ${incident.titulo || 'Sin título'}\n` +
      `👤 ${incident.creadoPorNombre || 'Desconocido'}\n` +
      `🔗 <a href="https://orelcain.github.io/mantenimiento-planta/incidents/${incidentId}">Ver detalle</a>`
    await sendTelegramMessage(alertaHtml, undefined, { topicId: incTopicId })

    // ARIA: aviso inmediato al privado de los chats suscritos (alertas==true),
    // saltando al propio reportante (ya recibió su confirmación de ARIA).
    try {
      const reporterChatId = String(incident.reportadoPor || '').replace(/^telegram:/, '')
      const subs = await db.collection('telegramAriaSessions').where('alertas', '==', true).get()
      for (const sub of subs.docs) {
        if (sub.id === reporterChatId) continue
        await sendTelegramMessage(`⚡ ${alertaHtml}`, sub.id)
      }
    } catch (err) {
      logger.warn('Alerta DM ARIA fallo', { error: err?.message })
    }
  }
})

/**
 * 2. Incidencia actualizada → Detectar cambios y notificar
 */
exports.onIncidentUpdated = onDocumentUpdated('incidents/{incidentId}', async (event) => {
  const before = event.data?.before?.data()
  const after = event.data?.after?.data()
  const incidentId = event.params.incidentId

  if (!before || !after) return

  // CASO 1: Incidencia asignada a técnico
  if (!before.asignadoA && after.asignadoA) {
    const tokens = await getTokensForUser(after.asignadoA)
    
    if (tokens.length > 0) {
      await sendNotification(
        tokens,
        '👤 Nueva incidencia asignada',
        after.titulo || 'Te han asignado una incidencia',
        {
          type: 'INCIDENT_ASSIGNED',
          incidentId,
          url: `/mantenimiento-planta/incidents/${incidentId}`,
        }
      )
    }
  }

  // CASO 2: Incidencia validada (pendiente → confirmada)
  if (before.status === 'pendiente' && after.status === 'confirmada') {
    const tokens = await getTokensForUser(after.reportadoPor)
    
    if (tokens.length > 0) {
      await sendNotification(
        tokens,
        '✅ Incidencia validada',
        `Tu incidencia "${after.titulo}" ha sido validada`,
        {
          type: 'INCIDENT_VALIDATED',
          incidentId,
          url: `/mantenimiento-planta/incidents/${incidentId}`,
        }
      )
    }
  }

  // CASO 3: Incidencia rechazada
  if (before.status === 'pendiente' && after.status === 'rechazada') {
    const tokens = await getTokensForUser(after.reportadoPor)
    
    if (tokens.length > 0) {
      await sendNotification(
        tokens,
        '❌ Incidencia rechazada',
        `Tu incidencia "${after.titulo}" fue rechazada`,
        {
          type: 'INCIDENT_REJECTED',
          incidentId,
          reason: after.rejectionReason || 'Sin motivo especificado',
          url: `/mantenimiento-planta/incidents/${incidentId}`,
        }
      )
    }
  }

  // CASO 4: Incidencia resuelta (Técnico terminó)
  if (before.status !== 'resuelta' && after.status === 'resuelta') {
    // Notificar a supervisores y admins para validación (Cierre técnico)
    const supervisors = await getSupervisorsAndAdmins()
    const supervisorTokens = await getTokensForUsers(supervisors)
    
    if (supervisorTokens.length > 0) {
      await sendNotification(
        supervisorTokens,
        '🛠️ Incidencia Resuelta',
        `El técnico ha marcado "${after.titulo}" como resuelta. Requiere cierre técnico.`,
        {
          type: 'INCIDENT_RESOLVED',
          incidentId,
          url: `/mantenimiento-planta/incidents/${incidentId}`,
        }
      )
    }
  }

  // CASO 5: Incidencia cerrada
  if (before.status !== 'cerrada' && after.status === 'cerrada') {
    // Notificar al reportador
    const reporterTokens = await getTokensForUser(after.reportadoPor)
    
    if (reporterTokens.length > 0) {
      await sendNotification(
        reporterTokens,
        '🎉 Incidencia cerrada',
        `Tu incidencia "${after.titulo}" ha sido resuelta`,
        {
          type: 'INCIDENT_CLOSED',
          incidentId,
          url: `/mantenimiento-planta/incidents/${incidentId}`,
        }
      )
    }

    // Notificar a supervisores y admins
    const supervisors = await getSupervisorsAndAdmins()
    const supervisorTokens = await getTokensForUsers(supervisors)
    
    if (supervisorTokens.length > 0) {
      await sendNotification(
        supervisorTokens,
        '✔️ Incidencia completada',
        `"${after.titulo}" ha sido cerrada`,
        {
          type: 'INCIDENT_CLOSED',
          incidentId,
          url: `/mantenimiento-planta/incidents/${incidentId}`,
        }
      )
    }
  }
})

/**
 * 5. Notificación de prueba (manual) - Enviar a todos los usuarios activos
 */
exports.sendTestNotification = onCall({ region: 'us-central1' }, async (request) => {
  const userId = request.auth?.uid

  if (!userId) {
    throw new functions.https.HttpsError('unauthenticated', 'User not authenticated')
  }

  // Verificar que el usuario es admin
  const userSnap = await db.collection('users').doc(userId).get()
  const user = userSnap.data()

  if (!user || !['admin', 'supervisor'].includes(user.rol)) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins and supervisors can send test notifications')
  }

  logger.info('sendTestNotification triggered', { userId, userRole: user.rol })

  try {
    // Obtener TODOS los usuarios activos del sistema con sus datos
    const usersSnapshot = await db.collection('users').where('activo', '==', true).get()
    const usersMap = new Map()
    const allUserIds = []
    
    usersSnapshot.forEach((doc) => {
      const userData = doc.data()
      allUserIds.push(doc.id)
      usersMap.set(doc.id, {
        id: doc.id,
        nombre: userData.nombre || 'Usuario',
        apellido: userData.apellido || '',
        email: userData.email || ''
      })
    })
    
    logger.info('Target users found', { count: allUserIds.length })

    // Obtener tokens de FCM por usuario
    const tokensSnapshot = await db.collection('fcmTokens').get()
    const userTokensMap = new Map() // userId -> [tokens]
    
    tokensSnapshot.forEach((doc) => {
      const data = doc.data()
      if (data?.userId && data?.token && allUserIds.includes(data.userId)) {
        if (!userTokensMap.has(data.userId)) {
          userTokensMap.set(data.userId, [])
        }
        userTokensMap.get(data.userId).push(data.token)
      }
    })

    // Recopilar todos los tokens
    const allTokens = []
    userTokensMap.forEach(tokens => allTokens.push(...tokens))
    
    logger.info('Tokens found', { count: allTokens.length, usersWithTokens: userTokensMap.size })

    if (allTokens.length === 0) {
      logger.warn('No tokens to send test notification')
      
      const usersWithoutTokens = allUserIds.filter(uid => !userTokensMap.has(uid))
      const noTokensDetails = usersWithoutTokens.map(uid => {
        const u = usersMap.get(uid)
        return `${u.nombre} ${u.apellido}`.trim()
      })
      
      return { 
        success: true, 
        message: 'No hay tokens disponibles',
        emisario: `${user.nombre} ${user.apellido}`.trim(),
        sent: 0,
        failed: 0,
        destinatarios: [],
        sinToken: noTokensDetails
      }
    }

    const title = '🧪 Notificación de prueba'
    const emisarioName = `${user.nombre} ${user.apellido}`.trim()
    const body = `Enviada por ${emisarioName} - Sistema funcionando correctamente`

    const response = await sendNotification(allTokens, title, body, {
      type: 'TEST_NOTIFICATION',
      sentBy: userId,
      sentByName: emisarioName,
      sentAt: new Date().toISOString(),
      url: `/mantenimiento-planta/settings`,
    })

    logger.info('Test notification sent', {
      successCount: response.successCount,
      failureCount: response.failureCount,
    })

    // Identificar usuarios que recibieron y los que fallaron
    const destinatariosExitosos = []
    const destinatariosFallidos = []
    const sinToken = []
    
    // Procesar respuestas individuales
    const failedTokens = new Set()
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        failedTokens.add(allTokens[idx])
      }
    })

    // Clasificar usuarios
    userTokensMap.forEach((tokens, uid) => {
      const u = usersMap.get(uid)
      const userName = `${u.nombre} ${u.apellido}`.trim()
      
      const hasFailed = tokens.some(t => failedTokens.has(t))
      const hasSuccess = tokens.some(t => !failedTokens.has(t))
      
      if (hasSuccess) {
        destinatariosExitosos.push(userName)
      }
      if (hasFailed) {
        destinatariosFallidos.push({
          nombre: userName,
          razon: 'Token inválido o expirado'
        })
      }
    })

    // Usuarios sin token
    allUserIds.forEach(uid => {
      if (!userTokensMap.has(uid)) {
        const u = usersMap.get(uid)
        sinToken.push(`${u.nombre} ${u.apellido}`.trim())
      }
    })

    return {
      success: true,
      message: 'Notificación enviada',
      emisario: emisarioName,
      sent: response.successCount,
      failed: response.failureCount,
      destinatarios: destinatariosExitosos,
      fallidos: destinatariosFallidos,
      sinToken: sinToken
    }
  } catch (error) {
    logger.error('Error sending test notification', error)
    throw new functions.https.HttpsError('internal', 'Failed to send test notification')
  }
})

/**
 * 5. Notificación de prueba (manual) - Enviar a todos los admins y supervisores
 */
exports.onPreventiveTaskCreated = onDocumentCreated('preventiveTasks/{taskId}', async (event) => {
  const task = event.data?.data()
  const taskId = event.params.taskId

  if (!task) return

  logger.info('onPreventiveTaskCreated triggered', { taskId, asignadoA: task.asignadoA })

  const recipients = []

  // Obtener tokens del técnico asignado
  if (task.asignadoA) {
    logger.info('Fetching tokens for assigned technician', { userId: task.asignadoA })
    const tokens = await getTokensForUser(task.asignadoA)
    logger.info('Tokens for technician', { userId: task.asignadoA, tokenCount: tokens.length })
    recipients.push(...tokens)
  } else {
    logger.warn('No technician assigned to preventive task', { taskId })
  }

  // Obtener tokens de supervisores y admins
  const supervisors = await getSupervisorsAndAdmins()
  logger.info('Supervisors and admins found', { count: supervisors.length, userIds: supervisors })
  const supervisorTokens = await getTokensForUsers(supervisors)
  logger.info('Tokens for supervisors', { count: supervisorTokens.length })
  recipients.push(...supervisorTokens)

  const tokens = dedupeTokens(recipients)

  logger.info('Total deduplicated tokens', { count: tokens.length })

  if (tokens.length === 0) {
    logger.warn('No recipients for preventive task', { taskId, asignadoA: task.asignadoA })
    return
  }

  const title = '🗓️ Nueva tarea preventiva'
  const freq = task.frecuenciaDias ? `cada ${task.frecuenciaDias} días` : 'tarea programada'
  const body = `${task.nombre || 'Tarea preventiva'} (${freq})`

  await sendNotification(tokens, title, body, {
    type: 'PREVENTIVE_TASK_CREATED',
    taskId,
    equipmentId: task.equipmentId || '',
    url: `/mantenimiento-planta/preventive/${taskId}`,
  })
})

/**
 * 4. Ejecución preventiva creada → Notificar asignado + supervisores/admins
 */
exports.onPreventiveExecutionCreated = onDocumentCreated('preventiveExecutions/{executionId}', async (event) => {
  const execution = event.data?.data()
  const executionId = event.params.executionId

  if (!execution) return

  // Cargar tarea para obtener nombre y asignadoA
  let task = null
  if (execution.taskId) {
    const snap = await db.collection('preventiveTasks').doc(execution.taskId).get()
    if (snap.exists) task = snap.data()
  }

  const recipients = []

  if (task?.asignadoA) {
    const tokens = await getTokensForUser(task.asignadoA)
    recipients.push(...tokens)
  }

  const supervisors = await getSupervisorsAndAdmins()
  const supervisorTokens = await getTokensForUsers(supervisors)
  recipients.push(...supervisorTokens)

  const tokens = dedupeTokens(recipients)

  if (tokens.length === 0) {
    logger.warn('No recipients for preventive execution', { executionId })
    return
  }

  const title = '✅ Preventivo ejecutado'
  const body = `${task?.nombre || 'Tarea preventiva'} completada`

  await sendNotification(tokens, title, body, {
    type: 'PREVENTIVE_EXECUTED',
    executionId,
    taskId: execution.taskId || '',
    equipmentId: execution.equipmentId || '',
    url: `/mantenimiento-planta/preventive/${execution.taskId || ''}`,
  })
})

/**
 * Solicitud de repuesto creada → avisar al grupo de mantención (Telegram, topic Repuestos)
 * + push FCM a supervisores/admins. Disparado desde el hub área-first de Repuestos.
 */
exports.onSolicitudRepuestoCreated = onDocumentCreated('solicitudes_repuestos/{solicitudId}', async (event) => {
  const sol = event.data?.data()
  const solicitudId = event.params.solicitudId
  if (!sol) return

  // Escape mínimo para HTML de Telegram (los campos vienen de texto libre del usuario)
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const nombre = esc(sol.textoBreve) || '(sin nombre)'
  const sap = esc(sol.codigoSAP) || '—'
  const cantidad = sol.cantidad ?? 1
  const solicitante = esc(sol.solicitadoPorNombre) || 'Desconocido'
  const obs = sol.observaciones ? `\n📝 ${esc(sol.observaciones)}` : ''

  // Telegram → topic de Repuestos (cae a General si no está configurado)
  await sendTelegramMessage(
    `📦 <b>Nueva solicitud de repuesto</b>\n\n` +
    `🔧 ${nombre}\n` +
    `🏷️ SAP ${sap}  ·  Cantidad: <b>${cantidad}</b>\n` +
    `👤 ${solicitante}${obs}\n` +
    `🔗 <a href="https://orelcain.github.io/mantenimiento-planta/repuestos">Ver en Repuestos</a>`,
    undefined, { topicId: getTopicId('repuestos') }
  )

  // Push FCM a supervisores/admins
  try {
    const supervisors = await getSupervisorsAndAdmins()
    const tokens = dedupeTokens(await getTokensForUsers(supervisors))
    if (tokens.length > 0) {
      await sendNotification(tokens, '📦 Nueva solicitud de repuesto', `${nombre} ×${cantidad} — ${solicitante}`, {
        type: 'SOLICITUD_REPUESTO_CREATED',
        solicitudId,
        codigoSAP: sol.codigoSAP || '',
        url: '/mantenimiento-planta/repuestos',
      })
    }
  } catch (err) {
    logger.error('Error enviando push de solicitud de repuesto', err)
  }
})

// ==================== HELPER: status upstream -> HttpsError ====================

/**
 * Convierte el status HTTP de un proveedor upstream (Groq/Gemini/DeepSeek) en un
 * HttpsError con code canonico y un mensaje corto SIN filtrar el body crudo del
 * proveedor (el body real ya quedo en logger.error). El status viaja en details
 * para que el cliente pueda distinguir rate-limit (429/413) de error generico.
 */
function upstreamHttpsError(provider, status) {
  const code = (status === 429 || status === 413) ? 'resource-exhausted'
    : (status >= 500) ? 'unavailable'
    : 'internal'
  const hint = status === 413 ? 'TPM excedido'
    : status === 429 ? 'rate limit'
    : status === 402 ? 'sin saldo'
    : 'upstream'
  return new HttpsError(code, `${provider} ${status} (${hint})`, { provider, status })
}

// ==================== GROQ: GUARD DE CONTEXTO (TPM=8000) ====================

// Limite de tokens/minuto de la cuenta GRATIS de Groq para gpt-oss-120b/Qwen.
// Un contexto largo (~10-12k tokens) da HTTP 413 y tumba la cadena gratis ->
// cae a DeepSeek (paga). El guard recorta el historial para quedar bajo esto.
const GROQ_TPM_LIMIT = 8000

/**
 * Estima tokens de UN mensaje. chars/4 subestima en espanol, asi que usamos
 * chars/3.2 + overhead de rol/estructura como margen de seguridad.
 * Mensajes multimodales (content = array de parts): solo se suman las partes de
 * texto; las imagenes NO se estiman por chars.
 */
function estimateMessageTokens(m) {
  const c = m && m.content
  if (typeof c === 'string') return Math.ceil(c.length / 3.2) + 8
  if (Array.isArray(c)) {
    let chars = 0
    for (const p of c) {
      if (p && typeof p.text === 'string') chars += p.text.length
      else if (typeof p === 'string') chars += p.length
    }
    return Math.ceil(chars / 3.2) + 8
  }
  return 8
}

/**
 * Recorta el historial para que la ENTRADA a Groq quepa bajo el TPM=8000.
 * Presupuesto de entrada = 8000 - max_tokens_salida - colchon, con techo duro
 * ~5800. SIEMPRE preserva: (a) todos los role:'system', (b) el ultimo mensaje.
 * Si el contexto ya cabe, devuelve el array TAL CUAL (no-op). No reordena ni
 * modifica el contenido de ningun mensaje (no rompe json:true ni multimodal).
 */
function trimMessagesForGroq(messages, maxOutputTokens = 600) {
  if (!Array.isArray(messages) || messages.length <= 2) return messages
  const outBudget = Math.min(Math.max(Number(maxOutputTokens) || 600, 256), 4096)
  const inputBudget = Math.min(GROQ_TPM_LIMIT - outBudget - 700, 5800)

  const total = messages.reduce((s, m) => s + estimateMessageTokens(m), 0)
  if (total <= inputBudget) return messages // ya cabe: no tocar nada

  const lastIdx = messages.length - 1
  const isProtected = (i) => (messages[i] && messages[i].role === 'system') || i === lastIdx
  const keep = new Array(messages.length).fill(false)
  let running = 0
  for (let i = 0; i < messages.length; i++) {
    if (isProtected(i)) { keep[i] = true; running += estimateMessageTokens(messages[i]) }
  }
  // Agregamos mensajes NO protegidos del mas nuevo al mas viejo hasta llenar.
  for (let i = lastIdx - 1; i >= 0; i--) {
    if (keep[i]) continue // system ya protegido
    const t = estimateMessageTokens(messages[i])
    if (running + t > inputBudget) break // de aca para atras, todo se descarta
    running += t
    keep[i] = true
  }
  return messages.filter((_, i) => keep[i])
}

// ==================== GROQ AI PROXY ====================

/**
 * Proxy seguro para llamadas a Groq AI
 * La API key se almacena como secret de Firebase Functions (no en el cliente)
 * Configurar: firebase functions:secrets:set GROQ_API_KEY
 */
exports.groqProxy = onCall(
  {
    secrets: ['GROQ_API_KEY'],
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    // Verificar autenticación
    if (!request.auth) {
      throw new Error('Se requiere autenticación para usar la IA')
    }

    const { messages, model, temperature, max_tokens } = request.data

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('Se requiere al menos un mensaje')
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      logger.error('GROQ_API_KEY not configured in Firebase secrets')
      throw new Error('Servicio de IA no configurado')
    }

    try {
      // Guard TPM=8000 de Groq: recorta historial viejo para no dar 413 y caer a DeepSeek (paga).
      const safeMessages = trimMessagesForGroq(messages, max_tokens || 2048)
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'llama-3.3-70b-versatile',
          messages: safeMessages,
          temperature: temperature ?? 0.3,
          max_tokens: max_tokens || 2048,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Groq API error', { status: response.status, body: errorText })
        throw upstreamHttpsError('Groq', response.status)
      }

      const data = await response.json()
      return {
        content: data.choices?.[0]?.message?.content || '',
        usage: data.usage,
      }
    } catch (error) {
      // Si ya es un HttpsError (status upstream mapeado), propagarlo tal cual
      // para que el code/status real lleguen al cliente y al missionLog.
      if (error instanceof HttpsError) throw error
      logger.error('Groq proxy error:', error)
      throw new HttpsError('internal', 'Groq: error interno del proxy')
    }
  }
)

// ==================== WHISPER (Groq) — TRANSCRIPCIÓN DE AUDIO ====================

/**
 * Transcripción de audio con Groq Whisper large-v3 — mucho más precisa que la
 * Web Speech API del navegador, sobre todo para español chileno + vocabulario
 * técnico de planta. El cliente graba audio (MediaRecorder) y envía base64;
 * la API key vive en el secret GROQ_API_KEY (no se expone al cliente).
 *
 * Body: { audioBase64, mimeType, language='es', prompt?, model? }
 * Devuelve: { text }
 */
exports.whisperProxy = onCall(
  {
    secrets: ['GROQ_API_KEY'],
    enforceAppCheck: false,
    maxInstances: 5,
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async (request) => {
    if (!request.auth) {
      throw new Error('Se requiere autenticación para transcribir audio')
    }

    const { audioBase64, mimeType, language, prompt, model } = request.data || {}
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      throw new Error('Se requiere audio (audioBase64)')
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      logger.error('GROQ_API_KEY not configured in Firebase secrets')
      throw new Error('Servicio de transcripción no configurado')
    }

    const buffer = Buffer.from(audioBase64, 'base64')
    if (buffer.length === 0) {
      throw new Error('Audio vacío')
    }
    if (buffer.length > 25 * 1024 * 1024) {
      throw new Error('El audio supera el límite de 25 MB')
    }

    const type = mimeType || 'audio/webm'
    const ext = type.includes('mp4') || type.includes('m4a') ? 'm4a'
      : type.includes('ogg') ? 'ogg'
      : type.includes('wav') ? 'wav'
      : (type.includes('mpeg') || type.includes('mp3')) ? 'mp3'
      : 'webm'

    try {
      const form = new FormData()
      form.append('file', new Blob([buffer], { type }), `audio.${ext}`)
      form.append('model', model || 'whisper-large-v3-turbo')
      form.append('language', language || 'es')
      form.append('temperature', '0')
      form.append('response_format', 'json')
      if (prompt) form.append('prompt', String(prompt).slice(0, 800))

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Groq Whisper error', { status: response.status, body: errorText })
        throw new Error(`Error de transcripción (${response.status})`)
      }

      const data = await response.json()
      return { text: (data.text || '').trim() }
    } catch (error) {
      logger.error('Whisper proxy error:', error)
      throw new Error('Error al transcribir el audio')
    }
  }
)

// ==================== GEMINI PROXY ====================

exports.geminiProxy = onCall(
  {
    secrets: ['GEMINI_API_KEY'],
    enforceAppCheck: false,
    maxInstances: 10,
  },
  async (request) => {
    if (!request.auth) {
      throw new Error('Se requiere autenticación para usar la IA')
    }

    const { messages, model, temperature, max_tokens, systemInstruction } = request.data

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('Se requiere al menos un mensaje')
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      logger.error('GEMINI_API_KEY not configured in Firebase secrets')
      throw new Error('Servicio Gemini no configurado')
    }

    const geminiModel = model || 'gemini-2.5-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`

    // Convertir formato OpenAI → Gemini
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

    const body = { contents }
    if (systemInstruction || messages.find(m => m.role === 'system')) {
      body.systemInstruction = { parts: [{ text: systemInstruction || messages.find(m => m.role === 'system')?.content || '' }] }
    }
    if (temperature !== undefined) {
      body.generationConfig = { temperature, maxOutputTokens: max_tokens || 2048 }
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Referer: GEMINI_KEY_REFERER },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Gemini API error', { status: response.status, body: errorText })
        throw upstreamHttpsError('Gemini', response.status)
      }

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      return { content: text, usage: data.usageMetadata }
    } catch (error) {
      // Si ya es un HttpsError (status upstream mapeado), propagarlo tal cual
      // para que el code/status real lleguen al cliente y al missionLog.
      if (error instanceof HttpsError) throw error
      logger.error('Gemini proxy error:', error)
      throw new HttpsError('internal', 'Gemini: error interno del proxy')
    }
  }
)

// ==================== GEMINI VISION PROXY ====================
// Análisis de fotos (ChatBot.tsx → ai.ts:callGeminiVision) — el cliente
// descarga las imágenes de Storage y las manda en base64 (no requiere la
// key), este proxy es quien tiene la GEMINI_API_KEY real. Antes la key vivía
// en el bundle del cliente (VITE_GEMINI_API_KEY); quedó en blanco en un
// hardening previo y la feature de análisis de fotos quedó rota en silencio
// — este proxy la repara completando la migración a Cloud Functions.
exports.geminiVisionProxy = onCall(
  {
    secrets: ['GEMINI_API_KEY'],
    enforceAppCheck: false,
    maxInstances: 10,
    timeoutSeconds: 60,
  },
  async (request) => {
    if (!request.auth) {
      throw new Error('Se requiere autenticación para usar la IA')
    }

    const { imageParts, prompt, model, temperature, max_tokens, thinkingBudget } = request.data

    if (!Array.isArray(imageParts) || imageParts.length === 0) {
      throw new Error('Se requiere al menos una imagen')
    }
    if (imageParts.length > 3) {
      throw new Error('Máximo 3 imágenes por análisis')
    }
    for (const p of imageParts) {
      if (!p || typeof p.mimeType !== 'string' || typeof p.data !== 'string' || p.data.length > 8_000_000) {
        throw new Error('Imagen inválida o demasiado grande')
      }
    }
    if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > 4000) {
      throw new Error('Prompt inválido')
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      logger.error('GEMINI_API_KEY not configured in Firebase secrets')
      throw new Error('Servicio Gemini no configurado')
    }

    const geminiModel = model || 'gemini-2.5-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`

    const generationConfig = {
      temperature: temperature ?? 0.3,
      maxOutputTokens: max_tokens || 1024,
    }
    if (thinkingBudget && thinkingBudget > 0) {
      generationConfig.thinkingConfig = { thinkingBudget }
    }

    const body = {
      contents: [{
        parts: [
          ...imageParts.map(p => ({ inlineData: { mimeType: p.mimeType, data: p.data } })),
          { text: prompt },
        ],
      }],
      generationConfig,
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Referer: GEMINI_KEY_REFERER },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Gemini Vision API error', { status: response.status, body: errorText })
        throw upstreamHttpsError('Gemini', response.status)
      }

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      return { content: text, usage: data.usageMetadata }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      logger.error('Gemini Vision proxy error:', error)
      throw new HttpsError('internal', 'Gemini Vision: error interno del proxy')
    }
  }
)

// ==================== DEEPSEEK PROXY ====================

exports.deepseekProxy = onCall(
  {
    secrets: ['DEEPSEEK_API_KEY'],
    enforceAppCheck: false,
    maxInstances: 5,
  },
  async (request) => {
    if (!request.auth) {
      throw new Error('Se requiere autenticación para usar la IA')
    }

    const { messages, model, temperature, max_tokens } = request.data

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('Se requiere al menos un mensaje')
    }

    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      logger.error('DEEPSEEK_API_KEY not configured in Firebase secrets')
      throw new Error('Servicio DeepSeek no configurado')
    }

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'deepseek-chat',
          messages,
          temperature: temperature ?? 0.3,
          max_tokens: max_tokens || 2048,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('DeepSeek API error', { status: response.status, body: errorText })
        throw upstreamHttpsError('DeepSeek', response.status)
      }

      const data = await response.json()
      return {
        content: data.choices?.[0]?.message?.content || '',
        usage: data.usage,
      }
    } catch (error) {
      // Si ya es un HttpsError (status upstream mapeado), propagarlo tal cual
      // para que el code/status real lleguen al cliente y al missionLog.
      if (error instanceof HttpsError) throw error
      logger.error('DeepSeek proxy error:', error)
      throw new HttpsError('internal', 'DeepSeek: error interno del proxy')
    }
  }
)

// ==================== SENSOR READINGS PURGE ====================

/**
 * Purga lecturas de sensores con más de SENSOR_RETENTION_DAYS días.
 * Ejecuta todos los días a las 03:00 UTC.
 * Recorre sensors/{equipmentId}/readings y elimina las que tengan
 * timestamp < (ahora - 30 días).
 *
 * Soporta timestamps en milisegundos y en segundos.
 */
exports.purgeSensorReadings = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'America/Santiago',
    timeoutSeconds: 540,
    memory: '256MiB',
    retryCount: 1,
  },
  async () => {
    const cutoffMs = Date.now() - SENSOR_RETENTION_DAYS * 24 * 60 * 60 * 1000
    const cutoffSec = Math.floor(cutoffMs / 1000)

    logger.info(`[purgeSensorReadings] Iniciando purga. Cutoff: ${new Date(cutoffMs).toISOString()} (${cutoffMs} ms / ${cutoffSec} s)`)

    const sensorsRef = getRtdb().ref('sensors')
    const sensorsSnap = await sensorsRef.once('value')

    if (!sensorsSnap.exists()) {
      logger.info('[purgeSensorReadings] No hay nodos en sensors/')
      return
    }

    let totalDeleted = 0
    let totalEquipments = 0

    const equipmentIds = Object.keys(sensorsSnap.val())

    for (const equipmentId of equipmentIds) {
      const readingsRef = getRtdb().ref(`sensors/${equipmentId}/readings`)

      // Buscar registros con timestamp < cutoff en milisegundos
      const oldMsSnap = await readingsRef
        .orderByChild('timestamp')
        .endAt(cutoffMs)
        .limitToFirst(500)
        .once('value')

      if (!oldMsSnap.exists()) continue

      const updates = {}
      let count = 0

      oldMsSnap.forEach((child) => {
        const val = child.val()
        const ts = val?.timestamp
        if (typeof ts !== 'number') return

        // Verificar: es ms y está viejo, O es segundos y está viejo
        const isOldMs = ts >= 1e12 && ts < cutoffMs
        const isOldSec = ts > 0 && ts < 1e12 && ts < cutoffSec

        if (isOldMs || isOldSec) {
          updates[child.key] = null
          count++
        }
      })

      if (count > 0) {
        await readingsRef.update(updates)
        totalDeleted += count
        totalEquipments++
        logger.info(`[purgeSensorReadings] ${equipmentId}: eliminadas ${count} lecturas`)
      }
    }

    logger.info(`[purgeSensorReadings] Purga completada. Total: ${totalDeleted} lecturas de ${totalEquipments} equipos`)
  }
)

/**
 * Purga manual invocable desde la PWA (solo admin).
 * Permite forzar una limpieza sin esperar al cron.
 */
exports.purgeSensorReadingsManual = onCall(
  { enforceAppCheck: false },
  async (request) => {
    // Solo admins
    if (!request.auth) {
      throw new Error('No autenticado')
    }

    const userDoc = await db.collection('users').doc(request.auth.uid).get()
    const rol = userDoc.data()?.rol
    if (rol !== 'admin') {
      throw new Error('Solo administradores pueden ejecutar la purga manual')
    }

    const days = request.data?.days ?? SENSOR_RETENTION_DAYS
    const retentionDays = Math.max(1, Math.min(365, Number(days) || SENSOR_RETENTION_DAYS))
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const cutoffSec = Math.floor(cutoffMs / 1000)

    logger.info(`[purgeSensorReadingsManual] uid=${request.auth.uid} retentionDays=${retentionDays}`)

    const sensorsRef = getRtdb().ref('sensors')
    const sensorsSnap = await sensorsRef.once('value')
    if (!sensorsSnap.exists()) {
      return { deleted: 0, equipments: 0, message: 'No hay datos de sensores' }
    }

    let totalDeleted = 0
    let totalEquipments = 0
    const equipmentIds = Object.keys(sensorsSnap.val())

    for (const equipmentId of equipmentIds) {
      const readingsRef = getRtdb().ref(`sensors/${equipmentId}/readings`)
      const oldSnap = await readingsRef
        .orderByChild('timestamp')
        .endAt(cutoffMs)
        .limitToFirst(1000)
        .once('value')

      if (!oldSnap.exists()) continue

      const updates = {}
      let count = 0

      oldSnap.forEach((child) => {
        const val = child.val()
        const ts = val?.timestamp
        if (typeof ts !== 'number') return

        const isOldMs = ts >= 1e12 && ts < cutoffMs
        const isOldSec = ts > 0 && ts < 1e12 && ts < cutoffSec

        if (isOldMs || isOldSec) {
          updates[child.key] = null
          count++
        }
      })

      if (count > 0) {
        await readingsRef.update(updates)
        totalDeleted += count
        totalEquipments++
      }
    }

    return {
      deleted: totalDeleted,
      equipments: totalEquipments,
      retentionDays,
      cutoff: new Date(cutoffMs).toISOString(),
      message: `Eliminadas ${totalDeleted} lecturas de ${totalEquipments} equipos (retención: ${retentionDays} días)`,
    }
  }
)

// ==================== PROXY SITPORT DIRECTEMAR ====================
/**
 * Proxy/fallback para consultar la API oficial de SITPORT (DIRECTEMAR).
 * La API principal (orion.directemar.cl) tiene CORS abierto (*) así que
 * el frontend la llama directo. Esta Cloud Function sirve como fallback
 * por si CORS deja de funcionar o la API cambia de dominio.
 *
 * Uso: GET https://<region>-<project>.cloudfunctions.net/sitportProxy
 * Retorna: JSON con { ok, data[], timestamp } donde data es el array
 *          completo de Totalgeneral de SITPORT.
 *
 * Cache: 2 min CDN / 1 min browser.
 */
// ==================== CACHE DM STATUS (desde navegador) ====================
/**
 * El navegador del usuario puede acceder a SITPORT pero GCP no.
 * El embed llama esta función HTTP con los datos DM para cachearlos
 * en Firestore, y así checkClimaPortoAlert los puede leer.
 */
// Sin auth A PROPÓSITO: lo llama el navegador de CUALQUIER visitante del embed
// público (ver comentario arriba) — un secreto embebido en ese HTML estático
// sería extraíble con "ver código fuente" y no protegería nada real. La
// mitigación aplicable es validar estrictamente la FORMA del payload (tipos +
// topes de tamaño) para que un curl malicioso no pueda inyectar objetos
// arbitrarios/gigantes al doc cacheado — no evita spoofear el estado (impacto
// bajo: solo cambia lo que se MUESTRA en el widget de clima, no autoriza nada).
function isPlainBoolOrUndef(v) { return v === undefined || typeof v === 'boolean' }
function isShortStringOrNull(v) { return v === null || v === undefined || (typeof v === 'string' && v.length <= 500) }

exports.cacheDmStatus = onRequest(
  { region: 'us-central1', cors: ALLOWED_ORIGINS, maxInstances: 5 },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
    const d = req.body
    const valid = d && typeof d.found === 'boolean'
      && isPlainBoolOrUndef(d.restriccionBahia)
      && isPlainBoolOrUndef(d.navesMenores)
      && isPlainBoolOrUndef(d.navesMayores)
      && (d.numRestricciones === undefined || (typeof d.numRestricciones === 'number' && Number.isFinite(d.numRestricciones)))
      && isShortStringOrNull(d.estado)
      && (d.meteo === undefined || d.meteo === null || (typeof d.meteo === 'object' && JSON.stringify(d.meteo).length <= 2000))
    if (!valid) return res.status(400).json({ error: 'invalid payload' })
    try {
      await db.collection('cache').doc('dmStatus').set({
        found:            d.found,
        restriccionBahia: d.restriccionBahia ?? false,
        navesMenores:     d.navesMenores     ?? false,
        navesMayores:     d.navesMayores     ?? false,
        numRestricciones: d.numRestricciones ?? 0,
        estado:           d.estado ?? null,
        meteo:            d.meteo ?? null,
        updatedAt:        FieldValue.serverTimestamp(),
      })
      res.json({ ok: true })
    } catch (e) {
      logger.error('cacheDmStatus error', e.message)
      res.status(500).json({ error: e.message })
    }
  }
)

// ==================== CLIMA PUERTO — ALERTAS AUTOMÁTICAS ====================

const CHONCHI_LAT = -42.62
const CHONCHI_LON = -73.77

// Factor de corrección por terreno protegido: Bahía de Yal es un canal
// abrigado donde las rachas reales son ~80% del valor calculado para
// terreno abierto. Alinea con Apple Weather / ECMWF.
const SHELTER_FACTOR = 0.80

// Helper: % del umbral de cierre (0 = calma, 100 = umbral alcanzado)
function _pct(value, closureThreshold) {
  return Math.max(0, Math.min(100, (value / closureThreshold) * 100))
}

/* ── Índice de riesgo — modelo "% del cierre" ──
   Cada parámetro se mide como porcentaje de su umbral histórico de
   cierre para Puerto Chonchi (canal protegido, Chiloé · Caleta menor).
   100/100 = TODAS las condiciones en nivel de cierre de puerto.

   Umbrales de cierre DIRECTEMAR (referencia histórica Chonchi):
   Rachas:      40 km/h  (~22 kt, Beaufort 5-6 en canal)
   Viento:      30 km/h  (~16 kt sostenido)
   Oleaje:       1.5 m   (significativo para canal protegido)
   Lluvia:       8 mm/h  (precipitación intensa)
   Presión:     15 hPa   (caída desde 1013 → 998 hPa)
   Visibilidad:  9 km    (pérdida desde 10 km → 1 km)
   Período ola:  7 s     (pérdida desde 10 s → 3 s, oleaje picado) */
function _calcRiskIndex(sample) {
  const isStorm       = [95, 96, 99].includes(sample.code)
  const isFog         = [45, 48].includes(sample.code)
  const isHeavyPrecip = [65, 67, 75, 82, 86].includes(sample.code)
  const isModPrecip   = [63, 66, 73, 81, 85].includes(sample.code)

  // Cada componente: % del umbral de cierre (0 = calma, 100 = cierre)
  const c = {
    gust:       _pct(sample.gust, 40),
    wind:       _pct(sample.wind, 30),
    wave:       _pct(sample.wave, 1.5),
    rain:       _pct(sample.rain, 8),
    pressure:   _pct(Math.max(0, 1013 - sample.pressure), 15),
    visibility: _pct(Math.max(0, 10000 - sample.visibility), 9000),
    wavePeriod: _pct(Math.max(0, 10 - sample.wavePeriod), 7),
    storm:      isStorm ? 100 : 0,
    fog:        isFog   ? 100 : 0,
    precip:     isHeavyPrecip ? 100 : (isModPrecip ? 60 : 0),
  }

  // Pesos: importancia relativa en decisión DIRECTEMAR de cierre. Suma = 1.0
  return Math.max(0, Math.min(100,
    c.gust       * 0.22 +   // Rachas: factor más determinante
    c.wind       * 0.14 +   // Viento sostenido
    c.wave       * 0.16 +   // Oleaje
    c.rain       * 0.06 +   // Precipitación medida
    c.pressure   * 0.08 +   // Presión atmosférica
    c.visibility * 0.10 +   // Visibilidad
    c.wavePeriod * 0.04 +   // Período de ola
    c.storm      * 0.08 +   // Evento de tormenta
    c.fog        * 0.06 +   // Niebla
    c.precip     * 0.06     // Precipitación WMO
  ))
}

function _riskLevel(ri) {
  if (ri >= 65) return 'ALTO'
  if (ri >= 35) return 'MEDIO'
  return 'BAJO'
}

/**
 * Calcula la tendencia de riesgo para las próximas 12h.
 * Retorna string listo para incluir en notificación push.
 */
function _calcTrendLine(weather, marine, nowIdx) {
  const times = weather.hourly?.time ?? []
  const marineMap = {}
  ;(marine.hourly?.time ?? []).forEach((t, i) => {
    marineMap[t] = {
      wave:       marine.hourly.wave_height?.[i]  ?? 0,
      wavePeriod: marine.hourly.wave_period?.[i]  ?? 8,
    }
  })

  // Calcular riesgo hora a hora (0h = ahora, hasta +12h)
  const risks = []
  for (let h = 0; h <= 12; h++) {
    const idx = nowIdx + h
    if (idx >= times.length) break
    const t = times[idx]
    const s = {
      gust:       (weather.hourly.wind_gusts_10m?.[idx]       ?? 0) * SHELTER_FACTOR,
      wind:       (weather.hourly.wind_speed_10m?.[idx]       ?? 0) * SHELTER_FACTOR,
      rain:       weather.hourly.precipitation?.[idx]        ?? 0,
      code:       weather.hourly.weather_code?.[idx]         ?? 0,
      pressure:   weather.hourly.pressure_msl?.[idx]         ?? 1015,
      cloud:      weather.hourly.cloud_cover?.[idx]          ?? 0,
      humidity:   weather.hourly.relative_humidity_2m?.[idx] ?? 0,
      visibility: weather.hourly.visibility?.[idx]           ?? 10000,
      wave:       marineMap[t]?.wave       ?? 0,
      wavePeriod: marineMap[t]?.wavePeriod ?? 8,
    }
    risks.push({ h, ri: _calcRiskIndex(s) })
  }
  if (risks.length < 3) return null

  const now    = risks[0].ri
  const nowLvl = _riskLevel(now)

  // Dirección: promedio últimas 4h vs ahora
  const tail = risks.slice(-4)
  const avg  = tail.reduce((s, r) => s + r.ri, 0) / tail.length
  const delta = avg - now

  // Buscar primera hora donde el nivel cambia (cruce de umbral)
  let crossHour = null
  let crossDir  = null  // 'mejora' | 'empeora'
  for (const r of risks) {
    if (r.h === 0) continue
    const lvl = _riskLevel(r.ri)
    if (nowLvl === 'ALTO' && lvl !== 'ALTO')  { crossHour = r.h; crossDir = 'mejora';   break }
    if (nowLvl === 'MEDIO' && lvl === 'BAJO')  { crossHour = r.h; crossDir = 'mejora';   break }
    if (nowLvl === 'MEDIO' && lvl === 'ALTO')  { crossHour = r.h; crossDir = 'empeora';  break }
    if (nowLvl === 'BAJO'  && lvl !== 'BAJO')  { crossHour = r.h; crossDir = 'empeora';  break }
  }

  // Pico máximo en ventana
  const peak = risks.reduce((mx, r) => r.ri > mx.ri ? r : mx, risks[0])

  // Armar texto
  let arrow, label
  if (delta < -8) {
    arrow = '📉'; label = 'Mejorando'
  } else if (delta > 8) {
    arrow = '📈'; label = 'Empeorando'
  } else {
    arrow = '➡️'; label = 'Estable'
  }

  let detail = ''
  if (crossDir === 'mejora' && crossHour) {
    detail = ` · Apertura probable ~${crossHour}h`
  } else if (crossDir === 'empeora' && crossHour) {
    detail = ` · Cierre probable ~${crossHour}h`
  } else if (peak.h > 0 && peak.ri > now + 10) {
    detail = ` · Pico ${Math.round(peak.ri)}/100 en ~${peak.h}h`
  }

  return `${arrow} ${label}${detail}`
}

async function _getAllFcmTokens() {
  const snap = await db.collection('fcmTokens').get()
  // Deduplicar: un token por usuario+plataforma (evita notificaciones duplicadas)
  const best = new Map() // key: "userId:platform" → { token, updatedAt }
  snap.forEach(doc => {
    const d = doc.data()
    const t = d?.token
    if (!t || typeof t !== 'string') return
    const key = `${d.userId || 'anon'}:${d.platform || 'unknown'}`
    const prev = best.get(key)
    const ts = d.updatedAt?.toDate?.() ?? new Date(0)
    if (!prev || ts > prev.updatedAt) {
      best.set(key, { token: t, updatedAt: ts })
    }
  })
  return Array.from(new Set([...best.values()].map(v => v.token)))
}

async function _fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MantenimientoApp/1.0)',
        'Accept': 'application/json',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function _fetchDmStatus() {
  // Leer desde cache en Firestore (actualizado por el navegador del usuario)
  // SITPORT bloquea peticiones desde GCP, por eso usamos cache del navegador
  try {
    const cacheDoc = await db.collection('cache').doc('dmStatus').get()
    if (cacheDoc.exists) {
      const cached = cacheDoc.data()
      const age = Date.now() - (cached.updatedAt?.toDate?.()?.getTime?.() ?? 0)
      // Cache válido si tiene < 3 horas de antigüedad
      if (age < 3 * 60 * 60 * 1000 && cached.found) {
        return {
          found:            true,
          restriccionBahia: cached.restriccionBahia ?? false,
          navesMenores:     cached.navesMenores     ?? false,
          navesMayores:     cached.navesMayores     ?? false,
          numRestricciones: cached.numRestricciones ?? 0,
          meteo:            cached.meteo ?? null,
        }
      }
    }
  } catch (e) {
    logger.warn('_fetchDmStatus: cache read error', e.message)
  }

  return null
}

function _dmKey(dm) {
  if (!dm || !dm.found)                           return 'UNKNOWN'
  if (dm.restriccionBahia)                        return 'BAHIA_CERRADA'
  if (dm.navesMenores || dm.navesMayores)         return 'RESTRINGIDO'
  return 'ABIERTO'
}

/* ─── Lógica core de chequeo clima puerto (reutilizable) ─── */
async function _runClimaCheck(source = 'scheduler') {
  logger.info('_runClimaCheck: inicio', { source })

  // 1. Fetch datos meteorológicos y marinos
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${CHONCHI_LAT}&longitude=${CHONCHI_LON}&timezone=America/Santiago&hourly=precipitation,weather_code,wind_speed_10m,wind_gusts_10m,pressure_msl,cloud_cover,relative_humidity_2m,visibility&forecast_days=2`
  const marineUrl  = `https://marine-api.open-meteo.com/v1/marine?latitude=${CHONCHI_LAT}&longitude=${CHONCHI_LON}&timezone=America/Santiago&hourly=wave_height,wave_period&forecast_days=2`

  let weather, marine
  try {
    ;[weather, marine] = await Promise.all([_fetchJson(weatherUrl), _fetchJson(marineUrl)])
  } catch (e) {
    logger.error('_runClimaCheck: error fetch meteorológico', e)
    return { error: 'fetch_failed' }
  }

  // 2. Calcular riesgo actual + máximo próximas 6h
  const times = weather.hourly?.time ?? []
  const nowSantiago = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  let nowIdx = 0, minDiff = Infinity
  times.forEach((t, i) => {
    const diff = Math.abs(new Date(t) - nowSantiago)
    if (diff < minDiff) { minDiff = diff; nowIdx = i }
  })

  const marineMap = {}
  ;(marine.hourly?.time ?? []).forEach((t, i) => {
    marineMap[t] = {
      wave:       marine.hourly.wave_height?.[i]  ?? 0,
      wavePeriod: marine.hourly.wave_period?.[i]  ?? 8,
    }
  })

  let currentRi = 0, maxRiNext6h = 0
  for (let offset = 0; offset <= 6; offset++) {
    const idx = nowIdx + offset
    if (idx >= times.length) break
    const t = times[idx]
    const sample = {
      gust:       (weather.hourly.wind_gusts_10m?.[idx]         ?? 0) * SHELTER_FACTOR,
      wind:       (weather.hourly.wind_speed_10m?.[idx]         ?? 0) * SHELTER_FACTOR,
      rain:       weather.hourly.precipitation?.[idx]          ?? 0,
      code:       weather.hourly.weather_code?.[idx]           ?? 0,
      pressure:   weather.hourly.pressure_msl?.[idx]           ?? 1015,
      cloud:      weather.hourly.cloud_cover?.[idx]            ?? 0,
      humidity:   weather.hourly.relative_humidity_2m?.[idx]   ?? 0,
      visibility: weather.hourly.visibility?.[idx]             ?? 10000,
      wave:       marineMap[t]?.wave       ?? 0,
      wavePeriod: marineMap[t]?.wavePeriod ?? 8,
    }
    const ri = _calcRiskIndex(sample)
    if (offset === 0) currentRi = ri
    if (ri > maxRiNext6h) maxRiNext6h = ri
  }

  const currentLevel  = _riskLevel(currentRi)
  const forecastLevel = _riskLevel(maxRiNext6h)

  // Tendencia próximas 12h
  const trendLine = _calcTrendLine(weather, marine, nowIdx)

  // 3. Estado DIRECTEMAR
  const dm    = await _fetchDmStatus()
  const dmKey = _dmKey(dm)

  // 4. Leer estado anterior de Firestore
  const stateRef  = db.collection('climaPuertoAlertState').doc('chonchi')
  const stateSnap = await stateRef.get()
  const prev      = stateSnap.exists ? stateSnap.data() : {}
  const prevLevel = prev.forecastLevel || 'BAJO'
  const prevDmKey = prev.dmKey         || 'UNKNOWN'
  const prevUpdated = prev.updatedAt?.toDate?.() ?? null

  logger.info('_runClimaCheck: estado', {
    currentRi: Math.round(currentRi), maxRiNext6h: Math.round(maxRiNext6h),
    currentLevel, forecastLevel, dmKey, prevLevel, prevDmKey,
  })

  // 5. Armar notificaciones
  const notifications = []
  const trendSuffix = trendLine ? `\n${trendLine}` : ''

  // Horas desde la última actualización
  const hoursSinceUpdate = prevUpdated
    ? (Date.now() - prevUpdated.getTime()) / 3600000
    : Infinity

  const levelChanged = forecastLevel !== prevLevel
  const dmChanged    = dmKey !== prevDmKey && dmKey !== 'UNKNOWN' && dmKey !== 'DESCONOCIDO'

  // Enviar notificación de clima si:
  // a) El nivel cambió (transición), O
  // b) El nivel es ALTO/MEDIO y han pasado >= 3h (recordatorio periódico)
  const shouldNotifyClima = levelChanged ||
    ((forecastLevel === 'ALTO' || forecastLevel === 'MEDIO') && hoursSinceUpdate >= 3)

  if (shouldNotifyClima) {
    if (forecastLevel === 'ALTO') {
      notifications.push({
        title: '⛔ Puerto Chonchi: Cierre probable',
        body:  `Riesgo ${Math.round(maxRiNext6h)}/100 próx. 6h. Condiciones severas en Bahía de Yal.${trendSuffix}`,
        data:  { type: 'clima_cierre', ri: String(Math.round(maxRiNext6h)), url: '/clima-puerto' },
      })
    } else if (forecastLevel === 'MEDIO') {
      notifications.push({
        title: '⚠️ Puerto Chonchi: Posible restricción',
        body:  `Riesgo ${Math.round(maxRiNext6h)}/100. Verificar condiciones en Bahía de Yal.${trendSuffix}`,
        data:  { type: 'clima_restriccion', ri: String(Math.round(maxRiNext6h)), url: '/clima-puerto' },
      })
    } else {
      notifications.push({
        title: '🟢 Puerto Chonchi: Condiciones mejoran',
        body:  `Riesgo ${Math.round(currentRi)}/100. Bahía de Yal con condiciones favorables.${trendSuffix}`,
        data:  { type: 'clima_abierto', ri: String(Math.round(currentRi)), url: '/clima-puerto' },
      })
    }
  }

  if (dmChanged) {
    if (dmKey === 'BAHIA_CERRADA') {
      notifications.push({
        title: '🔴 DIRECTEMAR: Bahía de Yal cerrada',
        body:  'Restricción total oficial. Puerto Chonchi / Bahía de Yal sin operación.',
        data:  { type: 'dm_cierre', url: '/clima-puerto' },
      })
    } else if (dmKey === 'RESTRINGIDO') {
      const detail = (dm?.navesMenores && dm?.navesMayores)
        ? 'naves mayores y menores'
        : dm?.navesMenores ? 'naves menores' : 'naves mayores'
      notifications.push({
        title: '🟡 DIRECTEMAR: Puerto con restricciones',
        body:  `Restricciones para ${detail} en Chonchi / Bahía de Yal.`,
        data:  { type: 'dm_restriccion', url: '/clima-puerto' },
      })
    } else if (dmKey === 'ABIERTO') {
      notifications.push({
        title: '🟢 DIRECTEMAR: Puerto abierto',
        body:  'Sin restricciones en Bahía de Yal. Puerto Chonchi operativo.',
        data:  { type: 'dm_abierto', url: '/clima-puerto' },
      })
    }
  }

  // 6. Enviar push a todos los usuarios con token registrado
  let sent = 0
  if (notifications.length > 0) {
    const tokens = await _getAllFcmTokens()
    if (tokens.length === 0) {
      logger.warn('_runClimaCheck: sin tokens FCM registrados')
    } else {
      for (const notif of notifications) {
        await sendNotification(tokens, notif.title, notif.body, notif.data)
        sent++
      }
    }
  }

  // 7. Guardar nuevo estado
  await stateRef.set({
    currentRi:    Math.round(currentRi),
    maxRiNext6h:  Math.round(maxRiNext6h),
    currentLevel,
    forecastLevel,
    dmKey,
    updatedAt:    new Date(),
  })

  const result = {
    currentRi: Math.round(currentRi),
    maxRiNext6h: Math.round(maxRiNext6h),
    currentLevel, forecastLevel, dmKey,
    prevLevel, prevDmKey,
    levelChanged, dmChanged, shouldNotifyClima,
    notificacionesEnviadas: sent,
    hoursSinceUpdate: Math.round(hoursSinceUpdate * 10) / 10,
  }
  logger.info('_runClimaCheck: fin', result)
  return result
}

exports.checkClimaPortoAlert = onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'America/Santiago', region: 'us-central1' },
  async () => { await _runClimaCheck('scheduler') }
)

// Endpoint HTTP para ejecutar manualmente el chequeo (testing / backup del scheduler).
// Herramienta manual de admin — ningún cliente la llama automáticamente.
exports.runClimaPortoCheck = onRequest(
  { region: 'us-central1', cors: ALLOWED_ORIGINS, timeoutSeconds: 30, memory: '256MiB' },
  async (req, res) => {
    if (!requireAdminKey(req, res)) return
    const result = await _runClimaCheck('http')
    res.json({ ok: !result?.error, ...result })
  }
)

// Envía una notificación push de prueba con datos reales del clima, después de un delay.
// Solo para admins. El delay le da tiempo al usuario de cerrar la app.
exports.scheduleClimaPortoTestNotification = onCall(
  { region: 'us-central1', timeoutSeconds: 340 },
  async (request) => {
    const userId = request.auth?.uid
    if (!userId) throw new HttpsError('unauthenticated', 'Debes iniciar sesión')

    let user
    try {
      const userSnap = await db.collection('users').doc(userId).get()
      user = userSnap.data()
    } catch (e) {
      logger.error('scheduleClimaPortoTestNotification: error leyendo usuario', e)
      throw new HttpsError('internal', 'Error al verificar usuario')
    }

    if (!user || user.rol !== 'admin') {
      throw new HttpsError('permission-denied', 'Solo los administradores pueden usar esta función')
    }

    const delaySeconds = Math.min(300, Math.max(10, Number(request.data?.delaySeconds) || 30))

    logger.info('scheduleClimaPortoTestNotification: inicio', { userId, delaySeconds })

    // Enviar a TODOS los usuarios (el test simula una alerta real)
    let tokens = []
    try {
      tokens = await _getAllFcmTokens()
    } catch (e) {
      logger.error('scheduleClimaPortoTestNotification: error leyendo tokens FCM', e)
      return { success: false, reason: 'token_error', message: 'Error al obtener tokens de notificación.' }
    }

    if (tokens.length === 0) {
      return { success: false, reason: 'no_tokens', message: 'No hay usuarios con notificaciones activadas.' }
    }

    // Esperar el delay (la función sigue corriendo en el servidor aunque el cliente cierre la app)
    await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000))

    // Fetch datos meteorológicos actuales
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${CHONCHI_LAT}&longitude=${CHONCHI_LON}&timezone=America/Santiago&hourly=precipitation,weather_code,wind_speed_10m,wind_gusts_10m,pressure_msl,cloud_cover,relative_humidity_2m,visibility&forecast_days=2`
    const marineUrl  = `https://marine-api.open-meteo.com/v1/marine?latitude=${CHONCHI_LAT}&longitude=${CHONCHI_LON}&timezone=America/Santiago&hourly=wave_height,wave_period&forecast_days=2`
    let weather, marine
    try {
      ;[weather, marine] = await Promise.all([_fetchJson(weatherUrl), _fetchJson(marineUrl)])
    } catch (e) {
      logger.error('scheduleClimaPortoTestNotification: error fetchando datos clima', e)
      return { success: false, reason: 'fetch_error', message: 'No se pudo obtener datos meteorológicos' }
    }

    // Calcular índice de riesgo para la hora actual
    const times = weather.hourly?.time ?? []
    const nowSantiago = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }))
    let nowIdx = 0, minDiff = Infinity
    times.forEach((t, i) => {
      const diff = Math.abs(new Date(t) - nowSantiago)
      if (diff < minDiff) { minDiff = diff; nowIdx = i }
    })

    const marineMap = {}
    ;(marine.hourly?.time ?? []).forEach((t, i) => {
      marineMap[t] = { wave: marine.hourly.wave_height?.[i] ?? 0, wavePeriod: marine.hourly.wave_period?.[i] ?? 8 }
    })

    const t = times[nowIdx]
    const sample = {
      gust:       (weather.hourly.wind_gusts_10m?.[nowIdx]       ?? 0) * SHELTER_FACTOR,
      wind:       (weather.hourly.wind_speed_10m?.[nowIdx]       ?? 0) * SHELTER_FACTOR,
      rain:       weather.hourly.precipitation?.[nowIdx]        ?? 0,
      code:       weather.hourly.weather_code?.[nowIdx]         ?? 0,
      pressure:   weather.hourly.pressure_msl?.[nowIdx]         ?? 1015,
      cloud:      weather.hourly.cloud_cover?.[nowIdx]          ?? 0,
      humidity:   weather.hourly.relative_humidity_2m?.[nowIdx] ?? 0,
      visibility: weather.hourly.visibility?.[nowIdx]           ?? 10000,
      wave:       marineMap[t]?.wave       ?? 0,
      wavePeriod: marineMap[t]?.wavePeriod ?? 8,
    }

    const ri  = _calcRiskIndex(sample)
    const lvl = _riskLevel(ri)

    let dmK = 'UNKNOWN'
    let dm = null
    try {
      dm = await _fetchDmStatus()
      dmK = _dmKey(dm)
    } catch (e) {
      logger.warn('scheduleClimaPortoTestNotification: error obteniendo DM, usando UNKNOWN', e)
    }

    const dmLabels = { ABIERTO: '🟢 Abierto', RESTRINGIDO: '🟡 Restringido', BAHIA_CERRADA: '🔴 Cerrado', UNKNOWN: '❓ Sin datos' }
    const lvlEmoji = { ALTO: '⛔', MEDIO: '⚠️', BAJO: '🟢' }

    // Datos reales del sensor DIRECTEMAR (si existen)
    const dmMeteo = dm?.meteo ?? null
    const dmWind = dmMeteo ? `${Math.round(dmMeteo.velocidadViento * 1.852)} km/h ${dmMeteo.textoDireccionViento || ''}`.trim() : null
    const dmTemp = dmMeteo ? `${dmMeteo.temperatura}°C` : null

    // Tendencia próximas 12h
    const trendLine = _calcTrendLine(weather, marine, nowIdx)

    const title = `🧪 Test · Puerto Chonchi · ${dmLabels[dmK] || dmK}`
    const lines = [
      `${lvlEmoji[lvl] || ''} Riesgo ${Math.round(ri)}/100 (${lvl})`,
      trendLine,
      `🌬 Rachas ${Math.round(sample.gust)} km/h · Viento ${Math.round(sample.wind)} km/h`,
      sample.rain > 0 ? `🌧 Lluvia ${sample.rain.toFixed(1)} mm` : null,
      `🌊 Olas ${sample.wave.toFixed(1)}m · Presión ${Math.round(sample.pressure)} hPa`,
      dmWind ? `📡 Sensor DM: ${dmWind} · ${dmTemp}` : null,
    ].filter(Boolean)
    const body = lines.join('\n')

    try {
      await sendNotification(tokens, title, body, { type: 'clima_test', url: '/clima-puerto' })
    } catch (e) {
      logger.error('scheduleClimaPortoTestNotification: error enviando notificación FCM', e)
      return { success: false, reason: 'send_error', message: 'Error al enviar la notificación push' }
    }

    logger.info('scheduleClimaPortoTestNotification: enviado', { userId, ri: Math.round(ri), dmK })
    return { success: true, ri: Math.round(ri), level: lvl, dmKey: dmK }
  }
)

exports.sitportProxy = onRequest(
  {
    region: 'us-central1',
    cors: ALLOWED_ORIGINS,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'Method not allowed' })
      return
    }

    res.set('Cache-Control', 'public, max-age=60, s-maxage=120')

    const SITPORT_API = 'https://orion.directemar.cl/sitport/back/users/Totalgeneral'

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20000)

      const response = await fetch(SITPORT_API, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MantenimientoApp/1.0)',
          'Accept': 'application/json',
        },
      })
      clearTimeout(timeout)

      if (!response.ok) {
        logger.warn('SITPORT API responded with status', response.status)
        res.status(502).json({
          ok: false,
          error: `SITPORT API HTTP ${response.status}`,
          timestamp: new Date().toISOString(),
        })
        return
      }

      const data = await response.json()
      logger.info('SITPORT API fetched OK', { ports: data.length })

      res.json({
        ok: true,
        data,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      logger.error('SITPORT API fetch error', err)
      res.status(502).json({
        ok: false,
        error: err.message || 'Failed to fetch SITPORT API',
        timestamp: new Date().toISOString(),
      })
    }
  }
)

// ==================== TELEGRAM BOT ====================

// ==================== FOTO → INCIDENCIA ====================

const PHOTO_SESSION_TTL_MS = 10 * 60 * 1000 // 10 minutos

async function getPhotoSession(chatId) {
  const snap = await db.collection('telegramPhotoSessions').doc(String(chatId)).get()
  if (!snap.exists) return null
  const data = snap.data()
  const expMs = data.expiresAt instanceof Date
    ? data.expiresAt.getTime()
    : (data.expiresAt?.toMillis?.() ?? 0)
  if (expMs < Date.now()) {
    await snap.ref.delete()
    return null
  }
  return data
}

async function setPhotoSession(chatId, data) {
  await db.collection('telegramPhotoSessions').doc(String(chatId)).set({
    ...data,
    expiresAt: new Date(Date.now() + PHOTO_SESSION_TTL_MS),
  })
}

async function clearPhotoSession(chatId) {
  await db.collection('telegramPhotoSessions').doc(String(chatId)).delete().catch(() => {})
}

/** Descarga el archivo de mayor resolución de un mensaje de Telegram */
async function downloadTelegramFile(fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const metaResp = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getFile?file_id=${fileId}`)
  const meta = await metaResp.json()
  if (!meta.ok) throw new Error(`getFile failed: ${JSON.stringify(meta)}`)
  const dlUrl = `${TELEGRAM_API_BASE}/file/bot${token}/${meta.result.file_path}`
  const resp = await fetch(dlUrl)
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
  return Buffer.from(await resp.arrayBuffer())
}

/** Sube buffer JPEG a Firebase Storage y retorna URL de descarga con token */
async function uploadPhotoToStorage(incidentId, buffer, idx, carpeta = 'incidents') {
  const bucket = getStorageBucket()
  const token = randomUUID()
  const filename = `${carpeta}/${incidentId}/telegram_${Date.now()}_${idx + 1}.jpg`
  const file = bucket.file(filename)
  await file.save(buffer, {
    contentType: 'image/jpeg',
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  })
  const encodedPath = encodeURIComponent(filename)
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`
}

/** Muestra lista de incidencias activas para seleccionar (mensaje NUEVO) */
async function tgShowIncidentSelector(chatId, topicId, photoCount) {
  const snap = await db.collection('incidents')
    .where('status', 'in', ['pendiente', 'confirmada', 'en_proceso'])
    .orderBy('createdAt', 'desc').limit(6).get()

  const buttons = []
  snap.forEach((docSnap) => {
    const d = docSnap.data()
    const emoji = { critica: '🔴', alta: '🟠', media: '🟡', baja: '⚪' }[d.prioridad] || '📋'
    const title = (d.titulo || 'Sin título').substring(0, 38)
    buttons.push([{ text: `${emoji} ${title}`, callback_data: `photo:inc:${docSnap.id}` }])
  })
  if (snap.empty) {
    buttons.push([{ text: '➕ Crear nueva incidencia', callback_data: 'photo:new_inc' }])
  } else {
    buttons.push([{ text: '➕ Crear nueva incidencia', callback_data: 'photo:new_inc' }])
  }
  buttons.push([{ text: '❌ Cancelar', callback_data: 'photo:cancel' }])

  const txt = photoCount > 1 ? `${photoCount} fotos recibidas` : '1 foto recibida'
  return sendTelegramButtons(
    `📸 <b>${txt}</b>\n\n¿A qué incidencia las adjuntamos?`,
    chatId, buttons, { topicId }
  )
}

/** Edita mensaje existente con lista de incidencias */
async function tgShowIncidentSelectorEdit(chatId, messageId, photoCount) {
  const snap = await db.collection('incidents')
    .where('status', 'in', ['pendiente', 'confirmada', 'en_proceso'])
    .orderBy('createdAt', 'desc').limit(6).get()

  const buttons = []
  snap.forEach((docSnap) => {
    const d = docSnap.data()
    const emoji = { critica: '🔴', alta: '🟠', media: '🟡', baja: '⚪' }[d.prioridad] || '📋'
    const title = (d.titulo || 'Sin título').substring(0, 38)
    buttons.push([{ text: `${emoji} ${title}`, callback_data: `photo:inc:${docSnap.id}` }])
  })
  buttons.push([{ text: '➕ Crear nueva incidencia', callback_data: 'photo:new_inc' }])
  buttons.push([{ text: '❌ Cancelar', callback_data: 'photo:cancel' }])

  const txt = photoCount > 1 ? `${photoCount} fotos` : '1 foto'
  return editTelegramMessage(chatId, messageId,
    `📸 ¿A qué incidencia adjuntamos las <b>${txt}</b>?`, buttons)
}

/** Handler principal cuando llega una foto al grupo */
async function tgHandlePhoto(chatId, message, fromName, telegramUserId, topicId) {
  const photos = message.photo || []
  if (photos.length === 0) return
  // Tomar la de mayor resolución (último elemento)
  const best = photos[photos.length - 1]
  const fileId = best.file_id

  const session = await getPhotoSession(chatId)

  if (session) {
    // Acumular foto en sesión existente
    const fileIds = [...(session.fileIds || []), fileId]
    await setPhotoSession(chatId, { ...session, fileIds })
    const count = fileIds.length
    const buttons = [[
      { text: `📎 Adjuntar ${count} foto${count > 1 ? 's' : ''}`, callback_data: 'photo:select_incident' },
      { text: '❌ Cancelar', callback_data: 'photo:cancel' },
    ]]
    return sendTelegramButtons(
      `📸 Foto #${count} agregada. Mandá más o tocá <b>Adjuntar</b>.`,
      chatId, buttons, { topicId }
    )
  }

  // Nueva sesión
  await setPhotoSession(chatId, {
    chatId: String(chatId),
    fileIds: [fileId],
    fromName,
    telegramUserId,
    topicId,
    step: 'selecting_incident',
  })
  return tgShowIncidentSelector(chatId, topicId, 1)
}

/** Callbacks del flujo foto → incidencia */
async function cbFoto(chatId, messageId, params, topicId) {
  const sub = params[0]

  if (sub === 'select_incident') {
    const session = await getPhotoSession(chatId)
    if (!session) return editTelegramMessage(chatId, messageId,
      '⏱️ Sesión expirada (10 min). Mandá la foto de nuevo.',
      [[{ text: '← Menú', callback_data: 'menu' }]])
    return tgShowIncidentSelectorEdit(chatId, messageId, (session.fileIds || []).length)
  }

  if (sub === 'cancel') {
    await clearPhotoSession(chatId)
    return editTelegramMessage(chatId, messageId, '❌ Cancelado.',
      [[{ text: '← Menú', callback_data: 'menu' }]])
  }

  if (sub === 'inc') {
    const incidentId = params.slice(1).join(':')
    const session = await getPhotoSession(chatId)
    if (!session) return editTelegramMessage(chatId, messageId,
      '⏱️ Sesión expirada. Mandá la foto de nuevo.', [])

    await setPhotoSession(chatId, { ...session, incidentId, step: 'selecting_type' })

    const incDoc = await db.collection('incidents').doc(incidentId).get()
    const incTitle = incDoc.exists ? (incDoc.data().titulo || incidentId) : incidentId
    const count = (session.fileIds || []).length
    const buttons = [
      [
        { text: '🔴 ANTES — problema', callback_data: 'photo:type:before' },
        { text: '🟢 DESPUÉS — solución', callback_data: 'photo:type:after' },
      ],
      [
        { text: '↩ Cambiar incidencia', callback_data: 'photo:select_incident' },
        { text: '❌ Cancelar', callback_data: 'photo:cancel' },
      ],
    ]
    return editTelegramMessage(chatId, messageId,
      `📎 <b>${count} foto${count > 1 ? 's' : ''}</b> → <i>${incTitle}</i>\n\n¿Es ANTES o DESPUÉS de la reparación?`,
      buttons)
  }

  if (sub === 'type') {
    const photoType = params[1] // 'before' | 'after'
    const session = await getPhotoSession(chatId)
    if (!session || !session.incidentId) return editTelegramMessage(chatId, messageId,
      '⏱️ Sesión expirada. Mandá la foto de nuevo.', [])

    await editTelegramMessage(chatId, messageId, '⏳ Subiendo foto(s)...', [])

    try {
      const urls = []
      for (let i = 0; i < session.fileIds.length; i++) {
        const buf = await downloadTelegramFile(session.fileIds[i])
        const url = await uploadPhotoToStorage(session.incidentId, buf, i)
        urls.push(url)
      }

      // Agregar URLs al array fotos de la incidencia
      await db.collection('incidents').doc(session.incidentId).update({
        fotos: FieldValue.arrayUnion(...urls),
        updatedAt: FieldValue.serverTimestamp(),
      })

      await clearPhotoSession(chatId)

      const incDoc = await db.collection('incidents').doc(session.incidentId).get()
      const incTitle = incDoc.exists ? (incDoc.data().titulo || session.incidentId) : session.incidentId
      const count = urls.length
      const typeLabel = photoType === 'before' ? '🔴 Antes (problema)' : '🟢 Después (solución)'

      return editTelegramMessage(chatId, messageId,
        `✅ <b>${count} foto${count > 1 ? 's' : ''} guardada${count > 1 ? 's' : ''}</b>\n\n📋 ${incTitle}\n📍 ${typeLabel}\n\n💡 Mandá otra foto para seguir agregando evidencias.`,
        [[{ text: '← Menú', callback_data: 'menu' }]])
    } catch (err) {
      logger.error('Error uploading Telegram photo to Storage', err)
      return editTelegramMessage(chatId, messageId,
        '❌ Error al subir la foto. Intentá de nuevo.',
        [[{ text: '← Menú', callback_data: 'menu' }]])
    }
  }

  if (sub === 'new_inc') {
    return editTelegramMessage(chatId, messageId,
      '📝 <b>Para crear una incidencia con foto:</b>\n\n1. Primero creá la incidencia:\n<code>/incidencia [descripción del problema]</code>\n\n2. Luego mandá la foto — el bot la adjuntará.',
      [[{ text: '← Cancelar', callback_data: 'photo:cancel' }]])
  }
}

// ==================== SENSORES ====================

async function tgHandleSensores(chatId, topicId) {
  try {
    const rtdb = getRtdb()
    const snapshot = await rtdb.ref('sensors').once('value')

    if (!snapshot.exists()) {
      return sendTelegramMessage('📡 No hay sensores conectados.', chatId, { topicId })
    }

    const data = snapshot.val()
    let msg = '<b>📡 Sensores — Tiempo real</b>\n\n'
    let hasData = false

    for (const [equipId, sensor] of Object.entries(data)) {
      if (!sensor || typeof sensor !== 'object') continue
      hasData = true

      const online = sensor.online === true
      const statusDot = online ? '🟢' : '🔴'
      const lastSeen = sensor.lastSeen
        ? new Date(sensor.lastSeen).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' })
        : '—'

      msg += `${statusDot} <b>${equipId}</b>`
      if (!online) msg += ` · última señal ${lastSeen}`
      msg += '\n'

      if (sensor.temperatura?.value !== undefined) {
        const { value, unit = '°C', status } = sensor.temperatura
        const dot = status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : status === 'alert' ? '🔴' : '🌡️'
        msg += `  ${dot} Temp: <b>${value}${unit}</b>\n`
      }
      if (sensor.humedad?.value !== undefined) {
        const { value, unit = '%', status } = sensor.humedad
        const dot = status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : status === 'alert' ? '🔴' : '💧'
        msg += `  ${dot} Humedad: <b>${value}${unit}</b>\n`
      }
      msg += '\n'
    }

    if (!hasData) msg = '📡 No hay datos de sensores disponibles.'
    await sendTelegramMessage(msg, chatId, { topicId })
  } catch (err) {
    logger.error('tgHandleSensores error', err)
    await sendTelegramMessage('❌ Error al leer sensores.', chatId, { topicId })
  }
}

const PRIORITY_EMOJI = { critica: '🔴', alta: '🟠', media: '🟡', baja: '⚪' }
const PRIORITY_LABELS = ['critica', 'alta', 'media', 'baja']

/**
 * Mapa de Forum Topics de Telegram.
 * Los IDs se configuran vía variables de entorno (se obtienen al crear los topics en el grupo).
 * Si un topicId no está configurado, el mensaje se envía al hilo General.
 */
function getTopicId(category) {
  const map = {
    incidencias: process.env.TELEGRAM_TOPIC_INCIDENCIAS,
    repuestos: process.env.TELEGRAM_TOPIC_REPUESTOS,
    equipos: process.env.TELEGRAM_TOPIC_EQUIPOS,
    general: process.env.TELEGRAM_TOPIC_GENERAL,
  }
  const id = map[category]
  return id ? Number(id) : undefined
}

/**
 * Handlers internos de comandos Telegram
 */
async function tgHandleAyuda(chatId, topicId) {
  await sendTelegramMessage(
    '🤖 <b>Bot Mantenimiento Planta</b>\n\n' +
    '<b>📋 Incidencias</b>\n' +
    '/incidencia [desc] — Reportar (prioridad media)\n' +
    '/incidencia alta [desc] — Prioridad alta\n' +
    '/incidencia critica [desc] — Prioridad crítica\n' +
    '/estado — Incidencias activas\n\n' +
    '<b>📸 Evidencia fotográfica</b>\n' +
    'Mandá una foto directamente — el bot te pregunta a qué incidencia adjuntarla\n' +
    'Podés mandar varias fotos seguidas antes de adjuntar\n\n' +
    '<b>🔧 Equipos y Repuestos</b>\n' +
    '/equipo [nombre] — Info de un equipo\n' +
    '/equipo — Lista de equipos registrados\n' +
    '/repuesto [código o nombre] — Buscar repuesto\n' +
    '/repuestos [máquina] — Repuestos de una máquina\n\n' +
    '<b>📊 Turno</b>\n' +
    '/turno — Resumen del turno actual\n' +
    '/kpi — Indicadores del día\n\n' +
    '<b>📡 Sensores</b>\n' +
    '/sensores — Lecturas en tiempo real con semáforo\n\n' +
    '<b>📦 Mini App (catálogo)</b>\n' +
    '/abrir — Mensaje pineable con botón para abrir la app desde grupos\n\n' +
    '<b>ℹ️ General</b>\n' +
    '/ayuda — Este menú\n\n' +
    '💡 También podés escribir el problema directamente sin comandos.',
    chatId, { topicId }
  )
}

async function tgHandleEstado(chatId, topicId) {
  const snapshot = await db
    .collection('incidents')
    .where('status', 'in', ['pendiente', 'confirmada', 'en_proceso'])
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get()

  if (snapshot.empty) {
    await sendTelegramMessage('✅ No hay incidencias activas.', chatId, { topicId })
    return
  }

  const statusLabel = { pendiente: 'Pendiente', confirmada: 'Confirmada', en_proceso: 'En proceso' }
  let msg = '<b>📊 Incidencias activas</b>\n\n'

  snapshot.forEach((docSnap) => {
    const d = docSnap.data()
    const emoji = PRIORITY_EMOJI[d.prioridad] || '📋'
    msg += `${emoji} <b>${d.titulo || 'Sin título'}</b>\n`
    msg += `   ${statusLabel[d.status] || d.status} · ${d.prioridad}\n\n`
  })

  if (snapshot.size === 10) {
    msg += '<i>Mostrando las últimas 10.</i>'
  }

  await sendTelegramMessage(msg, chatId, { topicId })
}

async function tgHandleIncidencia(chatId, rawText, fromName, telegramUserId, topicId) {
  const body = rawText.replace(/^\/incidencia\s*/i, '').trim()
  const parts = body.split(' ')

  let prioridad = 'media'
  let descripcion = body

  if (PRIORITY_LABELS.includes(parts[0]?.toLowerCase())) {
    prioridad = parts[0].toLowerCase()
    descripcion = parts.slice(1).join(' ').trim()
  }

  if (!descripcion) {
    await sendTelegramMessage(
      '⚠️ Incluí una descripción.\n\nEjemplo:\n' +
      '<code>/incidencia bomba rota sala 2</code>\n' +
      '<code>/incidencia alta fuga de aceite prensa</code>',
      chatId, { topicId }
    )
    return
  }

  const id = `tg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  await db.collection('incidents').doc(id).set({
    id,
    tipo: 'correctivo',
    titulo: descripcion.substring(0, 100),
    descripcion,
    prioridad,
    status: 'pendiente',
    fotos: [],
    reportadoPor: `telegram:${telegramUserId}`,
    creadoPor: `telegram:${telegramUserId}`,
    creadoPorNombre: fromName,
    origen: 'telegram',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  const incTopicId = getTopicId('incidencias') || topicId
  const emoji = PRIORITY_EMOJI[prioridad]
  await sendTelegramMessage(
    `${emoji} <b>Incidencia creada</b>\n\n` +
    `📋 ${descripcion}\n` +
    `🎯 Prioridad: ${prioridad}\n` +
    `👤 ${fromName}\n` +
    `🔗 <a href="https://orelcain.github.io/mantenimiento-planta/incidents/${id}">Ver en el sistema</a>`,
    chatId, { topicId: incTopicId }
  )
}

// ---- /equipo [nombre] ----
async function tgHandleEquipo(chatId, rawText, topicId) {
  const query = rawText.replace(/^\/equipo\s*/i, '').trim().toLowerCase()

  if (!query) {
    // Listar equipos registrados (max 15)
    const snapshot = await db.collection('equipment').orderBy('nombre').limit(15).get()
    if (snapshot.empty) {
      await sendTelegramMessage('📭 No hay equipos registrados.', chatId, { topicId })
      return
    }
    let msg = '<b>🔧 Equipos registrados</b>\n\n'
    snapshot.forEach((docSnap) => {
      const d = docSnap.data()
      const estado = d.estado === 'operativo' ? '🟢' : d.estado === 'en_mantenimiento' ? '🟡' : '🔴'
      msg += `${estado} <b>${d.nombre || d.codigo}</b>`
      if (d.codigo) msg += ` (${d.codigo})`
      msg += '\n'
    })
    if (snapshot.size === 15) msg += '\n<i>Mostrando los primeros 15.</i>'
    await sendTelegramMessage(msg, chatId, { topicId })
    return
  }

  // Buscar equipo por nombre o código (case-insensitive con bounds)
  const upper = query.toUpperCase()
  let snapshot = await db.collection('equipment')
    .where('nombre', '>=', upper)
    .where('nombre', '<=', upper + '\uf8ff')
    .limit(5)
    .get()

  // Fallback: buscar por código
  if (snapshot.empty) {
    snapshot = await db.collection('equipment')
      .where('codigo', '>=', upper)
      .where('codigo', '<=', upper + '\uf8ff')
      .limit(5)
      .get()
  }

  if (snapshot.empty) {
    await sendTelegramMessage(`🔍 No encontré equipos con "<b>${query}</b>".`, chatId, { topicId })
    return
  }

  const eqTopicId = getTopicId('equipos') || topicId
  let msg = ''
  snapshot.forEach((docSnap) => {
    const d = docSnap.data()
    const estado = d.estado === 'operativo' ? '🟢 Operativo' : d.estado === 'en_mantenimiento' ? '🟡 En mantenimiento' : '🔴 Fuera de servicio'
    msg += `<b>🔧 ${d.nombre || 'Sin nombre'}</b>\n`
    if (d.codigo) msg += `📌 Código: ${d.codigo}\n`
    msg += `📍 Estado: ${estado}\n`
    msg += `⚡ Criticidad: ${d.criticidad || 'N/A'}\n`
    if (d.marca) msg += `🏭 Marca: ${d.marca}\n`
    if (d.modelo) msg += `📋 Modelo: ${d.modelo}\n`
    if (d.hierarchyPath) msg += `📂 Ubicación: ${d.hierarchyPath}\n`
    msg += '\n'
  })

  await sendTelegramMessage(msg.trim(), chatId, { topicId: eqTopicId })
}

// ---- /repuesto [código o nombre] ----
async function tgHandleRepuesto(chatId, rawText, topicId) {
  const query = rawText.replace(/^\/repuesto\s*/i, '').trim()

  if (!query) {
    await sendTelegramMessage(
      '⚠️ Indicá qué repuesto buscás.\n\nEjemplo:\n' +
      '<code>/repuesto 12345</code> (código SAP)\n' +
      '<code>/repuesto rodamiento</code> (nombre)\n' +
      '<code>/repuestos baader</code> (repuestos de una máquina)',
      chatId, { topicId }
    )
    return
  }

  const repTopicId = getTopicId('repuestos') || topicId
  const upper = query.toUpperCase()

  // Buscar en todas las máquinas activas
  const machinesSnap = await db.collection('machines').where('activa', '==', true).get()
  const results = []

  for (const machineDoc of machinesSnap.docs) {
    const machineName = machineDoc.data().nombre
    const repSnap = await db.collection(`machines/${machineDoc.id}/repuestos`).get()

    repSnap.forEach((repDoc) => {
      const r = repDoc.data()
      const matchSAP = (r.codigoSAP || '').toUpperCase().includes(upper)
      const matchTexto = (r.textoBreve || '').toUpperCase().includes(upper)
      const matchDesc = (r.descripcion || '').toUpperCase().includes(upper)
      const matchAlias = (r.alias || '').toUpperCase().includes(upper)
      if (matchSAP || matchTexto || matchDesc || matchAlias) {
        results.push({ ...r, _machineName: machineName })
      }
    })

    if (results.length >= 10) break
  }

  if (results.length === 0) {
    await sendTelegramMessage(`🔍 No encontré repuestos con "<b>${query}</b>".`, chatId, { topicId: repTopicId })
    return
  }

  let msg = `<b>🔩 Repuestos encontrados (${results.length})</b>\n\n`
  for (const r of results.slice(0, 10)) {
    msg += `<b>${r.textoBreve || r.descripcion || 'Sin nombre'}</b>\n`
    if (r.codigoSAP) msg += `  SAP: <code>${r.codigoSAP}</code>\n`
    if (r.codigoFabricante) msg += `  Fab: ${r.codigoFabricante}\n`
    if (r.cantidadPorMaquina) msg += `  Cantidad/máquina: ${r.cantidadPorMaquina}\n`
    if (r.valorUnitario) msg += `  Valor: $${r.valorUnitario.toLocaleString()}\n`
    msg += `  Máquina: ${r._machineName}\n\n`
  }

  await sendTelegramMessage(msg.trim(), chatId, { topicId: repTopicId })
}

// ---- /repuestos [máquina] — lista repuestos de una máquina ----
async function tgHandleRepuestosMaquina(chatId, rawText, topicId) {
  const query = rawText.replace(/^\/repuestos\s*/i, '').trim().toLowerCase()

  const repTopicId = getTopicId('repuestos') || topicId

  if (!query) {
    // Listar máquinas disponibles
    let machinesSnap
    try {
      machinesSnap = await db.collection('machines').where('activa', '==', true).orderBy('orden').get()
    } catch (_) {
      machinesSnap = await db.collection('machines').where('activa', '==', true).get()
    }
    if (machinesSnap.empty) {
      await sendTelegramMessage('📭 No hay máquinas registradas.', chatId, { topicId: repTopicId })
      return
    }
    let msg = '<b>🏭 Máquinas disponibles</b>\n\n'
    machinesSnap.forEach((doc) => {
      msg += `• <b>${doc.data().nombre}</b>\n`
    })
    msg += '\nUsá: <code>/repuestos baader</code>'
    await sendTelegramMessage(msg, chatId, { topicId: repTopicId })
    return
  }

  // Buscar máquina por nombre parcial
  const machinesSnap = await db.collection('machines').where('activa', '==', true).get()
  const machine = machinesSnap.docs.find((doc) => {
    const name = (doc.data().nombre || '').toLowerCase()
    return name.includes(query)
  })

  if (!machine) {
    await sendTelegramMessage(`🔍 No encontré máquina "<b>${query}</b>".\nUsá /repuestos para ver la lista.`, chatId, { topicId: repTopicId })
    return
  }

  const repSnap = await db.collection(`machines/${machine.id}/repuestos`).orderBy('codigoSAP').limit(20).get()

  if (repSnap.empty) {
    await sendTelegramMessage(`📭 <b>${machine.data().nombre}</b> no tiene repuestos cargados.`, chatId, { topicId: repTopicId })
    return
  }

  let msg = `<b>🔩 Repuestos — ${machine.data().nombre}</b> (${repSnap.size})\n\n`
  repSnap.forEach((doc) => {
    const r = doc.data()
    msg += `• <code>${r.codigoSAP || '—'}</code> ${r.textoBreve || r.descripcion || 'Sin nombre'}\n`
  })
  if (repSnap.size === 20) msg += '\n<i>Mostrando los primeros 20.</i>'

  await sendTelegramMessage(msg, chatId, { topicId: repTopicId })
}

// ---- /turno — resumen del turno actual ----
async function tgHandleTurno(chatId, topicId) {
  // Incidencias abiertas
  const incSnap = await db.collection('incidents')
    .where('status', 'in', ['pendiente', 'confirmada', 'en_proceso'])
    .get()

  const criticas = incSnap.docs.filter((d) => d.data().prioridad === 'critica').length
  const altas = incSnap.docs.filter((d) => d.data().prioridad === 'alta').length
  const otras = incSnap.size - criticas - altas

  // Preventivos próximos (hoy)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  let prevCount = 0
  try {
    const prevSnap = await db.collection('preventive_tasks')
      .where('nextExecution', '>=', today)
      .where('nextExecution', '<', tomorrow)
      .get()
    prevCount = prevSnap.size
  } catch (_) { /* collection may not exist */ }

  let msg = '<b>📋 Resumen del turno</b>\n\n'
  msg += '<b>Incidencias abiertas:</b>\n'
  if (incSnap.empty) {
    msg += '  ✅ Ninguna\n'
  } else {
    if (criticas > 0) msg += `  🔴 Críticas: ${criticas}\n`
    if (altas > 0) msg += `  🟠 Altas: ${altas}\n`
    if (otras > 0) msg += `  🟡 Media/Baja: ${otras}\n`
    msg += `  📊 Total: ${incSnap.size}\n`
  }

  msg += `\n<b>Preventivos hoy:</b> ${prevCount > 0 ? prevCount + ' pendientes' : '✅ Ninguno'}\n`

  // Equipos fuera de servicio
  try {
    const eqSnap = await db.collection('equipment')
      .where('estado', '==', 'fuera_servicio')
      .get()
    if (!eqSnap.empty) {
      msg += `\n<b>⚠️ Equipos fuera de servicio:</b>\n`
      eqSnap.forEach((doc) => {
        msg += `  🔴 ${doc.data().nombre || doc.data().codigo}\n`
      })
    }
  } catch (_) { /* ignore */ }

  await sendTelegramMessage(msg, chatId, { topicId })
}

// ---- /kpi — indicadores del día ----
async function tgHandleKpi(chatId, topicId) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Incidencias creadas hoy
  let creadasHoy = 0
  try {
    const snap = await db.collection('incidents')
      .where('createdAt', '>=', today)
      .get()
    creadasHoy = snap.size
  } catch (_) { /* ignore */ }

  // Incidencias resueltas hoy
  let resueltasHoy = 0
  try {
    const snap = await db.collection('incidents')
      .where('status', 'in', ['resuelta', 'cerrada'])
      .where('updatedAt', '>=', today)
      .get()
    resueltasHoy = snap.size
  } catch (_) { /* ignore */ }

  // Abiertas total
  const abiertasSnap = await db.collection('incidents')
    .where('status', 'in', ['pendiente', 'confirmada', 'en_proceso'])
    .get()

  // Equipos por estado
  let operativos = 0, enMant = 0, fuera = 0
  try {
    const eqSnap = await db.collection('equipment').get()
    eqSnap.forEach((doc) => {
      const e = doc.data().estado
      if (e === 'operativo') operativos++
      else if (e === 'en_mantenimiento') enMant++
      else if (e === 'fuera_servicio') fuera++
    })
  } catch (_) { /* ignore */ }

  let msg = '<b>📊 KPIs del día</b>\n\n'
  msg += `📥 Incidencias creadas hoy: <b>${creadasHoy}</b>\n`
  msg += `✅ Resueltas hoy: <b>${resueltasHoy}</b>\n`
  msg += `📋 Abiertas total: <b>${abiertasSnap.size}</b>\n\n`

  if (operativos + enMant + fuera > 0) {
    msg += '<b>Equipos:</b>\n'
    msg += `  🟢 Operativos: ${operativos}\n`
    if (enMant > 0) msg += `  🟡 En mantenimiento: ${enMant}\n`
    if (fuera > 0) msg += `  🔴 Fuera de servicio: ${fuera}\n`
  }

  await sendTelegramMessage(msg, chatId, { topicId })
}

// ==================== ARIA — CHAT NATURAL (TELEGRAM) ====================
// Texto libre o nota de voz en chat privado → ARIA interpreta la intención con
// Groq, consulta Firestore (SOLO LECTURA) y responde en lenguaje natural.
// Comandos y Mini App siguen igual; esto agrega la capa conversacional para
// consultar la app sin abrirla. Requiere secret GROQ_API_KEY en el webhook.

// llama-3.3-70b-versatile se apaga el 16-ago-2026 (deprecación anunciada por Groq);
// gpt-oss-120b es el sucesor que el propio Groq recomienda: mismo tope de requests/día
// pero el doble de tokens/día (200K vs 100K) y benchmarks a la par de o4-mini.
const ARIA_MODEL = process.env.ARIA_MODEL || 'openai/gpt-oss-120b'
const ARIA_HISTORY_LIMIT = 12
const ARIA_CACHE_TTL_MS = 10 * 60 * 1000

const ARIA_PERSONA =
  'Sos ARIA, la asistente de Mantención de la planta Antarfood (proceso de salmón). ' +
  'Hablás español chileno cercano y profesional. Respuestas BREVES para chat móvil ' +
  '(máximo ~8 líneas), emojis con moderación. ' +
  'FORMATO: usá **negrita** para títulos y nombres clave, `código` para códigos SAP/tags/valores exactos, ' +
  'y viñetas con "- " para listas. Nada de tablas, encabezados # ni links markdown (pegá las URLs directas). ' +
  'HONESTIDAD CON FOTOS: solo podés ver una foto en el momento en que te la mandan. Si después te preguntan de nuevo por algo de esa foto, ' +
  'NUNCA digas que la "revisaste de nuevo" — respondé en base a lo que ya describiste en tu análisis anterior (está en el historial), ' +
  'y si no alcanza, decí que no lo detectaste en ese análisis y pedí que reenvíen la foto para mirarla de nuevo.\n' +
  'Tu misión es dar acceso rápido a los datos de la app de mantenimiento y ' +
  'evidenciar con datos el aporte de Mantención al proceso.'

const ariaEscapeHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Markdown liviano → HTML de Telegram, a prueba de balas: se escapa TODO el
 * HTML primero y recién después se convierten **negrita**, `código` y viñetas.
 * Un formato mal cerrado queda como texto literal, nunca rompe el sendMessage.
 */
function ariaFormatTelegram(text) {
  let t = ariaEscapeHtml(text)
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
  t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  t = t.replace(/^\s*[-*]\s+/gm, '• ')
  return t
}

async function _ariaGroqChatRaw(model, messages, { temperature = 0.3, maxTokens = 600, json = false } = {}) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY no configurado')
  // Guard TPM=8000 de Groq: recorta historial viejo para no dar 413 y caer a DeepSeek (paga).
  const safeMessages = trimMessagesForGroq(messages, maxTokens)
  const body = { model, messages: safeMessages, temperature, max_tokens: maxTokens }
  if (json) body.response_format = { type: 'json_object' }
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const errorText = await response.text()
    logger.error('ARIA Groq error', { model, status: response.status, body: errorText.slice(0, 300) })
    throw new Error(`Groq ${response.status}`)
  }
  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

const ARIA_GEMINI_MODEL = process.env.ARIA_GEMINI_MODEL || 'gemini-3.5-flash'

/** Gemini (misma key secret que geminiProxy) — 2do eslabón, gratis, y motor de la visión */
async function _ariaGeminiChat(messages, { temperature = 0.3, maxTokens = 600, json = false, model = ARIA_GEMINI_MODEL } = {}) {
  // (ver GEMINI_KEY_REFERER) sin este header la key restringida devuelve 403 desde el server
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurado')
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
  const contents = messages.filter((m) => m.role !== 'system').map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: Array.isArray(m.content) ? m.content : [{ text: m.content }],
  }))
  const body = {
    contents: contents.length ? contents : [{ role: 'user', parts: [{ text: ' ' }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
  }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Referer: GEMINI_KEY_REFERER }, body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 150)}`)
  const d = await r.json()
  return d.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || ''
}

const ARIA_DEEPSEEK_MODEL = process.env.ARIA_DEEPSEEK_MODEL || 'deepseek-v4-flash'

/** DeepSeek (misma key secret que deepseekProxy) — último recurso, paga centavos */
async function _ariaDeepSeekChat(messages, { temperature = 0.3, maxTokens = 600, json = false } = {}) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY no configurado')
  const body = { model: ARIA_DEEPSEEK_MODEL, messages, temperature, max_tokens: maxTokens }
  if (json) body.response_format = { type: 'json_object' }
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`DeepSeek ${r.status}: ${(await r.text()).slice(0, 150)}`)
  const d = await r.json()
  return d.choices?.[0]?.message?.content || ''
}

/**
 * Chat con CADENA DE FALLBACK, 3 proveedores independientes (nunca el mismo
 * dos veces): Groq gpt-oss-120b → Gemini 3.5 Flash (gratis) → DeepSeek
 * v4-flash (paga centavos, último recurso). ARIA no queda muda aunque se
 * agote la cuota gratis de Groq Y de Gemini el mismo día.
 *
 * "Una sola ARIA" — divergencia INTENCIONAL con el PWA: el chat PWA usa el
 * orden Gemini → Qwen → GPT-OSS → DeepSeek (ver apps/pwa/src/services/
 * aiAgents.ts) porque el browser PERSISTE el cooldown de rate-limit y enmascara
 * la latencia de Gemini con streaming. Telegram lidera con Groq A PROPÓSITO: es
 * un webhook síncrono con ~2 llamadas LLM por mensaje (router + respuesta) y
 * Gemini en modo thinking tarda decenas de segundos (observado 2026-07: ~19-27s)
 * → liderar con Gemini chocaría con el timeout del webhook; Groq responde en
 * pocos segundos. Ambas cadenas terminan en DeepSeek (último recurso) → son
 * coherentes por diseño, no por accidente. El gasto real de DeepSeek se corta
 * RECORTANDO el contexto por debajo del límite TPM=8000 de Groq (fix recorte),
 * NO reordenando esta cadena: un request de ~10-12k tokens excede el TPM por sí
 * solo, así que ningún modelo de Groq (gpt-oss NI qwen) podría servirlo. NO
 * reordenar Telegram a Gemini-first.
 */
async function ariaGroqChat(messages, opts = {}) {
  try {
    return await _ariaGroqChatRaw(ARIA_MODEL, messages, opts)
  } catch (err) {
    if (!/429|413|5\d\d/.test(String(err?.message))) throw err
    try {
      logger.warn(`ARIA: ${ARIA_MODEL} sin cuota — fallback Gemini`)
      return await _ariaGeminiChat(messages, opts)
    } catch (err2) {
      logger.warn(`ARIA: Gemini falló (${err2?.message}) — fallback DeepSeek`)
      return await _ariaDeepSeekChat(messages, opts)
    }
  }
}

/** Transcribe una nota de voz de Telegram (OGG/OPUS) con Groq Whisper */
async function ariaTranscribeVoice(buffer) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY no configurado')
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: 'audio/ogg' }), 'voz.ogg')
  form.append('model', 'whisper-large-v3-turbo')
  form.append('language', 'es')
  form.append('temperature', '0')
  form.append('response_format', 'json')
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })
  if (!response.ok) {
    const errorText = await response.text()
    logger.error('ARIA Whisper error', { status: response.status, body: errorText })
    throw new Error(`Whisper ${response.status}`)
  }
  const data = await response.json()
  return (data.text || '').trim()
}

// ---- Voz de respuesta (Google Cloud Text-to-Speech) ----

let _gcpTokenCache = { token: null, exp: 0 }

/** Access token GCP: metadata server en Cloud Functions; JWT manual en local */
async function ariaGetGcpToken() {
  if (_gcpTokenCache.token && Date.now() < _gcpTokenCache.exp) return _gcpTokenCache.token
  try {
    const r = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(3000) }
    )
    if (r.ok) {
      const d = await r.json()
      _gcpTokenCache = { token: d.access_token, exp: Date.now() + (d.expires_in - 120) * 1000 }
      return d.access_token
    }
  } catch (_) { /* fuera de GCP: cae al JWT manual */ }
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyPath) throw new Error('sin credenciales GCP')
  const sa = require(require('path').resolve(keyPath))
  const crypto = require('crypto')
  const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const header = b64url({ alg: 'RS256', typ: 'JWT' })
  const claims = b64url({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const jwt = `${header}.${claims}.${signer.sign(sa.private_key, 'base64url')}`
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const d = await r.json()
  if (!d.access_token) throw new Error('token GCP: ' + JSON.stringify(d).slice(0, 150))
  _gcpTokenCache = { token: d.access_token, exp: Date.now() + (d.expires_in - 120) * 1000 }
  return d.access_token
}

/** Sintetiza texto → OGG/OPUS con la voz de ARIA (es-US femenina) */
async function ariaTts(text) {
  // Quitar emojis/símbolos que el TTS lee mal; acotar largo (costo + naturalidad)
  const limpio = String(text)
    .replace(/\*\*|[*`_#]/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ').trim().slice(0, 850)
  if (!limpio) throw new Error('texto vacío para TTS')
  const token = await ariaGetGcpToken()
  const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text: limpio },
      voice: { languageCode: 'es-US', name: 'es-US-Neural2-A' },
      audioConfig: { audioEncoding: 'OGG_OPUS', speakingRate: 1.08 },
    }),
  })
  if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 150)}`)
  const d = await r.json()
  return Buffer.from(d.audioContent, 'base64')
}

// ==================== GOOGLE TTS PROXY (voz de ARIA en la PWA) ====================
// El navegador llamaba a texttospeech.googleapis.com directo con
// VITE_GOOGLE_TTS_API_KEY en la query string (?key=...) — visible en
// DevTools/Network y en el historial. Reusa el MISMO mecanismo que ya
// funciona en prod para las notas de voz de Telegram (ariaGetGcpToken(): el
// token OAuth de la propia service account de la Cloud Function, SIN
// ninguna API key) en vez de crear un secreto nuevo.
// Espejo server-side de ARIA_VOICE_OPTIONS en apps/pwa/src/lib/ariaVoice.ts
// (sin el prefijo "gcloud:", que el cliente ya recorta antes de llamar).
// Actualizar ambas listas juntas si Orel cura una voz nueva.
const TTS_ALLOWED_VOICES = new Set(['es-US-Chirp-HD-F', 'es-US-Neural2-A'])

exports.googleTtsProxy = onCall(
  { enforceAppCheck: false, maxInstances: 10, timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) {
      throw new Error('Se requiere autenticación para usar la voz de ARIA')
    }
    const { action } = request.data || {}
    const token = await ariaGetGcpToken()

    if (action === 'voices') {
      const r = await fetch('https://texttospeech.googleapis.com/v1/voices', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(4000),
      })
      if (!r.ok) throw new HttpsError('internal', `TTS voices ${r.status}`)
      const d = await r.json()
      return { voices: d.voices || [] }
    }

    if (action === 'synthesize') {
      const { text, voiceName, rate } = request.data
      if (typeof text !== 'string' || text.length === 0 || text.length > 2000) {
        throw new Error('Texto inválido')
      }
      // Allowlist: solo las voces curadas de ARIA_VOICE_OPTIONS (no cualquier
      // voz del catálogo Google) — evita abusar el proxy como TTS genérico gratis.
      if (typeof voiceName !== 'string' || !TTS_ALLOWED_VOICES.has(voiceName)) {
        throw new Error('Voz no permitida')
      }
      const languageMatch = voiceName.match(/^([a-z]{2}-[A-Z]{2})/)
      const languageCode = (languageMatch && languageMatch[1]) || 'es-US'
      const speakingRate = Math.max(0.5, Math.min(2, Number(rate) || 1))

      const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode, name: voiceName },
          audioConfig: { audioEncoding: 'MP3', speakingRate },
        }),
      })
      if (!r.ok) {
        const errText = await r.text().catch(() => '')
        logger.error('googleTtsProxy synthesize error', { status: r.status, body: errText })
        throw upstreamHttpsError('GoogleTTS', r.status)
      }
      const d = await r.json()
      if (!d.audioContent) throw new HttpsError('internal', 'TTS: respuesta vacía')
      return { audioContent: d.audioContent }
    }

    throw new Error(`action inválida: ${action}`)
  }
)

/** Envía una nota de voz a Telegram (multipart) */
async function sendTelegramVoice(chatId, buffer, opts = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  const form = new FormData()
  form.append('chat_id', String(chatId))
  form.append('voice', new Blob([buffer], { type: 'audio/ogg' }), 'aria.ogg')
  if (opts.topicId) form.append('message_thread_id', String(opts.topicId))
  try {
    const r = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendVoice`, { method: 'POST', body: form })
    if (!r.ok) logger.error('sendVoice error', { status: r.status, body: (await r.text()).slice(0, 200) })
  } catch (err) { logger.error('sendVoice fetch error', err) }
}

// ---- Visión (Gemini — Groq se quedó sin modelos de visión gratis: ----
// ---- llama-4-maverick murió en marzo-2026, llama-4-scout muere 17-jul-2026) ----

/**
 * Describe una imagen de planta con Gemini (multimodal nativo, gratis, sin
 * fecha de baja anunciada — a diferencia de los modelos de visión de Groq).
 * Devuelve {descripcion, codigos[], falla}: se pide explícitamente leer
 * códigos/etiquetas impresas, porque sin esa instrucción el modelo tiende a
 * describir el equipo y pasar por alto el texto (SAP, tags de inventario).
 */
async function ariaGroqVision(imageBase64, mime, hint) {
  const prompt =
    'Sos ARIA, asistente de mantención de una planta de proceso de salmón. Analizá la foto y respondé SOLO ' +
    'un objeto JSON válido: {"descripcion": string, "codigos": string[], "falla": boolean}\n' +
    '- "descripcion": 2-3 frases — qué equipo/componente se ve y si hay falla/daño visible (correa cortada, fuga, óxido, cable suelto, desgaste). Si no hay falla, decilo con claridad.\n' +
    '- "codigos": TODO texto impreso en etiquetas/tags que parezca un código (códigos SAP —usualmente 8-10 dígitos—, part numbers, códigos de fabricante, tags de inventario). Mirá con atención las etiquetas blancas/amarillas pegadas al componente. Array vacío si no hay ninguno legible.\n' +
    '- "falla": true si hay daño/falla visible, false si no.' +
    (hint ? `\nContexto del usuario: ${hint}` : '')
  const raw = await _ariaGeminiChat(
    [{ role: 'user', content: [{ text: prompt }, { inlineData: { mimeType: mime, data: imageBase64 } }] }],
    { temperature: 0.1, maxTokens: 1600, json: true } // Gemini 3.5 gasta parte del presupuesto "pensando"; con 1000 el JSON llegaba truncado a veces (caso golillas 06-jul)
  )
  try {
    const parsed = JSON.parse(raw.trim())
    return {
      descripcion: String(parsed.descripcion || '').trim(),
      codigos: Array.isArray(parsed.codigos) ? parsed.codigos.map(String).filter(Boolean).slice(0, 5) : [],
      falla: parsed.falla === true,
    }
  } catch (_) {
    // JSON truncado/malformado: rescatar descripcion+codigos con regex antes de
    // degradar a texto crudo (el 06-jul un JSON truncado se mostró literal al
    // usuario y se perdió un SAP ya leído)
    const mDesc = raw.match(/"descripcion"\s*:\s*"((?:[^"\\]|\\.)*)/)
    const mCods = raw.match(/"codigos"\s*:\s*\[([^\]]*)/)
    const codigos = mCods
      ? [...mCods[1].matchAll(/"((?:[^"\\]|\\.)+)"/g)].map((m) => m[1]).slice(0, 5)
      : []
    if (mDesc) {
      return {
        descripcion: mDesc[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim(),
        codigos,
        falla: /"falla"\s*:\s*true/.test(raw),
      }
    }
    return { descripcion: raw.trim(), codigos, falla: false }
  }
}

/**
 * Analiza VARIAS fotos en UNA sola llamada a Gemini (en vez de N llamadas
 * separadas) — reduce el overhead conversacional del modo lote. Devuelve un
 * array de {descripcion, codigos, falla} en el MISMO orden que `imagenes`.
 */
async function ariaGroqVisionLote(imagenes) {
  const n = imagenes.length
  const prompt =
    `Sos ARIA, asistente de mantención de una planta de proceso de salmón. Te mando ${n} fotos, numeradas del 1 al ${n} en ESE ORDEN. ` +
    'Para CADA foto, analizá igual que si fuera una sola: qué equipo/componente se ve, si hay falla/daño visible, y TODO texto impreso en etiquetas ' +
    'que parezca un código (SAP —usualmente 8-10 dígitos—, part numbers, tags de inventario). ' +
    `Respondé SOLO un objeto JSON válido: {"items": [{"indice": number, "descripcion": string, "codigos": string[], "falla": boolean}, ...]} ` +
    `con EXACTAMENTE ${n} elementos, uno por foto, "indice" = posición de la foto (1 a ${n}).`
  const parts = [{ text: prompt }, ...imagenes.map((img) => ({ inlineData: { mimeType: img.mime, data: img.base64 } }))]
  try {
    const raw = await _ariaGeminiChat(
      [{ role: 'user', content: parts }],
      { temperature: 0.1, maxTokens: Math.min(300 + n * 250, 4000), json: true }
    )
    const parsed = JSON.parse(raw.trim())
    const items = Array.isArray(parsed.items) ? parsed.items : []
    return imagenes.map((_, i) => {
      const it = items.find((x) => x.indice === i + 1) || items[i] || {}
      return {
        descripcion: String(it.descripcion || '').trim() || '(sin descripción)',
        codigos: Array.isArray(it.codigos) ? it.codigos.map(String).filter(Boolean).slice(0, 5) : [],
        falla: it.falla === true,
      }
    })
  } catch (err) {
    // El análisis CONJUNTO falló (JSON grande truncado, timeout, etc.) → caemos a
    // analizar CADA foto por separado con la ruta de una sola imagen (más lento
    // pero robusta). Antes el lote entero se perdía silenciosamente y ARIA lo
    // presentaba como "ninguna matcheó" (caso Orel 07-jul).
    logger.warn('ariaGroqVisionLote: falló el análisis conjunto, caigo a de-a-una', { error: err?.message })
    const out = []
    for (const img of imagenes) {
      try { out.push(await ariaGroqVision(img.base64, img.mime, '')) }
      catch (_) { out.push({ descripcion: '(no pude analizar esta foto)', codigos: [], falla: false }) }
    }
    return out
  }
}

// ---- Códigos SAP vs códigos de fabricante ----
// El maestro usa SAP de 10 dígitos (99,6%; unos pocos legacy de 7-8). Los part
// numbers / números de artículo del fabricante (Festo "552791", "51051200", etc.)
// NO son SAP. Distinguirlos es clave: un número de fabricante compartido entre
// repuestos parecidos hacía falso positivo por _blob.includes → ARIA ofrecía el
// SAP equivocado (cilindro CRDSNU-32-105 vs -200, caso Orel 07-jul-2026).

/** ¿El texto tiene formato de código SAP del maestro? (solo dígitos/espacios/.- y 10 dígitos) */
function ariaEsCodigoSap(codigo) {
  const s = String(codigo || '').trim()
  return /^[\d\s.-]+$/.test(s) && s.replace(/\D/g, '').length === 10
}

/** De una lista de códigos leídos, devuelve el PRIMERO con formato SAP (o null) */
function ariaSapDeCodigos(codigos) {
  for (const c of codigos || []) {
    if (ariaEsCodigoSap(c)) return String(c).replace(/\D/g, '')
  }
  return null
}

/**
 * Arma un nombre corto y útil de repuesto a partir de la descripción de la foto y
 * los códigos leídos: sustantivo técnico principal + part number del fabricante
 * (p.ej. "CILINDRO CRDSNU-32-105-PPV-A-MQ-A1"), en vez de la frase larga de la
 * descripción. Cae a la primera frase de la descripción si no reconoce nada.
 */
function ariaNombreRepuestoDesde(descripcion, codigos) {
  const desc = String(descripcion || '')
  const m = desc.toUpperCase().match(/\b(CILINDRO|V[AÁ]LVULA|SENSOR|MOTOR|BOMBA|RODAMIENTO|CORREA|FILTRO|MANGUERA|ACOPLE|REL[EÉ]|CONTACTOR|INTERRUPTOR|PIST[OÓ]N|ACTUADOR|REDUCTOR|PI[NÑ][OÓ]N|ENGRANAJE|RET[EÉ]N|SELLO|EMPAQUE|FUSIBLE|BREAKER|GUARDAMOTOR|PARO|BOT[OÓ]N|SOLENOIDE|ELECTROV[AÁ]LVULA)\w*/)
  const noun = m ? m[0] : ''
  const partNum = (codigos || []).map(String).find((c) => /[A-Za-z]/.test(c) && c.replace(/[^A-Za-z0-9]/g, '').length >= 5) || ''
  const nombre = [noun, partNum].filter(Boolean).join(' ').trim()
  return nombre || desc.split(/[.\n]/)[0].trim().slice(0, 90)
}

/**
 * Busca un código leído contra el maestro. Solo devuelve match cuando hay señal
 * CONFIABLE de que es EL MISMO repuesto:
 *  - número → igualdad EXACTA con el campo codigoSAP (nunca por texto: un número
 *    de fabricante suelto colisiona con repuestos parecidos vía _blob.includes).
 *  - alfanumérico (part number con letras, p.ej. "CRDSNU-32-200-...") → sí por
 *    texto, porque un part number completo identifica el modelo.
 */
async function ariaBuscarCodigoEnMaestro(codigo) {
  const items = await ariaGetRepuestos()
  const raw = String(codigo || '').trim()
  const soloDigitos = raw.replace(/\D/g, '')
  const esNumeroPuro = /^[\d\s.-]+$/.test(raw)
  if (soloDigitos.length >= 6) {
    const bySap = items.find((r) => r.codigoSAP && String(r.codigoSAP) === soloDigitos)
    if (bySap) return bySap
  }
  if (esNumeroPuro) return null // número sin match exacto de SAP → NO adivinar por texto
  const upper = raw.toUpperCase()
  if (upper.length < 6) return null
  return items.find((r) => r._blob.includes(upper)) || null
}

/** Sube la foto a Storage y la agrega a fotosReales del repuesto (escritura confirmada) */
async function ariaAdjuntarFotoARepuesto(codigoSAP, fileId) {
  const snap = await db.collection('repuestos').where('codigoSAP', '==', codigoSAP).limit(1).get()
  if (snap.empty) throw new Error(`no encontré el repuesto SAP ${codigoSAP} al confirmar`)
  const doc = snap.docs[0]
  const buffer = await downloadTelegramFile(fileId)
  const url = await uploadPhotoToStorage(doc.id, buffer, 0, 'repuestos')
  await doc.ref.update({
    // FieldValue.serverTimestamp() no se puede usar DENTRO de un elemento de arrayUnion
    // (Firestore lo rechaza) — se usa Date() normal, igual que uploadPhotoToStorage/tgHandlePhoto.
    fotosReales: FieldValue.arrayUnion({
      id: randomUUID(), url, descripcion: 'Foto vía ARIA (Telegram)', orden: 0, esPrincipal: false,
      tipo: 'real', createdAt: new Date(),
    }),
    updatedAt: FieldValue.serverTimestamp(),
  })
  return doc.data()
}

// ---- Repuestos nuevos desde el chat (foto → maestro) ----
// Caso real de Orel (2026-07-05): mandó fotos de un aceite del compresor GA90 de
// acopio y ARIA solo sabía adjuntar fotos a repuestos YA existentes por SAP.
// Ahora puede CREAR el material en el maestro y/o VINCULARLO a su equipo.

/** Cache de nodos de `hierarchy` (~700 docs) para buscar equipos por nombre */
let _ariaHierarchyCache = { at: 0, items: [] }

async function ariaGetNodosJerarquia() {
  if (Date.now() - _ariaHierarchyCache.at < ARIA_CACHE_TTL_MS && _ariaHierarchyCache.items.length) {
    return _ariaHierarchyCache.items
  }
  const snap = await db.collection('hierarchy').select('nombre', 'alias', 'codigo', 'tipoNodo', 'activo').get()
  const items = snap.docs
    .filter((d) => d.data().activo !== false)
    .map((d) => {
      const x = d.data()
      return {
        id: d.id, nombre: x.nombre || '', alias: x.alias || '', codigo: x.codigo || '',
        tipoNodo: x.tipoNodo || '',
        _blob: `${x.nombre || ''} ${x.alias || ''} ${x.codigo || ''}`.toUpperCase(),
      }
    })
  _ariaHierarchyCache = { at: Date.now(), items }
  return items
}

const ARIA_EQUIPO_STOPWORDS = new Set(['DE', 'DEL', 'LA', 'EL', 'LO', 'LOS', 'LAS', 'PARA', 'CON', 'EN', 'UN', 'UNA', 'AL', 'QUE', 'ESE', 'ESA'])

/**
 * Busca un equipo en `hierarchy` por nombre/alias/código con matching por términos
 * (los nombres SAP no siempre calzan 1:1 con cómo habla el técnico: "compresor
 * atlas g90 acopio" vs "COMPRESOR GA 90"). Devuelve {mejor, candidatos, exacto};
 * la elección igual pasa por la confirmación del usuario antes de escribir.
 */
async function ariaBuscarEquipoEnJerarquia(texto) {
  const items = await ariaGetNodosJerarquia()
  const terms = String(texto || '').toUpperCase().split(/\s+/)
    .filter((t) => t.length >= 2 && !ARIA_EQUIPO_STOPWORDS.has(t))
  if (!terms.length) return { mejor: null, candidatos: [], exacto: false }
  const equipos = items.filter((n) => n.tipoNodo === 'equipo')
  const pool = equipos.length ? equipos : items
  const scored = pool
    .map((n) => ({ n, score: terms.filter((t) => n._blob.includes(t)).length }))
    .filter((x) => x.score >= Math.min(2, terms.length))
    .sort((a, b) => b.score - a.score || a.n._blob.length - b.n._blob.length)
  const candidatos = scored.slice(0, 5).map((x) => x.n)
  return { mejor: candidatos[0] || null, candidatos, exacto: scored.length ? scored[0].score === terms.length : false }
}

/** Deduce la clase de material del maestro unificado a partir del texto */
function ariaDeducirClase(texto) {
  const t = String(texto || '').toUpperCase()
  if (/ACEITE|GRASA|LUBRICANTE|\bOIL\b|FLUID/.test(t)) return 'lubricante'
  if (/REFRIGERANTE|FRE[OÓ]N|AMONIACO|\bNH3\b|GLICOL/.test(t)) return 'refrigeracion'
  if (/QU[IÍ]MICO|DETERGENTE|DESINFECTANTE|SODA C[AÁ]USTICA|[AÁ]CIDO|SANITIZANTE/.test(t)) return 'quimico'
  if (/HERRAMIENTA|DESTORNILLADOR|ALICATE|TALADRO|LLAVE (PUNTA|CORONA|ALLEN|INGLESA)/.test(t)) return 'herramienta'
  if (/GUANTE|TRAPO|PAPEL|CINTA|BROCHA|PINTURA|SILICONA|TEFL[OÓ]N|SOLDADURA/.test(t)) return 'insumo'
  return 'repuesto'
}

/**
 * Crea un repuesto NUEVO en el maestro `repuestos` (escritura confirmada) —
 * misma forma que useRepuestoCrud.createRepuesto de la PWA, + `plantId` (regla
 * multi-planta 2026-07-04) + historial/audit_log para trazabilidad.
 */
async function ariaCrearRepuestoNuevo(pending, fromName, telegramUserId) {
  const codigoSAP = pending.codigoSAP || ''
  const nuevo = {
    codigoSAP,
    codigoFabricante: '',
    textoBreve: pending.nombre,
    descripcion: pending.descFoto || '',
    nombreManual: '',
    valorUnitario: 0,
    cantidadPorMaquina: 0,
    ubicacionEnPlanta: '',
    observaciones: `Creado vía ARIA (Telegram) por ${fromName}`,
    vinculosManual: [],
    imagenesManual: [],
    fotosReales: [],
    equipos: pending.equipoNodeId ? [pending.equipoNodeId] : [],
    equiposCodigos: pending.equipoNodeId ? [(pending.equipoCodigo || '').trim() || `s/c:${pending.equipoNodeId}`] : [],
    clase: pending.clase || 'repuesto',
    tieneSap: Boolean(codigoSAP),
    plantId: 'chonchi',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }
  // Convención del maestro: docId = código SAP cuando existe; .create() falla si
  // ya hay un doc con ese id (no pisa un material existente)
  const ref = codigoSAP ? db.collection('repuestos').doc(codigoSAP) : db.collection('repuestos').doc()
  await ref.create(nuevo)

  if (pending.fotoFileId) {
    const buffer = await downloadTelegramFile(pending.fotoFileId)
    const url = await uploadPhotoToStorage(ref.id, buffer, 0, 'repuestos')
    await ref.update({
      fotosReales: FieldValue.arrayUnion({
        id: randomUUID(), url, descripcion: 'Foto vía ARIA (Telegram)', orden: 0, esPrincipal: true,
        tipo: 'real', createdAt: new Date(), subidaPor: `ARIA (Telegram) — ${fromName}`,
      }),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
  // Trazabilidad con la misma forma que la PWA (useRepuestoCrud + writeAuditLog)
  await ref.collection('historial').add({
    campo: 'creacion', valorAnterior: null,
    valorNuevo: JSON.stringify({ textoBreve: pending.nombre, clase: nuevo.clase, codigoSAP, equipo: pending.equipoNombre || null }),
    fecha: FieldValue.serverTimestamp(),
  })
  await db.collection('audit_log').add({
    action: 'create', collection: 'repuestos', documentId: ref.id,
    documentLabel: `${codigoSAP || 's/SAP'} — ${pending.nombre}`,
    userId: `telegram:${telegramUserId}`, userName: fromName,
    metadata: { source: 'aria-telegram' },
    timestamp: FieldValue.serverTimestamp(),
  })
  _ariaRepuestosCache = { at: 0, items: [] } // que la próxima búsqueda ya lo vea
  return ref.id
}

/** Vincula un repuesto EXISTENTE del maestro a un equipo de `hierarchy` (+ foto opcional) */
async function ariaLigarRepuestoAEquipo(pending, fromName) {
  const snap = await db.collection('repuestos').where('codigoSAP', '==', pending.codigoSAP).limit(1).get()
  if (snap.empty) throw new Error(`no encontré el repuesto SAP ${pending.codigoSAP} al confirmar`)
  const doc = snap.docs[0]
  const update = {
    // mismo par de campos que linkRepuestoEquipo de la PWA (services/repuestosLink.ts)
    equipos: FieldValue.arrayUnion(pending.equipoNodeId),
    equiposCodigos: FieldValue.arrayUnion((pending.equipoCodigo || '').trim() || `s/c:${pending.equipoNodeId}`),
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (pending.fotoFileId) {
    const buffer = await downloadTelegramFile(pending.fotoFileId)
    const url = await uploadPhotoToStorage(doc.id, buffer, 0, 'repuestos')
    update.fotosReales = FieldValue.arrayUnion({
      id: randomUUID(), url, descripcion: 'Foto vía ARIA (Telegram)', orden: 0, esPrincipal: false,
      tipo: 'real', createdAt: new Date(), subidaPor: `ARIA (Telegram) — ${fromName}`,
    })
  }
  await doc.ref.update(update)
  _ariaRepuestosCache = { at: 0, items: [] }
  return doc.id
}

/**
 * Extrae el código de fabricante que el usuario dicta ("código de fabricante es
 * 999 0566"). Salta los conectores de relleno ("q es el", "su") y corta en la
 * primera palabra normal ("al mismo", "para"), tomando solo los tokens que parecen
 * código (con dígito o en mayúsculas, unidos por espacio/guion).
 */
function ariaParseCodigoFabricante(texto) {
  const t = String(texto || '')
  const m = t.match(/c[oó]d(?:igo)?\.?\s*(?:de\s*)?(?:fabricante|f[aá]brica|fab)\b/i)
  if (!m) return ''
  let rest = t.slice(m.index + m[0].length).replace(/^[\s:=,-]+/, '')
  // saltar palabras de relleno al inicio (es, que, q, el, la, su, un, valor, ...)
  for (;;) {
    const w = rest.match(/^(es|que|q|el|la|lo|su|un|una|valor|numero|n[úu]mero|:|=)\b[\s:=]*/i)
    if (!w) break
    rest = rest.slice(w[0].length)
  }
  const out = []
  for (const tk of rest.split(/\s+/)) {
    const clean = tk.replace(/[.,;)]+$/, '')
    if (!clean) continue
    const esCodigo = /\d/.test(clean) || /^[A-Z0-9][A-Z0-9-]*$/.test(clean)
    if (!esCodigo) break // primera palabra normal ("al", "mismo", "para") → fin del código
    out.push(clean)
  }
  return out.join(' ').slice(0, 30)
}

/**
 * Edita un campo simple de un repuesto EXISTENTE (hoy: codigoFabricante) + foto
 * opcional. Misma trazabilidad que la PWA (historial + audit_log). Escritura
 * confirmada.
 */
async function ariaEditarRepuesto(pending, fromName, telegramUserId) {
  const snap = await db.collection('repuestos').where('codigoSAP', '==', pending.codigoSAP).limit(1).get()
  if (snap.empty) throw new Error(`no encontré el repuesto SAP ${pending.codigoSAP} al confirmar`)
  const doc = snap.docs[0]
  const anterior = doc.data()[pending.campo] || ''
  const update = { [pending.campo]: pending.valor, updatedAt: FieldValue.serverTimestamp() }
  if (pending.fotoFileId) {
    const buffer = await downloadTelegramFile(pending.fotoFileId)
    const url = await uploadPhotoToStorage(doc.id, buffer, 0, 'repuestos')
    update.fotosReales = FieldValue.arrayUnion({
      id: randomUUID(), url, descripcion: 'Foto vía ARIA (Telegram)', orden: 0, esPrincipal: false,
      tipo: 'real', createdAt: new Date(), subidaPor: `ARIA (Telegram) — ${fromName}`,
    })
  }
  await doc.ref.update(update)
  await doc.ref.collection('historial').add({
    campo: pending.campo, valorAnterior: anterior || null, valorNuevo: pending.valor,
    fecha: FieldValue.serverTimestamp(),
  })
  await db.collection('audit_log').add({
    action: 'update', collection: 'repuestos', documentId: doc.id,
    documentLabel: `${pending.codigoSAP} — ${pending.nombre || ''}`.trim(),
    userId: `telegram:${telegramUserId}`, userName: fromName,
    metadata: { source: 'aria-telegram', campo: pending.campo },
    timestamp: FieldValue.serverTimestamp(),
  })
  _ariaRepuestosCache = { at: 0, items: [] }
  return doc.id
}

/**
 * CRITERIO (LLM + validación determinista) para decidir qué hacer con un material
 * que el usuario quiere dar de alta desde una foto. Combina lo confiable — el SAP
 * de la etiqueta manda; "existe" SOLO si ese SAP (10 díg) está EXACTO en el
 * maestro — con criterio del modelo para casos ambiguos y para entender
 * correcciones ("no es X, es Y" / "el que termina en 8398").
 *
 * Devuelve una decisión YA VALIDADA contra el maestro:
 *   { accion, codigoSAP, nombre, equipoTexto, existente, razon, pregunta }
 *   accion ∈ 'crear_nuevo' | 'vincular_existente' | 'preguntar'
 */
async function ariaDecidirRepuesto({ userText = '', ocrCodigos = [], descripcionFoto = '', equipoTexto = '', pending = null, ultimoRepuesto = null }) {
  const items = await ariaGetRepuestos()
  const bySap = (sap) => (sap ? items.find((r) => r.codigoSAP && String(r.codigoSAP) === String(sap)) || null : null)
  const nombreFoto = ariaNombreRepuestoDesde(descripcionFoto, ocrCodigos)

  // 1) SAP que el usuario TIPEA (10 díg). Corrección "no es X, es Y": si tipea uno
  //    distinto al que ya propusimos, gana el NUEVO (no el que veníamos ofreciendo).
  const sapPendiente = pending?.codigoSAP || null
  const sapsUsuario = String(userText || '').match(/\b\d{10}\b/g) || []
  let sapUsuario = sapsUsuario.find((s) => s !== sapPendiente) || sapsUsuario[0] || null

  // "el SAP termina en 8398" / "...398" → elegí el código de la foto que termina así
  const mTermina = String(userText || '').match(/termin\w*\s+(?:en\s+)?[.…\s]*(\d{3,9})/i) ||
    String(userText || '').match(/[.…]{1,3}\s*(\d{3,9})\b/)
  if (!sapUsuario && mTermina) {
    const suf = mTermina[1]
    const cand = (ocrCodigos || []).map((c) => String(c).replace(/\D/g, '')).find((d) => d.length === 10 && d.endsWith(suf))
    if (cand) sapUsuario = cand
  }

  // 2) SAP de la etiqueta (10 díg leído por visión)
  const sapFoto = ariaSapDeCodigos(ocrCodigos)
  const sapElegido = sapUsuario || sapFoto || null

  // Con un SAP claro la decisión es directa y NO necesita LLM: existe → vincular;
  // no existe → crear nuevo con ESE SAP. (Esto solo ya arregla el caso del cilindro.)
  if (sapElegido) {
    const ex = bySap(sapElegido)
    return ex
      ? { accion: 'vincular_existente', codigoSAP: ex.codigoSAP, nombre: ex.textoBreve || ex.descripcion, equipoTexto, existente: ex, razon: 'SAP coincide exacto en el maestro' }
      : { accion: 'crear_nuevo', codigoSAP: sapElegido, nombre: nombreFoto || `Material SAP ${sapElegido}`, equipoTexto, existente: null, razon: 'SAP de la etiqueta no está en el maestro → material nuevo' }
  }

  // 2-bis) Referencia contextual sin SAP: "ese mismo repuesto" / "al mismo" /
  //   "el que creaste" → resolvé al ÚLTIMO repuesto que ARIA tocó (memoria de
  //   conversación; caso Orel 07-jul: "agrégale la foto a ese mismo repuesto").
  const refMismo = /\b(mism[oa]|ese|esa|dicho|anterior|reci[eé]n)\b/i.test(userText) &&
    /\b(repuesto|material|[íi]tem|c[oó]digo|ficha)\b/i.test(userText)
  if (ultimoRepuesto && (refMismo || (pending == null && ultimoRepuesto && /\bal\s+mismo\b/i.test(userText)))) {
    const ex = bySap(ultimoRepuesto.codigoSAP)
    if (ex) return { accion: 'vincular_existente', codigoSAP: ex.codigoSAP, nombre: ex.textoBreve || ex.descripcion, equipoTexto, existente: ex, razon: 'referencia al último repuesto tocado' }
  }

  // 3) Sin SAP claro → CRITERIO LLM con candidatos parecidos (informativos)
  const parecidos = []
  const vistos = new Set()
  const pushParecido = (r) => { if (!vistos.has(r.codigoSAP || r.textoBreve)) { parecidos.push(r); vistos.add(r.codigoSAP || r.textoBreve) } }
  for (const c of ocrCodigos) {
    const up = String(c).toUpperCase()
    if (/[A-Z]/.test(up) && up.length >= 5) {
      for (const r of items) { if (r._blob.includes(up)) pushParecido(r); if (parecidos.length >= 6) break }
    }
  }
  const terms = nombreFoto.toUpperCase().split(/\s+/).filter((t) => t.length >= 4)
  if (terms.length && parecidos.length < 6) {
    for (const r of items) { if (terms.every((t) => r._blob.includes(t))) pushParecido(r); if (parecidos.length >= 6) break }
  }
  const candLines = parecidos.slice(0, 6)
    .map((r, i) => `${i + 1}. SAP ${r.codigoSAP || 's/SAP'} — ${r.textoBreve || r.descripcion} (${r.clase || 's/clase'})`)
    .join('\n') || '(ninguno)'
  const prompt =
    'Sos ARIA. El usuario quiere dar de alta un material en el maestro de repuestos desde una foto. ' +
    'Decidí con criterio si es un material NUEVO o uno que YA existe, y respondé SOLO JSON: ' +
    '{"accion":"crear_nuevo"|"vincular_existente"|"preguntar","codigoSAP":string,"nombre":string,"pregunta":string,"razon":string}\n' +
    'REGLAS DURAS:\n' +
    '- Un SAP válido del maestro tiene 10 dígitos. Números de 6-8 dígitos o con letras (part numbers de fabricante como "552791" o "CRDSNU-32-200") NO son SAP y NO prueban que el material exista.\n' +
    '- "vincular_existente" SOLO si el codigoSAP que uses aparece EXACTO en los candidatos de abajo. Si ningún candidato tiene ese SAP exacto, NO es vincular.\n' +
    '- Dos part numbers parecidos (p.ej. -105 vs -200, distinta medida) son materiales DISTINTOS: no los confundas.\n' +
    '- Si no hay datos para decidir con seguridad, usá "preguntar" y escribí en "pregunta" qué necesitás (típicamente el SAP de 10 dígitos y el equipo).\n\n' +
    `MENSAJE DEL USUARIO: ${userText || '(mandó una foto)'}\n` +
    `DESCRIPCIÓN DE LA FOTO: ${descripcionFoto || '(sin descripción)'}\n` +
    `CÓDIGOS LEÍDOS EN LA ETIQUETA: ${(ocrCodigos || []).join(', ') || '(ninguno)'}\n` +
    `CANDIDATOS PARECIDOS EN EL MAESTRO:\n${candLines}`
  try {
    const raw = await ariaGroqChat([{ role: 'user', content: prompt }], { temperature: 0.1, maxTokens: 400, json: true })
    const d = JSON.parse(raw.trim())
    const accion = ['crear_nuevo', 'vincular_existente', 'preguntar'].includes(d.accion) ? d.accion : 'preguntar'
    if (accion === 'vincular_existente') {
      const ex = bySap(d.codigoSAP)
      if (ex) return { accion, codigoSAP: ex.codigoSAP, nombre: ex.textoBreve || ex.descripcion, equipoTexto, existente: ex, razon: d.razon || 'match del maestro' }
      return { accion: 'preguntar', codigoSAP: '', nombre: nombreFoto, equipoTexto, existente: null, razon: 'el SAP propuesto no está en el maestro', pregunta: d.pregunta || '¿Me confirmás el código SAP (10 dígitos) del material?' }
    }
    if (accion === 'crear_nuevo') {
      const sap = /^\d{10}$/.test(String(d.codigoSAP || '')) ? String(d.codigoSAP) : ''
      const ex = bySap(sap)
      if (ex) return { accion: 'vincular_existente', codigoSAP: ex.codigoSAP, nombre: ex.textoBreve || ex.descripcion, equipoTexto, existente: ex, razon: 'el SAP ya existe en el maestro' }
      return { accion: 'crear_nuevo', codigoSAP: sap, nombre: (d.nombre || nombreFoto || '').slice(0, 120), equipoTexto, existente: null, razon: d.razon || 'material nuevo' }
    }
    return { accion: 'preguntar', codigoSAP: '', nombre: nombreFoto, equipoTexto, existente: null, razon: d.razon || '', pregunta: d.pregunta || '¿Me confirmás el código SAP del material y a qué equipo va?' }
  } catch (err) {
    logger.warn('ariaDecidirRepuesto: criterio LLM falló, caigo a preguntar', { error: err?.message })
    return { accion: 'preguntar', codigoSAP: '', nombre: nombreFoto, equipoTexto, existente: null, razon: 'sin SAP legible', pregunta: 'No pude leer un código SAP claro. ¿Me lo pasás (10 dígitos) y de qué equipo es?' }
  }
}

/**
 * Foto en privado → ARIA la mira (descripción + OCR de códigos) y ofrece:
 * 1) si detecta un código que existe en el maestro → adjuntar la foto a ESE repuesto
 * 2) si leyó un SAP claro que NO está en el maestro → proponer crearlo como repuesto
 * 3) si no hay código y parece falla → crear incidencia con la foto
 * Si la foto trae un caption ACCIONABLE ("créalo como repuesto del Knuro"), se
 * delega al router para que lo resuelva usando la última foto.
 */
async function ariaHandleFoto(chatId, message, fromName, telegramUserId, topicId, esAdmin = false) {
  await callTelegramApi('sendChatAction', { chat_id: chatId, action: 'typing' })
  try {
    const largest = message.photo[message.photo.length - 1]
    const buffer = await downloadTelegramFile(largest.file_id)
    if (buffer.length > 3.5 * 1024 * 1024) {
      await sendTelegramMessage('📸 La foto es muy pesada para analizarla. Probá con una más liviana.', chatId, {})
      return
    }
    const caption = (message.caption || '').trim()
    const sessRef = db.collection('telegramAriaSessions').doc(String(chatId))
    // Leemos el estado ANTES de pisar ultimaFoto: modo "voy sumando fotos a este
    // repuesto" para varias fotos que llegan en mensajes separados.
    let modoAdjuntar = null
    try { modoAdjuntar = (await sessRef.get()).data()?.modoAdjuntarA || null } catch (_) { /* ignore */ }
    if (modoAdjuntar && Date.now() - (modoAdjuntar.at || 0) > ARIA_MODO_ADJUNTAR_TTL_MS) modoAdjuntar = null

    const { descripcion: desc, codigos } = await ariaGroqVision(buffer.toString('base64'), 'image/jpeg', caption)

    // Recordar la última foto analizada: habilita el seguimiento por texto/voz
    // "agrégalo como repuesto del [equipo]" sin re-mandar la foto (TTL 30 min)
    await sessRef.set({
      ultimaFoto: { fileId: largest.file_id, descripcion: desc.slice(0, 300), codigos, at: Date.now() },
    }, { merge: true })

    // Si la foto viene con un caption ACCIONABLE ("créalo como repuesto del Knuro",
    // "agrégalo a la grader", "reporta esta falla"), lo mandamos al router para que
    // lo resuelva con criterio usando la última foto que acabamos de guardar —
    // antes el caption se ignoraba y ARIA solo describía (caso Orel 07-jul).
    // Normalizamos tildes: sin esto "Agrégale" no matcheaba (la é rompía \bagreg).
    const captionNorm = caption.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    const CAPTION_ACCION = /\b(cre[aá]\w*|agreg\w*|s[uú]ma\w*|d[aá]\s+de\s+alta|d[aá]lo\s+de\s+alta|vincul\w*|reporta\w*|anota\w*|incidencia|pon[ée]?\w*|actualiz\w*|edit\w*|cambi\w*|codigo)\b/i
    if (caption && CAPTION_ACCION.test(captionNorm) && telegramUserId) {
      // El router responde usando la última foto que acabamos de guardar; él mismo
      // registra el turno (caption → respuesta), así que no lo duplicamos acá.
      await tgHandleAriaChat(chatId, caption, fromName, telegramUserId, topicId, esAdmin)
      return
    }

    // Modo "voy sumando fotos a este repuesto" activo + foto SIN caption ni SAP
    // propio → ofrecer sumarla a ESE repuesto (con confirmación; no auto-escribir).
    // Si la foto trae su propio SAP, es otro ítem → sigue el flujo normal.
    if (modoAdjuntar && modoAdjuntar.codigoSAP && !caption && !ariaSapDeCodigos(codigos)) {
      await ariaSetPending(chatId, {
        kind: 'adjuntar_foto_repuesto', codigoSAP: modoAdjuntar.codigoSAP,
        nombreRepuesto: modoAdjuntar.nombre, fotoFileId: largest.file_id, at: Date.now(),
      })
      const rT = `📸 ${desc}\n\n¿Le sumo esta foto también a **${modoAdjuntar.nombre || 'ese repuesto'}** (SAP \`${modoAdjuntar.codigoSAP}\`)? (sí / no)\nSi es de otra cosa, decime "no" y contame qué es.`
      const rH = `📸 ${ariaEscapeHtml(desc)}\n\n¿Le sumo esta foto también a <b>${ariaEscapeHtml(modoAdjuntar.nombre || 'ese repuesto')}</b> (SAP <code>${ariaEscapeHtml(modoAdjuntar.codigoSAP)}</code>)? (sí / no)\nSi es de otra cosa, decime "no" y contame qué es.`
      await sendTelegramMessage(rH, chatId, {})
      await ariaSaveTurns(chatId, '[foto]', rT)
      return
    }

    let match = null
    for (const c of codigos) {
      match = await ariaBuscarCodigoEnMaestro(c)
      if (match) break
    }
    const sapLeido = ariaSapDeCodigos(codigos)

    let reply, replyHtml
    if (match) {
      await ariaSetPending(chatId, {
        kind: 'adjuntar_foto_repuesto', codigoSAP: match.codigoSAP, nombreRepuesto: match.textoBreve || match.descripcion,
        fotoFileId: largest.file_id, at: Date.now(),
      })
      reply = `**Esto veo:**\n${desc}\n\n📎 Encontré ese código en el maestro: **${match.textoBreve || match.descripcion}** (SAP \`${match.codigoSAP}\`).\n\n¿Agrego esta foto como referencia de ese repuesto? (sí / no)`
      replyHtml = `📸 <b>Esto veo:</b>\n${ariaEscapeHtml(desc)}\n\n📎 Encontré ese código en el maestro: <b>${ariaEscapeHtml(match.textoBreve || match.descripcion)}</b> (SAP <code>${ariaEscapeHtml(match.codigoSAP)}</code>).\n\n¿Agrego esta foto como referencia de ese repuesto? (sí / no)`
    } else if (sapLeido) {
      // SAP legible que NO está en el maestro: casi siempre es un repuesto por dar
      // de alta, no una incidencia. No fijamos acción por defecto: guiamos para
      // crearlo (o pedir incidencia explícita si en realidad es una falla).
      reply = `**Esto veo:**\n${desc}\n\n🔎 Leí el código SAP \`${sapLeido}\` y no está en el maestro de repuestos.\n\n📦 Si es un repuesto/material, decime **"créalo como repuesto del [equipo]"** y lo doy de alta con esta foto y ese SAP. Si es una falla para reportar, decime "creá una incidencia".`
      replyHtml = `📸 <b>Esto veo:</b>\n${ariaEscapeHtml(desc)}\n\n🔎 Leí el código SAP <code>${ariaEscapeHtml(sapLeido)}</code> y no está en el maestro de repuestos.\n\n📦 Si es un repuesto/material, decime <b>"créalo como repuesto del [equipo]"</b> y lo doy de alta con esta foto y ese SAP. Si es una falla para reportar, decime "creá una incidencia".`
    } else {
      const descripcion = (caption ? `${caption} — ` : '') + desc +
        (codigos.length ? ` (código visible: ${codigos.join(', ')}, sin coincidencia en el maestro)` : '')
      await ariaSetPending(chatId, {
        kind: 'crear', descripcion: descripcion.slice(0, 800), prioridad: 'media',
        fotoFileId: largest.file_id, at: Date.now(),
      })
      const notaCodigo = codigos.length ? `\n\n🔎 Vi el código "${codigos[0]}" pero no parece un SAP del maestro.` : ''
      const notaRepuesto = '\n\n📦 ¿Es un repuesto/material? Decime "agrégalo como repuesto del [equipo]" y lo creo en el maestro con esta foto.'
      reply = `**Esto veo:**\n${desc}${notaCodigo}\n\n¿Creo una incidencia con esta foto adjunta? (sí / no)${notaRepuesto}`
      replyHtml = `📸 <b>Esto veo:</b>\n${ariaEscapeHtml(desc)}${ariaEscapeHtml(notaCodigo)}\n\n¿Creo una incidencia con esta foto adjunta? (sí / no)${ariaEscapeHtml(notaRepuesto)}`
    }
    await sendTelegramMessage(replyHtml, chatId, {})
    await ariaSaveTurns(chatId, caption ? `[foto] ${caption}` : '[foto]', reply)
  } catch (err) {
    logger.error('ariaHandleFoto error', { error: err?.message })
    await sendTelegramMessage('❌ No pude analizar la foto. Intentá de nuevo.', chatId, {})
  }
}

// ---- Modo LOTE: fotos enviadas como álbum (message.media_group_id) ----
// Se encolan en silencio (sin analizarlas todavía) y se procesan todas
// juntas en UNA llamada de visión cuando el usuario pide la lista — evita
// N conversaciones completas (visión + confirmar) para N fotos.

const ARIA_FOTO_BATCH_MAX = 8
const ARIA_FOTO_BATCH_TTL_MS = 20 * 60 * 1000

async function ariaQueueFotoLote(chatId, message) {
  const largest = message.photo[message.photo.length - 1]
  const ref = db.collection('telegramAriaSessions').doc(String(chatId))
  const doc = await ref.get()
  let batch = Array.isArray(doc.data()?.fotoBatch) ? doc.data().fotoBatch : []
  if (batch.length && Date.now() - (batch[0].at || 0) > ARIA_FOTO_BATCH_TTL_MS) batch = [] // lote viejo abandonado

  if (batch.length >= ARIA_FOTO_BATCH_MAX) {
    await sendTelegramMessage(
      `📸 Ya tengo ${ARIA_FOTO_BATCH_MAX} fotos en el lote (el máximo). Pedime **"hazme la lista"** antes de mandar más.`,
      chatId, {}
    )
    return
  }

  const esGrupoNuevo = !batch.length || batch[batch.length - 1].mediaGroupId !== message.media_group_id
  batch.push({
    fileId: largest.file_id,
    caption: (message.caption || '').trim(),
    mediaGroupId: message.media_group_id || null,
    at: batch.length ? batch[0].at : Date.now(),
  })
  await ref.set({ fotoBatch: batch }, { merge: true })

  if (esGrupoNuevo) {
    await sendTelegramMessage(
      `📸 Recibiendo tus fotos (van ${batch.length}). Mandá más o decime **"hazme la lista"** cuando termines.`,
      chatId, {}
    )
  }
}

// ---- Gráficos (QuickChart → sendPhoto) ----

function ariaQuickChartUrl(config) {
  return `https://quickchart.io/chart?w=820&h=420&bkg=white&c=${encodeURIComponent(JSON.stringify(config))}`
}

async function ariaGraficoGrader() {
  const snap = await db.collection('graderDailySummaries').orderBy('dateKey', 'desc').limit(14).get()
  if (snap.empty) return null
  const rows = snap.docs.map((d) => d.data()).reverse()
  const config = {
    type: 'line',
    data: {
      labels: rows.map((x) => (x.dateKey || '').slice(5)),
      datasets: [
        { label: 'Piezas', data: rows.map((x) => x.totalPieces || 0), borderColor: '#2563eb', fill: false, yAxisID: 'y' },
        { label: 'Microdetenciones', data: rows.map((x) => x.microDetentionsCount || 0), borderColor: '#dc2626', fill: false, yAxisID: 'y1' },
      ],
    },
    options: {
      title: { display: true, text: 'Grader — piezas y microdetenciones por turno' },
      scales: { yAxes: [{ id: 'y', position: 'left' }, { id: 'y1', position: 'right', gridLines: { drawOnChartArea: false } }] },
    },
  }
  return { url: ariaQuickChartUrl(config), caption: `📊 Grader — últimos ${rows.length} turnos registrados` }
}

async function ariaGraficoIncidencias() {
  const desde = new Date(); desde.setDate(desde.getDate() - 14); desde.setHours(0, 0, 0, 0)
  const snap = await db.collection('incidents').where('createdAt', '>=', desde).get()
  const porDia = new Map()
  for (let i = 0; i < 14; i++) {
    const d = new Date(desde); d.setDate(d.getDate() + i)
    porDia.set(d.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', month: '2-digit', day: '2-digit' }), 0)
  }
  snap.forEach((doc) => {
    const f = ariaToDate(doc.data().createdAt)
    if (!f) return
    const k = f.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', month: '2-digit', day: '2-digit' })
    if (porDia.has(k)) porDia.set(k, porDia.get(k) + 1)
  })
  const config = {
    type: 'bar',
    data: {
      labels: [...porDia.keys()],
      datasets: [{ label: 'Incidencias', data: [...porDia.values()], backgroundColor: '#f59e0b' }],
    },
    options: { title: { display: true, text: 'Incidencias creadas — últimos 14 días' } },
  }
  return { url: ariaQuickChartUrl(config), caption: `📊 Incidencias de los últimos 14 días (total: ${snap.size})` }
}

// ---- Memoria conversacional corta (colección telegramAriaSessions) ----

/** Carga toda la sesión ARIA en UNA lectura: historial + acción pendiente + notas */
async function ariaLoadSession(chatId) {
  let data = {}
  try {
    const doc = await db.collection('telegramAriaSessions').doc(String(chatId)).get()
    if (doc.exists) data = doc.data()
  } catch (_) { /* ignore */ }
  const history = (data.turns || []).slice(-ARIA_HISTORY_LIMIT)
    .map((t) => ({ role: t.role, content: t.content }))
  let pending = data.pendingIncident || null
  if (pending && Date.now() - (pending.at || 0) > ARIA_PENDING_TTL_MS) pending = null
  const notas = Array.isArray(data.notas) ? data.notas.slice(0, 20) : []
  const fotoBatchCount = Array.isArray(data.fotoBatch) ? data.fotoBatch.length : 0
  let ultimaFoto = data.ultimaFoto || null
  if (ultimaFoto && Date.now() - (ultimaFoto.at || 0) > ARIA_ULTIMA_FOTO_TTL_MS) ultimaFoto = null
  let ultimoRepuesto = data.ultimoRepuesto || null
  if (ultimoRepuesto && Date.now() - (ultimoRepuesto.at || 0) > ARIA_ULTIMO_REPUESTO_TTL_MS) ultimoRepuesto = null
  let modoAdjuntar = data.modoAdjuntarA || null
  if (modoAdjuntar && Date.now() - (modoAdjuntar.at || 0) > ARIA_MODO_ADJUNTAR_TTL_MS) modoAdjuntar = null
  return { history, pending, notas, fotoBatchCount, ultimaFoto, ultimoRepuesto, modoAdjuntar }
}

/** Recuerda el último repuesto que ARIA creó/tocó — habilita "ese mismo repuesto" */
async function ariaSetUltimoRepuesto(chatId, codigoSAP, nombre) {
  if (!codigoSAP) return
  await db.collection('telegramAriaSessions').doc(String(chatId))
    .set({ ultimoRepuesto: { codigoSAP: String(codigoSAP), nombre: String(nombre || ''), at: Date.now() } }, { merge: true })
}

/** Activa/limpia el modo "voy sumando las próximas fotos a este repuesto" */
async function ariaSetModoAdjuntar(chatId, val) {
  await db.collection('telegramAriaSessions').doc(String(chatId))
    .set({ modoAdjuntarA: val ? { ...val, at: Date.now() } : FieldValue.delete() }, { merge: true })
}

// ---- Autorización de usuarios de ARIA (whitelist `telegramAriaUsers`) ----
// Sin esto, CUALQUIER usuario de Telegram que encuentre el bot podría leer
// datos de planta y crear incidencias. El doc id = telegram user id.

const ARIA_ADMIN_CHAT_ID = process.env.ARIA_ADMIN_CHAT_ID || '52949422' // Orel

/** @returns {{ok: boolean, rol: string|null}} autorización + rol (admin ve módulos en desarrollo) */
async function ariaUsuarioAutorizado(telegramUserId, fromName, username) {
  try {
    const ref = db.collection('telegramAriaUsers').doc(String(telegramUserId))
    const doc = await ref.get()
    if (doc.exists && doc.data().autorizado === true) {
      return { ok: true, rol: doc.data().rol || 'tecnico' }
    }
    const esNuevo = !doc.exists
    // Registrar el intento; avisar al admin solo la primera vez por usuario
    await ref.set({
      autorizado: doc.exists ? (doc.data().autorizado || false) : false,
      nombre: fromName || null,
      username: username || null,
      ultimoIntento: FieldValue.serverTimestamp(),
    }, { merge: true })
    if (esNuevo) {
      await sendTelegramMessage(
        `🔒 <b>ARIA — intento de acceso no autorizado</b>\n` +
        `👤 ${ariaEscapeHtml(fromName || '?')}${username ? ` (@${ariaEscapeHtml(username)})` : ''}\n` +
        `🆔 <code>${ariaEscapeHtml(telegramUserId)}</code>\n\n` +
        `Para habilitarlo: <code>autorizado: true</code> en telegramAriaUsers/${ariaEscapeHtml(telegramUserId)}.`,
        ARIA_ADMIN_CHAT_ID
      )
    }
    return { ok: false, rol: null }
  } catch (err) {
    logger.error('ariaUsuarioAutorizado error', { error: err?.message })
    return { ok: false, rol: null } // ante la duda, cerrado
  }
}

// ---- Conocimiento de la app (catálogo ariaKnowledge/appModules) ----
// ARIA es el PIVOTE de la app: conoce todos los módulos y orienta al usuario.
// Los módulos "en desarrollo" solo se mencionan a admins.
// Regenerar el catálogo con: node scripts/sync-aria-app-modules.js

let _ariaModulosCache = { at: 0, modulos: [] }

async function ariaGetAppModules() {
  if (Date.now() - _ariaModulosCache.at < ARIA_CACHE_TTL_MS && _ariaModulosCache.modulos.length) {
    return _ariaModulosCache.modulos
  }
  try {
    const doc = await db.collection('ariaKnowledge').doc('appModules').get()
    _ariaModulosCache = { at: Date.now(), modulos: doc.exists ? (doc.data().modulos || []) : [] }
  } catch (err) {
    logger.warn('ariaGetAppModules error', { error: err?.message })
  }
  return _ariaModulosCache.modulos
}

/** Bloque de system-prompt con el mapa de la app, filtrado por rol */
async function ariaAppKnowledgeBlock(esAdmin) {
  const modulos = await ariaGetAppModules()
  if (!modulos.length) return ''
  const baseUrl = 'https://orelcain.github.io/mantenimiento-planta'
  const linea = (m) => `- ${m.nombre} (${baseUrl}${m.ruta}): ${m.descripcion || m.grupo}`
  const prod = modulos.filter((m) => m.estado === 'produccion')
  const dev = modulos.filter((m) => m.estado === 'desarrollo')
  let block = '\n\nMAPA DE LA APP DE MANTENIMIENTO (sos el pivote de la app: cuando corresponda, ' +
    'orientá al usuario sobre qué módulo usar e incluí el link):\n' + prod.map(linea).join('\n')
  if (esAdmin) {
    block += '\n\nMÓDULOS EN DESARROLLO (este usuario es ADMIN y sí puede verlos; aclarale que están en desarrollo):\n' +
      dev.map(linea).join('\n')
  } else {
    block += '\n\nIMPORTANTE: existen módulos de la app en desarrollo que NO debés listar, recomendar ni linkear a este usuario. ' +
      'Si pregunta por uno, respondé simple: "ese módulo está en desarrollo, pronto va a estar disponible" — y si vos manejás esos DATOS ' +
      'por chat (ej. tareas planificadas, incidencias, kpis), ofrecé dárselos vos directamente aquí mismo.'
  }
  return block
}

// ---- Hechos enseñados (conocimiento GLOBAL, ariaKnowledge/hechos) ----
// "aprende: ..." (solo admin) guarda hechos de la planta que ARIA usa con todos.

let _ariaHechosCache = { at: 0, hechos: [] }

async function ariaGetHechos() {
  if (Date.now() - _ariaHechosCache.at < ARIA_CACHE_TTL_MS && _ariaHechosCache.hechos.length) {
    return _ariaHechosCache.hechos
  }
  try {
    const doc = await db.collection('ariaKnowledge').doc('hechos').get()
    _ariaHechosCache = { at: Date.now(), hechos: doc.exists ? (doc.data().hechos || []) : [] }
  } catch (err) { logger.warn('ariaGetHechos error', { error: err?.message }) }
  return _ariaHechosCache.hechos
}

async function ariaAddHecho(texto, por) {
  const hechos = [...(await ariaGetHechos()), { texto: String(texto).slice(0, 300), por, en: Date.now() }].slice(-60)
  await db.collection('ariaKnowledge').doc('hechos').set({ hechos, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  _ariaHechosCache = { at: Date.now(), hechos }
}

async function ariaHechosBlock() {
  const hechos = await ariaGetHechos()
  if (!hechos.length) return ''
  return '\n\nHECHOS DE ESTA PLANTA ENSEÑADOS POR EL EQUIPO (dato verificado, usalos con confianza):\n' +
    hechos.map((h) => `- ${h.texto}`).join('\n')
}

// ---- Lagunas: registro de lo que ARIA no supo responder (ariaGaps) ----

function ariaLogLaguna(chatId, pregunta, accion, respuesta) {
  db.collection('ariaGaps').add({
    chatId: String(chatId),
    pregunta: String(pregunta).slice(0, 300),
    accion: accion || '?',
    respuesta: String(respuesta).slice(0, 300),
    fecha: FieldValue.serverTimestamp(),
  }).catch(() => {})
}

async function ariaDataLagunas() {
  const snap = await db.collection('ariaGaps').orderBy('fecha', 'desc').limit(12).get()
  if (snap.empty) return 'No tengo lagunas registradas — hasta ahora he podido responder todo (o nadie preguntó lo difícil 😄).'
  const lines = snap.docs.map((d) => {
    const x = d.data()
    return `- ${ariaFmtFecha(x.fecha)} [${x.accion}] "${x.pregunta}"`
  })
  return `Preguntas que no pude responder bien (últimas ${snap.size}):\n${lines.join('\n')}\n` +
    '(el admin puede enseñarme el dato que falta con "aprende: ...")'
}

const ARIA_MSG_NO_AUTORIZADO =
  '🔒 Hola! Soy ARIA, la asistente de Mantención de Antarfood. ' +
  'Tu usuario no está habilitado para conversar conmigo. ' +
  'Si trabajás en la planta, pedile acceso a Orel y quedás dentro al tiro 👍'

async function ariaSaveTurns(chatId, userText, assistantText) {
  try {
    const ref = db.collection('telegramAriaSessions').doc(String(chatId))
    const doc = await ref.get()
    const prev = doc.exists ? (doc.data().turns || []) : []
    const turns = [
      ...prev,
      { role: 'user', content: String(userText).slice(0, 1000), ts: Date.now() },
      { role: 'assistant', content: String(assistantText).slice(0, 1500), ts: Date.now() },
    ].slice(-ARIA_HISTORY_LIMIT * 2)
    // merge:true — el doc también guarda flags de configuración (ej. briefDiario)
    await ref.set({ turns, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  } catch (err) { logger.warn('ariaSaveTurns error', { error: err?.message }) }
}

// ---- Recolectores de datos (SOLO LECTURA) — texto plano para el LLM ----

async function ariaDataTurno() {
  const incSnap = await db.collection('incidents')
    .where('status', 'in', ['pendiente', 'confirmada', 'en_proceso']).get()
  const criticas = incSnap.docs.filter((d) => d.data().prioridad === 'critica').length
  const altas = incSnap.docs.filter((d) => d.data().prioridad === 'alta').length

  // OJO: la colección real es `preventiveTasks` (el handler legacy consultaba
  // `preventive_tasks`, que no existe); proximaEjecucion puede ser string o Timestamp.
  let prevCount = 0
  try {
    const prevSnap = await db.collection('preventiveTasks').where('activo', '==', true).get()
    const finHoy = new Date(); finHoy.setHours(23, 59, 59, 999)
    prevCount = prevSnap.docs.filter((d) => {
      const fecha = ariaToDate(d.data().proximaEjecucion)
      return fecha && fecha <= finHoy
    }).length
  } catch (_) { /* ignore */ }

  let fuera = []
  try {
    const eqSnap = await db.collection('equipment').where('estado', '==', 'fuera_servicio').get()
    fuera = eqSnap.docs.map((d) => d.data().nombre || d.data().codigo)
  } catch (_) { /* ignore */ }

  return [
    `Incidencias abiertas: ${incSnap.size} (críticas ${criticas}, altas ${altas}, media/baja ${incSnap.size - criticas - altas})`,
    `Preventivos programados hoy: ${prevCount}`,
    `Equipos fuera de servicio: ${fuera.length ? fuera.join(', ') : 'ninguno'}`,
  ].join('\n')
}

async function ariaDataKpi() {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  let creadasHoy = 0, resueltasHoy = 0
  try { creadasHoy = (await db.collection('incidents').where('createdAt', '>=', today).get()).size } catch (_) { /* ignore */ }
  try {
    resueltasHoy = (await db.collection('incidents')
      .where('status', 'in', ['resuelta', 'cerrada']).where('updatedAt', '>=', today).get()).size
  } catch (_) { /* ignore */ }
  const abiertas = (await db.collection('incidents')
    .where('status', 'in', ['pendiente', 'confirmada', 'en_proceso']).get()).size

  let operativos = 0, enMant = 0, fuera = 0
  try {
    const eqSnap = await db.collection('equipment').get()
    eqSnap.forEach((doc) => {
      const e = doc.data().estado
      if (e === 'operativo') operativos++
      else if (e === 'en_mantenimiento') enMant++
      else if (e === 'fuera_servicio') fuera++
    })
  } catch (_) { /* ignore */ }

  return [
    `Incidencias creadas hoy: ${creadasHoy} · resueltas hoy: ${resueltasHoy} · abiertas total: ${abiertas}`,
    `Equipos: ${operativos} operativos, ${enMant} en mantenimiento, ${fuera} fuera de servicio`,
  ].join('\n')
}

async function ariaDataEstado() {
  const snap = await db.collection('incidents')
    .where('status', 'in', ['pendiente', 'confirmada', 'en_proceso'])
    .orderBy('createdAt', 'desc').limit(10).get()
  if (snap.empty) return 'No hay incidencias activas.'
  const lines = snap.docs.map((d) => {
    const x = d.data()
    return `- [${x.prioridad}] ${x.titulo || 'Sin título'} (${x.status})`
  })
  return `Incidencias activas (últimas ${snap.size}):\n${lines.join('\n')}`
}

async function ariaDataSensores() {
  const rtdb = getRtdb()
  const snapshot = await rtdb.ref('sensors').once('value')
  if (!snapshot.exists()) return 'No hay sensores conectados.'
  const lines = []
  for (const [equipId, sensor] of Object.entries(snapshot.val() || {})) {
    if (!sensor || typeof sensor !== 'object') continue
    let line = `- ${equipId}: ${sensor.online === true ? 'online' : 'OFFLINE'}`
    if (sensor.temperatura?.value !== undefined) line += ` · temp ${sensor.temperatura.value}${sensor.temperatura.unit || '°C'} (${sensor.temperatura.status || '?'})`
    if (sensor.humedad?.value !== undefined) line += ` · humedad ${sensor.humedad.value}${sensor.humedad.unit || '%'} (${sensor.humedad.status || '?'})`
    lines.push(line)
  }
  return lines.length ? `Sensores en tiempo real:\n${lines.join('\n')}` : 'No hay datos de sensores.'
}

async function ariaDataEquipo(consulta) {
  const query = String(consulta || '').trim()
  if (!query) {
    const snap = await db.collection('equipment').orderBy('nombre').limit(15).get()
    if (snap.empty) return 'No hay equipos registrados.'
    return 'Equipos registrados (primeros 15):\n' +
      snap.docs.map((d) => `- ${d.data().nombre || d.data().codigo} [${d.data().estado || '?'}]`).join('\n')
  }
  const upper = query.toUpperCase()
  let snap = await db.collection('equipment')
    .where('nombre', '>=', upper).where('nombre', '<=', upper + '').limit(5).get()
  if (snap.empty) {
    snap = await db.collection('equipment')
      .where('codigo', '>=', upper).where('codigo', '<=', upper + '').limit(5).get()
  }
  if (snap.empty) {
    // Fallback: substring sobre el listado (colección chica)
    const all = await db.collection('equipment').get()
    const hits = all.docs.filter((d) => {
      const x = d.data()
      return `${x.nombre || ''} ${x.codigo || ''}`.toUpperCase().includes(upper)
    }).slice(0, 5)
    if (!hits.length) return `No encontré equipos con "${query}".`
    snap = { docs: hits }
  }
  return snap.docs.map((d) => {
    const x = d.data()
    return [
      `Equipo: ${x.nombre || 'Sin nombre'}${x.codigo ? ` (${x.codigo})` : ''}`,
      `  Estado: ${x.estado || '?'} · Criticidad: ${x.criticidad || 'N/A'}`,
      x.marca ? `  Marca/Modelo: ${x.marca} ${x.modelo || ''}` : null,
      x.hierarchyPath ? `  Ubicación: ${x.hierarchyPath}` : null,
    ].filter(Boolean).join('\n')
  }).join('\n\n')
}

// Cache warm del maestro de repuestos (evita 7,6k lecturas por consulta)
let _ariaRepuestosCache = { at: 0, items: [] }
let _ariaBodegaCache = { at: 0, bySap: new Map() }

async function ariaGetRepuestos() {
  if (Date.now() - _ariaRepuestosCache.at < ARIA_CACHE_TTL_MS && _ariaRepuestosCache.items.length) {
    return _ariaRepuestosCache.items
  }
  const snap = await db.collection('repuestos')
    .select('textoBreve', 'descripcion', 'codigoSAP', 'codigoFabricante', 'clase', 'equiposCodigos', 'valorUnitario', 'tieneSap', 'cantidadPorMaquina', 'ubicacionEnPlanta')
    .get()
  const items = snap.docs.map((d) => {
    const x = d.data()
    return {
      textoBreve: x.textoBreve || '', descripcion: x.descripcion || '',
      codigoSAP: x.codigoSAP || '', clase: x.clase || '',
      codigoFabricante: x.codigoFabricante || '',
      equiposCodigos: Array.isArray(x.equiposCodigos) ? x.equiposCodigos : [],
      valorUnitario: x.valorUnitario,
      cantidadPorMaquina: x.cantidadPorMaquina,
      ubicacionEnPlanta: x.ubicacionEnPlanta || '',
      // codigoFabricante en el blob: permite hallar el repuesto por part number
      // (los números puros NUNCA buscan por texto — ver ariaBuscarCodigoEnMaestro)
      _blob: `${x.textoBreve || ''} ${x.descripcion || ''} ${x.codigoSAP || ''} ${x.codigoFabricante || ''} ${(x.equiposCodigos || []).join(' ')}`.toUpperCase(),
    }
  })
  _ariaRepuestosCache = { at: Date.now(), items }
  return items
}

async function ariaGetBodega() {
  if (Date.now() - _ariaBodegaCache.at < ARIA_CACHE_TTL_MS && _ariaBodegaCache.bySap.size) {
    return _ariaBodegaCache.bySap
  }
  const bySap = new Map()
  try {
    const snap = await db.collection('bodega').get()
    snap.forEach((d) => {
      const x = d.data()
      if (x.codigoSAP) bySap.set(String(x.codigoSAP), x)
    })
  } catch (_) { /* ignore */ }
  _ariaBodegaCache = { at: Date.now(), bySap }
  return bySap
}

async function ariaDataRepuestos(consulta) {
  const query = String(consulta || '').trim()
  if (!query) return 'Falta el término de búsqueda del repuesto.'
  const [items, bodega] = await Promise.all([ariaGetRepuestos(), ariaGetBodega()])
  const terms = query.toUpperCase().split(/\s+/).filter((t) => t.length >= 2)
  if (!terms.length) return 'Término de búsqueda muy corto.'
  const hits = items.filter((r) => terms.every((t) => r._blob.includes(t))).slice(0, 8)
  if (!hits.length) return `No encontré repuestos con "${query}" en el maestro.`
  const lines = hits.map((r) => {
    const stock = r.codigoSAP ? bodega.get(String(r.codigoSAP)) : null
    return [
      `- ${r.textoBreve || r.descripcion || 'Sin nombre'}`,
      r.codigoSAP ? `  SAP ${r.codigoSAP}` : '  (sin SAP)',
      r.clase ? ` · ${r.clase}` : '',
      r.cantidadPorMaquina ? ` · ${r.cantidadPorMaquina} por máquina` : '',
      r.equiposCodigos.length ? ` · equipos: ${r.equiposCodigos.slice(0, 3).join(', ')}` : '',
      stock ? ` · stock bodega: ${stock.stockActual ?? '?'} ${stock.unidad || ''} (${stock.ubicacionBodega || 's/ubicación'})` : ' · sin registro en bodega',
      r.valorUnitario ? ` · $${Number(r.valorUnitario).toLocaleString('es-CL')}` : '',
      r.ubicacionEnPlanta ? ` · ubicación: ${r.ubicacionEnPlanta}` : '',
    ].join('')
  })
  return `Repuestos encontrados (${hits.length}, maestro SAP):\n${lines.join('\n')}\n` +
    '(nota: "cantidad por máquina" = cuántas lleva el equipo; "stock bodega" = existencias; si un dato no aparece, no está cargado en el maestro)'
}

/** Normaliza fechas de Firestore: Timestamp | string 'YYYY-MM-DD' | Date → Date|null */
function ariaToDate(v) {
  if (!v) return null
  if (typeof v.toDate === 'function') return v.toDate()
  if (v instanceof Date) return v
  if (typeof v === 'string') { const d = new Date(v); return isNaN(d) ? null : d }
  if (typeof v === 'object' && v._seconds !== undefined) return new Date(v._seconds * 1000)
  return null
}

const ariaFmtFecha = (v) => {
  const d = ariaToDate(v)
  return d ? d.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' }) : '?'
}

async function ariaDataHistorial(consulta) {
  const snap = await db.collection('maintenanceLog').orderBy('fecha', 'desc').limit(50).get()
  if (snap.empty) return 'No hay registros en el historial de mantención.'
  let rows = snap.docs.map((d) => d.data())
  const q = String(consulta || '').trim().toUpperCase()
  if (q) {
    rows = rows.filter((x) =>
      `${x.equipmentId || ''} ${x.plantLineId || ''} ${x.areaNodeId || ''} ${x.tecnico || ''} ${x.hallazgo || ''} ${x.tipo || ''}`
        .toUpperCase().includes(q))
  }
  if (!rows.length) return `Sin registros de mantención que calcen con "${consulta}".`
  const lines = rows.slice(0, 10).map((x) =>
    `- ${ariaFmtFecha(x.fecha)} [${x.tipo || '?'}·${x.severidad || '?'}] ${x.hallazgo || 'sin detalle'} — ${x.tecnico || '?'} (${x.plantLineId || x.equipmentId || '?'}${x.shiftId ? `, ${x.shiftId}` : ''})`)
  return `Historial de mantención (${rows.length} registros, muestro ${lines.length}):\n${lines.join('\n')}`
}

async function ariaDataGrader() {
  const snap = await db.collection('graderDailySummaries').orderBy('dateKey', 'desc').limit(2).get()
  if (snap.empty) return 'No hay resúmenes del Grader.'
  const bloques = snap.docs.map((d) => {
    const x = d.data()
    const gates = Array.isArray(x.gateDistribution)
      ? x.gateDistribution.map((g) => `G${g.gate}: ${g.pct}%`).join(' · ')
      : 's/d'
    return [
      `Turno ${x.dateKey} (${x.shiftId || '?'}):`,
      `  Piezas: ${x.totalPieces ?? 's/d'} · peso prom: ${x.avgWeightGrams ? (x.avgWeightGrams / 1000).toFixed(2) + ' kg' : 's/d'}`,
      `  Distribución compuertas: ${gates}${x.p0Pct !== undefined ? ` · P0: ${x.p0Pct}%` : ''}`,
      `  Microdetenciones: ${x.microDetentionsCount ?? 0} (${Math.round((x.microDetentionsTotalSec || 0) / 60)} min) · duración turno: ${x.durationMinutes ?? '?'} min`,
    ].join('\n')
  })
  return `Grader — últimos resúmenes:\n${bloques.join('\n')}`
}

// ---- produccion: turno EN VIVO desde Shoplogix (paridad con la PWA) ----
// Lee shoplogix/{plant}/shifts/{dk}_{shiftId}/machines (Admin SDK) y reporta
// piezas (=ciclos), estado/uptime por máquina, averías y causas de detención.
// Réplica server-side de los tools shift.live/shift.stops de la PWA.
const SLX_CANDS = ['Turno 1', 'Turno 2', 'Turno 3', 'Turno día', 'Turno noche', 'Unscheduled']
const SLX_MAINT_EXCLUDED = new Set(['FALTA MMPP', 'CONTRASTACION', 'CAMBIO LOTE/MMPP', 'AJUSTE OPERADOR'])

function slxTodayKeyChile() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// % uptime real desde states (uptime / (tracked − planned downtime)), igual que la PWA.
function slxUptimeFromStates(states) {
  let up = 0, tracked = 0, planned = 0
  for (const s of states || []) {
    const d = Number(s.durationSec || 0)
    tracked += d
    if (s.type === 'uptime') up += d
    if (s.type === 'break' && String(s.reason || '').toLowerCase().includes('planned downtime')) planned += d
  }
  const denom = tracked - planned
  return denom > 0 ? up / denom : 0
}

async function ariaDataProduccionVivo(consulta) {
  const q = consulta || ''
  const plantSlug = /\byal\b/i.test(q) ? 'yal' : /\bfilete/i.test(q) ? 'filete' : 'chonchi'
  const plantLbl = plantSlug === 'yal' ? 'Planta Yal'
    : plantSlug === 'filete' ? 'Filete · Línea 1 (Chonchi)'
    : 'Planta Principal (Chonchi)'
  const dk = slxTodayKeyChile()
  const loaded = (await Promise.all(SLX_CANDS.map(async (sid) => {
    try {
      const snap = await db.collection(`shoplogix/${plantSlug}/shifts/${dk}_${sid}/machines`).get()
      if (snap.empty) return null
      const machines = snap.docs.map((d) => d.data())
      const cycles = machines.reduce((a, m) => a + Number(m.totalCycles || 0), 0)
      return { shiftId: sid, machines, cycles }
    } catch { return null }
  }))).filter(Boolean)
  const valid = loaded.filter((x) => x.cycles > 0 && !(x.shiftId === 'Unscheduled' && x.cycles < 50))
  if (!valid.length) return `No hay producción viva de Shoplogix para ${plantLbl} en este momento (turno sin iniciar o sincronización pendiente).`
  valid.sort((a, b) => b.cycles - a.cycles)
  const shift = valid[0]
  const total = shift.cycles

  const perMachine = shift.machines
    .slice()
    .sort((a, b) => String(a.machineName || '').localeCompare(String(b.machineName || '')))
    .map((m) => {
      const states = Array.isArray(m.states) ? m.states : []
      const last = states[states.length - 1]
      let estado = 'produciendo'
      if (last && last.type !== 'uptime') {
        estado = String(last.name || '').trim() === 'Micro Detencion'
          ? 'en micro-detención'
          : `DETENIDA${String(last.reason || '').trim() ? ` (${String(last.reason).trim()})` : ''}`
      }
      const up = Math.round(slxUptimeFromStates(states) * 100)
      return `  · ${m.machineName}: ${Number(m.totalCycles || 0).toLocaleString('es-CL')} piezas · uptime ${up}% · ${estado}`
    })

  let macroCount = 0, microCount = 0
  const causeSec = new Map()
  let breakSec = 0
  for (const m of shift.machines) {
    for (const s of (m.states || [])) {
      if (s.type === 'downtime') {
        const key = String(s.reason || s.name || 'sin motivo').trim()
        causeSec.set(key, (causeSec.get(key) || 0) + Number(s.durationSec || 0))
        const r = String(s.reason || '').trim().toUpperCase()
        const isMaint = !(r && SLX_MAINT_EXCLUDED.has(r))
        if (isMaint) { if (String(s.name || '').trim() === 'Micro Detencion') microCount++; else macroCount++ }
      } else if (s.type === 'break') {
        breakSec += Number(s.durationSec || 0)
      }
    }
  }
  const pareto = [...causeSec.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([c, sec]) => `${c}: ${Math.round(sec / 60)} min`)

  const shiftLbl = shift.shiftId === 'Unscheduled' ? 'Sin turno asignado' : shift.shiftId
  return [
    `Producción EN VIVO · ${plantLbl} · turno ${shiftLbl} (${dk}):`,
    `Total: ${total.toLocaleString('es-CL')} piezas (= ciclos de eviscerado).`,
    ...perMachine,
    `Averías macro: ${macroCount} · Micro-detenciones: ${microCount}.`,
    pareto.length ? `Causas de detención: ${pareto.join(' · ')}.` : '',
    breakSec > 0 ? `Pausas programadas (colación/reunión): ${Math.round(breakSec / 60)} min.` : '',
  ].filter(Boolean).join('\n')
}

let _ariaGanttCache = { at: 0, items: [] }
async function ariaGetGantt() {
  if (Date.now() - _ariaGanttCache.at < ARIA_CACHE_TTL_MS && _ariaGanttCache.items.length) {
    return _ariaGanttCache.items
  }
  const snap = await db.collection('ganttTasks')
    .select('titulo', 'status', 'prioridad', 'endDate', 'progress', 'responsibleName', 'projectName', 'equipmentNombre', 'hierarchyPath')
    .get()
  _ariaGanttCache = { at: Date.now(), items: snap.docs.map((d) => d.data()) }
  return _ariaGanttCache.items
}

async function ariaDataGantt(consulta) {
  const todas = await ariaGetGantt()
  const q = String(consulta || '').trim().toUpperCase()
  let items = todas
  if (q) {
    const filtradas = todas.filter((x) =>
      `${x.titulo || ''} ${x.projectName || ''} ${x.responsibleName || ''} ${x.equipmentNombre || ''} ${x.hierarchyPath || ''}`
        .toUpperCase().includes(q))
    // Si el "filtro" no calza con nada (ej. el router pasó "atrasadas"), usar todo
    if (filtradas.length) items = filtradas
  }
  const abiertas = items.filter((x) => x.status !== 'completada' && (x.progress ?? 0) < 100)
  if (!abiertas.length) return q ? `Sin tareas Gantt abiertas que calcen con "${consulta}".` : 'No hay tareas Gantt abiertas.'
  const ahora = new Date()
  const atrasadas = abiertas.filter((x) => { const f = ariaToDate(x.endDate); return f && f < ahora })
  const fmt = (x) => `- ${x.titulo || 'Sin título'} [${x.status || '?'} ${x.progress ?? 0}%] vence ${ariaFmtFecha(x.endDate)} — ${x.responsibleName || '?'}${x.projectName ? ` (${x.projectName})` : ''}`
  const porVencer = abiertas
    .filter((x) => !atrasadas.includes(x))
    .sort((a, b) => (ariaToDate(a.endDate) || 0) - (ariaToDate(b.endDate) || 0))
    .slice(0, 8)
  let out = `Tareas Gantt abiertas: ${abiertas.length} (atrasadas: ${atrasadas.length})\n`
  if (atrasadas.length) out += `ATRASADAS:\n${atrasadas.slice(0, 8).map(fmt).join('\n')}\n`
  if (porVencer.length) out += `Próximas:\n${porVencer.map(fmt).join('\n')}`
  return out.trim()
}

async function ariaDataStockBajo() {
  const [items, bodega] = await Promise.all([ariaGetRepuestos(), ariaGetBodega()])
  const porSap = new Map(items.filter((r) => r.codigoSAP).map((r) => [String(r.codigoSAP), r]))
  const bajos = []
  for (const [sap, b] of bodega.entries()) {
    const min = Number(b.stockMinimo || 0)
    const actual = Number(b.stockActual ?? NaN)
    if (min > 0 && !isNaN(actual) && actual <= min) {
      const rep = porSap.get(sap)
      bajos.push(`- ${rep?.textoBreve || rep?.descripcion || 'SAP ' + sap}: ${actual} ${b.unidad || ''} (mín ${min})${b.ubicacionBodega ? ` — ${b.ubicacionBodega}` : ''}`)
    }
  }
  if (!bajos.length) return 'Ningún repuesto está en o bajo su stock mínimo (de los que tienen mínimo definido).'
  return `Repuestos en o bajo stock mínimo (${bajos.length}):\n${bajos.slice(0, 15).join('\n')}`
}

async function ariaDataSolicitudes() {
  const snap = await db.collection('solicitudes_repuestos').orderBy('createdAt', 'desc').limit(10).get()
  if (snap.empty) return 'No hay solicitudes de repuestos registradas.'
  const lines = snap.docs.map((d) => {
    const x = d.data()
    return `- ${ariaFmtFecha(x.createdAt)} [${x.estado || '?'}] ${x.textoBreve || x.codigoSAP || '?'} x${x.cantidad || 1} — ${x.solicitadoPorNombre || '?'}`
  })
  return `Solicitudes de repuestos (últimas ${snap.size}):\n${lines.join('\n')}`
}

async function ariaDataPreventivos() {
  const snap = await db.collection('preventiveTasks').where('activo', '==', true).get()
  if (snap.empty) return 'No hay tareas preventivas activas.'
  const ahora = new Date()
  const lines = snap.docs.map((d) => {
    const x = d.data()
    const prox = ariaToDate(x.proximaEjecucion)
    const estado = prox && prox < ahora ? 'VENCIDA' : 'al día'
    return `- ${x.nombre || 'Sin nombre'} [${x.tipo || '?'}] cada ${x.frecuenciaDias || '?'} días · próxima: ${ariaFmtFecha(x.proximaEjecucion)} (${estado})${x.checklist?.length ? ` · checklist ${x.checklist.length} ítems` : ''}`
  })
  return `Preventivos activos (${snap.size}):\n${lines.join('\n')}`
}

// ---- Acción pendiente de confirmación (borrador de incidencia) ----

const ARIA_PENDING_TTL_MS = 10 * 60 * 1000
// La última foto analizada queda disponible un rato para acciones de seguimiento
// ("agrégala como repuesto del X") sin tener que re-mandarla
const ARIA_ULTIMA_FOTO_TTL_MS = 30 * 60 * 1000
// El último repuesto que ARIA creó/tocó queda en contexto para "ese mismo
// repuesto" / "al mismo" / "el que creaste" (seguir la conversación)
const ARIA_ULTIMO_REPUESTO_TTL_MS = 60 * 60 * 1000
// Modo "voy sumando las fotos que me mandes a ESTE repuesto" (para varias fotos
// que llegan en mensajes separados, no como álbum)
const ARIA_MODO_ADJUNTAR_TTL_MS = 10 * 60 * 1000

async function ariaSetPending(chatId, pending) {
  await db.collection('telegramAriaSessions').doc(String(chatId))
    .set({ pendingIncident: pending || FieldValue.delete() }, { merge: true })
}

/** Crea la incidencia con la MISMA forma que tgHandleIncidencia (trigger de avisos incluido) */
async function ariaCrearIncidencia(pending, fromName, telegramUserId) {
  const id = `tg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  await db.collection('incidents').doc(id).set({
    id,
    tipo: 'correctivo',
    titulo: pending.descripcion.substring(0, 100),
    descripcion: pending.descripcion,
    prioridad: pending.prioridad,
    status: 'pendiente',
    fotos: [],
    reportadoPor: `telegram:${telegramUserId}`,
    creadoPor: `telegram:${telegramUserId}`,
    creadoPorNombre: fromName,
    origen: 'telegram',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  // Foto adjunta (flujo visión): subir a Storage y colgarla en el doc
  if (pending.fotoFileId) {
    try {
      const buffer = await downloadTelegramFile(pending.fotoFileId)
      const url = await uploadPhotoToStorage(id, buffer, 0)
      await db.collection('incidents').doc(id).update({ fotos: [url] })
    } catch (err) {
      logger.warn('No se pudo adjuntar la foto a la incidencia', { id, error: err?.message })
    }
  }
  return id
}

// ---- Brief matinal de Mantención ----

/** Junta todas las fuentes y redacta el brief con la persona de ARIA */
async function ariaComponerBrief() {
  const seguro = (p) => p.catch((e) => `(sin datos: ${e?.message})`)
  const [turno, kpi, gantt, stock, prev, grader, solicitudes] = await Promise.all([
    seguro(ariaDataTurno()),
    seguro(ariaDataKpi()),
    seguro(ariaDataGantt('')),
    seguro(ariaDataStockBajo()),
    seguro(ariaDataPreventivos()),
    seguro(ariaDataGrader()),
    seguro(ariaDataSolicitudes()),
  ])
  const fecha = new Date().toLocaleDateString('es-CL', {
    timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long',
  })
  const datos = [
    `== TURNO ==\n${turno}`, `== KPI ==\n${kpi}`, `== GANTT ==\n${gantt}`,
    `== STOCK BAJO ==\n${stock}`, `== PREVENTIVOS ==\n${prev}`,
    `== GRADER ==\n${grader}`, `== SOLICITUDES ==\n${solicitudes}`,
  ].join('\n\n')

  try {
    const texto = await ariaGroqChat(
      [
        {
          role: 'system',
          content: `${ARIA_PERSONA}\n\nRedactá el BRIEF MATINAL de Mantención con estos datos reales. ` +
            'Formato: máximo ~16 líneas, con **negrita** en los títulos de sección y viñetas "- ". Estructura: 1) saludo de UNA línea, SIN repetir la fecha (ya va en el encabezado); ' +
            '2) estado general (incidencias, equipos); 3) ALERTAS — lo accionable primero: tareas Gantt atrasadas, ' +
            'preventivos vencidos, stock bajo mínimo (solo cantidades y los 2-3 más importantes); ' +
            '4) Grader del último turno en una línea; 5) cierre breve. NO inventes datos.\n\n' +
            `DATOS:\n${datos}`,
        },
        { role: 'user', content: `Redactá el brief de hoy ${fecha}.` },
      ],
      { temperature: 0.3, maxTokens: 700 }
    )
    return `☀️ Brief de Mantención — ${fecha}\n\n${String(texto || '').trim()}`
  } catch (err) {
    logger.error('ariaComponerBrief error', { error: err?.message })
    return `☀️ Brief de Mantención — ${fecha} (datos crudos)\n\n${datos}`
  }
}

/** Brief matinal automático 7:00 AM a los chats suscritos (briefDiario=true) */
exports.ariaDailyBrief = onSchedule(
  { schedule: '0 7 * * *', timeZone: 'America/Santiago', region: 'us-central1', secrets: ['GROQ_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY'], timeoutSeconds: 300 },
  async () => {
    const subs = await db.collection('telegramAriaSessions').where('briefDiario', '==', true).get()
    if (subs.empty) { logger.info('ariaDailyBrief: sin suscriptores'); return }
    const brief = await ariaComponerBrief()
    for (const doc of subs.docs) {
      await sendTelegramMessage(ariaFormatTelegram(brief), doc.id)
    }
    logger.info(`ariaDailyBrief enviado a ${subs.size} chat(s)`)
  }
)

// ---- Orquestador del chat natural ----

const ARIA_ROUTER_SPEC =
  'Clasificá el último mensaje del usuario y respondé SOLO un objeto JSON válido: ' +
  '{"accion": string, "consulta": string, "respuesta": string, "prioridad": string, "equipo": string}\n' +
  'Acciones disponibles (todas de solo lectura):\n' +
  '- "kpi": indicadores de hoy (incidencias creadas/resueltas/abiertas, estado de equipos)\n' +
  '- "turno": resumen del turno (incidencias abiertas por prioridad, preventivos de hoy, equipos fuera de servicio)\n' +
  '- "estado": lista de incidencias activas\n' +
  '- "sensores": lecturas de sensores en tiempo real\n' +
  '- "equipo": ficha de un equipo — poné el nombre o código en "consulta"\n' +
  '- "repuestos": buscar repuestos/insumos/materiales — poné el término o código SAP en "consulta"\n' +
  '- "historial": historial/bitácora de intervenciones de mantención (inspecciones, capturas rápidas) — término opcional en "consulta" (equipo, área, técnico)\n' +
  '- "produccion": producción EN VIVO del turno EN CURSO desde Shoplogix — piezas totales y por máquina, uptime, POR QUÉ está detenida cada máquina, averías y causas de parada. Usá esto para "cuántas piezas llevamos", "cómo va el turno/la producción ahora", "por qué está detenida la línea", "qué fallas/averías", "en vivo". Detectá el área en "consulta" (yal / chonchi / filete).\n' +
  '- "grader": resumen de los últimos turnos CERRADOS del Grader (Excel: piezas, peso, compuertas, P0%, microdetenciones). Para el turno EN CURSO usá "produccion", no "grader".\n' +
  '- "gantt": tareas planificadas del Gantt (abiertas, atrasadas, próximas a vencer) — "consulta" SOLO si nombran un proyecto/responsable/equipo específico; NO pongas palabras de estado como "atrasadas" o "pendientes"\n' +
  '- "stockbajo": repuestos en o bajo su stock mínimo en bodega\n' +
  '- "solicitudes": solicitudes de repuestos a bodega y su estado\n' +
  '- "preventivos": tareas preventivas activas y cuándo tocan\n' +
  '- "brief": brief/resumen matinal completo de Mantención a demanda (todo junto: turno, alertas, gantt, stock, grader)\n' +
  '- "brief_activar": el usuario pide recibir el brief automático cada mañana\n' +
  '- "brief_desactivar": el usuario pide dejar de recibir el brief automático\n' +
  '- "charla": saludo, agradecimiento, pregunta general O pregunta sobre la APP misma (qué módulos hay, dónde se hace algo, cómo usar una función) — escribí la respuesta directa en "respuesta" como ARIA usando el MAPA DE LA APP. ' +
  'Cuando la respuesta incluya una enumeración (módulos, equipos, ítems), formateala SIEMPRE como lista: una línea por ítem con "- " y el nombre en **negrita**. ' +
  'Si preguntan qué sabés hacer, contá tus capacidades: turno, KPIs, incidencias, equipos, repuestos y stock, historial de mantención, Grader, Gantt, preventivos, solicitudes, sensores, brief matinal, alertas inmediatas, gráficos de tendencia; crear y cerrar incidencias (siempre con confirmación); mirar fotos que te manden (visión) y proponer la incidencia con la foto adjunta; si mandan VARIAS fotos juntas (álbum) las junto en un lote y con "hazme la lista" las proceso todas de una y las adjunto a sus repuestos; si la foto es de un material que NO está en el maestro, con "agrégalo como repuesto del [equipo]" lo creo y lo dejo vinculado a su equipo (con confirmación);recordar datos que te pidan; entendés notas de voz y respondés con voz cuando te hablan.\n' +
  '- "incidencia_crear": el usuario REPORTA una falla/problema NUEVO en su último mensaje (verbos típicos: anota, registra, reporta, crea una incidencia) — poné la descripción completa en "consulta" y la prioridad deducida en "prioridad" (critica|alta|media|baja; default "media"). NO resucites reportes ya cancelados del historial. NO se crea de inmediato: se pide confirmación.\n' +
  '- "incidencia_cerrar": el usuario pide cerrar/resolver/dar por lista una incidencia — poné en "consulta" la referencia a cuál (palabras del título). También pide confirmación.\n' +
  '- "confirmar": el usuario confirma la acción pendiente (sí, dale, confirmo, hazlo, ok créala)\n' +
  '- "cancelar": el usuario cancela o descarta la acción pendiente (no, cancela, olvídalo, mejor no)\n' +
  '- "recordar": el usuario te pide que recuerdes/anotes un dato o preferencia PERSONAL suya ("recuerda que...", "para que sepas...") — poné el hecho en "consulta"\n' +
  '- "olvidar": el usuario pide que borres tus notas sobre él\n' +
  '- "aprender": el usuario te ENSEÑA un hecho general de la planta para que lo sepas con TODOS ("aprende:", "aprende que", "para que aprendas") — poné el hecho completo en "consulta"\n' +
  '- "lagunas": el usuario pregunta qué no supiste responder, qué te falta saber o qué preguntas quedaron sin respuesta\n' +
  '- "alertas_activar": pide recibir aviso inmediato cuando entre una incidencia crítica o alta\n' +
  '- "alertas_desactivar": pide dejar de recibir esos avisos inmediatos\n' +
  '- "grafico": el usuario pide un gráfico/tendencia/curva — poné en "consulta" exactamente "grader" o "incidencias" según el tema\n' +
  '- "fotos_lote": el usuario pide procesar/listar/resumir las FOTOS que mandó (en plural: "las fotos", "todas", "la lista de sap", "agrega las fotos a sus repuestos") o dice "listo"/"ya está" después de mandar varias fotos juntas\n' +
  '- "repuesto_agregar": el usuario pide AGREGAR/crear un repuesto/material/insumo en el maestro, vincularlo a un equipo, O agregar la foto que mandó a un repuesto EXISTENTE que nombra por código o nombre (típico tras mandar UNA foto: "agrégalo a los repuestos del compresor GA90", "crea este aceite como repuesto de la grader", "agrégale esta foto también, va en el repuesto SAP 3300104630", "agregale esta foto a ese mismo repuesto") — poné en "consulta" el nombre corto del material o el código SAP que nombre, y en "equipo" el equipo que menciona (vacío si no nombra ninguno)\n' +
  '- "repuesto_editar": el usuario pide EDITAR/actualizar un dato de un repuesto que YA existe — por ahora el CÓDIGO DE FABRICANTE ("ponele/agregale el código de fabricante 999 0566", "el cód de fábrica es X", "actualiza el código de fabricante del SAP 3300138398"). Poné en "consulta" el código SAP del repuesto si lo nombra (si dice "ese mismo/al mismo" dejalo vacío, se usa el último repuesto). El valor lo extrae el sistema del mensaje.\n' +
  'Cualquier OTRA escritura (pedir repuestos a bodega, editar datos maestros existentes) NO está disponible: usá "charla" y explicá en "respuesta" que eso se hace en la app.'

async function tgHandleAriaChat(chatId, userText, fromName, telegramUserId, topicId, esAdmin = false) {
  await callTelegramApi('sendChatAction', { chat_id: chatId, action: 'typing' })
  const [{ history, pending, notas, fotoBatchCount, ultimaFoto, ultimoRepuesto, modoAdjuntar }, appBlock, hechosBlock] = await Promise.all([
    ariaLoadSession(chatId),
    ariaAppKnowledgeBlock(esAdmin),
    ariaHechosBlock(),
  ])

  // El router necesita saber si hay un borrador esperando confirmación:
  // sin esto, un "sí dale" re-extrae del historial (incluso reportes cancelados).
  const pendingDesc = pending
    ? (pending.kind === 'cerrar' ? `CERRAR la incidencia "${pending.titulo}"`
      : pending.kind === 'adjuntar_foto_repuesto' ? `AGREGAR la foto como referencia del repuesto "${pending.nombreRepuesto}" (SAP ${pending.codigoSAP})`
        : pending.kind === 'adjuntar_fotos_lote' ? `AGREGAR ${pending.items.length} fotos del lote a sus repuestos`
          : pending.kind === 'repuesto_nuevo' ? `CREAR el material nuevo "${pending.nombre}" en el maestro de repuestos`
            : pending.kind === 'repuesto_ligar' ? `VINCULAR el repuesto "${pending.nombreRepuesto}" al equipo ${pending.equipoNombre}`
              : pending.kind === 'repuesto_editar' ? `PONER el ${pending.campoLabel || pending.campo} "${pending.valor}" al repuesto "${pending.nombre}" (SAP ${pending.codigoSAP})`
                : `CREAR la incidencia "${pending.descripcion}" (prioridad ${pending.prioridad})`)
    : ''
  const pendingHint = pending
    ? `\n\nESTADO ACTUAL: hay una acción PENDIENTE de confirmación: ${pendingDesc}. ` +
      'Si el usuario asiente o acepta → accion "confirmar". Si rechaza, duda o cambia de tema → "cancelar". ' +
      'EXCEPCIÓN: si en vez de confirmar pide agregar el material como repuesto / vincularlo a un equipo → accion "repuesto_agregar". ' +
      'Si la pendiente es CREAR un material y el usuario responde con el nombre de un equipo (ej. "de la Knuro N1", "es del compresor GA90") → accion "repuesto_agregar" con equipo=<ese texto>.'
    : '\n\nESTADO ACTUAL: no hay ninguna acción pendiente de confirmación — NO uses "confirmar" ni "cancelar"; ' +
      'un "sí/dale" suelto sin reporte nuevo es "charla".'
  const notasHint = notas.length
    ? `\n\nNOTAS GUARDADAS DE ESTE USUARIO (tenelas en cuenta):\n${notas.map((n) => `- ${n}`).join('\n')}`
    : ''
  const fotoBatchHint = fotoBatchCount > 0
    ? `\n\nESTADO ACTUAL: el usuario tiene ${fotoBatchCount} foto(s) en un LOTE esperando ser procesadas (las mandó como álbum). ` +
      'Si pide una lista/resumen de esas fotos, que las agregue a sus repuestos, o dice algo tipo "listo"/"ya está"/"eso es todo" ' +
      'refiriéndose a las fotos que mandó, usá accion "fotos_lote" — NO "charla".'
    : ''
  const ultimoRepuestoHint = ultimoRepuesto
    ? `\n\nCONTEXTO: el ÚLTIMO repuesto que ARIA creó/tocó fue **${ultimoRepuesto.nombre || 'un repuesto'}** (SAP ${ultimoRepuesto.codigoSAP}). ` +
      'Si el usuario dice "ese mismo repuesto", "al mismo", "el que creaste", "ese ítem", etc., se refiere a ESTE. ' +
      'Para "ponele/agregale el código de fabricante X" o editar un dato de un repuesto existente → accion "repuesto_editar".'
    : ''

  // 0) Con acción pendiente, confirmar/cancelar se resuelve DETERMINISTA:
  // el LLM queda fuera de la ruta crítica (un "sí, créala" lo confundía y
  // re-armaba el borrador en vez de confirmarlo).
  let accionDirecta = null
  if (pending) {
    const t = ` ${userText.trim().toLowerCase()} `
    const esNegacion = /[\s,.!]?(no|cancela|cancelar|olvidalo|olvídalo|mejor no|descarta|falsa alarma)[\s,.!]/.test(t)
    const esAfirmacion = /[\s,.!](si|sí|dale|confirmo|confirmar|confirmada?|ok|okey|ya|hazlo|hacelo|creala|créala|cierrala|ciérrala|de una|listo|obvio|porfa)[\s,.!]/.test(t)
    // Si el mensaje pide otra cosa sobre el material ("no, agrégalo como repuesto
    // del GA90") NO es un sí/no al borrador: que lo resuelva el router. Un "sí,
    // agrégala" a secas sigue siendo confirmación determinista.
    const pideOtraCosa = /como (repuesto|material|insumo)|al maestro|vincul/i.test(userText)
    // "sin equipo": respuesta explícita al guard de equipo del material nuevo —
    // permite crear un repuesto transversal a propósito (nunca por descuido).
    // Va ANTES que negación/afirmación: "ninguno" o "no tiene equipo" son
    // respuestas a la pregunta del equipo, no una cancelación del borrador.
    const esSinEquipo = /sin equipo|ningun[oa]|no (va|tiene) (a )?(un )?equipo|transversal/.test(t)
    if (pending.kind === 'repuesto_nuevo' && !pending.equipoNodeId && esSinEquipo && userText.trim().length <= 40) {
      accionDirecta = 'confirmar_sin_equipo'
    } else if (userText.trim().length <= 40 && !pideOtraCosa) {
      if (esNegacion) accionDirecta = 'cancelar'
      else if (esAfirmacion) accionDirecta = 'confirmar'
    }
  }

  // 0.5) Atajos DETERMINISTAS de enseñanza (el LLM chico los rutea mal):
  // "aprende: X" / "aprende que X" → hecho global · "recuerda que X" → nota personal
  const mAprende = userText.match(/^\s*aprende(?:\s*:\s*|\s+que\s+)(.+)/is)
  const mRecuerda = userText.match(/^\s*(?:recuerda|recordá|recorda)(?:\s*:\s*|\s+que\s+)(.+)/is)

  // 1) Router: intención + término de búsqueda
  let route = { accion: 'charla', consulta: '', respuesta: '', prioridad: '', equipo: '' }
  if (accionDirecta) {
    route.accion = accionDirecta
  } else if (mAprende) {
    route = { accion: 'aprender', consulta: mAprende[1].trim(), respuesta: '', prioridad: '' }
  } else if (mRecuerda) {
    route = { accion: 'recordar', consulta: mRecuerda[1].trim(), respuesta: '', prioridad: '' }
  } else {
    try {
      const raw = await ariaGroqChat(
        [{ role: 'system', content: `${ARIA_PERSONA}\n\n${ARIA_ROUTER_SPEC}${pendingHint}${fotoBatchHint}${ultimoRepuestoHint}${notasHint}${appBlock}${hechosBlock}` }, ...history, { role: 'user', content: userText }],
        { json: true, temperature: 0.1, maxTokens: 700 } // gpt-oss-120b (y otros modelos nuevos) gastan presupuesto "pensando" antes del JSON; el system prompt ya creció bastante (persona+router+app+hechos)
      )
      route = { ...route, ...JSON.parse(raw) }
    } catch (err) {
      logger.warn('ARIA router fallback a charla', { error: err?.message })
    }
  }

  // 2) Datos + composición de la respuesta
  let reply = ''
  if (route.accion === 'incidencia_crear') {
    const descripcion = String(route.consulta || '').trim()
    const prioridad = PRIORITY_LABELS.includes(route.prioridad) ? route.prioridad : 'media'
    if (!descripcion) {
      reply = 'Contame qué pasó (equipo, qué falla y dónde) y armo la incidencia para que la confirmes.'
    } else {
      await ariaSetPending(chatId, { kind: 'crear', descripcion, prioridad, at: Date.now() })
      reply = `**Voy a crear esta incidencia:**\n\n📋 ${descripcion}\n🎯 Prioridad: **${prioridad}**\n👤 Reporta: ${fromName}\n\n¿La creo? (sí / no)`
    }
  } else if (route.accion === 'incidencia_cerrar') {
    const referencia = String(route.consulta || '').trim().toUpperCase()
    const snap = await db.collection('incidents')
      .where('status', 'in', ['pendiente', 'confirmada', 'en_proceso'])
      .orderBy('createdAt', 'desc').limit(20).get()
    const abiertas = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    const hits = referencia
      ? abiertas.filter((x) => `${x.titulo || ''} ${x.descripcion || ''}`.toUpperCase().includes(referencia))
      : abiertas
    if (!hits.length) {
      reply = referencia
        ? `No encontré incidencias abiertas que calcen con "${route.consulta}".`
        : 'No hay incidencias abiertas para cerrar.'
    } else if (hits.length > 1) {
      reply = 'Encontré varias abiertas — ¿cuál cierro? Decímelo con más detalle:\n' +
        hits.slice(0, 5).map((x) => `- ${x.titulo || 'Sin título'} [${x.prioridad}]`).join('\n')
    } else {
      await ariaSetPending(chatId, { kind: 'cerrar', incidentId: hits[0].id, titulo: hits[0].titulo || 'Sin título', at: Date.now() })
      reply = `**Voy a marcar como RESUELTA esta incidencia:**\n\n📋 ${hits[0].titulo || 'Sin título'} [${hits[0].prioridad}]\n\n¿Confirmás? (sí / no)`
    }
  } else if (route.accion === 'confirmar' || route.accion === 'confirmar_sin_equipo') {
    if (!pending) {
      reply = 'No tengo ninguna acción pendiente de confirmar. Si querés reportar algo, contame qué pasó.'
    } else if (pending.kind === 'cerrar') {
      await db.collection('incidents').doc(pending.incidentId).update({
        status: 'resuelta',
        resolucion: `Resuelta vía ARIA (Telegram) por ${fromName}`,
        resueltoPor: `telegram:${telegramUserId}`,
        updatedAt: FieldValue.serverTimestamp(),
      })
      await ariaSetPending(chatId, null)
      reply = `✅ Incidencia marcada como resuelta:\n📋 ${pending.titulo}`
    } else if (pending.kind === 'adjuntar_foto_repuesto') {
      try {
        await ariaAdjuntarFotoARepuesto(pending.codigoSAP, pending.fotoFileId)
        await ariaSetPending(chatId, null)
        await ariaSetUltimoRepuesto(chatId, pending.codigoSAP, pending.nombreRepuesto)
        await ariaSetModoAdjuntar(chatId, { codigoSAP: pending.codigoSAP, nombre: pending.nombreRepuesto })
        reply = `✅ Foto agregada al repuesto **${pending.nombreRepuesto}** (SAP \`${pending.codigoSAP}\`). Ya la vas a ver en su ficha del módulo Repuestos.\n\nSi tenés más fotos de este repuesto, mandámelas y las voy sumando.`
      } catch (err) {
        logger.error('ariaAdjuntarFotoARepuesto error', { error: err?.message })
        await ariaSetPending(chatId, null)
        reply = '❌ No pude adjuntar la foto al repuesto. Probá de nuevo en un rato.'
      }
    } else if (pending.kind === 'adjuntar_fotos_lote') {
      const resultados = await Promise.allSettled(
        pending.items.map((it) => ariaAdjuntarFotoARepuesto(it.codigoSAP, it.fileId))
      )
      const ok = resultados.filter((r) => r.status === 'fulfilled').length
      const fail = resultados.length - ok
      await ariaSetPending(chatId, null)
      reply = `✅ Agregadas ${ok} foto${ok === 1 ? '' : 's'} a sus repuestos.` + (fail ? ` ⚠️ ${fail} fallaron — probá esas de nuevo.` : '')
    } else if (pending.kind === 'repuesto_nuevo' && !pending.equipoNodeId && pending.clase === 'repuesto' && route.accion !== 'confirmar_sin_equipo') {
      // Guard: un REPUESTO no se crea huérfano por descuido (quedaba en "Sin
      // equipo" y nadie lo volvía a vincular). Insumos/herramientas/etc. sí
      // pueden ser transversales sin preguntar.
      reply = `🔧 Antes de crear **${pending.nombre}**: ¿de qué equipo es? Decímelo (ej. "de la KNURO N1") y lo dejo vinculado. ` +
        'Si de verdad no va atado a un equipo, respondé **"sin equipo"** y lo creo transversal.'
    } else if (pending.kind === 'repuesto_nuevo') {
      try {
        await ariaCrearRepuestoNuevo(pending, fromName, telegramUserId)
        await ariaSetPending(chatId, null)
        await ariaSetUltimoRepuesto(chatId, pending.codigoSAP, pending.nombre)
        reply = `✅ Creado en el maestro: **${pending.nombre}** (clase ${pending.clase}${pending.codigoSAP ? `, SAP \`${pending.codigoSAP}\`` : ', sin SAP'})` +
          (pending.equipoNombre ? ` vinculado a **${pending.equipoNombre}**` : '') +
          (pending.fotoFileId ? ' con su foto' : '') +
          '. Ya lo podés ver en el módulo Repuestos.' +
          (pending.codigoSAP ? '\n\nSi querés, sumale más fotos (mandámelas) o decime "ponele el código de fabricante ___".' : '')
      } catch (err) {
        logger.error('ariaCrearRepuestoNuevo error', { error: err?.message })
        await ariaSetPending(chatId, null)
        reply = err?.code === 6 // ALREADY_EXISTS: ya hay un doc con ese SAP como id
          ? `❌ Ya existe un material con SAP ${pending.codigoSAP} en el maestro — no lo dupliqué. Si querés, mandame la foto de nuevo y la adjunto a ese.`
          : '❌ No pude crear el material en el maestro. Probá de nuevo en un rato.'
      }
    } else if (pending.kind === 'repuesto_ligar') {
      try {
        await ariaLigarRepuestoAEquipo(pending, fromName)
        await ariaSetPending(chatId, null)
        await ariaSetUltimoRepuesto(chatId, pending.codigoSAP, pending.nombreRepuesto)
        reply = `✅ **${pending.nombreRepuesto}** (SAP \`${pending.codigoSAP}\`) quedó vinculado al equipo **${pending.equipoNombre}**${pending.fotoFileId ? ' y le agregué la foto' : ''}. Lo ves en su expediente y en Repuestos.`
      } catch (err) {
        logger.error('ariaLigarRepuestoAEquipo error', { error: err?.message })
        await ariaSetPending(chatId, null)
        reply = '❌ No pude vincular el repuesto al equipo. Probá de nuevo en un rato.'
      }
    } else if (pending.kind === 'repuesto_editar') {
      try {
        await ariaEditarRepuesto(pending, fromName, telegramUserId)
        await ariaSetPending(chatId, null)
        await ariaSetUltimoRepuesto(chatId, pending.codigoSAP, pending.nombre)
        reply = `✅ Listo: **${pending.nombre}** (SAP \`${pending.codigoSAP}\`) quedó con ${pending.campoLabel || pending.campo} \`${pending.valor}\`${pending.fotoFileId ? ' y le sumé la foto' : ''}. Lo ves en su ficha del módulo Repuestos.`
      } catch (err) {
        logger.error('ariaEditarRepuesto error', { error: err?.message })
        await ariaSetPending(chatId, null)
        reply = '❌ No pude actualizar el repuesto. Probá de nuevo en un rato.'
      }
    } else {
      const newId = await ariaCrearIncidencia(pending, fromName, telegramUserId)
      await ariaSetPending(chatId, null)
      reply = `✅ Incidencia creada (prioridad ${pending.prioridad}):\n📋 ${pending.descripcion}\n🔗 https://orelcain.github.io/mantenimiento-planta/incidents/${newId}`
    }
  } else if (route.accion === 'recordar') {
    const nota = String(route.consulta || '').trim().slice(0, 200)
    if (!nota) {
      reply = '¿Qué querés que recuerde?'
    } else {
      const nuevas = [...notas, nota].slice(-20)
      await db.collection('telegramAriaSessions').doc(String(chatId)).set({ notas: nuevas }, { merge: true })
      reply = `🧠 Anotado: "${nota}". Lo voy a tener presente.`
    }
  } else if (route.accion === 'olvidar') {
    await db.collection('telegramAriaSessions').doc(String(chatId)).set({ notas: [] }, { merge: true })
    reply = '🧠 Listo, borré mis notas sobre vos. Empezamos de cero.'
  } else if (route.accion === 'aprender') {
    const hecho = String(route.consulta || '').trim().slice(0, 300)
    if (!esAdmin) {
      reply = 'Los hechos globales de la planta me los enseña el admin (Orel). ' +
        'Si es algo tuyo personal, decime **"recuerda que..."** y lo anoto en tus notas 😉'
    } else if (!hecho) {
      reply = '¿Qué querés que aprenda? Decímelo así: **aprende: los cilindros de la grader van 2 por lado**'
    } else {
      await ariaAddHecho(hecho, fromName)
      reply = `📚 **Aprendido para siempre:**\n"${hecho}"\n\nDesde ahora lo uso en mis respuestas con todo el equipo.`
    }
  } else if (route.accion === 'alertas_activar' || route.accion === 'alertas_desactivar') {
    const activar = route.accion === 'alertas_activar'
    await db.collection('telegramAriaSessions').doc(String(chatId)).set({ alertas: activar }, { merge: true })
    reply = activar
      ? '⚡ Listo. Te aviso al tiro cuando entre una incidencia crítica o alta.'
      : 'Listo, no te mando más alertas inmediatas. El brief matinal sigue según tu configuración.'
  } else if (route.accion === 'cancelar') {
    await ariaSetPending(chatId, null)
    reply = 'Listo, descarté el borrador. ¿Algo más?'
  } else if (route.accion === 'grafico') {
    const cual = /incidencia/i.test(route.consulta || userText) ? 'incidencias' : 'grader'
    try {
      const g = cual === 'incidencias' ? await ariaGraficoIncidencias() : await ariaGraficoGrader()
      if (g) {
        await sendTelegramPhoto(chatId, g.url, g.caption, null, { topicId })
        reply = 'Ahí te va el gráfico 📊 ¿Querés que te lo comente?'
      } else {
        reply = `No hay datos suficientes para el gráfico de ${cual}.`
      }
    } catch (err) {
      logger.error('ARIA grafico error', { error: err?.message })
      reply = 'No pude generar el gráfico ahora. Intentá de nuevo en un rato.'
    }
  } else if (route.accion === 'repuesto_agregar') {
    const equipoTexto = String(route.equipo || '').trim()
    // CRITERIO (LLM + validación determinista): el SAP de la etiqueta manda;
    // "existe" solo si ese SAP (10 díg) está EXACTO en el maestro. Un código de
    // fabricante (552791) ya no genera falso match, y el SAP corregido/tipeado por
    // el usuario ("no es X, es Y" / "termina en 8398") se respeta entre turnos.
    const decision = await ariaDecidirRepuesto({
      userText,
      ocrCodigos: ultimaFoto?.codigos || [],
      descripcionFoto: ultimaFoto?.descripcion || '',
      equipoTexto,
      pending,
      ultimoRepuesto,
    })
    const equipo = decision.equipoTexto
      ? await ariaBuscarEquipoEnJerarquia(decision.equipoTexto)
      : { mejor: null, candidatos: [], exacto: false }

    if (decision.accion === 'preguntar') {
      reply = decision.pregunta || '¿Me confirmás el código SAP del material y a qué equipo lo agrego?'
    } else if (decision.accion === 'vincular_existente') {
      if (!decision.equipoTexto && ultimaFoto?.fileId) {
        // foto extra para un repuesto existente, sin equipo → adjuntar directo
        await ariaSetPending(chatId, {
          kind: 'adjuntar_foto_repuesto', codigoSAP: decision.codigoSAP,
          nombreRepuesto: decision.nombre, fotoFileId: ultimaFoto.fileId, at: Date.now(),
        })
        reply = `Ese SAP es **${decision.nombre}** (\`${decision.codigoSAP}\`).\n\n¿Le agrego la foto que me mandaste? (sí / no)`
      } else if (!decision.equipoTexto) {
        reply = `Ese SAP ya está en el maestro: **${decision.nombre}** (\`${decision.codigoSAP}\`). Mandame la foto y decime "agrégala al SAP ${decision.codigoSAP}", o decime a qué equipo lo vinculo.`
      } else if (!equipo.mejor) {
        reply = `No encontré el equipo "${decision.equipoTexto}" en la jerarquía SAP. Decime el nombre como figura en la app (o su código) y lo intento de nuevo.`
      } else {
        await ariaSetPending(chatId, {
          kind: 'repuesto_ligar', codigoSAP: decision.codigoSAP, nombreRepuesto: decision.nombre,
          equipoNodeId: equipo.mejor.id, equipoCodigo: equipo.mejor.codigo,
          equipoNombre: equipo.mejor.alias || equipo.mejor.nombre,
          fotoFileId: ultimaFoto?.fileId || null, at: Date.now(),
        })
        reply = `Ese material YA está en el maestro: **${decision.nombre}** (SAP \`${decision.codigoSAP}\`) — mejor lo vinculo en vez de duplicarlo.\n\n` +
          `🔧 Equipo: **${equipo.mejor.alias || equipo.mejor.nombre}**${equipo.mejor.codigo ? ` (${equipo.mejor.codigo})` : ''}` +
          (ultimaFoto ? '\n📸 Le adjunto además tu foto' : '') +
          '\n\n¿Confirmás? (sí / no)'
      }
    } else { // crear_nuevo
      const nombre = String(decision.nombre || '').trim().slice(0, 120)
      if (!nombre) {
        reply = '¿Qué material agrego? Decime por ejemplo: **"agrega el aceite Roto-Inject como repuesto del compresor GA90"** — y si me mandás la foto antes, la dejo en su ficha.'
      } else if (decision.equipoTexto && !equipo.mejor) {
        reply = `No encontré el equipo "${decision.equipoTexto}" en la jerarquía SAP. Decime el nombre como figura en la app (o su código) y lo creo vinculado.`
      } else {
        const clase = ariaDeducirClase(`${nombre} ${ultimaFoto?.descripcion || ''}`)
        const codigoNuevo = decision.codigoSAP || ''
        // aviso de posibles duplicados por nombre (que Orel decida antes de crear)
        const items = await ariaGetRepuestos()
        const terms = nombre.toUpperCase().split(/\s+/).filter((t) => t.length >= 3)
        const parecidos = terms.length
          ? items.filter((r) => terms.every((t) => r._blob.includes(t)) && r.codigoSAP !== codigoNuevo).slice(0, 2)
          : []
        await ariaSetPending(chatId, {
          kind: 'repuesto_nuevo', nombre, clase, codigoSAP: codigoNuevo,
          equipoNodeId: equipo.mejor?.id || null, equipoCodigo: equipo.mejor?.codigo || '',
          equipoNombre: equipo.mejor ? (equipo.mejor.alias || equipo.mejor.nombre) : '',
          fotoFileId: ultimaFoto?.fileId || null, descFoto: ultimaFoto?.descripcion || '', at: Date.now(),
        })
        const lineaEquipo = equipo.mejor
          ? `🔧 Equipo: **${equipo.mejor.alias || equipo.mejor.nombre}**${equipo.mejor.codigo ? ` (${equipo.mejor.codigo})` : ''}` +
            (equipo.candidatos.length > 1 && !equipo.exacto ? ' *(si no es ese, decime "no" y dame el nombre exacto)*' : '')
          : clase === 'repuesto'
            ? '🔧 ¿De qué equipo es? Decímelo (ej. "de la KNURO N1") y lo dejo vinculado; si es transversal respondé "sin equipo"'
            : '🔧 Sin equipo vinculado (lo podés vincular después en la app)'
        reply = '**Voy a crear este material en el maestro:**\n\n' +
          `📦 ${nombre}\n` +
          `🏷️ Clase: **${clase}** · ${codigoNuevo ? `SAP \`${codigoNuevo}\`` : 'sin código SAP'}\n` +
          `${lineaEquipo}\n` +
          (ultimaFoto ? '📸 Con la foto que me mandaste\n' : '') +
          (parecidos.length ? `\n⚠️ Ojo, hay parecidos en el maestro: ${parecidos.map((p) => `${p.textoBreve || p.descripcion}${p.codigoSAP ? ` (SAP ${p.codigoSAP})` : ''}`).join(' · ')} — si es uno de esos, decime "no" y lo vinculamos en vez de duplicar.\n` : '') +
          '\n¿Lo creo? (sí / no)'
      }
    }
  } else if (route.accion === 'repuesto_editar') {
    // Resolver el repuesto objetivo: SAP explícito en el mensaje → último repuesto tocado
    const sapMsg = (userText.match(/\b\d{10}\b/) || [])[0] || (String(route.consulta || '').match(/\b\d{10}\b/) || [])[0] || null
    const targetSap = sapMsg || ultimoRepuesto?.codigoSAP || null
    const valor = ariaParseCodigoFabricante(userText)
    if (!targetSap) {
      reply = '¿A qué repuesto le pongo el código de fabricante? Decime el SAP (10 dígitos), o "al mismo" si es el último que tocamos.'
    } else if (!valor) {
      reply = '¿Cuál es el código de fabricante? Decímelo así: **"el código de fabricante es 999 0566"**.'
    } else {
      const maestro = await ariaGetRepuestos()
      const rep = maestro.find((r) => r.codigoSAP && String(r.codigoSAP) === String(targetSap)) || null
      if (!rep) {
        reply = `No encontré un repuesto con SAP \`${targetSap}\` en el maestro. Revisá el código y probamos de nuevo.`
      } else {
        // Si el usuario mezcla "agregale la foto Y el código", sumamos la última foto de paso
        const sumaFoto = ultimaFoto?.fileId && /\b(foto|imagen|im[aá]gen)/i.test(userText) ? ultimaFoto.fileId : null
        await ariaSetPending(chatId, {
          kind: 'repuesto_editar', codigoSAP: rep.codigoSAP, nombre: rep.textoBreve || rep.descripcion,
          campo: 'codigoFabricante', campoLabel: 'código de fabricante', valor,
          fotoFileId: sumaFoto, at: Date.now(),
        })
        reply = `Le pongo el **código de fabricante** \`${valor}\` a **${rep.textoBreve || rep.descripcion}** (SAP \`${rep.codigoSAP}\`)` +
          (sumaFoto ? ' y le sumo la foto que mandaste' : '') +
          '.\n\n¿Confirmo? (sí / no)'
      }
    }
  } else if (route.accion === 'fotos_lote') {
    const sessionRef = db.collection('telegramAriaSessions').doc(String(chatId))
    const sessionDoc = await sessionRef.get()
    const batch = Array.isArray(sessionDoc.data()?.fotoBatch) ? sessionDoc.data().fotoBatch : []
    if (!batch.length) {
      reply = 'No tengo fotos pendientes en el lote. Mandame varias fotos juntas (como álbum) y después pedime la lista.'
    } else {
      await callTelegramApi('sendChatAction', { chat_id: chatId, action: 'typing' })
      try {
        const buffers = []
        for (const item of batch) buffers.push(await downloadTelegramFile(item.fileId))
        const totalBytes = buffers.reduce((s, b) => s + b.length, 0)
        if (totalBytes > 15 * 1024 * 1024) {
          reply = `El lote pesa mucho (${(totalBytes / 1024 / 1024).toFixed(1)} MB) para analizarlo junto. Probá con menos fotos o más livianas.`
        } else {
          const imagenes = buffers.map((b) => ({ base64: b.toString('base64'), mime: 'image/jpeg' }))
          const resultados = await ariaGroqVisionLote(imagenes)

          // Si el análisis falló en TODAS, no vaciamos el lote (los file_id siguen
          // vivos) y avisamos con honestidad en vez de "ninguna matcheó".
          const todasFallaron = resultados.length > 0 && resultados.every((r) => /no pude analizar/i.test(r.descripcion || ''))
          if (todasFallaron) {
            reply = '❌ No pude analizar las fotos del lote ahora (el servicio de visión falló). Las dejé en cola — probá de nuevo en un rato con **"hazme la lista"**, o mandámelas de a una.'
          } else {
            const matches = []
            const lineas = []
            for (let i = 0; i < resultados.length; i++) {
              const r = resultados[i]
              let match = null
              for (const c of r.codigos) {
                match = await ariaBuscarCodigoEnMaestro(c)
                if (match) break
              }
              const sapNuevo = ariaSapDeCodigos(r.codigos)
              if (match) {
                matches.push({ fileId: batch[i].fileId, codigoSAP: match.codigoSAP, nombreRepuesto: match.textoBreve || match.descripcion })
                lineas.push(`${i + 1}. **${match.textoBreve || match.descripcion}** — SAP \`${match.codigoSAP}\``)
              } else if (sapNuevo) {
                lineas.push(`${i + 1}. ${r.descripcion} — SAP \`${sapNuevo}\` (nuevo, no está en el maestro)`)
              } else if (r.codigos.length) {
                lineas.push(`${i + 1}. ${r.descripcion} — código "${r.codigos[0]}" no parece un SAP del maestro`)
              } else {
                lineas.push(`${i + 1}. ${r.descripcion} — sin código visible`)
              }
            }

            await sessionRef.set({ fotoBatch: [] }, { merge: true }) // el lote ya se analizó, que no se mezcle con el próximo

            const hintSinMatch = matches.length < resultados.length
              ? '\n\n📦 Las sin match las podés dar de alta en el maestro: mandá esa foto suelta y decime "créala como repuesto del [equipo]".'
              : ''
            if (matches.length) {
              await ariaSetPending(chatId, { kind: 'adjuntar_fotos_lote', items: matches, at: Date.now() })
              reply = `**Lote de ${resultados.length} fotos:**\n${lineas.join('\n')}\n\n¿Agrego las ${matches.length} que matchearon a sus repuestos? (sí / no)${hintSinMatch}`
            } else {
              reply = `**Lote de ${resultados.length} fotos:**\n${lineas.join('\n')}\n\nNinguna coincidió con un SAP del maestro — no hay nada para adjuntar automáticamente.${hintSinMatch}`
            }
          }
        }
      } catch (err) {
        logger.error('ARIA fotos_lote error', { error: err?.message })
        reply = '❌ No pude procesar el lote de fotos. Probá de nuevo.'
      }
    }
  } else if (route.accion === 'brief') {
    reply = await ariaComponerBrief()
  } else if (route.accion === 'brief_activar' || route.accion === 'brief_desactivar') {
    const activar = route.accion === 'brief_activar'
    await db.collection('telegramAriaSessions').doc(String(chatId))
      .set({ briefDiario: activar }, { merge: true })
    reply = activar
      ? '✅ Listo. Te voy a mandar el brief de Mantención todos los días a las 7:00 AM. Si te aburro, decime "desactiva el brief" nomás 😉'
      : 'Listo, no te mando más el brief automático. Igual me lo podés pedir cuando quieras con "dame el brief".'
  } else if (route.accion === 'charla' && route.respuesta) {
    reply = route.respuesta
  } else {
    let datos = ''
    try {
      switch (route.accion) {
        case 'kpi': datos = await ariaDataKpi(); break
        case 'turno': datos = await ariaDataTurno(); break
        case 'estado': datos = await ariaDataEstado(); break
        case 'sensores': datos = await ariaDataSensores(); break
        case 'equipo': datos = await ariaDataEquipo(route.consulta || userText); break
        case 'repuestos': datos = await ariaDataRepuestos(route.consulta || userText); break
        case 'historial': datos = await ariaDataHistorial(route.consulta || ''); break
        case 'produccion': datos = await ariaDataProduccionVivo(route.consulta || userText); break
        case 'grader': datos = await ariaDataGrader(); break
        case 'gantt': datos = await ariaDataGantt(route.consulta || ''); break
        case 'stockbajo': datos = await ariaDataStockBajo(); break
        case 'solicitudes': datos = await ariaDataSolicitudes(); break
        case 'preventivos': datos = await ariaDataPreventivos(); break
        case 'lagunas': datos = await ariaDataLagunas(); break
        default: datos = ''
      }
    } catch (err) {
      logger.error('ARIA data error', { accion: route.accion, error: err?.message })
      datos = `(error al consultar los datos: ${err?.message})`
    }
    try {
      reply = await ariaGroqChat(
        [
          {
            role: 'system',
            content: `${ARIA_PERSONA}${notasHint}${appBlock}${hechosBlock}\n\nRespondé al usuario usando SOLO estos datos reales de la app ` +
              '(más los HECHOS enseñados si aplican). NO inventes cifras ni nombres. ' +
              'Si los datos NO alcanzan para responder, decí exactamente QUÉ dato falta' +
              (esAdmin
                ? ' y ofrecé aprenderlo: "si me lo decís con \'aprende: ...\' lo guardo para siempre".'
                : ' y sugerí pedirle al admin (Orel) que me enseñe ese dato.') +
              `\n\nDATOS:\n${datos || '(sin datos para esta consulta)'}`,
          },
          ...history,
          { role: 'user', content: userText },
        ],
        { temperature: 0.3, maxTokens: 600 }
      )
    } catch (err) {
      logger.error('ARIA compose error', { error: err?.message })
      reply = datos // degradación elegante: entrego los datos crudos
    }
  }

  reply = String(reply || '').trim() || 'No pude procesar la consulta 😕 Probá de nuevo en un rato.'

  // Registro de lagunas: si ARIA quedó corta, la pregunta se guarda en ariaGaps
  // para revisarla ("qué no has sabido responder?") y enseñarle el dato que falta.
  const ACCIONES_SIN_LAGUNA = new Set(['confirmar', 'cancelar', 'aprender', 'lagunas', 'recordar', 'olvidar',
    'brief', 'brief_activar', 'brief_desactivar', 'alertas_activar', 'alertas_desactivar'])
  if (!ACCIONES_SIN_LAGUNA.has(route.accion) &&
      /(no encontr|no tengo|no hay (datos|registros|informaci)|sin datos|no cuento con|no s[eé]\b|no dispon)/i.test(reply)) {
    ariaLogLaguna(chatId, userText, route.accion, reply)
  }

  await sendTelegramMessage(ariaFormatTelegram(reply), chatId, { topicId })
  await ariaSaveTurns(chatId, userText, reply)
  return reply
}

// ==================== MENÚ INTERACTIVO (INLINE KEYBOARDS) ====================

const PWA_URL  = 'https://orelcain.github.io/mantenimiento-planta/'
const MANT_URL = 'https://orelcain.github.io/mantenimiento-planta/mant.html'

/**
 * /menu — Menú principal con botones interactivos
 */
/**
 * Mensaje "banner" pineable: 1 botón web_app grande para abrir la Mini App
 * desde dentro de un grupo. Reemplaza al Menu Button del bot que solo funciona
 * en chats privados — un admin del grupo pinea este mensaje y queda fijo arriba.
 */
/**
 * /start — disparado automáticamente por Telegram cuando un usuario abre el
 * bot por primera vez (en privado o desde un Direct Link). En grupos también
 * se invoca al agregar el bot. Damos bienvenida + atajo para abrir la app.
 */
async function tgHandleStart(chatId, fromName, chatType, topicId) {
  const isPrivate = chatType === 'private'
  const greeting = fromName ? `¡Hola, ${fromName}! 👋` : '¡Hola! 👋'
  const text = isPrivate
    ? `${greeting}\n\nSoy el bot de mantenimiento de planta Antarfood. Tocá el botón para abrir el catálogo (repuestos, insumos, manuales, conteos).`
    : `${greeting}\n\nSoy el bot de mantenimiento. En este grupo, un admin debe usar /autorizar y luego /abrir para postear el banner con la app.`
  const buttons = isPrivate
    ? [[{ text: '📦 Abrir Mantenimiento', url: 'https://t.me/antarfood_mant_bot/repuestos' }]]
    : null
  if (buttons) {
    await sendTelegramButtons(text, chatId, buttons, { topicId })
  } else {
    await sendTelegramMessage(text, chatId, { topicId })
  }
}

async function tgHandleAbrir(chatId, chatType, telegramUserId, topicId) {
  // En grupos, restringir a creator/administrator. En privados cualquier
  // usuario puede invocarlo (chat 1:1 con el bot ya implica intencionalidad).
  if (chatType !== 'private') {
    let isAdmin = false
    try {
      const memberResult = await callTelegramApi('getChatMember', { chat_id: chatId, user_id: telegramUserId })
      if (memberResult?.ok) {
        const status = memberResult.result?.status
        isAdmin = (status === 'creator' || status === 'administrator')
      }
    } catch (e) { logger.warn('getChatMember failed in /abrir', e) }
    if (!isAdmin) {
      // Silencio: el comando no aparece en el autocomplete para no-admins, así
      // que llegar acá implica que tiparon manualmente. No respondemos para no
      // hacer ruido en el grupo.
      logger.info('Silent ignore /abrir from non-admin', { chatId, telegramUserId })
      return
    }
  }
  // Usamos Direct Link `t.me/<bot>/<app>` en lugar de `web_app:{url}`. Razón:
  // los botones `web_app` en `inline_keyboard` son rechazados por Telegram en
  // grupos cuando el URL no coincide exactamente con el dominio configurado
  // por BotFather. El Direct Link a la Mini App registrada (/newapp en
  // BotFather → short_name "repuestos") funciona universalmente: abre la
  // Mini App nativa dentro de Telegram sin redirect externo.
  const buttons = [
    [{ text: '📦 Abrir Mantenimiento', url: 'https://t.me/antarfood_mant_bot/repuestos' }],
  ]
  const text = '🏭 <b>Mantenimiento Antarfood</b>\n\n' +
    'Tocá el botón para abrir el catálogo (repuestos, insumos, manuales, conteos).\n\n' +
    '<i>💡 Tip: pineá este mensaje para tenerlo siempre a mano.</i>'
  await sendTelegramButtons(text, chatId, buttons, { topicId })
}

/** Devuelve el chat ID al usuario (helper de onboarding para autorizar grupos nuevos). */
async function tgHandleChatId(chatId, chatTitle, chatType, topicId) {
  await sendTelegramMessage(
    `🆔 <b>Chat info</b>\n\n` +
    `<b>ID:</b> <code>${chatId}</code>\n` +
    `<b>Tipo:</b> ${chatType || 'desconocido'}\n` +
    (chatTitle ? `<b>Nombre:</b> ${chatTitle}\n` : '') +
    `\nUn admin puede autorizar este chat con /autorizar (solo creador del grupo).`,
    chatId, { topicId }
  )
}

/**
 * Auto-agrega el chat actual a `telegramAuthorizedChats` si quien invoca es
 * creator/admin del grupo. Onboarding self-service para evitar tener que
 * editar Firestore manualmente.
 */
async function tgHandleAutorizar(chatId, chatTitle, chatType, telegramUserId, topicId) {
  // En chats privados no tiene sentido (siempre autorizados)
  if (chatType === 'private') {
    await sendTelegramMessage('✅ Los chats privados ya están siempre autorizados.', chatId, { topicId })
    return
  }
  // Verificar que el invocador sea creator/admin del grupo
  let isAdmin = false
  try {
    const memberResult = await callTelegramApi('getChatMember', { chat_id: chatId, user_id: telegramUserId })
    if (memberResult?.ok) {
      const status = memberResult.result?.status
      isAdmin = (status === 'creator' || status === 'administrator')
    }
  } catch (e) { logger.warn('getChatMember failed', e) }
  if (!isAdmin) {
    await sendTelegramMessage('❌ Solo el creador o administradores del grupo pueden autorizarlo.', chatId, { topicId })
    return
  }
  // Persistir
  try {
    await db.collection('telegramAuthorizedChats').doc(String(chatId)).set({
      activo: true,
      title: chatTitle || null,
      type: chatType || null,
      authorizedBy: String(telegramUserId),
      authorizedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    await sendTelegramMessage(
      `✅ <b>Chat autorizado</b>\n\n` +
      `Ya podés usar todos los comandos del bot acá.\n` +
      `Probá /abrir para postear el banner pineable.`,
      chatId, { topicId }
    )
  } catch (e) {
    logger.error('Error authorizing chat', e)
    await sendTelegramMessage('❌ Error al autorizar. Revisá los logs.', chatId, { topicId })
  }
}

async function tgHandleMenu(chatId, topicId) {
  const buttons = [
    [
      { text: '⭐ Acceso Rápido', callback_data: 'fav:list' },
      { text: '🔧 Equipos', callback_data: 'eq:list' },
    ],
    [
      { text: '🏭 Máquinas', callback_data: 'maq:list' },
      { text: '📋 Incidencias', callback_data: 'inc:list' },
    ],
    [
      { text: '📊 Turno', callback_data: 'cmd:turno' },
      { text: '📈 KPIs', callback_data: 'cmd:kpi' },
      { text: '📡 Sensores', callback_data: 'cmd:sensores' },
    ],
    [
      { text: '🔩 Repuestos', url: 'https://t.me/antarfood_mant_bot/repuestos' },
    ],
    [
      { text: '🌐 Abrir App Completa', url: PWA_URL },
    ],
  ]
  await sendTelegramButtons(
    '🏭 <b>Menú Mantenimiento</b>\n\nElegí una opción:',
    chatId, buttons, { topicId }
  )
}

/**
 * Handler principal de callback queries (botones inline).
 */
async function tgHandleCallback(chatId, messageId, data, topicId) {
  const [action, ...params] = data.split(':')

  switch (action) {
    case 'menu':
      return cbMenu(chatId, messageId)
    case 'eq':
      return cbEquipo(chatId, messageId, params)
    case 'maq':
      return cbMaquina(chatId, messageId, params)
    case 'rep':
      return cbRepuesto(chatId, messageId, params, topicId)
    case 'fav':
      return cbFavoritos(chatId, messageId, params)
    case 'inc':
      return cbIncidencias(chatId, messageId, params)
    case 'cmd':
      return cbComando(chatId, messageId, params, topicId)
    case 'photo':
      return cbFoto(chatId, messageId, params, topicId)
    default:
      return editTelegramMessage(chatId, messageId, '❓ Acción no reconocida.', [[{ text: '← Menú', callback_data: 'menu' }]])
  }
}

// ---- Callback: Menú principal ----
async function cbMenu(chatId, messageId) {
  const buttons = [
    [
      { text: '⭐ Acceso Rápido', callback_data: 'fav:list' },
      { text: '🔧 Equipos', callback_data: 'eq:list' },
    ],
    [
      { text: '🏭 Máquinas', callback_data: 'maq:list' },
      { text: '📋 Incidencias', callback_data: 'inc:list' },
    ],
    [
      { text: '📊 Turno', callback_data: 'cmd:turno' },
      { text: '📈 KPIs', callback_data: 'cmd:kpi' },
      { text: '📡 Sensores', callback_data: 'cmd:sensores' },
    ],
    [
      { text: '🌐 Abrir App Completa', url: PWA_URL },
    ],
  ]
  return editTelegramMessage(chatId, messageId,
    '🏭 <b>Menú Mantenimiento</b>\n\nElegí una opción:', buttons)
}

// ---- Callback: Equipos ----
async function cbEquipo(chatId, messageId, params) {
  const sub = params[0]

  if (sub === 'list') {
    const snapshot = await db.collection('equipment').orderBy('nombre').limit(12).get()
    if (snapshot.empty) {
      return editTelegramMessage(chatId, messageId, '📭 No hay equipos registrados.',
        [[{ text: '← Menú', callback_data: 'menu' }]])
    }
    const buttons = []
    const docs = snapshot.docs
    for (let i = 0; i < docs.length; i += 2) {
      const row = []
      row.push({ text: `${docs[i].data().nombre || docs[i].id}`, callback_data: `eq:d:${docs[i].id}` })
      if (docs[i + 1]) {
        row.push({ text: `${docs[i + 1].data().nombre || docs[i + 1].id}`, callback_data: `eq:d:${docs[i + 1].id}` })
      }
      buttons.push(row)
    }
    buttons.push([{ text: '← Menú', callback_data: 'menu' }])
    return editTelegramMessage(chatId, messageId, '<b>🔧 Equipos</b>\n\nSeleccioná uno:', buttons)
  }

  if (sub === 'd') {
    const eqId = params.slice(1).join(':')
    const docSnap = await db.collection('equipment').doc(eqId).get()
    if (!docSnap.exists) {
      return editTelegramMessage(chatId, messageId, '❌ Equipo no encontrado.',
        [[{ text: '← Equipos', callback_data: 'eq:list' }]])
    }
    const d = docSnap.data()
    const estado = d.estado === 'operativo' ? '🟢 Operativo' : d.estado === 'en_mantenimiento' ? '🟡 En mantenimiento' : '🔴 Fuera de servicio'
    let msg = `<b>🔧 ${d.nombre || 'Sin nombre'}</b>\n\n`
    if (d.codigo) msg += `📌 Código: ${d.codigo}\n`
    msg += `📍 Estado: ${estado}\n`
    msg += `⚡ Criticidad: ${d.criticidad || 'N/A'}\n`
    if (d.marca) msg += `🏭 Marca: ${d.marca}\n`
    if (d.modelo) msg += `📋 Modelo: ${d.modelo}\n`
    if (d.hierarchyPath) msg += `📂 ${d.hierarchyPath}\n`

    const buttons = [
      [{ text: '← Equipos', callback_data: 'eq:list' }, { text: '← Menú', callback_data: 'menu' }],
    ]
    return editTelegramMessage(chatId, messageId, msg, buttons)
  }
}

// ---- Callback: Máquinas ----
async function cbMaquina(chatId, messageId, params) {
  const sub = params[0]

  if (sub === 'list') {
    let snapshot
    try {
      snapshot = await db.collection('machines').where('activa', '==', true).orderBy('orden').get()
    } catch (_) {
      // Fallback si el índice compuesto no existe aún
      snapshot = await db.collection('machines').where('activa', '==', true).get()
    }
    if (snapshot.empty) {
      return editTelegramMessage(chatId, messageId, '📭 No hay máquinas registradas.',
        [[{ text: '← Menú', callback_data: 'menu' }]])
    }
    const buttons = []
    snapshot.docs.forEach((doc) => {
      buttons.push([{ text: `🏭 ${doc.data().nombre}`, callback_data: `maq:rep:${doc.id}` }])
    })
    buttons.push([{ text: '← Menú', callback_data: 'menu' }])
    return editTelegramMessage(chatId, messageId, '<b>🏭 Máquinas</b>\n\nElegí una para ver repuestos:', buttons)
  }

  if (sub === 'rep') {
    const machineId = params.slice(1).join(':')
    const machineDoc = await db.collection('machines').doc(machineId).get()
    const machineName = machineDoc.exists ? machineDoc.data().nombre : machineId

    const repSnap = await db.collection(`machines/${machineId}/repuestos`).orderBy('codigoSAP').limit(15).get()
    if (repSnap.empty) {
      return editTelegramMessage(chatId, messageId, `📭 <b>${machineName}</b> no tiene repuestos.`,
        [[{ text: '← Máquinas', callback_data: 'maq:list' }]])
    }
    const buttons = []
    repSnap.docs.forEach((doc) => {
      const r = doc.data()
      const label = `${r.codigoSAP || '—'} ${(r.textoBreve || r.descripcion || '').substring(0, 30)}`
      buttons.push([{ text: label, callback_data: `rep:d:${machineId}:${doc.id}` }])
    })
    buttons.push([{ text: '← Máquinas', callback_data: 'maq:list' }, { text: '← Menú', callback_data: 'menu' }])
    return editTelegramMessage(chatId, messageId,
      `<b>🔩 Repuestos — ${machineName}</b> (${repSnap.size})\n\nElegí uno:`, buttons)
  }
}

// ---- Callback: Repuesto detalle + foto ----
async function cbRepuesto(chatId, messageId, params, topicId) {
  const sub = params[0]

  if (sub === 'd') {
    const machineId = params[1]
    const repId = params.slice(2).join(':')
    const repDoc = await db.collection(`machines/${machineId}/repuestos`).doc(repId).get()
    if (!repDoc.exists) {
      return editTelegramMessage(chatId, messageId, '❌ Repuesto no encontrado.',
        [[{ text: '← Máquinas', callback_data: 'maq:list' }]])
    }
    const r = repDoc.data()
    const repTopicId = getTopicId('repuestos') || topicId
    let msg = `<b>🔩 ${r.textoBreve || r.descripcion || 'Sin nombre'}</b>\n\n`
    if (r.codigoSAP) msg += `📌 SAP: <code>${r.codigoSAP}</code>\n`
    if (r.codigoFabricante) msg += `🏭 Fabricante: ${r.codigoFabricante}\n`
    if (r.cantidadPorMaquina) msg += `📦 Cantidad/máquina: ${r.cantidadPorMaquina}\n`
    if (r.valorUnitario) msg += `💰 Valor: $${r.valorUnitario.toLocaleString()}\n`
    if (r.ubicacionEnPlanta) msg += `📍 Ubicación: ${r.ubicacionEnPlanta}\n`
    if (r.tipo) msg += `🏷️ Tipo: ${r.tipo}\n`
    if (r.observaciones) msg += `📝 ${r.observaciones}\n`

    const buttons = []
    // Botón de foto si tiene imágenes
    const hasPhotos = (r.fotosReales && r.fotosReales.length > 0) || (r.imagenesManual && r.imagenesManual.length > 0)
    if (hasPhotos) {
      buttons.push([{ text: '📸 Ver foto', callback_data: `rep:f:${machineId}:${repId}` }])
    }
    buttons.push([
      { text: '← Repuestos', callback_data: `maq:rep:${machineId}` },
      { text: '← Menú', callback_data: 'menu' },
    ])
    return editTelegramMessage(chatId, messageId, msg, buttons)
  }

  if (sub === 'f') {
    const machineId = params[1]
    const repId = params.slice(2).join(':')
    const repDoc = await db.collection(`machines/${machineId}/repuestos`).doc(repId).get()
    if (!repDoc.exists) return

    const r = repDoc.data()
    const repTopicId = getTopicId('repuestos') || topicId
    // Priorizar fotos reales, luego manual
    const photos = [...(r.fotosReales || []), ...(r.imagenesManual || [])]
    if (photos.length === 0) return

    const photo = photos[0]
    const caption = `📸 <b>${r.textoBreve || r.descripcion || ''}</b>\nSAP: ${r.codigoSAP || '—'}`
    const buttons = [[
      { text: '← Detalle', callback_data: `rep:d:${machineId}:${repId}` },
      { text: '← Menú', callback_data: 'menu' },
    ]]
    // Enviar foto como mensaje nuevo (no se puede editar a foto)
    return sendTelegramPhoto(chatId, photo.url, caption, buttons, { topicId: repTopicId })
  }
}

// ---- Callback: Acceso Rápido (máquinas activas como favoritos globales) ----
async function cbFavoritos(chatId, messageId, params) {
  const sub = params[0]

  if (sub === 'list') {
    // Mostrar máquinas activas como acceso rápido
    let snapshot
    try {
      snapshot = await db.collection('machines').where('activa', '==', true).orderBy('orden').get()
    } catch (_) {
      snapshot = await db.collection('machines').where('activa', '==', true).get()
    }
    if (snapshot.empty) {
      return editTelegramMessage(chatId, messageId, '📭 No hay máquinas configuradas.',
        [[{ text: '← Menú', callback_data: 'menu' }]])
    }
    const buttons = []
    snapshot.docs.forEach((doc) => {
      buttons.push([{ text: `⭐ ${doc.data().nombre}`, callback_data: `fav:maq:${doc.id}` }])
    })
    buttons.push([{ text: '← Menú', callback_data: 'menu' }])
    return editTelegramMessage(chatId, messageId,
      '<b>⭐ Acceso Rápido</b>\n\nMáquinas activas — elegí una:', buttons)
  }

  if (sub === 'maq') {
    const machineId = params.slice(1).join(':')
    const machineDoc = await db.collection('machines').doc(machineId).get()
    const machineName = machineDoc.exists ? machineDoc.data().nombre : machineId

    const buttons = [
      [{ text: '🔩 Repuestos', callback_data: `maq:rep:${machineId}` }],
      [{ text: '📋 Info', callback_data: `fav:info:${machineId}` }],
      [{ text: '← Acceso Rápido', callback_data: 'fav:list' }, { text: '← Menú', callback_data: 'menu' }],
    ]
    return editTelegramMessage(chatId, messageId,
      `<b>⭐ ${machineName}</b>\n\n¿Qué querés ver?`, buttons)
  }

  if (sub === 'info') {
    const machineId = params.slice(1).join(':')
    const machineDoc = await db.collection('machines').doc(machineId).get()
    if (!machineDoc.exists) {
      return editTelegramMessage(chatId, messageId, '❌ Máquina no encontrada.',
        [[{ text: '← Menú', callback_data: 'menu' }]])
    }
    const m = machineDoc.data()
    let msg = `<b>🏭 ${m.nombre}</b>\n\n`
    if (m.marca) msg += `🏭 Marca: ${m.marca}\n`
    if (m.modelo) msg += `📋 Modelo: ${m.modelo}\n`
    if (m.descripcion) msg += `📝 ${m.descripcion}\n`
    if (m.hierarchyPath) msg += `📂 ${m.hierarchyPath}\n`

    const buttons = [
      [{ text: '🔩 Repuestos', callback_data: `maq:rep:${machineId}` }],
      [{ text: '← Acceso Rápido', callback_data: 'fav:list' }, { text: '← Menú', callback_data: 'menu' }],
    ]
    return editTelegramMessage(chatId, messageId, msg, buttons)
  }
}

// ---- Callback: Incidencias ----
async function cbIncidencias(chatId, messageId, params) {
  const sub = params[0]

  if (sub === 'list') {
    const snapshot = await db.collection('incidents')
      .where('status', 'in', ['pendiente', 'confirmada', 'en_proceso'])
      .orderBy('createdAt', 'desc').limit(8).get()

    if (snapshot.empty) {
      return editTelegramMessage(chatId, messageId, '✅ No hay incidencias activas.',
        [[{ text: '← Menú', callback_data: 'menu' }]])
    }

    const statusLabel = { pendiente: 'Pend', confirmada: 'Conf', en_proceso: 'EnProc' }
    let msg = '<b>📋 Incidencias activas</b>\n\n'
    snapshot.forEach((docSnap) => {
      const d = docSnap.data()
      const emoji = PRIORITY_EMOJI[d.prioridad] || '📋'
      msg += `${emoji} <b>${(d.titulo || 'Sin título').substring(0, 40)}</b>\n`
      msg += `   ${statusLabel[d.status] || d.status} · ${d.prioridad}\n\n`
    })

    return editTelegramMessage(chatId, messageId, msg,
      [[{ text: '← Menú', callback_data: 'menu' }]])
  }
}

// ---- Callback: Comandos directos (turno, kpi) ----
async function cbComando(chatId, messageId, params, topicId) {
  const cmd = params[0]
  // Estos comandos generan contenido largo, mejor como mensaje nuevo
  if (cmd === 'turno') {
    await tgHandleTurno(chatId, topicId)
  } else if (cmd === 'kpi') {
    await tgHandleKpi(chatId, topicId)
  } else if (cmd === 'sensores') {
    await tgHandleSensores(chatId, topicId)
  }
}

/**
 * Webhook de Telegram — recibe mensajes/comandos del bot.
 * Registrar con: GET /setTelegramWebhook (una sola vez tras deploy)
 */
exports.telegramWebhook = onRequest(
  { region: 'us-central1', secrets: ['GROQ_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY'], timeoutSeconds: 120 },
  async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  // Anti-spoofing: exige que el header secret_token coincida (Telegram lo
  // envía cuando se registró setWebhook con secret_token — ya registrado en
  // prod, verificado 2026-07-05). FAIL-CLOSED: si el env TELEGRAM_WEBHOOK_SECRET
  // se perdiera en un deploy (ej. FUNCTIONS_ENV mal escrito), el webhook debe
  // rechazar TODO en vez de quedar abierto en silencio.
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!webhookSecret) {
    logger.error('telegramWebhook: TELEGRAM_WEBHOOK_SECRET no configurado — rechazando por seguridad (fail-closed)')
    res.status(503).send('webhook not configured')
    return
  }
  if (req.get('X-Telegram-Bot-Api-Secret-Token') !== webhookSecret) {
    logger.warn('telegramWebhook: secret_token inválido o ausente — rechazado')
    res.status(401).send('unauthorized')
    return
  }

  const update = req.body

  // ---- Callback queries (botones inline) ----
  const callbackQuery = update?.callback_query
  if (callbackQuery) {
    const cbChatId = String(callbackQuery.message?.chat?.id)
    const cbMessageId = callbackQuery.message?.message_id
    const cbData = callbackQuery.data || ''
    const cbTopicId = callbackQuery.message?.message_thread_id || undefined

    try {
      await tgHandleCallback(cbChatId, cbMessageId, cbData, cbTopicId)
    } catch (error) {
      logger.error('Error handling Telegram callback', error)
    }
    await answerCallbackQuery(callbackQuery.id)
    res.status(200).send('ok')
    return
  }

  // ---- Mensajes de texto / comandos / fotos ----
  const message = update?.message || update?.edited_message

  if (!message) {
    res.status(200).send('ok')
    return
  }

  const chatId = String(message.chat?.id)
  const chatType = message.chat?.type   // 'private' | 'group' | 'supergroup' | 'channel'
  const chatTitle = message.chat?.title || message.chat?.username || null
  const fromName = message.from?.first_name || 'Técnico'
  const telegramUserId = String(message.from?.id || 'unknown')
  const incomingTopicId = message.message_thread_id || undefined
  const rawText = (message.text || '').trim()

  // Verificar chat autorizado:
  //   1. /chatid y /autorizar → siempre permitidos (helpers de onboarding)
  //   2. Chat privado con el bot → siempre autorizado
  //   3. Chat en env TELEGRAM_CHAT_ID → autorizado (compat)
  //   4. Chat en whitelist Firestore `telegramAuthorizedChats` con activo:true → autorizado
  const isOnboardingCmd = /^\/(chatid|autorizar)\b/i.test(rawText)
  let authorized = isOnboardingCmd || chatType === 'private'
  if (!authorized) {
    const allowedChatId = process.env.TELEGRAM_CHAT_ID
    if (allowedChatId && chatId === allowedChatId) authorized = true
  }
  if (!authorized) {
    try {
      const chatDoc = await db.collection('telegramAuthorizedChats').doc(chatId).get()
      if (chatDoc.exists && chatDoc.data().activo !== false) authorized = true
    } catch (e) { logger.warn('Error checking chat whitelist', { chatId, error: e?.message }) }
  }
  if (!authorized) {
    logger.warn('Telegram message from unauthorized chat', { chatId, chatType, chatTitle })
    res.status(200).send('ok')
    return
  }

  try {
    // ---- Foto ----
    if (message.photo && message.photo.length > 0) {
      if (chatType === 'private') {
        // Privado → ARIA la mira con visión y propone incidencia (autorizados)
        const authFoto = await ariaUsuarioAutorizado(telegramUserId, fromName, message.from?.username)
        if (authFoto.ok) {
          // Fotos mandadas como álbum (media_group_id) → modo lote, en silencio.
          // Fotos sueltas → flujo instantáneo de siempre (visión + confirmar ya).
          if (message.media_group_id) {
            await ariaQueueFotoLote(chatId, message)
          } else {
            await ariaHandleFoto(chatId, message, fromName, telegramUserId, incomingTopicId, authFoto.rol === 'admin')
          }
        } else {
          await sendTelegramMessage(ARIA_MSG_NO_AUTORIZADO, chatId, {})
        }
      } else {
        // Grupos: flujo clásico foto→adjuntar a incidencia
        await tgHandlePhoto(chatId, message, fromName, telegramUserId, incomingTopicId)
      }
      res.status(200).send('ok')
      return
    }

    // ---- Nota de voz → ARIA (solo chat privado, usuarios autorizados) ----
    if ((message.voice || message.audio) && chatType === 'private') {
      const authVoz = await ariaUsuarioAutorizado(telegramUserId, fromName, message.from?.username)
      if (!authVoz.ok) {
        await sendTelegramMessage(ARIA_MSG_NO_AUTORIZADO, chatId, {})
        res.status(200).send('ok')
        return
      }
      const voiceFileId = message.voice?.file_id || message.audio?.file_id
      const voiceDur = message.voice?.duration || message.audio?.duration || 0
      if (voiceDur > 120) {
        await sendTelegramMessage('🎙️ El audio es muy largo (máx. 2 minutos).', chatId, { topicId: incomingTopicId })
        res.status(200).send('ok')
        return
      }
      try {
        await callTelegramApi('sendChatAction', { chat_id: chatId, action: 'typing' })
        const voiceBuffer = await downloadTelegramFile(voiceFileId)
        const transcript = await ariaTranscribeVoice(voiceBuffer)
        if (!transcript) {
          await sendTelegramMessage('🎙️ No logré entender el audio. Probá de nuevo.', chatId, { topicId: incomingTopicId })
        } else {
          await sendTelegramMessage(`🎙️ <i>«${ariaEscapeHtml(transcript)}»</i>`, chatId, { topicId: incomingTopicId })
          const respuesta = await tgHandleAriaChat(chatId, transcript, fromName, telegramUserId, incomingTopicId, authVoz.rol === 'admin')
          // Voz entra → voz sale: nota de voz de ARIA además del texto
          if (respuesta) {
            try {
              const audio = await ariaTts(respuesta)
              await sendTelegramVoice(chatId, audio, { topicId: incomingTopicId })
            } catch (ttsErr) {
              logger.warn('TTS de respuesta falló (solo texto)', { error: ttsErr?.message })
            }
          }
        }
      } catch (error) {
        logger.error('ARIA voice error', error)
        await sendTelegramMessage('❌ Error procesando el audio. Intentá de nuevo.', chatId, { topicId: incomingTopicId })
      }
      res.status(200).send('ok')
      return
    }

    const text = (message.text || '').trim()
    if (!text) {
      res.status(200).send('ok')
      return
    }

    // ── Switch de comandos ─────────────────────────────────────────────
    // Política UX (2026-05-07): toda la operativa pasa por la Mini App.
    // Solo se exponen 2 comandos públicos:
    //   /abrir       → postea banner pineable con botón a la Mini App
    //   /autorizar   → onboarding (creator/admin del grupo)
    // Helpers internos (no listados en BotFather, accesibles si se conocen):
    //   /chatid      → info del chat (debug)
    //   /start       → bienvenida automática de Telegram al abrir el bot
    // Los handlers legacy (/incidencia, /estado, /equipo, /repuesto, /turno,
    // /kpi, /sensores, /ayuda, /menu) quedan en el código pero desconectados;
    // están listos por si en el futuro queremos volver a exponerlos.
    if (/^\/start/i.test(text)) {
      await tgHandleStart(chatId, fromName, chatType, incomingTopicId)
    } else if (/^\/(abrir|app)/i.test(text)) {
      await tgHandleAbrir(chatId, chatType, telegramUserId, incomingTopicId)
    } else if (/^\/autorizar/i.test(text)) {
      await tgHandleAutorizar(chatId, chatTitle, chatType, telegramUserId, incomingTopicId)
    } else if (/^\/chatid/i.test(text)) {
      await tgHandleChatId(chatId, chatTitle, chatType, incomingTopicId)
    } else if (text.startsWith('/')) {
      // Cualquier otro comando: silencio en grupos, respuesta breve en privados
      if (chatType === 'private') {
        await sendTelegramMessage('Usá /abrir para abrir el catálogo.', chatId, { topicId: incomingTopicId })
      }
    } else if (chatType === 'private') {
      // Texto libre en privado → ARIA (chat natural, solo usuarios autorizados)
      const authTexto = await ariaUsuarioAutorizado(telegramUserId, fromName, message.from?.username)
      if (authTexto.ok) {
        await tgHandleAriaChat(chatId, text, fromName, telegramUserId, incomingTopicId, authTexto.rol === 'admin')
      } else {
        await sendTelegramMessage(ARIA_MSG_NO_AUTORIZADO, chatId, { topicId: incomingTopicId })
      }
    }
  } catch (error) {
    logger.error('Error handling Telegram command', error)
    await sendTelegramMessage('❌ Error procesando el comando. Intentá de nuevo.', chatId, { topicId: incomingTopicId })
  }

  res.status(200).send('ok')
})

/**
 * Alerta automática en Telegram cuando el P0% de un turno Grader supera el umbral.
 * Umbral configurable via env GRADER_P0_ALERT_PCT (default 15%).
 * Mínimo de piezas via env GRADER_MIN_PIECES (default 500).
 */
exports.onGraderSummaryCreated = onDocumentCreated('graderDailySummaries/{summaryId}', async (event) => {
  const data = event.data?.data()
  if (!data) return

  const threshold = parseFloat(process.env.GRADER_P0_ALERT_PCT || '15')
  const minPieces = parseInt(process.env.GRADER_MIN_PIECES || '500')

  const p0Pct = data.p0Pct || 0
  const totalPieces = data.totalPieces || 0

  if (p0Pct < threshold || totalPieces < minPieces) return

  const shiftLabel = data.shiftId === 'A' ? 'Turno Día ☀️' : data.shiftId === 'B' ? 'Turno Noche 🌙' : (data.shiftId || '')
  const dateStr = data.sessionDate || event.params.summaryId.split('__')[0] || ''

  let msg = `⚠️ <b>Alerta Grader — P0% elevado</b>\n\n`
  msg += `📅 ${dateStr} · ${shiftLabel}\n`
  msg += `📊 P0%: <b>${p0Pct.toFixed(1)}%</b> (umbral: ${threshold}%)\n`
  msg += `📦 Total: ${totalPieces.toLocaleString('es-CL')} piezas\n`
  msg += `🔴 P0: ${(data.p0Pieces || 0).toLocaleString('es-CL')} piezas\n`

  if (Array.isArray(data.topP0Causes) && data.topP0Causes.length > 0) {
    msg += '\n<b>Causas principales:</b>\n'
    data.topP0Causes.slice(0, 3).forEach((cause) => {
      if (cause && cause.cause) msg += `  • ${cause.cause}: <b>${cause.count || 0}</b>\n`
    })
  }

  msg += '\n💡 Abrí la app para ver el análisis completo.'

  const generalTopicId = getTopicId('general')
  await sendTelegramMessage(msg, null, { topicId: generalTopicId })
})

/**
 * Registra el webhook de Telegram. Llamar UNA SOLA VEZ tras el deploy:
 * GET https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/setTelegramWebhook
 */
exports.setTelegramWebhook = onRequest({ region: 'us-central1' }, async (req, res) => {
  if (!requireAdminKey(req, res)) return
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN no configurado' })
    return
  }

  const webhookUrl =
    'https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/telegramWebhook'

  // Registrar secret_token: Telegram lo reenviará en cada update como header
  // X-Telegram-Bot-Api-Secret-Token, y telegramWebhook lo valida (anti-spoofing).
  const webhookBody = { url: webhookUrl }
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (webhookSecret) webhookBody.secret_token = webhookSecret

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookBody),
    })
    const result = await response.json()
    res.json({ webhookUrl, secretTokenSet: Boolean(webhookSecret), telegram: result })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * Registra/limpia los comandos del bot en BotFather (autocomplete del input).
 * Política UX (2026-05-07): comandos invisibles para miembros comunes.
 *
 * Por scope:
 *   - default                      → vacío (cuando no aplica otro scope más
 *                                     específico, no se muestra nada)
 *   - all_private_chats            → [/abrir]  (cualquier usuario en privado
 *                                     con el bot puede abrir la app)
 *   - all_group_chats              → vacío    (miembros comunes en grupos NO
 *                                     ven nada al escribir "/")
 *   - all_chat_administrators      → [/abrir, /autorizar]  (admins/creators
 *                                     de grupos sí ven los comandos)
 *
 * La restricción de ejecución (no autocompletado) se valida adicionalmente
 * en cada handler con getChatMember.
 *
 * GET /setBotCommands — ejecutar una sola vez tras deploy. Idempotente.
 */
exports.setBotCommands = onRequest({ region: 'us-central1' }, async (req, res) => {
  if (!requireAdminKey(req, res)) return
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN no configurado' })
    return
  }
  const cmdAbrir     = { command: 'abrir',     description: 'Abrir el catálogo (banner pineable)' }
  const cmdAutorizar = { command: 'autorizar', description: 'Autorizar este chat para usar el bot' }
  const plan = [
    { scope: { type: 'default' },                  commands: [] },
    { scope: { type: 'all_private_chats' },        commands: [cmdAbrir] },
    { scope: { type: 'all_group_chats' },          commands: [] },
    { scope: { type: 'all_chat_administrators' },  commands: [cmdAbrir, cmdAutorizar] },
  ]
  const results = []
  try {
    for (const { scope, commands } of plan) {
      const r = await callTelegramApi('setMyCommands', { commands, scope })
      results.push({ scope: scope.type, commandCount: commands.length, ok: r?.ok === true, result: r })
    }
    res.json({ plan, results })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * Crea los Forum Topics en el grupo y guarda los IDs en Firestore (colección config).
 * GET /setupTelegramTopics — ejecutar UNA VEZ después de habilitar Temas en el grupo.
 * Pre-req: el grupo debe tener "Temas" habilitados y el bot debe ser admin.
 */
exports.setupTelegramTopics = onRequest({ region: 'us-central1' }, async (req, res) => {
  if (!requireAdminKey(req, res)) return
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados' })
    return
  }

  const topicsToCreate = [
    { name: '🔴 Incidencias', icon_color: 0xFF0000, key: 'incidencias' },
    { name: '🔩 Repuestos', icon_color: 0x6FB9F0, key: 'repuestos' },
    { name: '🔧 Equipos', icon_color: 0xFFD67E, key: 'equipos' },
  ]

  const created = {}

  for (const topic of topicsToCreate) {
    try {
      const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/createForumTopic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          name: topic.name,
          icon_color: topic.icon_color,
        }),
      })
      const result = await response.json()
      if (result.ok) {
        created[topic.key] = result.result.message_thread_id
      } else {
        created[topic.key] = { error: result.description }
      }
    } catch (error) {
      created[topic.key] = { error: error.message }
    }
  }

  // Guardar IDs en Firestore para referencia
  await db.collection('config').doc('telegram_topics').set({
    topics: created,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  // Instrucciones para el .env
  const envLines = Object.entries(created)
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `TELEGRAM_TOPIC_${k.toUpperCase()}=${v}`)

  res.json({
    created,
    instructions: 'Agregá estas líneas a functions/.env y re-deployer:',
    envLines,
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM MINI APP — Repuestos (mant.html)
// Valida initData HMAC, emite Firebase Custom Token, mapea rol del grupo.
//
// Setup inicial: crear doc en Firestore telegramAuthorizedChats/{chatId}
//   { nombre: 'Grupo Mantenimiento', activo: true }
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /mintTelegramAuthToken
 * Body: { initData: string }  (raw Telegram WebApp.initData)
 * Returns: { token, uid, role, authorized, firstName }
 *   role: 'tecnico' | 'usuario'
 *   authorized: chat está en la whitelist de telegramAuthorizedChats
 */
exports.mintTelegramAuthToken = onRequest({ region: 'us-central1' }, async (req, res) => {
  // CORS — Mini App corre en WebView de Telegram (origin varía)
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).send(''); return }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return }

  const { initData } = req.body || {}
  if (!initData) { res.status(400).json({ error: 'initData requerido' }); return }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) { res.status(500).json({ error: 'Bot token no configurado' }); return }

  // 1. Validar HMAC-SHA256 (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
  const urlParams = new URLSearchParams(initData)
  const hash = urlParams.get('hash')
  if (!hash) { res.status(401).json({ error: 'Hash faltante' }); return }
  urlParams.delete('hash')

  const checkString = Array.from(urlParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHash = createHmac('sha256', secretKey).update(checkString).digest('hex')

  // Comparación en tiempo constante (timingSafeEqual exige longitudes iguales,
  // así que un hash malformado se rechaza antes). No loggear los valores: el
  // esperado se deriva del bot token y filtrarlo en logs regala material de
  // ataque; con el prefijo del checkString basta para depurar.
  const expectedBuf = Buffer.from(expectedHash, 'utf8')
  const gotBuf = Buffer.from(String(hash), 'utf8')
  if (expectedBuf.length !== gotBuf.length || !timingSafeEqual(expectedBuf, gotBuf)) {
    logger.warn('mintTelegramAuthToken: HMAC inválido', { checkStringPreview: checkString.slice(0, 80) })
    res.status(401).json({ error: 'Datos de autenticación inválidos' })
    return
  }

  // 2. Verificar antigüedad (máx 24h)
  const authDate = parseInt(urlParams.get('auth_date') || '0', 10)
  if (Math.floor(Date.now() / 1000) - authDate > 86400) {
    res.status(401).json({ error: 'Sesión expirada, reabrir la app' })
    return
  }

  // 3. Parsear usuario Telegram
  let tgUser
  try { tgUser = JSON.parse(urlParams.get('user') || '{}') } catch {
    res.status(400).json({ error: 'Datos de usuario inválidos' }); return
  }
  if (!tgUser.id) { res.status(400).json({ error: 'user.id faltante' }); return }

  // 4. Determinar chatId: del campo 'chat' en initData, o fallback al env
  let chatId = process.env.TELEGRAM_CHAT_ID
  try {
    const chatData = urlParams.get('chat')
    if (chatData) chatId = JSON.parse(chatData).id
  } catch { /* usar fallback */ }

  // 5. Verificar whitelist de chats autorizados
  let authorized = false
  let role = 'usuario'

  if (chatId) {
    const chatDoc = await db.collection('telegramAuthorizedChats').doc(String(chatId)).get()
    if (chatDoc.exists && chatDoc.data().activo !== false) {
      authorized = true
      // Verificar rol del usuario en el grupo
      const memberResult = await callTelegramApi('getChatMember', {
        chat_id: chatId,
        user_id: tgUser.id,
      })
      if (memberResult?.ok) {
        const status = memberResult.result?.status
        role = (status === 'creator' || status === 'administrator') ? 'tecnico' : 'usuario'
      }
    }
  }

  // 6. Linkeo: ¿hay un usuario PWA existente con telegramId == tgUser.id?
  //    Si sí → autenticamos como ESE uid (tu cuenta PWA real, hereda favoritos/listas).
  //    Si no → fallback a uid virtual `tg_<id>`.
  const tgIdStr = String(tgUser.id)
  let resolvedUid = `tg_${tgUser.id}`
  let isLinked = false

  try {
    const linkSnap = await db.collection('users')
      .where('telegramId', '==', tgIdStr)
      .limit(1)
      .get()
    if (!linkSnap.empty) {
      const linkedDoc = linkSnap.docs[0]
      const linkedData = linkedDoc.data()
      // Solo linkear si el usuario PWA está activo
      if (linkedData.activo !== false) {
        resolvedUid = linkedDoc.id
        isLinked = true
        // Si el doc PWA tiene rol más alto, respetarlo (admin/supervisor/tecnico)
        // Si rol es 'usuario' y el grupo TG lo hace 'tecnico', upgradear
        const pwaRol = linkedData.rol
        if (pwaRol && ['admin', 'supervisor', 'tecnico'].includes(pwaRol)) {
          role = pwaRol
        }
        // Refrescar lastSeenAt + telegramUsername (no tocamos rol/activo)
        await linkedDoc.ref.set({
          telegramUsername: tgUser.username || null,
          lastTelegramSeenAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        logger.info('mintTelegramAuthToken: linked to PWA user', { tgId: tgIdStr, pwaUid: resolvedUid, role })
      }
    }
  } catch (err) {
    // Si la query falla, seguir con el flujo virtual
    logger.warn('mintTelegramAuthToken: link lookup error', { err: String(err) })
  }

  // 7. Si no está linkeado, asegurar que existe el doc virtual `tg_<id>`
  if (!isLinked) {
    await db.collection('users').doc(resolvedUid).set({
      nombre: tgUser.first_name || 'Usuario',
      apellido: tgUser.last_name || '',
      email: `tg_${tgUser.id}@telegram.virtual`,
      rol: authorized ? role : 'usuario',
      activo: authorized,
      telegramId: tgIdStr,
      telegramUsername: tgUser.username || null,
      isTelegramUser: true,
      lastSeenAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  }

  // 8. Emitir Firebase Custom Token
  const customToken = await getAuth().createCustomToken(resolvedUid, {
    isTelegramUser: true,
    isLinked,
    telegramId: tgIdStr,
    role,
    authorized,
  })

  logger.info('mintTelegramAuthToken: OK', { uid: resolvedUid, role, authorized, isLinked, chatId })
  res.json({ token: customToken, uid: resolvedUid, role, authorized, isLinked, firstName: tgUser.first_name || '' })
})

/**
 * GET /setupMantApp
 * Siembra telegramAuthorizedChats con el TELEGRAM_CHAT_ID del .env.
 * Llamar UNA VEZ después del primer deploy: GET /setupMantApp
 * No requiere autenticación — solo funciona con el chatId ya configurado en .env.
 */
exports.setupMantApp = onRequest({ region: 'us-central1' }, async (req, res) => {
  if (!requireAdminKey(req, res)) return
  // Acepta chatId desde query param (ej: ?chatId=-1003969255842) o desde .env
  const chatId = req.query.chatId || process.env.TELEGRAM_CHAT_ID
  if (!chatId) {
    res.status(400).json({ error: 'Pasá el chatId: GET /setupMantApp?chatId=-1003969255842' })
    return
  }
  const ref = db.collection('telegramAuthorizedChats').doc(String(chatId))
  const existing = await ref.get()
  if (existing.exists) {
    res.json({ status: 'already_exists', chatId, data: existing.data() })
    return
  }
  await ref.set({
    nombre: req.query.nombre || 'Alertas Mantenimiento (dev)',
    activo: true,
    creadoEn: FieldValue.serverTimestamp(),
    nota: 'Seeded automáticamente por setupMantApp',
  })
  res.json({ status: 'created', chatId, mensaje: 'Chat autorizado. La mini app ya puede autenticar usuarios de este grupo.' })
})

// ═══════════════════════════════════════════════════════════════════════════
// SHOPLOGIX INTEGRATION (Fase 2b) — sync con Evisceradoras Baader 142 upstream
// Docs: docs/SHOPLOGIX_API.md + docs/SHOPLOGIX_INTEGRATION_PLAN.md
// ═══════════════════════════════════════════════════════════════════════════

const shoplogixSyncMod  = require('./shoplogix/sync')
const turnoBriefMod     = require('./shoplogix/turnoBrief')
const shoplogixPolling  = require('./shoplogix/polling')
const shoplogixTokenStore = require('./shoplogix/tokenStore')
const shoplogixClient   = require('./shoplogix/client')

// ── Helpers de auth Shoplogix ──────────────────────────────────────────────

/**
 * Resuelve credenciales para el sync: Bearer > Cookie.
 *
 * Fase 2b.1 (Bearer):
 *   Lee user/password desde Firestore system/shoplogixCredentials (Fase 2b.1).
 *   Si existen, obtiene/renueva el access_token automáticamente vía ROPC.
 *   NOTA: Se usa Firestore (no Secret Manager) porque Firebase Functions v2
 *   falla el deploy si el secret no existe aún. Firestore es más flexible
 *   para credenciales que se configuran post-deploy.
 *
 * Fase 2b.0 fallback (Cookie):
 *   Si no hay credenciales en Firestore, usa SHOPLOGIX_COOKIE (manual).
 *
 * @returns {{ accessToken?: string, cookie?: string, mode: 'bearer' | 'cookie' | 'none' }}
 */
async function resolveShoplogixAuth(log) {
  const cookie = process.env.SHOPLOGIX_COOKIE

  // Fase 2b.1: auto-login si hay credenciales en Firestore
  const creds = await shoplogixTokenStore.getStoredCredentials(db)
  if (creds?.user && creds?.password) {
    try {
      const accessToken = await shoplogixTokenStore.getValidAccessToken(db, creds, log)
      return { accessToken, mode: 'bearer' }
    } catch (e) {
      log.error('[shoplogix-auth] Auto-login falló, intentando fallback cookie:', e.message)
      // Caer al modo cookie si el auto-login falla y hay cookie disponible
    }
  }

  // Fase 2b.0: cookie manual
  if (cookie) return { cookie, mode: 'cookie' }

  return { mode: 'none' }
}

// ── Cloud Functions ────────────────────────────────────────────────────────

/**
 * Sync HTTP — trigger manual para testing/backfill.
 * Uso: curl -X POST https://.../shoplogixSyncHttp?dateKey=2026-02-26&shiftId=Turno%20día
 *
 * Secretos requeridos (al menos uno):
 *   Fase 2b.1 (auto): SHOPLOGIX_USER + SHOPLOGIX_PASS
 *   Fase 2b.0 (legado): SHOPLOGIX_COOKIE
 */
exports.shoplogixSyncHttp = onRequest(
  {
    secrets: ['SHOPLOGIX_COOKIE'],
    region: 'us-central1',
    timeoutSeconds: 180,
    memory: '256MiB',
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    if (!requireAdminKey(req, res)) return
    const auth = await resolveShoplogixAuth(logger)
    if (auth.mode === 'none') {
      res.status(500).json({
        error: 'NO_AUTH',
        message: 'Configurar SHOPLOGIX_USER+SHOPLOGIX_PASS (Bearer) o SHOPLOGIX_COOKIE (legado)',
      })
      return
    }
    logger.info(`[shoplogixSyncHttp] modo auth: ${auth.mode}`)

    const { dateKey, plantSlug } = req.query || {}
    try {
      // Siempre syncDay (ventana 08:00→08:00, bounds reales desde intervals.shift).
      // forceAll: este endpoint es el canal de backfill/corrección manual — si
      // respetara el freeze, pedir un día viejo no reescribiría nada.
      const result = await shoplogixSyncMod.syncDay({
        db,
        accessToken: auth.accessToken,
        cookie:      auth.cookie,
        plantSlug:   plantSlug || 'chonchi',
        dateKey:     dateKey   || undefined,
        forceAll:    true,
        logger,
      })
      res.json({ ...result, authMode: auth.mode })
    } catch (err) {
      if (err.code === 'AUTH_EXPIRED') {
        // Bearer mode: limpiar token guardado para forzar re-login en el próximo intento
        if (auth.mode === 'bearer') await shoplogixTokenStore.clearStoredToken(db)
        logger.error('[shoplogixSyncHttp] AUTH_EXPIRED', { mode: auth.mode })
        res.status(401).json({ error: 'AUTH_EXPIRED', message: err.message, authMode: auth.mode })
        return
      }
      logger.error('[shoplogixSyncHttp] error', { err: err.message, stack: err.stack })
      res.status(500).json({ error: err.message })
    }
  },
)

/**
 * Wakeup scheduler — dispara cada 5 minutos.
 * Fase 2b.1: auto-login integrado. Si AUTH_EXPIRED y hay credenciales,
 * limpia el token guardado y el próximo ciclo hará re-login.
 *
 * Además del día actual, re-sincroniza días RECIENTES en cadencias bajas
 * (auto-corrección de etiquetado retroactivo — ver extraDateKeys abajo).
 */
exports.shoplogixSyncWakeup = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/Santiago',
    timeoutSeconds: 420,   // hoy + hasta 2 días extra de re-sync en el disparo de las 12:00
    memory: '256MiB',
    retryCount: 1,
    secrets: ['SHOPLOGIX_COOKIE'],
  },
  async () => {
    // Solo corre durante turnos (fuera de turno: skip)
    const ctx = shoplogixPolling.currentShift()
    if (!ctx) {
      logger.info('[shoplogixSyncWakeup] Fuera de turno — skip')
      return
    }

    // ── Re-sync móvil: auto-corrección de etiquetado retroactivo ────────────
    // Shoplogix puede configurar/etiquetar turnos DESPUÉS de ocurridos (caso
    // real: el "Turno 3 - 6 Jul 2026" de Yal se configuró el lunes; la pesca
    // del domingo quedó como "Unscheduled" y el día ya estaba congelado —
    // cada dateKey deja de re-sincronizarse a las 08:00 del día siguiente).
    // Para que esas correcciones lleguen solas a la app:
    //   - AYER se re-sincroniza una vez por hora (disparo del minuto :00)
    //   - HACE 2 y 3 días, una vez al día (disparo de las 12:00 Chile)
    // Cambios más antiguos → backfill manual (shoplogixBackfillRange).
    const wallNow = shoplogixPolling.toChileWall(new Date())
    const baseKey = shoplogixSyncMod.currentDateKey()
    const minusDays = (dk, n) => {
      const d = new Date(`${dk}T12:00:00Z`)
      d.setUTCDate(d.getUTCDate() - n)
      return d.toISOString().slice(0, 10)
    }
    const extraDateKeys = []
    if (wallNow.getUTCMinutes() < 5) extraDateKeys.push(minusDays(baseKey, 1))
    if (wallNow.getUTCHours() === 12 && wallNow.getUTCMinutes() < 5) {
      extraDateKeys.push(minusDays(baseKey, 2), minusDays(baseKey, 3))
    }

    // Jitter anti-bot: delay aleatorio para que las queries nunca lleguen en el
    // mismo segundo (Cloud Scheduler dispara exacto, pero Shoplogix verá
    // timestamps variables → patrón más humano). Acotado cuando hay días extra
    // para no arriesgar el timeout.
    const jitterMs = Math.floor(Math.random() * (extraDateKeys.length > 0 ? 30_000 : 120_000))
    logger.info(`[shoplogixSyncWakeup] jitter ${Math.round(jitterMs / 1000)}s` +
      (extraDateKeys.length ? ` · re-sync extra: ${extraDateKeys.join(', ')}` : ''))
    await new Promise(r => setTimeout(r, jitterMs))

    const auth = await resolveShoplogixAuth(logger)
    if (auth.mode === 'none') {
      logger.error('[shoplogixSyncWakeup] Sin auth configurada (SHOPLOGIX_USER/PASS o COOKIE) — skip')
      return
    }
    logger.info(`[shoplogixSyncWakeup] modo auth: ${auth.mode}`)

    let authExpired = false
    // `forceAll` reescribe también los turnos ya congelados. Los re-sync de días
    // pasados existen precisamente para traer las correcciones retroactivas de
    // etiquetado de Shoplogix, y ahí TODOS los turnos están cerrados: sin forzar,
    // el freeze los saltearía a todos y la corrección nunca llegaría a la app.
    // Para el día actual (dateKey undefined) va en false → los turnos que ya
    // cerraron hoy no se reescriben cada 5 minutos.
    const runDay = async (dateKey, forceAll = false) => {
      // dateKey undefined = día actual. Plantas en paralelo, días en secuencia.
      const settled = await Promise.allSettled(
        shoplogixSyncMod.ACTIVE_PLANTS.map((plantSlug) =>
          shoplogixSyncMod.syncDay({
            db,
            accessToken: auth.accessToken,
            cookie:      auth.cookie,
            plantSlug,
            dateKey,
            forceAll,
            logger,
          })
        )
      )
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          logger.info('[shoplogixSyncWakeup] OK', { result: outcome.value, authMode: auth.mode })
        } else {
          const err = outcome.reason
          if (err?.code === 'AUTH_EXPIRED') {
            authExpired = true
          } else {
            logger.error('[shoplogixSyncWakeup] error planta', { err: err?.message, dateKey: dateKey ?? 'hoy' })
          }
        }
      }
    }

    await runDay(undefined)
    for (const dk of extraDateKeys) {
      if (authExpired) break
      await runDay(dk, true)   // día pasado → forzar, es el canal de corrección retroactiva
    }

    if (authExpired) {
      if (auth.mode === 'bearer') {
        await shoplogixTokenStore.clearStoredToken(db)
        logger.error('[shoplogixSyncWakeup] AUTH_EXPIRED (Bearer) — token limpiado, re-login en próximo ciclo')
      } else {
        logger.error('[shoplogixSyncWakeup] AUTH_EXPIRED (Cookie) — refrescar SHOPLOGIX_COOKIE manualmente')
      }

      // Alerta operacional por Telegram (dedupe 6h): sin auth NO entran más
      // datos de turnos y nadie lo nota hasta mirar la app. El ROPC está roto
      // (invalid_client — el grant password del client SAAS139 quedó
      // confidencial), así que TODO cuelga de la cookie: avisar de inmediato.
      try {
        const alertRef = db.doc('system/shoplogixAuthAlert')
        const snap = await alertRef.get()
        const lastAt = snap.exists ? (snap.data().lastAt?.toDate?.()?.getTime() ?? 0) : 0
        if (Date.now() - lastAt > 6 * 3600 * 1000) {
          await alertRef.set({ lastAt: new Date(), mode: auth.mode }, { merge: true })
          await sendTelegramMessage(
            '🚨 <b>Shoplogix sync CAÍDO — sesión expirada</b>\n\n' +
            (auth.mode === 'cookie'
              ? 'La cookie <code>SHOPLOGIX_COOKIE</code> expiró. Renovar (2 min): abrir saas139.shoplogix.com logueado → DevTools → Red → cualquier <code>query.axd</code> → copiar header <code>Cookie</code> → actualizar el secret en GCP → redeploy de shoplogixSyncWakeup. Detalle: docs/SHOPLOGIX_DEPLOY.md §3.'
              : 'Token Bearer inválido y sin recuperación automática (ROPC roto).') +
            '\n\n⚠️ Mientras tanto NO están entrando datos de turnos a la app.',
          )
          logger.info('[shoplogixSyncWakeup] alerta Telegram de auth caída enviada')
        }
      } catch (e) {
        logger.warn('[shoplogixSyncWakeup] alerta Telegram falló:', e.message)
      }
    }
  },
)

/**
 * Refresh proactivo del token Shoplogix — corre cada 50 min.
 * Se asegura de que el access_token siempre esté vigente antes de que
 * el sync wakeup lo necesite. Requiere SHOPLOGIX_USER + SHOPLOGIX_PASS.
 *
 * Si el refresh falla, el wakeup intentará re-login completo.
 * Si no hay credenciales, esta function es un no-op (sin error).
 */
exports.shoplogixTokenRefresh = onSchedule(
  {
    schedule: 'every 50 minutes',
    timeZone: 'UTC',
    timeoutSeconds: 60,
    memory: '128MiB',
    retryCount: 2,
    // No secrets: credenciales en Firestore system/shoplogixCredentials
  },
  async () => {
    // Lee credenciales desde Firestore (configuradas manualmente una vez)
    const creds = await shoplogixTokenStore.getStoredCredentials(db)
    if (!creds?.user || !creds?.password) {
      logger.info('[shoplogixTokenRefresh] Sin credenciales en Firestore — skip (modo cookie legado)')
      return
    }

    try {
      const accessToken = await shoplogixTokenStore.getValidAccessToken(db, creds, logger)
      logger.info('[shoplogixTokenRefresh] token vigente/renovado OK', {
        first8: accessToken.slice(0, 8) + '…'
      })
    } catch (e) {
      logger.error('[shoplogixTokenRefresh] falló renovación:', e.message)
      // No re-throw: el scheduler reintentará (retryCount: 2)
    }
  },
)

// ── Gestión de credenciales Shoplogix — SOLO vía callable con check admin server-side.
//    La regla Firestore de system/shoplogixCredentials es `if false`: ningún cliente lee
//    la password (las Cloud Functions usan Admin SDK). La password NUNCA sale al cliente.
async function _assertAdminCaller(request) {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Login requerido')
  const snap = await db.collection('users').doc(uid).get()
  if (!snap.exists || snap.data()?.rol !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo administradores')
  }
}

exports.shoplogixCredsGet = onCall({ region: 'us-central1' }, async (request) => {
  await _assertAdminCaller(request)
  const snap = await db.doc('system/shoplogixCredentials').get()
  if (!snap.exists) return { user: null, hasPassword: false, setAt: null }
  const d = snap.data() || {}
  const setAt = d.set_at && typeof d.set_at.toDate === 'function' ? d.set_at.toDate().toISOString() : null
  // Devuelve solo metadata — la password jamás se retorna al cliente.
  return { user: d.user ?? null, hasPassword: !!d.password, setAt }
})

exports.shoplogixCredsSet = onCall({ region: 'us-central1' }, async (request) => {
  await _assertAdminCaller(request)
  const user = String(request.data?.user ?? '').trim()
  const password = String(request.data?.password ?? '')
  if (!user.includes('@')) throw new HttpsError('invalid-argument', 'Usuario debe ser un email válido')
  if (password.length < 4) throw new HttpsError('invalid-argument', 'Contraseña debe tener al menos 4 caracteres')
  await db.doc('system/shoplogixCredentials').set({ user, password, set_at: FieldValue.serverTimestamp() })
  return { ok: true }
})

exports.shoplogixCredsDelete = onCall({ region: 'us-central1' }, async (request) => {
  await _assertAdminCaller(request)
  await db.doc('system/shoplogixCredentials').delete()
  return { ok: true }
})

/**
 * Valida un código de invitación ANTES de crear la cuenta (signUpWithInviteCode
 * en auth.ts llama esto primero, luego createUserWithEmailAndPassword). A
 * propósito SIN _assertAdminCaller/auth: el caller todavía no tiene sesión de
 * Firebase (es justo el momento pre-signup). Usa Admin SDK → bypasa
 * firestore.rules, así que la regla de `inviteCodes` puede cerrarse a
 * admin-only sin romper este flujo (antes exigía isNotAnonymous(), lo cual
 * es imposible de cumplir pre-signup → 403 real confirmado por curl sin
 * auth — el signup con código de invitación estaba roto en silencio desde
 * que se deshabilitó el login anónimo el 2026-07-05).
 */
exports.validateInviteCodeProxy = onCall({ region: 'us-central1' }, async (request) => {
  const code = String(request.data?.code ?? '').trim().toUpperCase()
  if (!code || code.length > 40) return { valid: false }

  const snap = await db.collection('inviteCodes')
    .where('code', '==', code)
    .where('activo', '==', true)
    .limit(1)
    .get()
  if (snap.empty) return { valid: false }

  const doc = snap.docs[0]
  const d = doc.data()
  const expiresAt = d.expiresAt && typeof d.expiresAt.toDate === 'function' ? d.expiresAt.toDate() : null
  if (expiresAt && expiresAt < new Date()) return { valid: false }
  if (typeof d.usosActuales === 'number' && typeof d.usosMaximos === 'number' && d.usosActuales >= d.usosMaximos) {
    return { valid: false }
  }

  return {
    valid: true,
    id: doc.id,
    code: d.code,
    rol: d.rol,
    usosMaximos: d.usosMaximos,
    usosActuales: d.usosActuales,
    activo: d.activo,
    createdBy: d.createdBy ?? null,
    createdAt: d.createdAt && typeof d.createdAt.toDate === 'function' ? d.createdAt.toDate().toISOString() : null,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  }
})

// Password de OTA (ArduinoOTA) de los ESP32 de sensores — antes vivía en
// VITE_OTA_PASSWORD, horneada en el bundle público de la PWA y visible en
// la ruta /sensors SIN ni siquiera exigir rol admin. Ahora solo se entrega
// bajo demanda a un caller admin verificado server-side (mismo patrón que
// las credenciales de Shoplogix). NO usa Secret Manager (`secrets:`) — como
// ADMIN_SETUP_KEY/TELEGRAM_WEBHOOK_SECRET, viene de FUNCTIONS_ENV (GitHub
// secret) → functions/.env en cada deploy; agregar OTA_PASSWORD=... ahí.
exports.getOtaPasswordProxy = onCall(
  { region: 'us-central1' },
  async (request) => {
    await _assertAdminCaller(request)
    return { password: process.env.OTA_PASSWORD || '' }
  }
)

/**
 * Trigger manual de sync Shoplogix — llamado desde el botón "Actualizar ahora"
 * en la PWA. Autentica el usuario, sincroniza el turno solicitado (o el actual)
 * y escribe a Firestore. El onSnapshot del hook useUpstreamLineSnapshot
 * detecta el cambio y actualiza la UI automáticamente.
 *
 * @param {object} data
 * @param {string} [data.dateKey]   — "2026-04-29" (default: turno actual)
 * @param {string} [data.shiftId]   — "Turno día" | "Turno noche" (default: actual)
 * @param {string} [data.plantSlug] — "chonchi" | "yal" (default: "chonchi")
 */
exports.shoplogixSyncNow = onCall(
  {
    timeoutSeconds: 90,
    memory: '256MiB',
    secrets: ['SHOPLOGIX_COOKIE'],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Login requerido')
    }

    const { dateKey, shiftId, plantSlug = 'chonchi' } = (request.data ?? {})

    const auth = await resolveShoplogixAuth(logger)
    if (auth.mode === 'none') {
      throw new HttpsError('internal', 'Sin credenciales Shoplogix configuradas')
    }

    // Siempre syncDay (ventana 08:00→08:00, bounds reales desde intervals.shift).
    // syncShift es legacy con ventanas hardcodeadas 09-22 / 19-07 — no usar.
    // El UI envía shiftId pero se ignora para el routing (syncDay escribe todos los turnos del día).
    logger.info(`[shoplogixSyncNow] uid=${request.auth.uid} planta=${plantSlug} ${dateKey ?? 'turno-actual'} (syncDay)`)

    try {
      const result = await shoplogixSyncMod.syncDay({
        db,
        accessToken: auth.accessToken,
        cookie:      auth.cookie,
        plantSlug:   plantSlug || 'chonchi',
        dateKey:     dateKey   || undefined,
        // Sync manual desde el UI: el usuario lo pide explícitamente porque quiere
        // datos frescos. Respetar el freeze aquí sería no hacer nada al apretar el botón.
        forceAll:    true,
        logger,
      })
      return { ok: true, result }
    } catch (err) {
      if (err.message?.includes('AUTH_EXPIRED')) {
        if (auth.mode === 'bearer') await shoplogixTokenStore.clearStoredToken(db)
        throw new HttpsError('unauthenticated', 'Sesión Shoplogix expirada — contactar admin')
      }
      logger.error('[shoplogixSyncNow] error', { err: err.message })
      throw new HttpsError('internal', err.message ?? 'Error desconocido')
    }
  },
)

/**
 * Cleanup HTTP — borra docs legacy de Shoplogix (`{dateKey}_Turno día` /
 * `{dateKey}_Turno noche`) y sus subcollections `machines/*` para un rango
 * de fechas. Solo borra un doc legacy si ya existe el equivalente nuevo
 * (Turno 1/2/3) para ese día — garantía de no dejar días sin datos.
 *
 * Uso: GET https://.../shoplogixCleanupLegacy?plantSlug=yal&from=2026-04-01&to=2026-04-30
 *      Agregar &dryRun=false para ejecutar realmente (por defecto es dry-run).
 *
 * Respuesta incluye `wouldDelete` (dry-run) o `deleted` (real) + `skipped` (sin nuevo formato).
 */
exports.shoplogixCleanupLegacy = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    if (!requireAdminKey(req, res)) return
    const { plantSlug = 'chonchi', from, to } = req.query || {}
    // dryRun=true por defecto: requiere pasar explícitamente dryRun=false para borrar
    const dryRun = req.query.dryRun !== 'false'
    if (!from || !to) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Requiere from=YYYY-MM-DD y to=YYYY-MM-DD' })
      return
    }
    const fromDate = new Date(`${from}T00:00:00Z`)
    const toDate   = new Date(`${to}T00:00:00Z`)
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate > toDate) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'from/to inválido o invertido' })
      return
    }

    const dateKeys = []
    for (let d = new Date(fromDate); d <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      dateKeys.push(`${y}-${m}-${day}`)
    }

    const legacyMap = {
      'Turno día':   ['Turno 2'],                  // nuevo equivalente de día
      'Turno noche': ['Turno 1', 'Turno 3'],       // nuevos equivalentes de noche
    }
    const toDelete  = []   // legacy con nuevo equivalente confirmado
    const skipped   = []   // legacy sin nuevo equivalente (no se toca)
    const deleted   = []
    let totalMachines = 0

    try {
      // Fase 1: detectar qué borrar (siempre se ejecuta, sirve de dry-run)
      for (const dateKey of dateKeys) {
        for (const [legacyId, newIds] of Object.entries(legacyMap)) {
          const legacyRef  = db.doc(`shoplogix/${plantSlug}/shifts/${dateKey}_${legacyId}`)
          const legacySnap = await legacyRef.get()
          const machinesSnap = await legacyRef.collection('machines').get()
          if (!legacySnap.exists && machinesSnap.empty) continue  // nada que hacer

          // Verificar si ya existe al menos un equivalente nuevo con datos
          let hasNew = false
          for (const newId of newIds) {
            const newSnap = await db.doc(`shoplogix/${plantSlug}/shifts/${dateKey}_${newId}`).get()
            if (newSnap.exists) { hasNew = true; break }
          }

          const entry = { dateKey, shiftId: legacyId, machines: machinesSnap.size }
          if (hasNew) {
            toDelete.push({ ...entry, legacyRef, machinesDocs: machinesSnap.docs })
          } else {
            skipped.push({ dateKey, shiftId: legacyId, reason: 'sin_nuevo_equivalente' })
          }
        }
      }

      // Fase 2: borrar (solo si dryRun=false)
      if (!dryRun) {
        for (const item of toDelete) {
          if (item.machinesDocs.length > 0) {
            const batch = db.batch()
            item.machinesDocs.forEach((m) => batch.delete(m.ref))
            await batch.commit()
            totalMachines += item.machinesDocs.length
          }
          await item.legacyRef.delete()
          deleted.push({ dateKey: item.dateKey, shiftId: item.shiftId, machines: item.machines })
        }
      }

      const summary = dryRun
        ? { dryRun: true, wouldDelete: toDelete.length, skipped: skipped.length }
        : { dryRun: false, deleted: deleted.length, skipped: skipped.length, totalMachineDocs: totalMachines }

      logger.info('[shoplogixCleanupLegacy]', { plantSlug, from, to, ...summary })
      res.json({
        ok: true, plantSlug, from, to, ...summary,
        items: dryRun
          ? { wouldDelete: toDelete.map(i => ({ dateKey: i.dateKey, shiftId: i.shiftId, machines: i.machines })), skipped }
          : { deleted, skipped },
      })
    } catch (err) {
      logger.error('[shoplogixCleanupLegacy] error', { err: err.message, stack: err.stack })
      res.status(500).json({ error: err.message })
    }
  },
)

/**
 * Dump HTTP — vuelca contenido de un shift doc Firestore para diagnóstico.
 * Uso: GET https://.../shoplogixDumpShift?plantSlug=yal&dateKey=2026-04-29&shiftId=Turno%202
 */
exports.shoplogixDumpShift = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    if (!requireAdminKey(req, res)) return
    const { plantSlug = 'yal', dateKey, shiftId } = req.query || {}
    if (!dateKey) { res.status(400).json({ error: 'dateKey requerido' }); return }

    const shiftIds = shiftId ? [shiftId] : ['Turno 1', 'Turno 2', 'Turno 3', 'Turno día', 'Turno noche']
    const out = {}
    for (const sid of shiftIds) {
      const ref = db.doc(`shoplogix/${plantSlug}/shifts/${dateKey}_${sid}`)
      const snap = await ref.get()
      if (!snap.exists) { out[sid] = null; continue }
      const d = snap.data()
      out[sid] = {
        scheduledStart: d.scheduledStart?.toDate?.()?.toISOString() ?? d.scheduledStart,
        scheduledEnd:   d.scheduledEnd?.toDate?.()?.toISOString()   ?? d.scheduledEnd,
        scheduleSource: d.scheduleSource,
        machinesCount:  d.machines?.length ?? 0,
        lastSyncAt:     d.lastSyncAt?.toDate?.()?.toISOString() ?? d.lastSyncAt,
      }
      // Tomar la primera machine de la subcollection y mostrar shiftStart/End/scheduledStart/End
      const machinesSnap = await ref.collection('machines').limit(1).get()
      if (!machinesSnap.empty) {
        const m = machinesSnap.docs[0].data()
        out[sid].machineDoc = {
          shiftStart:     m.shiftStart?.toDate?.()?.toISOString()     ?? m.shiftStart,
          shiftEnd:       m.shiftEnd?.toDate?.()?.toISOString()       ?? m.shiftEnd,
          scheduledStart: m.scheduledStart?.toDate?.()?.toISOString() ?? m.scheduledStart,
          scheduledEnd:   m.scheduledEnd?.toDate?.()?.toISOString()   ?? m.scheduledEnd,
          scheduleSource: m.scheduleSource,
          totalCycles:    m.totalCycles,
        }
      }
    }
    res.json({ plantSlug, dateKey, shifts: out })
  },
)

/**
 * Backfill HTTP — re-sincroniza un rango de fechas con syncDay para generar
 * los docs Turno 1/2/3 correctos en Firestore (reemplaza los legacy Turno día/noche).
 *
 * Uso: GET https://.../shoplogixBackfillRange?plantSlug=yal&from=2026-04-01&to=2026-04-30
 *
 * Notas:
 *  - Procesa un día a la vez con 800ms de pausa entre peticiones (evita rate-limit).
 *  - Si syncDay falla en un día, registra el error y continúa con el siguiente.
 *  - Timeout 540s: soporta hasta ~30 días (cada día ≈ 2-5s + 0.8s pausa).
 *  - Después de ejecutar esto, correr shoplogixCleanupLegacy (con dryRun=false)
 *    para borrar los docs legacy que ya tienen equivalente nuevo.
 */
exports.shoplogixBackfillRange = onRequest(
  {
    secrets: ['SHOPLOGIX_COOKIE'],
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    if (!requireAdminKey(req, res)) return
    const { plantSlug = 'chonchi', from, to } = req.query || {}
    if (!from || !to) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Requiere from=YYYY-MM-DD y to=YYYY-MM-DD' })
      return
    }
    const fromDate = new Date(`${from}T00:00:00Z`)
    const toDate   = new Date(`${to}T00:00:00Z`)
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate > toDate) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'from/to inválido o invertido' })
      return
    }
    // Límite de seguridad: máximo 60 días por llamada
    const diffDays = Math.round((toDate - fromDate) / 86_400_000) + 1
    if (diffDays > 60) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Máximo 60 días por llamada' })
      return
    }

    const auth = await resolveShoplogixAuth(logger)
    if (auth.mode === 'none') {
      res.status(500).json({ error: 'Sin credenciales Shoplogix configuradas' })
      return
    }

    const dateKeys = []
    for (let d = new Date(fromDate); d <= toDate; d.setUTCDate(d.getUTCDate() + 1)) {
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      dateKeys.push(`${y}-${m}-${day}`)
    }

    const results = []
    logger.info('[shoplogixBackfillRange] inicio', { plantSlug, from, to, days: dateKeys.length })

    for (const dateKey of dateKeys) {
      try {
        const result = await shoplogixSyncMod.syncDay({
          db,
          accessToken: auth.accessToken,
          cookie:      auth.cookie,
          plantSlug,
          dateKey,
          forceAll:    true,   // backfill explícito de días pasados → ignorar freeze
          logger,
        })
        results.push({ dateKey, ok: true, shifts: result?.shiftsWritten ?? result?.shifts ?? null })
        logger.info('[shoplogixBackfillRange] día OK', { dateKey, plantSlug })
      } catch (err) {
        const msg = err.message ?? 'error desconocido'
        results.push({ dateKey, ok: false, error: msg.slice(0, 200) })
        logger.warn('[shoplogixBackfillRange] día FAIL', { dateKey, plantSlug, err: msg })
        if (msg.includes('AUTH_EXPIRED')) {
          if (auth.mode === 'bearer') await shoplogixTokenStore.clearStoredToken(db)
          break  // sin credenciales válidas no tiene sentido continuar
        }
      }
      // Pausa entre fechas para no saturar Shoplogix
      await new Promise(r => setTimeout(r, 800))
    }

    const ok    = results.filter(r => r.ok).length
    const fail  = results.filter(r => !r.ok).length
    logger.info('[shoplogixBackfillRange] fin', { plantSlug, from, to, ok, fail })
    res.json({ ok: fail === 0, plantSlug, from, to, total: results.length, synced: ok, failed: fail, results })
  },
)

/**
 * Probe HTTP — diagnostica qué endpoints query.axd tiene Shoplogix con
 * data útil de schedule/horario de turno (no solo intervals con `iv.shift`).
 *
 * Prueba una lista de `type=` candidatos. Para cada uno reporta status y
 * los primeros ~600 chars del response, para inspeccionar manualmente y
 * decidir cuál usar en `syncDay` para `scheduledStart/End` reales.
 *
 * Uso: GET https://.../shoplogixProbe?plantSlug=yal&dateKey=2026-04-29
 */
exports.shoplogixProbe = onRequest(
  {
    secrets: ['SHOPLOGIX_COOKIE'],
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    if (!requireAdminKey(req, res)) return
    const auth = await resolveShoplogixAuth(logger)
    if (auth.mode === 'none') {
      res.status(500).json({ error: 'NO_AUTH' })
      return
    }
    const { plantSlug = 'yal', dateKey } = req.query || {}
    // Mismo "día de sync" (DST-aware, ancla 08:00) que usa syncDay — con el
    // offset -3 fijo de antes el probe consultaba una ventana distinta a la
    // que el sync escribió y el debug concluía "no hay datos" en falso.
    const dk = dateKey || shoplogixSyncMod.currentDateKey()

    // Una máquina de Yal para probar params específicos por máquina
    const machineid = (require('./shoplogix/machines').PLANT_MACHINES[plantSlug] || [])[0]?.machineid
    // La MISMA ventana que usa syncDay, no una copia: con la copia desfasada el
    // probe consultaba un rango distinto al que el sync escribia y el debug
    // concluia "no hay datos" en falso.
    const { start, end } = shoplogixSyncMod.fullDayWindow(dk)

    // Lista de candidatos a explorar
    const candidates = [
      { type: 'tree' },
      { type: 'whiteboardshifts',   params: { machines: machineid, start, end } },
      { type: 'whiteboardshift',    params: { machines: machineid, start, end } },
      { type: 'shifts',             params: { start, end } },
      { type: 'shift',              params: { start, end } },
      { type: 'schedule',           params: { machines: machineid, start, end } },
      { type: 'whiteboardschedule', params: { machines: machineid, start, end } },
      { type: 'shiftschedule',      params: { machines: machineid, start, end } },
      { type: 'whiteboardplan',     params: { machines: machineid, start, end } },
      { type: 'plan',               params: { machines: machineid, start, end } },
      { type: 'whiteboardproduction', params: { machines: machineid, start, end, minutes: 60 } },
    ]

    // Solicitar production con minutes=5 (granularidad real) y resumir por shift
    let shiftSummary = null
    let currentShift = null
    try {
      const prod = auth.accessToken
        ? await shoplogixClient.queryShoplogixBearer({ accessToken: auth.accessToken, type: 'whiteboardproduction', params: { machines: machineid, start, end, minutes: 5 } })
        : await shoplogixClient.queryShoplogix({ cookie: auth.cookie, type: 'whiteboardproduction', params: { machines: machineid, start, end, minutes: 5 } })
      const m0 = prod?.machines?.[0]
      currentShift = { start: m0?.currentShiftStart, end: m0?.currentShiftEnd }
      const intervals = m0?.machineProduction || []
      const byShift = {}
      for (const iv of intervals) {
        const s = iv.shift || 'Unscheduled'
        if (!byShift[s]) byShift[s] = { count: 0, firstStart: iv.start, lastEnd: iv.end, totalCycles: 0 }
        byShift[s].count++
        byShift[s].lastEnd = iv.end
        byShift[s].totalCycles += iv.cycles || 0
      }
      shiftSummary = byShift
    } catch (err) {
      shiftSummary = { error: (err.message || '').slice(0, 300) }
    }

    const results = []
    for (const c of candidates) {
      try {
        const data = auth.accessToken
          ? await shoplogixClient.queryShoplogixBearer({ accessToken: auth.accessToken, type: c.type, params: c.params || {} })
          : await shoplogixClient.queryShoplogix({ cookie: auth.cookie, type: c.type, params: c.params || {} })
        const json = JSON.stringify(data)
        results.push({ type: c.type, status: 'ok', size: json.length, preview: json.slice(0, 800) })
      } catch (err) {
        results.push({ type: c.type, status: 'err', error: (err.message || '').slice(0, 200) })
      }
    }
    res.json({ plantSlug, dateKey: dk, machineid, start, end, authMode: auth.mode, currentShift, shiftSummary, results })
  },
)

// ── Notificación automática de inicio de proceso ──────────────────────────────
// Se dispara cuando syncDay detecta el primer turno del día y crea el doc
// shoplogix/{plant}/shifts/{dateKey}_{shiftId}. La idempotencia viene gratis:
// onDocumentCreated solo dispara una vez por creación de doc.

exports.onShoplogixShiftStarted = onDocumentCreated(
  { document: 'shoplogix/{plant}/shifts/{shiftDoc}', region: 'us-central1' },
  async (event) => {
    const plant    = event.params.plant    // 'chonchi' | 'yal'
    const shiftDoc = event.params.shiftDoc // '2026-05-02_Turno 2'
    const data     = event.data?.data() || {}

    const shiftId    = data.shiftId || shiftDoc.split('_').slice(1).join('_')
    const plantLabel = SHOPLOGIX_PLANT_LABEL[plant] || plant

    // "Unscheduled" no es un turno: su doc se crea en el primer sync del día
    // (bucket residual de Shoplogix) y disparaba "Proceso iniciado ·
    // Unscheduled" + un delay-check espurio. Mismo criterio que la PWA
    // (isUnscheduledShift) y que checkShiftEndBriefs.
    if (shiftId === 'Unscheduled') {
      logger.info(`[onShoplogixShiftStarted] ${plant} Unscheduled — skip (no es un turno)`)
      return
    }

    logger.info(`[onShoplogixShiftStarted] ${plant} ${shiftId}`)

    const [config, usersSnap] = await Promise.all([
      getShoplogixNotifConfig(plant),
      db.collection('users').where('activo', '==', true).get(),
    ])

    const eligibleIds = []
    usersSnap.forEach((d) => {
      const prefs = d.data().notificationPrefs?.processStarted
      if (prefs ? prefs[plant] !== false : true) eligibleIds.push(d.id)
    })

    const title = `🟢 Proceso iniciado · ${plantLabel}`
    const body  = `${shiftId} ha arrancado`

    // FCM push (canal existente — siempre activo por defecto)
    if (eligibleIds.length > 0) {
      if (config.channels.push) {
        const tokens = await getTokensForUsers(eligibleIds)
        if (tokens.length > 0) {
          await sendNotification(tokens, title, body, {
            type: 'process_started', plant, shiftId, url: '/turno',
          })
          logger.info(`[onShoplogixShiftStarted] FCM enviado`, { eligible: eligibleIds.length, tokens: tokens.length })
        }
      }
    }

    // Telegram va FUERA del gate de `eligibleIds`: ese gate son las
    // preferencias de push de los usuarios de la app, y el mensaje de Telegram
    // llega al chat del admin o al grupo. Que alguien apague su push no puede
    // dejar sin link a Control de Producción.
    {
      // Link del monitor público, para reenviar a Control de Producción. Se
      // resuelve ANTES de componer el mensaje porque va dentro del brief.
      // Va por su propio flag (`monitorLink.enabled`) y no por
      // `channels.telegram`: así una línea recibe el link sin que se le abra
      // todo el canal de alertas (el caso de Filete, que es justamente donde
      // más se pide el monitor).
      const monitorUrl = await resolveMonitorUrlForPlant(plant, config)

      if (config.channels.telegram) {
        // Brief enriquecido con el rollup oficial (horario/especie/target quedan
        // en el doc padre desde el sync que crea el turno vigente; si faltan, el
        // composer degrada a las 2 líneas de antes).
        const officialSchedule = data.officialSchedule?.start && data.officialSchedule?.end
          ? {
              start: data.officialSchedule.start.toDate?.() ?? data.officialSchedule.start,
              end:   data.officialSchedule.end.toDate?.()   ?? data.officialSchedule.end,
            }
          : null
        await sendShoplogixTelegram(
          config,
          turnoBriefMod.componerBriefInicioTurno({
            plantLabel,
            shiftId,
            officialSchedule,
            currentJob: data.currentJob ?? null,
            officialTargets: data.officialTargetsByMachineId ?? null,
            monitorUrl,
          }),
        )
      } else if (monitorUrl) {
        // Sin canal de alertas abierto: igual se manda el link solo, que es lo
        // pedido. Un mensaje corto, no el brief completo.
        await sendShoplogixTelegram(
          config,
          turnoBriefMod.componerAvisoMonitor({ plantLabel, shiftId, monitorUrl }),
        )
      }
    }

    // Crear check de inicio demorado (para cron de verificación)
    if (config.shiftStart.enabled) {
      const scheduledStart = data.scheduledStart?.toDate?.() || new Date()
      const gracePeriodMs  = (config.shiftStart.gracePeriodMinutes || 20) * 60 * 1000
      // `scheduledStart` está en wall-clock-as-UTC pero el cron compara checkAt
      // contra UTC real → convertir acá, al crear el check, para que venza a la
      // hora Chile correcta (sin esto vencía ~4h antes; misma clase de bug que
      // el brief de fin de turno, ver checkShiftEndBriefs).
      const scheduledStartReal = new Date(
        scheduledStart.getTime() + shoplogixPolling.chileUtcOffsetHours(new Date()) * 3600_000,
      )
      const checkAt        = new Date(scheduledStartReal.getTime() + gracePeriodMs)
      await db.collection('shoplogixShiftDelayChecks').doc(`${plant}_${shiftDoc}`).set({
        plant, shiftDoc, shiftId, plantLabel,
        scheduledStart, // F3: base para "demoró N min" (wall-clock-as-UTC, legado)
        scheduledStartReal, // misma hora en UTC real — comparable con `now` del cron
        checkAt,
        done: false,
        alerted: false,
        createdAt: new Date(),
      })
      logger.info(`[onShoplogixShiftStarted] Delay check creado para ${checkAt.toISOString()}`)
    }
  },
)


// ── Sistema de notificaciones Shoplogix ───────────────────────────────────────
// Detecta primera pieza por máquina, hitos de piezas, detenciones y retrasos de
// inicio de turno. Configurable por planta desde Panel Admin.
// Colecciones:
//   notificationConfig/{plantSlug}      — config por planta
//   shoplogixNotifState/{plant_shiftDoc_machineId} — estado por máquina/turno
//   shoplogixShiftDelayChecks/{plant_shiftDoc}      — checks de inicio demorado

const SHOPLOGIX_PLANT_LABEL = { chonchi: 'Chonchi', yal: 'Yal', filete: 'Filete' }

/**
 * plantSlug (doc de `shoplogix/{plant}`) → `PlantLineId` de la PWA
 * (`apps/pwa/src/config/plantLines.ts`). Se usa para armar el deep-link de las
 * notificaciones: sin esto, un evento de Filete abría la pestaña de Eviscerado.
 */
const SHOPLOGIX_PLANT_LINE_ID = {
  chonchi: 'chonchi-eviscerado',
  yal:     'yal-eviscerado',
  filete:  'chonchi-filete',
}

// Config de notificaciones por planta (defaults + overrides por línea +
// Firestore). Vive en su propio módulo para poder testear la resolución.
const notifConfigMod = require('./shoplogix/notifConfig')
const shoplogixMachinesMod = require('./shoplogix/machines')
const SHOPLOGIX_NOTIF_DEFAULTS = notifConfigMod.DEFAULTS

/** Base pública de la PWA (GitHub Pages). Los links de Telegram son absolutos. */
const APP_PUBLIC_BASE = 'https://orelcain.github.io/mantenimiento-planta'

/**
 * URL del monitor público de una línea, para meterla en el aviso de arranque.
 *
 * Reusa SIEMPRE el mismo token mientras siga vigente (ver `ensureLineMonitor`):
 * el link que llega hoy por Telegram es el mismo que llegó ayer, así que quien
 * lo guardó o lo imprimió en un QR no tiene que volver a pedirlo.
 *
 * Nunca tumba el aviso de arranque: ante cualquier error devuelve null y el
 * mensaje sale sin la línea del link.
 */
async function resolveMonitorUrlForPlant(plantSlug, config) {
  if (!config?.monitorLink?.enabled) return null
  try {
    const maquinas = shoplogixMachinesMod.PLANT_MACHINES[plantSlug] || []
    const res = await publicMonitorMod.ensureLineMonitor(db, plantSlug, {
      ttlDays: config.monitorLink.ttlDays || 30,
      meta: {
        plantLineId:     SHOPLOGIX_PLANT_LINE_ID[plantSlug] ?? null,
        // Solo el área: repetirla como `lineLabel` dejaba "Filete · Filete" en
        // la cabecera del monitor.
        areaLabel:       SHOPLOGIX_PLANT_LABEL[plantSlug] ?? plantSlug,
        lineLabel:       null,
        // Con una sola máquina instrumentada su nombre ES el de la línea
        // (Filete = "Baader 200 · Línea 1"); con varias, la etiqueta genérica.
        machineKindLong: maquinas.length === 1 ? maquinas[0].name : null,
        targetPieces:    shoplogixMachinesMod.PLANT_SHIFT_TARGET_PIECES[plantSlug] ?? null,
      },
    })
    if (!res) return null
    if (res.created) logger.info('[publicShiftMonitor] link de línea creado por el arranque de turno', { plantSlug, token: res.token })
    return `${APP_PUBLIC_BASE}/monitor/${res.token}`
  } catch (err) {
    logger.error('[publicShiftMonitor] no se pudo resolver el link de línea', { plantSlug, error: err.message })
    return null
  }
}

async function getShoplogixNotifConfig(plantSlug) {
  try {
    const snap = await db.collection('notificationConfig').doc(plantSlug).get()
    return notifConfigMod.resolveNotifConfig(plantSlug, snap.exists ? snap.data() : null)
  } catch (e) {
    logger.error('[shoplogix-notif] getShoplogixNotifConfig error', e)
    return notifConfigMod.resolveNotifConfig(plantSlug, null)
  }
}

/**
 * Cuenta los paros que el sensor midió y todavía no tienen causa anotada.
 *
 * Las causas viven en `paros` con `origen: 'shoplogix'` y doc id determinístico
 * `slx__{plantSlug}__{dateKey}__{shiftId}__{machineid}__{startMs}` (ver
 * `sensorStopKey` en la PWA). Acá se reconstruye ese id para cada paro del turno
 * y se mira cuáles faltan.
 *
 * Ante cualquier error devuelve null: el brief se manda igual sin esta línea.
 */
async function contarParosSinCausa({ plant, dateKey, shiftId, machines, stoppageMinMinutes }) {
  try {
    const lineaId = SHOPLOGIX_PLANT_LINE_ID[plant]
    if (!lineaId) return null

    const minSec = Math.max(0, (stoppageMinMinutes ?? 3) * 60)
    const shiftKey = String(shiftId).replace(/[^\w-]+/g, '-')
    const esperados = []
    for (const m of machines || []) {
      for (const st of m.states || []) {
        if (st?.type !== 'downtime' && st?.type !== 'setup') continue
        if ((st.durationSec || 0) < minSec) continue
        const startMs = st.startAt?.toDate?.()?.getTime?.() ?? new Date(st.startAt).getTime()
        if (!Number.isFinite(startMs)) continue
        esperados.push({
          key: `slx__${plant}__${dateKey}__${shiftKey}__${m.machineid || m.machineId || ''}__${startMs}`,
          minutes: (st.durationSec || 0) / 60,
        })
      }
    }
    if (esperados.length === 0) return { count: 0, minutes: 0 }

    const snap = await db.collection('paros')
      .where('plantLineId', '==', lineaId)
      .where('shiftId', '==', shiftId)
      .get()
    const anotados = new Set()
    snap.forEach((d) => { const k = d.data()?.stopKey; if (k) anotados.add(k) })

    const faltan = esperados.filter((e) => !anotados.has(e.key))
    return {
      count: faltan.length,
      minutes: Math.round(faltan.reduce((a, e) => a + e.minutes, 0)),
    }
  } catch (e) {
    logger.warn('[checkShiftEndBriefs] no se pudieron contar los paros sin causa:', e.message)
    return null
  }
}

async function getShoplogixEligibleUsers(plant) {
  const snap = await db.collection('users').where('activo', '==', true).get()
  const ids = []
  snap.forEach((d) => {
    const prefs = d.data().notificationPrefs?.processStarted
    if (prefs ? prefs[plant] !== false : true) ids.push(d.id)
  })
  return ids
}

// Destino Telegram de las notifs Shoplogix, configurable por planta desde
// Panel Admin (channels.telegramDest): 'bot' = DM del admin con
// @antarfood_mant_bot (default, para rodaje sin ensuciar el grupo),
// 'grupo' = grupo Telegram (topic General), 'ambos' = los dos.
function sendShoplogixTelegram(config, msg) {
  const dest = config?.channels?.telegramDest || 'bot'
  const sends = []
  if (dest === 'bot' || dest === 'ambos') {
    sends.push(sendTelegramMessage(msg, ARIA_ADMIN_CHAT_ID))
  }
  if (dest === 'grupo' || dest === 'ambos') {
    const topicId = getTopicId('general')
    sends.push(sendTelegramMessage(msg, null, topicId ? { topicId } : {}))
  }
  return Promise.all(sends)
}

async function dispatchShoplogixNotif(config, eligibleUserIds, title, body, data = {}, telegramMsg = null) {
  // URL profunda al turno específico para que el click en la notificación
  // abra la vista correcta y no solo el home de la app.
  // shiftDoc viene como `${dateKey}_${shiftLabel}` (ej "2026-05-03_Turno 2").
  // Ruta cliente: `analisis-grader/turno/{dateKey}__{shiftLabel}?linea={plantLineId}`
  const shiftDoc   = String(data.shiftDoc || '')
  const dateKey    = shiftDoc.slice(0, 10)
  const shiftLabel = shiftDoc.slice(11)
  const lineaId    = SHOPLOGIX_PLANT_LINE_ID[data.plant] || 'chonchi-eviscerado'
  const url = dateKey && shiftLabel
    ? `analisis-grader/turno/${dateKey}__${encodeURIComponent(shiftLabel)}?linea=${lineaId}`
    : 'analisis-grader'

  const promises = []
  if (config.channels.push && eligibleUserIds.length > 0) {
    const tokens = await getTokensForUsers(eligibleUserIds)
    if (tokens.length > 0) {
      promises.push(
        sendNotification(tokens, title, body, { type: 'shoplogix_event', ...data, url })
      )
    }
  }
  if (config.channels.telegram && telegramMsg) {
    promises.push(sendShoplogixTelegram(config, telegramMsg))
  }
  if (promises.length > 0) await Promise.all(promises)
}

// ── onShoplogixMachineUpdated ─────────────────────────────────────────────────
// Dispara en cada sync de datos de máquina. Detecta:
//   • Primera pieza (totalCycles 0→>0)
//   • Hitos de piezas (floor(cycles/N) aumentó)
//   • Nuevas detenciones (conteo de downtime states aumentó)
//   • Nuevas micro-detenciones (conteo de estados con nombre "micro" aumentó)
exports.onShoplogixMachineUpdated = onDocumentUpdated(
  { document: 'shoplogix/{plant}/shifts/{shiftDoc}/machines/{machineId}', region: 'us-central1' },
  async (event) => {
    const { plant, shiftDoc, machineId } = event.params
    const before = event.data.before.data() || {}
    const after  = event.data.after.data()  || {}

    const cyclesBefore = before.totalCycles || 0
    const cyclesAfter  = after.totalCycles  || 0
    const statesAfter  = after.states  || []

    // Salida rápida: solo dataQualityIssues cambió, nada relevante para notifs
    if (cyclesBefore === cyclesAfter && (before.states || []).length === statesAfter.length) return

    const machineName = after.machineName || machineId
    const plantLabel  = SHOPLOGIX_PLANT_LABEL[plant] || plant
    const shiftId     = after.shiftId || shiftDoc.split('_').slice(1).join('_')

    const isMicro   = (s) => (s.name || '').toLowerCase().includes('micro')
    const downtimes = statesAfter.filter(s => s.type === 'downtime' && !isMicro(s))
    const microStops = statesAfter.filter(s => s.type === 'downtime' && isMicro(s))

    const [config, eligibleIds] = await Promise.all([
      getShoplogixNotifConfig(plant),
      getShoplogixEligibleUsers(plant),
    ])
    if (eligibleIds.length === 0) return

    // ── Idempotencia via transacción Firestore ────────────────────────────────
    // syncDay escribe 2 veces por máquina (doc + dataQualityIssues) y Eventarc
    // tiene entrega at-least-once → varias invocaciones concurrentes para el
    // mismo evento. La transacción garantiza que solo UNA actualiza el estado
    // y determina qué notificaciones enviar. Las demás ven estado ya actualizado
    // y devuelven lista vacía.
    const stateRef = db.doc(`shoplogixNotifState/${plant}_${shiftDoc}_${machineId}`)

    const notifications = await db.runTransaction(async (tx) => {
      const snap = await tx.get(stateRef)

      // Clave estable por evento de detención: startAt (Timestamp) si existe;
      // fallback a nombre+posición. Permite deduplicar por EVENTO en vez de por
      // conteo — necesario con el umbral de minutos: una detención "en curso"
      // (durationSec creciendo) que cruza el umbral en un sync posterior debe
      // alertar UNA vez, cosa que el conteo posicional no podía expresar.
      const stopKeyOf = (stop, idx) => {
        const ts = stop.startAt?.toMillis?.() ?? (stop.startAt instanceof Date ? stop.startAt.getTime() : null)
        return ts != null ? `t${ts}` : `${stop.name || 's'}|${stop.reason || ''}|${idx}`
      }
      const minSec = Math.max(0, (config.events.stoppageMinMinutes ?? 3)) * 60
      const relevantes = downtimes
        .map((stop, idx) => ({ stop, key: stopKeyOf(stop, idx) }))
        .filter(({ stop }) => (stop.durationSec || 0) >= minSec)

      // Primera vez que vemos esta máquina/turno: inicializar baseline sin notificar.
      // Evita "catch-up" de historial al hacer un deploy mid-shift.
      if (!snap.exists) {
        tx.set(stateRef, {
          firstPieceSent:     cyclesAfter > 0,   // si ya tiene ciclos, no notificar
          lastNotifiedCycles: 0,
          downtimeCount:      downtimes.length,   // legado (ya no gobierna macro)
          notifiedStopKeys:   relevantes.map(r => r.key), // baseline — no notificar histórico
          microStopCount:     microStops.length,
          updatedAt:          new Date(),
        })
        return []
      }

      const st      = snap.data()
      const toSend  = []
      const updates = {}

      // ── Primera pieza ────────────────────────────────────────────────────────
      if (config.firstPiece.enabled && !st.firstPieceSent && cyclesBefore === 0 && cyclesAfter > 0) {
        toSend.push({
          title: `🎯 Primera pieza · ${machineName}`,
          body:  `${shiftId} · ${plantLabel}`,
          tg:    `🎯 <b>Primera pieza</b> — ${plantLabel}\n${machineName} · ${shiftId}`,
        })
        updates.firstPieceSent = true
      }

      // ── Hitos de piezas ──────────────────────────────────────────────────────
      if (config.pieceInterval.enabled && (config.pieceInterval.every || 0) > 0 && cyclesAfter > 0) {
        const n             = config.pieceInterval.every
        const milestoneNow  = Math.floor(cyclesAfter / n)
        const milestonePrev = Math.floor(Math.max(cyclesBefore, st.lastNotifiedCycles || 0) / n)
        if (milestoneNow > milestonePrev) {
          const reached = milestoneNow * n
          toSend.push({
            title: `📊 ${reached.toLocaleString()} piezas · ${machineName}`,
            body:  `${shiftId} · ${plantLabel}`,
            tg:    `📊 <b>${reached.toLocaleString()} piezas</b> — ${plantLabel}\n${machineName} · ${shiftId}`,
          })
          updates.lastNotifiedCycles = reached
        }
      }

      // ── Detenciones (≥ umbral de minutos, dedupe por evento) ─────────────────
      // Solo alertan las que superan stoppageMinMinutes (default 3): bajo eso
      // es ruido operacional que no amerita Telegram/push. `relevantes` ya
      // viene filtrado por duración; acá se descartan las ya notificadas.
      if (config.events.stoppage) {
        const yaNotificadas = new Set(st.notifiedStopKeys || [])
        // Migración desde el esquema por conteo: la primera pasada tras el
        // deploy no tiene notifiedStopKeys → baseline con lo existente para no
        // re-alertar el historial del turno en curso.
        const esPrimeraConKeys = !('notifiedStopKeys' in st)
        const nuevas = esPrimeraConKeys ? [] : relevantes.filter(({ key }) => !yaNotificadas.has(key))
        for (const { stop } of nuevas) {
          const dMin   = Math.round((stop.durationSec || 0) / 60)
          const reason = stop.reason || stop.name || 'Detención'
          toSend.push({
            title: `⛔ Detención ${dMin} min · ${machineName}`,
            body:  `${reason} · ${plantLabel}`,
            tg:    `⛔ <b>Detención de ${dMin} min</b> — ${plantLabel}\n${machineName} · ${reason}`,
          })
        }
        if (esPrimeraConKeys || nuevas.length > 0) {
          updates.notifiedStopKeys = [...new Set([...yaNotificadas, ...relevantes.map(r => r.key)])]
        }
        updates.downtimeCount = downtimes.length
      }

      // ── Micro-detenciones ─────────────────────────────────────────────────────
      if (config.events.microStoppage && microStops.length > (st.microStopCount || 0)) {
        const newOnes = microStops.slice(st.microStopCount || 0)
        for (const stop of newOnes) {
          const dSec   = stop.durationSec || 0
          const reason = stop.reason || stop.name || 'Micro-detención'
          toSend.push({
            title: `⚡ Micro-detención · ${machineName}`,
            body:  `${reason} · ${dSec}s · ${plantLabel}`,
            tg:    `⚡ <b>Micro-detención</b> — ${plantLabel}\n${machineName} · ${reason} · ${dSec}s`,
          })
        }
        updates.microStopCount = microStops.length
      }

      if (Object.keys(updates).length > 0) {
        tx.set(stateRef, { ...st, ...updates, updatedAt: new Date() }, { merge: true })
      }
      return toSend
    })

    if (notifications.length === 0) return

    for (const n of notifications) {
      await dispatchShoplogixNotif(config, eligibleIds, n.title, n.body, { plant, shiftDoc, machineId }, n.tg)
    }

    logger.info('[onShoplogixMachineUpdated] dispatched', {
      plant, shiftDoc, machineId, count: notifications.length,
    })
  },
)

// ── checkShiftStartDelays ─────────────────────────────────────────────────────
// Cron cada 5 minutos. Revisa docs pendientes en shoplogixShiftDelayChecks.
// Un check vencido NO alerta a ciegas: evaluarDelayCheck (turnoBrief.js)
// distingue día sin proceso (solo estado idle → el check espera un cambio real
// en Shoplogix y expira en silencio si nunca llega) de turno con actividad
// pero 0 piezas (→ alerta exactamente una vez).
exports.checkShiftStartDelays = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-central1' },
  async () => {
    const now = new Date()
    const pending = await db.collection('shoplogixShiftDelayChecks')
      .where('done', '==', false)
      .where('checkAt', '<=', now)
      .get()

    if (pending.empty) return

    for (const doc of pending.docs) {
      const data = doc.data()
      const { plant, shiftDoc, shiftId, plantLabel, alerted } = data
      const checkAt = data.checkAt?.toDate?.() || now
      // Docs creados antes de F3 no tienen scheduledStart guardado — se puede
      // recalcular restando el margen de gracia, pero si tampoco hay config
      // disponible el fallback es checkAt (subestima el delay, nunca lo inventa
      // de más). Nunca bloquea el flujo: es solo el número que se muestra.
      // Para "demoró N min" se necesita la partida en UTC REAL (comparable con
      // `now`). `scheduledStartReal` existe en checks nuevos; en docs legado
      // `scheduledStart` está en wall-clock-as-UTC y restarlo de `now` inflaba
      // el delay ~+4h (offset Chile) → convertir al vuelo.
      const legacyStart = data.scheduledStart?.toDate?.()
      const scheduledStart = data.scheduledStartReal?.toDate?.()
        || (legacyStart
          ? new Date(legacyStart.getTime() + shoplogixPolling.chileUtcOffsetHours(now) * 3600_000)
          : checkAt)
      try {
        const config = await getShoplogixNotifConfig(plant)
        if (!config.shiftStart.enabled) {
          await doc.ref.update({ done: true })
          continue
        }

        // Leer el turno padre para ver si ya tiene ciclos
        const machinesSnap = await db
          .collection(`shoplogix/${plant}/shifts/${shiftDoc}/machines`)
          .get()

        const totalCycles = machinesSnap.docs.reduce(
          (sum, m) => sum + (m.data().totalCycles || 0), 0
        )

        const veredicto = turnoBriefMod.evaluarDelayCheck({
          totalCycles,
          machines: machinesSnap.docs.map((m) => ({ states: m.data().states || [] })),
          checkAt,
          now,
          alerted: Boolean(alerted),
        })

        if (veredicto === 'wait') {
          // Sin actividad todavía (día sin proceso, o Shoplogix aún no registra
          // nada) o ya alertó y sigue esperando piezas: dejar el check
          // pendiente — la próxima corrida re-evalúa.
          logger.info('[checkShiftStartDelays] esperando cambio', { plant, shiftDoc, alerted: Boolean(alerted) })
          continue
        }

        if (veredicto === 'alert') {
          const label = plantLabel || SHOPLOGIX_PLANT_LABEL[plant] || plant
          const graceMins = config.shiftStart.gracePeriodMinutes || 20
          const eligibleIds = await getShoplogixEligibleUsers(plant)
          await dispatchShoplogixNotif(
            config,
            eligibleIds,
            `⚠️ Sin piezas · ${label}`,
            `${shiftId} arrancó hace ${graceMins} min pero sin piezas registradas`,
            { plant, shiftDoc },
            `⚠️ <b>Sin piezas registradas</b> — ${label}\n${shiftId} arrancó hace ${graceMins} min · Shoplogix registra actividad pero ninguna pieza`,
          )
          logger.warn('[checkShiftStartDelays] alerta emitida', { plant, shiftDoc, totalCycles })
          // NO se marca done: el check sigue vivo esperando la recuperación
          // (primera pieza) para cerrar el ciclo con el mensaje de F3.
          await doc.ref.update({ alerted: true, alertedAt: now })
          continue
        }

        if (veredicto === 'recovered') {
          const label = plantLabel || SHOPLOGIX_PLANT_LABEL[plant] || plant
          const delayMinutes = Math.max(0, Math.round((now.getTime() - scheduledStart.getTime()) / 60000))
          const eligibleIds = await getShoplogixEligibleUsers(plant)
          await dispatchShoplogixNotif(
            config,
            eligibleIds,
            `✅ Arrancó · ${label}`,
            `${shiftId} · demoró ${delayMinutes} min`,
            { plant, shiftDoc },
            turnoBriefMod.componerMensajeRecuperacion({ plantLabel: label, shiftId, delayMinutes }),
          )
          // delayMinutes queda persistido: dato crudo para reportar "retraso de
          // arranque por turno" más adelante (no se construye el reporte acá).
          await doc.ref.update({ done: true, recoveredAt: now, delayMinutes })
          logger.warn('[checkShiftStartDelays] recuperación emitida', { plant, shiftDoc, delayMinutes })
          continue
        }

        if (veredicto === 'expire') {
          logger.info('[checkShiftStartDelays] expirado sin proceso (día sin producción)', { plant, shiftDoc })
        } else {
          logger.info('[checkShiftStartDelays] turno con piezas OK', { plant, shiftDoc, totalCycles })
        }
      } catch (e) {
        logger.error('[checkShiftStartDelays] error procesando', { plant, shiftDoc, err: e.message })
      }
      await doc.ref.update({ done: true })
    }
  },
)

// ── checkShiftEndBriefs ───────────────────────────────────────────────────────
// Cron cada 5 minutos. Brief de FIN de turno a Telegram/push: piezas por máquina,
// total vs target oficial, uptime, paros y calidad Grader si hay Excel.
//
// Diseño SIN colección de checks (a diferencia del delay-check de inicio): el
// fin real de un turno derivado de intervals (`scheduledEnd`) CRECE sync a sync
// mientras el turno sigue vivo — un check creado al inicio quedaría obsoleto.
// En su lugar, cada corrida lee los docs padre de hoy y ayer (≤ ~8 docs por
// planta), evalúa el fin vigente y marca `endBriefSentAt` en el propio doc
// (transacción) como idempotencia. Sin colección nueva ni índice compuesto.
//
// Momento de envío: max(officialSchedule.end, scheduledEnd) + delayMinutes, y
// además se espera a que la línea DEJE de producir (ver la cola más abajo).
// El max cubre turnos que se alargan más allá del horario oficial (hora extra
// al final) y el delay deja que el último sync (cada 5 min) complete la data.

/** Tope de espera por la cola: pasado esto el brief sale igual. */
const MAX_ESPERA_COLA_MS = 2 * 60 * 60_000

exports.checkShiftEndBriefs = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'America/Santiago', region: 'us-central1' },
  async () => {
    const now = new Date()
    const hoy = shoplogixSyncMod.currentDateKey()
    const ayer = (() => {
      const d = new Date(`${hoy}T12:00:00Z`)
      d.setUTCDate(d.getUTCDate() - 1)
      return d.toISOString().slice(0, 10)
    })()

    for (const plant of shoplogixSyncMod.ACTIVE_PLANTS) {
      let config = null
      for (const dk of [ayer, hoy]) {
        let snap
        try {
          snap = await db.collection(`shoplogix/${plant}/shifts`)
            .where(FieldPath.documentId(), '>=', `${dk}_`)
            .where(FieldPath.documentId(), '<=', `${dk}_\uf8ff`)
            .get()
        } catch (e) {
          logger.error('[checkShiftEndBriefs] query error', { plant, dk, err: e.message })
          continue
        }

        for (const docSnap of snap.docs) {
          const data = docSnap.data()
          const shiftId = data.shiftId || docSnap.id.split('_').slice(1).join('_')
          if (shiftId === 'Unscheduled') continue          // no es un turno
          if (data.endBriefSentAt) continue                 // ya enviado

          const officialEnd  = data.officialSchedule?.end?.toDate?.() ?? null
          const derivedEnd   = data.scheduledEnd?.toDate?.() ?? null
          const end = officialEnd && derivedEnd
            ? new Date(Math.max(officialEnd.getTime(), derivedEnd.getTime()))
            : (officialEnd ?? derivedEnd)
          if (!end) continue

          config = config ?? await getShoplogixNotifConfig(plant)
          if (!config.shiftEnd.enabled) continue
          // OJO escalas de tiempo: `end` viene en wall-clock-as-UTC (hora Chile
          // "disfrazada" de UTC, como todo lo derivado de intervals), pero `now`
          // es UTC REAL. Sin la conversión, `now` alcanza el valor del cierre
          // ~4h ANTES de que en Chile sea esa hora → el brief salía a mitad de
          // turno (p.ej. 13:25 para un turno que cierra 17:15) con cifras
          // parciales, y checkShiftReconciliation mandaba la "corrección"
          // después. Mismo bug de escalas que el freeze del 19-07 (sync.js,
          // scheduledEndReal).
          const endReal = new Date(
            end.getTime() + shoplogixPolling.chileUtcOffsetHours(now) * 3600_000,
          )
          const fireAt = new Date(endReal.getTime() + (config.shiftEnd.delayMinutes ?? 10) * 60_000)
          if (now < fireAt) continue

          // ── La línea sigue produciendo después del horario ───────────────
          // Shoplogix cierra el turno a hora fija y manda lo que venga después
          // al bucket `Unscheduled`. En Filete pasa TODOS los días: el 10-ago
          // el turno "cerró" 15:30 y la línea trabajó hasta las 16:27. Con la
          // regla vieja el brief salía 15:40 anunciando 4.410 piezas cuando la
          // jornada terminó en 4.915 — el mismo recorte que ya se corrigió en
          // el monitor público y en la matriz.
          //
          // Se lee la cola SOLO cuando el turno ya venció (una vez por turno,
          // no en cada corrida de 5 min) y se posterga el brief mientras siga
          // entrando producción. `MAX_ESPERA_COLA_MS` es el tope: pase lo que
          // pase el brief sale, aunque el sensor quede colgado en uptime.
          let machines = []
          let outside = null
          let baseline = null
          try {
            const machinesSnap = await docSnap.ref.collection('machines').get()
            machines = machinesSnap.docs.map((m) => {
              const x = m.data()
              return {
                id: m.id,
                // machineid hace falta para reconstruir la clave de la anotación
                // de causa de cada paro (ver contarParosSinCausa).
                machineid: x.machineid || m.id,
                machineName: x.machineName || m.id,
                totalCycles: x.totalCycles || 0,
                shiftRuntime: x.shiftRuntime || 0,
                intervals: x.intervals || [],
                states: x.states || [],
              }
            }).sort((a, b) => a.machineName.localeCompare(b.machineName, 'es'))

            // Foto de lo que Shoplogix tiene en el doc del turno, ANTES de
            // sumarle la cola: es contra esto que compara checkShiftReconciliation
            // (lee `data.machines` del padre, que nunca incluye la cola). Sin
            // esta foto, el brief reportaría 4.915 y la reconciliación vería
            // 4.410 → una "corrección Shoplogix" falsa cada día en Filete.
            baseline = {
              total: machines.reduce((a, m) => a + m.totalCycles, 0),
              perMachine: machines.map((m) => ({ name: m.machineName, totalCycles: m.totalCycles })),
            }

            outside = await publicMonitorMod.sumarColaAMaquinas(
              db, plant, docSnap.id, data, machines,
            )
          } catch (e) {
            // Sin la cola no se puede afirmar el total: se reintenta en 5 min
            // en vez de mandar una cifra que ya sabemos incompleta.
            logger.error('[checkShiftEndBriefs] error leyendo máquinas/cola', { plant, doc: docSnap.id, err: e.message })
            continue
          }

          const topeEspera = new Date(endReal.getTime() + MAX_ESPERA_COLA_MS)
          if (outside.lastPieceAt && now < topeEspera) {
            const cierreCola = new Date(
              outside.lastPieceAt.getTime()
              + shoplogixPolling.chileUtcOffsetHours(now) * 3600_000
              + (config.shiftEnd.delayMinutes ?? 10) * 60_000,
            )
            if (now < cierreCola) {
              logger.info('[checkShiftEndBriefs] la línea sigue produciendo — brief postergado', {
                plant, doc: docSnap.id, ultimaPieza: outside.lastPieceAt.toISOString(),
              })
              continue
            }
          }

          // Idempotencia: solo la corrida que logra estampar endBriefSentAt envía.
          const gano = await db.runTransaction(async (tx) => {
            const fresh = await tx.get(docSnap.ref)
            if (fresh.data()?.endBriefSentAt) return false
            tx.update(docSnap.ref, { endBriefSentAt: new Date() })
            return true
          }).catch((e) => {
            logger.error('[checkShiftEndBriefs] tx error', { plant, doc: docSnap.id, err: e.message })
            return false
          })
          if (!gano) continue

          try {
            // `machines` ya viene leída y con la cola sumada (arriba): sus
            // `totalCycles` y `states` describen la JORNADA, no el recorte de
            // Shoplogix. `shiftRuntime` se deja intacto a propósito — es el
            // uptime que calcula Shoplogix para su ventana y no se puede
            // recomponer para la cola sin inventar.

            // Turnos sin producción real (bucket de ruido o lote de prueba):
            // marcar y no molestar. El umbral es POR PLANTA — 50 piezas es nada
            // en el eviscerado pero es un lote de prueba entero en Filete (caso
            // real 2026-07-28: 59 piezas dispararon un brief).
            const total = machines.reduce((a, m) => a + m.totalCycles, 0)
            const minPieces = config.shiftEnd?.minPieces ?? 50
            if (total < minPieces) {
              logger.info('[checkShiftEndBriefs] turno sin producción — sin brief', { plant, doc: docSnap.id, total, minPieces })
              continue
            }

            // Calidad Grader si existe el summary (exacto; chonchi además usa
            // nombres legacy "Turno día"/"Turno noche" en sus Excel).
            let grader = null
            const shiftIdCandidates = [shiftId]
            if (plant === 'chonchi') {
              const startHour = data.scheduledStart?.toDate?.()?.getUTCHours?.() ?? 12
              shiftIdCandidates.push(startHour >= 19 || startHour < 7 ? 'Turno noche' : 'Turno día')
            }
            for (const cand of shiftIdCandidates) {
              const gs = await db.collection('graderDailySummaries')
                .where('dateKey', '==', data.dateKey ?? dk)
                .where('shiftId', '==', cand)
                .limit(1).get()
              if (!gs.empty) {
                const g = gs.docs[0].data()
                grader = { pointZeroPct: g.pointZeroPct ?? 0, totalPieces: g.totalPieces ?? 0 }
                break
              }
            }

            const plantLabel = SHOPLOGIX_PLANT_LABEL[plant] || plant
            // Horario REAL (derivado de intervals, no la plantilla oficial) — el
            // mismo campo que ya usa toda la app para mostrar turnos históricos.
            // officialSchedule (si existe) es la plantilla fija de Shoplogix y
            // puede no coincidir con lo que realmente se trabajó ese turno.
            const realSchedule = data.scheduledStart?.toDate?.() && data.scheduledEnd?.toDate?.()
              ? { start: data.scheduledStart.toDate(), end: data.scheduledEnd.toDate() }
              : null
            // Ventana de la primera a la última pieza. En líneas cuyo turno no
            // está acotado en Shoplogix (Filete: "Turno Dia" = 24 h) es la única
            // que informa algo; el composer decide cuál mostrar.
            const effectiveSchedule = data.effectiveStart?.toDate?.() && data.effectiveEnd?.toDate?.()
              ? { start: data.effectiveStart.toDate(), end: data.effectiveEnd.toDate() }
              : null

            // Paros que el sensor midió y siguen sin causa anotada. El brief es
            // el momento en que alguien todavía se acuerda de lo que pasó.
            const stopsWithoutCause = await contarParosSinCausa({
              plant,
              dateKey: data.dateKey ?? dk,
              shiftId,
              machines,
              stoppageMinMinutes: config.events?.stoppageMinMinutes ?? 3,
            })
            const msg = turnoBriefMod.componerBriefFinTurno({
              plantLabel,
              shiftId,
              dateKey: data.dateKey ?? dk,
              machines,
              officialTargets: data.officialTargetsByMachineId ?? null,
              currentJob: data.currentJob ?? null,
              grader,
              realSchedule,
              effectiveSchedule,
              stopsWithoutCause,
              plannedTargetPieces: shoplogixMachinesMod.PLANT_SHIFT_TARGET_PIECES[plant] ?? null,
              outside,
            })
            const eligibleIds = await getShoplogixEligibleUsers(plant)
            await dispatchShoplogixNotif(
              config,
              eligibleIds,
              `🏁 Fin de turno · ${plantLabel}`,
              `${shiftId}: ${total.toLocaleString('es-CL')} piezas`,
              { plant, shiftDoc: docSnap.id },
              msg,
            )

            // Foto de lo reportado — la usa checkShiftReconciliation para
            // detectar si Shoplogix corrige el turno DESPUÉS de haberlo avisado
            // (pasa: re-etiquetado retroactivo, ver shoplogixSyncWakeup).
            // `total`/`perMachine` describen el doc del turno SIN la cola, que es
            // lo que la reconciliación vuelve a leer más tarde. Lo que se reportó
            // de verdad va aparte, para que quede registro de la cifra anunciada.
            await docSnap.ref.set({
              endBriefSnapshot: {
                total: baseline.total,
                perMachine: baseline.perMachine,
                totalReportado: total,
                outsidePieces: outside.pieces,
                sentAt: new Date(),
              },
            }, { merge: true })

            logger.info('[checkShiftEndBriefs] brief enviado', { plant, doc: docSnap.id, total })
          } catch (e) {
            logger.error('[checkShiftEndBriefs] error componiendo/enviando', { plant, doc: docSnap.id, err: e.message })
          }
        }
      }
    }
  },
)

// ── checkShiftReconciliation ─────────────────────────────────────────────────
// Cron cada 30 minutos. Verifica que el brief de FIN de turno ya enviado (ver
// `endBriefSnapshot` en checkShiftEndBriefs) siga coincidiendo con lo que
// Shoplogix reporta ahora. Existe porque Shoplogix corrige datos DESPUÉS de
// cerrado el turno (re-etiquetado retroactivo — el mismo motivo por el que
// `shoplogixSyncWakeup` re-sincroniza "ayer" cada hora): sin esto, una
// corrección llega calladita a Firestore y nadie se entera de que el número
// que ya se reportó cambió.
//
// Dos pasadas por turno (+3h y +24h desde el envío del brief): la de 3h agarra
// correcciones rápidas (Shoplogix termina de cuadrar el cierre); la de 24h
// coincide con la ventana en que shoplogixSyncWakeup re-sincroniza el día
// anterior. Idempotente vía `reconciliationChecks.{3h,24h}.done` en el propio doc.
exports.checkShiftReconciliation = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'America/Santiago', region: 'us-central1' },
  async () => {
    const now = new Date()
    const hoy = shoplogixSyncMod.currentDateKey()
    const dateKeysToScan = [0, 1, 2].map((n) => {
      const d = new Date(`${hoy}T12:00:00Z`)
      d.setUTCDate(d.getUTCDate() - n)
      return d.toISOString().slice(0, 10)
    })

    const CHECKS = [
      { key: '3h', afterMs: 3 * 3600 * 1000 },
      { key: '24h', afterMs: 24 * 3600 * 1000 },
    ]
    // Umbral de "corrección real" (no ruido de redondeo): diferencia absoluta
    // relevante O relativa, lo que dispare primero.
    const DIFF_ABS_THRESHOLD = 20
    const DIFF_PCT_THRESHOLD = 3

    for (const plant of shoplogixSyncMod.ACTIVE_PLANTS) {
      for (const dk of dateKeysToScan) {
        let snap
        try {
          snap = await db.collection(`shoplogix/${plant}/shifts`)
            .where(FieldPath.documentId(), '>=', `${dk}_`)
            .where(FieldPath.documentId(), '<=', `${dk}_`)
            .get()
        } catch (e) {
          logger.error('[checkShiftReconciliation] query error', { plant, dk, err: e.message })
          continue
        }

        for (const docSnap of snap.docs) {
          const data = docSnap.data()
          const snapshot = data.endBriefSnapshot
          if (!snapshot?.sentAt) continue // sin brief enviado, nada que verificar

          const sentAt = snapshot.sentAt.toDate?.() ?? new Date(snapshot.sentAt)
          const checks = data.reconciliationChecks || {}
          const dueCheck = CHECKS.find(
            (c) => !checks[c.key]?.done && (now.getTime() - sentAt.getTime()) >= c.afterMs,
          )
          if (!dueCheck) continue

          try {
            // `machines` del doc padre ya trae los agregados (mismo array que
            // usa la vista mensual) — 0 reads extra a la subcolección.
            const currentMachines = Array.isArray(data.machines) ? data.machines : []
            const currentTotal = currentMachines.reduce((a, m) => a + (m.totalCycles || 0), 0)
            const snapshotTotal = snapshot.total || 0
            const diff = currentTotal - snapshotTotal
            const pct = snapshotTotal > 0 ? (Math.abs(diff) / snapshotTotal) * 100 : (currentTotal > 0 ? 100 : 0)
            const isCorrection = Math.abs(diff) > DIFF_ABS_THRESHOLD || pct > DIFF_PCT_THRESHOLD

            const update = {
              reconciliationChecks: {
                ...checks,
                [dueCheck.key]: { done: true, at: now, diff, pctDiff: Math.round(pct * 10) / 10 },
              },
            }

            if (isCorrection) {
              const shiftId = data.shiftId || docSnap.id.split('_').slice(1).join('_')
              const plantLabel = SHOPLOGIX_PLANT_LABEL[plant] || plant
              const dateKey = data.dateKey ?? dk
              update.correctionDetected = true
              update.reconciliationNote =
                `Total cambió de ${snapshotTotal.toLocaleString('es-CL')} a ${currentTotal.toLocaleString('es-CL')} `
                + `piezas (${diff > 0 ? '+' : ''}${diff.toLocaleString('es-CL')}) tras el brief de fin de turno`

              const perMachineLines = currentMachines.map((m) => {
                const before = snapshot.perMachine?.find((s) => s.name === m.machineName)?.totalCycles ?? 0
                const d = (m.totalCycles || 0) - before
                return d !== 0
                  ? `  · ${m.machineName}: ${before.toLocaleString('es-CL')} → ${(m.totalCycles || 0).toLocaleString('es-CL')} (${d > 0 ? '+' : ''}${d})`
                  : null
              }).filter(Boolean)

              const msg = [
                `🔄 <b>Corrección Shoplogix · ${plantLabel}</b>`,
                `${shiftId} · ${dateKey}`,
                '',
                `Este turno ya se había reportado (brief de fin de turno) y Shoplogix cambió los datos después:`,
                `📦 Total: <b>${snapshotTotal.toLocaleString('es-CL')}</b> → <b>${currentTotal.toLocaleString('es-CL')}</b> piezas`,
                ...perMachineLines,
                '',
                `Verificación ${dueCheck.key} post-brief.`,
              ].join('\n')

              const config = await getShoplogixNotifConfig(plant)
              const eligibleIds = await getShoplogixEligibleUsers(plant)
              await dispatchShoplogixNotif(
                config,
                eligibleIds,
                `🔄 Corrección de datos · ${plantLabel}`,
                `${shiftId}: ${snapshotTotal.toLocaleString('es-CL')} → ${currentTotal.toLocaleString('es-CL')} piezas`,
                { plant, shiftDoc: docSnap.id },
                msg,
              )
              logger.info('[checkShiftReconciliation] corrección detectada y notificada', {
                plant, doc: docSnap.id, check: dueCheck.key, diff, pct,
              })
            } else {
              logger.info('[checkShiftReconciliation] sin cambios relevantes', {
                plant, doc: docSnap.id, check: dueCheck.key, diff, pct,
              })
            }

            await docSnap.ref.set(update, { merge: true })
          } catch (e) {
            logger.error('[checkShiftReconciliation] error verificando', { plant, doc: docSnap.id, err: e.message })
          }
        }
      }
    }
  },
)

// ─────────────────────────────────────────────────────────────────────────────
// animeEstrenosDiarios — Resumen diario 23:00 Chile → Telegram
// ─────────────────────────────────────────────────────────────────────────────
const ANIME_CHAT_ID = '52949422';
const ANIME_APP_URL = 'https://mantenimiento-planta-771a3.web.app/anime.html#estrenos';
const ANILIST_URL   = 'https://graphql.anilist.co';

async function _queryAniList(query, variables) {
  const { default: fetch } = await import('node-fetch');
  const r = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

async function _sendTelegram(botToken, chatId, text, replyMarkup) {
  const { default: fetch } = await import('node-fetch');
  const body = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// Offset de un timezone en minutos para una fecha dada (DST-safe).
// Chile alterna CLT (UTC-4) y CLST (UTC-3) — calcular dinámicamente, no hardcodear.
function _tzOffsetMin(date, timeZone) {
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tz  = new Date(date.toLocaleString('en-US', { timeZone }));
  return Math.round((tz.getTime() - utc.getTime()) / 60000);
}

async function _runAnimeEstrenos(botToken) {
  // Día calendario en Santiago. FIX timezone (2026-05-20): antes dateKey usaba UTC
  // vía toISOString(), desfasado del cron 23:00 Santiago (= 03:00 UTC día siguiente).
  // Causaba: log decía día N+1, mensaje al usuario mostraba día N. Ahora todo es Santiago.
  const now = new Date();
  const dateKey = now.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); // "YYYY-MM-DD" Santiago

  // Check if already sent today
  const sentDoc = await db.collection('anime_notifications').doc(dateKey).get();
  if (sentDoc.exists && sentDoc.data().sent) {
    logger.info('[anime] Notificación del día ya enviada:', dateKey);
    return;
  }

  // Query AniList: episodes aired today (medianoche Santiago → now + buffer)
  const [y, mo, d] = dateKey.split('-').map(Number);
  const offsetMin = _tzOffsetMin(now, 'America/Santiago'); // -240 (CLT) o -180 (CLST)
  const from = Math.floor((Date.UTC(y, mo - 1, d, 0, 0, 0) - offsetMin * 60000) / 1000);
  const to   = Math.floor(Date.now() / 1000) + 3600;
  const GQL = `query($f:Int,$t:Int){Page(page:1,perPage:50){airingSchedules(airingAt_greater:$f,airingAt_lesser:$t){episode airingAt media{id title{romaji english}averageScore format}}}}`;
  const json = await _queryAniList(GQL, { f: from, t: to });
  const schedules = json.data?.Page?.airingSchedules || [];

  if (!schedules.length) {
    logger.info('[anime] Sin estrenos hoy:', dateKey);
    return;
  }

  // Read user's tracked anime from Firestore
  const listsDoc = await db.collection('animelists').doc(ANIME_CHAT_ID).get();
  const lists = listsDoc.exists ? listsDoc.data() : {};
  const trackedIds = new Set();
  const trackedMap = {};
  for (const [listName, animes] of Object.entries(lists)) {
    if (!Array.isArray(animes)) continue;
    for (const a of animes) {
      trackedIds.add(String(a.id));
      trackedMap[String(a.id)] = listName;
    }
  }

  // Clasificar en 3 grupos: premieres (ep 1, sigas o no), tracked (ep>1 seguidos), discovery (ep>1 no seguidos)
  const FMT = { MOVIE:'🎬', ONA:'🖥️', OVA:'📀', SPECIAL:'🌟', TV:'📺', TV_SHORT:'📺' };
  const LIST_EMOJI = { viendo:'▶️', interesante:'⭐', pendiente:'📌', completado:'✅', descartado:'❌' };

  const premieres = [];   // ep 1 — destacados arriba (lo verdaderamente nuevo)
  const tracked   = [];   // ep>1 de series que sigues
  const discovery = [];   // ep>1 de series que no sigues

  for (const s of schedules) {
    const m  = s.media;
    const id = String(m.id);
    const title = (m.title.english || m.title.romaji).substring(0, 36);
    const score = m.averageScore ? ` ⭐${m.averageScore}` : '';
    const fmt   = FMT[m.format] || '🎞';
    const ep    = s.episode;
    const time  = new Date(s.airingAt * 1000).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', timeZone:'America/Santiago' });
    const line  = `${fmt} <b>${title}</b> ep${ep}${score} · ${time}`;
    const isTracked = trackedIds.has(id);
    const emoji = isTracked ? (LIST_EMOJI[trackedMap[id]] || '▶️') : '';

    if (ep === 1) {
      // Premiere: si la sigues muestra el emoji de tu lista; si no, solo la línea (el fmt ya trae 🎬/📺/etc)
      premieres.push(emoji ? `${emoji} ${line}` : line);
    } else if (isTracked) {
      tracked.push(`${emoji} ${line}`);
    } else {
      discovery.push(line);
    }
  }

  // Build message — dateLabel derivado de dateKey (mediodía UTC → día calendario = dateKey) para coherencia con el dedup
  const dateLabel = new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long', timeZone:'UTC' });
  const dateCapitalized = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  let text = `📺 <b>Estrenos del día — ${dateCapitalized}</b>\n`;

  if (premieres.length) {
    text += `\n🆕 <b>Estrenos nuevos · ep 1 (${premieres.length}):</b>\n`;
    text += premieres.join('\n');
  }
  if (tracked.length) {
    text += `\n\n⭐ <b>Tus series (${tracked.length}):</b>\n`;
    text += tracked.join('\n');
  }
  if (discovery.length) {
    const show = discovery.slice(0, 8);
    const rest = discovery.length - show.length;
    text += `\n\n📡 <b>Descubrimiento (${discovery.length}):</b>\n`;
    text += show.join('\n');
    if (rest > 0) text += `\n<i>… y ${rest} más en la app</i>`;
  }

  const replyMarkup = {
    inline_keyboard: [[
      { text: '🎌 Ver todos en Mini App', web_app: { url: ANIME_APP_URL } }
    ]]
  };

  const result = await _sendTelegram(botToken, ANIME_CHAT_ID, text, replyMarkup);
  logger.info('[anime] Telegram result:', result.ok, result.description || '');

  // Mark as sent in Firestore
  await db.collection('anime_notifications').doc(dateKey).set({
    sent: true, sentAt: FieldValue.serverTimestamp(),
    premieres: premieres.length, tracked: tracked.length, discovery: discovery.length, total: schedules.length,
  });
}

exports.animeEstrenosDiarios = onSchedule(
  {
    schedule: 'every day 23:00',
    timeZone: 'America/Santiago',
    timeoutSeconds: 60,
    memory: '256MiB',
    retryCount: 0,
    secrets: ['ANIME_BOT_TOKEN'],
  },
  async () => {
    const token = process.env.ANIME_BOT_TOKEN;
    if (!token) { logger.error('[anime] ANIME_BOT_TOKEN no configurado'); return; }
    await _runAnimeEstrenos(token);
  }
);

// Disparo manual del chequeo de estrenos — herramienta de admin, ningún cliente la llama.
exports.animeEstrenosManual = onRequest(
  { region: 'us-central1', secrets: ['ANIME_BOT_TOKEN'] },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('POST only'); return; }
    if (!requireAdminKey(req, res)) return;
    const token = process.env.ANIME_BOT_TOKEN;
    if (!token) { res.status(500).json({ error: 'ANIME_BOT_TOKEN no configurado' }); return; }
    await _runAnimeEstrenos(token);
    res.json({ ok: true });
  }
);

// ═══════════════════════════════════════════════════════════════════
// STOCK BAJO MÍNIMO — Notificación al registrar conteo
// ═══════════════════════════════════════════════════════════════════

/**
 * stockAuditLog/{logId} onCreate → Push FCM + Telegram cuando bajoMinimo === true
 * Fuente: bot Mini App o PWA (campo source: 'bot' | 'pwa')
 */
exports.onStockConteoCreated = onDocumentCreated('stockAuditLog/{logId}', async (event) => {
  const data = event.data?.data()
  if (!data) return

  // Solo notificar cuando el stock queda bajo mínimo
  if (data.bajoMinimo !== true) return

  const {
    repuestoName, machineName, cantidad, stockMinimo,
    codigoSAP, userName, machineId, repuestoId, source,
  } = data

  const repLabel     = repuestoName || codigoSAP || 'Repuesto'
  const machineLabel = machineName  || machineId  || 'Equipo'
  const sourceLabel  = source === 'pwa' ? 'PWA' : 'Bot'
  const title = '⚠️ Stock bajo mínimo'
  const body  = `${repLabel} → ${cantidad}/${stockMinimo} en ${machineLabel}`

  // ── FCM: admins y supervisores ──────────────────────────────
  const adminIds = await getSupervisorsAndAdmins()
  const tokens   = await getTokensForUsers(adminIds)

  if (tokens.length > 0) {
    await sendNotification(tokens, title, body, {
      type:       'STOCK_BAJO',
      machineId:  machineId  || '',
      repuestoId: repuestoId || '',
      url:        '/repuestos',
    })
    logger.info('Stock bajo notificado', { repLabel, machineLabel, cantidad, stockMinimo, tokens: tokens.length })
  }

  // ── Telegram: topic de repuestos ────────────────────────────
  const repTopicId = getTopicId('repuestos')
  await sendTelegramMessage(
    `⚠️ <b>Stock bajo mínimo</b> <i>(${sourceLabel})</i>\n\n` +
    `📦 <b>${repLabel}</b>\n` +
    `🔢 Cantidad: <b>${cantidad}</b> (mín: ${stockMinimo})\n` +
    `🏭 ${machineLabel}\n` +
    `👤 ${userName || 'usuario'}`,
    undefined,
    { topicId: repTopicId }
  )
})

// ═══════════════════════════════════════════════════════════════════
// PROTOCOLO BAADER 142 — recordatorio semanal y alerta de tendencia
// ═══════════════════════════════════════════════════════════════════
// El módulo Perilla 5 ya deja registrar los 13 contadores del Upgrade Kit y ver
// la tendencia, pero hay que acordarse de ir a mirarla. Estas dos funciones hacen
// que el dato salga a buscar a la persona: sin esto, la promesa de "intervenir
// antes de que la máquina pare" depende de que alguien se acuerde.
// La lógica (umbrales, tendencia, redacción) vive aparte y con tests:
// functions/baader142/protocoloAlertas.js
const protocoloAlertas = require('./baader142/protocoloAlertas')

const PROTOCOLO_COL = 'baader142Protocolo'

/** Fecha de Santiago en YYYY-MM-DD (las lecturas se guardan con la fecha local). */
function fechaChile(offsetDias = 0) {
  const d = new Date(Date.now() + offsetDias * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/**
 * Manda el aviso del protocolo al DM del bot Y al grupo.
 *
 * Por qué a los dos: los avisos operativos que la jefatura lee de verdad llegan al
 * chat privado con @antarfood_mant_bot (es el default de Shoplogix), mientras que
 * el equipo de turno vive en el grupo. Mandando solo al grupo, el aviso existía
 * pero nadie lo miraba; mandando solo al DM, el equipo no se entera.
 */
function enviarAvisoProtocolo(msg) {
  const topicId = getTopicId('general')
  return Promise.all([
    sendTelegramMessage(msg, ARIA_ADMIN_CHAT_ID),
    sendTelegramMessage(msg, undefined, topicId ? { topicId } : {}),
  ])
}

/** Las dos lecturas anteriores de una máquina: con tres puntos se puede decir
 *  "sube dos seguidas", que es el criterio de tendencia. */
async function lecturasPreviasBaader(plantId, maquina, excluirId) {
  const snap = await db.collection(PROTOCOLO_COL)
    .where('plantId', '==', plantId || 'chonchi')
    .where('maquina', '==', maquina)
    .orderBy('fecha', 'desc')
    .orderBy('createdAt', 'desc')
    .limit(3)
    .get()
  return snap.docs
    .filter((d) => d.id !== excluirId)   // la recién creada ya aparece en la query
    .map((d) => d.data())
    .slice(0, 2)
}

/**
 * Lectura nueva del protocolo → se evalúa contra el historial de ESA máquina y se
 * avisa solo si hay algo que mirar. Silencio cuando está sana: un canal que avisa
 * siempre se deja de leer.
 */
// `region` explícita: sin ella, firebase-functions v7 crea la función en la región
// de la base de datos (southamerica-west1) y el deploy termina en error al no poder
// configurar la política de limpieza de artefactos de esa región nueva. El resto de
// los triggers del repo corren en us-central1 aunque su trigger sea de la BD chilena.
exports.onProtocoloBaader142Created = onDocumentCreated(
  { document: `${PROTOCOLO_COL}/{lecturaId}`, region: 'us-central1' },
  async (event) => {
    const actual = event.data?.data()
    if (!actual || !actual.maquina) return

    let previas = []
    try {
      previas = await lecturasPreviasBaader(actual.plantId, actual.maquina, event.params.lecturaId)
    } catch (err) {
      // Sin historial se evalúa igual: los umbrales absolutos no lo necesitan.
      logger.warn('protocolo baader142: no se pudo leer el historial', err)
    }

    const ev = protocoloAlertas.evaluarLectura(actual, previas)
    const msg = protocoloAlertas.componerAlerta(ev)
    if (!msg) {
      logger.info(`protocolo baader142: ${actual.maquina} sin alertas`)
      return
    }

    await enviarAvisoProtocolo(msg)
    logger.info(`protocolo baader142: ${ev.alertas.length} alerta(s) en ${actual.maquina}`)
  }
)

/**
 * Viernes 16:30 — recordatorio de registrar el protocolo antes de terminar el turno.
 * Solo manda mensaje si falta alguna de las tres máquinas; si están todas, calla.
 */
exports.recordatorioProtocoloBaader142 = onSchedule(
  { schedule: '30 16 * * 5', timeZone: 'America/Santiago', region: 'us-central1' },
  async () => {
    const desde = fechaChile(-7)
    const registradas = []
    const ultimaFecha = {}

    // Una query por máquina (3 en total): reusa el índice que ya existe en vez de
    // pedir uno nuevo solo para esto.
    for (const id of Object.keys(protocoloAlertas.MAQUINAS)) {
      try {
        const snap = await db.collection(PROTOCOLO_COL)
          .where('plantId', '==', 'chonchi')
          .where('maquina', '==', id)
          .orderBy('fecha', 'desc')
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get()
        const ultima = snap.docs[0]?.data()
        if (!ultima) continue
        ultimaFecha[id] = ultima.fecha
        if (ultima.fecha >= desde) registradas.push(id)
      } catch (err) {
        logger.warn(`protocolo baader142: no se pudo consultar ${id}`, err)
      }
    }

    const msg = protocoloAlertas.componerRecordatorio(registradas, ultimaFecha)
    if (!msg) {
      logger.info('protocolo baader142: las tres máquinas registradas, sin recordatorio')
      return
    }
    await enviarAvisoProtocolo(msg)
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// MONITOR PÚBLICO DE TURNO — link/QR sin sesión, solo lectura
//
// Para que Control de Producción siga el avance de piezas de una línea (caso
// original: la Baader 200 de Filete) sin cuenta en la PWA ni acceso a
// Shoplogix. El token abre `/monitor/{token}`, que lee UN doc espejo público
// (`publicShiftMonitors/{token}`). Ver functions/publicMonitor.js.
//
// Se escribe SIEMPRE desde acá (Admin SDK): las reglas dejan la colección en
// `write: if false`. Así el payload público no puede ser inflado desde el
// cliente con datos que no queremos exponer.
// ═══════════════════════════════════════════════════════════════════════════

const publicMonitorMod = require('./publicMonitor')

/** Duraciones ofrecidas al generar el link (horas). 720 = 30 dias, para el
 *  link de linea que se pega en la pared y no se regenera. */
const MONITOR_TTL_CHOICES = [12, 24, 72, 168, 720]
const MONITOR_TTL_DEFAULT = 24

async function _assertSupervisorCaller(request) {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Login requerido')
  const snap = await db.collection('users').doc(uid).get()
  const rol = snap.exists ? snap.data()?.rol : null
  if (!['admin', 'supervisor'].includes(rol)) {
    throw new HttpsError('permission-denied', 'Solo supervisores o administradores')
  }
  return { uid, user: snap.data() || {} }
}

/**
 * Crea el link público de monitoreo y devuelve su token.
 *
 * Dos modos:
 *   - `shift` (default) — sigue UN turno; exige que ese turno exista.
 *   - `line`            — sigue el turno VIGENTE de la línea, resuelto de nuevo
 *                         en cada refresco. Es el link que no hay que regenerar
 *                         cada día. Se permite crearlo aunque ahora mismo no
 *                         haya turno corriendo (justamente sirve para mañana),
 *                         pero sí se exige que la línea tenga turnos alguna vez.
 *
 * data: { mode?, plantSlug, dateKey?, shiftId?, plantLineId?, areaLabel?,
 *         lineLabel?, machineKindLong?, targetPieces?, ttlHours? }
 */
exports.createPublicShiftMonitor = onCall({ region: 'us-central1' }, async (request) => {
  const { uid, user } = await _assertSupervisorCaller(request)

  const mode = request.data?.mode === 'line' ? 'line' : 'shift'
  const plantSlug = String(request.data?.plantSlug ?? '').trim()
  if (!plantSlug) throw new HttpsError('invalid-argument', 'plantSlug es obligatorio')

  let dateKey = String(request.data?.dateKey ?? '').trim()
  let shiftId = String(request.data?.shiftId ?? '').trim()
  let live = null
  let shiftDocId = null

  if (mode === 'line') {
    // Si la línea YA tiene un link vigente, se devuelve ESE. Generar uno nuevo
    // desde la app dejaría dos links de la misma línea y el que llega por
    // Telegram sería otro: el QR pegado en la pared y el que acaba de copiar el
    // supervisor tienen que ser el mismo.
    const ttlDays = MONITOR_TTL_CHOICES.includes(Number(request.data?.ttlHours))
      ? Number(request.data.ttlHours) / 24
      : 30
    const existente = await publicMonitorMod.ensureLineMonitor(db, plantSlug, {
      ttlDays: Math.max(1, Math.round(ttlDays)),
      meta: {
        plantLineId:     request.data?.plantLineId ?? null,
        areaLabel:       request.data?.areaLabel ?? null,
        lineLabel:       request.data?.lineLabel ?? null,
        machineKindLong: request.data?.machineKindLong ?? null,
        targetPieces:    Number.isFinite(Number(request.data?.targetPieces)) && Number(request.data.targetPieces) > 0
          ? Number(request.data.targetPieces) : null,
      },
    })
    if (existente) {
      const doc = await db.collection(publicMonitorMod.COLLECTION).doc(existente.token).get()
      logger.info('[publicShiftMonitor] link de línea entregado', { token: existente.token, plantSlug, creado: existente.created, uid })
      return { token: existente.token, expiresAt: doc.data()?.expiresAt ?? null, ttlHours: doc.data()?.ttlHours ?? null, reused: !existente.created }
    }

    shiftDocId = await publicMonitorMod.resolveCurrentShiftDocId(db, plantSlug)
    if (shiftDocId) {
      live = await publicMonitorMod.buildMonitorLive(db, plantSlug, shiftDocId)
      dateKey = shiftDocId.slice(0, 10)
      shiftId = shiftDocId.slice(11)
    } else {
      // Sin turnos recientes: puede ser fin de semana o parada de planta. Se
      // deja nacer el link (mostrará "esperando el próximo turno"), pero no si
      // la línea NUNCA tuvo turnos — eso es un plantSlug mal escrito.
      const any = await db.collection(`shoplogix/${plantSlug}/shifts`).limit(1).get()
      if (any.empty) {
        throw new HttpsError('not-found', `La línea ${plantSlug} no tiene turnos sincronizados`)
      }
      dateKey = ''
      shiftId = ''
    }
  } else {
    if (!dateKey || !shiftId) {
      throw new HttpsError('invalid-argument', 'dateKey y shiftId son obligatorios en modo turno')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new HttpsError('invalid-argument', 'dateKey debe ser YYYY-MM-DD')
    }
    shiftDocId = `${dateKey}_${shiftId}`
    // El turno tiene que existir: un link que nace apuntando a la nada solo se
    // descubre cuando el destinatario lo abre y ve "sin datos".
    live = await publicMonitorMod.buildMonitorLive(db, plantSlug, shiftDocId)
    if (!live) {
      throw new HttpsError('not-found', `El turno ${shiftDocId} de ${plantSlug} no tiene datos sincronizados`)
    }
  }

  const ttlHours = MONITOR_TTL_CHOICES.includes(Number(request.data?.ttlHours))
    ? Number(request.data.ttlHours)
    : MONITOR_TTL_DEFAULT

  const token = randomUUID()
  const now = new Date()
  const createdBy = [user.nombre, user.apellido].filter(Boolean).join(' ').trim()
    || user.email || 'Supervisor'

  await db.collection(publicMonitorMod.COLLECTION).doc(token).set({
    token,
    mode,
    plantSlug,
    dateKey,
    shiftId,
    shiftDocId,
    // Clave de búsqueda del trigger: una sola igualdad, sin índice compuesto.
    // Los de línea se enganchan a CUALQUIER escritura de turno de su planta,
    // porque el turno al que apuntan cambia solo.
    scope: mode === 'line' ? `line|${plantSlug}` : `${plantSlug}|${shiftDocId}`,
    plantLineId:     request.data?.plantLineId ? String(request.data.plantLineId) : null,
    areaLabel:       request.data?.areaLabel ? String(request.data.areaLabel) : null,
    lineLabel:       request.data?.lineLabel ? String(request.data.lineLabel) : null,
    machineKindLong: request.data?.machineKindLong ? String(request.data.machineKindLong) : null,
    targetPieces:    Number.isFinite(Number(request.data?.targetPieces)) && Number(request.data.targetPieces) > 0
      ? Number(request.data.targetPieces)
      : null,
    createdBy,
    createdByUid: uid,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlHours * 3600 * 1000).toISOString(),
    ttlHours,
    live,
    // Historial desde el minuto uno: el link nace pudiendo deslizar hacia atrás.
    history: shiftDocId ? await publicMonitorMod.buildMonitorHistory(db, plantSlug, shiftDocId, []) : [],
  })

  logger.info('[publicShiftMonitor] creado', { token, mode, plantSlug, shiftDocId, ttlHours, uid })
  return { token, expiresAt: new Date(now.getTime() + ttlHours * 3600 * 1000).toISOString(), ttlHours }
})

/** Revoca (borra) un link público. Lo puede revocar su creador o un admin. */
exports.revokePublicShiftMonitor = onCall({ region: 'us-central1' }, async (request) => {
  const { uid, user } = await _assertSupervisorCaller(request)
  const token = String(request.data?.token ?? '').trim()
  if (!token) throw new HttpsError('invalid-argument', 'token requerido')

  const ref = db.collection(publicMonitorMod.COLLECTION).doc(token)
  const snap = await ref.get()
  if (!snap.exists) return { ok: true, alreadyGone: true }

  if (snap.data()?.createdByUid !== uid && user.rol !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo el creador o un admin puede revocar el link')
  }

  await ref.delete()
  logger.info('[publicShiftMonitor] revocado', { token, uid })
  return { ok: true }
})

/**
 * Refresca los monitores públicos cada vez que el sync reescribe el doc padre
 * de un turno (~cada 5 min mientras el turno corre).
 *
 * Se engancha al PADRE y no a `machines/{id}`: el padre se escribe una sola vez
 * por ciclo de sync, mientras que la subcolección dispara un evento por máquina
 * (3 en Eviscerado) y los tres compondrían el mismo payload.
 *
 * Atiende dos audiencias con una sola query (`in` de dos igualdades, sin índice
 * compuesto): los monitores de ESE turno y los de la LÍNEA completa. Estos
 * últimos no adoptan el turno del evento — vuelven a resolver cuál está
 * vigente, porque el re-sync móvil reescribe padres de días anteriores y
 * adoptarlos haría saltar el monitor a un turno viejo.
 */
exports.onShoplogixShiftWrittenPublicMonitor = onDocumentWritten(
  { document: 'shoplogix/{plant}/shifts/{shiftDoc}', region: 'us-central1' },
  async (event) => {
    const { plant, shiftDoc } = event.params
    const scopes = [`${plant}|${shiftDoc}`, `line|${plant}`]

    const monitors = await db.collection(publicMonitorMod.COLLECTION)
      .where('scope', 'in', scopes)
      .get()
    if (monitors.empty) return

    const nowIso = new Date().toISOString()
    const activos = monitors.docs.filter(d => String(d.data()?.expiresAt || '') > nowIso)
    if (activos.length === 0) return

    // El turno vigente se resuelve UNA vez por planta y se comparte entre todos
    // los monitores de línea de este evento.
    const currentByPlant = new Map()
    let refrescados = 0

    for (const d of activos) {
      try {
        const patch = await publicMonitorMod.buildMonitorPatch(db, d.data(), currentByPlant)
        if (!patch) continue
        await d.ref.set(patch, { merge: true })
        refrescados++
      } catch (err) {
        // Un monitor roto no puede tumbar el refresco de los demás.
        logger.error('[publicShiftMonitor] no se pudo refrescar', { token: d.id, error: err.message })
      }
    }

    if (refrescados > 0) {
      logger.info('[publicShiftMonitor] refrescados', {
        plant, shiftDoc, monitores: refrescados, turnoVigente: currentByPlant.get(plant) ?? null,
      })
    }
  },
)

// ═══════════════════════════════════════════════════════════════════════════
// TELEMETRÍA DEL MONITOR PÚBLICO — anónima
//
// Mide si Control de Producción realmente usa el link. Ver
// functions/publicMonitorStats.js para qué se guarda y, sobre todo, qué NO.
// ═══════════════════════════════════════════════════════════════════════════

const publicMonitorStatsMod = require('./publicMonitorStats')

/**
 * Registra una apertura o un latido del monitor público.
 *
 * Endpoint ABIERTO a propósito: lo llama una pantalla sin sesión. Las defensas
 * son que solo acepta tokens de monitores VIGENTES, que no escribe nada que
 * venga del cuerpo salvo contadores acotados, y que el `viewerId` se valida
 * contra un formato fijo. Un abusador con el link solo puede inflar sus propios
 * contadores de uso — no puede leer nada ni tocar los datos del turno.
 */
exports.publicMonitorPing = onRequest(
  { region: 'us-central1', cors: ALLOWED_ORIGINS, maxInstances: 10, memory: '256MiB', timeoutSeconds: 15 },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); return }

    const body = req.body || {}
    const token = String(body.token || '').trim()
    const viewerId = publicMonitorStatsMod.sanitizeViewerId(body.viewerId)
    const event = body.event === 'ping' ? 'ping' : 'open'

    if (!/^[a-f0-9-]{20,64}$/.test(token) || !viewerId) {
      res.status(400).json({ error: 'BAD_REQUEST' })
      return
    }

    try {
      const monitorSnap = await db.collection(publicMonitorMod.COLLECTION).doc(token).get()
      const monitor = monitorSnap.exists ? monitorSnap.data() : null
      // Un link vencido o revocado no acumula estadísticas: si no se puede
      // mirar, tampoco hay nada que contar.
      if (!monitor || String(monitor.expiresAt || '') <= new Date().toISOString()) {
        res.status(404).json({ error: 'NOT_FOUND' })
        return
      }

      const nowMs = Date.now()
      const nowWall = shoplogixPolling.toChileWall(new Date(nowMs))
      const ev = {
        viewerId,
        event,
        device: publicMonitorStatsMod.deviceKind(req.get('user-agent')),
        secs: Number(body.secs) || 0,
        viewingPast: body.viewingPast === true,
        nowMs,
        nowWall,
      }

      const ref = db.collection(publicMonitorStatsMod.COLLECTION_STATS).doc(token)
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const next = publicMonitorStatsMod.applyEvent(snap.exists ? snap.data() : null, ev)
        next.token = token
        next.plantSlug = monitor.plantSlug ?? null
        next.mode = monitor.mode ?? 'shift'
        tx.set(ref, next)
      })

      res.status(204).send('')
    } catch (err) {
      logger.error('[publicMonitorPing] error', { error: err.message })
      // Nunca romper la pantalla del visitante por un problema de telemetría.
      res.status(204).send('')
    }
  },
)
