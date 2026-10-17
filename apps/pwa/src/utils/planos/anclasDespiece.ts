import type { Caja, PlanoAparato, PlanoAparicion } from '@/hooks/usePlano'
import { esCajaRespaldo } from '@/utils/recorridoPlano'

/**
 * Ubicaciones del despiece corregidas a mano (modo revisión, 16-10-2026).
 *
 * El OCR del catálogo no halló el número de muchas posiciones (o lo leyó mal) y el visor quedaba
 * sin marca. Un admin o supervisor toca el número en el dibujo y queda guardado en Firestore
 * (`anclasDespiece`); el visor lo aplica ENCIMA de los JSON del plano, sin tocar Storage.
 */
export type AnclaDespiece = {
  hoja: number
  pos: string
  /** código de fabricante de esa posición, para corregir también el índice por código */
  codigo?: string | null
  /** caja en coordenadas del dibujo; null si «no está en este dibujo» */
  b: Caja | null
  estado: 'ubicada' | 'no-esta'
  /** ms desde época (para contar «hoy») */
  en?: number
}

/** Pendiente de la cola: un código con SAP cuya ubicación en esa hoja no está marcada. */
export type PendienteRevision = { codigo: string; h: number }

export const idAncla = (slug: string, hoja: number, pos: string) => `${slug}__${hoja}__${pos.replace(/\//g, '_')}`

/** La caja que deja un toque: del tamaño de un número de globo, centrada donde se tocó. */
export function cajaDeToque(x: number, y: number, lado = 14): Caja {
  const r = (n: number) => Math.round(n * 10) / 10
  return [r(x - lado / 2), r(y - lado / 2), lado, lado]
}

/** Las anclas de una hoja reemplazan (o suman) la marca de su posición. */
export function aplicarATags(tags: readonly PlanoAparato[], hoja: number, anclas: readonly AnclaDespiece[]): PlanoAparato[] {
  const deHoja = anclas.filter((a) => a.hoja === hoja && a.estado === 'ubicada' && a.b)
  if (!deHoja.length) return [...tags]
  const pos = new Set(deHoja.map((a) => a.pos))
  return [...tags.filter((t) => !pos.has(t.t)), ...deHoja.map((a) => ({ t: a.pos, b: a.b! }))]
}

/**
 * Las anclas corrigen también el índice por código (recorrido ‹ 1 de N › y apertura desde
 * Repuestos). En la hoja del ancla, la aparición del código toma la caja nueva: si hay una sola,
 * esa; si hay varias (el mismo código en dos posiciones), la que estaba sin marcar.
 */
export function aplicarAIndice(
  indice: Readonly<Record<string, PlanoAparicion[]>>,
  vbPorHoja: ReadonlyMap<number, readonly number[]>,
  anclas: readonly AnclaDespiece[],
): Record<string, PlanoAparicion[]> {
  const out: Record<string, PlanoAparicion[]> = { ...indice }
  for (const a of anclas) {
    if (a.estado !== 'ubicada' || !a.b || !a.codigo || !out[a.codigo]) continue
    const lista = out[a.codigo]!.map((p) => ({ ...p }))
    const enHoja = lista.filter((p) => p.h === a.hoja)
    // Una sola aparición: esa. Varias: las que siguen sin marca. El catálogo repite filas del mismo
    // código con la MISMA posición (pos. 4 cuatro veces en la fig. 103-3); con una sola corregida,
    // las copias seguían en la cola (16-10-2026: 7 tareas que no se podían cerrar).
    const objetivos = enHoja.length === 1 ? enHoja : enHoja.filter((p) => esCajaRespaldo(p.b, vbPorHoja.get(p.h) ?? []))
    if (!objetivos.length) continue
    for (const o of objetivos) o.b = a.b
    out[a.codigo] = lista
  }
  return out
}

/**
 * La cola del modo revisión: cada código con SAP y cada hoja donde su ubicación sigue con la caja
 * de respaldo, salvo los que ya se marcaron «no está en este dibujo». Ordenada por hoja.
 */
export function colaRevision(
  indice: Readonly<Record<string, PlanoAparicion[]>>,
  sapPorCodigo: Readonly<Record<string, unknown>> | undefined,
  vbPorHoja: ReadonlyMap<number, readonly number[]>,
  anclas: readonly AnclaDespiece[],
): PendienteRevision[] {
  if (!sapPorCodigo) return []
  const noEsta = new Set(anclas.filter((a) => a.estado === 'no-esta' && a.codigo).map((a) => `${a.hoja}|${a.codigo}`))
  const vistos = new Set<string>()
  const cola: PendienteRevision[] = []
  for (const [codigo, lista] of Object.entries(indice)) {
    if (!(codigo in sapPorCodigo)) continue
    for (const p of lista) {
      const k = `${p.h}|${codigo}`
      if (vistos.has(k) || noEsta.has(k) || !esCajaRespaldo(p.b, vbPorHoja.get(p.h) ?? [])) continue
      vistos.add(k)
      cola.push({ codigo, h: p.h })
    }
  }
  return cola.sort((a, b) => a.h - b.h || a.codigo.localeCompare(b.codigo))
}

/** Cuántas anclas se guardaron hoy (para el contador del modo revisión). */
export function hechasHoy(anclas: readonly AnclaDespiece[], ahora = Date.now()): { ubicadas: number; noEsta: number } {
  const d = new Date(ahora)
  const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const hoy = anclas.filter((a) => (a.en ?? 0) >= inicio)
  return { ubicadas: hoy.filter((a) => a.estado === 'ubicada').length, noEsta: hoy.filter((a) => a.estado === 'no-esta').length }
}
