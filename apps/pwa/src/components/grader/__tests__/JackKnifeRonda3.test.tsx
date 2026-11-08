import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { calcularLayout } from '../jackKnifeLayout'
import { JackKnifeLamina } from '../JackKnifeLamina'
import { calcularJackKnife, codificarEstadoJK, leerEstadoJK, type TurnoJK } from '@/services/shoplogix/jackKnife'

afterEach(cleanup)
const t: TurnoJK = { id: '1', dateKey: '2026-11-07', shiftId: 'Turno 1', resumen: { v: 1, eventos: [['Motor',1,30], ['Motor',2,60], ['Cinta',3,10]], sinImputar: [], sinImputarLinea: [], comentarios: [], conCausaMin: 100, sinCausaMin: 0, uptimeMin: 480 } }
const calc = calcularJackKnife([t],0,0,'imp')
describe('gráfico y lámina de reunión', () => {
  it('la recta de igual detención pasa por los umbrales y queda dentro del gráfico', () => {
    const l = calcularLayout(calc,900,null)
    const d = l.disponibilidad
    expect((l.ux-d.x1)/(d.x2-d.x1)).toBeCloseTo((l.uy-d.y1)/(d.y2-d.y1))
    for (const x of [d.x1,d.x2]) { expect(x).toBeGreaterThanOrEqual(l.L-1e-8); expect(x).toBeLessThanOrEqual(l.W-l.R+1e-8) }
    for (const y of [d.y1,d.y2]) { expect(y).toBeGreaterThanOrEqual(l.T-1e-8); expect(y).toBeLessThanOrEqual(l.T+l.ih+1e-8) }
    expect(l.puntos.every(p => p.rad >= 4 && p.rad <= 12)).toBe(true)
  })
  it('conserva el estado del interruptor en el QR', () => {
    const hash = codificarEstadoJK({pl:'yal',v:'30',vs:'imp',cmp:'mes',lb:false})
    expect(leerEstadoJK(hash,'yal')?.lb).toBe(false)
  })
  it('exporta una lámina clara de tamaño fijo, también sin comparación', () => {
    const { container } = render(<JackKnifeLamina calc={calc} informe={null} turnos={[t]} fantasmas={[]} planta="Yal" ahoraTxt="7-nov" antesTxt="" minAhora={100} vista="Imputadas" limitesBase={false} url="https://ejemplo.cl/mantenimiento-planta/jack-knife#jk=pl=yal" />)
    const lamina = container.querySelector('.jk-lamina') as HTMLDivElement
    expect(lamina.style.width).toBe('1600px')
    expect(lamina.style.height).toBe('1131px')
    expect(lamina.style.background).toBe('#FFFFFF')
    expect(screen.getByText('Sin comparar')).toBeTruthy()
    expect(screen.getByRole('img', {name:'Eventos contra MTTR por causa'})).toBeTruthy()
    expect(container.querySelectorAll('svg').length).toBe(2)
  })
})
