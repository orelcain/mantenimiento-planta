// Cloud Functions – mantenimiento-planta  (secret GROQ_API_KEY v3)
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { logger } = require('firebase-functions')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { getDatabase } = require('firebase-admin/database')
const { getMessaging } = require('firebase-admin/messaging')
const { getStorage } = require('firebase-admin/storage')
const { randomUUID, createHmac } = require('crypto')
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

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.text()
      logger.error('Telegram sendMessage error', { status: response.status, err })
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
    await sendTelegramMessage(
      `${priorityEmoji} <b>Nueva incidencia ${incident.prioridad}${origenLabel}</b>\n\n` +
      `📋 ${incident.titulo || 'Sin título'}\n` +
      `👤 ${incident.creadoPorNombre || 'Desconocido'}\n` +
      `🔗 <a href="https://orelcain.github.io/mantenimiento-planta/incidents/${incidentId}">Ver detalle</a>`,
      undefined, { topicId: incTopicId }
    )
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
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'llama-3.3-70b-versatile',
          messages,
          temperature: temperature ?? 0.3,
          max_tokens: max_tokens || 2048,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Groq API error', { status: response.status, body: errorText })
        throw new Error(`Error del servicio de IA (${response.status})`)
      }

      const data = await response.json()
      return {
        content: data.choices?.[0]?.message?.content || '',
        usage: data.usage,
      }
    } catch (error) {
      logger.error('Groq proxy error:', error)
      throw new Error('Error al procesar la solicitud de IA')
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Gemini API error', { status: response.status, body: errorText })
        throw new Error(`Error del servicio Gemini (${response.status})`)
      }

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      return { content: text, usage: data.usageMetadata }
    } catch (error) {
      logger.error('Gemini proxy error:', error)
      throw new Error('Error al procesar la solicitud de Gemini')
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
        throw new Error(`Error del servicio DeepSeek (${response.status})`)
      }

      const data = await response.json()
      return {
        content: data.choices?.[0]?.message?.content || '',
        usage: data.usage,
      }
    } catch (error) {
      logger.error('DeepSeek proxy error:', error)
      throw new Error('Error al procesar la solicitud de DeepSeek')
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
exports.cacheDmStatus = onRequest(
  { region: 'us-central1', cors: ALLOWED_ORIGINS, maxInstances: 5 },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
    const d = req.body
    if (!d || typeof d.found !== 'boolean') return res.status(400).json({ error: 'invalid payload' })
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

// Endpoint HTTP para ejecutar manualmente el chequeo (testing / backup del scheduler)
exports.runClimaPortoCheck = onRequest(
  { region: 'us-central1', cors: ALLOWED_ORIGINS, timeoutSeconds: 30, memory: '256MiB' },
  async (req, res) => {
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
async function uploadPhotoToStorage(incidentId, buffer, idx) {
  const bucket = getStorageBucket()
  const token = randomUUID()
  const filename = `incidents/${incidentId}/telegram_${Date.now()}_${idx + 1}.jpg`
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
exports.telegramWebhook = onRequest({ region: 'us-central1' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
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
      await tgHandlePhoto(chatId, message, fromName, telegramUserId, incomingTopicId)
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
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN no configurado' })
    return
  }

  const webhookUrl =
    'https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/telegramWebhook'

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    })
    const result = await response.json()
    res.json({ webhookUrl, telegram: result })
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

  if (expectedHash !== hash) {
    logger.warn('mintTelegramAuthToken: HMAC inválido', { expected: expectedHash, got: hash })
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
      const result = await shoplogixSyncMod.syncDay({
        db,
        accessToken: auth.accessToken,
        cookie:      auth.cookie,
        plantSlug:   plantSlug || 'chonchi',
        dateKey:     dateKey   || undefined,
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
 * Wakeup scheduler — dispara cada hora durante ventana operativa.
 * Fase 2b.1: auto-login integrado. Si AUTH_EXPIRED y hay credenciales,
 * limpia el token guardado y el próximo ciclo (en 60min) hará re-login.
 */
exports.shoplogixSyncWakeup = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/Santiago',
    timeoutSeconds: 180,
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

    // Jitter anti-bot: delay aleatorio 0-120s para que las queries nunca lleguen
    // en el mismo segundo (Cloud Scheduler dispara exacto, pero Shoplogix verá
    // timestamps variables → patrón más humano).
    const jitterMs = Math.floor(Math.random() * 120_000)
    logger.info(`[shoplogixSyncWakeup] jitter ${Math.round(jitterMs / 1000)}s`)
    await new Promise(r => setTimeout(r, jitterMs))

    const auth = await resolveShoplogixAuth(logger)
    if (auth.mode === 'none') {
      logger.error('[shoplogixSyncWakeup] Sin auth configurada (SHOPLOGIX_USER/PASS o COOKIE) — skip')
      return
    }
    logger.info(`[shoplogixSyncWakeup] modo auth: ${auth.mode}`)

    // Sincroniza todas las plantas activas en paralelo (full-day — detecta turnos reales)
    const settled = await Promise.allSettled(
      shoplogixSyncMod.ACTIVE_PLANTS.map((plantSlug) =>
        shoplogixSyncMod.syncDay({
          db,
          accessToken: auth.accessToken,
          cookie:      auth.cookie,
          plantSlug,
          logger,
        })
      )
    )

    let authExpired = false
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        logger.info('[shoplogixSyncWakeup] OK', { result: outcome.value, authMode: auth.mode })
      } else {
        const err = outcome.reason
        if (err?.code === 'AUTH_EXPIRED') {
          authExpired = true
        } else {
          logger.error('[shoplogixSyncWakeup] error planta', { err: err?.message })
        }
      }
    }

    if (authExpired) {
      if (auth.mode === 'bearer') {
        await shoplogixTokenStore.clearStoredToken(db)
        logger.error('[shoplogixSyncWakeup] AUTH_EXPIRED (Bearer) — token limpiado, re-login en próximo ciclo')
      } else {
        logger.error('[shoplogixSyncWakeup] AUTH_EXPIRED (Cookie) — refrescar SHOPLOGIX_COOKIE manualmente')
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
    const auth = await resolveShoplogixAuth(logger)
    if (auth.mode === 'none') {
      res.status(500).json({ error: 'NO_AUTH' })
      return
    }
    const { plantSlug = 'yal', dateKey } = req.query || {}
    const dk = dateKey || (() => {
      const d = new Date()
      const chile = new Date(d.getTime() - 3 * 3600 * 1000)
      return `${chile.getUTCFullYear()}-${String(chile.getUTCMonth() + 1).padStart(2, '0')}-${String(chile.getUTCDate()).padStart(2, '0')}`
    })()

    // Una máquina de Yal para probar params específicos por máquina
    const machineid = (require('./shoplogix/machines').PLANT_MACHINES[plantSlug] || [])[0]?.machineid
    const start = `${dk.replace(/-/g, '')}T080000.000`
    const end   = (() => {
      const [y, m, d] = dk.split('-').map(Number)
      const next = new Date(Date.UTC(y, m - 1, d + 1))
      const nextKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
      return `${nextKey.replace(/-/g, '')}T080000.000`
    })()

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

    if (eligibleIds.length > 0) {
      // FCM push (canal existente — siempre activo por defecto)
      if (config.channels.push) {
        const tokens = await getTokensForUsers(eligibleIds)
        if (tokens.length > 0) {
          await sendNotification(tokens, title, body, {
            type: 'process_started', plant, shiftId, url: '/turno',
          })
          logger.info(`[onShoplogixShiftStarted] FCM enviado`, { eligible: eligibleIds.length, tokens: tokens.length })
        }
      }
      // Telegram (canal opcional)
      if (config.channels.telegram) {
        const topicId = getTopicId('general')
        await sendTelegramMessage(
          `🟢 <b>Proceso iniciado · ${plantLabel}</b>\n${shiftId} ha arrancado`,
          null,
          topicId ? { topicId } : {},
        )
      }
    }

    // Crear check de inicio demorado (para cron de verificación)
    if (config.shiftStart.enabled) {
      const scheduledStart = data.scheduledStart?.toDate?.() || new Date()
      const gracePeriodMs  = (config.shiftStart.gracePeriodMinutes || 20) * 60 * 1000
      const checkAt        = new Date(scheduledStart.getTime() + gracePeriodMs)
      await db.collection('shoplogixShiftDelayChecks').doc(`${plant}_${shiftDoc}`).set({
        plant, shiftDoc, shiftId, plantLabel,
        checkAt,
        done: false,
        createdAt: new Date(),
      })
      logger.info(`[onShoplogixShiftStarted] Delay check creado para ${checkAt.toISOString()}`)
    }
  },
)


// ── Sistema de notificaciones Shoplogix ───────────────────────────────────────
// Detecta primera pieza por Baader, hitos de piezas, detenciones y retrasos de
// inicio de turno. Configurable por planta desde Panel Admin.
// Colecciones:
//   notificationConfig/{plantSlug}      — config por planta
//   shoplogixNotifState/{plant_shiftDoc_machineId} — estado por máquina/turno
//   shoplogixShiftDelayChecks/{plant_shiftDoc}      — checks de inicio demorado

const SHOPLOGIX_PLANT_LABEL = { chonchi: 'Chonchi', yal: 'Yal', filete: 'Filete' }

const SHOPLOGIX_NOTIF_DEFAULTS = {
  channels:      { push: true, telegram: false },
  shiftStart:    { enabled: true, gracePeriodMinutes: 20 },
  firstPiece:    { enabled: true },
  pieceInterval: { enabled: false, every: 1000 },
  events:        { stoppage: true, microStoppage: false },
}

async function getShoplogixNotifConfig(plantSlug) {
  try {
    const snap = await db.collection('notificationConfig').doc(plantSlug).get()
    if (!snap.exists) return SHOPLOGIX_NOTIF_DEFAULTS
    const d = snap.data()
    return {
      channels:      { ...SHOPLOGIX_NOTIF_DEFAULTS.channels,      ...(d.channels      || {}) },
      shiftStart:    { ...SHOPLOGIX_NOTIF_DEFAULTS.shiftStart,    ...(d.shiftStart    || {}) },
      firstPiece:    { ...SHOPLOGIX_NOTIF_DEFAULTS.firstPiece,    ...(d.firstPiece    || {}) },
      pieceInterval: { ...SHOPLOGIX_NOTIF_DEFAULTS.pieceInterval, ...(d.pieceInterval || {}) },
      events:        { ...SHOPLOGIX_NOTIF_DEFAULTS.events,        ...(d.events        || {}) },
    }
  } catch (e) {
    logger.error('[shoplogix-notif] getShoplogixNotifConfig error', e)
    return SHOPLOGIX_NOTIF_DEFAULTS
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

async function dispatchShoplogixNotif(config, eligibleUserIds, title, body, data = {}, telegramMsg = null) {
  // URL profunda al turno específico para que el click en la notificación
  // abra la vista correcta y no solo el home de la app.
  // shiftDoc viene como `${dateKey}_${shiftLabel}` (ej "2026-05-03_Turno 2").
  // Ruta cliente: `analisis-grader/turno/{dateKey}__{shiftLabel}?linea={plantLineId}`
  const shiftDoc   = String(data.shiftDoc || '')
  const dateKey    = shiftDoc.slice(0, 10)
  const shiftLabel = shiftDoc.slice(11)
  const lineaId    = data.plant === 'yal' ? 'yal-eviscerado' : 'chonchi-eviscerado'
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
    const topicId = getTopicId('general')
    promises.push(sendTelegramMessage(telegramMsg, null, topicId ? { topicId } : {}))
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

      // Primera vez que vemos esta máquina/turno: inicializar baseline sin notificar.
      // Evita "catch-up" de historial al hacer un deploy mid-shift.
      if (!snap.exists) {
        tx.set(stateRef, {
          firstPieceSent:     cyclesAfter > 0,   // si ya tiene ciclos, no notificar
          lastNotifiedCycles: 0,
          downtimeCount:      downtimes.length,   // baseline — no notificar histórico
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

      // ── Detenciones ──────────────────────────────────────────────────────────
      if (config.events.stoppage && downtimes.length > (st.downtimeCount || 0)) {
        const newOnes = downtimes.slice(st.downtimeCount || 0)
        for (const stop of newOnes) {
          const dMin   = Math.round((stop.durationSec || 0) / 60)
          const durTxt = dMin > 0 ? `${dMin} min` : 'en curso'
          const reason = stop.reason || stop.name || 'Detención'
          toSend.push({
            title: `⛔ Detención · ${machineName}`,
            body:  `${reason} · ${durTxt} · ${plantLabel}`,
            tg:    `⛔ <b>Detención</b> — ${plantLabel}\n${machineName} · ${reason} · ${durTxt}`,
          })
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
// Si checkAt ya pasó y el turno aún tiene 0 piezas totales → alerta de retraso.
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
      const { plant, shiftDoc, shiftId, plantLabel } = doc.data()
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

        if (totalCycles === 0) {
          // Turno inició pero sin piezas — emitir alerta
          const label = plantLabel || SHOPLOGIX_PLANT_LABEL[plant] || plant
          const graceMins = config.shiftStart.gracePeriodMinutes || 20
          const eligibleIds = await getShoplogixEligibleUsers(plant)
          await dispatchShoplogixNotif(
            config,
            eligibleIds,
            `⚠️ Sin piezas · ${label}`,
            `${shiftId} arrancó hace ${graceMins} min pero sin piezas registradas`,
            { plant, shiftDoc },
            `⚠️ <b>Sin piezas registradas</b> — ${label}\n${shiftId} arrancó hace ${graceMins} min · Shoplogix no registra actividad`,
          )
          logger.warn('[checkShiftStartDelays] alerta emitida', { plant, shiftDoc, totalCycles })
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

exports.animeEstrenosManual = onRequest(
  { region: 'us-central1', secrets: ['ANIME_BOT_TOKEN'] },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('POST only'); return; }
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
