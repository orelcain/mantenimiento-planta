import { describe, expect, it } from 'vitest'
import { fraseHuecos, fraseMatrix, frasePantalla } from './espejoEstado'

describe('frasePantalla (e1.7)', () => {
  it('sin dato: null', () => {
    expect(frasePantalla(undefined)).toBeNull()
    expect(frasePantalla('')).toBeNull()
  })

  it('pantalla pedida y sin bloqueo: sin aviso', () => {
    expect(frasePantalla('pedida sin-bloqueo')).toEqual({ texto: 'encendida (pedida a Windows) · sin bloqueo', aviso: null })
  })

  it('bloqueo por política de TI: lo dice y no la evade', () => {
    const f = frasePantalla('pedida bloqueada-desde 2026-11-22 02:15 inactividad=900s(ti)')!
    expect(f.texto).toBe('encendida (pedida a Windows) · bloqueada desde 2026-11-22 02:15')
    expect(f.aviso).toMatch(/política de TI \(bloqueo por inactividad a los 15 min\)/)
    expect(f.aviso).toMatch(/no la evade/)
  })

  it('protector con contraseña del usuario: se puede quitar en Configuración', () => {
    expect(frasePantalla('pedida ultimo-bloqueo 2026-11-22 02:15 protector=600s(usuario)')!.aviso).toMatch(/protector de pantalla con contraseña de este usuario/)
  })

  it('bloqueada sin política leída: bloqueo a mano o política que no se ve', () => {
    expect(frasePantalla('pedida bloqueada-desde 2026-11-22 02:15')!.aviso).toMatch(/a mano/)
  })

  it('texto desconocido: se muestra tal cual', () => {
    expect(frasePantalla('otra cosa')).toEqual({ texto: 'otra cosa', aviso: null })
  })
})

describe('fraseMatrix (e1.7)', () => {
  it('Matrix ya corría: null', () => {
    expect(fraseMatrix('')).toBeNull()
  })

  it('abierto por el lector: avisa que el informe lo abre una persona', () => {
    const f = fraseMatrix('abierto-por-lector 2026-11-22 07:01 esperando')!
    expect(f.texto).toBe('lo abrió el lector (2026-11-22 07:01)')
    expect(f.aviso).toMatch(/Pieza pieza Grader/)
  })

  it('no lo abre: dice por qué', () => {
    expect(fraseMatrix('no-abre sin-ruta')!.aviso).toMatch(/no sabe dónde está Matrix/)
    expect(fraseMatrix('no-abre tope-diario 6')!.aviso).toMatch(/6 veces en 24 h/)
  })
})

describe('fraseHuecos (e1.7)', () => {
  it('rellenando: filas releídas / total de las horas con hueco', () => {
    expect(fraseHuecos('rellenando 1200/45000 18h 2026-11-20 03')).toEqual({
      texto: 'rellenando · 1.200 de 45.000 filas · 18 h con hueco · ahora 2026-11-20 03 h',
      aviso: null,
    })
  })

  it('al día, con y sin filas releídas', () => {
    expect(fraseHuecos('al-dia 47h 2026-11-20 21 a 2026-11-22 19')!.texto).toBe('sin huecos · 47 h revisadas (2026-11-20 21 h a 2026-11-22 19 h)')
    expect(fraseHuecos('al-dia 47h 2026-11-20 21 a 2026-11-22 19 releidas 45000')!.texto).toMatch(/· 45\.000 filas releídas$/)
  })

  it('sin conteos (función vieja) y tabla desordenada: avisan', () => {
    expect(fraseHuecos('sin-conteos')!.aviso).toMatch(/desplegar/)
    expect(fraseHuecos('desordenada')!.aviso).toMatch(/no está en orden/)
  })
})
