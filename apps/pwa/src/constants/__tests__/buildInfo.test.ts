/**
 * El sello de versión del sidebar. Se prueba con `now` inyectado porque
 * `BUILD_TIME` es el del bundle que corre y no se puede mover: los tres tramos
 * (hoy / ayer / antes) solo se distinguen moviendo el "ahora".
 */
import { describe, it, expect } from 'vitest'
import { BUILD_TIME, formatUpdatedLabel, formatBuildDateShort, formatDesfase, formatHora } from '../buildInfo'

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

/*
 * El desfase del banner de actualización. Es el número que se le pone delante
 * a la gente para que recargue: si dice «1 día» cuando fueron 20 minutos, el
 * aviso entero deja de creerse.
 */
describe('formatDesfase', () => {
  const min = (n: number) => n * 60_000

  it('bajo el minuto no inventa una cifra', () => {
    expect(formatDesfase(0)).toBe('recién')
    expect(formatDesfase(20_000)).toBe('recién')
  })

  it('minutos sueltos hasta la hora', () => {
    expect(formatDesfase(min(1))).toBe('1 min')
    expect(formatDesfase(min(45))).toBe('45 min')
    expect(formatDesfase(min(59))).toBe('59 min')
  })

  it('horas con sus minutos, y sin «0 min» colgando', () => {
    expect(formatDesfase(min(60))).toBe('1 h')
    expect(formatDesfase(min(135))).toBe('2 h 15 min')
    expect(formatDesfase(min(120))).toBe('2 h')
  })

  it('pasado el día cuenta días, no 30 h', () => {
    expect(formatDesfase(min(60 * 24))).toBe('1 día')
    expect(formatDesfase(min(60 * 27))).toBe('1 día 3 h')
    expect(formatDesfase(min(60 * 24 * 3))).toBe('3 días')
  })

  it('un reloj adelantado no produce tiempos negativos', () => {
    expect(formatDesfase(-min(30))).toBe('recién')
  })
})

describe('formatHora', () => {
  it('hora local con dos dígitos', () => {
    const d = new Date(2026, 7, 16, 9, 5)
    expect(formatHora(d.getTime())).toBe('09:05')
  })

  it('una fecha inválida no imprime «NaN:NaN»', () => {
    expect(formatHora(Number.NaN)).toBe('')
  })
})
