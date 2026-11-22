import { describe, expect, it } from 'vitest'
import {
  calcularCobertura,
  causaFaltante,
  ddmmHhmm,
  esAviso,
  hhmm,
  ultimoEndAt,
  unirTramos,
} from '../graderCobertura'

/** Instante wall-clock-as-UTC del 14-11-2026 (o del día dado). */
const t = (h: string, dia = '14') => `2026-11-${dia}T${h}:00.000Z`
const ms = (h: string, dia = '14') => Date.parse(t(h, dia))

const base = { inicio: t('07:15'), fin: t('15:00'), cadencia: '2h' as const }

describe('calcularCobertura', () => {
  it('caso del mockup: datos 07:15–09:37, ahora 13:20 → 39 %, falta 09:37–13:20, aviso con 2 h', () => {
    const c = calcularCobertura({ ...base, ahoraWallMs: ms('13:20'), resumenes: [{ startAt: t('07:15'), endAt: t('09:37') }] })!
    expect(c.pct).toBe(39)
    expect(c.faltaCola).toEqual({ desde: ms('09:37'), hasta: ms('13:20') })
    expect(hhmm(c.hasta!)).toBe('09:37')
    expect(c.aviso).toBe(true)
    expect(c.cerrado).toBe(false)
  })

  it('no desplaza horas: los ts se leen tal cual en UTC', () => {
    const c = calcularCobertura({ ...base, ahoraWallMs: ms('13:20'), resumenes: [{ startAt: t('07:15'), endAt: t('09:37') }] })!
    expect(hhmm(c.faltaCola!.desde)).toBe('09:37')
    expect(hhmm(c.faltaCola!.hasta)).toBe('13:20')
  })

  it('cadencia por turno o al cierre: con el turno en curso el hueco no es aviso', () => {
    for (const cadencia of ['turno', 'cierre'] as const) {
      const c = calcularCobertura({ ...base, cadencia, ahoraWallMs: ms('13:20'), resumenes: [{ startAt: t('07:15'), endAt: t('09:37') }] })!
      expect(c.aviso).toBe(false)
      expect(c.faltaCola).not.toBeNull()
    }
  })

  it('turno cerrado con hueco: es aviso con cualquier cadencia y «ahora» queda en el fin', () => {
    for (const cadencia of ['2h', 'turno', 'cierre'] as const) {
      const c = calcularCobertura({ ...base, cadencia, ahoraWallMs: ms('18:00'), resumenes: [{ startAt: t('07:15'), endAt: t('14:00') }] })!
      expect(c.cerrado).toBe(true)
      expect(c.ahora).toBe(ms('15:00'))
      expect(c.faltaCola).toEqual({ desde: ms('14:00'), hasta: ms('15:00') })
      expect(c.aviso).toBe(true)
    }
  })

  it('cadencia 2 h: un hueco de menos de 2 h no es aviso', () => {
    const c = calcularCobertura({ ...base, ahoraWallMs: ms('11:00'), resumenes: [{ startAt: t('07:15'), endAt: t('09:37') }] })!
    expect(c.faltaCola).not.toBeNull()
    expect(c.aviso).toBe(false)
  })

  it('turno sin datos: 0 %, falta desde el inicio, hasta = null', () => {
    const c = calcularCobertura({ ...base, ahoraWallMs: ms('10:00'), resumenes: [] })!
    expect(c.pct).toBe(0)
    expect(c.hasta).toBeNull()
    expect(c.faltaCola).toEqual({ desde: ms('07:15'), hasta: ms('10:00') })
    expect(c.aviso).toBe(true) // 2 h 45 sin exporte
  })

  it('cruce de medianoche: turno noche 22:00–06:00 con datos de dos resúmenes', () => {
    const c = calcularCobertura({
      inicio: t('22:00', '14'), fin: t('06:00', '15'), cadencia: '2h',
      ahoraWallMs: ms('03:00', '15'),
      resumenes: [
        { startAt: t('22:05', '14'), endAt: t('23:59', '14') },
        { startAt: t('00:00', '15'), endAt: t('02:30', '15') },
      ],
    })!
    // 22:00–22:05 (5 min) es hueco mínimo → cuenta; 23:59–00:00 (1 min) no.
    expect(c.faltantes).toEqual([
      { desde: ms('22:00', '14'), hasta: ms('22:05', '14') },
      { desde: ms('02:30', '15'), hasta: ms('03:00', '15') },
    ])
    expect(c.pct).toBe(Math.round(((114 + 150) / 300) * 100))
    expect(ddmmHhmm(c.hasta!)).toBe('15-11 02:30')
  })

  it('hueco al inicio: startAt después del inicio del turno', () => {
    const c = calcularCobertura({ ...base, ahoraWallMs: ms('10:15'), resumenes: [{ startAt: t('08:15'), endAt: t('10:15') }] })!
    expect(c.faltantes).toEqual([{ desde: ms('07:15'), hasta: ms('08:15') }])
    expect(c.faltaCola).toBeNull()
    expect(c.aviso).toBe(false)
    expect(c.pct).toBe(67)
  })

  it('endAt después del fin y resúmenes fuera de la ventana se recortan', () => {
    const c = calcularCobertura({
      ...base, ahoraWallMs: ms('16:00'),
      resumenes: [
        { startAt: t('05:00'), endAt: t('07:00') }, // antes del turno
        { startAt: t('06:00'), endAt: t('16:00') },
      ],
    })!
    expect(c.conDatos).toEqual([{ desde: ms('07:15'), hasta: ms('15:00') }])
    expect(c.pct).toBe(100)
    expect(c.faltantes).toEqual([])
    expect(c.aviso).toBe(false)
  })

  it('ahora antes del inicio: sin % y sin faltantes', () => {
    const c = calcularCobertura({ ...base, ahoraWallMs: ms('06:00'), resumenes: [] })!
    expect(c.pct).toBeNull()
    expect(c.faltantes).toEqual([])
    expect(c.aviso).toBe(false)
  })

  it('ventana inválida → null', () => {
    expect(calcularCobertura({ inicio: null, fin: t('15:00'), cadencia: '2h', ahoraWallMs: 0, resumenes: [] })).toBeNull()
    expect(calcularCobertura({ inicio: t('15:00'), fin: t('07:00'), cadencia: '2h', ahoraWallMs: 0, resumenes: [] })).toBeNull()
  })
})

describe('unirTramos', () => {
  it('une solapados y contiguos, descarta inválidos', () => {
    expect(unirTramos([
      { desde: 5, hasta: 8 }, { desde: 1, hasta: 3 }, { desde: 3, hasta: 4 }, { desde: 7, hasta: 9 }, { desde: 10, hasta: 10 }, { desde: NaN, hasta: 2 },
    ])).toEqual([{ desde: 1, hasta: 4 }, { desde: 5, hasta: 9 }])
  })
})

describe('esAviso', () => {
  it('sin hueco nunca es aviso', () => {
    expect(esAviso({ cadencia: '2h', faltaCola: null, cerrado: true })).toBe(false)
  })
})

describe('causaFaltante', () => {
  it('solo afirma una causa cuando este PC tiene la carpeta vigilada', () => {
    expect(causaFaltante('cortado')).toBe('cortado')
    expect(causaFaltante('permiso')).toBe('apagada')
    expect(causaFaltante('vigilando')).toBe('nadie')
    expect(causaFaltante('cargado')).toBe('nadie')
    expect(causaFaltante('viejo')).toBe('nadie')
  })
  it('sin carpeta (o pestaña sin vigilante) no se sabe: «sin exporte», nunca «apagada»', () => {
    expect(causaFaltante('sin-autorizar')).toBe('sin-exporte')
    expect(causaFaltante(null)).toBe('sin-exporte')
    expect(causaFaltante('error')).toBe('sin-exporte')
  })
})

describe('ultimoEndAt', () => {
  it('toma el último instante con piezas, no el último texto', () => {
    expect(ultimoEndAt([
      { endAt: t('09:37'), totalPieces: 100 },
      { endAt: t('23:00', '13'), totalPieces: 100 },
      { endAt: t('12:00'), totalPieces: 0 },
      { endAt: null, totalPieces: 10 },
    ])).toBe(t('09:37'))
    expect(ultimoEndAt([])).toBeNull()
  })
})

describe('ddmmHhmm', () => {
  it('formatea en hora de planta (UTC) y tolera inválidos', () => {
    expect(ddmmHhmm(t('09:37'))).toBe('14-11 09:37')
    expect(ddmmHhmm('x')).toBe('')
    expect(ddmmHhmm(null)).toBe('')
  })
})

describe('calcularCobertura con el espejo (22-11)', () => {
  it('sin Excel pero con el espejo del turno entero: no es «0 %» ni falta nada', () => {
    // 21-11 T2: el monitor cierra el turno en el fin efectivo (14:50) y el espejo trae de 07:21 a 14:50.
    const c = calcularCobertura({ ...base, fin: t('14:50'), ahoraWallMs: Number.POSITIVE_INFINITY, resumenes: [], espejo: [{ desde: ms('07:21'), hasta: ms('14:50') }] })!
    expect(c.pct).toBe(99)
    expect(c.faltaCola).toBeNull()
    expect(c.hasta).toBe(ms('14:50'))
  })

  it('un hueco del espejo queda como faltante y suma con el Excel', () => {
    const c = calcularCobertura({
      ...base,
      ahoraWallMs: ms('15:00'),
      resumenes: [{ startAt: t('07:15'), endAt: t('09:00') }],
      espejo: [{ desde: ms('08:30'), hasta: ms('12:00') }, { desde: ms('12:40'), hasta: ms('15:00') }],
    })!
    expect(c.faltantes).toEqual([{ desde: ms('12:00'), hasta: ms('12:40') }])
    expect(c.faltaCola).toBeNull()
  })
})
