/**
 * Piel Apple de la card de imputación («Por qué se detuvo»).
 *
 * La piel anterior se mantiene idéntica; estos tests fijan la forma nueva: causas
 * ordenadas por tiempo, Mantención siempre visible, el resto en «Otra causal» y el
 * cierre con lo sin anotar. Y que la pantalla no traiga guiones ni puntos medios.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { ImputacionPeriodCard } from '../ImputacionPeriodCard'
import type { PeriodImputacion } from '@/services/grader/graderPeriodMonthlyStats'

const H = 3600
const NBSP = String.fromCharCode(160)

const imp = (over: Partial<PeriodImputacion> = {}): PeriodImputacion => ({
  totalSec: 100 * H,
  imputadoSec: 88 * H,
  cobertura: 0.88,
  porTurno: [],
  topCategorias: [
    { label: 'Otra A', durationSec: 50 * H, bucket: 'sin-clasificar' },
    { label: 'Materia prima', durationSec: 16 * H, bucket: 'externo' },
    { label: 'Operacional', durationSec: 9 * H, bucket: 'externo' },
    { label: 'Dos', durationSec: 8 * H, bucket: 'externo' },
    { label: 'Eléctrica o mecánica', durationSec: 5 * H, bucket: 'mantencion' },
  ],
  turnos: 12,
  ...over,
})

const filas = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('tbody tr')).map((tr) => ({
    texto: tr.textContent ?? '',
    negrita: Array.from(tr.querySelectorAll('td')).some((td) => td.className.includes('font-semibold')),
  }))

describe('ImputacionPeriodCard · piel Apple', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-skin', 'apple')
  })
  afterEach(() => {
    document.documentElement.removeAttribute('data-skin')
  })

  it('muestra el título y una tabla de tres columnas', () => {
    const { container } = render(<ImputacionPeriodCard imputacion={imp()} />)
    expect(container.querySelector('h2')?.textContent).toBe('Por qué se detuvo')
    const cabeceras = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
    expect(cabeceras).toEqual(['Causa', 'Quién responde', 'Tiempo'])
  })

  it('ordena por tiempo y deja la fila de Mantención en peso 600', () => {
    const { container } = render(<ImputacionPeriodCard imputacion={imp()} />)
    const f = filas(container)
    expect(f[0]!.texto.startsWith('Otra A')).toBe(true)
    expect(f.find((x) => x.texto.startsWith('Eléctrica o mecánica'))?.negrita).toBe(true)
    expect(f.find((x) => x.texto.startsWith('Materia prima'))?.negrita).toBe(false)
    expect(f.find((x) => x.texto.startsWith('Otra causal'))?.negrita).toBe(false)
  })

  it('trae Mantención aunque no esté en el top 3, y agrupa el resto en «Otra causal»', () => {
    const { container } = render(<ImputacionPeriodCard imputacion={imp()} />)
    const texto = container.textContent ?? ''
    expect(texto).toContain('Eléctrica o mecánica')
    // «Dos» (8 h) queda dentro de la fila agrupada: 8 de 100 h = 8 %.
    expect(texto).toContain(`Otra causal`)
    expect(texto).toContain(`8${NBSP}%`)
  })

  it('cierra con la fila de lo sin anotar y su porcentaje', () => {
    const { container } = render(<ImputacionPeriodCard imputacion={imp()} />)
    const cierre = container.querySelector('tfoot, tr.border-t-2')
    expect(cierre?.textContent).toContain('Sin anotar')
    // 100 h detenidas, 88 h con causa → 12 h sin anotar = 12 %.
    expect(cierre?.textContent).toContain(`12${NBSP}%`)
  })

  it('dice el total detenido y la cobertura en una nota de 13 px', () => {
    const { container } = render(<ImputacionPeriodCard imputacion={imp()} />)
    const texto = container.textContent ?? ''
    expect(texto).toContain('12 turnos')
    expect(texto).toContain(`Con causa anotada: 88${NBSP}%`)
  })

  it('no trae guiones ni puntos medios en el texto visible', () => {
    const { container } = render(<ImputacionPeriodCard imputacion={imp()} />)
    const texto = container.textContent ?? ''
    expect(texto).not.toContain('·')
    expect(texto).not.toContain('—')
  })

  it('con la piel anterior sigue saliendo la card de siempre', () => {
    document.documentElement.removeAttribute('data-skin')
    const { container } = render(<ImputacionPeriodCard imputacion={imp()} />)
    expect(container.textContent).toContain('Imputación del período')
    expect(container.querySelector('table')).toBeNull()
  })
})
