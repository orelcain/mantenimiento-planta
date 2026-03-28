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
  'h1epc-0':'30','h1epc-1':'45','h1epc-2':'70','h1epc-3':'85','h1epc-v':'425',
  'h1tmb-0':'0,32','h1tmb-1':'0,31','h1tmb-2':'0,30','h1tmb-3':'0,29','h1tmb-4':'0,31','h1tmb-5':'0,30','h1tmb-6':'0,30','h1tmb-7':'0,29',
  'h1tpp-0':'0,48','h1tpp-1':'270','h1tpp-2':'260','h1tpp-v':'425',
  'h1pb-0':'1,00','h1pb-1':'0,50','h1pb-2':'2,40','h1pb-3':'2,20','h1pb-4':'0,30','h1pb-5':'0,00','h1pb-6':'0,30',
  'h1ps-0':'3,00','h1ps-1':'2,00','h1ps-2':'1,00','h1ps-3':'1,00','h1ps-4':'0,55','h1ps-5':'0,75','h1ps-6':'4,00',
  'c2t-0':'0,00','c2t-1':'0,00',
  'ev-0':'0,25','ev-1':'10','ev-2':'65','ev-3':'65','ev-4':'140','ev-5':'200','ev-v':'0',
  'ci-fa-0':'150','ci-fa-1':'180','ci-fa-2':'190','ci-fa-3':'220','ci-fa-v':'202',
  'ci-av-0':'110','ci-av-1':'95','ci-av-2':'82','ci-av-3':'72','ci-av-v':'425',
  'ci-vic-0':'0,15','ci-vic-1':'220','ci-vic-v':'425',
  'ci-ymk-0':'0,20',
  'ci-ct-0':'1577120','ci-ct-1':'1347144',
  'h2-2as-0':'0,00','h2-2as-1':'0,10','h2-2as-2':'0,09','h2-2as-3':'0,25',
  'h2-2as-epv-0':'70','h2-2as-epv-1':'60','h2-2as-epv-2':'50','h2-2as-epv-3':'30','h2-2as-epv-v':'425',
  'h2-2as-pev-0':'125','h2-2as-pev-1':'145','h2-2as-pev-2':'160','h2-2as-pev-3':'175','h2-2as-pev-v':'425',
  'h2-2as-pav-0':'300','h2-2as-pav-1':'300','h2-2as-pav-2':'300','h2-2as-pav-3':'300','h2-2as-pav-v':'425',
  'h2-2bvs-0':'0','h2-2bvs-1':'0,30','h2-2bvs-2':'300','h2-2bvs-3':'300','h2-2bvs-4':'300','h2-2bvs-5':'300','h2-2bvs-6':'0,00','h2-2bvs-v':'425',
  'h2-2ac-0':'0,30',
  'h2-2ac-ve-0':'160','h2-2ac-ve-1':'175','h2-2ac-ve-2':'190','h2-2ac-ve-3':'205','h2-2ac-ve-v':'425',
  'h2-2ac-pa-0':'290','h2-2ac-pa-1':'290','h2-2ac-pa-2':'290','h2-2ac-pa-3':'290','h2-2ac-pa-v':'425',
  'h2-2bvc-0':'0','h2-2bvc-1':'290','h2-2bvc-2':'290','h2-2bvc-3':'290','h2-2bvc-4':'290','h2-2bvc-v':'425',
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
    'ci-ct-0':'2103540','ci-ct-1':'1892310',
    'vac-mv-0':'5 s','vac-mv-1':'-420 mBar','vac-mv-2':'-310 mBar',
  }),
  'Planta Principal - BAA142 - N2': { ..._BASE },
  'Planta Principal - BAA142 - N3': _mk({
    'c1tp-1':'258','c1tp-2':'248','c1tp-3':'0,32','c1tp-4':'0,32','c1tp-5':'0,52','c1tp-6':'0,52',
    'c1pr-5':'1,65','c1pr-7':'1,95','c1pr-9':'1,45','c1pr-13':'1,95',
    'c1p2-3':'0,45','c1p2-5':'0,95','c1p2-7':'0,95',
    'h1ev-3':'0,55','h1ev-4':'0,65',
    'h1epc-0':'28','h1epc-1':'43','h1epc-2':'68','h1epc-3':'82',
    'h1tmb-2':'0,31','h1tmb-3':'0,30','h1tmb-6':'0,31','h1tmb-7':'0,30',
    'h1tpp-0':'0,46','h1tpp-1':'268','h1tpp-2':'258',
    'h1pb-2':'2,38','h1pb-3':'2,18',
    'h1ps-2':'0,95','h1ps-3':'0,95','h1ps-4':'0,52','h1ps-5':'0,72',
    'ci-fa-0':'152','ci-fa-1':'182','ci-fa-2':'188','ci-fa-3':'218','ci-fa-v':'200',
    'ci-av-1':'93','ci-av-2':'80','ci-av-3':'70',
    'h2ag-0':'2,40','h2ag-1':'0,95','h2ag-4':'1,40',
    'vac-k-0':'0,25','vac-k-1':'0,25',
    'vac-b-6':'345','vac-b-7':'315','vac-b-9':'400',
    'ci-ct-0':'987630','ci-ct-1':'845210',
    'vac-mv-0':'6 s','vac-mv-1':'-410 mBar','vac-mv-2':'-300 mBar',
  }),
  'Planta Yal - BAA142 - N1': _mk({
    'c1tp-1':'255','c1tp-2':'245','c1tp-3':'0,28','c1tp-4':'0,28','c1tp-5':'0,50','c1tp-6':'0,50',
    'c1pr-1':'1,05','c1pr-3':'1,05','c1pr-5':'1,55','c1pr-7':'1,90','c1pr-9':'1,40',
    'c1pr-10':'4,20','c1pr-12':'0,95','c1pr-13':'1,90',
    'h1epc-0':'28','h1epc-1':'42','h1epc-2':'66','h1epc-3':'80',
    'h1tmb-0':'0,30','h1tmb-1':'0,29','h1tmb-2':'0,28','h1tmb-3':'0,27',
    'h1tmb-4':'0,29','h1tmb-5':'0,28','h1tmb-6':'0,28','h1tmb-7':'0,27',
    'h1tpp-0':'0,45','h1tpp-1':'265','h1tpp-2':'255',
    'h1pb-2':'2,35','h1pb-3':'2,15','h1pb-4':'0,28','h1pb-6':'0,28',
    'h1ps-0':'2,90','h1ps-1':'1,90','h1ps-4':'0,52','h1ps-5':'0,72','h1ps-6':'3,90',
    'c2t-0':'0,10','c2t-1':'0,10',
    'ev-2':'60','ev-3':'60','ev-4':'135','ev-5':'195',
    'ci-fa-0':'145','ci-fa-1':'175','ci-fa-2':'185','ci-fa-3':'215','ci-fa-v':'198',
    'ci-av-0':'108','ci-av-1':'93','ci-av-2':'80','ci-av-3':'70',
    'ci-ymk-0':'0,18',
    'h2-2as-1':'0,11','h2-2as-2':'0,10','h2-2as-3':'0,28',
    'h2-2bvs-1':'0,28','h2-2bvs-2':'295','h2-2bvs-3':'295','h2-2bvs-4':'295','h2-2bvs-5':'295',
    'h2-2ac-0':'0,28',
    'h2-2bvc-1':'285','h2-2bvc-2':'285','h2-2bvc-3':'285','h2-2bvc-4':'285',
    'h2pr-3':'1,55','h2pr-4':'2,45','h2pr-6':'2,15','h2pr-8':'2,90','h2pr-9':'2,90','h2pr-11':'2,90',
    'h2imp-s0':'2,50','h2imp-s1':'2,30','h2imp-s2':'3,90','h2imp-s3':'3,70',
    'h2imp-c0':'2,30','h2imp-c1':'2,10','h2imp-c2':'3,70','h2imp-c3':'3,40',
    'h2ag-0':'2,40','h2ag-2':'0,42',
    'vac-k-0':'0,25','vac-k-1':'0,25','vac-k-2':'0,05','vac-k-3':'0,05',
    'vac-b-0':'138','vac-b-1':'250','vac-b-2':'28','vac-b-3':'298','vac-b-4':'275','vac-b-5':'85',
    'vac-b-6':'342','vac-b-7':'312','vac-b-8':'135','vac-b-9':'398','vac-b-10':'18','vac-b-11':'285',
    'ci-ct-0':'3241580','ci-ct-1':'2987400',
    'vac-mv-0':'4 s','vac-mv-1':'-430 mBar','vac-mv-2':'-320 mBar',
  }),
  'Planta Yal - BAA142 - N2': _mk({
    'c1tp-1':'256','c1tp-2':'246','c1tp-3':'0,28','c1tp-4':'0,29','c1tp-5':'0,51','c1tp-6':'0,51',
    'c1pr-1':'1,05','c1pr-3':'1,05','c1pr-5':'1,55','c1pr-7':'1,92','c1pr-9':'1,42',
    'c1pr-10':'4,20','c1pr-12':'0,96','c1pr-13':'1,92',
    'h1epc-0':'29','h1epc-1':'43','h1epc-2':'67','h1epc-3':'81',
    'h1tmb-0':'0,30','h1tmb-1':'0,29','h1tmb-2':'0,29','h1tmb-3':'0,28',
    'h1tmb-4':'0,29','h1tmb-5':'0,29','h1tmb-6':'0,28','h1tmb-7':'0,28',
    'h1tpp-0':'0,46','h1tpp-1':'266','h1tpp-2':'256',
    'h1pb-2':'2,36','h1pb-3':'2,16','h1pb-4':'0,29','h1pb-6':'0,29',
    'h1ps-4':'0,53','h1ps-5':'0,73','h1ps-6':'3,92',
    'c2t-0':'0,10','c2t-1':'0,10',
    'ev-2':'62','ev-3':'62','ev-4':'136','ev-5':'196',
    'ci-fa-0':'146','ci-fa-1':'176','ci-fa-2':'186','ci-fa-3':'216','ci-fa-v':'199',
    'ci-av-0':'109','ci-av-1':'94','ci-av-2':'81','ci-av-3':'71',
    'ci-ymk-0':'0,18',
    'h2-2as-1':'0,11','h2-2as-2':'0,10','h2-2as-3':'0,27',
    'h2-2bvs-1':'0,29','h2-2bvs-2':'296','h2-2bvs-3':'296','h2-2bvs-4':'296','h2-2bvs-5':'296',
    'h2-2ac-0':'0,28',
    'h2-2bvc-1':'286','h2-2bvc-2':'286','h2-2bvc-3':'286','h2-2bvc-4':'286',
    'h2pr-3':'1,56','h2pr-4':'2,46','h2pr-6':'2,16','h2pr-8':'2,92','h2pr-9':'2,92','h2pr-11':'2,92',
    'h2imp-s0':'2,52','h2imp-s1':'2,32','h2imp-s2':'3,92','h2imp-s3':'3,72',
    'h2imp-c0':'2,32','h2imp-c1':'2,12','h2imp-c2':'3,72','h2imp-c3':'3,42',
    'h2ag-0':'2,42','h2ag-2':'0,43',
    'vac-k-0':'0,25','vac-k-1':'0,25','vac-k-2':'0,05','vac-k-3':'0,05',
    'vac-b-0':'140','vac-b-1':'252','vac-b-2':'29','vac-b-3':'300','vac-b-4':'277','vac-b-5':'86',
    'vac-b-6':'344','vac-b-7':'314','vac-b-8':'137','vac-b-9':'400','vac-b-10':'19','vac-b-11':'287',
    'ci-ct-0':'2756340','ci-ct-1':'2512180',
    'vac-mv-0':'4 s','vac-mv-1':'-428 mBar','vac-mv-2':'-318 mBar',
  }),
  'Planta Yal - BAA142 - N3': _mk({
    'c1tp-1':'253','c1tp-2':'243','c1tp-3':'0,27','c1tp-4':'0,27','c1tp-5':'0,49','c1tp-6':'0,49',
    'c1pr-1':'1,08','c1pr-3':'1,08','c1pr-5':'1,52','c1pr-7':'1,88','c1pr-9':'1,38',
    'c1pr-10':'4,30','c1pr-12':'0,92','c1pr-13':'1,88',
    'c1p2-3':'0,42','c1p2-5':'0,92','c1p2-7':'0,92',
    'h1ev-3':'0,48','h1ev-4':'0,58',
    'h1epc-0':'27','h1epc-1':'41','h1epc-2':'65','h1epc-3':'79',
    'h1tmb-0':'0,29','h1tmb-1':'0,28','h1tmb-2':'0,28','h1tmb-3':'0,27',
    'h1tmb-4':'0,28','h1tmb-5':'0,28','h1tmb-6':'0,27','h1tmb-7':'0,27',
    'h1tpp-0':'0,44','h1tpp-1':'262','h1tpp-2':'252',
    'h1pb-2':'2,32','h1pb-3':'2,12','h1pb-4':'0,26','h1pb-6':'0,26',
    'h1ps-0':'2,85','h1ps-1':'1,85','h1ps-4':'0,50','h1ps-5':'0,70','h1ps-6':'3,85',
    'c2t-0':'0,12','c2t-1':'0,12',
    'ev-1':'8','ev-2':'58','ev-3':'58','ev-4':'132','ev-5':'192',
    'ci-fa-0':'143','ci-fa-1':'173','ci-fa-2':'183','ci-fa-3':'212','ci-fa-v':'195',
    'ci-av-0':'106','ci-av-1':'91','ci-av-2':'78','ci-av-3':'68',
    'ci-ymk-0':'0,17',
    'h2-2as-1':'0,12','h2-2as-2':'0,11','h2-2as-3':'0,30',
    'h2-2bvs-1':'0,26','h2-2bvs-2':'292','h2-2bvs-3':'292','h2-2bvs-4':'292','h2-2bvs-5':'292',
    'h2-2ac-0':'0,26',
    'h2-2bvc-1':'282','h2-2bvc-2':'282','h2-2bvc-3':'282','h2-2bvc-4':'282',
    'h2pr-3':'1,52','h2pr-4':'2,42','h2pr-6':'2,12','h2pr-8':'2,85','h2pr-9':'2,85','h2pr-11':'2,85',
    'h2imp-s0':'2,48','h2imp-s1':'2,28','h2imp-s2':'3,85','h2imp-s3':'3,65',
    'h2imp-c0':'2,28','h2imp-c1':'2,08','h2imp-c2':'3,65','h2imp-c3':'3,35',
    'h2ag-0':'2,35','h2ag-1':'0,95','h2ag-2':'0,40','h2ag-4':'1,45',
    'vac-k-0':'0,28','vac-k-1':'0,28','vac-k-2':'0,08','vac-k-3':'0,08',
    'vac-b-0':'135','vac-b-1':'248','vac-b-2':'26','vac-b-3':'295','vac-b-4':'272','vac-b-5':'82',
    'vac-b-6':'338','vac-b-7':'308','vac-b-8':'132','vac-b-9':'393','vac-b-10':'16','vac-b-11':'281',
    'ci-ct-0':'1432760','ci-ct-1':'1298540',
    'vac-mv-0':'4 s','vac-mv-1':'-432 mBar','vac-mv-2':'-322 mBar',
  }),
}

/** Siembra los 6 presets por defecto en Firestore (solo si no existen). */
export async function seedDefaultPresets(userId: string): Promise<void> {
  for (const [name, data] of Object.entries(DEFAULT_PRESETS)) {
    await saveHmiPreset(name, data, userId)
  }
  await setCurrentPreset('Planta Principal - BAA142 - N2')
}
