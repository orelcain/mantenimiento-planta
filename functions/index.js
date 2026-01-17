const { onDocumentCreated } = require('firebase-functions/v2/firestore')
const { logger } = require('firebase-functions')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')

initializeApp()

const db = getFirestore()

function shouldNotifyIncident(data) {
  if (!data) return false
  if (data.tipo !== 'predictivo') return false
  if (!['critica', 'alta'].includes(data.prioridad)) return false
  if (data.status && data.status === 'cerrada') return false
  return true
}

async function getRecipientUserIds() {
  const snapshot = await db
    .collection('users')
    .where('activo', '==', true)
    .where('rol', 'in', ['admin', 'supervisor'])
    .get()

  return snapshot.docs.map((doc) => doc.id)
}

async function getTokensForUsers(userIds) {
  if (userIds.length === 0) return []

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

exports.notifyPredictiveIncident = onDocumentCreated('incidents/{incidentId}', async (event) => {
  const incident = event.data?.data()
  if (!shouldNotifyIncident(incident)) return

  const incidentId = event.params.incidentId
  const equipmentName = incident?.equipoNombre || incident?.equipmentName || incident?.equipo || 'Equipo'
  const priorityLabel = incident?.prioridad === 'critica' ? 'CRÍTICA' : 'ALTA'

  const userIds = await getRecipientUserIds()
  const tokens = await getTokensForUsers(userIds)

  if (tokens.length === 0) {
    logger.warn('No FCM tokens found for recipients', { incidentId })
    return
  }

  const payload = {
    notification: {
      title: `Alerta ${priorityLabel} de IoT`,
      body: `${equipmentName}: riesgo ${incident?.prioridad ?? 'alto'} detectado`,
    },
    data: {
      incidentId,
      equipmentId: incident?.equipmentId ?? '',
      prioridad: incident?.prioridad ?? '',
      tipo: incident?.tipo ?? '',
      url: `/mantenimiento-planta/incidents/${incidentId}`,
    },
  }

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    ...payload,
  })

  const failedTokens = []
  response.responses.forEach((res, idx) => {
    if (!res.success) failedTokens.push(tokens[idx])
  })

  logger.info('Notification sent', {
    incidentId,
    successCount: response.successCount,
    failureCount: response.failureCount,
    failedTokensCount: failedTokens.length,
  })
})
