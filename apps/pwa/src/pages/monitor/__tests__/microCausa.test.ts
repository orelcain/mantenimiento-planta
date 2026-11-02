import { describe, expect, it } from 'vitest'
import {
  ARRANQUE_PARADA_MIN_S, ARRANQUE_VENTANA_S, CAUSAS_MICRO, INICIO_MINUTO_S, LINEA_COMUN_TOL_S, RITMO_BAJO, RITMO_MIN_BAADER, RITMO_MIN_MINUTOS, ROTULO_CAUSA, TRAS_DETENCION_S,
  clasificarMicros, contarPorCausa, motivoLegible, numerosPorCelda, realEstimadoS, type EntradaMicroCausa, type MicroClasificada,
} from '../microCausa'

const T0 = Date.parse('2026-11-02T09:15:00.000Z')
const iso = (seg: number) => new Date(T0 + seg * 1000).toISOString()
const ESP = [18, 16, 16]
const ids = ['a', 'b', 'c']
/** Los textos llevan espacios duros entre la cifra y su unidad: para comparar se pasan a espacios normales. */
const sp = (s: string | null | undefined) => (s ?? '').replace(/\u00a0/g, ' ')
/** Tres Baader con el esperado de Chonchi (18/16/16) y `n` minutos andando al ritmo dado (por defecto, el esperado). */
const serie = (n = 60, ritmo: (j: number, k: number) => number = (j) => ESP[j]!, nMaq = 3) => ({
  desde: iso(0),
  maquinas: ids.slice(0, nMaq).map((id, j) => ({ id, nombre: `Evisceradora ${j + 1}`, esperado: ESP[j]!, cycles: Array.from({ length: n }, (_, k) => ritmo(j, k)) })),
})
/** r: 0 = «Detencion», 1 = «Micro Detencion», 2 = «COLACION» (parada programada). m = índice de la Baader. */
const parada = (seg: number, s: number, m: number) => ({ r: 0, f: iso(seg), s, m })
const micro = (seg: number, s: number, m: number) => ({ r: 1, f: iso(seg), s, m })
const colacion = (seg: number, s: number, m: number) => ({ r: 2, f: iso(seg), s, m })
const entrada = (stopEvents: EntradaMicroCausa['stopEvents'], serieX = serie(), extra: Partial<EntradaMicroCausa> = {}): EntradaMicroCausa => ({
  serie: serieX,
  stopEvents,
  stopReasons: ['Detencion', 'Micro Detencion', 'COLACION'],
  stopMachines: ids.slice(0, serieX.maquinas.length),
  inicioTurnoMs: T0,
  ...extra,
})
/** Todas las micro vienen DESPUÉS de los primeros 10 min: así el arranque no tapa la regla que se prueba. El minuto 30 empieza en T. */
const T = 1800
/** Un segundo CUALQUIERA del minuto 30 desde :15, el primero en que la regla de ritmo bajo se evalúa. */
const M30 = 30 * 60 + 20
/** Ev 2 baja en el minuto 29 (el anterior a las micro de M30). Las demás, a su ritmo. */
const baja = (piezas: number, fila = 1, minuto = 29) => serie(60, (j, k) => (j === fila && k === minuto ? piezas : ESP[j]!))
/** Todas las palabras que el usuario no debe leer en una micro (ver el encabezado de microCausa.ts). */
const PROHIBIDAS = /falta de pescado|baja velocidad|carros|venían lentas/i
const textos = (q: MicroClasificada) => [...q.razones.flatMap((r) => [r.cifra, r.texto, r.detalle ?? '']), ...q.descartadas.map((d) => d.texto), q.tabla.leyendaInicio ?? ''].map(sp)

describe('microCausa · una regla por caso', () => {
  it('arranque: hasta 600 s después del fin de una parada de 600 s o más de esa Baader', () => {
    const r = clasificarMicros(entrada([parada(T, ARRANQUE_PARADA_MIN_S, 0), micro(T + 600 + 599, 15, 0)]))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ causa: 'arranque', fila: 0, duracionS: 15 })
    expect(sp(r[0]!.razones[0]!.texto)).toBe('desde que Ev 1 volvió a andar, tras 10 min detenida')
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('10 min')
    expect(r[0]!.razones[0]!.celdas).toEqual([])
  })

  it('arranque: una parada de menos de 600 s no abre el arranque', () => {
    const r = clasificarMicros(entrada([parada(T, ARRANQUE_PARADA_MIN_S - 1, 0), micro(T + 599 + 300, 15, 0)]))
    expect(r[0]!.causa).not.toBe('arranque')
  })

  it('arranque: 600 s o más después del fin de la pausa ya no lo es', () => {
    const r = clasificarMicros(entrada([parada(T, ARRANQUE_PARADA_MIN_S, 0), micro(T + 600 + ARRANQUE_VENTANA_S, 15, 0)]))
    expect(r[0]!.causa).not.toBe('arranque')
  })

  it('arranque: la pausa de otra Baader no cuenta', () => {
    const r = clasificarMicros(entrada([parada(T, 900, 1), micro(T + 900 + 60, 15, 0)]))
    expect(r[0]!.causa).not.toBe('arranque')
  })

  it('arranque: una pausa partida en dos registros contiguos se cuenta entera', () => {
    /* 400 s + 300 s seguidos = 700 s de pausa: cada pedazo solo no llega a 600 s, juntos sí. La micro cae 300 s después del fin. */
    const partida = [parada(T, 400, 0), parada(T + 400, 300, 0), micro(T + 700 + 300, 15, 0)]
    expect(clasificarMicros(entrada(partida))[0]!.causa).toBe('arranque')
    /* Lo mismo con registros que se solapan. */
    const solapada = [parada(T, 500, 0), parada(T + 300, 400, 0), micro(T + 700 + 300, 15, 0)]
    expect(clasificarMicros(entrada(solapada))[0]!.causa).toBe('arranque')
    /* Con un hueco entre los dos pedazos son dos paradas cortas: no abren arranque. */
    const conHueco = [parada(T, 400, 0), parada(T + 500, 300, 0), micro(T + 800 + 300, 15, 0)]
    expect(clasificarMicros(entrada(conHueco))[0]!.causa).not.toBe('arranque')
    /* Una micro pegada a la pausa no la une con ella (solo las detenciones que no son micro cuentan). */
    const conMicro = [parada(T, 400, 0), micro(T + 400, 200, 0), micro(T + 700 + 300, 15, 0)]
    expect(clasificarMicros(entrada(conMicro)).slice(-1)[0]!.causa).not.toBe('arranque')
  })

  it('arranque: el motivo de la pausa es el de su registro más largo, como lo muestra el monitor («Colación», no «COLACION»)', () => {
    const r = clasificarMicros(entrada([colacion(T, 3000, 0), parada(T + 3000, 120, 0), micro(T + 3120 + 200, 15, 0)]))
    expect(r[0]!.causa).toBe('arranque')
    expect(r[0]!.razones[0]!.detalle).toBe('Colación')
    expect(sp(r[0]!.razones[0]!.texto)).toBe('desde que Ev 1 volvió a andar, tras 52 min detenida')
  })

  it('arranque: los primeros 600 s del turno', () => {
    const r = clasificarMicros(entrada([micro(ARRANQUE_VENTANA_S - 15, 15, 2)]))
    expect(r[0]).toMatchObject({ causa: 'arranque', fila: 2 })
    expect(sp(r[0]!.razones[0]!.texto)).toBe('desde el inicio del turno')
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('9,8 min')
    expect(r[0]!.razones[0]!.detalle).toBe('09:15')
    expect(clasificarMicros(entrada([micro(ARRANQUE_VENTANA_S, 15, 2)]))[0]!.causa).not.toBe('arranque')
  })

  it('línea común: otra Baader marca micro con inicio a ±15 s (las dos quedan marcadas, y cada una cuenta a la otra)', () => {
    const r = clasificarMicros(entrada([micro(T, 15, 0), micro(T + LINEA_COMUN_TOL_S, 30, 2)]))
    expect(r.map((x) => x.causa)).toEqual(['linea', 'linea'])
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('2 de 3')
    expect(sp(r[0]!.razones[0]!.texto)).toBe('Baader pararon casi a la vez')
    expect(sp(r[0]!.razones[0]!.detalle)).toBe('Ev 1 15 s · Ev 3 30 s (15 s después)')
    expect(sp(r[1]!.razones[0]!.detalle)).toBe('Ev 3 30 s · Ev 1 15 s (15 s antes)')
    expect(r[0]!.razones[0]!.celdas).toEqual([{ fila: 0, d: 0 }, { fila: 2, d: 0 }])
  })

  it('línea común: en el mismo segundo lo dice; a más de 15 s ya no coincide', () => {
    const mismo = clasificarMicros(entrada([micro(T, 15, 0), micro(T, 30, 1)]))
    expect(sp(mismo[0]!.razones[0]!.texto)).toBe('Baader pararon en el mismo segundo')
    expect(sp(mismo[0]!.razones[0]!.detalle)).toBe('Ev 1 15 s · Ev 2 30 s')
    const lejos = clasificarMicros(entrada([micro(T, 15, 0), micro(T + LINEA_COMUN_TOL_S + 1, 15, 2)]))
    expect(lejos.map((x) => x.causa)).not.toContain('linea')
  })

  it('línea común: una detención NO programada de otra Baader a ±15 s también cuenta (aunque esa Baader no tenga micro)', () => {
    const r = clasificarMicros(entrada([micro(M30, 15, 0), parada(M30 + 5, 200, 2)]))
    expect(r).toHaveLength(1)
    expect(r[0]!.causa).toBe('linea')
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('2 de 3')
    expect(sp(r[0]!.razones[0]!.detalle)).toBe('Ev 1 15 s · Ev 3 3,3 min (detención) (5 s después)')
    /* Una detención de OTRA fila a más de 15 s, o de la misma Baader, no la hace común. */
    expect(clasificarMicros(entrada([micro(M30, 15, 0), parada(M30 + 20, 200, 2)]))[0]!.causa).not.toBe('linea')
    expect(clasificarMicros(entrada([micro(M30, 15, 0), parada(M30 + 5, 200, 0)]))[0]!.causa).not.toBe('linea')
  })

  it('línea común: una parada PROGRAMADA de otra Baader (colación…) no cuenta, y el globo lo dice en vez de afirmar que no paró nadie', () => {
    const r = clasificarMicros(entrada([micro(M30, 15, 0), colacion(M30 + 5, 200, 2)]))
    expect(r[0]!.causa).not.toBe('linea')
    const l = r[0]!.descartadas.find((d) => d.regla === 'linea')!
    expect(l.estado).toBe('no')
    expect(sp(l.texto)).toBe('ninguna otra Baader paró a ±15 s, salvo una parada programada: Ev 3 (Colación)')
  })

  it('línea común: no se parte en subtipos (micro con micro y micro con detención dan la misma causa)', () => {
    const conMicro = clasificarMicros(entrada([micro(M30, 15, 0), micro(M30, 15, 1)]))
    const conParo = clasificarMicros(entrada([micro(M30, 15, 0), parada(M30, 100, 1)]))
    expect(conMicro[0]!.causa).toBe('linea')
    expect(conParo[0]!.causa).toBe('linea')
    expect(ROTULO_CAUSA.linea).toBe('Línea común')
  })

  it('tras detención: hasta 120 s después del fin de una detención (no micro) de esa Baader', () => {
    const r = clasificarMicros(entrada([parada(T, 200, 1), micro(T + 200 + TRAS_DETENCION_S - 1, 15, 1)]))
    expect(r[0]).toMatchObject({ causa: 'paro', fila: 1 })
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('119 s')
    expect(sp(r[0]!.razones[0]!.texto)).toBe('desde que terminó una detención de 3,3 min')
    expect(r[0]!.razones[0]!.detalle).toBeNull()
    expect(clasificarMicros(entrada([parada(T, 200, 1), micro(T + 200 + TRAS_DETENCION_S, 15, 1)]))[0]!.causa).not.toBe('paro')
  })

  it('tras detención: otra micro anterior no abre la ventana (solo las detenciones que no son micro)', () => {
    const r = clasificarMicros(entrada([micro(T, 15, 1), micro(T + 15 + 30, 15, 1)]))
    expect(r.map((x) => x.causa)).toEqual(['sin', 'sin'])
  })

  it('sin contexto: el resto, con cada regla descartada y su cifra', () => {
    const r = clasificarMicros(entrada([micro(M30, 15, 0)]))
    expect(r[0]!.causa).toBe('sin')
    expect(r[0]!.razones).toEqual([])
    expect(r[0]!.descartadas.map((d) => [d.regla, d.estado, sp(d.texto)])).toEqual([
      ['arranque', 'no', 'no hubo pausas largas desde el inicio del turno (09:15)'],
      ['linea', 'no', 'ninguna otra Baader paró a ±15 s'],
      ['paro', 'no', 'no hubo detenciones antes de la micro'],
      ['ritmo', 'no', '18 de 18 en 09:44, el minuto antes: no bajó del 75 % de su ritmo'],
    ])
  })

  it('la última pausa larga y la última detención se dicen con su hora y su antigüedad', () => {
    const r = clasificarMicros(entrada([parada(T - 1800, 1200, 0), parada(T - 400, 60, 0), micro(T + 300, 15, 0)]))
    expect(r[0]!.causa).toBe('sin')
    expect(r[0]!.descartadas.find((d) => d.regla === 'arranque')!.texto).toBe('la última pausa larga terminó a las 09:35')
    /* La última detención terminó en T − 340 y la micro empieza en T + 300: 640 s = 10,7 min. */
    expect(sp(r[0]!.descartadas.find((d) => d.regla === 'paro')!.texto)).toBe('la última detención fue hace 10,7 min')
  })
})

describe('microCausa · ritmo bajo (regla 4)', () => {
  it('cumple: el minuto anterior anduvo ≥ 30 s y dio MENOS del 75 % de SU ritmo propio (no del esperado)', () => {
    /* Ev 2 (ritmo propio 16) da 11 en el minuto 29; la micro cae en el 30 a los 20 s. 11 < 0,75 × 16 = 12. Las otras vienen normales. */
    const r = clasificarMicros(entrada([micro(M30, 15, 1)], baja(11)))
    expect(r[0]).toMatchObject({ causa: 'ritmo', fila: 1 })
    expect(r[0]!.razones).toHaveLength(1)
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('11 de 16')
    expect(sp(r[0]!.razones[0]!.texto)).toBe('Ev 2 a las 09:44, el minuto antes')
    expect(sp(r[0]!.razones[0]!.detalle)).toBe('su ritmo de los últimos 15 min: 16 pz/min')
    expect(r[0]!.razones[0]!.celdas).toEqual([{ fila: 1, d: -1 }])
    expect(ROTULO_CAUSA.ritmo).toBe('Ritmo bajo')
    expect(RITMO_BAJO).toBe(0.75)
  })

  it('el corte es estricto: justo en 0,75 × ritmo no cuenta', () => {
    const justo = clasificarMicros(entrada([micro(M30, 15, 1)], baja(12)))
    expect(justo[0]!.causa).toBe('sin')
    expect(justo[0]!.descartadas.find((d) => d.regla === 'ritmo')).toMatchObject({ estado: 'no' })
    expect(clasificarMicros(entrada([micro(M30, 15, 1)], baja(11)))[0]!.causa).toBe('ritmo')
  })

  it('se mide contra el ritmo PROPIO: una Baader que siempre da 12 con esperado 16 no está «baja» con 10 (el 83 % de su ritmo)', () => {
    /* Contra el esperado, 10 < 0,75 × 16 = 12 sería «bajo»; contra su ritmo propio (12) el corte es 9: 10 es normal. */
    const s = serie(60, (j, k) => (j === 1 ? (k === 29 ? 10 : 12) : ESP[j]!))
    const r = clasificarMicros(entrada([micro(M30, 15, 1)], s))
    expect(r[0]!.causa).toBe('sin')
    expect(sp(r[0]!.descartadas.find((d) => d.regla === 'ritmo')!.texto)).toBe('10 de 12 en 09:44, el minuto antes: no bajó del 75 % de su ritmo')
    /* Y con 8 sí baja: 8 < 9. */
    expect(clasificarMicros(entrada([micro(M30, 15, 1)], serie(60, (j, k) => (j === 1 ? (k === 29 ? 8 : 12) : ESP[j]!))))[0]!.causa).toBe('ritmo')
  })

  it('el ritmo propio sale de los 15 minutos anteriores al medido (k−16 … k−2): ni el minuto medido, ni el k−17', () => {
    /* La micro está en el minuto 30; se mide el 29, así que la ventana es 14-28. Escalera: minuto 14 = 30, minutos 15-28 = 11 … 24. Su mediana alta
       (el 8.º de 15) es 18. Fuera de la ventana: el minuto 13 (= k−17) vale 0 y el medido (29) da 12. Si la ventana corriera un minuto a la
       izquierda (13-27) el ritmo saldría 17; a la derecha (15-29), también 17. */
    const s = serie(60, (j, k) => (j === 1 ? (k === 29 ? 12 : k === 13 ? 0 : k === 14 ? 30 : k >= 15 && k <= 28 ? k - 4 : 16) : ESP[j]!))
    const r = clasificarMicros(entrada([micro(M30, 15, 1)], s))
    expect(r[0]!.causa).toBe('ritmo')
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('12 de 18')
    expect(sp(r[0]!.razones[0]!.detalle)).toBe('su ritmo de los últimos 15 min: 18 pz/min')
  })

  it('con cantidad PAR de minutos válidos toma el valor alto de los dos del medio, no el promedio', () => {
    /* Minutos 14-20 a 12 y 21-28 a 16, y el 25 con una parada de 60 s (no cuenta): 14 valores, siete de 12 y siete de 16.
       Valor alto = 16 (corte 12: 11 baja); el promedio de los dos del medio daría 14 (corte 10,5: 11 no baja). */
    const s = serie(60, (j, k) => (j === 1 ? (k === 29 ? 11 : k <= 20 ? 12 : 16) : ESP[j]!))
    const r = clasificarMicros(entrada([parada(25 * 60, 60, 1), micro(M30, 15, 1)], s))
    expect(r[0]!.causa).toBe('ritmo')
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('11 de 16')
  })

  it('los minutos con una parada que los toca no entran al ritmo propio', () => {
    /* Siete minutos (14-20) con la Baader detenida casi todo el minuto y 1 pieza; los ocho válidos (21-28) dan 10, 12 … 24: su mediana alta es 18
       (corte 13,5, y 11 baja). Si los siete minutos con parada entraran, el ritmo propio caería a 10 (corte 7,5) y 11 ya no sería bajo. */
    const valido = [10, 12, 14, 16, 18, 20, 22, 24]
    const s = serie(60, (j, k) => (j === 1 ? (k === 29 ? 11 : k >= 21 ? valido[k - 21]! : 1) : ESP[j]!))
    const paradas = [14, 15, 16, 17, 18, 19, 20].map((k) => parada(k * 60 + 5, 50, 1))
    const r = clasificarMicros(entrada([...paradas, micro(M30, 15, 1)], s))
    expect(r[0]!.causa).toBe('ritmo')
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('11 de 18')
  })

  it('la vara es lo que daba ANDANDO: 30 s de micro en el minuto anterior bajan el listón a la mitad (y la cifra lo dice)', () => {
    /* Ev 2 tuvo una micro de 30 s en el minuto 29 (anduvo 30 s): la vara es 0,75 × 16 × 30/60 = 6. 7 piezas no es bajo; 5 sí. */
    const con = (piezas: number) => clasificarMicros(entrada([micro(29 * 60 + 10, 30, 1), micro(30 * 60 + 40, 15, 1)], serie(60, (j, k) => (j === 1 && k === 29 ? piezas : ESP[j]!)))).slice(-1)[0]!
    expect(con(7).causa).toBe('sin')
    expect(con(5).causa).toBe('ritmo')
    expect(sp(con(5).razones[0]!.cifra)).toBe('5 de 8')
    expect(sp(con(5).razones[0]!.texto)).toBe('Ev 2 a las 09:44, el minuto antes (anduvo 30 s)')
  })

  it('con menos de 30 s andando el minuto anterior no se evalúa (no hay dato de ritmo)', () => {
    /* Una micro de 45 s desde el segundo 5 del minuto 29: anduvo 15 s. */
    const r = clasificarMicros(entrada([micro(29 * 60 + 5, 45, 1), micro(30 * 60 + 40, 15, 1)], baja(0)))
    const q = r.slice(-1)[0]!
    expect(q.causa).toBe('sin')
    expect(q.descartadas.find((d) => d.regla === 'ritmo')).toMatchObject({ estado: 'sin' })
    expect(sp(q.descartadas.find((d) => d.regla === 'ritmo')!.texto)).toBe('no se evalúa: en 09:44 la Baader anduvo solo 15 s')
  })

  it('exige 8 minutos válidos para tener un ritmo propio; con menos, no se evalúa', () => {
    /* Sin arranque (el turno empezó una hora antes). Con la micro en el minuto 9 el minuto anterior es el 8 y el ritmo propio sale de los minutos 0-7: ocho. */
    const extra = { inicioTurnoMs: T0 - 3_600_000 }
    const enMinuto = (km: number) => clasificarMicros(entrada([micro(km * 60 + 20, 15, 1)], serie(12, (j, k) => (j === 1 && k === km - 1 ? 2 : ESP[j]!)), extra))[0]!
    expect(RITMO_MIN_MINUTOS).toBe(8)
    expect(enMinuto(RITMO_MIN_MINUTOS + 1).causa).toBe('ritmo')
    /* Un minuto antes solo hay siete. */
    const siete = enMinuto(RITMO_MIN_MINUTOS)
    expect(siete.causa).toBe('sin')
    expect(sp(siete.descartadas.find((d) => d.regla === 'ritmo')!.texto)).toBe('no se evalúa: no hay 8 minutos completos andando para medir su ritmo propio')
  })

  it('el corte de 15 s: si la micro empieza en :00-:14 la regla NO se evalúa; desde :15 sí', () => {
    const en = (seg: number) => clasificarMicros(entrada([micro(30 * 60 + seg, 15, 1)], baja(11)))[0]!
    expect(INICIO_MINUTO_S).toBe(15)
    for (const seg of [0, 1, 14]) {
      const q = en(seg)
      expect(q.causa).toBe('sin')
      expect(q.descartadas.find((d) => d.regla === 'ritmo')).toMatchObject({ estado: 'sin' })
    }
    for (const seg of [15, 16, 59]) expect(en(seg).causa).toBe('ritmo')
  })

  it('en :00-:14 el globo explica con palabras simples por qué no se evalúa, y dice «sale bajo» solo si el minuto anterior de verdad sale bajo', () => {
    const baj = clasificarMicros(entrada([micro(30 * 60 + 5, 15, 1)], baja(11)))[0]!
    expect(sp(baj.descartadas.find((d) => d.regla === 'ritmo')!.texto)).toBe(
      'no se evalúa: Shoplogix anotó la micro al empezar el minuto (09:45:05). La parada ya venía de antes, por eso el minuto 09:44 sale bajo',
    )
    const normal = clasificarMicros(entrada([micro(30 * 60 + 5, 15, 1)]))[0]!
    expect(sp(normal.descartadas.find((d) => d.regla === 'ritmo')!.texto)).toBe(
      'no se evalúa: Shoplogix anotó la micro al empezar el minuto (09:45:05). La parada ya venía de antes',
    )
  })

  it('con una sola Baader (Filete) no se rotula ni se evalúa, aunque el minuto anterior venga bajo', () => {
    const s = serie(60, (j, k) => (k === 29 ? 2 : ESP[j]!), 1)
    const r = clasificarMicros(entrada([micro(M30, 15, 0)], s))
    expect(RITMO_MIN_BAADER).toBe(2)
    expect(r[0]!.causa).toBe('sin')
    expect(r[0]!.descartadas.map((d) => d.regla)).toEqual(['arranque', 'paro', 'ritmo'])
    expect(r[0]!.descartadas.find((d) => d.regla === 'ritmo')).toMatchObject({ estado: 'sin', texto: 'no se usa en Filete: su ritmo cambia mucho y no explica las micro' })
    expect(r[0]!.tabla.filas).toHaveLength(1)
  })

  it('el minuto en curso (parcial) no sirve: solo cuentan los minutos que entregaron todas las Baader', () => {
    /* 31 minutos en Ev 2 (el 31º, el índice 30, es el minuto en curso y viene en 2) y 30 en las otras: la micro cae en el minuto 31 (a los 20 s),
       su minuto anterior es el parcial y no puede acusar a nadie. */
    const s = serie(30)
    s.maquinas[1]!.cycles.push(2)
    expect(s.maquinas[1]!.cycles).toHaveLength(31)
    const r = clasificarMicros(entrada([micro(31 * 60 + 20, 15, 1)], s))
    expect(r[0]).toMatchObject({ causa: 'sin', fila: 1, minuto: 31 })
    expect(sp(r[0]!.descartadas.find((d) => d.regla === 'ritmo')!.texto)).toBe('no se evalúa: todavía no hay datos del minuto anterior')
    expect(r[0]!.tabla.filas[1]!.piezas).toEqual([16, null, null, null])
    /* Contraste: con el minuto anterior ya entregado por las tres (31 elementos cada una), sí es ritmo bajo. */
    const completa = serie(31, (j, k) => (j === 1 && k === 30 ? 2 : ESP[j]!))
    expect(clasificarMicros(entrada([micro(31 * 60 + 20, 15, 1)], completa))[0]!.causa).toBe('ritmo')
  })

  it('una parada que sigue abierta (`enCurso`) cuenta como parada: la Baader no «anduvo» ese minuto', () => {
    /* Ev 3 lleva detenida desde el minuto 29 sin cerrar (no está en stopEvents). Sin `enCurso`, su minuto 30 bajo se leería «sin parada anotada». */
    const s = serie(60, (j, k) => (j === 2 && k >= 29 ? 0 : ESP[j]!))
    const sin = clasificarMicros(entrada([micro(M30, 15, 0)], s))
    expect(sin[0]!.razones.map((r) => sp(r.texto))).toContain('Ev 3 sin parada anotada en 09:45')
    const con = clasificarMicros(entrada([micro(M30, 15, 0)], s, { enCurso: [{ id: 'c', desdeMs: T0 + 29 * 60_000 }] }))
    expect(con[0]!.razones.map((r) => sp(r.texto))).not.toContain('Ev 3 sin parada anotada en 09:45')
  })
})

describe('microCausa · notas del globo (evidencia, nunca rótulo ni chip)', () => {
  it('«las tres venían bajo su ritmo»: todas las Baader cumplen c) y d) el minuto anterior y la micro no cae en :00-:14', () => {
    const tres = serie(60, (j, k) => (k === 29 ? Math.floor(ESP[j]! * 0.5) : ESP[j]!))
    const r = clasificarMicros(entrada([micro(M30, 15, 0)], tres))
    expect(r[0]!.causa).toBe('ritmo')
    expect(r[0]!.razones).toHaveLength(2)
    expect(sp(r[0]!.razones[1]!.cifra)).toBe('3 de 3')
    expect(sp(r[0]!.razones[1]!.texto)).toBe('las tres venían bajo su ritmo')
    expect(sp(r[0]!.razones[1]!.detalle)).toBe('en 09:44, el minuto antes')
    expect(r[0]!.razones[1]!.celdas).toEqual([{ fila: 0, d: -1 }, { fila: 1, d: -1 }, { fila: 2, d: -1 }])
    /* La nota va bajo cualquier causa, no solo bajo ritmo bajo: aquí gana la línea común. */
    const comun = clasificarMicros(entrada([micro(M30, 15, 0), micro(M30, 15, 1)], tres))
    expect(comun[0]!.causa).toBe('linea')
    expect(comun[0]!.razones.map((x) => sp(x.texto))).toContain('las tres venían bajo su ritmo')
    /* Con dos Baader dice «las dos». */
    const dos = serie(60, (j, k) => (k === 29 ? Math.floor(ESP[j]! * 0.5) : ESP[j]!), 2)
    const r2 = clasificarMicros(entrada([micro(M30, 15, 0)], dos))
    expect(sp(r2[0]!.razones[1]!.cifra)).toBe('2 de 2')
    expect(sp(r2[0]!.razones[1]!.texto)).toBe('las dos venían bajo su ritmo')
    /* Si la micro cae en :00-:14 la regla no se evalúa y la nota tampoco. */
    const temprano = clasificarMicros(entrada([micro(30 * 60 + 5, 15, 0)], tres))
    expect(temprano[0]!.razones.map((x) => sp(x.texto))).not.toContain('las tres venían bajo su ritmo')
    /* Con una Baader sin bajar, no hay nota. */
    const unaNormal = serie(60, (j, k) => (k === 29 && j !== 2 ? Math.floor(ESP[j]! * 0.5) : ESP[j]!))
    expect(clasificarMicros(entrada([micro(M30, 15, 0)], unaNormal))[0]!.razones.map((x) => sp(x.texto))).not.toContain('las tres venían bajo su ritmo')
  })

  it('«Ev X sin parada anotada · posible micro de 0 s»: otra Baader que en el minuto de la micro anduvo 60 s y dio menos del 75 % de su ritmo propio', () => {
    const s = serie(60, (j, k) => (j === 2 && k === 30 ? 5 : ESP[j]!))
    const r = clasificarMicros(entrada([micro(M30, 15, 0)], s))
    expect(r[0]!.causa).toBe('sin')
    expect(r[0]!.razones).toHaveLength(1)
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('5 de 16')
    expect(sp(r[0]!.razones[0]!.texto)).toBe('Ev 3 sin parada anotada en 09:45')
    expect(r[0]!.razones[0]!.detalle).toBe('posible micro de 0 s')
    expect(r[0]!.razones[0]!.celdas).toEqual([{ fila: 2, d: 0 }])
    /* Con una parada anotada que toque ese minuto (aunque sea de 10 s) ya no es «sin parada anotada». */
    const conParada = clasificarMicros(entrada([micro(M30, 15, 0), micro(30 * 60 + 45, 15, 2)], s))
    expect(conParada[0]!.razones.map((x) => sp(x.texto))).not.toContain('Ev 3 sin parada anotada en 09:45')
    /* Justo en el 75 % de su ritmo (12 de 16) no baja; y el minuto en que no hay dato (parcial) tampoco acusa a nadie. */
    expect(clasificarMicros(entrada([micro(M30, 15, 0)], serie(60, (j, k) => (j === 2 && k === 30 ? 12 : ESP[j]!))))[0]!.razones).toEqual([])
    const parcial = serie(31, (j, k) => (j === 2 && k === 30 ? 0 : ESP[j]!))
    parcial.maquinas[2]!.cycles.pop()
    expect(clasificarMicros(entrada([micro(M30, 15, 0)], parcial))[0]!.razones).toEqual([])
  })

  it('cada razón con celdas lleva su número en la tabla: numerosPorCelda reparte ① ② por Baader y minuto', () => {
    const s = serie(60, (j, k) => (j === 2 && k === 30 ? 5 : ESP[j]!))
    const r = clasificarMicros(entrada([micro(M30, 15, 0), micro(M30 + 5, 15, 1)], s))
    const q = r.find((x) => x.fila === 0)!
    expect(q.causa).toBe('linea')
    expect(q.razones.map((x) => x.celdas.length)).toEqual([2, 1])
    expect([...numerosPorCelda(q).entries()]).toEqual([['0:0', [1]], ['1:0', [1]], ['2:0', [2]]])
  })
})

describe('microCausa · precedencia', () => {
  it('arranque gana a línea común, tras detención y ritmo bajo', () => {
    /* Parada larga de Ev 1 (T → T + 700); 100 s después, micro de Ev 1 y de Ev 2 a la vez (minuto 43). El minuto anterior (42) viene bajo
       en las tres: sin el arranque, la de Ev 1 saldría línea común. */
    const s = serie(60, (j, k) => (k === 42 ? 3 : ESP[j]!))
    const seg = T + 700 + 100
    expect(Math.floor(seg / 60)).toBe(43)
    const r = clasificarMicros(entrada([parada(T, 700, 0), micro(seg, 15, 0), micro(seg, 15, 1)], s))
    expect(r.find((x) => x.fila === 0)!.causa).toBe('arranque')
    /* Contraste: la micro de Ev 2 a la misma hora NO es arranque (la pausa fue de Ev 1): sale línea común. */
    expect(r.find((x) => x.fila === 1)!.causa).toBe('linea')
    /* Y sin la pausa larga, la de Ev 1 ya no es arranque. */
    const sinPausa = clasificarMicros(entrada([micro(seg, 15, 0), micro(seg, 15, 1)], s))
    expect(sinPausa.map((x) => x.causa)).toEqual(['linea', 'linea'])
  })

  it('línea común gana a tras detención y a ritmo bajo; una regla que se cumple pero pierde por orden NO se lista como ✕', () => {
    const s = serie(60, (j, k) => (k === 29 ? 3 : ESP[j]!))
    const r = clasificarMicros(entrada([parada(T - 100, 60, 1), micro(M30, 15, 1), micro(M30 + 5, 15, 2)], s))
    const q = r.find((x) => x.fila === 1)!
    expect(q.causa).toBe('linea')
    /* Tras detención se cumple (terminó hace 80 s) y ritmo bajo también, pero perdieron por precedencia: no son «descartadas». */
    expect(q.descartadas.map((d) => d.regla)).toEqual(['arranque'])
  })

  it('tras detención gana a ritmo bajo', () => {
    const s = serie(60, (j, k) => (k === 29 ? 3 : ESP[j]!))
    /* La detención terminó 80 s antes de la micro (menos de 120 s), y el minuto anterior viene bajo: gana tras detención. */
    const r = clasificarMicros(entrada([parada(T - 160, 100, 0), micro(M30, 15, 0)], s))
    expect(r[0]!.causa).toBe('paro')
  })
})

describe('microCausa · la tabla por Baader', () => {
  it('trae los minutos k−2 a k+1 de cada Baader con su esperado, marca la fila de la micro y las micro del minuto k (▼ en el color de SU causa)', () => {
    const s = serie(60, (j, k) => 100 * (j + 1) + k)
    const r = clasificarMicros(entrada([micro(M30, 15, 0), micro(30 * 60 + 30, 15, 1)], s))
    const q = r[0]!
    expect(q.minuto).toBe(30)
    expect(q.tabla.horas).toEqual(['09:43', '09:44', '09:45', '09:46'])
    expect(q.tabla.filas.map((f) => [f.nombre, f.esperado, f.ella, ...f.piezas])).toEqual([
      ['Ev 1', 18, true, 128, 129, 130, 131],
      ['Ev 2', 16, false, 228, 229, 230, 231],
      ['Ev 3', 16, false, 328, 329, 330, 331],
    ])
    expect(q.tabla.filas.map((f) => f.microEnK)).toEqual(['linea', 'linea', null])
    expect(q.tabla.filas.every((f) => !f.inicioPrevio)).toBe(true)
    expect(q.tabla.leyendaInicio).toBeNull()
  })

  it('▽ en el minuto k−1 de cada Baader cuya micro cae en :00-:14 (la propia o una simultánea), con su leyenda', () => {
    const r = clasificarMicros(entrada([micro(T + 5, 15, 0), micro(T + 10, 15, 1), micro(T + 40, 15, 2)]))
    const q = r.find((x) => x.fila === 0)!
    expect(q.tabla.filas.map((f) => f.inicioPrevio)).toEqual([true, true, false])
    expect(sp(q.tabla.leyendaInicio)).toBe('ya estaba parando (Shoplogix lo anota después)')
    /* La micro de Ev 3 a los 40 s no lleva ▽ ni su globo la leyenda. */
    const tercera = r.find((x) => x.fila === 2)!
    expect(tercera.tabla.filas.map((f) => f.inicioPrevio)).toEqual([true, true, false])
  })

  it('en los bordes de la serie el minuto que no existe es null', () => {
    const r = clasificarMicros(entrada([micro(T, 15, 0)], serie(31)))
    expect(r[0]!.tabla.filas[0]!.piezas).toEqual([18, 18, 18, null])
    expect(clasificarMicros(entrada([micro(5, 15, 0)], serie(5)))[0]!.tabla.filas[0]!.piezas).toEqual([null, null, 18, 18])
  })

  it('«real estimado» = lo anotado + ~20 s', () => {
    expect(realEstimadoS(15)).toBe(35)
  })
})

describe('microCausa · el inicio del turno', () => {
  it('el inicio del turno puede ser distinto del inicio de la serie: los 10 min de arranque cuentan desde `inicioTurnoMs`', () => {
    /* La serie parte en T0; el turno (o la primera pieza) en T0 + 1200 s. Una micro en T0 + 1300 s está a 100 s del inicio. */
    const inicio = T0 + 1200_000
    const r = clasificarMicros(entrada([micro(1300, 15, 0)], serie(), { inicioTurnoMs: inicio }))
    expect(r[0]!.causa).toBe('arranque')
    expect(r[0]!.razones[0]!.detalle).toBe('09:35')
    /* Con el inicio en T0 esa misma micro (a 1300 s) ya no es arranque. */
    expect(clasificarMicros(entrada([micro(1300, 15, 0)]))[0]!.causa).toBe('sin')
    /* Y a 600 s o más del inicio del turno (no de la serie) deja de serlo. */
    expect(clasificarMicros(entrada([micro(1200 + ARRANQUE_VENTANA_S, 15, 0)], serie(), { inicioTurnoMs: inicio }))[0]!.causa).toBe('sin')
  })
})

describe('microCausa · sin datos y textos', () => {
  it('sin serie, sin stopMachines, sin eventos o con un evento sin máquina: lista vacía', () => {
    expect(clasificarMicros({ serie: null, stopEvents: [micro(T, 15, 0)], stopMachines: ids, stopReasons: ['Detencion', 'Micro Detencion'], inicioTurnoMs: T0 })).toEqual([])
    expect(clasificarMicros(entrada([micro(T, 15, 0)], serie(), { stopMachines: [] }))).toEqual([])
    expect(clasificarMicros(entrada([]))).toEqual([])
    expect(clasificarMicros(entrada(null))).toEqual([])
    expect(clasificarMicros(entrada([{ r: 1, f: iso(T), s: 15 }]))).toEqual([])
  })

  it('ignora lo que no es micro y los eventos de 0 s; el nombre de la razón llega con acentos inconsistentes', () => {
    const e = entrada([parada(T, 100, 0), { r: 1, f: iso(T + 500), s: 0, m: 0 }, micro(T + 900, 15, 0)])
    e.stopReasons = ['Detención', 'Micro Detención']
    const r = clasificarMicros(e)
    expect(r).toHaveLength(1)
    expect(r[0]!.duracionS).toBe(15)
  })

  it('cuenta por causa en el orden de las chips', () => {
    const r = clasificarMicros(entrada([micro(5, 15, 0), micro(T, 15, 0), micro(T + 600, 15, 1)]))
    expect(contarPorCausa(r)).toEqual({ arranque: 1, linea: 0, paro: 0, ritmo: 0, sin: 2 })
    expect([...CAUSAS_MICRO]).toEqual(['arranque', 'linea', 'paro', 'ritmo', 'sin'])
    expect(CAUSAS_MICRO.map((c) => ROTULO_CAUSA[c])).toEqual(['Arranque', 'Línea común', 'Tras detención', 'Ritmo bajo', 'Sin contexto'])
  })

  it('ninguna micro dice «falta de pescado», «baja velocidad», «carros» ni «venían lentas»', () => {
    const s = serie(60, (j, k) => (k === 29 ? Math.floor(ESP[j]! * 0.5) : ESP[j]!))
    const todas = clasificarMicros(entrada([micro(M30, 15, 0), micro(M30, 15, 1), parada(T - 400, 200, 2), micro(T + 5, 15, 2), micro(5, 15, 0), micro(T + 700, 30, 1)], s))
    expect(todas.length).toBeGreaterThan(4)
    for (const q of todas) for (const t of textos(q)) expect(t).not.toMatch(PROHIBIDAS)
  })

  it('el motivo de una parada se muestra como en el resto del monitor, sin mayúsculas sostenidas, y la detención sin motivo no dice nada', () => {
    expect(motivoLegible('COLACION')).toBe('Colación')
    expect(motivoLegible('EJERCICIO COMPENSATORIO - Paro')).toBe('Ejercicio compensatorio - Paro')
    expect(motivoLegible('REUNION INICIO TURNO')).toBe('Reunión inicio turno')
    expect(motivoLegible('Planta De Riles')).toBe('Planta de riles')
    expect(motivoLegible('Detencion')).toBeNull()
    expect(motivoLegible('  ')).toBeNull()
    expect(motivoLegible(null)).toBeNull()
  })
})
