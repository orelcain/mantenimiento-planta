import { describe, expect, it } from 'vitest'
import {
  ARRANQUE_PARADA_MIN_S, ARRANQUE_VENTANA_S, ATRASO_ANOTA, CAUSAS_MICRO, DEFINICION_CAUSA, INICIO_MINUTO_S, LINEA_COMUN_TOL_S, RITMO_BAJO, RITMO_MIN_BAADER, RITMO_MIN_MINUTOS, ROTULO_CAUSA, TRAS_DETENCION_S,
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
const textos = (q: MicroClasificada) => [...q.razones.flatMap((r) => [r.cifra, r.texto, r.detalle ?? '']), ...q.descartadas.flatMap((d) => [d.titulo, d.texto]), q.tabla.leyendaInicio ?? ''].map(sp)
/** Lo que es una inferencia por el atraso de Shoplogix y NO puede decirse como hecho: tiene que ser «probablemente» o «pudo». */
const COMO_HECHO = /ya venía de antes|ya estaba parando|la parada ya venía/i
/** Una micro con milisegundos: `ms` desde el inicio de la serie (los inicios de Shoplogix traen ruido de milisegundos). */
const microMs = (ms: number, s: number, m: number) => ({ r: 1, f: new Date(T0 + ms).toISOString(), s, m })

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
    expect(sp(r[0]!.razones[0]!.texto)).toBe('Baader con micro anotada casi a la vez (hasta 15 s de diferencia)')
    expect(sp(r[0]!.razones[0]!.detalle)).toBe('Ev 1 15 s · Ev 3 30 s, empezó 15 s después')
    expect(sp(r[1]!.razones[0]!.detalle)).toBe('Ev 3 30 s · Ev 1 15 s, empezó 15 s antes')
    expect(r[0]!.razones[0]!.celdas).toEqual([{ fila: 0, d: 0 }, { fila: 2, d: 0 }])
  })

  it('línea común: a la misma hora lo dice con la hora; a más de 15 s ya no coincide', () => {
    const mismo = clasificarMicros(entrada([micro(T, 15, 0), micro(T, 30, 1)]))
    expect(sp(mismo[0]!.razones[0]!.texto)).toBe('Baader con micro anotada a la misma hora')
    expect(sp(mismo[0]!.razones[0]!.detalle)).toBe('Ev 1 15 s · Ev 2 30 s')
    const lejos = clasificarMicros(entrada([micro(T, 15, 0), micro(T + LINEA_COMUN_TOL_S + 1, 15, 2)]))
    expect(lejos.map((x) => x.causa)).not.toContain('linea')
  })

  it('línea común: el ±15 s se compara AL SEGUNDO (decisión de Mantención, ver LINEA_COMUN_TOL_S): 15 s entra aunque sean 15,999 s crudos, 16 s no', () => {
    /* Los inicios de Shoplogix van de a un paso de 15 s con ruido de milisegundos: al milisegundo, dos paradas a un paso entraban o no según 2 a 9 ms. */
    const t = T * 1000
    const causas = (a: number, b: number) => clasificarMicros(entrada([microMs(a, 15, 0), microMs(b, 15, 2)])).map((x) => x.causa)
    expect(causas(t, t + 15_000)).toEqual(['linea', 'linea'])
    expect(causas(t, t + 15_002)).toEqual(['linea', 'linea'])
    expect(causas(t, t + 15_999)).toEqual(['linea', 'linea'])
    expect(causas(t, t + 16_000)).not.toContain('linea')
    expect(causas(t + 999, t + 16_000)).not.toContain('linea')
    /* Hacia atrás es igual. */
    expect(causas(t, t - 15_000)).toEqual(['linea', 'linea'])
    expect(causas(t + 999, t - 15_000)).toEqual(['linea', 'linea'])
    expect(causas(t, t - 15_001)).not.toContain('linea')
    /* El globo dice la diferencia al segundo, la misma con la que se decide: 14,053 s crudos son «15 s», no «14 s». */
    const r = clasificarMicros(entrada([microMs(t + 949, 15, 0), microMs(t + 15_002, 15, 2)]))
    expect(r.map((x) => x.causa)).toEqual(['linea', 'linea'])
    expect(sp(r[0]!.razones[0]!.texto)).toBe('Baader con micro anotada casi a la vez (hasta 15 s de diferencia)')
    expect(sp(r[0]!.razones[0]!.detalle)).toBe('Ev 1 15 s · Ev 3 15 s, empezó 15 s después')
  })

  it('línea común: una detención NO programada de otra Baader a ±15 s también cuenta (aunque esa Baader no tenga micro)', () => {
    const r = clasificarMicros(entrada([micro(M30, 15, 0), parada(M30 + 5, 200, 2)]))
    expect(r).toHaveLength(1)
    expect(r[0]!.causa).toBe('linea')
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('2 de 3')
    expect(sp(r[0]!.razones[0]!.texto)).toBe('Baader con parada anotada casi a la vez (hasta 5 s de diferencia)')
    expect(sp(r[0]!.razones[0]!.detalle)).toBe('Ev 1 micro de 15 s · Ev 3 detención de 3 min 20 s, empezó 5 s después')
    /* Una detención de OTRA fila a más de 15 s, o de la misma Baader, no la hace común. */
    expect(clasificarMicros(entrada([micro(M30, 15, 0), parada(M30 + 20, 200, 2)]))[0]!.causa).not.toBe('linea')
    expect(clasificarMicros(entrada([micro(M30, 15, 0), parada(M30 + 5, 200, 0)]))[0]!.causa).not.toBe('linea')
  })

  it('línea común: una parada PROGRAMADA de otra Baader (colación…) no cuenta, y el globo lo dice en vez de afirmar que no paró nadie', () => {
    const r = clasificarMicros(entrada([micro(M30, 15, 0), colacion(M30 + 5, 200, 2)]))
    expect(r[0]!.causa).not.toBe('linea')
    const l = r[0]!.descartadas.find((d) => d.regla === 'linea')!
    expect(l.estado).toBe('no')
    expect(sp(l.titulo)).toBe('No es línea común:')
    expect(sp(l.texto)).toBe('ninguna otra Baader tuvo micro ni detención no programada en los 15 s antes o después (Ev 3 paró, pero era programada: Colación)')
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
    expect(sp(r[0]!.razones[0]!.texto)).toBe('desde que terminó una detención de 3 min 20 s')
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
    expect(r[0]!.descartadas.map((d) => [d.regla, d.estado, sp(d.titulo), sp(d.texto)])).toEqual([
      ['arranque', 'no', 'No es arranque:', 'ya pasaron 10 min desde que empezó el turno (09:15) y Ev 1 no tuvo detenciones de 10 min o más'],
      ['linea', 'no', 'No es línea común:', 'ninguna otra Baader tuvo micro ni detención en los 15 s antes o después'],
      ['paro', 'no', 'No es tras detención:', 'Ev 1 no tuvo detenciones antes de la micro'],
      ['ritmo', 'no', 'No es ritmo bajo:', '18 de 18 pz en el minuto 09:44, el anterior a la micro: no bajó del 75 % de su ritmo normal'],
    ])
  })

  it('la última pausa larga y la última detención se dicen con su hora y su antigüedad, cada una con su límite', () => {
    const r = clasificarMicros(entrada([parada(T - 1800, 1200, 0), parada(T - 400, 60, 0), micro(T + 300, 15, 0)]))
    expect(r[0]!.causa).toBe('sin')
    expect(sp(r[0]!.descartadas.find((d) => d.regla === 'arranque')!.texto)).toBe('la última detención de 10 min o más de Ev 1 terminó a las 09:35')
    /* La última detención terminó en T − 340 y la micro empieza en T + 300: 640 s = 10,7 min. */
    expect(sp(r[0]!.descartadas.find((d) => d.regla === 'paro')!.texto)).toBe('la última detención de Ev 1 terminó hace 10,7 min')
  })
})

describe('microCausa · ritmo bajo (regla 4)', () => {
  it('cumple: el minuto anterior anduvo ≥ 30 s y dio MENOS del 75 % de SU ritmo propio (no del esperado)', () => {
    /* Ev 2 (ritmo propio 16) da 11 en el minuto 29; la micro cae en el 30 a los 20 s. 11 < 0,75 × 16 = 12. Las otras vienen normales. */
    const r = clasificarMicros(entrada([micro(M30, 15, 1)], baja(11)))
    expect(r[0]).toMatchObject({ causa: 'ritmo', fila: 1 })
    expect(r[0]!.razones).toHaveLength(1)
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('11 de 16 pz')
    expect(sp(r[0]!.razones[0]!.texto)).toBe('Ev 2 en el minuto 09:44, el minuto anterior a la micro')
    expect(sp(r[0]!.razones[0]!.detalle)).toBe('Su ritmo normal (15 min previos, sin paradas): 16 pz/min. Menos de 12 (el 75 %) cuenta como poco.')
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
    expect(sp(r[0]!.descartadas.find((d) => d.regla === 'ritmo')!.texto)).toBe('10 de 12 pz en el minuto 09:44, el anterior a la micro: no bajó del 75 % de su ritmo normal')
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
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('12 de 18 pz')
    expect(sp(r[0]!.razones[0]!.detalle)).toBe('Su ritmo normal (15 min previos, sin paradas): 18 pz/min. Menos de 13,5 (el 75 %) cuenta como poco.')
  })

  it('con cantidad PAR de minutos válidos toma el valor alto de los dos del medio, no el promedio', () => {
    /* Minutos 14-20 a 12 y 21-28 a 16, y el 25 con una parada de 60 s (no cuenta): 14 valores, siete de 12 y siete de 16.
       Valor alto = 16 (corte 12: 11 baja); el promedio de los dos del medio daría 14 (corte 10,5: 11 no baja). */
    const s = serie(60, (j, k) => (j === 1 ? (k === 29 ? 11 : k <= 20 ? 12 : 16) : ESP[j]!))
    const r = clasificarMicros(entrada([parada(25 * 60, 60, 1), micro(M30, 15, 1)], s))
    expect(r[0]!.causa).toBe('ritmo')
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('11 de 16 pz')
  })

  it('los minutos con una parada que los toca no entran al ritmo propio', () => {
    /* Siete minutos (14-20) con la Baader detenida casi todo el minuto y 1 pieza; los ocho válidos (21-28) dan 10, 12 … 24: su mediana alta es 18
       (corte 13,5, y 11 baja). Si los siete minutos con parada entraran, el ritmo propio caería a 10 (corte 7,5) y 11 ya no sería bajo. */
    const valido = [10, 12, 14, 16, 18, 20, 22, 24]
    const s = serie(60, (j, k) => (j === 1 ? (k === 29 ? 11 : k >= 21 ? valido[k - 21]! : 1) : ESP[j]!))
    const paradas = [14, 15, 16, 17, 18, 19, 20].map((k) => parada(k * 60 + 5, 50, 1))
    const r = clasificarMicros(entrada([...paradas, micro(M30, 15, 1)], s))
    expect(r[0]!.causa).toBe('ritmo')
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('11 de 18 pz')
  })

  it('la vara es lo que daba ANDANDO: 30 s de micro en el minuto anterior bajan el listón a la mitad (y la cifra lo dice)', () => {
    /* Ev 2 tuvo una micro de 30 s en el minuto 29 (anduvo 30 s): la vara es 0,75 × 16 × 30/60 = 6. 7 piezas no es bajo; 5 sí. */
    const con = (piezas: number) => clasificarMicros(entrada([micro(29 * 60 + 10, 30, 1), micro(30 * 60 + 40, 15, 1)], serie(60, (j, k) => (j === 1 && k === 29 ? piezas : ESP[j]!)))).slice(-1)[0]!
    expect(con(7).causa).toBe('sin')
    expect(con(5).causa).toBe('ritmo')
    expect(sp(con(5).razones[0]!.cifra)).toBe('5 de 8 pz')
    expect(sp(con(5).razones[0]!.texto)).toBe('Ev 2 en el minuto 09:44, el minuto anterior a la micro (anduvo 30 s)')
    /* El «de 8» se explica: es su ritmo normal escalado por los segundos que anduvo, y el corte baja en proporción (6 = el 75 % de 8). */
    expect(sp(con(5).razones[0]!.detalle)).toBe('Su ritmo normal (15 min previos, sin paradas): 16 pz/min, o sea 8 pz en los 30 s que anduvo. Menos de 6 (el 75 %) cuenta como poco.')
  })

  it('con menos de 30 s andando el minuto anterior no se evalúa (no hay dato de ritmo)', () => {
    /* Una micro de 45 s desde el segundo 5 del minuto 29: anduvo 15 s. */
    const r = clasificarMicros(entrada([micro(29 * 60 + 5, 45, 1), micro(30 * 60 + 40, 15, 1)], baja(0)))
    const q = r.slice(-1)[0]!
    expect(q.causa).toBe('sin')
    expect(q.descartadas.find((d) => d.regla === 'ritmo')).toMatchObject({ estado: 'sin' })
    expect(sp(q.descartadas.find((d) => d.regla === 'ritmo')!.titulo)).toBe('No se revisó «ritmo bajo»:')
    expect(sp(q.descartadas.find((d) => d.regla === 'ritmo')!.texto)).toBe('en el minuto 09:44 Ev 2 anduvo solo 15 s (hacen falta 30 s para medir su ritmo)')
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
    expect(sp(siete.descartadas.find((d) => d.regla === 'ritmo')!.texto)).toBe('Ev 2 no tiene 8 minutos completos andando entre los 15 anteriores para saber su ritmo normal')
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

  it('en :00-:14 el globo explica con palabras simples por qué no se revisó, y lo dice como probable (inferencia por el atraso de Shoplogix), venga o no bajo el minuto anterior', () => {
    const texto = 'Shoplogix anota con 15 a 30 s de atraso y la micro quedó en los primeros 15 s del minuto: probablemente empezó en el minuto 09:44, así que ese minuto no se puede comparar con su ritmo normal'
    /* Con el minuto anterior bajo (11 < 12) y con uno normal, el texto es el mismo: la regla no se revisó y no se agrega «por eso sale bajo». */
    for (const s of [baja(11), serie()]) {
      const q = clasificarMicros(entrada([micro(30 * 60 + 5, 15, 1)], s))[0]!
      const d = q.descartadas.find((x) => x.regla === 'ritmo')!
      expect(d).toMatchObject({ estado: 'sin' })
      expect(sp(d.titulo)).toBe('No se revisó «ritmo bajo»:')
      expect(sp(d.texto)).toBe(texto)
      for (const t of textos(q)) expect(t).not.toMatch(COMO_HECHO)
    }
  })

  it('el ▽ y su leyenda hablan de una parada que PUDO empezar antes, no de una que «ya estaba parando»', () => {
    const q = clasificarMicros(entrada([micro(30 * 60 + 5, 15, 1)]))[0]!
    expect(q.tabla.filas.map((f) => f.inicioPrevio)).toEqual([false, true, false])
    expect(sp(q.tabla.leyendaInicio)).toBe('la parada pudo empezar en este minuto (Shoplogix la anota con 15 a 30 s de atraso)')
    expect(sp(q.tabla.leyendaInicio)).not.toMatch(COMO_HECHO)
  })

  it('con una sola Baader (Filete) no se rotula ni se evalúa, aunque el minuto anterior venga bajo', () => {
    const s = serie(60, (j, k) => (k === 29 ? 2 : ESP[j]!), 1)
    const r = clasificarMicros(entrada([micro(M30, 15, 0)], s))
    expect(RITMO_MIN_BAADER).toBe(2)
    expect(r[0]!.causa).toBe('sin')
    expect(r[0]!.descartadas.map((d) => d.regla)).toEqual(['arranque', 'paro', 'ritmo'])
    /* El motivo es el que se midió (la mayoría de los minutos de Filete ya va bajo lo esperado), y no se escribe «Filete» como si fuera el nombre de este doc. */
    expect(r[0]!.descartadas.find((d) => d.regla === 'ritmo')).toMatchObject({
      estado: 'sin',
      titulo: '«Ritmo bajo» no se usa con una sola Baader:',
      texto: 'en Filete la mayoría de los minutos ya va bajo lo esperado y no serviría para explicar una micro',
    })
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
    /* La micro es del minuto 31 (09:46); su minuto anterior es el 30 (09:45), el parcial. */
    expect(sp(r[0]!.descartadas.find((d) => d.regla === 'ritmo')!.texto)).toBe('todavía no cierra el minuto anterior (09:45)')
    expect(r[0]!.tabla.filas[1]!.piezas).toEqual([16, null, null, null])
    /* Contraste: con el minuto anterior ya entregado por las tres (31 elementos cada una), sí es ritmo bajo. */
    const completa = serie(31, (j, k) => (j === 1 && k === 30 ? 2 : ESP[j]!))
    expect(clasificarMicros(entrada([micro(31 * 60 + 20, 15, 1)], completa))[0]!.causa).toBe('ritmo')
  })

  it('una parada que sigue abierta (`enCurso`) cuenta como parada: la Baader no «anduvo» ese minuto', () => {
    /* Ev 3 lleva detenida desde el minuto 29 sin cerrar (no está en stopEvents). Sin `enCurso`, su minuto 30 bajo se leería «sin parada anotada». */
    const s = serie(60, (j, k) => (j === 2 && k >= 29 ? 0 : ESP[j]!))
    const sin = clasificarMicros(entrada([micro(M30, 15, 0)], s))
    expect(sin[0]!.razones.map((r) => sp(r.texto))).toContain('Ev 3 también bajó en el minuto 09:45 (esperado: 16)')
    const con = clasificarMicros(entrada([micro(M30, 15, 0)], s, { enCurso: [{ id: 'c', desdeMs: T0 + 29 * 60_000 }] }))
    expect(con[0]!.razones.map((r) => sp(r.texto))).not.toContain('Ev 3 también bajó en el minuto 09:45 (esperado: 16)')
  })

  it('el inicio de la micro antes del minuto 1 de la serie: sin minuto anterior, la serie «empieza ahí» (no «todavía» no hay datos)', () => {
    /* Sin arranque (el turno empezó hace una hora) y con la micro en el minuto 0 de la serie, a los 20 s: k − 1 = −1. */
    const r = clasificarMicros(entrada([micro(20, 15, 1)], serie(), { inicioTurnoMs: T0 - 3_600_000 }))
    const d = r[0]!.descartadas.find((x) => x.regla === 'ritmo')!
    expect(d).toMatchObject({ estado: 'sin' })
    expect(sp(d.texto)).toBe('la serie del turno empieza ahí: no hay minuto anterior')
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

  it('«Ev X también bajó · sin parada anotada: posible micro de 0 s»: otra Baader que en el minuto de la micro anduvo 60 s y dio menos del 75 % de su ritmo propio', () => {
    const s = serie(60, (j, k) => (j === 2 && k === 30 ? 5 : ESP[j]!))
    const r = clasificarMicros(entrada([micro(M30, 15, 0)], s))
    expect(r[0]!.causa).toBe('sin')
    expect(r[0]!.razones).toHaveLength(1)
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('5 de 16 pz')
    expect(sp(r[0]!.razones[0]!.texto)).toBe('Ev 3 también bajó en el minuto 09:45 (esperado: 16)')
    expect(sp(r[0]!.razones[0]!.detalle)).toBe('sin parada anotada: posible micro muy corta (de 0 s)')
    expect(r[0]!.razones[0]!.celdas).toEqual([{ fila: 2, d: 0 }])
    /* Con una parada anotada que toque ese minuto (aunque sea de 10 s) ya no es «sin parada anotada». */
    const conParada = clasificarMicros(entrada([micro(M30, 15, 0), micro(30 * 60 + 45, 15, 2)], s))
    expect(conParada[0]!.razones.map((x) => sp(x.texto))).not.toContain('Ev 3 también bajó en el minuto 09:45 (esperado: 16)')
    /* Justo en el 75 % de su ritmo (12 de 16) no baja; y el minuto en que no hay dato (parcial) tampoco acusa a nadie. */
    expect(clasificarMicros(entrada([micro(M30, 15, 0)], serie(60, (j, k) => (j === 2 && k === 30 ? 12 : ESP[j]!))))[0]!.razones).toEqual([])
    const parcial = serie(31, (j, k) => (j === 2 && k === 30 ? 0 : ESP[j]!))
    parcial.maquinas[2]!.cycles.pop()
    expect(clasificarMicros(entrada([micro(M30, 15, 0)], parcial))[0]!.razones).toEqual([])
  })

  it('«las tres venían bajo su ritmo» no cuenta a una Baader que anduvo menos de 30 s el minuto anterior (sin dato de ritmo no hay «bajo»)', () => {
    /* Ev 1 y Ev 2 vienen a la mitad en el minuto 29. Ev 3 estuvo detenida 45 s de ese minuto (anduvo 15 s) y dio 0: con menos de 30 s andando
       no se mide su ritmo, así que no es «bajo» y la nota no sale (con ANDANDO_MIN_S en 0 saldría: 0 < 0,75 × 16 × 15/60). */
    const s = serie(60, (j, k) => (k === 29 ? (j === 2 ? 0 : Math.floor(ESP[j]! * 0.5)) : ESP[j]!))
    const r = clasificarMicros(entrada([parada(29 * 60 + 5, 45, 2), micro(M30, 15, 0)], s))
    expect(r[0]!.causa).toBe('ritmo')
    expect(r[0]!.razones.map((x) => sp(x.texto))).not.toContain('las tres venían bajo su ritmo')
    expect(r[0]!.razones).toHaveLength(1)
    /* Control: con Ev 3 andando los 60 s y a la mitad, la nota sí sale. */
    const tres = serie(60, (j, k) => (k === 29 ? Math.floor(ESP[j]! * 0.5) : ESP[j]!))
    expect(clasificarMicros(entrada([micro(M30, 15, 0)], tres))[0]!.razones.map((x) => sp(x.texto))).toContain('las tres venían bajo su ritmo')
  })

  it('«Ev X también bajó» solo sale si la cifra que se muestra («N de esperado») también se ve baja: un ritmo propio mayor que el esperado no la marca', () => {
    /* Ev 3 anda a 20 con esperado 16. En el minuto de la micro da 14: es bajo para SU ritmo (14 < 15) pero no para el esperado (14 ≥ 12), y «14 de 16»
       no puede leerse «también bajó». */
    const s = serie(60, (j, k) => (j === 2 ? (k === 30 ? 14 : 20) : ESP[j]!))
    expect(clasificarMicros(entrada([micro(M30, 15, 0)], s))[0]!.razones).toEqual([])
    /* Con 11 sí: bajo para los dos (11 < 15 y 11 < 12). */
    const baja11 = serie(60, (j, k) => (j === 2 ? (k === 30 ? 11 : 20) : ESP[j]!))
    expect(clasificarMicros(entrada([micro(M30, 15, 0)], baja11))[0]!.razones.map((x) => sp(x.cifra))).toEqual(['11 de 16 pz'])
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
    expect(sp(q.tabla.leyendaInicio)).toBe('la parada pudo empezar en este minuto (Shoplogix la anota con 15 a 30 s de atraso)')
    /* La micro de Ev 3 a los 40 s no está en :00-:14 y no es simultánea de ninguna otra (a más de 15 s): su globo no lleva ▽ ni leyenda. */
    const tercera = r.find((x) => x.fila === 2)!
    expect(tercera.tabla.filas.map((f) => f.inicioPrevio)).toEqual([false, false, false])
    expect(tercera.tabla.leyendaInicio).toBeNull()
  })

  it('▽ solo para la propia micro y las paradas simultáneas a ±15 s: la micro de otra Baader que cae en :00-:14 pero está lejos no lo lleva', () => {
    /* La del globo, Ev 1 a los 43 s (no está en :00-:14). Ev 2 tiene una micro a los 13 s, 30 s antes: no es simultánea, así que su ▽ no es de este globo. */
    const q = clasificarMicros(entrada([micro(T + 13, 15, 1), micro(T + 43, 15, 0)])).find((x) => x.fila === 0)!
    expect(q.tabla.filas.map((f) => f.microEnK)).toEqual(['sin', 'sin', null])
    expect(q.tabla.filas.map((f) => f.inicioPrevio)).toEqual([false, false, false])
  })

  it('▽ también para una DETENCIÓN no programada simultánea anotada en :00-:14 (el mismo atraso de Shoplogix), con el ▼ solo en las micro; una PROGRAMADA no lo lleva', () => {
    const conParo = clasificarMicros(entrada([micro(T + 5, 15, 0), parada(T + 8, 200, 2)]))[0]!
    expect(conParo.causa).toBe('linea')
    expect(conParo.tabla.filas.map((f) => [f.microEnK, f.inicioPrevio])).toEqual([['linea', true], [null, false], [null, true]])
    const conColacion = clasificarMicros(entrada([micro(T + 5, 15, 0), colacion(T + 8, 200, 2)]))[0]!
    expect(conColacion.causa).not.toBe('linea')
    expect(conColacion.tabla.filas.map((f) => f.inicioPrevio)).toEqual([true, false, false])
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
    for (const q of todas) for (const t of textos(q)) { expect(t).not.toMatch(PROHIBIDAS); expect(t).not.toMatch(COMO_HECHO) }
  })

  it('cada causa tiene su definición en palabras de planta, con las cifras de las constantes de las reglas', () => {
    expect(Object.keys(DEFINICION_CAUSA)).toEqual([...CAUSAS_MICRO])
    expect(DEFINICION_CAUSA.arranque).toBe('Primeros 10 min del turno, o hasta 10 min después de una detención de 10 min o más de esa Baader.')
    expect(DEFINICION_CAUSA.linea).toBe('Otra Baader tuvo una micro o una detención no programada en los 15 s antes o después de esta.')
    expect(DEFINICION_CAUSA.paro).toBe('Hasta 2 min después de terminar una detención de esa Baader.')
    expect(DEFINICION_CAUSA.ritmo).toBe('El minuto anterior esa Baader hizo menos del 75 % de lo que venía haciendo. No dice por qué.')
    expect(DEFINICION_CAUSA.sin).toContain('No quiere decir que no tenga causa')
    for (const t of Object.values(DEFINICION_CAUSA)) expect(t).not.toMatch(PROHIBIDAS)
    expect(ATRASO_ANOTA).toBe('15 a 30 s')
  })

  it('las duraciones se dicen como en el resto del monitor: segundos, «2 min», «2 min 15 s» y «1 h 15 min», sin decimales de minuto', () => {
    const detalle = (s: number) => sp(clasificarMicros(entrada([micro(M30, 15, 0), parada(M30, s, 2)]))[0]!.razones[0]!.detalle)
    expect(detalle(45)).toBe('Ev 1 micro de 15 s · Ev 3 detención de 45 s')
    expect(detalle(120)).toBe('Ev 1 micro de 15 s · Ev 3 detención de 2 min')
    expect(detalle(135)).toBe('Ev 1 micro de 15 s · Ev 3 detención de 2 min 15 s')
    /* El arranque dice cuánto estuvo detenida: «10 min 50 s» y «1 h 15 min». */
    const tras = (s: number) => sp(clasificarMicros(entrada([parada(0, s, 0), micro(s + 100, 15, 0)], serie(120)))[0]!.razones[0]!.texto)
    expect(tras(650)).toBe('desde que Ev 1 volvió a andar, tras 10 min 50 s detenida')
    expect(tras(4500)).toBe('desde que Ev 1 volvió a andar, tras 1 h 15 min detenida')
  })

  it('un inicio de turno que no es un número no rompe la clasificación: no hay arranque por inicio y no se escribe una hora inventada', () => {
    const r = clasificarMicros(entrada([micro(M30, 15, 0)], serie(), { inicioTurnoMs: Number.NaN }))
    expect(r).toHaveLength(1)
    expect(r[0]!.causa).toBe('sin')
    const arranque = r[0]!.descartadas.find((d) => d.regla === 'arranque')!
    expect(sp(arranque.texto)).toBe('Ev 1 no tuvo detenciones de 10 min o más antes de la micro')
    expect(arranque.texto).not.toMatch(/NaN|Invalid/)
  })

  it('una micro anotada antes del inicio del turno no dice «-0 min» ni un tiempo negativo', () => {
    const r = clasificarMicros(entrada([micro(3, 15, 0)], serie(), { inicioTurnoMs: T0 + 3_030 }))
    expect(r[0]!.causa).toBe('arranque')
    expect(sp(r[0]!.razones[0]!.cifra)).toBe('0 min')
    for (const t of textos(r[0]!)) expect(t).not.toMatch(/-\d/)
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
