import { describe, expect, it } from 'vitest'
import { fraseHuecos, fraseMatrix, frasePantalla } from './espejoEstado'

describe('frasePantalla (e1.7)', () => {
  it('sin dato: null', () => {
    expect(frasePantalla(undefined)).toBeNull()
    expect(frasePantalla('')).toBeNull()
  })

  it('pantalla pedida y sin bloqueo: sin aviso', () => {
    expect(frasePantalla('pedida sin-bloqueo')).toEqual({ texto: 'despierta (pedida a Windows) · sin bloqueo', aviso: null })
  })

  it('bloqueo por política de TI: lo dice, sin mandar a pedir nada a TI', () => {
    const f = frasePantalla('pedida bloqueada-desde 2026-11-22 02:15 inactividad=900s(ti)')!
    expect(f.texto).toBe('despierta (pedida a Windows) · bloqueada desde 2026-11-22 02:15')
    expect(f.aviso).toMatch(/política de TI \(bloqueo por inactividad a los 15 min\)/)
    expect(f.aviso).toMatch(/aunque el lector pedía la pantalla despierta/)
    expect(f.aviso).not.toMatch(/pedir a TI|excepción/)
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

describe('frasePantalla (e1.8: por qué no quedó despierta)', () => {
  it('no-pedida con motivo: lo dice y avisa aunque la sesión no se haya bloqueado aún', () => {
    const f = frasePantalla('no-pedida:sin-tipo sin-bloqueo')!
    expect(f.texto).toBe('sin pedir: no se pudo preparar la llamada a Windows · sin bloqueo')
    expect(f.aviso).toMatch(/no pudo mantener la sesión despierta/)
    expect(f.aviso).toMatch(/lector\.log/)
  })

  it('rechazo y error, con bloqueo y política: el motivo manda en el aviso', () => {
    expect(frasePantalla('no-pedida:rechazo sin-bloqueo')!.texto).toBe('sin pedir: Windows rechazó el pedido · sin bloqueo')
    const f = frasePantalla('no-pedida:error bloqueada-desde 2026-11-23 03:10 protector=600s(ti)')!
    expect(f.texto).toBe('sin pedir: la llamada a Windows falló · bloqueada desde 2026-11-23 03:10')
    expect(f.aviso).toMatch(/no pudo mantener la sesión despierta \(la llamada a Windows falló\)/)
  })

  it('motivo desconocido: se muestra tal cual', () => {
    expect(frasePantalla('no-pedida:otro sin-bloqueo')!.texto).toBe('sin pedir: otro · sin bloqueo')
  })

  it('no-pedida sin motivo y política de TI: no dice que el lector pedía la pantalla', () => {
    const f = frasePantalla('no-pedida bloqueada-desde 2026-11-23 03:10 protector=600s(ti)')!
    expect(f.aviso).toMatch(/^La sesión se bloqueó\. Hay una política de TI/)
  })

  it('no-pedida sin motivo (lector e1.7): igual que antes', () => {
    expect(frasePantalla('no-pedida sin-bloqueo')).toEqual({ texto: 'sin pedir (Windows no aceptó) · sin bloqueo', aviso: null })
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
