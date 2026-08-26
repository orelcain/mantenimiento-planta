/**
 * Tokens públicos para compartir la rueda de ventanas sin login.
 *
 * Mismo patrón que `graderPublicToken.service` — el doc del token guarda un
 * SNAPSHOT del plan, no una referencia. La alternativa (que la vista pública
 * leyera `rueda_ventanas_state/current`) no es implementable: quien abre el
 * link no tiene sesión, y una regla de Firestore no puede validar que el
 * lector conoce el token, porque el token no viaja en la lectura del otro doc.
 *
 * Como es snapshot, lo compartido se congela: la página pública muestra la
 * fecha del snapshot y el editor tiene un botón para refrescarlo. Es preferible
 * a que el link muestre datos viejos sin decirlo.
 *
 * Expiración: 30 días. Más larga que las 24 h del turno del Grader a propósito
 * — un turno se consume el mismo día, pero un plan semanal se cuelga en la
 * pared y se consulta durante semanas. La contrapartida es que el snapshot
 * queda legible por cualquiera con el link durante ese mes: acá no hay nada
 * sensible (horarios de área), pero por eso mismo NO se debe extender a datos
 * que sí lo sean.
 *
 * Colección: ruedaVentanasPublicTokens
 */

import { doc, getDoc, setDoc, deleteDoc } from '@/services/firestoreTracked'
import { db } from './firebase'
import type { MaquinaRueda } from './ruedaVentanas'

const COLLECTION = 'ruedaVentanasPublicTokens'
const DIAS_VIGENCIA = 30

export interface RuedaPublicTokenDoc {
  token: string
  titulo: string
  maquinas: MaquinaRueda[]
  /** @deprecated El estado de revisión vive en cada máquina desde 2026-08-26. */
  revisadoEnTerreno?: boolean
  createdBy: string
  createdAt: string
  expiresAt: string
}

export function fechaExpiracion(dias = DIAS_VIGENCIA): Date {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000)
}

export async function crearTokenPublico(data: {
  titulo: string
  maquinas: MaquinaRueda[]
  /** @deprecated El estado de revisión vive en cada máquina desde 2026-08-26. */
  revisadoEnTerreno?: boolean
  createdBy: string
  /** Reutiliza un token existente para refrescar su snapshot en vez de crear otro. */
  token?: string
}): Promise<RuedaPublicTokenDoc> {
  const token = data.token ?? crypto.randomUUID()
  const ahora = new Date()
  const docData: RuedaPublicTokenDoc = {
    token,
    titulo: data.titulo,
    maquinas: data.maquinas,
    createdBy: data.createdBy,
    createdAt: ahora.toISOString(),
    expiresAt: fechaExpiracion().toISOString(),
  }
  await setDoc(doc(db, COLLECTION, token), docData)
  return docData
}

/**
 * Un token vencido no llega como documento vencido: la regla lo rechaza y llega
 * como `permission-denied`. Sin distinguirlo, a quien se le venció el link se
 * le diría «no existe», y no tendría forma de saber que basta con pedir otro.
 */
export function esAccesoDenegado(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code
  return typeof code === 'string' && code.includes('permission-denied')
}

export async function cargarTokenPublico(token: string): Promise<RuedaPublicTokenDoc | null> {
  const snap = await getDoc(doc(db, COLLECTION, token))
  if (!snap.exists()) return null
  return snap.data() as RuedaPublicTokenDoc
}

export async function revocarTokenPublico(token: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, token))
}
