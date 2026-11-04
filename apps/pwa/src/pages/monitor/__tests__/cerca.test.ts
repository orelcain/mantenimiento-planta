/**
 * «Cerca:» (`cerca`, `motivoConHoja`, `lineaCerca`, `detalleCerca`, `notaCerca`) con entradas sintéticas: la ventana de 300 s (entra 300, no 301), qué
 * detención cuenta y cuál gana, cuándo la causa de la micro ya la nombra, y los textos. Los datos reales están en `cerca.reales.test.tsx`.
 * Los límites de la ventana van en literal (300 y 301 s), no con `CERCA_MAX_S`: si la constante cambia, estas pruebas tienen que fallar.
 */
import { describe, expect, it } from 'vitest'
import { CERCA_MAX_S, clasificarMicros, motivoConHoja, type CercaMicro, type EntradaMicroCausa, type MicroClasificada } from '../microCausa'
import { detalleCerca, lineaCerca, notaCerca } from '../textosCausas'
import { PROHIBIDAS } from './vocabulario'

const T0 = Date.parse('2026-11-02T09:15:00.000Z')
const iso = (seg: number) => new Date(T0 + seg * 1000).toISOString()
/** Los espacios duros pasan a normales: así se leen los textos como los lee el usuario. */
const sp = (s: string | null | undefined) => (s ?? '').replace(/\u00a0/g, ' ')
const ids = ['a', 'b', 'c']
const ESP = [18, 16, 16]
/** Tres Baader de 60 minutos andando a su esperado: aquí solo importan las detenciones. */
const serie = () => ({
  desde: iso(0),
  maquinas: ids.map((id, j) => ({ id, nombre: `Evisceradora ${j + 1}`, esperado: ESP[j]!, cycles: Array.from({ length: 60 }, () => ESP[j]!) })),
})
/** Las razones de la entrada: 0 micro · 1 MMPP con hoja · 2 ACUM con hoja · 3 «Detencion» · 4 «Sin razón» · 5 sin hoja · 6 colación · 7 programada · 8 cintas (con hoja, familia MEC). */
const RAZONES = ['Micro Detencion', 'Falta MMPP Flujo Acopio', 'ACUMULACION RECHAZO', 'Detencion', 'Sin razón', 'Limpieza de Ducto', 'COLACION', 'DETENCION PROGRAMADA', 'CINTAS']
interface Ev { r: number; f: string; s: number; m: number }
/** Un evento: razón (índice de `RAZONES`), segundo desde el inicio del turno, duración y Baader (0 = Ev 1, 1 = Ev 2, 2 = Ev 3). */
const ev = (r: number, seg: number, s: number, m: number): Ev => ({ r, f: iso(seg), s, m })
const entrada = (eventos: Ev[]): EntradaMicroCausa => ({ serie: serie(), stopEvents: eventos, stopReasons: RAZONES, stopMachines: ids, inicioTurnoMs: T0 })
/** La micro de Ev 1 que empieza al segundo 1800 (45 s), con las detenciones que se le pasan. */
const MICRO = 1800
const microCon = (...extras: Ev[]): MicroClasificada => {
  const q = clasificarMicros(entrada([ev(0, MICRO, 45, 0), ...extras])).find((x) => x.fila === 0 && x.inicioMs === T0 + MICRO * 1000)
  if (!q) throw new Error('no está la micro de Ev 1 a los 1800 s')
  return q
}
/** Una detención de prueba para los textos (las horas de planta van con el mismo sellado UTC que el resto del monitor). */
const cerca = (extra: Partial<CercaMicro> = {}): CercaMicro => ({
  fila: 2, nombre: 'Ev 3', razon: 'Falta MMPP Flujo Acopio', motivo: 'Falta MMPP', inicioMs: Date.parse('2026-11-02T15:13:00.000Z'), durS: 135, deltaS: -180, nombrada: false, ...extra,
})
/** Una micro cualquiera con (o sin) «Cerca», para `notaCerca`, que solo mira `cerca` y el largo de la lista. */
const con = (motivo: string, nombrada = false) => ({ cerca: cerca({ motivo, nombrada }) }) as unknown as MicroClasificada
const sin = () => ({ cerca: null }) as unknown as MicroClasificada

describe('motivoConHoja · la hoja de la taxonomía, o nada', () => {
  it('lleva hoja: «Falta MMPP Flujo Acopio» es «Falta MMPP»; «ACUMULACION RECHAZO», «Acumulación rechazo»', () => {
    expect(motivoConHoja('Falta MMPP Flujo Acopio')).toBe('Falta MMPP')
    expect(motivoConHoja('ACUMULACION RECHAZO')).toBe('Acumulación rechazo')
  })
  it('no sirve: vacía, nula, «Detencion», «Sin razón» (con tilde), sin hoja («Limpieza de Ducto») y planificadas («COLACION», «DETENCION PROGRAMADA»)', () => {
    for (const r of ['', '   ', null, undefined, 'Detencion', 'Sin razón', 'Limpieza de Ducto', 'COLACION', 'DETENCION PROGRAMADA']) expect(motivoConHoja(r)).toBeNull()
  })
})

describe('Cerca · la ventana: 300 s entra, 301 s no', () => {
  it('CERCA_MAX_S es 300 s (5 min)', () => {
    expect(CERCA_MAX_S).toBe(300)
  })
  it('una detención con motivo 300 s antes de la micro entra (deltaS 300: empezó antes)', () => {
    expect(microCon(ev(1, MICRO - 300, 30, 1)).cerca).toMatchObject({ nombre: 'Ev 2', motivo: 'Falta MMPP', deltaS: 300, nombrada: false })
  })
  it('301 s antes no entra', () => {
    expect(microCon(ev(1, MICRO - 301, 30, 1)).cerca).toBeNull()
  })
  it('300 s después entra (deltaS −300) y 301 s después no', () => {
    expect(microCon(ev(1, MICRO + 300, 30, 1)).cerca).toMatchObject({ deltaS: -300 })
    expect(microCon(ev(1, MICRO + 301, 30, 1)).cerca).toBeNull()
  })
})

describe('Cerca · qué detención cuenta y cuál gana', () => {
  it('«Detencion», «Sin razón», sin hoja («Limpieza de Ducto»), planificadas («COLACION», «DETENCION PROGRAMADA») y una micro NO cuentan', () => {
    for (const r of [3, 4, 5, 6, 7, 0]) expect(microCon(ev(r, MICRO - 60, 30, 1)).cerca).toBeNull()
  })
  it('la detención de la propia Baader también cuenta', () => {
    expect(microCon(ev(1, MICRO - 60, 30, 0)).cerca).toMatchObject({ fila: 0, nombre: 'Ev 1', motivo: 'Falta MMPP', nombrada: false })
  })
  it('gana la más cercana (60 s frente a 200 s)', () => {
    expect(microCon(ev(1, MICRO - 200, 30, 1), ev(1, MICRO - 60, 30, 2)).cerca).toMatchObject({ nombre: 'Ev 3', deltaS: 60 })
  })
  it('empate de distancia: gana la de menor inicio', () => {
    expect(microCon(ev(1, MICRO + 60, 30, 1), ev(1, MICRO - 60, 30, 2)).cerca).toMatchObject({ nombre: 'Ev 3', deltaS: 60 })
  })
  it('empate de inicio: gana la de menor fila', () => {
    expect(microCon(ev(1, MICRO - 60, 40, 2), ev(1, MICRO - 60, 30, 1)).cerca).toMatchObject({ nombre: 'Ev 2', fila: 1 })
  })
  it('una sin hoja más cercana no tapa a la que sí tiene (sin hoja a 20 s, MMPP a 200 s)', () => {
    expect(microCon(ev(5, MICRO - 20, 30, 2), ev(1, MICRO - 200, 30, 1)).cerca).toMatchObject({ nombre: 'Ev 2', motivo: 'Falta MMPP', deltaS: 200 })
  })
})

describe('Cerca · nombrada: si la causa de la micro ya la dice, el globo no la repite', () => {
  it('«a la vez»: otra Baader se detuvo al mismo segundo y la causa la nombra → nombrada, sin línea ni párrafo', () => {
    const q = microCon(ev(1, MICRO, 40, 1))
    expect(q.causa).toBe('linea')
    expect(q.modo).toBe('a_la_vez')
    expect(q.cerca).toMatchObject({ nombre: 'Ev 2', nombrada: true })
    expect(lineaCerca(q.cerca)).toBeNull()
    expect(detalleCerca(q.cerca)).toBeNull()
  })
  it('«a la vez» con una MICRO de otra Baader al mismo segundo: esa no la nombra, y la detención de 200 s antes sí se muestra', () => {
    const q = microCon(ev(0, MICRO, 40, 1), ev(1, MICRO - 200, 30, 2))
    expect(q.modo).toBe('a_la_vez')
    expect(q.cerca).toMatchObject({ nombre: 'Ev 3', nombrada: false })
    expect(sp(lineaCerca(q.cerca))).toBe('Falta MMPP en Ev 3, a las 09:41 (3 min 20 s antes)')
  })
  it('«detención previa»: la que muestra la evidencia (la más cercana de las otras Baader) queda nombrada', () => {
    const q = microCon(ev(2, MICRO - 100, 60, 1))
    expect(q.modo).toBe('tras_paro_otra')
    expect(q.cerca).toMatchObject({ nombre: 'Ev 2', motivo: 'Acumulación rechazo', nombrada: true })
    expect(lineaCerca(q.cerca)).toBeNull()
  })
  it('«detención previa»: una detención más cercana que NO es la que muestra la evidencia no queda nombrada y se muestra', () => {
    const q = microCon(ev(2, MICRO - 100, 60, 1), ev(8, MICRO - 40, 30, 2))
    expect(q.modo).toBe('tras_paro_otra')
    expect(q.cerca).toMatchObject({ nombre: 'Ev 3', motivo: 'Cintas', nombrada: false })
    expect(sp(lineaCerca(q.cerca))).toBe('Cintas en Ev 3, a las 09:44 (40 s antes)')
  })
})

describe('Cerca · los textos', () => {
  it('la línea: «Falta MMPP en Ev 3, a las 15:13 (3 min después)»; si la detención empezó antes dice «antes»; si fue a la vez, «al mismo tiempo»', () => {
    expect(sp(lineaCerca(cerca()))).toBe('Falta MMPP en Ev 3, a las 15:13 (3 min después)')
    expect(sp(lineaCerca(cerca({ deltaS: 90 })))).toBe('Falta MMPP en Ev 3, a las 15:13 (1 min 30 s antes)')
    expect(sp(lineaCerca(cerca({ deltaS: 0 })))).toBe('Falta MMPP en Ev 3, a las 15:13 (al mismo tiempo)')
  })
  it('sin línea si no hay detención o si la causa ya la nombra', () => {
    expect(lineaCerca(null)).toBeNull()
    expect(lineaCerca(cerca({ nombrada: true }))).toBeNull()
  })
  it('el detalle abierto: título «Cerca:» y el texto con la duración exacta; sin línea, sin detalle', () => {
    expect(detalleCerca(cerca())).toEqual({ titulo: 'Cerca:', texto: expect.any(String) })
    expect(sp(detalleCerca(cerca())?.texto)).toBe('la detención con motivo que anotó el supervisor a 5 min o menos, en cualquier Baader. Duró 2 min 15 s. Es un hecho del registro: no dice por qué ocurrió esta micro.')
    expect(detalleCerca(cerca({ nombrada: true }))).toBeNull()
    expect(detalleCerca(null)).toBeNull()
  })
  it('la nota del ⓘ: cuenta todas las «Cerca» (las nombradas también), nombra las dos hojas más frecuentes y el resto suma «otras»', () => {
    const micros = [con('Acumulación rechazo'), con('Acumulación rechazo'), con('Acumulación rechazo'), con('Falta MMPP', true), con('Falta MMPP', true), con('Cintas'), con('Atascamiento'), sin(), sin(), sin()]
    const nota = notaCerca(micros)
    expect(nota?.[0]).toEqual({ negrita: true, texto: 'Cerca' })
    expect(sp(nota?.[1]?.texto)).toBe(': 7 de 10 micro tienen una detención anotada a 5 min o menos: 3 Acumulación rechazo, 2 Falta MMPP y 2 otras. Es lo que anotó el supervisor; no dice por qué ocurrió cada micro.')
  })
  it('«y 1 otra» con tres motivos, y «y 3 otras» con cinco', () => {
    const tres = [...Array.from({ length: 3 }, () => con('Acumulación rechazo')), ...Array.from({ length: 2 }, () => con('Falta MMPP')), con('Cintas'), sin(), sin(), sin(), sin()]
    expect(sp(notaCerca(tres)?.[1]?.texto)).toContain(': 6 de 10 micro tienen una detención anotada a 5 min o menos: 3 Acumulación rechazo, 2 Falta MMPP y 1 otra. ')
    const cinco = [...Array.from({ length: 4 }, () => con('Acumulación rechazo')), ...Array.from({ length: 3 }, () => con('Falta MMPP')), con('Cintas'), con('Atascamiento'), con('Bombas'), sin(), sin()]
    expect(sp(notaCerca(cinco)?.[1]?.texto)).toContain(': 10 de 12 micro tienen una detención anotada a 5 min o menos: 4 Acumulación rechazo, 3 Falta MMPP y 3 otras. ')
  })
  it('una sola micro dice «tiene»', () => {
    const uno = [con('Falta MMPP'), ...Array.from({ length: 69 }, () => sin())]
    expect(sp(notaCerca(uno)?.[1]?.texto)).toBe(': 1 de 70 micro tiene una detención anotada a 5 min o menos: 1 Falta MMPP. Es lo que anotó el supervisor; no dice por qué ocurrió cada micro.')
  })
  it('sin ninguna micro con «Cerca», no hay nota', () => {
    expect(notaCerca([sin(), sin()])).toBeNull()
    expect(notaCerca([])).toBeNull()
  })
})

describe('Cerca · vocabulario: nada de «causa», «probable», «posible», «casualidad», «azar», «paro» ni «parada»', () => {
  it('la línea, el detalle y la nota no dicen nada de eso', () => {
    const textos = [
      lineaCerca(cerca()),
      lineaCerca(cerca({ deltaS: 0 })),
      detalleCerca(cerca())?.texto,
      sp(notaCerca([con('Falta MMPP'), con('Acumulación rechazo'), con('Cintas'), con('Bombas'), sin()])?.[1]?.texto),
    ].map(sp)
    for (const t of textos) {
      expect(t).not.toMatch(/causa|probable|posible/i)
      expect(t).not.toMatch(PROHIBIDAS)
    }
  })
})
