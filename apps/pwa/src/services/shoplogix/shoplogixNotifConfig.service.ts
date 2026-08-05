import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'

/** Destino de los mensajes Telegram: DM del admin con el bot, grupo (topic
 *  General), o ambos. 'bot' es el default mientras los briefs están en rodaje. */
export type TelegramDest = 'bot' | 'grupo' | 'ambos'

export interface ShoplogixNotifConfig {
  channels: {
    push: boolean
    telegram: boolean
    telegramDest: TelegramDest
  }
  shiftStart: {
    enabled: boolean
    gracePeriodMinutes: number
  }
  /** Brief de FIN de turno (piezas por máquina, total vs target, uptime, paros,
   *  calidad del Grader donde exista). delayMinutes = margen tras el fin del
   *  turno para que el último sync (cada 5 min) deje la data completa. */
  shiftEnd: {
    enabled: boolean
    delayMinutes: number
    /**
     * Piezas mínimas para considerar que hubo turno productivo. Bajo eso no se
     * manda brief: es ruido o un lote de prueba. El default depende de la línea
     * (Filete produce mucho menos que el eviscerado con 3 Baader), así que
     * dejarlo sin definir hereda el valor de la línea en el backend.
     */
    minPieces?: number
  }
  firstPiece: {
    enabled: boolean
  }
  pieceInterval: {
    enabled: boolean
    every: number
  }
  events: {
    stoppage: boolean
    /** Umbral en minutos para alertar una detención (≥N min). Bajo eso es
     *  ruido operacional; las micro-detenciones tienen su toggle aparte. */
    stoppageMinMinutes: number
    microStoppage: boolean
  }
}

// Mantener alineado con DEFAULTS en functions/shoplogix/notifConfig.js
// (ahí viven además los overrides por planta).
export const SHOPLOGIX_NOTIF_CONFIG_DEFAULTS: ShoplogixNotifConfig = {
  channels:      { push: true, telegram: false, telegramDest: 'bot' },
  shiftStart:    { enabled: true, gracePeriodMinutes: 20 },
  shiftEnd:      { enabled: true, delayMinutes: 10, minPieces: 50 },
  firstPiece:    { enabled: true },
  pieceInterval: { enabled: false, every: 1000 },
  events:        { stoppage: true, stoppageMinMinutes: 3, microStoppage: false },
}

export async function loadShoplogixNotifConfig(plantSlug: PlantSlug): Promise<ShoplogixNotifConfig> {
  const snap = await getDoc(doc(db, 'notificationConfig', plantSlug))
  if (!snap.exists()) return structuredClone(SHOPLOGIX_NOTIF_CONFIG_DEFAULTS)
  const d = snap.data()
  return {
    channels:      { ...SHOPLOGIX_NOTIF_CONFIG_DEFAULTS.channels,      ...(d.channels      ?? {}) },
    shiftStart:    { ...SHOPLOGIX_NOTIF_CONFIG_DEFAULTS.shiftStart,    ...(d.shiftStart    ?? {}) },
    shiftEnd:      { ...SHOPLOGIX_NOTIF_CONFIG_DEFAULTS.shiftEnd,      ...(d.shiftEnd      ?? {}) },
    firstPiece:    { ...SHOPLOGIX_NOTIF_CONFIG_DEFAULTS.firstPiece,    ...(d.firstPiece    ?? {}) },
    pieceInterval: { ...SHOPLOGIX_NOTIF_CONFIG_DEFAULTS.pieceInterval, ...(d.pieceInterval ?? {}) },
    events:        { ...SHOPLOGIX_NOTIF_CONFIG_DEFAULTS.events,        ...(d.events        ?? {}) },
  }
}

export async function saveShoplogixNotifConfig(
  plantSlug: PlantSlug,
  config: ShoplogixNotifConfig,
): Promise<void> {
  await setDoc(doc(db, 'notificationConfig', plantSlug), config)
}
