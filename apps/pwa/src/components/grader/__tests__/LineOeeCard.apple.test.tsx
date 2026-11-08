/**
 * OEE del área en la piel Apple. Si es igual al de la máquina (sin detenciones de
 * etapa), una sola línea. Si difiere, las dos cifras, la tabla de pérdidas y la
 * nota de «Estimado» una sola vez.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { LineOeeCard } from '../LineOeeCard'

const NBSP = String.fromCharCode(160)
const calc = { value: 0 }

vi.mock('@/hooks/usePlantKPIs', () => ({
  usePlantKPIsForPeriod: () => ({ loading: false, error: null, kpis: { machines: [] } }),
}))
vi.mock('@/services/paros', () => ({
  getParosByPlantLine: vi.fn(async () => []),
}))
vi.mock('@/services/grader/areaOeeCompute', () => ({
  computeAreaOee: () => calc.value === 0 ? sinEtapa : conEtapa,
}))

const sinEtapa = {
  oeeMachine: 0.614, oeeArea: 0.614, availabilityMachine: 0.788, availabilityArea: 0.788,
  baseMin: 4000, etapaMin: 0, perdidas: [], perdidasTotal: 0, sinCalidad: true,
}
const conEtapa = {
  oeeMachine: 0.614, oeeArea: 0.52, availabilityMachine: 0.788, availabilityArea: 0.66,
  baseMin: 4000, etapaMin: 480, sinCalidad: true, perdidasTotal: 900,
  perdidas: [
    { label: 'Bombeo', min: 500, fuente: 'etapa' },
    { label: 'Baader 1 falla', min: 300, fuente: 'maquina' },
    { label: 'Cinta elevadora', min: 100, fuente: 'etapa' },
    { label: 'Marel', min: 0, fuente: 'etapa' },
  ],
}

const props = { plantLineId: 'chonchi-eviscerado', plantSlug: 'chonchi' as never, graderSummaries: [] }

async function listo(c: HTMLElement) {
  await waitFor(() => expect(c.querySelector('[role="status"]')).toBeNull())
}

function texto(c: HTMLElement) {
  return (c.textContent ?? '').split(NBSP).join(' ')
}

describe('LineOeeCard · piel Apple', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-skin', 'apple')
  })
  afterEach(() => {
    document.documentElement.removeAttribute('data-skin')
    calc.value = 0
  })

  it('si el OEE del área es igual al de la máquina, una sola línea con la cifra', async () => {
    const { container } = render(<LineOeeCard {...props} />)
    await listo(container)
    expect(texto(container)).toContain(
      'OEE del área igual al de la máquina (61 %): sin detenciones de etapa registradas.',
    )
    expect(container.querySelector('table')).toBeNull()
  })

  it('si difiere, muestra las dos cifras y la tabla de dónde pierde el área', async () => {
    calc.value = 1
    const { container } = render(<LineOeeCard {...props} />)
    await listo(container)
    const t = texto(container)
    expect(t).toContain('61 %')
    expect(t).toContain('52 %')
    expect(t).toContain('Dónde pierde tiempo el área')
    const cabeceras = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(cabeceras).toEqual(['Pérdida', 'Origen', 'Tiempo'])
  })

  it('muestra cada pérdida en su propia fila, también la de 0 minutos', async () => {
    calc.value = 1
    const { container } = render(<LineOeeCard {...props} />)
    await listo(container)
    expect(texto(container)).toContain('Bombeo')
    expect(Array.from(container.querySelectorAll('tbody tr'))).toHaveLength(4)
  })

  it('la nota de «Estimado» sale una sola vez', async () => {
    calc.value = 1
    const { container } = render(<LineOeeCard {...props} />)
    await listo(container)
    expect(texto(container).split('Estimado.').length - 1).toBe(1)
  })

  it('la piel anterior sigue con su tarjeta', () => {
    document.documentElement.removeAttribute('data-skin')
    const { container } = render(<LineOeeCard {...props} />)
    expect(texto(container)).toContain('OEE del área (estimado)')
    expect(container.querySelector('table')).toBeNull()
  })
})
