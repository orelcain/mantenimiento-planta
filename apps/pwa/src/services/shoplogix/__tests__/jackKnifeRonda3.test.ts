import { describe, expect, it } from 'vitest'
import { calcularJackKnife, causasConHistoria, datosInforme, frasePrioridad, limitesPeriodoBase, nivelPrioridad, resumenComparacion, textoResumenComparacion, veredicto, type PuntoJK, type TurnoJK } from '../jackKnife'
const punto = (ev: number, mttr: number): PuntoJK => ({ k: 'Motor', ev, mttr, min: ev * mttr, q: 'ok' })
const turno = (id: string, causas: [string, number][]): TurnoJK => ({
  id, dateKey: id, shiftId: 'Turno 1', resumen: { v: 1, eventos: causas.map(([k,m],i) => [k,i,m]), sinImputar: [], sinImputarLinea: [], comentarios: [], conCausaMin: 100, sinCausaMin: 0, uptimeMin: 480 },
})
describe('Jack-Knife ronda 3', () => {
  it('clasifica los cinco niveles, incluido el límite exacto de crónica A', () => {
    expect([punto(3,11), punto(1,11), punto(4,5), punto(3,5), punto(1,5)].map(p => nivelPrioridad(p,2,10))).toEqual([1,2,3,4,5])
  })
  it('escala un por turnos, conserva um y reclasifica', () => {
    const t = [turno('1', [['Motor',20],['Correa',10]]), turno('2', [['Motor',30]]), turno('3', [['Motor',20]])]
    const base = calcularJackKnife(t,0,0,'imp'), actual = calcularJackKnife(t,1,2,'imp')
    const fijo = limitesPeriodoBase(actual,base,true)
    expect(fijo.un).toBe(2)
    expect(fijo.um).toBe(15)
    expect(fijo.pts[0]?.q).toBe('agu')
    expect(limitesPeriodoBase(actual,base,false)).toBe(actual)
    expect(limitesPeriodoBase(actual,null,true)).toBe(actual)
  })
  const turnos = [turno('1', [['Reaparece',1]]), turno('2', [['Mejora',100],['Empeora',10],['Desaparece',20]]), turno('3', [['Mejora',50],['Empeora',30],['Reaparece',10],['Knuro',10]])]
  const actual = calcularJackKnife(turnos,2,2,'imp'), antes = calcularJackKnife(turnos,1,1,'imp')
  const previa = { desde: 1, hasta: 1, parcial: false }
  it('distingue apareció de sin historia en todos los turnos anteriores', () => {
    const historia = causasConHistoria(turnos,2)
    expect(historia.has('Reaparece')).toBe(true)
    expect(historia.has('Knuro')).toBe(false)
    expect(veredicto(punto(1,10),undefined,1,1,true)).toBe('nueva')
    expect(veredicto(punto(1,10),undefined,1,1,false)).toBe('sinHistoria')
    const informe = datosInforme(turnos,actual,antes,previa)!
    expect(informe.aparecieron).toEqual(['Reaparece'])
    expect(informe.sinHistoria).toEqual(['Knuro'])
    expect(informe.desaparecieron).toEqual(['Desaparece'])
  })
  it('separa los cinco conteos y omite ceros', () => {
    const r = resumenComparacion(actual,antes,previa,causasConHistoria(turnos,2))!
    expect([r.mejoraron,r.desaparecieron,r.empeoraron,r.aparecieron,r.sinHistoria]).toEqual([1,1,1,1,1])
    expect(textoResumenComparacion(r)).toBe('1 mejoró, 1 desapareció, 1 empeoró, 1 apareció, 1 sin historia')
    expect(textoResumenComparacion({...r, mejoraron: 4, desaparecieron: 1, empeoraron: 6, aparecieron: 0, sinHistoria: 3})).toBe('4 mejoraron, 1 desapareció, 6 empeoraron, 3 sin historia')
  })
  it('la frase diferencia la causa del total', () => {
    const c = {...actual, un: 1, um: 10, pts: [punto(3,20)], N: 354, D: 3132}
    expect(frasePrioridad(c, m => m + ' min')).toBe('Prioridad 1: Motor, 3 eventos y 60 min. Mantención en total: 354 eventos y 3132 min.')
  })
  it('conserva causas sin historia frente a una base sin eventos, sin inventar porcentaje', () => {
    const t = [turno('1', []), turno('2', [['Knuro',10]])]
    const a = calcularJackKnife(t,1,1,'imp'), b = calcularJackKnife(t,0,0,'imp')
    const p = {desde:0,hasta:0,parcial:false}
    expect(resumenComparacion(a,b,p)?.sinHistoria).toBe(1)
    expect(datosInforme(t,a,b,p)?.sinHistoria).toEqual(['Knuro'])
    expect(datosInforme(t,a,b,p)?.variacionPct).toBeNull()
  })
})
