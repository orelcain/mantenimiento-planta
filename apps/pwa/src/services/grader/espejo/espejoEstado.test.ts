import { describe, it, expect } from 'vitest'
import {
  avisoLimite,
  elegirEstado,
  estaVivo,
  fraseDeError,
  avisoSinPiezasDelTurno,
  avisoAvance,
  estadoAjuste,
  minutosDesde,
  textoHace,
  type EstadoLector,
} from './espejoEstado'

const AHORA = Date.parse('2026-11-20T12:00:00Z')
const hace = (min: number) => AHORA - min * 60_000

describe('vivo (≤ 12 min, reloj inyectado)', () => {
  it('2 min y 12 min están vivos; 13 min no', () => {
    expect(estaVivo(hace(2), AHORA)).toBe(true)
    expect(estaVivo(hace(12), AHORA)).toBe(true)
    expect(estaVivo(hace(13), AHORA)).toBe(false)
  })

  it('13 min exactos y 12 min con segundos: el límite es por minutos enteros', () => {
    expect(estaVivo(AHORA - 12 * 60_000 - 59_000, AHORA)).toBe(true)
    expect(estaVivo(AHORA - 13 * 60_000, AHORA)).toBe(false)
  })

  it('sin latido nunca está vivo; un latido «del futuro» no da minutos negativos', () => {
    expect(estaVivo(null, AHORA)).toBe(false)
    expect(minutosDesde(null, AHORA)).toBeNull()
    expect(minutosDesde(AHORA + 5_000, AHORA)).toBe(0)
  })

  it('redacta el «hace»', () => {
    expect(textoHace(0)).toBe('hace menos de 1 min')
    expect(textoHace(38)).toBe('hace 38 min')
    expect(textoHace(60)).toBe('hace 1 h')
    expect(textoHace(65)).toBe('hace 1 h 05 min')
  })
})

describe('estado del lector', () => {
  const e = (equipo: string, ultimoLatidoMs: number | null): EstadoLector =>
    ({ equipo, linea: 'chonchi', ultimoLatidoMs, leidoEn: null, informe: 'pieza', estado: {} })

  it('con varios equipos elige el que avisó último', () => {
    expect(elegirEstado([e('A', hace(30)), e('B', hace(3)), e('C', null)])?.equipo).toBe('B')
    expect(elegirEstado([])).toBeNull()
  })

  it('frases de error conocidas y desconocidas', () => {
    expect(fraseDeError('otro-informe')).toContain('«Pieza pieza Grader»')
    expect(fraseDeError('sin-matrix')).not.toBeNull()
    expect(fraseDeError('sin-tabla')).not.toBeNull()
    expect(fraseDeError('licencia-en-pantalla')).not.toBeNull()
    expect(fraseDeError('')).toBeNull()
    expect(fraseDeError('iniciando')).toBeNull()
    // E1.1: un código desconocido o sin frase ya no se calla (20-11: «tope-10-min» no avisaba nada).
    expect(fraseDeError('algo-raro')).toContain('algo-raro')
    expect(fraseDeError('tope-10-min')).toContain('10 minutos')
  })

  it('con 0 piezas del turno dice cuántas leyó y de cuándo es la última', () => {
    expect(avisoSinPiezasDelTurno({ piezas: 9998, ultima: '2026-11-19 05:20:01' }))
      .toBe('Hay 9.998 piezas leídas, ninguna de este turno (la última es del 19-11 05:20).')
    expect(avisoSinPiezasDelTurno({ piezas: 0 })).toBeNull()
    expect(avisoSinPiezasDelTurno({ piezas: 12 })).toBe('Hay 12 piezas leídas, ninguna de este turno.')
  })

  it('avisa la lectura a medias con las filas que faltan', () => {
    expect(avisoAvance({ parcial: true, pendientes: 6200 })).toContain('6.200 filas')
    expect(avisoAvance({ parcial: false, pendientes: 6200 })).toBeNull()
    expect(avisoAvance({})).toBeNull()
  })

  it('avisa el corte de 10 000 solo con límite marcado y tabla llena', () => {
    expect(avisoLimite({ limite: true, filasTabla: 10000 })).toContain('10 000')
    expect(avisoLimite({ limite: true, filasTabla: 9998 })).toBeNull()
    expect(avisoLimite({ limite: false, filasTabla: 10000 })).toBeNull()
  })
})

describe('rango automático del lector e1.2', () => {
  it('sin la clave (lector e1.1) no dice nada', () => {
    expect(estadoAjuste({})).toBeNull()
  })
  it('ok no avisa; los fallos avisan y dicen que no tocó nada o que devolvió las fechas', () => {
    expect(estadoAjuste({ ajuste: 'ok' })).toEqual({ texto: 'lo mueve el lector', aviso: null })
    expect(estadoAjuste({ ajuste: 'sin-controles' })?.aviso).toMatch(/no tocó nada/)
    expect(estadoAjuste({ ajuste: 'solo-lectura' })?.aviso).toMatch(/no tocó nada/)
    expect(estadoAjuste({ ajuste: 'no-aplico' })?.aviso).toMatch(/dejó las fechas como estaban/)
    expect(estadoAjuste({ ajuste: 'no-filtra' })?.aviso).toMatch(/no filtró/)
    expect(estadoAjuste({ ajuste: 'no-devuelto' })?.aviso).toMatch(/revísalas en Matrix/)
  })
  it('sesión bloqueada: frase propia que apunta a la base de datos', () => {
    expect(fraseDeError('pantalla-bloqueada')).toMatch(/sesión bloqueada/)
    expect(fraseDeError('pantalla-bloqueada')).toMatch(/base de datos/)
  })
  it('un código desconocido igual avisa', () => {
    expect(estadoAjuste({ ajuste: 'raro' })?.aviso).toContain('«raro»')
  })
})
