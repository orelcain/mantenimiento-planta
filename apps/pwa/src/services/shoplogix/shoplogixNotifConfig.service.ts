import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'

export interface ShoplogixNotifConfig {
  channels: {
    push: boolean
    telegram: boolean
  }
  shiftStart: {
    enabled: boolean
    gracePeriodMinutes: number
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
    microStoppage: boolean
  }
}

export const SHOPLOGIX_NOTIF_CONFIG_DEFAULTS: ShoplogixNotifConfig = {
  channels:      { push: true, telegram: false },
  shiftStart:    { enabled: true, gracePeriodMinutes: 20 },
  firstPiece:    { enabled: true },
  pieceInterval: { enabled: false, every: 1000 },
  events:        { stoppage: true, microStoppage: false },
}

export async function loadShoplogixNotifConfig(plantSlug: PlantSlug): Promise<ShoplogixNotifConfig> {
  const snap = await getDoc(doc(db, 'notificationConfig', plantSlug))
  if (!snap.exists()) return structuredClone(SHOPLOGIX_NOTIF_CONFIG_DEFAULTS)
  const d = snap.data()
  return {
    channels:      { ...SHOPLOGIX_NOTIF_CONFIG_DEFAULTS.channels,      ...(d.channels      ?? {}) },
    shiftStart:    { ...SHOPLOGIX_NOTIF_CONFIG_DEFAULTS.shiftStart,    ...(d.shiftStart    ?? {}) },
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
