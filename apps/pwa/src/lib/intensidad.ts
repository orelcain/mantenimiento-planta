/**
 * Intensidad de la paleta Pizarra: Día · Penumbra · Automático.
 *
 * Lógica PURA (sin DOM ni localStorage) para resolver, antes del primer pintado,
 * qué piel y qué intensidad corresponden. La misma regla vive copiada a mano en
 * el script inline de `index.html` (no puede importar módulos); el test
 * `intensidad.test.ts` EJECUTA ese script y lo compara contra estas funciones,
 * así que si una cambia sin la otra, falla.
 *
 * Solo aplica con la paleta Pizarra activa (`?skin=pizarra`). Con la paleta
 * normal nada de esto corre: `app-theme` sigue mandando igual que siempre.
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
 *  2. Si no, `app-theme` guardado: dark → Penumbra, light → Día.
 *  3. Si no hay nada: celular → Día; PC → Automático.
 */
export function resolverIntensidad(e: EntradaIntensidad): { intensidad: Intensidad; oscuro: boolean } {
  let intensidad: Intensidad
  if (esIntensidad(e.guardada)) intensidad = e.guardada
  else if (e.tema === 'dark') intensidad = 'penumbra'
  else if (e.tema === 'light') intensidad = 'dia'
  else intensidad = e.esCelular ? 'dia' : 'auto'
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

/**
 * `?skin=pizarra` → app-skin='pizarra' → data-skin="apple" + data-paleta="pizarra".
 * Cualquier otro valor se comporta como hasta ahora (`default` = sin atributo).
 */
export function resolverPiel(qs: string | null, guardada: string | null): PielResuelta {
  const skin = qs || guardada || 'apple'
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

/** ¿El documento tiene la paleta Pizarra activa? */
export function paletaPizarraActiva(): boolean {
  return document.documentElement.getAttribute('data-paleta') === 'pizarra'
}

/**
 * Aplica al <html> el valor de `app-skin` (páginas /dev que lo copian a mano):
 * `pizarra` = data-skin="apple" + data-paleta="pizarra"; `default` = sin atributos.
 */
export function aplicarPielAlDocumento(skin: string): void {
  const root = document.documentElement
  const r = resolverPiel(skin, null)
  if (r.dataSkin) root.setAttribute('data-skin', r.dataSkin)
  else root.removeAttribute('data-skin')
  if (r.paleta) root.setAttribute('data-paleta', r.paleta)
  else root.removeAttribute('data-paleta')
}
