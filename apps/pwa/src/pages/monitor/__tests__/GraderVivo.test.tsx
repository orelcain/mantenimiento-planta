import { describe, it, expect, afterEach, beforeAll } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import real from '@/services/grader/espejo/__fixtures__/chonchi-2026-11-19-turno2-minutos.json'
import type { CubetaMinuto } from '@/services/grader/espejo/espejoMinutos'
import { GraderVivo } from '../GraderVivo'
import { armarGraderVivo, type EntradaGraderVivo } from '../graderVivoDatos'

afterEach(cleanup)

beforeAll(() => {
  // happy-dom mide 0: el gráfico necesita un ancho para dibujarse.
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 360, height: 200, top: 0, left: 0, right: 360, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }),
  })
})

const T0 = Date.parse(real.t0) // 2026-11-19T07:15 de planta

/** Cubetas con las piezas reales por minuto del 19-11 T2; Gate 0 en 1 de cada `g0Cada` minutos (o ninguna). */
function cubetas(hasta: number, g0Cada: number | null, alto?: [number, number]): CubetaMinuto[] {
  const out: CubetaMinuto[] = []
  for (let m = 0; m < hasta; m++) {
    const pz = real.grader[m] ?? 0
    if (pz <= 0) continue
    let g0 = g0Cada && m % g0Cada === 0 ? 1 : 0
    if (alto && m >= alto[0] && m < alto[1]) g0 = Math.round(pz * 0.06)
    const sal = pz - g0
    out.push({
      ms: T0 + m * 60_000,
      pz,
      g0,
      kgSalida: sal * 4.1,
      pzPeso: sal,
      calibre: { '8-10 lb': Math.ceil(sal * 0.6), '10-12 lb': Math.floor(sal * 0.4) },
      calidad: { Premium: sal },
      lotes: { [m < 200 ? '720260738' : '720260739']: pz },
      ultimoLote: m < 200 ? '720260738' : '720260739',
      ultimaTs: new Date(T0 + m * 60_000 + 59_000).toISOString(),
    })
  }
  return out
}

function entrada(p: Partial<EntradaGraderVivo>): EntradaGraderVivo {
  return {
    cubetas: cubetas(215, 4),
    inicioMs: T0,
    finMs: Date.parse('2026-11-19T15:00:00.000Z'),
    baader: { desde: real.t0, maquinas: [{ cycles: real.baader.slice(0, 213) }] },
    paradas: [],
    minutosSinLatido: 1,
    turnoEnCurso: true,
    ...p,
  }
}

describe('armarGraderVivo con el turno real del 19-11', () => {
  it('mide el retraso con el turno en curso y no usa la referencia', () => {
    // Con 3,5 h del turno da 4 min (r 0,80); con el turno entero, 3 (graderVivo.test.ts). El minuto de diferencia es
    // la resolución real de la medición: por eso se vuelve a medir en cada snapshot.
    const d = armarGraderVivo(entrada({}))
    expect(d.retraso.medido).toBe(true)
    expect(d.retraso.min).toBeGreaterThanOrEqual(3)
    expect(d.retraso.min).toBeLessThanOrEqual(4)
    expect(d.serie.hastaMin).toBe(215)
  })

  it('el lote en curso y desde cuándo', () => {
    const d = armarGraderVivo(entrada({}))
    expect(d.serie.lote).toMatchObject({ lote: '720260739', desdeMin: 200 })
  })
})

describe('GraderVivo', () => {
  it('pinta la alerta de P0 cuando el último cuarto de hora completo pasa 3,5 %', () => {
    // 10:30-10:45 = minutos 195-210 del eje.
    render(<GraderVivo {...entrada({ cubetas: cubetas(215, 4, [195, 210]) })} />)
    expect(screen.getByText('Pide atención')).toBeTruthy()
    const p0 = document.querySelector('[data-regla="p0-alto"]')
    expect(p0?.textContent).toMatch(/P0 \d,\d % de 10:30 a 10:45/)
  })

  it('un turno sin alertas lo dice', () => {
    render(<GraderVivo {...entrada({})} />)
    expect(screen.getByText('Sin alertas')).toBeTruthy()
  })

  it('con piezas pero sin ninguna Gate 0, dice que el P0 llega con Puerta 0 (no 0 %)', () => {
    render(<GraderVivo {...entrada({ cubetas: cubetas(215, null) })} />)
    expect(screen.getAllByText(/P0 llega con Puerta 0/).length).toBeGreaterThan(0)
    expect(screen.queryByText('0,0 %')).toBeNull()
  })

  it('dibuja la curva del grader y el lote legible', () => {
    render(<GraderVivo {...entrada({})} />)
    expect(document.querySelector('[data-serie="grader"]')?.getAttribute('d')?.length).toBeGreaterThan(100)
    expect(screen.getByText('720.260.739')).toBeTruthy()
    expect(screen.getByText(/va \d+ min atrasada: es lo que tarda una pieza .* medido en este turno \(las curvas coinciden (bien|a medias)\)/)).toBeTruthy()
    expect(screen.queryByText(/\(r 0,/)).toBeNull()
  })

  it('la línea manual muestra horas completas y la de las 08:00 sale', () => {
    render(<GraderVivo {...entrada({})} />)
    expect(document.querySelector('[data-hora="08:00"]')).toBeTruthy()
    expect(document.querySelector('[data-hora="10:00"]')).toBeNull() // en curso a las 10:50
  })

  it('P4: sin piezas pero con el lector caído, la alerta se ve igual', () => {
    render(<GraderVivo {...entrada({ cubetas: [], minutosSinLatido: 30 })} />)
    expect(document.querySelector('[data-regla="lector-caido"]')?.textContent).toMatch(/Lector sin aviso hace 30 min/)
  })

  it('sin piezas del espejo no pinta nada (la tarjeta del espejo explica por qué)', () => {
    const { container } = render(<GraderVivo {...entrada({ cubetas: [] })} />)
    expect(container.innerHTML).toBe('')
  })
})
