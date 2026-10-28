import { describe, expect, it } from 'vitest'
import { tipFilaJornada, tipHora, tipMicro, tipParada, tipSost, tipsCarriles } from '../dueloTextos'

describe('dueloTextos · globos del Duelo', () => {
  it('la hora dice quién gana y por cuánto, con unidad', () => {
    const t = tipHora(3, { nombre: 'Cárdenas', v: 38.2, parcial: false }, { nombre: 'Rebolledo', v: 32.6, parcial: false })
    expect(t).toBe('3.ª hora · Cárdenas 38,2 pz/min · Rebolledo 32,6 pz/min · gana Cárdenas por 5,6 pz/min')
  })

  it('una diferencia menor al umbral es empate y una hora en curso se avisa', () => {
    expect(tipHora(1, { nombre: 'A', v: 10, parcial: true }, { nombre: 'B', v: 10.01, parcial: false })).toContain('empate')
    expect(tipHora(1, { nombre: 'A', v: 10, parcial: true }, { nombre: 'B', v: 9, parcial: false })).toContain('A 10,0 pz/min (hora en curso)')
  })

  it('con un solo equipo no inventa al otro', () => {
    expect(tipHora(2, { nombre: 'Cárdenas', v: 30, parcial: false }, null)).toBe('2.ª hora · Cárdenas 30,0 pz/min')
  })

  it('la parada nombra equipo, hora, causa, minutos y dueño', () => {
    expect(tipParada({ nombre: 'Rebolledo', desdeMin: 200, causa: 'Túneles MEC', min: 12, dueno: 'externo' }))
      .toBe('Rebolledo · 4.ª hora · Túneles MEC · 12 min · dueño: externo')
  })

  it('la celda de micro lleva equipo, hora y minutos perdidos', () => {
    expect(tipMicro('Cárdenas', 1, 11.5, false)).toBe('Cárdenas · 1.ª hora · 11,5 min perdidos en micro detenciones')
  })

  it('minutos a buen ritmo: sin dato no es cero', () => {
    expect(tipSost('Cárdenas', null, 33)).toContain('sin dato')
    expect(tipSost('Cárdenas', 54, 33)).toContain('29,7 pz/min o más')
  })

  it('cada carril explica su unidad', () => {
    const t = tipsCarriles({ a: 'Cárdenas', b: 'Rebolledo' }, 33)
    expect(t.ritmo).toContain('piezas por minuto')
    expect(t.sost).toContain('90 %')
    expect(t.micro).toContain('minutos')
  })

  it('la fila de jornada nombra a cada equipo y la ventaja negativa se explica', () => {
    const t = tipFilaJornada({
      jornada: '2026-10-27', noche: { eq: 'cardenas', pz: 15427 }, dia: { eq: 'rebolledo', pz: 13541 },
      puntos: { c: 10, r: 2 }, ganador: 'cardenas', dif: -5, vivo: null,
    }, { cardenas: 'Cárdenas', rebolledo: 'Rebolledo' })
    expect(t).toContain('noche: Cárdenas 15.427 pz')
    expect(t).toContain('día: Rebolledo 13.541 pz')
    expect(t).toContain('puntos 10 a 2')
    expect(t).toContain('ganó por puntos con menos piezas')
  })
})
