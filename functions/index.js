// Cloud Functions – mantenimiento-planta  (secret GROQ_API_KEY v3)
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { logger } = require('firebase-functions')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { getDatabase } = require('firebase-admin/database')
const { getMessaging } = require('firebase-admin/messaging')

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

  const payload = {
    notification: { title, body },
    data: {
      ...data,
      timestamp: Date.now().toString(),
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
    '<b>🔧 Equipos y Repuestos</b>\n' +
    '/equipo [nombre] — Info de un equipo\n' +
    '/equipo — Lista de equipos registrados\n' +
    '/repuesto [código o nombre] — Buscar repuesto\n' +
    '/repuestos [máquina] — Repuestos de una máquina\n\n' +
    '<b>📊 Turno</b>\n' +
    '/turno — Resumen del turno actual\n' +
    '/kpi — Indicadores del día\n\n' +
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
    const machinesSnap = await db.collection('machines').where('activa', '==', true).orderBy('orden').get()
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

const PWA_URL = 'https://orelcain.github.io/mantenimiento-planta/'

/**
 * /menu — Menú principal con botones interactivos
 */
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
    const snapshot = await db.collection('machines').where('activa', '==', true).orderBy('orden').get()
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
    const snapshot = await db.collection('machines').where('activa', '==', true).orderBy('orden').get()
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

  // ---- Mensajes de texto / comandos ----
  const message = update?.message || update?.edited_message

  if (!message?.text) {
    res.status(200).send('ok')
    return
  }

  const chatId = String(message.chat?.id)
  const text = message.text.trim()
  const fromName = message.from?.first_name || 'Técnico'
  const telegramUserId = String(message.from?.id || 'unknown')
  const incomingTopicId = message.message_thread_id || undefined

  // Verificar chat autorizado
  const allowedChatId = process.env.TELEGRAM_CHAT_ID
  if (allowedChatId && chatId !== allowedChatId) {
    logger.warn('Telegram message from unauthorized chat', { chatId })
    res.status(200).send('ok')
    return
  }

  try {
    if (/^\/(menu|start)/i.test(text)) {
      await tgHandleMenu(chatId, incomingTopicId)
    } else if (/^\/incidencia/i.test(text)) {
      await tgHandleIncidencia(chatId, text, fromName, telegramUserId, incomingTopicId)
    } else if (/^\/estado/i.test(text)) {
      await tgHandleEstado(chatId, incomingTopicId)
    } else if (/^\/(ayuda|help)/i.test(text)) {
      await tgHandleAyuda(chatId, incomingTopicId)
    } else if (/^\/equipo/i.test(text)) {
      await tgHandleEquipo(chatId, text, incomingTopicId)
    } else if (/^\/repuestos/i.test(text)) {
      await tgHandleRepuestosMaquina(chatId, text, incomingTopicId)
    } else if (/^\/repuesto/i.test(text)) {
      await tgHandleRepuesto(chatId, text, incomingTopicId)
    } else if (/^\/turno/i.test(text)) {
      await tgHandleTurno(chatId, incomingTopicId)
    } else if (/^\/kpi/i.test(text)) {
      await tgHandleKpi(chatId, incomingTopicId)
    } else if (!text.startsWith('/')) {
      if (text.length >= 10) {
        await tgHandleIncidencia(chatId, `/incidencia ${text}`, fromName, telegramUserId, incomingTopicId)
      } else {
        await sendTelegramMessage('ℹ️ Usá /menu o /ayuda para ver los comandos.', chatId, { topicId: incomingTopicId })
      }
    } else {
      await sendTelegramMessage('❓ Comando no reconocido. Usá /menu o /ayuda.', chatId, { topicId: incomingTopicId })
    }
  } catch (error) {
    logger.error('Error handling Telegram command', error)
    await sendTelegramMessage('❌ Error procesando el comando. Intentá de nuevo.', chatId, { topicId: incomingTopicId })
  }

  res.status(200).send('ok')
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

