// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { resolverTema, tripletaARgb } from '../temaEmbed'

describe('resolverTema', () => {
  const dia: Record<string, string> = {
    '--background': ' 242 241 236', '--card': '255 255 255', '--foreground': '29 29 28',
    '--muted-foreground': '78 77 74', '--border': '212 211 207', '--brand': '42 107 166',
  }

  it('convierte las tripletas de los tokens a rgb() con los seis colores del contrato', () => {
    const m = resolverTema(n => dia[n] ?? '', false)
    expect(m).toEqual({
      type: 'app:tema',
      oscuro: false,
      colores: {
        fondo: 'rgb(242, 241, 236)', superficie: 'rgb(255, 255, 255)', tinta: 'rgb(29, 29, 28)',
        tinta2: 'rgb(78, 77, 74)', linea: 'rgb(212, 211, 207)', acento: 'rgb(42, 107, 166)',
      },
    })
  })

  it('si un token no se puede leer usa el respaldo de Pizarra según el tema', () => {
    expect(resolverTema(() => '', false).colores.fondo).toBe('#F2F1EC')
    const noche = resolverTema(() => '', true)
    expect(noche.oscuro).toBe(true)
    expect(noche.colores.fondo).toBe('#171614')
    expect(noche.colores.acento).toBe('#7DB4EE')
  })

  it('rechaza valores que no son tripletas válidas', () => {
    expect(tripletaARgb('300 0 0')).toBeNull()
    expect(tripletaARgb('#fff')).toBeNull()
    expect(tripletaARgb('1 2')).toBeNull()
    expect(tripletaARgb('0 0 0')).toBe('rgb(0, 0, 0)')
  })
})

describe('public/embed-tema.js (lado del iframe)', () => {
  const codigo = readFileSync(resolve(__dirname, '../../../public/embed-tema.js'), 'utf8')
  const colores = { fondo: 'rgb(242, 241, 236)', superficie: '#FFFFFF', tinta: 'rgb(29, 29, 28)', tinta2: 'rgb(78, 77, 74)', linea: 'rgb(212, 211, 207)', acento: 'rgb(42, 107, 166)' }

  beforeEach(() => {
    document.documentElement.removeAttribute('style')
    document.documentElement.removeAttribute('data-tema')
    document.documentElement.className = ''
    // En el test no hay iframe: el «padre» es la propia ventana, así que `e.source === window.parent`.
    new Function(codigo)()
  })

  const mandar = (data: unknown, origin = window.location.origin, source: unknown = window) =>
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as MessageEventSource }))

  it('aplica el tema válido del padre: variables, data-tema y clase tema-app', () => {
    mandar({ type: 'app:tema', oscuro: true, colores })
    const r = document.documentElement
    expect(r.style.getPropertyValue('--tema-fondo')).toBe('rgb(242, 241, 236)')
    expect(r.style.getPropertyValue('--tema-acento')).toBe('rgb(42, 107, 166)')
    expect(r.getAttribute('data-tema')).toBe('dark')
    expect(r.classList.contains('tema-app')).toBe(true)
  })

  it('ignora mensajes de otro origen o de otra ventana', () => {
    mandar({ type: 'app:tema', oscuro: false, colores }, 'https://otro.example')
    mandar({ type: 'app:tema', oscuro: false, colores }, window.location.origin, {})
    expect(document.documentElement.classList.contains('tema-app')).toBe(false)
  })

  it('ignora colores que no sean #hex o rgb() (no deja pasar CSS ajeno)', () => {
    mandar({ type: 'app:tema', oscuro: false, colores: { ...colores, fondo: 'red; background:url(x)' } })
    mandar({ type: 'app:tema', oscuro: false, colores: { ...colores, tinta: 'url(javascript:1)' } })
    mandar({ type: 'app:tema', oscuro: false, colores: { fondo: '#fff' } })
    expect(document.documentElement.classList.contains('tema-app')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--tema-fondo')).toBe('')
  })

  it('ignora otros tipos de mensaje', () => {
    mandar({ type: 'hmi:init', colores })
    expect(document.documentElement.classList.contains('tema-app')).toBe(false)
  })
})
