import { httpsCallable } from 'firebase/functions'
import { getFunctions } from 'firebase/functions'

const functions = getFunctions(undefined, 'us-central1')

export interface SendGanttAlertPayload {
  taskId: string
  title: string
  body: string
  responsibleUserId?: string
  severity?: 'critical_delay' | 'risk_alert' | 'dependency_block'
  url?: string
}

export interface SendGanttAlertResult {
  success: boolean
  skipped: boolean
  reason?: string
  sent: number
  failed?: number
}

export async function sendGanttAlert(payload: SendGanttAlertPayload): Promise<SendGanttAlertResult> {
  const callable = httpsCallable<SendGanttAlertPayload, SendGanttAlertResult>(functions, 'sendGanttAlert')
  const result = await callable(payload)
  return result.data
}
