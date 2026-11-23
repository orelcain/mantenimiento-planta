import { describe, it, expect } from 'vitest'
import { COMANDO_PERIODO_APAGAR, COMANDO_PERIODO_ENCENDER, frasePeriodo } from './espejoEstado'

describe('e1.9 · frasePeriodo (clave «periodo» del latido)', () => {
  it('sin dato no muestra nada', () => {
    expect(frasePeriodo(undefined)).toBeNull()
    expect(frasePeriodo('')).toBeNull()
  })

  it('apagado: muestra el valor actual y las opciones que vio el lector', () => {
    const f = frasePeriodo('apagado valor=Usuario definido ops=Usuario definido;Hoy;Ultimas 24 horas')!
    expect(f.texto).toBe('apagado · informe en «Usuario definido»')
    expect(f.opciones).toEqual(['Usuario definido', 'Hoy', 'Ultimas 24 horas'])
    expect(f.aviso).toBeNull()
  })

  it('elegida y ya-en dicen la opción', () => {
    expect(frasePeriodo('elegida:Ultimas 24 horas valor=Ultimas 24 horas ops=a;b')!.texto).toBe('elegida por el lector: «Ultimas 24 horas» · informe en «Ultimas 24 horas»')
    expect(frasePeriodo('ya-en:Hoy valor=Hoy')!.texto).toBe('ya estaba en «Hoy» · informe en «Hoy»')
  })

  it('no-cambia avisa que hay que elegir a mano', () => {
    const f = frasePeriodo('no-cambia:Hoy valor=Usuario definido ops=Usuario definido;Hoy')!
    expect(f.texto).toBe('Matrix no tomó la elección de «Hoy» · informe en «Usuario definido»')
    expect(f.aviso).toContain('elígela a mano una vez')
  })

  it('sin combo, sin opciones y texto desconocido', () => {
    expect(frasePeriodo('sin-combo valor=')!.texto).toBe('apagado o sin dato: no se halló el combo de periodo · informe en «?»')
    expect(frasePeriodo('sin-opciones valor=Usuario definido')!.aviso).toContain('archivo PERIODO')
    expect(frasePeriodo('algo raro')!.texto).toBe('algo raro')
  })

  it('los comandos tocan solo el archivo PERIODO de la carpeta del lector', () => {
    expect(COMANDO_PERIODO_ENCENDER).toBe('New-Item -ItemType File -Force "$env:LOCALAPPDATA\\espejo-grader\\PERIODO"')
    expect(COMANDO_PERIODO_APAGAR).toBe('Remove-Item -Force "$env:LOCALAPPDATA\\espejo-grader\\PERIODO"')
  })
})
