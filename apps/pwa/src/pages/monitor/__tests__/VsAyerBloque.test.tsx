/**
 * «Qué cambió contra ayer»: qué se muestra como CAUSA y qué no.
 *
 * ⚠ Lo que se protege acá: el residuo de la descomposición —los minutos que el
 * sensor no clasificó, más el redondeo— tenía fila propia, con el mismo peso
 * visual que «Línea más lenta» y con nombre de manual («Huecos de sensor y
 * redondeo»). Medido en los 5 turnos comparables de Filete pesa entre 11 y 82
 * pz (1-11% de la diferencia) mientras las causas reales mueven cientos: es
 * ruido, no un motivo. Va al pie, en castellano llano.
 *
 * Y NO se borra: sin él, las cuatro causas no suman la cifra del título y el
 * descuadre se discute en vez de arreglarse.
 *
 * Sin `jest-dom` en este repo: se asierta sobre el texto renderizado.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { VsAyerBloque } from '../MonitorVsAyer'
import { vsAyer, type TurnoResumen } from '@/services/shoplogix/monitorVsAyer'

afterEach(cleanup)

/** Filete, reales: el 14 hizo 788 pz menos que el 13 siendo más rápido. */
const D13: TurnoResumen = { dateKey: '2026-08-13', total: 4707, producingMin: 376, windowMin: 485, plannedMin: 46, recoverableMin: 59 }
const D14: TurnoResumen = { dateKey: '2026-08-14', total: 3919, producingMin: 291, windowMin: 405, plannedMin: 63, recoverableMin: 52 }

const texto = () =>
  render(<VsAyerBloque r={vsAyer(D14, [D13])} records={null} />).container.textContent ?? ''

describe('VsAyerBloque · el residuo es una nota al pie, no una causa', () => {
  it('no lo lista como causa ni con el nombre de manual', () => {
    const t = texto()
    expect(t).not.toMatch(/Huecos de sensor/i)
  })

  it('pero lo declara al pie, en castellano llano y con su peso', () => {
    const t = texto()
    expect(t).toMatch(/sin\s+atribuir/i)
    expect(t).toMatch(/el sensor no alcanzó a clasificar/i)
  })

  it('las causas reales siguen contándose, de mayor a menor', () => {
    const t = texto()
    expect(t).toMatch(/El turno duró menos/i)
    expect(t).toMatch(/Más convenio/i)
    expect(t).toMatch(/Menos paradas evitables/i)
    // La historia del día: hizo menos, pero NO por lentitud.
    expect(t).toMatch(/no por lentitud/i)
    expect(t).toMatch(/Línea más rápida/i)
  })

  it('la diferencia del día sigue siendo la cifra que manda', () => {
    expect(texto()).toMatch(/Diferencia del día/i)
    expect(texto()).toMatch(/788/)
  })
})
