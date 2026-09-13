import { describe, it, expect } from 'vitest'
import { apilar, desapilar, restaurar, LIMITE_HISTORIAL, type PasoHistorial } from '../historialRueda'
import {
  SLOTS_POR_DIA,
  copiarDia,
  copiarSemanaDesde,
  diaVacio,
  maquinaNueva,
  pintarHoras,
  slotDeHora,
  type MaquinaRueda,
} from '../ruedaVentanas'

function conLunesPintado(id = 'a'): MaquinaRueda {
  const m = maquinaNueva(id, id.toUpperCase())
  m.semana[0] = {
    areas: pintarHoras('0'.repeat(SLOTS_POR_DIA), slotDeHora(8), slotDeHora(13), 'P'),
    mant: diaVacio().mant,
  }
  return m
}

describe('apilar', () => {
  it('no muta el historial que recibe', () => {
    const h: PasoHistorial[] = []
    apilar(h, conLunesPintado(), 0)
    expect(h).toHaveLength(0)
  })

  it('recorta por el principio al pasarse del límite, conservando lo más reciente', () => {
    let h: PasoHistorial[] = []
    for (let i = 0; i < LIMITE_HISTORIAL + 5; i++) {
      h = apilar(h, { ...conLunesPintado(), nombre: `paso ${i}` }, 0)
    }
    expect(h).toHaveLength(LIMITE_HISTORIAL)
    expect(h[h.length - 1]!.maquina.nombre).toBe(`paso ${LIMITE_HISTORIAL + 4}`)
  })
})

describe('desapilar', () => {
  it('devuelve el último paso y lo saca', () => {
    const h = apilar([], conLunesPintado(), 3)
    const { historial, paso } = desapilar(h)
    expect(paso?.dia).toBe(3)
    expect(historial).toHaveLength(0)
  })

  it('con el historial vacío no revienta', () => {
    const { paso, historial } = desapilar([])
    expect(paso).toBeNull()
    expect(historial).toHaveLength(0)
  })
})

describe('restaurar · lo que el bug rompía', () => {
  it('deshacer «copiar el día a Lun-Vie» devuelve los CINCO días', () => {
    // Guardar solo el día mirado restauraba uno y dejaba cuatro pisados.
    const antes = conLunesPintado()
    const despues = copiarDia(antes, 0, [1, 2, 3, 4])
    expect(despues.semana[3]!.areas).not.toBe(antes.semana[3]!.areas)

    const h = apilar([], antes, 0)
    const { paso } = desapilar(h)
    const repuesto = restaurar([despues], paso!)[0]!
    for (let d = 0; d < 7; d++) {
      expect(repuesto.semana[d]!.areas).toBe(antes.semana[d]!.areas)
    }
  })

  it('deshacer «copiar la semana de otra máquina» devuelve los SIETE días', () => {
    const antes = conLunesPintado('destino')
    const origen = maquinaNueva('origen', 'Origen', 'doble')
    const despues = copiarSemanaDesde(antes, origen)

    const h = apilar([], antes, 0)
    const { paso } = desapilar(h)
    const repuesto = restaurar([despues], paso!)[0]!
    expect(repuesto.semana.map((d) => d.areas)).toEqual(antes.semana.map((d) => d.areas))
  })

  it('también repone el estado de confirmación, que la copia había bajado', () => {
    const antes = { ...conLunesPintado('d'), revisadoEnTerreno: true }
    const despues = copiarSemanaDesde(antes, maquinaNueva('o', 'O'))
    expect(despues.revisadoEnTerreno).toBe(false)

    const { paso } = desapilar(apilar([], antes, 0))
    expect(restaurar([despues], paso!)[0]!.revisadoEnTerreno).toBe(true)
  })

  it('no toca las demás máquinas', () => {
    const a = conLunesPintado('a')
    const b = conLunesPintado('b')
    const { paso } = desapilar(apilar([], a, 0))
    const lista = restaurar([{ ...a, nombre: 'cambiada' }, b], paso!)
    expect(lista[0]!.nombre).toBe('A')
    expect(lista[1]).toBe(b)
  })

  it('si la máquina fue eliminada, deshacer NO la resucita', () => {
    // Reinsertarla desharía un borrado deliberado, que es peor que no deshacer.
    const a = conLunesPintado('a')
    const b = conLunesPintado('b')
    const { paso } = desapilar(apilar([], a, 0))
    expect(restaurar([b], paso!)).toEqual([b])
  })
})
