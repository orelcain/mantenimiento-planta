/**
 * sidebarConfig.ts — Persistencia del orden del sidebar en Firestore
 * Colección: sidebarConfig / doc: 'default'
 */
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'

export interface SidebarItemConfig {
  name: string
  href: string
}

export interface SidebarGroupConfig {
  id: string
  label: string
  itemOrder: string[] // hrefs in order
}

export interface SidebarConfig {
  groupOrder: string[]         // group ids in order
  groups: SidebarGroupConfig[] // per-group item order
  updatedAt: number
}

const DOC_REF = () => doc(db, 'sidebarConfig', 'default')

export async function loadSidebarConfig(): Promise<SidebarConfig | null> {
  try {
    const snap = await getDoc(DOC_REF())
    if (!snap.exists()) return null
    return snap.data() as SidebarConfig
  } catch {
    return null
  }
}

export async function saveSidebarConfig(config: Omit<SidebarConfig, 'updatedAt'>): Promise<void> {
  await setDoc(DOC_REF(), { ...config, updatedAt: Date.now() })
}
