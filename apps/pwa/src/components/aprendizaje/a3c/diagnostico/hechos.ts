/**
 * Lo que se muestra de un elemento dentro de un paso: LED (y su estado en la foto de la N2),
 * borne X5 donde medir, hojas del plano y tipo. Todo se lee del modelo de la tarjeta
 * (`a3c-datos.json`) en tiempo de ejecución: el diagnóstico no copia bornes ni LED.
 */
import {
  LEDS_ENCENDIDOS_FOTO,
  LEDS_FOTO,
  colorLed,
  describir,
  type ColorLed,
  type ItemA3c,
  type ModeloA3c,
} from '@/utils/aprendizaje/a3c'

export type EstadoLedPaso = 'encendido' | 'apagado' | 'contorno' | 'sin-foto'

export interface HechosElemento {
  item: ItemA3c
  /** LED X5 del elemento (vacío si el plano no le dibuja). */
  leds: number[]
  estado: EstadoLedPaso
  color: ColorLed
  /** «44 · foto N2: apagado», «5 y 6 · contorno, no se enciende · …». */
  ledTexto: string | null
  medir: string | null
  plano: string
  tipo: string | null
}

export const estadoFoto = (n: number): EstadoLedPaso =>
  !LEDS_FOTO.has(n) ? 'sin-foto' : LEDS_ENCENDIDOS_FOTO.has(n) ? 'encendido' : 'apagado'

export function hechosDe(m: ModeloA3c, clave: string): HechosElemento | null {
  const item = describir(m, `e:${clave}`, 'es')
  const e = m.datos.elementos[clave]
  if (!item || !e) return null
  const leds = item.leds
  const n0 = leds[0]
  const contorno = item.modoLed !== 'senal'
  const estado: EstadoLedPaso = n0 == null ? 'sin-foto' : contorno ? 'contorno' : estadoFoto(n0)
  const lista = leds.length > 2 ? `${leds[0]}–${leds[leds.length - 1]}` : leds.join(' y ')
  const foto = item.foto ? item.foto.replace(/^En la foto de la N2: /, 'foto N2: ').replace(/\.$/, '') : 'la foto de la N2 no lo muestra'
  const ledTexto = n0 == null ? null : contorno ? `${lista} · contorno, no se enciende · ${foto}` : `${lista} · ${foto}`
  // Par A/B de un encoder: el borne de cada canal.
  const ab = item.bornes.length === 2 && item.modoLed === 'contorno' && /canal A/i.test(item.cuandoLed)
  const medir = item.bornes.length
    ? ab ? `X5.${item.bornes[0]} (A) · X5.${item.bornes[1]} (B)` : item.bornes.map(n => `X5.${n}`).join(' · ')
    : null
  const hojas = (e.fuentes ?? []).filter(f => /^Plano/.test(f))
  const plano = hojas.length ? hojas.join(' · ') : 'Plano 888, hoja 23'
  return { item, leds, estado, color: n0 != null ? colorLed(n0) : 'r', ledTexto, medir, plano, tipo: item.tipoSensor }
}
