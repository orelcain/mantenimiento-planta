import { describe, expect, it } from 'vitest'
import {
  ARRANQUE_PARADA_MIN_S, CAUSAS_MICRO, FAMILIAS_LINEA, INICIO_MINUTO_S, LINEA_COMUN_TOL_S,
  clasificarMicros, contarPorCausa, familia, motivoLegible, numerosPorCelda, type EntradaMicroCausa, type MicroClasificada,
} from '../microCausa'
import { ATRASO_ANOTA, ROTULO_CAUSA, definicionCausa, detalleForma, lineaCausa } from '../textosCausas'
import { PARAMETROS_V3 } from '../causasCalibracion'

const T0 = Date.parse('2026-11-02T09:15:00.000Z')
/** La ventana de «Al volver de una detención» sin calibración (v3): 120 s. */
const TRAS_DETENCION_S = PARAMETROS_V3.TRAS / 1000
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
/** r: 0 = «Detencion», 1 = «Micro Detencion», 2 = «COLACION» (detención programada), 3 = «ACUMULACION RECHAZO», 4 = «CINTAS». m = índice de la Baader. */
const REASONS = ['Detencion', 'Micro Detencion', 'COLACION', 'ACUMULACION RECHAZO', 'CINTAS']
const parada = (seg: number, s: number, m: number) => ({ r: 0, f: iso(seg), s, m })
const micro = (seg: number, s: number, m: number) => ({ r: 1, f: iso(seg), s, m })
const colacion = (seg: number, s: number, m: number) => ({ r: 2, f: iso(seg), s, m })
const acum = (ms: number, s: number, m: number) => ({ r: 3, f: new Date(T0 + ms).toISOString(), s, m })
const cintas = (ms: number, s: number, m: number) => ({ r: 4, f: new Date(T0 + ms).toISOString(), s, m })
const entrada = (stopEvents: EntradaMicroCausa['stopEvents'], serieX = serie(), extra: Partial<EntradaMicroCausa> = {}): EntradaMicroCausa => ({
  serie: serieX,
  stopEvents,
  stopReasons: REASONS,
  stopMachines: ids.slice(0, serieX.maquinas.length),
  inicioTurnoMs: T0,
  ...extra,
})
/** Todas las micro vienen DESPUÉS de los primeros 10 min: así el arranque no tapa la regla que se prueba. El minuto 30 empieza en T. */
const T = 1800
const M30 = 30 * 60 + 20
/** Ev 2 baja en el minuto 29 (el anterior a las micro de M30). Las demás, a su ritmo. */
const baja = (piezas: number, fila = 1, minuto = 29) => serie(60, (j, k) => (j === fila && k === minuto ? piezas : ESP[j]!))
/** Lo que es una inferencia por el atraso de Shoplogix y NO puede decirse como hecho: tiene que ser «probablemente» o «pudo». */
const COMO_HECHO = /ya venía de antes|ya estaba parando|la parada ya venía/i
/** Todo lo que el usuario lee de una micro (línea de causa, forma, reglas que no aplicaron y leyenda de ▽), con espacios normales. */
const textos = (q: MicroClasificada) => {
  const l = lineaCausa(q.evidencia)
  return [l.prefijo ?? '', l.nombre, l.detalle, detalleForma(q.evidencia, { fila: q.fila, nombre: 'Ev', durS: q.duracionS }) ?? '', ...q.descartadas.flatMap((d) => [d.titulo, d.texto]), q.tabla.leyendaInicio ?? ''].map(sp)
}
const detalleDe = (q: MicroClasificada) => sp(lineaCausa(q.evidencia).detalle)
/** Una micro con milisegundos: `ms` desde el inicio de la serie (los inicios de Shoplogix traen ruido de milisegundos). */
const microMs = (ms: number, s: number, m: number) => ({ r: 1, f: new Date(T0 + ms).toISOString(), s, m })

describe('microCausa v3 · una regla por caso', () => {
  it('arranque: hasta 600 s después del fin de una detención de 600 s o más de esa Baader', () => {
    const r = clasificarMicros(entrada([parada(T, ARRANQUE_PARADA_MIN_S, 0), micro(T + 600 + 599, 15, 0)]))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ causa: 'arranque', forma: 'arranque', modo: null, fila: 0, duracionS: 15 })
    expect(r[0]!.evidencia).toMatchObject({ forma: 'arranque', origen: 'pausa', pausaS: 600 })
    /* La duración EXACTA (los 599 s de este caso), no redondeada a «10 min»: la micro está dentro de la ventana de 10. */
    expect(detalleDe(r[0]!)).toBe('a 9 min 59 s de volver de una detención de 10 min')
    expect(r[0]!.celdas).toEqual([])
  })

  it('arranque: una detención de menos de 600 s no abre el arranque', () => {
    const r = clasificarMicros(entrada([parada(T, ARRANQUE_PARADA_MIN_S - 1, 0), micro(T + 599 + 300, 15, 0)]))
    expect(r[0]!.causa).not.toBe('arranque')
  })

  it('arranque: 600 s o más después del fin de la pausa ya no lo es', () => {
    const r = clasificarMicros(entrada([parada(T, ARRANQUE_PARADA_MIN_S, 0), micro(T + 600 + PARAMETROS_V3.ARR / 1000, 15, 0)]))
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
    /* Con un hueco entre los dos pedazos son dos detenciones cortas: no abren arranque. */
    const conHueco = [parada(T, 400, 0), parada(T + 500, 300, 0), micro(T + 800 + 300, 15, 0)]
    expect(clasificarMicros(entrada(conHueco))[0]!.causa).not.toBe('arranque')
    /* Una micro pegada a la pausa no la une con ella (solo las detenciones que no son micro cuentan). */
    const conMicro = [parada(T, 400, 0), micro(T + 400, 200, 0), micro(T + 700 + 300, 15, 0)]
    expect(clasificarMicros(entrada(conMicro)).slice(-1)[0]!.causa).not.toBe('arranque')
  })

  it('arranque tras una pausa: la línea de causa dice la duración de la pausa unida (v3 ya no dice el motivo de la pausa: solo cuánto duró)', () => {
    const r = clasificarMicros(entrada([colacion(T, 3000, 0), parada(T + 3000, 120, 0), micro(T + 3120 + 200, 15, 0)]))
    expect(r[0]!.causa).toBe('arranque')
    /* 3.000 s de colación + 120 s seguidos = 52 min de pausa; la micro cae 200 s (3,3 min) después de volver. */
    expect(detalleDe(r[0]!)).toBe('a 3 min 20 s de volver de una detención de 52 min')
  })

  it('arranque: los primeros 600 s de producción, desde el inicio programado', () => {
    const r = clasificarMicros(entrada([micro(PARAMETROS_V3.ARR / 1000 - 15, 15, 2)]))
    expect(r[0]).toMatchObject({ causa: 'arranque', fila: 2 })
    expect(r[0]!.evidencia).toMatchObject({ forma: 'arranque', origen: 'produccion' })
    expect(detalleDe(r[0]!)).toBe('a 9 min 45 s de empezar a producir')
    expect(clasificarMicros(entrada([micro(PARAMETROS_V3.ARR / 1000, 15, 2)]))[0]!.causa).not.toBe('arranque')
  })

  it('arranque DESDE LA PRIMERA PRODUCCIÓN de esa Baader (v3; en v2 contaba solo desde el inicio programado, y la reunión de inicio se comía la ventana)', () => {
    /* Ev 1 empieza a producir en el minuto 20 (1.200 s). Una micro a los 1.300 s está a 100 s de producir: arranque. Desde el inicio programado serían 1.300 s: v2 daba Sin contexto. */
    const tarde = serie(60, (j, k) => (j === 0 && k < 20 ? 0 : ESP[j]!))
    const r = clasificarMicros(entrada([micro(1300, 15, 0)], tarde))
    expect(r[0]!.causa).toBe('arranque')
    expect(detalleDe(r[0]!)).toBe('a 1 min 40 s de empezar a producir')
    /* A 600 s de la primera producción ya no lo es. */
    expect(clasificarMicros(entrada([micro(1200 + 600, 15, 0)], tarde))[0]!.causa).toBe('sin')
    /* Entran también las que empiezan ANTES de la primera producción. */
    const antes = clasificarMicros(entrada([micro(900, 15, 0)], tarde))
    expect(antes[0]!.causa).toBe('arranque')
    expect(detalleDe(antes[0]!)).toBe('antes de empezar a producir')
    /* La primera producción es de CADA Baader: Ev 2 produjo desde el minuto 0, su micro a los 1.300 s no es arranque. */
    expect(clasificarMicros(entrada([micro(1300, 15, 1)], tarde))[0]!.causa).toBe('sin')
  })

  it('línea · a la vez: otra Baader marca micro con inicio a ±15 s (las dos quedan marcadas, y cada una cuenta a la otra)', () => {
    const r = clasificarMicros(entrada([micro(T, 15, 0), micro(T + LINEA_COMUN_TOL_S, 30, 2)]))
    expect(r.map((x) => [x.causa, x.modo, x.forma])).toEqual([['linea', 'a_la_vez', 'linea_a_la_vez'], ['linea', 'a_la_vez', 'linea_a_la_vez']])
    expect(r[0]!.evidencia).toMatchObject({ forma: 'linea_a_la_vez', otras: [{ fila: 2, nombre: 'Ev 3', micro: true, deltaS: 15, durS: 30 }] })
    expect(detalleDe(r[0]!)).toBe('Ev 3 con micro 15 s después')
    expect(detalleDe(r[1]!)).toBe('Ev 1 con micro 15 s antes')
    expect(r[0]!.celdas).toEqual([{ fila: 0, d: 0 }, { fila: 2, d: 0 }])
  })

  it('línea · a la vez: con diferencia 0 lo dice «a la vez»; a más de 15 s ya no coincide', () => {
    const mismo = clasificarMicros(entrada([micro(T, 15, 0), micro(T, 30, 1)]))
    expect(detalleDe(mismo[0]!)).toBe('Ev 2 con micro a la vez')
    expect(sp(detalleForma(mismo[0]!.evidencia, { fila: 0, nombre: 'Ev 1', durS: 15 }))).toBe('Forma: a la vez. Ev 1 15 s · Ev 2 30 s.')
    const lejos = clasificarMicros(entrada([micro(T, 15, 0), micro(T + LINEA_COMUN_TOL_S + 1, 15, 2)]))
    expect(lejos.map((x) => x.causa)).not.toContain('linea')
  })

  it('línea · a la vez: el ±15 s se compara AL SEGUNDO (decisión de Mantención, ver LINEA_COMUN_TOL_S): 15 s entra aunque sean 15,999 s crudos, 16 s no', () => {
    /* Los inicios de Shoplogix van de a un paso de 15 s con ruido de milisegundos: al milisegundo, dos detenciones a un paso entraban o no según 2 a 9 ms. */
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
    expect(detalleDe(r[0]!)).toBe('Ev 3 con micro 15 s después')
  })

  it('línea · a la vez: una detención NO programada de otra Baader a ±15 s también cuenta (aunque esa Baader no tenga micro)', () => {
    const r = clasificarMicros(entrada([micro(M30, 15, 0), parada(M30 + 5, 200, 2)]))
    expect(r).toHaveLength(1)
    expect(r[0]!.causa).toBe('linea')
    expect(detalleDe(r[0]!)).toBe('Ev 3 se detuvo 5 s después')
    expect(sp(detalleForma(r[0]!.evidencia, { fila: 0, nombre: 'Ev 1', durS: 15 }))).toBe('Forma: a la vez. Ev 1 15 s · Ev 3 detención de 3 min 20 s.')
    /* Una detención de OTRA fila a más de 15 s, o de la misma Baader, no la hace común. */
    expect(clasificarMicros(entrada([micro(M30, 15, 0), parada(M30 + 20, 200, 2)]))[0]!.causa).not.toBe('linea')
    expect(clasificarMicros(entrada([micro(M30, 15, 0), parada(M30 + 5, 200, 0)]))[0]!.causa).not.toBe('linea')
  })

  it('línea: una detención PROGRAMADA de otra Baader (colación…) no cuenta, y el globo lo dice en vez de afirmar que no se detuvo nadie', () => {
    const r = clasificarMicros(entrada([micro(M30, 15, 0), colacion(M30 + 5, 200, 2)]))
    expect(r[0]!.causa).not.toBe('linea')
    const l = r[0]!.descartadas.find((d) => d.regla === 'linea')!
    expect(sp(l.titulo)).toBe('No es «Otra Baader paró»:')
    expect(sp(l.texto)).toBe('ninguna otra Baader tuvo micro ni detención no programada a ±15 s (Ev 3 se detuvo, pero era programada: Colación)')
  })

  it('línea: no se parte en subtipos para el rótulo (micro con micro y micro con detención dan la misma causa)', () => {
    const conMicro = clasificarMicros(entrada([micro(M30, 15, 0), micro(M30, 15, 1)]))
    const conParo = clasificarMicros(entrada([micro(M30, 15, 0), parada(M30, 100, 1)]))
    expect(conMicro[0]!.causa).toBe('linea')
    expect(conParo[0]!.causa).toBe('linea')
    expect(ROTULO_CAUSA.linea).toBe('Otra Baader paró')
  })

  it('línea · en cadena: CADA una de las otras dos Baader con una micro entre 22,5 y 52,5 s antes o después', () => {
    const r = clasificarMicros(entrada([micro(M30, 15, 0), micro(M30 + 30, 75, 1), micro(M30 + 30, 60, 2)]))
    const q = r.find((x) => x.fila === 0)!
    expect(q).toMatchObject({ causa: 'linea', modo: 'en_cadena', forma: 'linea_en_cadena' })
    expect(detalleDe(q)).toBe('Ev 2 y Ev 3 con micro 30 s después')
    expect(sp(detalleForma(q.evidencia, { fila: 0, nombre: 'Ev 1', durS: 15 }))).toBe('Forma: en cadena. Ev 1 15 s · Ev 2 1 min 15 s · Ev 3 1 min.')
    /* Ev 1 a los 20 s del minuto 30; Ev 2 y Ev 3, a los 50 s del mismo minuto: las celdas que lo prueban. */
    expect(q.celdas).toEqual([{ fila: 0, d: 0 }, { fila: 1, d: 0 }, { fila: 2, d: 0 }])
    /* Con la micro de Ev 1 a los 50 s, las de las otras caen 30 s después, ya en el minuto 31 (k + 1). */
    const sig = clasificarMicros(entrada([micro(30 * 60 + 50, 15, 0), micro(31 * 60 + 20, 75, 1), micro(31 * 60 + 20, 60, 2)])).find((x) => x.fila === 0)!
    expect(sig.modo).toBe('en_cadena')
    expect(sig.celdas).toEqual([{ fila: 0, d: 0 }, { fila: 1, d: 1 }, { fila: 2, d: 1 }])
    /* Con desfases distintos: «Ev 2 con micro 30 s después y Ev 3 45 s antes». */
    const dist = clasificarMicros(entrada([micro(M30 - 45, 15, 2), micro(M30, 15, 0), micro(M30 + 30, 15, 1)])).find((x) => x.fila === 0)!
    expect(dist.modo).toBe('en_cadena')
    expect(detalleDe(dist)).toBe('Ev 2 con micro 30 s después y Ev 3 45 s antes')
  })

  it('línea · lo que se descarta dice SOLO lo que se evaluó: una micro suelta de otra Baader a 30 s (no es «a la vez» ni cierra la cadena) no se niega con «no se detuvieron»', () => {
    /* Ev 2 tuvo una micro 30 s después de la de Ev 1: está dentro de la ventana de «en cadena» (22,5 a 52,5 s) pero falta Ev 3, así que ninguna regla de «Otra Baader paró» aplica. */
    const r = clasificarMicros(entrada([micro(M30, 15, 0), micro(M30 + 30, 15, 1)]))
    expect(r[0]!.causa).toBe('sin')
    const t = sp(r[0]!.descartadas.find((d) => d.regla === 'linea')!.texto)
    expect(t).toBe('ninguna otra Baader se detuvo a ±15 s, las otras dos no tuvieron micro en cadena (entre 22,5 y 52,5 s antes o después) y no hubo una detención previa por acumulación, atascamiento, materia prima o ajuste del operador (entre 22,5 s y 2 min antes)')
    expect(t).not.toMatch(/no se detuvieron/)
    /* Y dice cada una de las tres formas, con sus ventanas: a la vez (±15 s), en cadena (22,5 a 52,5 s) y detención previa (22,5 s a 2 min antes). */
    expect(t).toMatch(/±15 s/)
    expect(t).toMatch(/en cadena \(entre 22,5 y 52,5 s antes o después\)/)
    expect(t).toMatch(/detención previa .*\(entre 22,5 s y 2 min antes\)/)
  })

  it('línea · lo que se descarta con solo dos Baader no habla de la cadena (la regla no existe ahí) y las ventanas salen de los parámetros de la planta', () => {
    const dos = serie(60, (j) => ESP[j]!, 2)
    const t = sp(clasificarMicros(entrada([micro(M30, 15, 0)], dos))[0]!.descartadas.find((d) => d.regla === 'linea')!.texto)
    expect(t).toBe('ninguna otra Baader se detuvo a ±15 s y no hubo una detención previa por acumulación, atascamiento, materia prima o ajuste del operador (entre 22,5 s y 2 min antes)')
    expect(t).not.toMatch(/cadena/)
  })

  it('línea · con dos Baader detenidas a la vez el texto va en plural («Ev 2 y Ev 3 se detuvieron»), con la duración en el formato del monitor', () => {
    const q = clasificarMicros(entrada([micro(M30, 15, 0), { r: 3, f: iso(M30 + 5), s: 90, m: 1 }, { r: 3, f: iso(M30 + 5), s: 90, m: 2 }]))[0]!
    expect(q).toMatchObject({ causa: 'linea', modo: 'a_la_vez' })
    expect(detalleDe(q)).toBe('Ev 2 y Ev 3 se detuvieron 5 s después por Acumulación rechazo')
    /* Una sola: singular. */
    const una = clasificarMicros(entrada([micro(M30, 15, 0), { r: 3, f: iso(M30 + 5), s: 90, m: 1 }]))[0]!
    expect(detalleDe(una)).toBe('Ev 2 se detuvo 5 s después por Acumulación rechazo')
  })

  it('el arranque dice la duración EXACTA, nunca «a 10 min» si la micro está dentro de los 10: 9 min 36 s', () => {
    const r = clasificarMicros(entrada([micro(9 * 60 + 36, 15, 0)]))
    expect(r[0]!.causa).toBe('arranque')
    expect(detalleDe(r[0]!)).toBe('a 9 min 36 s de empezar a producir')
    expect(detalleDe(r[0]!)).not.toMatch(/a 10 min/)
  })

  it('las duraciones del globo NO llevan minutos con decimal ni segundos de más de un minuto («hace 30,5 min», «120 s», «103 min»)', () => {
    const t = 3 * 3600
    const lej = clasificarMicros(entrada([parada(t - 1830 - 200, 200, 0), micro(t, 15, 0)]))[0]!
    const desc = sp(lej.descartadas.find((d) => d.regla === 'paro')!.texto)
    expect(desc).toBe('la última detención de Ev 1 terminó hace 30 min 30 s')
    const largo = clasificarMicros(entrada([parada(t - 6180 - 200, 200, 0), micro(t, 15, 0)]))[0]!
    expect(sp(largo.descartadas.find((d) => d.regla === 'paro')!.texto)).toBe('la última detención de Ev 1 terminó hace 1 h 43 min')
    const dosMin = clasificarMicros(entrada([micro(M30, 15, 0), acum(M30 * 1000 - 120_000, 60, 1)]))[0]!
    expect(detalleDe(dosMin)).toMatch(/se detuvo 2 min antes/)
    for (const x of [desc, ...textos(lej), ...textos(largo), ...textos(dosMin)]) expect(x).not.toMatch(/\d,\d min|\b1\d\d s\b/)
  })

  it('línea · en cadena: si falta UNA de las otras dos no hay cadena; con dos Baader no existe', () => {
    expect(clasificarMicros(entrada([micro(M30, 15, 0), micro(M30 + 30, 15, 1)]))[0]!.causa).toBe('sin')
    const dos = serie(60, (j) => ESP[j]!, 2)
    expect(clasificarMicros(entrada([micro(M30, 15, 0), micro(M30 + 30, 15, 1)], dos))[0]!.causa).toBe('sin')
  })

  it('línea · en cadena: la ventana es de 22,5 a 52,5 s, en milisegundos y con los dos extremos adentro', () => {
    const t = M30 * 1000
    const en = (d: number) => clasificarMicros(entrada([microMs(t, 15, 0), microMs(t + d, 15, 1), microMs(t + d, 15, 2)])).find((x) => x.fila === 0)!
    expect(en(22_500).modo).toBe('en_cadena')
    expect(en(52_500).modo).toBe('en_cadena')
    expect(en(22_499).causa).toBe('sin')
    expect(en(52_501).causa).toBe('sin')
    /* Hacia atrás es igual. */
    expect(en(-22_500).modo).toBe('en_cadena')
    expect(en(-52_501).causa).toBe('sin')
  })

  it('línea · detención previa: otra Baader INICIÓ una detención no programada de 22,5 s a 127,5 s antes, con motivo de acumulación, atascamiento, materia prima o ajuste del operador', () => {
    const t = M30 * 1000
    const q = clasificarMicros(entrada([acum(t - 90_000, 60, 1), microMs(t, 60, 0)]))[0]!
    expect(q).toMatchObject({ causa: 'linea', modo: 'tras_paro_otra', forma: 'linea_tras_paro_otra' })
    expect(q.evidencia).toMatchObject({ forma: 'linea_tras_paro_otra', nombre: 'Ev 2', haceS: 90, durS: 60 })
    expect(detalleDe(q)).toBe(`Ev 2 se detuvo 1 min 30 s antes por ${sp(motivoLegible('ACUMULACION RECHAZO'))}`)
    expect(sp(detalleForma(q.evidencia, { fila: 0, nombre: 'Ev 1', durS: 60 }))).toBe('Forma: detención previa. La detención de Ev 2 fue no programada y duró 1 min.')
    /* La detención de Ev 2 inició en el minuto 28 (k − 2): su celda es la de la tabla. */
    expect(q.celdas).toEqual([{ fila: 1, d: -2 }])
    /* Los dos extremos entran; un milisegundo más afuera, no. */
    const en = (hace: number) => clasificarMicros(entrada([acum(t - hace, 60, 1), microMs(t, 15, 0)]))[0]!
    expect(en(22_500).modo).toBe('tras_paro_otra')
    expect(en(127_500).modo).toBe('tras_paro_otra')
    expect(en(22_499).causa).toBe('sin')
    expect(en(127_501).causa).toBe('sin')
  })

  it('línea · detención previa: un motivo mecánico no cuenta (y el globo dice cuál), ni una detención programada, ni una micro', () => {
    const t = M30 * 1000
    const mec = clasificarMicros(entrada([cintas(t - 90_000, 60, 1), microMs(t, 15, 0)]))[0]!
    expect(familia('CINTAS')).toBe('MEC')
    expect(mec.causa).toBe('sin')
    expect(sp(mec.descartadas.find((d) => d.regla === 'linea')!.texto)).toBe(`Ev 2 se detuvo 1 min 30 s antes, pero por ${sp(motivoLegible('CINTAS'))}, y eso no cuenta. Ninguna otra Baader coincidió a la vez ni en cadena`)
    /* Sin imputar («Detencion»): se dice «sin imputar». */
    const sinImp = clasificarMicros(entrada([{ r: 0, f: new Date(T0 + t - 75_000).toISOString(), s: 60, m: 1 }, microMs(t, 15, 0)]))[0]!
    expect(sinImp.causa).toBe('sin')
    expect(sp(sinImp.descartadas.find((d) => d.regla === 'linea')!.texto)).toBe('Ev 2 se detuvo 1 min 15 s antes, pero sin imputar, y eso no cuenta. Ninguna otra Baader coincidió a la vez ni en cadena')
    expect(clasificarMicros(entrada([{ r: 2, f: new Date(T0 + t - 90_000).toISOString(), s: 60, m: 1 }, microMs(t, 15, 0)]))[0]!.causa).toBe('sin')
    expect(clasificarMicros(entrada([microMs(t - 90_000, 60, 1), microMs(t, 15, 0)]))[0]!.causa).toBe('sin')
  })

  it('familia(): la tabla de motivos de causas_v3.py, con match por inicio/exacto antes que substring y tolerando acentos', () => {
    expect(familia('ACUMULACION RECHAZO')).toBe('ACUM')
    expect(familia('Acumulación rechazo')).toBe('ACUM')
    expect(familia('  atascamiento   en ruta ')).toBe('ATASC')
    expect(familia('CAMBIO LOTE/MMPP')).toBe('MMPP')
    expect(familia('Falta de materia prima')).toBe('MMPP')
    expect(familia('AJUSTE OPERADOR')).toBe('AJ_OP')
    expect(familia('AJUSTE MANTENIMIENTO')).toBe('AJ_MANT')
    expect(familia('KNURO - sensor')).toBe('KNURO')
    expect(familia('LOGICA')).toBe('LOGICA')
    expect(familia('ENERGIA')).toBe('ENERGIA')
    expect(familia('Detencion')).toBe('SIN_IMP')
    expect(familia('Detención')).toBe('SIN_IMP')
    expect(familia(null)).toBe('OTRO')
    expect(familia('LIMPIEZA DE LINEA')).toBe('LIMP')
    expect(familia('CUMPLIMIENTO CUOTA')).toBe('PLAN')
    expect(familia('FALLA OPERACIONAL')).toBe('MEC')
    expect(familia('algo desconocido')).toBe('OTRO')
    expect([...FAMILIAS_LINEA].sort()).toEqual(['ACUM', 'AJ_OP', 'ATASC', 'MMPP'])
  })

  it('al volver de una detención: hasta 120 s después del fin de una detención (no micro) de esa Baader', () => {
    const r = clasificarMicros(entrada([parada(T, 200, 1), micro(T + 200 + TRAS_DETENCION_S - 1, 15, 1)]))
    expect(r[0]).toMatchObject({ causa: 'paro', forma: 'paro', modo: null, fila: 1 })
    expect(r[0]!.evidencia).toMatchObject({ forma: 'paro', haceS: 119, durS: 200 })
    expect(detalleDe(r[0]!)).toBe('su detención terminó 1 min 59 s antes')
    expect(sp(detalleForma(r[0]!.evidencia, { fila: 1, nombre: 'Ev 2', durS: 15 }))).toBe('La detención de Ev 2 duró 3 min 20 s.')
    expect(clasificarMicros(entrada([parada(T, 200, 1), micro(T + 200 + TRAS_DETENCION_S, 15, 1)]))[0]!.causa).not.toBe('paro')
  })

  it('al volver de una detención: otra micro anterior no abre la ventana (solo las detenciones que no son micro)', () => {
    const r = clasificarMicros(entrada([micro(T, 15, 1), micro(T + 15 + 30, 15, 1)]))
    expect(r.map((x) => x.causa)).toEqual(['sin', 'sin'])
  })

  it('sin contexto: el resto, con cada regla descartada y su cifra', () => {
    const r = clasificarMicros(entrada([micro(M30, 15, 0)]))
    expect(r[0]!.causa).toBe('sin')
    expect(r[0]).toMatchObject({ modo: null, forma: 'sin', celdas: [] })
    expect(lineaCausa(r[0]!.evidencia)).toEqual({ prefijo: null, nombre: 'Sin contexto', detalle: 'nada alrededor en los datos' })
    expect(r[0]!.descartadas.map((d) => [d.regla, sp(d.titulo), sp(d.texto)])).toEqual([
      ['arranque', 'No es arranque:', 'ya pasaron 10 min desde que Ev 1 empezó a producir (09:15) y no tuvo detenciones de 10 min o más'],
      ['linea', 'No es «Otra Baader paró»:', 'ninguna otra Baader se detuvo a ±15 s, las otras dos no tuvieron micro en cadena (entre 22,5 y 52,5 s antes o después) y no hubo una detención previa por acumulación, atascamiento, materia prima o ajuste del operador (entre 22,5 s y 2 min antes)'],
      ['paro', 'No es «Al volver de una detención»:', 'Ev 1 no tuvo detenciones antes de la micro'],
    ])
  })

  it('la última pausa larga y la última detención se dicen con su hora y su antigüedad, cada una con su límite', () => {
    const r = clasificarMicros(entrada([parada(T - 1800, 1200, 0), parada(T - 400, 60, 0), micro(T + 300, 15, 0)]))
    expect(r[0]!.causa).toBe('sin')
    expect(sp(r[0]!.descartadas.find((d) => d.regla === 'arranque')!.texto)).toBe('la última detención de 10 min o más de Ev 1 terminó a las 09:35')
    /* La última detención terminó en T − 340 y la micro empieza en T + 300: 640 s, en el formato del monitor (nunca «10,7 min»). */
    expect(sp(r[0]!.descartadas.find((d) => d.regla === 'paro')!.texto)).toBe('la última detención de Ev 1 terminó hace 10 min 40 s')
  })
})

describe('microCausa v3 · «Ritmo bajo» ya no es causa de micro (estudio v3 §1: fuga del atraso de anotación; los casos que en v2 daban «Ritmo bajo» dan Sin contexto)', () => {
  /* Cada caso es el de una prueba de v2 con sus mismos datos; con v3 el minuto anterior bajo ya no explica la micro. */
  const casos: Array<[string, () => MicroClasificada[]]> = [
    ['v2 «cumple»: el minuto anterior dio 11 de 16 (menos del 75 % de su ritmo propio)', () => clasificarMicros(entrada([micro(M30, 15, 1)], baja(11)))],
    ['v2 «corte estricto»: justo en 0,75 × ritmo', () => clasificarMicros(entrada([micro(M30, 15, 1)], baja(12)))],
    ['v2 «ritmo propio»: una Baader que siempre da 12 baja a 8', () => clasificarMicros(entrada([micro(M30, 15, 1)], serie(60, (j, k) => (j === 1 ? (k === 29 ? 8 : 12) : ESP[j]!))))],
    ['v2 «30 s de micro en el minuto anterior»: 5 piezas', () => clasificarMicros(entrada([micro(29 * 60 + 10, 30, 1), micro(30 * 60 + 40, 15, 1)], serie(60, (j, k) => (j === 1 && k === 29 ? 5 : ESP[j]!)))).slice(-1)],
    ['v2 «las tres venían bajo su ritmo»', () => clasificarMicros(entrada([micro(M30, 15, 0)], serie(60, (j, k) => (k === 29 ? Math.floor(ESP[j]! * 0.5) : ESP[j]!))))],
    ['v2 «una parada que sigue abierta»', () => clasificarMicros(entrada([micro(M30, 15, 0)], serie(60, (j, k) => (j === 2 && k >= 29 ? 0 : ESP[j]!))))],
    ['v2 «el minuto en curso (parcial)»: con el minuto anterior ya entregado por las tres', () => clasificarMicros(entrada([micro(31 * 60 + 20, 15, 1)], serie(31, (j, k) => (j === 1 && k === 30 ? 2 : ESP[j]!))))],
  ]
  for (const [nombre, f] of casos) {
    it(nombre, () => {
      const r = f()
      expect(r.length).toBeGreaterThan(0)
      for (const q of r) expect(q.causa).toBe('sin')
    })
  }

  it('la causa ya no existe: CAUSAS_MICRO y los rótulos son las cuatro de v3', () => {
    expect([...CAUSAS_MICRO]).toEqual(['arranque', 'linea', 'paro', 'sin'])
    expect(CAUSAS_MICRO.map((c) => ROTULO_CAUSA[c])).toEqual(['Arranque', 'Otra Baader paró', 'Al volver de una detención', 'Sin contexto'])
    expect(Object.keys(ROTULO_CAUSA)).toEqual([...CAUSAS_MICRO])
  })

  it('con una sola Baader (Filete) no hay «Otra Baader paró» ni se lista como regla descartada', () => {
    const s = serie(60, (j, k) => (k === 29 ? 2 : ESP[j]!), 1)
    const r = clasificarMicros(entrada([micro(M30, 15, 0)], s))
    expect(r[0]!.causa).toBe('sin')
    expect(r[0]!.descartadas.map((d) => d.regla)).toEqual(['arranque', 'paro'])
    expect(r[0]!.tabla.filas).toHaveLength(1)
  })

  it('el ▽ y su leyenda hablan de una detención que PUDO empezar antes, no de una que «ya estaba parando»', () => {
    const q = clasificarMicros(entrada([micro(30 * 60 + 5, 15, 1)]))[0]!
    expect(INICIO_MINUTO_S).toBe(15)
    expect(q.tabla.filas.map((f) => f.inicioPrevio)).toEqual([false, true, false])
    expect(sp(q.tabla.leyendaInicio)).toBe(`la detención pudo empezar en este minuto: Shoplogix la anota con ${ATRASO_ANOTA} de atraso`)
    expect(sp(q.tabla.leyendaInicio)).not.toMatch(COMO_HECHO)
  })
})

describe('microCausa v3 · las celdas que prueban la causa (el ① del globo y de la tabla)', () => {
  it('cada causa con celdas las numera en la tabla: numerosPorCelda reparte el ① por Baader y minuto (v3 ya no tiene los ② de las notas de ritmo)', () => {
    const s = serie(60, (j, k) => (j === 2 && k === 30 ? 5 : ESP[j]!))
    const r = clasificarMicros(entrada([micro(M30, 15, 0), micro(M30 + 5, 15, 1)], s))
    const q = r.find((x) => x.fila === 0)!
    expect(q.causa).toBe('linea')
    expect(q.celdas).toHaveLength(2)
    expect([...numerosPorCelda(q).entries()]).toEqual([['0:0', [1]], ['1:0', [1]]])
    /* Las causas sin celda que las pruebe no numeran nada. */
    expect([...numerosPorCelda(clasificarMicros(entrada([micro(M30, 15, 0)]))[0]!).entries()]).toEqual([])
  })
})

describe('microCausa v3 · precedencia', () => {
  it('arranque gana a «Otra Baader paró» y a «Al volver de una detención»', () => {
    /* Parada larga de Ev 1 (T → T + 700); 100 s después, micro de Ev 1 y de Ev 2 a la vez (minuto 43): sin el arranque, la de Ev 1 saldría «a la vez». */
    const seg = T + 700 + 100
    const r = clasificarMicros(entrada([parada(T, 700, 0), micro(seg, 15, 0), micro(seg, 15, 1)]))
    expect(r.find((x) => x.fila === 0)!.causa).toBe('arranque')
    /* Contraste: la micro de Ev 2 a la misma hora NO es arranque (la pausa fue de Ev 1): sale «Otra Baader paró». */
    expect(r.find((x) => x.fila === 1)!.causa).toBe('linea')
    /* Y sin la pausa larga, la de Ev 1 ya no es arranque. */
    const sinPausa = clasificarMicros(entrada([micro(seg, 15, 0), micro(seg, 15, 1)]))
    expect(sinPausa.map((x) => x.causa)).toEqual(['linea', 'linea'])
  })

  it('«a la vez» gana a «Al volver de una detención»; una regla que se cumple pero pierde por orden NO se lista como ✕', () => {
    const r = clasificarMicros(entrada([parada(T - 100, 60, 1), micro(M30, 15, 1), micro(M30 + 5, 15, 2)]))
    const q = r.find((x) => x.fila === 1)!
    expect(q.causa).toBe('linea')
    /* «Al volver» se cumple (terminó hace 80 s) pero perdió por precedencia: no es «descartada». */
    expect(q.descartadas.map((d) => d.regla)).toEqual(['arranque'])
  })

  it('«Al volver de una detención» gana a «en cadena» y a «detención previa» (y entonces esas dos no se listan como ✕ si se cumplen)', () => {
    const t = M30 * 1000
    /* Ev 1 volvió de una detención hace 50 s; Ev 2 y Ev 3 tienen micro 30 s después (cadena) y Ev 2 inició una por acumulación 90 s antes. */
    const r = clasificarMicros(entrada([
      { r: 0, f: new Date(T0 + t - 110_000).toISOString(), s: 60, m: 0 }, acum(t - 90_000, 60, 1), microMs(t, 15, 0), microMs(t + 30_000, 15, 1), microMs(t + 30_000, 15, 2),
    ]))
    const q = r.find((x) => x.fila === 0)!
    expect(q.causa).toBe('paro')
    expect(q.descartadas.map((d) => d.regla)).toEqual(['arranque'])
  })

  it('«en cadena» gana a «detención previa»', () => {
    const t = M30 * 1000
    const q = clasificarMicros(entrada([acum(t - 90_000, 60, 1), microMs(t, 15, 0), microMs(t + 30_000, 15, 1), microMs(t + 30_000, 15, 2)])).find((x) => x.fila === 0)!
    expect(q.modo).toBe('en_cadena')
  })
})

describe('microCausa v3 · la tabla por Baader', () => {
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
    expect(sp(q.tabla.leyendaInicio)).toBe('la detención pudo empezar en este minuto: Shoplogix la anota con 15 a 30 s de atraso')
    /* La micro de Ev 3 a los 40 s no está en :00-:14 y no es simultánea de ninguna otra (a más de 15 s): su globo no lleva ▽ ni leyenda. */
    const tercera = r.find((x) => x.fila === 2)!
    expect(tercera.tabla.filas.map((f) => f.inicioPrevio)).toEqual([false, false, false])
    expect(tercera.tabla.leyendaInicio).toBeNull()
  })

  it('▽ solo para la propia micro y las detenciones simultáneas a ±15 s: la micro de otra Baader que cae en :00-:14 pero está lejos no lo lleva', () => {
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
})

describe('microCausa v3 · el inicio del turno', () => {
  it('el inicio del turno puede ser distinto del inicio de la serie: los 10 min de arranque cuentan desde `inicioTurnoMs`', () => {
    /* La serie parte en T0; el turno (o la primera pieza) en T0 + 1200 s. Una micro en T0 + 1300 s está a 100 s del inicio. */
    const inicio = T0 + 1200_000
    const r = clasificarMicros(entrada([micro(1300, 15, 0)], serie(), { inicioTurnoMs: inicio }))
    expect(r[0]!.causa).toBe('arranque')
    /* El inicio programado es posterior a la primera producción (T0): el arranque cuenta desde el inicio del turno y así se dice. */
    expect(detalleDe(r[0]!)).toBe('a 1 min 40 s de empezar el turno')
    /* Con el inicio en T0 esa misma micro (a 1300 s) ya no es arranque. */
    expect(clasificarMicros(entrada([micro(1300, 15, 0)]))[0]!.causa).toBe('sin')
    /* Y a 600 s o más del inicio del turno (no de la serie) deja de serlo. */
    expect(clasificarMicros(entrada([micro(1200 + 600, 15, 0)], serie(), { inicioTurnoMs: inicio }))[0]!.causa).toBe('sin')
  })
})

describe('microCausa v3 · sin datos y textos', () => {
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

  it('cuenta por causa en el orden de la barra y los chips', () => {
    const r = clasificarMicros(entrada([micro(5, 15, 0), micro(T, 15, 0), micro(T + 600, 15, 1)]))
    expect(contarPorCausa(r)).toEqual({ arranque: 1, linea: 0, paro: 0, sin: 2 })
  })

  it('cada causa tiene su definición en palabras de planta, con las cifras de los parámetros de la planta (Yal: 1 min 30 s)', () => {
    const p = PARAMETROS_V3
    expect(sp(definicionCausa('arranque', p, true))).toBe('en los primeros 10 min desde que esa Baader empieza a producir, o desde que vuelve de una detención suya de 10 min o más.')
    expect(sp(definicionCausa('paro', p, true))).toBe('hasta 2 min después de que terminó una detención de esa misma Baader.')
    expect(sp(definicionCausa('paro', { ...p, TRAS: 90_000 }, true))).toBe('hasta 1 min 30 s después de que terminó una detención de esa misma Baader.')
    expect(sp(definicionCausa('linea', p, true))).toContain('Otra Baader paró · a la vez: otra Baader tuvo una micro o una detención no programada a ±15 s.')
    expect(sp(definicionCausa('linea', p, true))).toContain('entre 22,5 y 52,5 s antes o después')
    expect(sp(definicionCausa('linea', p, true))).toContain('entre 22,5 s y 2 min antes')
    expect(sp(definicionCausa('sin', p, true))).toBe('ninguna de las anteriores. Los datos de Shoplogix aún no muestran su causa.')
    /* Con una sola Baader «Otra Baader paró» no se dice. */
    expect(definicionCausa('linea', p, false)).toBe('')
    expect(ATRASO_ANOTA).toBe('15 a 30 s')
  })

  it('las duraciones se dicen como en el resto del monitor: segundos, «2 min», «2 min 15 s» y «1 h 15 min», sin decimales de minuto', () => {
    const forma = (s: number) => sp(detalleForma(clasificarMicros(entrada([micro(M30, 15, 0), parada(M30, s, 2)]))[0]!.evidencia, { fila: 0, nombre: 'Ev 1', durS: 15 }))
    expect(forma(45)).toBe('Forma: a la vez. Ev 1 15 s · Ev 3 detención de 45 s.')
    expect(forma(120)).toBe('Forma: a la vez. Ev 1 15 s · Ev 3 detención de 2 min.')
    expect(forma(135)).toBe('Forma: a la vez. Ev 1 15 s · Ev 3 detención de 2 min 15 s.')
    /* El arranque dice cuánto estuvo detenida: «10 min 50 s» y «1 h 15 min». */
    const tras = (s: number) => sp(lineaCausa(clasificarMicros(entrada([parada(0, s, 0), micro(s + 100, 15, 0)], serie(120)))[0]!.evidencia).detalle)
    expect(tras(650)).toBe('a 1 min 40 s de volver de una detención de 10 min 50 s')
    expect(tras(4500)).toBe('a 1 min 40 s de volver de una detención de 1 h 15 min')
  })

  it('un inicio de turno que no es un número no rompe la clasificación: el arranque cuenta desde la primera producción y no se escribe una hora inventada', () => {
    const r = clasificarMicros(entrada([micro(M30, 15, 0)], serie(), { inicioTurnoMs: Number.NaN }))
    expect(r).toHaveLength(1)
    expect(r[0]!.causa).toBe('sin')
    const arranque = r[0]!.descartadas.find((d) => d.regla === 'arranque')!
    expect(sp(arranque.texto)).toBe('ya pasaron 10 min desde que Ev 1 empezó a producir (09:15) y no tuvo detenciones de 10 min o más')
    expect(arranque.texto).not.toMatch(/NaN|Invalid/)
    /* Sin inicio y sin una sola pieza no hay desde cuándo contar: no se dice ninguna hora. */
    const sinNada = clasificarMicros(entrada([micro(M30, 15, 0)], serie(60, () => 0), { inicioTurnoMs: Number.NaN }))
    expect(sp(sinNada[0]!.descartadas.find((d) => d.regla === 'arranque')!.texto)).toBe('Ev 1 no tuvo detenciones de 10 min o más antes de la micro')
  })

  it('una micro anotada antes del inicio del turno no dice «-0 min» ni un tiempo negativo', () => {
    const r = clasificarMicros(entrada([micro(3, 15, 0)], serie(), { inicioTurnoMs: T0 + 3_030 }))
    expect(r[0]!.causa).toBe('arranque')
    expect(detalleDe(r[0]!)).toBe('antes de empezar el turno')
    for (const t of textos(r[0]!)) expect(t).not.toMatch(/-\d/)
  })

  it('el motivo de una detención se muestra como en el resto del monitor, sin mayúsculas sostenidas, y la detención sin motivo no dice nada', () => {
    expect(motivoLegible('COLACION')).toBe('Colación')
    expect(motivoLegible('EJERCICIO COMPENSATORIO - Paro')).toBe('Ejercicio compensatorio - Paro')
    expect(motivoLegible('REUNION INICIO TURNO')).toBe('Reunión inicio turno')
    expect(motivoLegible('Planta De Riles')).toBe('Planta de riles')
    expect(motivoLegible('Detencion')).toBeNull()
    expect(motivoLegible('  ')).toBeNull()
    expect(motivoLegible(null)).toBeNull()
  })

  it('el estimado de las causas no se puede leer como «causa»: ninguna micro afirma como hecho lo que es inferencia por el atraso de Shoplogix', () => {
    const t = M30 * 1000
    const todas = clasificarMicros(entrada([microMs(t, 15, 0), microMs(t + 30_000, 15, 1), microMs(t + 30_000, 15, 2), parada(T - 400, 200, 2), micro(T + 5, 15, 2), micro(5, 15, 0)]))
    expect(todas.length).toBeGreaterThan(4)
    for (const q of todas) for (const x of textos(q)) expect(x).not.toMatch(COMO_HECHO)
  })
})
