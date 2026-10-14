/**
 * Intensidad de la paleta Pizarra: Día · Penumbra · Automático.
 *
 * Lógica PURA (sin DOM ni localStorage) para resolver, antes del primer pintado,
 * qué piel y qué intensidad corresponden. La misma regla vive copiada a mano en
 * el script inline de `index.html` (no puede importar módulos); el test
 * `intensidad.test.ts` EJECUTA ese script y lo compara contra estas funciones,
 * así que si una cambia sin la otra, falla.
 *
 * Solo aplica con la paleta Pizarra activa. Pizarra es la PREDETERMINADA (activación
 * 2026-10-22): se desactiva con `?skin=apple` (paleta anterior) o `?skin=default`
 * (piel antigua). Con la paleta anterior nada de esto corre: `app-theme` manda igual
 * que siempre.
 */

export type Intensidad = 'dia' | 'penumbra' | 'auto'

/** Clave de localStorage de la intensidad, por dispositivo (no por usuario). */
export const CLAVE_INTENSIDAD = 'app-intensidad'

/** Evento de window para sincronizar varias instancias de `useTheme`. */
export const EVENTO_INTENSIDAD = 'app-intensidad-cambio'

/** `theme-color` del chrome móvil con Pizarra (= `--background` de cada intensidad). */
export const THEME_COLOR_PIZARRA = { dia: '#F2F1EC', penumbra: '#171614' } as const

export function esIntensidad(v: unknown): v is Intensidad {
  return v === 'dia' || v === 'penumbra' || v === 'auto'
}

export interface EntradaIntensidad {
  /** Valor crudo de `app-intensidad` (null si nunca se eligió). */
  guardada: string | null
  /** Valor crudo de `app-theme` (null si no existe). */
  tema: string | null
  /** Celular: ancho < 768 px o puntero táctil (coarse). */
  esCelular: boolean
  /** `prefers-color-scheme: dark` del sistema. */
  sistemaOscuro: boolean
}

/** ¿Queda oscuro con esta intensidad? `auto` sigue al sistema. */
export function oscuroDe(intensidad: Intensidad, sistemaOscuro: boolean): boolean {
  if (intensidad === 'penumbra') return true
  if (intensidad === 'dia') return false
  return sistemaOscuro
}

/**
 * Orden de decisión:
 *  1. `app-intensidad` válida → se respeta.
 *  2. Si no, en celular → Día, IGNORANDO `app-theme` (casi todos los celulares
 *     tienen 'dark' guardado porque `useTheme` lo escribía en la primera visita,
 *     no porque la persona lo eligiera). No se escribe `app-intensidad`: si luego
 *     elige otra cosa con el control, eso queda guardado y se respeta.
 *  3. Si no, en PC: `app-theme` guardado (dark → Penumbra, light → Día); si no hay, Automático.
 */
export function resolverIntensidad(e: EntradaIntensidad): { intensidad: Intensidad; oscuro: boolean } {
  let intensidad: Intensidad
  if (esIntensidad(e.guardada)) intensidad = e.guardada
  else if (e.esCelular) intensidad = 'dia'
  else if (e.tema === 'dark') intensidad = 'penumbra'
  else if (e.tema === 'light') intensidad = 'dia'
  else intensidad = 'auto'
  return { intensidad, oscuro: oscuroDe(intensidad, e.sistemaOscuro) }
}

export interface PielResuelta {
  /** Valor para `data-skin` (null = sin atributo = piel anterior). */
  dataSkin: string | null
  /** Valor para `data-paleta` (null = sin atributo = paleta normal). */
  paleta: 'pizarra' | null
  /** Si viene `?skin=`, el valor a recordar en `app-skin`; si no, null. */
  recordar: string | null
}

/** Clave de localStorage de la piel elegida (`pizarra` · `apple` · `default`). */
export const CLAVE_PIEL = 'app-skin'

/**
 * Clave de versión de la migración de `app-skin`. Vale `VERSION_PIEL` cuando el
 * dispositivo ya pasó por la activación de Pizarra como predeterminada.
 */
export const CLAVE_PIEL_VERSION = 'app-skin-v'
export const VERSION_PIEL = '2'

/** Piel que se usa si la persona nunca eligió una. */
export const PIEL_PREDETERMINADA = 'pizarra'

/**
 * Qué piel queda efectiva. Orden: `?skin=` > `app-skin` guardado > Pizarra.
 *
 * MIGRACIÓN: antes de Pizarra, `apple` era el predeterminado y las páginas /dev
 * escribían `app-skin='apple'` solo por abrirse (sin que nadie lo eligiera), además
 * de los enlaces `?skin=apple` de las pruebas. Por eso un `apple` guardado SIN la
 * marca `app-skin-v=2` es indistinguible de una elección: se trata como «sin elegir».
 * Con la marca puesta, `apple` es una elección explícita y se respeta.
 * (`default` y `pizarra` solo se guardaban al elegirlos a propósito: se respetan.)
 */
export function pielEfectiva(qs: string | null, guardada: string | null, migrada: boolean): string {
  const g = guardada === 'apple' && !migrada ? null : guardada
  return qs || g || PIEL_PREDETERMINADA
}

/**
 * `pizarra` (predeterminada) → data-skin="apple" + data-paleta="pizarra".
 * `apple` = paleta anterior; `default` = sin atributo (piel antigua).
 * `migrada` solo importa para un `apple` guardado (ver `pielEfectiva`).
 */
export function resolverPiel(qs: string | null, guardada: string | null, migrada = true): PielResuelta {
  const skin = pielEfectiva(qs, guardada, migrada)
  if (skin === 'pizarra') return { dataSkin: 'apple', paleta: 'pizarra', recordar: qs || null }
  return { dataSkin: skin === 'default' ? null : skin, paleta: null, recordar: qs || null }
}

/** localStorage que nunca lanza (modo privado, cuota llena, almacenamiento bloqueado). */
export function leerAlmacen(clave: string): string | null {
  try { return localStorage.getItem(clave) } catch { return null }
}

/** Escribe sin lanzar. Devuelve si quedó guardado. */
export function escribirAlmacen(clave: string, valor: string): boolean {
  try { localStorage.setItem(clave, valor); return true } catch { return false }
}

/** Borra sin lanzar (mejor esfuerzo). */
export function borrarAlmacen(clave: string): void {
  try { localStorage.removeItem(clave) } catch { /* sin almacenamiento: nada que borrar */ }
}

/** Lee el entorno real (storage + matchMedia) y resuelve. Solo navegador. */
export function resolverIntensidadActual(): { intensidad: Intensidad; oscuro: boolean } {
  const mq = (q: string) => typeof window.matchMedia === 'function' && window.matchMedia(q).matches
  return resolverIntensidad({
    guardada: leerAlmacen(CLAVE_INTENSIDAD),
    tema: leerAlmacen('app-theme'),
    esCelular: mq('(max-width: 767px)') || mq('(pointer: coarse)'),
    sistemaOscuro: mq('(prefers-color-scheme: dark)'),
  })
}

/** Piel efectiva leída del almacenamiento real (páginas /dev, que no pasan por index.html). */
export function pielGuardadaEfectiva(): string {
  return pielEfectiva(null, leerAlmacen(CLAVE_PIEL), leerAlmacen(CLAVE_PIEL_VERSION) === VERSION_PIEL)
}

/** Guarda una piel ELEGIDA a propósito, con la marca que la distingue de un `apple` heredado. */
export function recordarPiel(skin: string): void {
  escribirAlmacen(CLAVE_PIEL, skin)
  escribirAlmacen(CLAVE_PIEL_VERSION, VERSION_PIEL)
}

/** ¿El documento tiene la paleta Pizarra activa? */
export function paletaPizarraActiva(): boolean {
  return document.documentElement.getAttribute('data-paleta') === 'pizarra'
}

/**
 * Aplica al <html> el valor de `app-skin` (páginas /dev que lo copian a mano):
 * `pizarra` = data-skin="apple" + data-paleta="pizarra"; `apple` = piel anterior;
 * `default` = sin atributos.
 */
export function aplicarPielAlDocumento(skin: string): void {
  const root = document.documentElement
  const r = resolverPiel(skin, null)
  if (r.dataSkin) root.setAttribute('data-skin', r.dataSkin)
  else root.removeAttribute('data-skin')
  if (r.paleta) root.setAttribute('data-paleta', r.paleta)
  else root.removeAttribute('data-paleta')
}
