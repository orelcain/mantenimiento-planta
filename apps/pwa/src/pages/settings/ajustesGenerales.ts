/**
 * Los ajustes generales que vive la pantalla de Configuración.
 *
 * POR QUÉ EXISTE
 * --------------
 * La pantalla tenía tres problemas encadenados:
 *
 *  1. Los cuatro "Tiempo de respuesta" eran `<Input defaultValue={15}>` sin
 *     estado ni `onChange`: el botón "Guardar Cambios" **ni los leía**. Se
 *     escribía 45, se apretaba Guardar, decía "Guardado" y no guardaba nada.
 *  2. Los dos switches sí se guardaban, pero al volver a entrar la pantalla
 *     los mostraba en su valor por defecto, no en el guardado.
 *  3. Nada de esto lo lee ninguna otra parte de la app todavía.
 *
 * Lo 1 y 2 se arreglan; lo 3 se dice en pantalla, que es lo honesto.
 */

export interface AjustesGenerales {
  requireValidation: boolean
  autoAssign: boolean
  /** Minutos de respuesta esperados por prioridad. */
  tiempoCriticaMin: number
  tiempoAltaMin: number
  tiempoMediaMin: number
  tiempoBajaMin: number
}

export const AJUSTES_GENERALES_POR_DEFECTO: AjustesGenerales = {
  requireValidation: true,
  autoAssign: false,
  tiempoCriticaMin: 15,
  tiempoAltaMin: 30,
  tiempoMediaMin: 60,
  tiempoBajaMin: 120,
}

function minutos(valor: unknown, porDefecto: number): number {
  const n = typeof valor === 'string' ? Number(valor) : valor
  if (typeof n !== 'number' || !Number.isFinite(n)) return porDefecto
  // Un tiempo de respuesta de 0 o negativo no significa nada; el tope evita
  // que un dedo de más (1500 en vez de 150) quede guardado como 25 horas.
  return Math.min(10_080, Math.max(1, Math.round(n)))
}

/** Lee el documento `settings/general` sin confiar en lo que traiga. */
export function leerAjustesGenerales(data: unknown): AjustesGenerales {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const p = AJUSTES_GENERALES_POR_DEFECTO
  return {
    requireValidation: typeof d.requireValidation === 'boolean' ? d.requireValidation : p.requireValidation,
    autoAssign: typeof d.autoAssign === 'boolean' ? d.autoAssign : p.autoAssign,
    tiempoCriticaMin: minutos(d.tiempoCriticaMin, p.tiempoCriticaMin),
    tiempoAltaMin: minutos(d.tiempoAltaMin, p.tiempoAltaMin),
    tiempoMediaMin: minutos(d.tiempoMediaMin, p.tiempoMediaMin),
    tiempoBajaMin: minutos(d.tiempoBajaMin, p.tiempoBajaMin),
  }
}
