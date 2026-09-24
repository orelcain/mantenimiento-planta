import type { PlanoAparicion } from '@/hooks/usePlano'

/**
 * Recorrido por TODAS las ubicaciones de un código en un plano.
 *
 * Caso real (BAADER 200): el 518057 · Rodillo está en 6 lugares del despiece.
 * Antes el buscador saltaba solo al primero y borraba lo escrito, así que para
 * ver el segundo había que volver a teclear el código. Estas funciones son la
 * parte pura: orden estable, paso ‹ › y el historial de búsquedas.
 */

/** Orden de lectura: por hoja, y dentro de la hoja de arriba abajo, de izquierda a derecha. */
export function ordenarPuntos(puntos: readonly PlanoAparicion[]): PlanoAparicion[] {
  return [...puntos].sort((a, b) => a.h - b.h || a.b[1] - b.b[1] || a.b[0] - b.b[0])
}

/** Índice del punto donde conviene arrancar: el de la hoja abierta si hay, si no el primero. */
export function indiceInicial(puntos: readonly PlanoAparicion[], hojaActual?: number, caja?: readonly number[]): number {
  if (caja) {
    const exacto = puntos.findIndex((p) => mismaCaja(p.b, caja))
    if (exacto >= 0) return exacto
  }
  const enHoja = puntos.findIndex((p) => p.h === hojaActual)
  return enHoja >= 0 ? enHoja : 0
}

/** Paso siguiente/anterior con vuelta al inicio (como el buscar del navegador). */
export function paso(i: number, total: number, delta: 1 | -1): number {
  if (total <= 0) return 0
  return (i + delta + total) % total
}

/**
 * Cuando varias ubicaciones caen en la MISMA hoja, "Fig. 70-8" repetido no
 * distingue nada: se numera la marca dentro de la hoja (1ª, 2ª…).
 */
export function marcaEnHoja(puntos: readonly PlanoAparicion[], i: number): number | null {
  const p = puntos[i]
  if (!p) return null
  const misma = puntos.filter((x) => x.h === p.h)
  if (misma.length < 2) return null
  return misma.indexOf(p) + 1
}

export function mismaCaja(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, k) => Math.abs(v - (b[k] ?? NaN)) < 0.5)
}

/* ─────────────────────────── historial ─────────────────────────── */

/** Una búsqueda recordada: el código y, si se conoce, el nombre de la pieza. */
export type BusquedaReciente = { c: string; n?: string }

export const MAX_RECIENTES = 8

/**
 * Lee el historial guardado. Acepta el formato viejo (lista de códigos sueltos)
 * para no perder lo que la gente ya tenía, y descarta basura.
 */
export function leerRecientes(crudo: string | null): BusquedaReciente[] {
  if (!crudo) return []
  try {
    const v: unknown = JSON.parse(crudo)
    if (!Array.isArray(v)) return []
    const out: BusquedaReciente[] = []
    for (const x of v) {
      if (typeof x === 'string' && x) out.push({ c: x })
      else if (x && typeof x === 'object' && typeof (x as BusquedaReciente).c === 'string') {
        const { c, n } = x as BusquedaReciente
        out.push(typeof n === 'string' && n ? { c, n } : { c })
      }
    }
    return out.slice(0, MAX_RECIENTES)
  } catch {
    return []
  }
}

/** Pone la búsqueda al frente sin duplicar; conserva el nombre conocido si el nuevo no trae. */
export function sumarReciente(lista: readonly BusquedaReciente[], nueva: BusquedaReciente): BusquedaReciente[] {
  const previa = lista.find((r) => r.c === nueva.c)
  const n = nueva.n || previa?.n
  const item: BusquedaReciente = n ? { c: nueva.c, n } : { c: nueva.c }
  return [item, ...lista.filter((r) => r.c !== nueva.c)].slice(0, MAX_RECIENTES)
}
