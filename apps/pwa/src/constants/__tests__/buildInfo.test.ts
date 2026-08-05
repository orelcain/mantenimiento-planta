/**
 * El sello de versión del sidebar. Se prueba con `now` inyectado porque
 * `BUILD_TIME` es el del bundle que corre y no se puede mover: los tres tramos
 * (hoy / ayer / antes) solo se distinguen moviendo el "ahora".
 */
import { describe, it, expect } from 'vitest'
import { BUILD_TIME, formatUpdatedLabel, formatBuildDateShort } from '../buildInfo'

const build = new Date(BUILD_TIME)
const plusDays = (n: number) => new Date(build.getTime() + n * 86_400_000)
const hhmm = `${String(build.getHours()).padStart(2, '0')}:${String(build.getMinutes()).padStart(2, '0')}`

describe('formatUpdatedLabel', () => {
  it('el mismo día dice "hoy" con la hora', () => {
    expect(formatUpdatedLabel(build)).toBe(`Actualizada hoy ${hhmm}`)
  })

  it('un día después dice "ayer", aunque hayan pasado menos de 24 h', () => {
    // Al día siguiente a las 00:05 siguen sin pasar 24 h desde un build de las
    // 23:00, pero para quien mira es "ayer": la comparación es por día de
    // calendario, no por milisegundos.
    const maniana = new Date(plusDays(1).getFullYear(), plusDays(1).getMonth(), plusDays(1).getDate(), 0, 5)
    expect(formatUpdatedLabel(maniana)).toBe(`Actualizada ayer ${hhmm}`)
  })

  it('más atrás muestra la fecha, no un "hace N días" que envejece mal', () => {
    expect(formatUpdatedLabel(plusDays(9))).toBe(`Actualizada el ${formatBuildDateShort()}`)
  })

  it('nunca dice "mañana" si el reloj del equipo va atrasado', () => {
    expect(formatUpdatedLabel(plusDays(-2))).toBe(`Actualizada hoy ${hhmm}`)
  })
})
