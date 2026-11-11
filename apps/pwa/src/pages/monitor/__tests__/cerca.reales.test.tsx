/**
 * «Cerca:» con los datos REALES del turno Chonchi 02-11 T2 al cierre (`chonchi_0211_turno2_cierre.json`): la detención con motivo que el supervisor anotó
 * a 5 min o menos de cada micro. Golden: 70 micro; 41 con «Cerca»; Falta MMPP 29 y Acumulación rechazo 12. Cada cifra sale del doc, no se escribe a mano.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { calibracionDe } from '../causasCalibracion'
import { GloboMicro } from '../GraficoRitmoVivo'
import type { MicroClasificada } from '../microCausa'
import { ResumenCausasMicro } from '../ResumenCausas'
import { TXT_RESUMEN, detalleCerca, lineaCerca, notaCerca } from '../textosCausas'
import { lineasDelGlobo } from './globoTexto'
import { CHONCHI_0211_T2, CHONCHI_0211_T2_CIERRE, buscarMicro, clasificarDoc } from './microFixtures'
import { PROHIBIDAS } from './vocabulario'

afterEach(() => cleanup())

const micros = clasificarDoc(CHONCHI_0211_T2_CIERRE, { planta: 'chonchi' })
const cal = calibracionDe('chonchi')
/** Los espacios duros pasan a normales: así se leen los textos como los lee el usuario. */
const sp = (s: string | null | undefined) => (s ?? '').replace(/\u00a0/g, ' ')
/** La micro de Ev 1 de las 15:10:00 (45 s): la del ejemplo del spec. */
const q1510 = () => buscarMicro(micros, '15:10:00', 'Evisceradora 1')

/** El globo ya renderizado (PC fijo, o celular con `compacto`); con `abierto`, «Ver detalle» abierto. */
const globoDe = (q: MicroClasificada, { compacto = false, abierto = false } = {}) => {
  render(<GloboMicro q={q} compacto={compacto} fijo={compacto ? undefined : true} onCerrar={() => {}} cal={cal} />)
  const globo = screen.getByRole('group')
  if (abierto) fireEvent.click(globo.querySelector('.gm-ver')!)
  return globo
}

describe('Cerca · la lectura de las 15:24 (`chonchi_0211_turno2.json`: las mismas micro, con lo que estaba anotado a esa hora)', () => {
  const de1524 = clasificarDoc(CHONCHI_0211_T2, { planta: 'chonchi' })

  it('46 micro; 8 con «Cerca»; de ellas, 3 que la causa ya nombra (sin línea)', () => {
    expect(de1524).toHaveLength(46)
    const cercas = de1524.flatMap((q) => (q.cerca ? [q.cerca] : []))
    expect(cercas).toHaveLength(8)
    expect(cercas.filter((c) => c.nombrada)).toHaveLength(3)
  })

  it('las otras 5 dicen su distancia con el signo correcto: «al mismo tiempo», «antes» y «después»', () => {
    expect(sp(lineaCerca(buscarMicro(de1524, '09:30:13', 'Evisceradora 3').cerca))).toBe('Acumulación rechazo en Ev 2, a las 09:30 (al mismo tiempo)')
    expect(sp(lineaCerca(buscarMicro(de1524, '09:31:13', 'Evisceradora 1').cerca))).toBe('Acumulación rechazo en Ev 2, a las 09:30 (1 min antes)')
    expect(sp(lineaCerca(buscarMicro(de1524, '09:59:28', 'Evisceradora 1').cerca))).toBe('Acumulación rechazo en Ev 1, a las 10:00 (1 min 15 s después)')
  })

  it('el globo de una de las 5 (Ev 1 de las 09:59:28) muestra «Cerca:» bajo la tabla; el de una nombrada (Ev 3 de las 10:00:58), no', () => {
    expect(lineasDelGlobo(globoDe(buscarMicro(de1524, '09:59:28', 'Evisceradora 1'))).slice(-2)).toEqual([
      'Cerca: Acumulación rechazo en Ev 1, a las 10:00 (1 min 15 s después)',
      'Ver detalle (cerrado)',
    ])
    cleanup()
    expect(globoDe(buscarMicro(de1524, '10:00:58', 'Evisceradora 3')).querySelector('.gm-cerca')).toBeNull()
  })
})

describe('Cerca · el turno Chonchi 02-11 T2 al cierre (datos reales)', () => {
  it('golden: 70 micro; 41 con «Cerca»; por motivo, Falta MMPP 29 y Acumulación rechazo 12', () => {
    expect(micros).toHaveLength(70)
    const cercas = micros.flatMap((q) => (q.cerca ? [q.cerca] : []))
    expect(cercas).toHaveLength(41)
    const porMotivo: Record<string, number> = {}
    for (const c of cercas) porMotivo[c.motivo] = (porMotivo[c.motivo] ?? 0) + 1
    expect(porMotivo).toEqual({ 'Falta MMPP': 29, 'Acumulación rechazo': 12 })
  })

  it('15:10:00 Ev 1 (45 s): «Cerca» es Ev 3, con su razón de Shoplogix, a las 15:13, 2 min 15 s, 3 min después (deltaS −180), y la causa no la nombra', () => {
    expect(q1510().cerca).toEqual({
      fila: 2,
      nombre: 'Ev 3',
      razon: 'Falta MMPP Flujo Acopio',
      motivo: 'Falta MMPP',
      inicioMs: Date.parse('2026-11-02T15:13:00.529Z'),
      durS: 135,
      deltaS: -180,
      nombrada: false,
    })
    expect(sp(lineaCerca(q1510().cerca))).toBe('Falta MMPP en Ev 3, a las 15:13 (3 min después)')
  })

  it('10:02:13 Ev 2: la causa ya nombra la detención de Ev 1 (acumulación, 1 min 30 s antes): nombrada, y el globo no repite «Cerca:»', () => {
    const q = buscarMicro(micros, '10:02:13', 'Evisceradora 2')
    expect(q.causa).toBe('linea')
    expect(q.modo).toBe('tras_paro_otra')
    expect(q.cerca).toMatchObject({ fila: 0, nombre: 'Ev 1', motivo: 'Acumulación rechazo', deltaS: 90, nombrada: true })
    expect(lineaCerca(q.cerca)).toBeNull()
    expect(globoDe(q).querySelector('.gm-cerca')).toBeNull()
  })

  it('el globo de PC (fijo) pone «Cerca:» entre la tabla y «Ver detalle»; el del celular, igual', () => {
    const pc = lineasDelGlobo(globoDe(q1510())).slice(-2)
    expect(pc).toEqual(['Cerca: Falta MMPP en Ev 3, a las 15:13 (3 min después)', 'Ver detalle (cerrado)'])
    cleanup()
    const movil = lineasDelGlobo(globoDe(q1510(), { compacto: true })).slice(-2)
    expect(movil).toEqual(pc)
  })

  it('con «Ver detalle» abierto, el párrafo «Cerca:» va después de las reglas que no aplicaron y antes del pie', () => {
    const lineas = lineasDelGlobo(globoDe(q1510(), { abierto: true }))
    expect(lineas.slice(-2)).toEqual([
      'Cerca: la detención con motivo que anotó el supervisor a 5 min o menos, en cualquier Baader. Duró 2 min 15 s. Es un hecho del registro: no dice por qué ocurrió esta micro.',
      'Causa posible no prueba que eso la provocó: lo calcula el monitor y se confirma en terreno.',
    ])
  })

  it('el ⓘ del resumen termina con la nota «Cerca», después de «Se ven las 70 micro…»', () => {
    const { container } = render(<ResumenCausasMicro micros={micros} planta="chonchi" cal={cal} microTotal={null} nBaader={3} />)
    fireEvent.click(screen.getByRole('button', { name: TXT_RESUMEN.ariaAyuda }))
    const parrafos = Array.from(container.querySelectorAll('.rv-cz-info p')).map((p) => sp(p.textContent))
    expect(parrafos[parrafos.length - 2]).toMatch(/^Se ven las 70 micro de 15 s o más\./)
    expect(parrafos[parrafos.length - 1]).toBe('Cerca: 41 de 70 micro tienen una detención anotada a 5 min o menos: 29 Falta MMPP y 12 Acumulación rechazo. Es lo que anotó el supervisor; no dice por qué ocurrió cada micro.')
  })

  it('ningún texto de «Cerca» (línea, detalle y nota) dice «causa», «probable», «posible» ni nada de PROHIBIDAS, en las 70 micro', () => {
    for (const q of micros) {
      const textos = [lineaCerca(q.cerca), detalleCerca(q.cerca)?.texto].map(sp)
      for (const t of textos) {
        expect(t).not.toMatch(/causa|probable|posible/i)
        expect(t).not.toMatch(PROHIBIDAS)
      }
    }
    const nota = sp(notaCerca(micros)?.[1]?.texto)
    expect(nota).not.toMatch(/causa|probable|posible/i)
    expect(nota).not.toMatch(PROHIBIDAS)
  })
})
