import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  limit,
} from '@/services/firestoreTracked'
import { db } from './firebase'

// ── Colecciones Firestore ────────────────────────────────────────────────────
const PRESETS_COL = 'hmi-knuro-presets'
const HISTORY_COL = 'hmi-knuro-history'
const CONFIG_COL  = 'hmi-knuro-config'

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface HmiPreset {
  name: string
  data: Record<string, string>
  updatedAt: Date
  updatedBy: string
}

export interface HmiHistoryEntry {
  id?: string
  presetName: string
  action: 'save' | 'delete'
  data: Record<string, string> | null
  previousData: Record<string, string> | null
  userId: string
  userName: string
  timestamp: Date
}

// ── Presets ──────────────────────────────────────────────────────────────────
/** Obtiene todos los presets HMI desde Firestore */
export async function getHmiPresets(): Promise<Record<string, Record<string, string>>> {
  const snap = await getDocs(collection(db, PRESETS_COL))
  const result: Record<string, Record<string, string>> = {}
  snap.forEach(d => {
    const data = d.data()
    if (data.name && data.data) result[data.name as string] = data.data as Record<string, string>
  })
  return result
}

/** Guarda o actualiza un preset HMI en Firestore */
export async function saveHmiPreset(
  name: string,
  data: Record<string, string>,
  userId: string,
): Promise<void> {
  await setDoc(doc(db, PRESETS_COL, name), {
    name,
    data,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  })
}

/** Elimina un preset HMI de Firestore */
export async function deleteHmiPreset(name: string): Promise<void> {
  await deleteDoc(doc(db, PRESETS_COL, name))
}

// ── Preset activo ─────────────────────────────────────────────────────────────
/** Obtiene el nombre del preset actualmente cargado */
export async function getCurrentPreset(): Promise<string | null> {
  const snap = await getDoc(doc(db, CONFIG_COL, 'current'))
  return snap.exists() ? (snap.data().name as string) || null : null
}

/** Guarda el nombre del preset activo */
export async function setCurrentPreset(name: string): Promise<void> {
  await setDoc(doc(db, CONFIG_COL, 'current'), { name, updatedAt: serverTimestamp() })
}

// ── Referencias de fábrica ────────────────────────────────────────────────────
/** Obtiene los valores de referencia de fábrica editados por el usuario */
export async function getHmiRefs(): Promise<Record<string, string>> {
  const snap = await getDoc(doc(db, CONFIG_COL, 'refs'))
  return snap.exists() ? (snap.data().data as Record<string, string>) || {} : {}
}

/** Guarda los valores de referencia de fábrica */
export async function saveHmiRefs(refs: Record<string, string>): Promise<void> {
  await setDoc(doc(db, CONFIG_COL, 'refs'), { data: refs, updatedAt: serverTimestamp() })
}

// ── Orden de presets ──────────────────────────────────────────────────────────
/** Obtiene el orden personalizado de presets */
export async function getPresetOrder(): Promise<string[]> {
  const snap = await getDoc(doc(db, CONFIG_COL, 'preset-order'))
  return snap.exists() ? (snap.data().order as string[]) || [] : []
}

/** Guarda el orden personalizado de presets */
export async function savePresetOrder(order: string[]): Promise<void> {
  await setDoc(doc(db, CONFIG_COL, 'preset-order'), { order, updatedAt: serverTimestamp() })
}

// ── Snapshot de defaults ──────────────────────────────────────────────────────
const DEFAULTS_COL = 'hmi-knuro-defaults'

/** Guarda los presets actuales como snapshot de defaults */
export async function saveDefaultSnapshot(userId: string): Promise<void> {
  const currentPresets = await getHmiPresets()
  for (const [name, data] of Object.entries(currentPresets)) {
    await setDoc(doc(db, DEFAULTS_COL, name), {
      name,
      data,
      savedAt: serverTimestamp(),
      savedBy: userId,
    })
  }
}

/** Lee el snapshot de defaults guardado por el usuario */
export async function getDefaultSnapshot(): Promise<Record<string, Record<string, string>>> {
  const snap = await getDocs(collection(db, DEFAULTS_COL))
  const result: Record<string, Record<string, string>> = {}
  snap.forEach(d => {
    const data = d.data()
    if (data.name && data.data) result[data.name as string] = data.data as Record<string, string>
  })
  return result
}

// ── Historial de cambios ──────────────────────────────────────────────────────
/** Registra una entrada en el historial de cambios */
export async function addHmiHistory(
  entry: Omit<HmiHistoryEntry, 'id' | 'timestamp'>,
): Promise<void> {
  await addDoc(collection(db, HISTORY_COL), {
    ...entry,
    timestamp: serverTimestamp(),
  })
}

/** Obtiene el historial de cambios ordenado por fecha descendente */
export async function getHmiHistory(limitCount = 50): Promise<HmiHistoryEntry[]> {
  const q = query(
    collection(db, HISTORY_COL),
    orderBy('timestamp', 'desc'),
    limit(limitCount),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => {
    const data = d.data()
    return {
      id: d.id,
      presetName: data.presetName as string,
      action: data.action as 'save' | 'delete',
      data: (data.data as Record<string, string>) || null,
      previousData: (data.previousData as Record<string, string>) || null,
      userId: data.userId as string,
      userName: data.userName as string,
      timestamp: (data.timestamp as Timestamp)?.toDate() ?? new Date(),
    }
  })
}

// ── Presets por defecto ──────────────────────────────────────────────────────
const _BASE: Record<string, string> = {
  'c1tp-0':'0,00','c1tp-1':'260','c1tp-2':'250','c1tp-3':'0,30','c1tp-4':'0,30','c1tp-5':'0,55','c1tp-6':'0,55',
  'c1pr-0':'0,00','c1pr-1':'1,00','c1pr-2':'0,00','c1pr-3':'1,00','c1pr-4':'0,00','c1pr-5':'1,60',
  'c1pr-6':'0,00','c1pr-7':'2,00','c1pr-8':'0,00','c1pr-9':'1,50','c1pr-10':'4,00','c1pr-11':'0,00','c1pr-12':'1,00','c1pr-13':'2,00',
  'c1p2-0':'0,00','c1p2-1':'0,00','c1p2-2':'0,00','c1p2-3':'0,50','c1p2-4':'0,00','c1p2-5':'1,00','c1p2-6':'0,00','c1p2-7':'1,00',
  'h1ev-0':'0,00','h1ev-1':'0,00','h1ev-2':'0,00','h1ev-3':'0,50','h1ev-4':'0,60',
  'h1epc-0':'30','h1epc-1':'45','h1epc-2':'70','h1epc-3':'85','h1epc-v':'0',
  'h1tmb-0':'0,32','h1tmb-1':'0,31','h1tmb-2':'0,30','h1tmb-3':'0,29','h1tmb-4':'0,31','h1tmb-5':'0,30','h1tmb-6':'0,30','h1tmb-7':'0,29',
  'h1tpp-0':'0,48','h1tpp-1':'270','h1tpp-2':'260','h1tpp-v':'0',
  'h1pb-0':'1,00','h1pb-1':'0,50','h1pb-2':'2,40','h1pb-3':'2,20','h1pb-4':'0,30','h1pb-5':'0,00','h1pb-6':'0,30',
  'h1ps-0':'3,00','h1ps-1':'2,00','h1ps-2':'1,00','h1ps-3':'1,00','h1ps-4':'0,55','h1ps-5':'0,75','h1ps-6':'4,00',
  'c2t-0':'0,00','c2t-1':'0,00',
  'ev-0':'0,25','ev-1':'10','ev-2':'65','ev-3':'65','ev-4':'140','ev-5':'200','ev-v':'0',
  'ci-fa-0':'150','ci-fa-1':'180','ci-fa-2':'190','ci-fa-3':'220','ci-fa-v':'0',
  'ci-av-0':'110','ci-av-1':'95','ci-av-2':'82','ci-av-3':'72','ci-av-v':'0',
  'ci-vic-0':'0,15','ci-vic-1':'220','ci-vic-v':'0',
  'ci-ymk-0':'0,20',
  'ci-ct-0':'1577120','ci-ct-1':'1347144',
  'h2-2as-0':'0,00','h2-2as-1':'0,10','h2-2as-2':'0,09','h2-2as-3':'0,25',
  'h2-2as-epv-0':'70','h2-2as-epv-1':'60','h2-2as-epv-2':'50','h2-2as-epv-3':'30','h2-2as-epv-v':'0',
  'h2-2as-pev-0':'125','h2-2as-pev-1':'145','h2-2as-pev-2':'160','h2-2as-pev-3':'175','h2-2as-pev-v':'0',
  'h2-2as-pav-0':'300','h2-2as-pav-1':'300','h2-2as-pav-2':'300','h2-2as-pav-3':'300','h2-2as-pav-v':'0',
  'h2-2bvs-0':'0','h2-2bvs-1':'0,30','h2-2bvs-2':'300','h2-2bvs-3':'300','h2-2bvs-4':'300','h2-2bvs-5':'300','h2-2bvs-6':'0,00','h2-2bvs-v':'0',
  'h2-2ac-0':'0,30',
  'h2-2ac-ve-0':'160','h2-2ac-ve-1':'175','h2-2ac-ve-2':'190','h2-2ac-ve-3':'205','h2-2ac-ve-v':'0',
  'h2-2ac-pa-0':'290','h2-2ac-pa-1':'290','h2-2ac-pa-2':'290','h2-2ac-pa-3':'290','h2-2ac-pa-v':'0',
  'h2-2bvc-0':'0','h2-2bvc-1':'290','h2-2bvc-2':'290','h2-2bvc-3':'290','h2-2bvc-4':'290','h2-2bvc-v':'0',
  'h2pr-0':'0,50','h2pr-1':'2,00','h2pr-2':'0,50','h2pr-3':'1,60','h2pr-4':'2,50','h2pr-5':'1,00',
  'h2pr-6':'2,20','h2pr-7':'1,00','h2pr-8':'3,00','h2pr-9':'3,00','h2pr-10':'1,00','h2pr-11':'3,00',
  'h2imp-s0':'2,60','h2imp-s1':'2,40','h2imp-s2':'4,00','h2imp-s3':'3,80',
  'h2imp-c0':'2,40','h2imp-c1':'2,20','h2imp-c2':'3,80','h2imp-c3':'3,50',
  'h2ag-0':'2,50','h2ag-1':'1,00','h2ag-2':'0,45','h2ag-3':'5,00','h2ag-4':'1,50',
  'vac-mv-0':'5 s','vac-mv-1':'-400 mBar','vac-mv-2':'-300 mBar',
  'vac-k-0':'0,20','vac-k-1':'0,20','vac-k-2':'0,00','vac-k-3':'0,00',
  'vac-b-0':'143','vac-b-1':'255','vac-b-2':'30','vac-b-3':'305','vac-b-4':'280','vac-b-5':'90',
  'vac-b-6':'350','vac-b-7':'320','vac-b-8':'140','vac-b-9':'406','vac-b-10':'20','vac-b-11':'290',
}

const _mk = (o: Record<string, string>): Record<string, string> => ({ ..._BASE, ...o })

/** Presets por defecto de las 2 plantas — se crean solo si Firestore está vacío */
export const DEFAULT_PRESETS: Record<string, Record<string, string>> = {
  'Planta Principal - BAA142 - N1': _mk({
    // Carro 1 — mismo que Yal N1
    'c1tp-1':'255','c1tp-2':'245','c1tp-3':'0,28','c1tp-4':'0,28','c1tp-5':'0,50','c1tp-6':'0,50',
    'c1pr-1':'1,05','c1pr-3':'1,05','c1pr-5':'1,55','c1pr-7':'1,90','c1pr-9':'1,40',
    'c1pr-10':'4,20','c1pr-12':'0,95','c1pr-13':'1,90',
    // Herramienta 1 — parámetros N1 (igual a Yal N1)
    'h1epc-0':'15','h1epc-1':'30','h1epc-2':'50','h1epc-3':'70',
    'h1tmb-4':'0,32',
    'h1tpp-0':'0,10','h1tpp-1':'210','h1tpp-2':'205',
    'h1pb-2':'2,35','h1pb-3':'2,15','h1pb-4':'0,28','h1pb-6':'0,28',
    'h1ps-0':'2,90','h1ps-1':'1,90','h1ps-4':'0,52','h1ps-5':'0,72','h1ps-6':'3,90',
    'c2t-0':'0,10','c2t-1':'0,10',
    // Evacuador N1 (igual a Yal N1)
    'ev-1':'230','ev-2':'250','ev-3':'280','ev-4':'60','ev-5':'140',
    // Ciclo N1 (igual a Yal N1)
    'ci-fa-0':'110','ci-fa-1':'130','ci-fa-2':'160','ci-fa-3':'181',
    'ci-av-0':'84','ci-av-1':'74','ci-av-2':'65','ci-av-3':'55',
    'ci-vic-1':'180',
    'ci-ymk-0':'0,30',
    // Herramienta 2 (igual a Yal N1)
    'h2-2as-1':'0,11','h2-2as-2':'0,10','h2-2as-3':'0,28',
    'h2-2bvs-1':'0,28','h2-2bvs-2':'295','h2-2bvs-3':'295','h2-2bvs-4':'295','h2-2bvs-5':'295',
    'h2-2ac-0':'0,28',
    'h2-2bvc-1':'285','h2-2bvc-2':'285','h2-2bvc-3':'285','h2-2bvc-4':'285',
    'h2pr-3':'1,55','h2pr-4':'2,45','h2pr-6':'2,15','h2pr-8':'2,90','h2pr-9':'2,90','h2pr-11':'2,90',
    'h2imp-s0':'2,60','h2imp-s1':'2,40','h2imp-s2':'4,20','h2imp-s3':'3,80',
    'h2imp-c0':'2,30','h2imp-c1':'2,10','h2imp-c2':'3,70','h2imp-c3':'3,40',
    'h2ag-0':'2,40','h2ag-2':'0,42',
    'vac-b-0':'145','vac-b-1':'300','vac-b-2':'100',
    'vac-b-3':'204','vac-b-4':'355','vac-b-5':'190',
    'vac-b-6':'226','vac-b-7':'20','vac-b-8':'310',
    // Labels N1: 18-19 / 16-17 / 14-15 / 12-13 pescados
    'pesc-rows':'18-19,16-17,14-15,12-13',
    // PP específico
    'ci-ct-0':'2103540','ci-ct-1':'1892310',
    'vac-mv-0':'5 s','vac-mv-1':'-420 mBar','vac-mv-2':'-310 mBar',
  }),
  'Planta Principal - BAA142 - N2': { ..._BASE },
  'Planta Principal - BAA142 - N3': { ..._BASE },
  'Planta Yal - BAA142 - N1': _mk({
    // Carro 1 — tiempos y presiones (sin contradicción en fotos)
    'c1tp-1':'255','c1tp-2':'245','c1tp-3':'0,28','c1tp-4':'0,28','c1tp-5':'0,50','c1tp-6':'0,50',
    'c1pr-1':'1,05','c1pr-3':'1,05','c1pr-5':'1,55','c1pr-7':'1,90','c1pr-9':'1,40',
    'c1pr-10':'4,20','c1pr-12':'0,95','c1pr-13':'1,90',
    // Herramienta 1 — Esperar Pulsos por Categoría
    'h1epc-0':'15','h1epc-1':'30','h1epc-2':'50','h1epc-3':'70',
    // Herramienta 1 — Tiempo Movimiento (Cat1 Suave=0.32 según foto)
    'h1tmb-4':'0,32',
    // Herramienta 1 — Tiempos y Pulsos dentro del Pescado (foto: 0.10 / salmón=210 / coho=205)
    'h1tpp-0':'0,10','h1tpp-1':'210','h1tpp-2':'205',
    // Herramienta 1 — Presiones
    'h1pb-2':'2,35','h1pb-3':'2,15','h1pb-4':'0,28','h1pb-6':'0,28',
    'h1ps-0':'2,90','h1ps-1':'1,90','h1ps-4':'0,52','h1ps-5':'0,72','h1ps-6':'3,90',
    // Carro 2 — Tiempo
    'c2t-0':'0,10','c2t-1':'0,10',
    // Evacuador (foto Yal N1: no limpio=230, salmón=250, coho=280, bajo=60, alto=140)
    'ev-1':'230','ev-2':'250','ev-3':'280','ev-4':'60','ev-5':'140',
    // Ciclo — Categorías de Faena (N1: 110/130/160/181)
    'ci-fa-0':'110','ci-fa-1':'130','ci-fa-2':'160','ci-fa-3':'181',
    // Ciclo — Ajuste de Velocidad (N1: 84/74/65/55)
    'ci-av-0':'84','ci-av-1':'74','ci-av-2':'65','ci-av-3':'55',
    // Ciclo — Velocidad Inicio de Ciclo
    'ci-vic-1':'180',
    // Ciclo — YMK
    'ci-ymk-0':'0,30',
    // Labels N1: 18-19 / 16-17 / 14-15 / 12-13 pescados
    'pesc-rows':'18-19,16-17,14-15,12-13',
    // Herramienta 2 — sin contradicción con fotos, se mantienen
    'h2-2as-1':'0,11','h2-2as-2':'0,10','h2-2as-3':'0,28',
    'h2-2bvs-1':'0,28','h2-2bvs-2':'295','h2-2bvs-3':'295','h2-2bvs-4':'295','h2-2bvs-5':'295',
    'h2-2ac-0':'0,28',
    'h2-2bvc-1':'285','h2-2bvc-2':'285','h2-2bvc-3':'285','h2-2bvc-4':'285',
    'h2pr-3':'1,55','h2pr-4':'2,45','h2pr-6':'2,15','h2pr-8':'2,90','h2pr-9':'2,90','h2pr-11':'2,90',
    'h2imp-s0':'2,60','h2imp-s1':'2,40','h2imp-s2':'4,20','h2imp-s3':'3,80',
    'h2imp-c0':'2,30','h2imp-c1':'2,10','h2imp-c2':'3,70','h2imp-c3':'3,40',
    'h2ag-0':'2,40','h2ag-2':'0,42',
    // Vacío — Baader (foto Yal N1: EscA=145/300/100, EscB=204/355/190, Knuro=226/20/310)
    'vac-b-0':'145','vac-b-1':'300','vac-b-2':'100',
    'vac-b-3':'204','vac-b-4':'355','vac-b-5':'190',
    'vac-b-6':'226','vac-b-7':'20','vac-b-8':'310',
    // Contadores y Vacío Knuro
    'ci-ct-0':'3241580','ci-ct-1':'2987400',
    'vac-mv-0':'4 s','vac-mv-1':'-430 mBar','vac-mv-2':'-320 mBar',
  }),
  'Planta Yal - BAA142 - N2': { ..._BASE },
  'Planta Yal - BAA142 - N3': { ..._BASE },
}

// ── Tooltips de parámetros ────────────────────────────────────────────────────
const TOOLTIPS_COL = 'hmi-knuro-tooltips'

/** Guarda los tooltips editados por el admin en Firestore (documento único "default") */
export async function saveHmiTooltips(tooltips: Record<string, unknown>): Promise<void> {
  await setDoc(doc(db, TOOLTIPS_COL, 'default'), {
    data: tooltips,
    updatedAt: serverTimestamp(),
  })
}

/** Obtiene los tooltips desde Firestore (público, sin autenticación requerida) */
export async function getHmiTooltips(): Promise<Record<string, unknown>> {
  const snap = await getDoc(doc(db, TOOLTIPS_COL, 'default'))
  return snap.exists() ? (snap.data().data as Record<string, unknown>) || {} : {}
}

/** Siembra los presets por defecto en Firestore.
 *  Usa el snapshot guardado por el usuario si existe, sino los DEFAULT_PRESETS del código. */
export async function seedDefaultPresets(userId: string): Promise<void> {
  const snapshot = await getDefaultSnapshot()
  const defaults = Object.keys(snapshot).length > 0 ? snapshot : DEFAULT_PRESETS
  for (const [name, data] of Object.entries(defaults)) {
    await saveHmiPreset(name, data, userId)
  }
  const firstKey = Object.keys(defaults)[0] ?? 'Planta Principal - BAA142 - N2'
  await setCurrentPreset(firstKey)
}
