// Cloud Functions – mantenimiento-planta  (secret GROQ_API_KEY v3)
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { logger } = require('firebase-functions')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getDatabase } = require('firebase-admin/database')
const { getMessaging } = require('firebase-admin/messaging')

initializeApp()

const db = getFirestore()

// RTDB se inicializa lazy (getDatabase() requiere FIREBASE_CONFIG, solo disponible en Cloud Functions runtime)
let _rtdb = null
function getRtdb() {
  if (!_rtdb) _rtdb = getDatabase()
  return _rtdb
}

// ==================== CONSTANTES ====================

/** Retención máxima de lecturas de sensores en RTDB: 30 días */
const SENSOR_RETENTION_DAYS = 30

// ==================== HELPERS ====================

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
 * Enviar notificación a tokens específicos
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
// ==================== CLIMA PUERTO — ALERTAS AUTOMÁTICAS ====================

const CHONCHI_LAT = -42.62
const CHONCHI_LON = -73.77

function _normalizeRange(value, min, max) {
  if (max === min) return 0
  return Math.max(0, Math.min(1, (value - min) / (max - min)))
}

function _calcRiskIndex(sample) {
  const isStorm = [95, 96, 99].includes(sample.code)
  const isFog   = [45, 48].includes(sample.code)
  const c = {
    gust:       _normalizeRange(sample.gust,            30,   60)  * 100,
    wind:       _normalizeRange(sample.wind,            20,   45)  * 100,
    wave:       _normalizeRange(sample.wave,            1.0,  3.0) * 100,
    rain:       _normalizeRange(sample.rain,            1,    10)  * 100,
    pressure:   _normalizeRange(1015 - sample.pressure, 3,    25)  * 100,
    visibility: _normalizeRange(5000 - sample.visibility, 500, 4500) * 100,
    cloud:      _normalizeRange(sample.cloud,           65,  100)  * 100,
    humidity:   _normalizeRange(sample.humidity,        78,  100)  * 100,
    wavePeriod: _normalizeRange(8 - sample.wavePeriod,  0.5,   6)  * 100,
    storm:      isStorm ? 100 : 0,
    fog:        isFog   ?  90 : 0,
  }
  return Math.max(0, Math.min(100,
    c.gust       * 0.26 +
    c.wind       * 0.16 +
    c.wave       * 0.20 +
    c.rain       * 0.06 +
    c.pressure   * 0.05 +
    c.visibility * 0.07 +
    c.cloud      * 0.04 +
    c.humidity   * 0.03 +
    c.wavePeriod * 0.05 +
    c.storm      * 0.06 +
    c.fog        * 0.02
  ))
}

function _riskLevel(ri) {
  if (ri >= 65) return 'ALTO'
  if (ri >= 40) return 'MEDIO'
  return 'BAJO'
}

async function _getAllFcmTokens() {
  const snap = await db.collection('fcmTokens').get()
  const tokens = []
  snap.forEach(doc => {
    const t = doc.data()?.token
    if (t && typeof t === 'string') tokens.push(t)
  })
  return Array.from(new Set(tokens))
}

async function _fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function _fetchDmStatus() {
  const SITPORT_BASE = 'https://orion.directemar.cl/sitport/back/users'
  const nameOf = p => (p.NombreZona || p.Nombre || p.NombrePuerto || p.nombre || '').toUpperCase()

  // Primero intentar endpoint de bahías individuales (devuelve Chonchi por separado)
  try {
    const bahias = await _fetchJson(`${SITPORT_BASE}/BahiasByCapitania/225`)
    if (Array.isArray(bahias) && bahias.length > 0) {
      const chonchi = bahias.find(p => {
        const n = nameOf(p)
        return n.includes('CHONCHI') && !n.includes('CAPITAN')
      })
      if (chonchi) {
        const r = chonchi.restricciones ?? {}
        return {
          found:            true,
          restriccionBahia: r.restriccionBahia ?? false,
          navesMenores:     r.navesMenores     ?? false,
          navesMayores:     r.navesMayores     ?? false,
        }
      }
    }
  } catch (_) { /* seguir con fallback */ }

  // Fallback: Totalgeneral (solo tiene la Capitanía agregada, no bahías individuales)
  try {
    const ports = await _fetchJson(`${SITPORT_BASE}/Totalgeneral`)
    if (!Array.isArray(ports)) return null
    const capitania = ports.find(p => nameOf(p).includes('CHONCHI'))
    if (!capitania) return null
    const capR = capitania.restricciones ?? {}
    // Si la Capitanía muestra restricción pero no tenemos datos individuales,
    // no podemos saber si afecta a Chonchi o a otro puerto (ej. Queilen)
    if (capR.navesMenores || capR.navesMayores || capR.restriccionBahia) {
      return { found: true, restriccionBahia: false, navesMenores: false, navesMayores: false, desconocido: true }
    }
    return { found: true, restriccionBahia: false, navesMenores: false, navesMayores: false }
  } catch (e) {
    logger.warn('_fetchDmStatus error', e.message)
    return null
  }
}

function _dmKey(dm) {
  if (!dm || !dm.found)               return 'UNKNOWN'
  if (dm.desconocido)                 return 'DESCONOCIDO'
  if (dm.restriccionBahia)            return 'BAHIA_CERRADA'
  if (dm.navesMenores || dm.navesMayores) return 'RESTRINGIDO'
  return 'ABIERTO'
}

exports.checkClimaPortoAlert = onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'America/Santiago', region: 'us-central1' },
  async () => {
    logger.info('checkClimaPortoAlert: inicio')

    // 1. Fetch datos meteorológicos y marinos
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${CHONCHI_LAT}&longitude=${CHONCHI_LON}&timezone=America/Santiago&hourly=precipitation,weather_code,wind_speed_10m,wind_gusts_10m,pressure_msl,cloud_cover,relative_humidity_2m,visibility&forecast_days=2`
    const marineUrl  = `https://marine-api.open-meteo.com/v1/marine?latitude=${CHONCHI_LAT}&longitude=${CHONCHI_LON}&timezone=America/Santiago&hourly=wave_height,wave_period&forecast_days=2`

    let weather, marine
    try {
      ;[weather, marine] = await Promise.all([_fetchJson(weatherUrl), _fetchJson(marineUrl)])
    } catch (e) {
      logger.error('checkClimaPortoAlert: error fetch meteorológico', e)
      return
    }

    // 2. Calcular riesgo actual + máximo próximas 6h
    const times = weather.hourly?.time ?? []
    // Open-Meteo devuelve timestamps sin offset en hora Santiago ("2026-03-21T15:00").
    // Para comparar correctamente, construimos "now" con la misma ingenuidad de zona:
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
        gust:       weather.hourly.wind_gusts_10m?.[idx]         ?? 0,
        wind:       weather.hourly.wind_speed_10m?.[idx]         ?? 0,
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

    // 3. Estado DIRECTEMAR
    const dm    = await _fetchDmStatus()
    const dmKey = _dmKey(dm)

    // 4. Leer estado anterior de Firestore
    const stateRef  = db.collection('climaPuertoAlertState').doc('chonchi')
    const stateSnap = await stateRef.get()
    const prev      = stateSnap.exists ? stateSnap.data() : {}
    const prevLevel = prev.forecastLevel || 'BAJO'
    const prevDmKey = prev.dmKey        || 'UNKNOWN'

    logger.info('checkClimaPortoAlert: estado', {
      currentRi: Math.round(currentRi), maxRiNext6h: Math.round(maxRiNext6h),
      currentLevel, forecastLevel, dmKey, prevLevel, prevDmKey,
    })

    // 5. Armar notificaciones según cambios detectados
    const notifications = []

    if (forecastLevel !== prevLevel) {
      if (forecastLevel === 'ALTO') {
        notifications.push({
          title: '⛔ Puerto Chonchi: Cierre probable',
          body:  `Índice de riesgo ${Math.round(maxRiNext6h)}/100 en las próximas 6h. Condiciones severas previstas en Bahía de Yal.`,
          data:  { type: 'clima_cierre', ri: String(Math.round(maxRiNext6h)), url: '/clima-puerto' },
        })
      } else if (forecastLevel === 'MEDIO') {
        notifications.push({
          title: '⚠️ Puerto Chonchi: Posible restricción',
          body:  `Índice de riesgo ${Math.round(maxRiNext6h)}/100. Verificar condiciones antes de zarpar en Bahía de Yal.`,
          data:  { type: 'clima_restriccion', ri: String(Math.round(maxRiNext6h)), url: '/clima-puerto' },
        })
      } else {
        notifications.push({
          title: '🟢 Puerto Chonchi: Condiciones mejoran',
          body:  `Riesgo actual ${Math.round(currentRi)}/100. Bahía de Yal con condiciones favorables.`,
          data:  { type: 'clima_abierto', ri: String(Math.round(currentRi)), url: '/clima-puerto' },
        })
      }
    }

    if (dmKey !== prevDmKey && dmKey !== 'UNKNOWN' && dmKey !== 'DESCONOCIDO') {
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
    if (notifications.length > 0) {
      const tokens = await _getAllFcmTokens()
      if (tokens.length === 0) {
        logger.warn('checkClimaPortoAlert: sin tokens FCM registrados')
      } else {
        for (const notif of notifications) {
          await sendNotification(tokens, notif.title, notif.body, notif.data)
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

    logger.info('checkClimaPortoAlert: fin', { notificacionesEnviadas: notifications.length })
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
    const clientToken  = typeof request.data?.fcmToken === 'string' && request.data.fcmToken.length > 10
      ? request.data.fcmToken
      : null

    logger.info('scheduleClimaPortoTestNotification: inicio', { userId, delaySeconds, hasClientToken: !!clientToken })

    // Tokens FCM del propio admin.
    // Si el cliente pasó su token directamente lo usamos de inmediato (más confiable).
    // Como fallback consultamos Firestore.
    let tokens = []
    if (clientToken) {
      tokens = [clientToken]
    } else {
      try {
        const tokensSnap = await db.collection('fcmTokens').where('userId', '==', userId).get()
        tokensSnap.forEach(doc => {
          const t = doc.data()?.token
          if (t && typeof t === 'string') tokens.push(t)
        })
      } catch (e) {
        logger.error('scheduleClimaPortoTestNotification: error leyendo tokens FCM', e)
        return { success: false, reason: 'token_error', message: 'Error al obtener tokens de notificación. Intenta recargar la app.' }
      }
    }

    if (tokens.length === 0) {
      return { success: false, reason: 'no_tokens', message: 'No tienes notificaciones activadas en este dispositivo. Activa los permisos de notificación primero.' }
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
      gust:       weather.hourly.wind_gusts_10m?.[nowIdx]       ?? 0,
      wind:       weather.hourly.wind_speed_10m?.[nowIdx]       ?? 0,
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
    try {
      const dm = await _fetchDmStatus()
      dmK = _dmKey(dm)
    } catch (e) {
      logger.warn('scheduleClimaPortoTestNotification: error obteniendo DM, usando UNKNOWN', e)
    }

    const dmLabels = { ABIERTO: 'Abierto', RESTRINGIDO: 'Con restricciones', BAHIA_CERRADA: 'Cerrado', DESCONOCIDO: 'Estado desconocido', UNKNOWN: 'Sin datos DM' }
    const lvlEmoji = { ALTO: '⛔', MEDIO: '⚠️', BAJO: '🟢' }

    const title = '🧪 Test · Puerto Chonchi'
    const body  = `${lvlEmoji[lvl] || ''} Riesgo ${Math.round(ri)}/100 (${lvl}) · DM: ${dmLabels[dmK] || dmK} · Viento ${Math.round(sample.wind)} km/h · Olas ${sample.wave.toFixed(1)}m`

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
    cors: true,
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

