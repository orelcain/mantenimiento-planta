import { describe, it, expect } from 'vitest'
import {
  avisoLimite,
  elegirEstado,
  estaVivo,
  fraseDeError,
  avisoSinPiezasDelTurno,
  avisoAvance,
  estadoAjuste,
  avisoFinRango,
  fraseActualizacion,
  minutosDesde,
  textoArranque,
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

describe('lector e1.5: casilla aparte y fechas fijas (Matrix Qt ignora SetValue)', () => {
  const rango = ['2026-11-22 00:00:00', '2026-11-23 00:00:00']
  it('casilla que no se desmarca: avisa el corte en 10 000', () => {
    expect(estadoAjuste({ ajuste: 'casilla-no-aplico' })?.aviso).toMatch(/10 000/)
  })
  it('fechas fijas con el fin lejos: ficha sin aviso ámbar', () => {
    const r = estadoAjuste({ ajuste: 'fechas-fijas', rango }, new Date(2026, 10, 22, 8, 0, 0))
    expect(r).toEqual({ texto: 'fechas a mano (Matrix no deja moverlas)', aviso: null })
  })
  it('fechas fijas a menos de 12 h del fin: pide moverlo a mano', () => {
    const aviso = estadoAjuste({ ajuste: 'fechas-fijas', rango }, new Date(2026, 10, 22, 21, 30, 0))?.aviso
    expect(aviso).toMatch(/termina el 23-11 00:00/)
    expect(aviso).toMatch(/a mano/)
  })
  it('fechas fijas con el fin ya pasado: dice que no se leen las piezas posteriores', () => {
    expect(avisoFinRango(rango, new Date(2026, 10, 23, 1, 0, 0))).toMatch(/terminó el 23-11 00:00/)
  })
  it('borde: justo a 12 h no avisa, un segundo después sí', () => {
    expect(avisoFinRango(rango, new Date(2026, 10, 22, 12, 0, 0))).toBeNull()
    expect(avisoFinRango(rango, new Date(2026, 10, 22, 12, 0, 1))).toMatch(/termina/)
  })
  it('sin rango legible igual pide moverlo a mano', () => {
    expect(avisoFinRango(undefined, new Date())).toMatch(/a mano/)
    expect(avisoFinRango(['x', 'y'], new Date())).toMatch(/a mano/)
  })
})

describe('e1.3: arranque del lector', () => {
  it('tarea → solo (tarea de Windows); manual → manual (sin tarea)', () => {
    expect(textoArranque('tarea')).toBe('solo (tarea de Windows)')
    expect(textoArranque('manual')).toBe('manual (sin tarea)')
  })

  it('sin la clave (lector anterior a e1.3) no muestra nada; otro valor se muestra tal cual', () => {
    expect(textoArranque(undefined)).toBeNull()
    expect(textoArranque('')).toBeNull()
    expect(textoArranque('otra-cosa')).toBe('otra-cosa')
  })
})

describe('e1.3: frase de la actualización', () => {
  it('traduce cada prefijo a su frase', () => {
    expect(fraseActualizacion('bajada e1.3')).toBe('e1.3 bajada, se pone en marcha en ≤ 5 min')
    expect(fraseActualizacion('puesta e1.3')).toBe('e1.3 puesta a prueba')
    expect(fraseActualizacion('confirmada e1.3')).toBe('e1.3 confirmada')
    expect(fraseActualizacion('revertida e1.2')).toBe('e1.2 no anduvo: volvió a la anterior')
    expect(fraseActualizacion('rechazada e1.3')).toBe('e1.3 rechazada antes (no se vuelve a bajar)')
    expect(fraseActualizacion('hash-distinto e1.3')).toBe('e1.3 descartada: la huella no coincide')
    expect(fraseActualizacion('sin-descarga e1.3')).toBe('no pudo bajar e1.3; reintenta')
  })

  it('un texto que no calza se muestra tal cual; sin clave, null', () => {
    expect(fraseActualizacion('algo raro')).toBe('algo raro')
    expect(fraseActualizacion('bajada')).toBe('bajada')
    expect(fraseActualizacion(undefined)).toBeNull()
    expect(fraseActualizacion('')).toBeNull()
  })
})
