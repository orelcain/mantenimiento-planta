/**
 * El monitor decía, en verde y con un ✓:
 *
 *     ✓ Ninguna parada por falla de máquina en este turno.
 *
 * justo debajo de:
 *
 *     SIN IMPUTAR · nadie anotó la causa · 2 h 40 min · 4.809 pz
 *
 * Visto en el monitor de Eviscerado de Planta Principal el 26-08 a las 04:00.
 * Las 2 h 40 min sin imputar pueden ser falla de máquina: nadie lo sabe, porque
 * nadie anotó la causa. La pantalla convertía **"no sé"** en **"no fue
 * Mantención"**, en el sentido que le conviene a Mantención — en el link que
 * mira Producción.
 *
 * Es exactamente lo que el propio `monitorEventos` prohíbe en su comentario:
 * «Inventarle dueño a una detención es lo único que no se puede hacer acá.»
 * Y es lo peor que puede hacer una pantalla cuyo objetivo es DEMOSTRAR con
 * datos el aporte de Mantención: el día que Producción descubra que ese ✓ sale
 * aunque nadie haya imputado nada, se cae la credibilidad del resto.
 *
 * En Chonchi la imputación viene en 0% la mayor parte del tiempo, así que el
 * ✓ salía casi siempre sin ninguna evidencia detrás.
 */
import { describe, it, expect } from 'vitest'
import { veredictoFallaDeMaquina } from '../monitorEventos'
import type { GrupoDelTurno } from '../monitorEventos'

const grupo = (dueno: GrupoDelTurno['dueno'], min: number): GrupoDelTurno => ({
  dueno, min, piezas: 0,
  causas: [{ reason: 'x', min, count: 1, piezas: null, categoria: null, extension: false, paradas: [] }],
})

describe('veredictoFallaDeMaquina', () => {
  it('⚠ con TODO sin imputar no afirma nada — era la mentira', () => {
    // El caso real de las 04:00: 160 min de paradas, ninguna con causa.
    expect(veredictoFallaDeMaquina([grupo('sin-imputar', 160)])).toBeNull()
  })

  it('con paradas imputadas y ninguna de Mantención, sí lo afirma', () => {
    const v = veredictoFallaDeMaquina([grupo('externo', 40)])!
    expect(v.sinImputarMin).toBe(0)
    expect(v.texto).toBe('✓ Ninguna parada por falla de máquina en este turno.')
  })

  it('si queda tiempo sin imputar, la frase dice hasta dónde llega', () => {
    const v = veredictoFallaDeMaquina([grupo('externo', 40), grupo('sin-imputar', 111)])!
    expect(v.sinImputarMin).toBe(111)
    // No puede decir "en este turno": solo sabe de lo que tiene causa anotada.
    expect(v.texto).not.toMatch(/en este turno/)
    expect(v.texto).toMatch(/con causa anotada/i)
    expect(v.texto).toMatch(/1 h 51 min sin imputar/)
  })

  it('con una falla de máquina no afirma nada, aunque haya otras imputadas', () => {
    expect(veredictoFallaDeMaquina([grupo('mantencion', 54), grupo('externo', 10)])).toBeNull()
    expect(veredictoFallaDeMaquina([grupo('mantencion', 54), grupo('sin-imputar', 111)])).toBeNull()
  })

  it('un turno sin ninguna parada no dice una frase vacía', () => {
    expect(veredictoFallaDeMaquina([])).toBeNull()
    // Lo programado no es parada imputable: no habilita la afirmación.
    expect(veredictoFallaDeMaquina([grupo('programado', 60)])).toBeNull()
  })

  it('el caso real del turno del 26-08: 54 min de Mantención → callado', () => {
    // AJUSTE MANTENIMIENTO 54 min + sin imputar 111 min, medido del payload.
    expect(veredictoFallaDeMaquina([grupo('mantencion', 54), grupo('sin-imputar', 111)])).toBeNull()
  })
})
