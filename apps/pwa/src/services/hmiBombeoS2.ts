import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from '@/services/firestoreTracked'
import { db } from './firebase'

const PRESETS_COL = 'hmi-bombeo-s2-presets'
const CONFIG_COL  = 'hmi-bombeo-s2-config'

export type HmiBombeoS2Values = Record<string, string>

export interface HmiBombeoS2Preset {
  name: string
  values: HmiBombeoS2Values
  updatedAt: Date
  updatedBy: string
}

/** Obtiene todos los presets de Bombeo S2 */
export async function getBombeoS2Presets(): Promise<Record<string, HmiBombeoS2Values>> {
  const snap = await getDocs(collection(db, PRESETS_COL))
  const result: Record<string, HmiBombeoS2Values> = {}
  snap.forEach(d => {
    const data = d.data()
    if (data.name && data.values) result[data.name as string] = data.values as HmiBombeoS2Values
  })
  return result
}

/** Guarda o actualiza un preset */
export async function saveBombeoS2Preset(
  name: string,
  values: HmiBombeoS2Values,
  userId: string,
): Promise<void> {
  await setDoc(doc(db, PRESETS_COL, name), {
    name,
    values,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  })
}

/** Elimina un preset */
export async function deleteBombeoS2Preset(name: string): Promise<void> {
  await deleteDoc(doc(db, PRESETS_COL, name))
}

/** Obtiene el preset actualmente seleccionado */
export async function getCurrentBombeoS2Preset(): Promise<string | null> {
  const snap = await getDoc(doc(db, CONFIG_COL, 'current'))
  return snap.exists() ? (snap.data().name as string) || null : null
}

/** Guarda cuál es el preset activo */
export async function setCurrentBombeoS2Preset(name: string): Promise<void> {
  await setDoc(doc(db, CONFIG_COL, 'current'), { name, updatedAt: serverTimestamp() })
}

/** Presets por defecto — escenarios típicos del sistema 2 de bombeo */
export const DEFAULT_BOMBEO_S2_PRESETS: Record<string, HmiBombeoS2Values> = {
  'Estado normal': {
    'pipe.mainTop':    'green',
    'pipe.toTankB':    'green',
    'pipe.row103104':  'red',
    'pipe.y111up':     'red',
    'pipe.y112up':     'red',
    'pipe.row101102':  'red',
    'pipe.toC1':       'green',
    'pipe.toC2':       'green',
    'pipe.outC1':      'green',
    'pipe.outC2':      'green',
    'pipe.toTankA':    'green',
    'pipe.sealMain':   'cyan',
    'pipe.sealToC2':   'cyan',
    'pipe.tankAout':   'green',
    'pipe.tankBout':   'green',
    'pipe.yalDown':    'green',
    'pipe.descarga':   'red',
    'valve.y111':      'closed',
    'valve.y112':      'closed',
    'valve.y101':      'closed',
    'valve.y102':      'closed',
    'valve.y103':      'closed',
    'valve.y104':      'closed',
    'valve.y141':      'cyan',
    'valve.y142':      'cyan',
    'valve.y12':       'open',
    'valve.y13':       'open',
    'text.PA':         '+1.7 bar',
    'text.PB':         '-0.2 bar',
    'text.cargaA':     '24 s',
    'text.descA':      '24 s',
    'text.cargaB':     '9 s',
    'text.descB':      '12 s',
    'text.flowC1':     '52 l/min',
    'text.flowC2':     '59 l/min',
    'text.airBar':     '6.8 bar',
    'text.flujoBarrido': '31.6 m3/h',
    'led.tankA':       'off',
    'led.tankB':       'on-green',
  },
  'Tanque A descargando': {
    'valve.y10.1': 'open',
    'valve.y10.3': 'open',
    'led.tankA':   'on-green',
    'led.tankB':   'off',
    'text.PA':     '-0.4 bar',
    'text.PB':     '+1.7 bar',
  },
  'Sin bombeo': {
    'pipe.mainTop':  'red',
    'pipe.outC1':    'red',
    'pipe.outC2':    'red',
    'pipe.yalDown':  'red',
    'led.tankA':     'off',
    'led.tankB':     'off',
    'text.flujoBarrido': '0.0 m3/h',
    'text.flowC1':   '0 l/min',
    'text.flowC2':   '0 l/min',
  },
}

/** Siembra los defaults si Firestore está vacío */
export async function seedBombeoS2Defaults(userId: string): Promise<void> {
  for (const [name, values] of Object.entries(DEFAULT_BOMBEO_S2_PRESETS)) {
    await saveBombeoS2Preset(name, values, userId)
  }
  await setCurrentBombeoS2Preset('Estado normal')
}
