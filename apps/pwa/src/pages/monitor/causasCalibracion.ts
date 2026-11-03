/**
 * Calibración estática de las causas v3 de las micro (la «causa probable» del monitor).
 *
 * Fuente: `ARIA_MANTENIMIENTO_PLANTA/scripts/microdetenciones_2026-11-02_v3/resultados_v3/calibracion_v3_2026-11-02.json` (corrida del 02-11-2026,
 * ventana W37 a W44 = 8 semanas; estudio `docs/ESTUDIO_MICRO_CATEGORIAS_V3_2026-11-02.md`). Los valores se copiaron tal cual: una prueba
 * (`__tests__/causasCalibracion.test.ts`) los compara con una copia del json en `__tests__/fixtures/`. Si se vuelve a calibrar, se cambia este
 * archivo y esa copia juntos.
 *
 * Por planta: la ventana, la fecha y los parámetros del algoritmo. Por forma de causa: `estado` («activa» suma a la causa probable; «en observación»
 * se muestra pero no suma) y `precision_estimada` (la fracción de esas micro que supera lo habitual del turno). Las «en observación» llevan además su `motivo`
 * (`pocas`: pocas micro; `sin_exceso`: no fueron más seguidas que lo habitual) y las `obs` de la ventana.
 *
 * Las claves de planta son el `plantSlug` del doc del monitor. Una línea que no está aquí NO tiene calibración: no se estima la causa probable.
 */

/** Las formas calibradas: «Otra Baader paró» (`linea`) tiene tres. */
export type FormaCalibrada = 'arranque' | 'linea_a_la_vez' | 'linea_en_cadena' | 'linea_tras_paro_otra' | 'paro'
export type EstadoForma = 'activa' | 'en observación'

/**
 * Por qué una forma queda «en observación»:
 *  · `pocas`: tuvo pocas micro en las 8 semanas (menos de `N_MIN` = 30). No alcanza para estimar, aunque el exceso dé alto.
 *  · `sin_exceso`: tuvo micro de sobra, pero no fueron más seguidas que en cualquier otro momento del turno (la cota baja del IC95 del lift no pasa de 1).
 * Dicen cosas OPUESTAS al técnico, así que el texto de la observación no puede ser el mismo.
 */
export type MotivoObservacion = 'pocas' | 'sin_exceso'

/** `motivo` y `obs` (las micro de la ventana) van solo en las formas «en observación»; se derivan de `obs`, `lift` e `ic95` del json (una prueba lo comprueba). */
export interface CalibracionForma { estado: EstadoForma; precision_estimada: number; motivo?: MotivoObservacion; obs?: number }

/** Parámetros del algoritmo, en ms (como en `causas_v3.py`): ARR = ventana del arranque, TRAS = «Al volver de una detención», CAD_HI y OTR_HI = topes de «en cadena» y «detención previa». */
export interface ParametrosCausas { ARR: number; PROD: boolean; TRAS: number; CAD: boolean; CAD_HI: number; OTR: boolean; OTR_HI: number; OTR_TODAS: boolean }

export interface CalibracionPlanta {
  /** Semanas ISO de la ventana, de la primera a la última. */
  ventana: [string, string]
  /** Fecha de la calibración (AAAA-MM-DD). */
  fecha: string
  parametros: ParametrosCausas
  categorias: Partial<Record<FormaCalibrada, CalibracionForma>>
}

/** Las 8 semanas de la ventana (`VENTANA_SEM` de la calibración). */
export const SEMANAS_VENTANA = 8

/** Lo que vale sin calibración: los parámetros de v3 (Chonchi y Filete). */
export const PARAMETROS_V3: ParametrosCausas = { ARR: 600000, PROD: true, TRAS: 120000, CAD: true, CAD_HI: 52500, OTR: true, OTR_HI: 127500, OTR_TODAS: false }

export const CALIBRACION_V3: Record<'chonchi' | 'yal' | 'filete', CalibracionPlanta> = {
  chonchi: {
    ventana: ['2026-W37', '2026-W44'],
    fecha: '2026-11-02',
    parametros: { ARR: 600000, PROD: true, TRAS: 120000, CAD: true, CAD_HI: 52500, OTR: true, OTR_HI: 127500, OTR_TODAS: false },
    categorias: {
      arranque: { estado: 'activa', precision_estimada: 0.228 },
      linea_a_la_vez: { estado: 'activa', precision_estimada: 0.388 },
      linea_en_cadena: { estado: 'activa', precision_estimada: 0.514 },
      linea_tras_paro_otra: { estado: 'activa', precision_estimada: 0.454 },
      paro: { estado: 'en observación', precision_estimada: -0.238, motivo: 'sin_exceso', obs: 152 },
    },
  },
  yal: {
    ventana: ['2026-W37', '2026-W44'],
    fecha: '2026-11-02',
    parametros: { ARR: 600000, PROD: true, TRAS: 90000, CAD: true, CAD_HI: 52500, OTR: true, OTR_HI: 127500, OTR_TODAS: false },
    categorias: {
      arranque: { estado: 'activa', precision_estimada: 0.119 },
      linea_a_la_vez: { estado: 'activa', precision_estimada: 0.616 },
      linea_en_cadena: { estado: 'en observación', precision_estimada: 0.729, motivo: 'pocas', obs: 15 },
      linea_tras_paro_otra: { estado: 'activa', precision_estimada: 0.556 },
      paro: { estado: 'activa', precision_estimada: 0.315 },
    },
  },
  filete: {
    ventana: ['2026-W37', '2026-W44'],
    fecha: '2026-11-02',
    parametros: { ARR: 600000, PROD: true, TRAS: 120000, CAD: true, CAD_HI: 52500, OTR: true, OTR_HI: 127500, OTR_TODAS: false },
    categorias: {
      arranque: { estado: 'activa', precision_estimada: 0.176 },
      paro: { estado: 'en observación', precision_estimada: 0.042, motivo: 'sin_exceso', obs: 139 },
    },
  },
}

/** Cómo se llama cada planta en pantalla. */
export const NOMBRE_PLANTA: Record<keyof typeof CALIBRACION_V3, string> = { chonchi: 'Chonchi', yal: 'Yal', filete: 'Filete' }

/** La calibración de una planta (por `plantSlug`), o null si esa línea no la tiene. */
export function calibracionDe(planta: string | null | undefined): (CalibracionPlanta & { planta: keyof typeof CALIBRACION_V3; nombre: string }) | null {
  const clave = (planta ?? '').trim().toLowerCase()
  if (!Object.prototype.hasOwnProperty.call(CALIBRACION_V3, clave)) return null
  const k = clave as keyof typeof CALIBRACION_V3
  return { ...CALIBRACION_V3[k], planta: k, nombre: NOMBRE_PLANTA[k] }
}

/** «2026-11-02» → «02-11-2026». */
export const fechaDMA = (iso: string) => iso.split('-').reverse().join('-')
