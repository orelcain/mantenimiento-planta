import { describe, it, expect } from 'vitest'
import { veredictoOrigenDelTurno, type EntradaVeredictoOrigen } from '../origenDelTurno'

const base: EntradaVeredictoOrigen = {
  totalParos: 5,
  parosUpstream: 0,
  segUpstream: 0,
  segParosTotal: 1_800,
  porMaquina: [],
  parosProgramados: 0,
  ritmoPctExplicado: 2,
  ritmoExplica: false,
}

describe('veredictoOrigenDelTurno', () => {
  it('sin paros no opina', () => {
    expect(veredictoOrigenDelTurno({ ...base, totalParos: 0 })).toBeNull()
  })

  it('el caso mayoritario es un HALLAZGO, no un vacío', () => {
    // Antes la tarjeta se ocultaba entera cuando no había correlación, así que
    // el resultado de 34 de 40 turnos no se veía nunca.
    const v = veredictoOrigenDelTurno(base)!
    expect(v.tono).toBe('ok')
    expect(v.veredicto).toBe('Las causas son internas del Grader.')
    expect(v.evidencia).toContain('Ninguno de los 5 paros')
    expect(v.evidencia).toContain('solo el 2 %')
    // Nada de «no se detectó» ni «sin datos»: eso se lee como que falló la app.
    expect(v.veredicto).not.toMatch(/sin datos|no se detect/i)
  })

  it('con R² bajo el umbral NO se cita el ritmo como causa', () => {
    // `ritmoExplica` es false: la pendiente existe pero es ruido. Puede
    // mencionarse como cola («explica solo el 2 %»), nunca como veredicto.
    const v = veredictoOrigenDelTurno({ ...base, ritmoPctExplicado: 8 })!
    expect(v.tono).toBe('ok')
    expect(v.veredicto).not.toMatch(/ritmo/i)
  })

  it('no se contradice cuando los paros cayeron en colación', () => {
    // Encontrado mirando el turno 08-09 en pantalla: la tarjeta decía «Ninguno
    // de los 2 paros coincidió con las Baader» y en el renglón siguiente «2
    // paros coinciden con paros programados de Baader». Las dos afirmaciones
    // eran ciertas y juntas se leían como un error.
    const v = veredictoOrigenDelTurno({ ...base, totalParos: 2, parosProgramados: 2 })!
    expect(v.evidencia).toContain('parada imprevista')
    expect(v.evidencia).toContain('2 cayeron en colación o reunión')
    expect(v.evidencia).not.toMatch(/Ninguno de los 2 paros coincidió con las Baader[.;]/)
  })

  it('paros internos pero ritmo por encima del umbral', () => {
    const v = veredictoOrigenDelTurno({ ...base, ritmoPctExplicado: 17, ritmoExplica: true })!
    expect(v.tono).toBe('warn')
    expect(v.veredicto).toBe('Los paros son internos, pero el ritmo de la línea pesa.')
    expect(v.evidencia).toContain('17 %')
  })

  it('con solape repartido no acusa a ninguna máquina', () => {
    const v = veredictoOrigenDelTurno({
      ...base,
      parosUpstream: 1,
      segUpstream: 300,
      porMaquina: [
        { machineName: 'Ev 1', totalOverlapSec: 108 },
        { machineName: 'Ev 2', totalOverlapSec: 102 },
        { machineName: 'Ev 3', totalOverlapSec: 90 },
      ],
    })!
    expect(v.tono).toBe('warn')
    expect(v.veredicto).toBe('5 min de este turno vinieron de la línea.')
    expect(v.evidencia).toContain('1 de 5 paros')
    expect(v.evidencia).toContain('17 % del tiempo muerto')
    expect(v.evidencia).toContain('se reparte parejo entre las 3')
    expect(v.veredicto).not.toMatch(/Ev \d/)
  })

  it('solo nombra a una máquina cuando concentra al menos la mitad del solape', () => {
    const v = veredictoOrigenDelTurno({
      ...base,
      parosUpstream: 2,
      segUpstream: 600,
      porMaquina: [
        { machineName: 'Ev 3', totalOverlapSec: 400 },
        { machineName: 'Ev 1', totalOverlapSec: 200 },
      ],
    })!
    expect(v.tono).toBe('crit')
    expect(v.veredicto).toContain('Ev 3')
    expect(v.evidencia).toContain('67 % del solape')
  })

  it('la frontera de concentración se prueba por los dos lados', () => {
    // `porMaquina` llega SIEMPRE ordenado desc (summarizeCorrelations), así que
    // la líder es la primera. 49 % no alcanza para acusar; 50 % justo sí.
    const conLider = (secs: number[]) => veredictoOrigenDelTurno({
      ...base,
      parosUpstream: 2,
      segUpstream: 600,
      porMaquina: secs.map((n, i) => ({ machineName: `Ev ${i + 1}`, totalOverlapSec: n })),
    })!
    const justoAbajo = conLider([49, 30, 21])
    expect(justoAbajo.tono).toBe('warn')
    expect(justoAbajo.veredicto).not.toMatch(/Ev \d/)

    const justoArriba = conLider([50, 30, 20])
    expect(justoArriba.tono).toBe('crit')
    expect(justoArriba.veredicto).toContain('Ev 1')
  })
})
