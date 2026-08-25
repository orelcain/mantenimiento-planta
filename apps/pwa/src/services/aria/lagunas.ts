/**
 * Lagunas de ARIA: las preguntas que no supo responder.
 *
 * POR QUÉ EXISTE
 * --------------
 * En Telegram esto ya funciona: cuando ARIA queda corta, la Cloud Function
 * guarda la pregunta en `ariaGaps` y después uno le puede preguntar "¿qué no
 * has sabido responder?" para enseñarle el dato que falta. Hay 6 registradas,
 * y son concretas — "Agrega ese repuesto de bomba a los estanques de exterior"
 * → *"No encontré el equipo ESTANQUES DE EXTERIOR en la jerarquía"*.
 *
 * En el chat de la PWA **nada de eso pasaba**: ni se registraban las lagunas ni
 * se podían consultar. Todo lo que ARIA no sabía responder ahí se perdía, y la
 * lista de lo que le falta aprender quedaba a medias.
 *
 * Regla del proyecto: ARIA es una sola. Lo que se mejora en Telegram va también
 * al chat de la PWA.
 */

import { collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from '@/services/firestoreTracked'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'

const COLECCION = 'ariaGaps'

/**
 * Las mismas señales que usa el bot: la respuesta admite que no hay dato.
 * Se mantiene idéntica a la de `functions/index.js` a propósito — si una queda
 * corta y la otra no, la lista deja de servir para saber qué enseñarle.
 */
const SENAL_DE_LAGUNA =
  /(no encontr|no tengo|no hay (datos|registros|informaci)|sin datos|no cuento con|no s[eé]\b|no dispon)/i

/** Acciones donde "no encontré nada" no es una laguna, sino la respuesta correcta. */
const ACCIONES_SIN_LAGUNA = new Set([
  'confirmar', 'cancelar', 'aprender', 'lagunas', 'recordar', 'olvidar',
  'brief', 'brief_activar', 'brief_desactivar', 'alertas_activar', 'alertas_desactivar',
])

export function quedoCorta(respuesta: string | null | undefined, accion?: string | null): boolean {
  if (accion && ACCIONES_SIN_LAGUNA.has(accion)) return false
  const texto = (respuesta ?? '').trim()
  if (!texto) return false
  return SENAL_DE_LAGUNA.test(texto)
}

export interface Laguna {
  id: string
  pregunta: string
  respuesta: string
  accion: string
  origen: string
  fecha: Date | null
}

/** Guarda la pregunta que quedó sin respuesta. Best-effort: no rompe el chat. */
export async function registrarLaguna(params: {
  pregunta: string
  respuesta: string
  accion?: string | null
  userId?: string | null
}): Promise<void> {
  try {
    await addDoc(collection(db, COLECCION), {
      pregunta: params.pregunta.slice(0, 300),
      respuesta: params.respuesta.slice(0, 300),
      accion: params.accion || '?',
      // Para poder separar después qué se preguntó por Telegram y qué en la app.
      origen: 'pwa',
      userId: params.userId || null,
      fecha: serverTimestamp(),
    })
  } catch (err) {
    logger.warn('No se pudo registrar la laguna de ARIA', { err: String(err) })
  }
}

export async function listarLagunas(max = 12): Promise<Laguna[]> {
  const snap = await getDocs(query(collection(db, COLECCION), orderBy('fecha', 'desc'), limit(max)))
  return snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>
    const fecha = x.fecha as { toDate?: () => Date } | undefined
    return {
      id: d.id,
      pregunta: String(x.pregunta ?? ''),
      respuesta: String(x.respuesta ?? ''),
      accion: String(x.accion ?? '?'),
      origen: String(x.origen ?? 'telegram'),
      fecha: typeof fecha?.toDate === 'function' ? fecha.toDate() : null,
    }
  })
}

/** Texto listo para mostrar en el chat. */
export function formatearLagunas(lagunas: Laguna[]): string {
  if (lagunas.length === 0) {
    return 'No tengo lagunas registradas: hasta ahora pude responder todo lo que me preguntaron.'
  }
  const lineas = lagunas.map((l) => {
    const cuando = l.fecha ? l.fecha.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) : 's/f'
    return `- ${cuando} [${l.origen}] "${l.pregunta}"`
  })
  return [
    `Preguntas que no pude responder bien (últimas ${lagunas.length}):`,
    ...lineas,
    '',
    'Si sabés el dato que falta, decímelo con "aprende: ..." y queda para la próxima.',
  ].join('\n')
}
