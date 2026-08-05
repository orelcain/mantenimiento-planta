import { describe, it, expect } from 'vitest'
import {
  displayShiftName,
  isMidnightShift,
  getShiftDisplayDateKey,
  getCfDateKeyForDisplayDay,
  slxKeyForVisualShift,
  getShiftMeta,
  isUnscheduledShift,
} from '../graderShiftDisplay'

describe('isMidnightShift — dateKey del CF = día calendario (verificado vs prod)', () => {
  it('Turno 3 NUNCA desplaza: su dateKey ya es el día calendario del turno', () => {
    // Regresión: el T3 real arranca 00:00 y shiftDateKeyFromStart guarda
    // dateKey = día de inicio. El desplazamiento +1 (convención vieja del CF,
    // sin docs vivos) mostraba 2026-07-07_Turno 3 como del 8 de julio.
    expect(isMidnightShift('Turno 3', '2026-07-07')).toBe(false)
    expect(isMidnightShift('Turno 3', '2026-04-27')).toBe(false)
    expect(isMidnightShift('Turno 3')).toBe(false)
  })

  it('otros turnos tampoco desplazan', () => {
    expect(isMidnightShift('Turno 1', '2026-04-26')).toBe(false)
    expect(isMidnightShift('Turno 1 Lunes', '2026-07-06')).toBe(false)
    expect(isMidnightShift('Unscheduled', '2026-04-26')).toBe(false)
  })
})

describe('getShiftDisplayDateKey / getCfDateKeyForDisplayDay — identidad', () => {
  it('display = dateKey CF para todos los turnos', () => {
    expect(getShiftDisplayDateKey('2026-07-07', 'Turno 3')).toBe('2026-07-07')
    expect(getShiftDisplayDateKey('2026-04-27', 'Turno 3')).toBe('2026-04-27')
    expect(getShiftDisplayDateKey('2026-07-06', 'Turno 2')).toBe('2026-07-06')
  })

  it('la inversa también es identidad', () => {
    expect(getCfDateKeyForDisplayDay('2026-07-07', 'Turno 3')).toBe('2026-07-07')
    expect(getCfDateKeyForDisplayDay('2026-07-06', 'Turno 1 Lunes')).toBe('2026-07-06')
  })

  it('slxKeyForVisualShift arma la clave con el mismo día', () => {
    expect(slxKeyForVisualShift('2026-07-07', 'Turno 3')).toBe('2026-07-07__Turno 3')
    expect(slxKeyForVisualShift('2026-07-06', 'Turno 2')).toBe('2026-07-06__Turno 2')
  })
})

describe('getShiftMeta — nombres que emite Shoplogix', () => {
  it('conoce "Turno 1 Lunes" (variante chonchi 2026-07)', () => {
    const meta = getShiftMeta('Turno 1 Lunes')
    expect(meta.shortLabel).toBe('T1L')
    expect(meta.isDayLike).toBe(false)
  })

  it('muestra "Unscheduled" como "Sin turno asignado" (registro fiel, PR #157)', () => {
    const meta = getShiftMeta('Unscheduled')
    expect(meta.label).toBe('Sin turno asignado')
  })

  it('nombre desconocido cae al fallback sin romper', () => {
    expect(getShiftMeta('Turno Nuevo X').shortLabel).toBe('?')
  })
})

describe('getShiftMeta — período derivado del HORARIO real (no del nombre)', () => {
  it('caso Yal 2026-07-08: "Turno 1" a las 00:00 es NOCHE 🌙, no mañana ☀', () => {
    // Shoplogix reusó "Turno 1" para la madrugada 00:00–06:45. Sin scheduledStart
    // se pintaba "mañana ☀" (mentira); con el horario real debe ser noche 🌙.
    const meta = getShiftMeta('Turno 1', '2026-07-08T00:00:00.000Z')
    expect(meta.period).toBe('noche')
    expect(meta.iconName).toBe('Moon')
    expect(meta.isDayLike).toBe(false)
    // El NOMBRE del turno sigue fiel a Shoplogix (no inventamos "Turno 3")…
    expect(meta.label.startsWith('Turno 1')).toBe(true)
    expect(meta.shortLabel).toBe('T1')
    // …pero el período del título también sigue la hora real. Antes decía
    // "Turno 1 — Mañana" con el ícono 🌙 al lado: se contradecía solo.
    expect(meta.label).toBe('Turno 1 — Madrugada')
  })

  it('distingue madrugada de noche en el título', () => {
    // Para el operador no es lo mismo entrar 21:30 que 01:30, aunque el color
    // de ambos sea "noche".
    expect(getShiftMeta('Turno 1', '2026-07-31T21:30:00.000Z').label).toBe('Turno 1 — Noche')
    expect(getShiftMeta('Turno 1', '2026-08-01T01:34:00.000Z').label).toBe('Turno 1 — Madrugada')
  })

  it('"Turno 2" a las 09:00 (chonchi) es MAÑANA ☀ aunque el nombre sugiera tarde', () => {
    const meta = getShiftMeta('Turno 2', '2026-07-06T09:00:00.000Z')
    expect(meta.period).toBe('mañana')
    expect(meta.iconName).toBe('Sun')
  })

  it('"Turno 1" a las 21:30 (chonchi noche) es NOCHE 🌙', () => {
    const meta = getShiftMeta('Turno 1', '2026-07-06T21:30:00.000Z')
    expect(meta.period).toBe('noche')
    expect(meta.iconName).toBe('Moon')
  })

  it('sin scheduledStart cae a la tabla por nombre (comportamiento previo intacto)', () => {
    expect(getShiftMeta('Turno 1').period).toBe('mañana')
    expect(getShiftMeta('Turno 1', null).period).toBe('mañana')
    expect(getShiftMeta('Turno 1', 'fecha-inválida').period).toBe('mañana')
  })

  it('scheduleHint refleja la hora real de inicio (ya no el rango mentiroso del nombre)', () => {
    expect(getShiftMeta('Turno 1', '2026-07-08T00:00:00.000Z').scheduleHint).toBe('desde 00:00')
    expect(getShiftMeta('Turno 1').scheduleHint).toBe('07:45–14:45') // sin horario: rango del nombre
  })

  it('acepta Date además de string ISO', () => {
    const meta = getShiftMeta('Turno 1', new Date('2026-07-08T00:00:00.000Z'))
    expect(meta.period).toBe('noche')
  })
})

describe('isUnscheduledShift — centraliza el literal "Unscheduled" (antes repetido en ~7 puntos)', () => {
  it('true solo para el string exacto "Unscheduled"', () => {
    expect(isUnscheduledShift('Unscheduled')).toBe(true)
  })

  it('false para turnos reales, incluidos los que contienen la palabra como substring', () => {
    expect(isUnscheduledShift('Turno 1')).toBe(false)
    expect(isUnscheduledShift('Turno 2')).toBe(false)
    expect(isUnscheduledShift('Turno día')).toBe(false)
    expect(isUnscheduledShift('UnscheduledX')).toBe(false)
  })

  it('false/sin lanzar para null, undefined y string vacío', () => {
    expect(isUnscheduledShift(null)).toBe(false)
    expect(isUnscheduledShift(undefined)).toBe(false)
    expect(isUnscheduledShift('')).toBe(false)
  })

  it('la traducción amigable de Unscheduled sigue siendo "Sin turno asignado" (contrato usado en varias UIs)', () => {
    const meta = getShiftMeta('Unscheduled')
    expect(meta.label).toBe('Sin turno asignado')
    expect(meta.shortLabel).toBe('S/T')
  })
})

describe('displayShiftName — el día de la semana no va en el nombre', () => {
  it('quita el sufijo de día (pedido de Orel: "¿por qué Lunes?")', () => {
    // El día ya se ve en la columna de la matriz; repetirlo confunde.
    expect(displayShiftName('Turno 1 Lunes')).toBe('Turno 1')
    expect(displayShiftName('Turno 2 Miércoles')).toBe('Turno 2')
    expect(displayShiftName('Turno 3 sábado')).toBe('Turno 3')
  })

  it('no toca los nombres normales', () => {
    for (const id of ['Turno 1', 'Turno 2', 'Turno 3', 'Turno día', 'Turno Dia', 'Unscheduled']) {
      expect(displayShiftName(id)).toBe(id)
    }
  })

  it('solo el SUFIJO: un día en medio del nombre se respeta', () => {
    expect(displayShiftName('Turno Lunes especial')).toBe('Turno Lunes especial')
  })

  it('nunca devuelve vacío', () => {
    // Si el shiftId fuera solo un día, quitarlo dejaria la fila sin nombre.
    expect(displayShiftName('Lunes')).toBe('Lunes')
  })
})
