/**
 * Los textos de las causas de las micro (`textosCausas.ts`) y el vocabulario que decidió Mantención (03-11-2026):
 *  · nunca «casualidad» ni «azar»: «las microdetenciones no ocurren jamás por casualidad, solo que no entendemos aún el por qué pasan con los datos y
 *    análisis actuales»; el vocabulario es «causa probable» (el estimado) y «causa posible» (la micro coincidió con eso);
 *  · «ya no le llamamos paro ni paradas sino detenciones o detención» (04-11: el usuario lo cambió a "se detuvo" por la regla de "detención").
 * La prueba junta TODO lo que el módulo puede decir (sus constantes y lo que dicen sus funciones con datos reales de los 10 turnos validados) y exige que
 * ninguna palabra prohibida aparezca. Los identificadores (claves internas como `paro`) no son texto visible y no se tocan.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PARAMETROS_V3, calibracionDe } from '../causasCalibracion'
import { CAUSAS_MICRO, clasificarMicros, parametrosDe, resumirCausas, type MicroClasificada } from '../microCausa'
import * as T from '../textosCausas'
import { CHONCHI_0211_T2, FILETE_0211_DIA, clasificarDoc, type DocMicro } from './microFixtures'
import { PROHIBIDAS } from './vocabulario'

const leer = <T>(archivo: string) => JSON.parse(readFileSync(resolve(__dirname, 'fixtures', archivo), 'utf8')) as T
const { turnos } = leer<{ turnos: Array<{ id: string; planta: 'Chonchi' | 'Filete'; doc: Omit<DocMicro, '_fuente'> }> }>('turnos_validados.json')
const TURNOS = [
  { id: '2026-11-02_Turno 2', planta: 'Chonchi' as const, doc: CHONCHI_0211_T2 },
  { id: '2026-11-02_Turno Dia', planta: 'Filete' as const, doc: FILETE_0211_DIA },
  ...turnos,
]
const clasificar = (t: (typeof TURNOS)[number]) => clasificarDoc({ _fuente: t.id, ...t.doc }, { planta: t.planta === 'Chonchi' ? 'chonchi' : 'filete' })

/** Todas las cadenas que contiene un valor (constantes anidadas incluidas). */
function cadenas(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => cadenas(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => cadenas(x, out))
  return out
}
const sp = (s: string) => s.replace(/\u00a0/g, ' ')

describe('textosCausas · vocabulario: nada de «casualidad», «azar», «paro» ni «parada(s)»', () => {
  it('la expresión prohibida detecta lo que debe (y no «paró», que ya no es el nombre de la causa)', () => {
    for (const mala of ['por casualidad', 'al azar', 'un paro', 'los paros', 'Parada programada', 'las paradas', 'PARO']) expect(mala).toMatch(PROHIBIDAS)
    for (const buena of ['Otra Baader se detuvo', 'detención', 'se detuvo', 'Al volver de una detención', 'comparar', 'separar']) expect(buena).not.toMatch(PROHIBIDAS)
  })

  it('las constantes del módulo (rótulos, formas, textos del resumen y del globo) no dicen nada prohibido', () => {
    const constantes = [T.ROTULO_CAUSA, T.ROTULO_FORMA, T.TXT_RESUMEN, T.TXT_GLOBO, T.ARIA_GLOBO, T.AYUDA_INTRO, T.ATRASO_ANOTA]
    const todas = cadenas(constantes)
    expect(todas.length).toBeGreaterThan(20)
    for (const t of todas) expect(t).not.toMatch(PROHIBIDAS)
  })

  it('los rótulos nuevos: Arranque · Otra Baader se detuvo · Al volver de una detención · Sin contexto, y las formas «a la vez», «en cadena» y «detención previa»', () => {
    expect(CAUSAS_MICRO.map((c) => T.ROTULO_CAUSA[c])).toEqual(['Arranque', 'Otra Baader se detuvo', 'Al volver de una detención', 'Sin contexto'])
    expect(T.ROTULO_FORMA).toEqual({ a_la_vez: 'a la vez', en_cadena: 'en cadena', tras_paro_otra: 'detención previa' })
  })

  it('el ⓘ (las seis reglas, con los parámetros de cada planta) y las notas, con y sin calibración, no dicen nada prohibido', () => {
    for (const P of [PARAMETROS_V3, parametrosDe('yal'), parametrosDe('filete')]) {
      for (const conVarias of [true, false]) {
        for (const i of T.itemsAyuda(P, conVarias)) { expect(i.titulo).not.toMatch(PROHIBIDAS); expect(i.texto).not.toMatch(PROHIBIDAS) }
        for (const c of CAUSAS_MICRO) expect(T.definicionCausa(c, P, conVarias)).not.toMatch(PROHIBIDAS)
      }
    }
    for (const cal of [calibracionDe('chonchi'), calibracionDe('yal'), null]) {
      const notas = T.notasAyuda({ cal, probableTotal: 8, porModo: { a_la_vez: 15, en_cadena: 1, tras_paro_otra: 2 }, verHora: 46 })
      for (const n of notas) for (const parte of n) expect(parte.texto).not.toMatch(PROHIBIDAS)
    }
    expect(T.textoObservacion('Chonchi', '2026-11-02')).not.toMatch(PROHIBIDAS)
  })

  it('lo que dicen el resumen y el globo con las 339 micro reales de los 10 turnos validados (chips, barra, línea de causa, forma, reglas que no aplicaron, leyenda y pie) no dice nada prohibido', () => {
    let revisadas = 0
    for (const t of TURNOS) {
      const micros = clasificar(t)
      const cal = calibracionDe(t.planta === 'Chonchi' ? 'chonchi' : 'filete')
      const r = resumirCausas(micros, cal)
      const textos: string[] = [T.ariaBarra(r.total, r.causas), ...r.causas.flatMap((c) => Object.values(T.textoChip(c.causa, c.n, c.probable, c.segundos)))]
      textos.push(T.cifraSinCalibrar(r.total), T.microDeCeroSegundos(20, 7), T.cifraProbable(r.probableTotal ?? 0), T.deTotal(r.total), T.resumenAccesibleMicro(micros.length))
      for (const q of micros) {
        const l = T.lineaCausa(q.evidencia)
        const tit = T.tituloGlobo('Ev 1', q.duracionS, '10:00:00')
        textos.push(l.prefijo ?? '', l.nombre, l.detalle, T.detalleForma(q.evidencia, { fila: q.fila, nombre: 'Ev 1', durS: q.duracionS }) ?? '', tit.principal, tit.sinAnotar, q.tabla.leyendaInicio ?? '', ...q.descartadas.flatMap((d) => [d.titulo, d.texto]))
        revisadas++
      }
      for (const x of textos) expect(sp(x), `${t.planta} ${t.id}`).not.toMatch(PROHIBIDAS)
    }
    expect(revisadas).toBe(339)
  })

  it('el vocabulario es el pedido: «causa probable» para el estimado, «causa posible» para la coincidencia, y el pie no dice «prueba» de más', () => {
    expect(T.TXT_RESUMEN.conCausaProbable).toBe('con causa probable')
    expect(T.TXT_RESUMEN.leyendaProbable).toBe('causa probable')
    expect(T.TXT_RESUMEN.leyendaPosible).toBe('causa posible')
    expect(T.TXT_GLOBO.causaPosible).toBe('Causa posible:')
    expect(T.TXT_GLOBO.pieGeneral).toBe('Causa posible no prueba que eso la provocó: lo calcula el monitor y se confirma en terreno.')
    expect(T.TXT_GLOBO.pieSin).toBe('Los datos aún no la explican. Hay que verlo en terreno.')
    expect(T.ARIA_GLOBO).toBe('Micro detención y su causa posible')
  })

  it('los textos exactos del spec: chips, cifra, rótulo, leyenda y encabezado, con espacio duro entre la cifra y su unidad', () => {
    expect(sp(T.textoChip('arranque', 3, 1, 75).cifra)).toBe('~1 de 3 micro')
    expect(T.textoChip('arranque', 3, 1, 75).tiempo).toBe(`1${T.NB}min${T.NB}15${T.NB}s`)
    expect(sp(T.textoChip('linea', 18, 7, 690).tiempo)).toBe('11 min 30 s')
    expect(T.textoChip('paro', 1, null, 15)).toEqual({ nombre: 'Al volver de una detención', cifra: `1${T.NB}micro`, tiempo: `15${T.NB}s` })
    expect(sp(T.textoChip('sin', 24, null, 645).tiempo)).toBe('10 min 45 s')
    expect(sp(T.cifraProbable(8) + T.deTotal(46))).toBe('~8de 46 micro')
    expect(sp(T.cifraSinCalibrar(46))).toBe('46 micro')
    expect(sp(T.microDeCeroSegundos(205, 135))).toBe('Shoplogix anotó 205 micro: estas 70 y 135 de 0 s, sin duración.')
    expect(T.microDeCeroSegundos(205, 135).split(/\s+/).length).toBeLessThanOrEqual(13)
    expect('rotuloChips' in T.TXT_RESUMEN).toBe(false)
    expect(T.TXT_RESUMEN.leyendaSin).toBe('sin contexto')
    expect(sp(T.textoChip('linea', 29, 12, 900).cifra)).toBe('~12 de 29 micro')
    expect(sp(T.textoChip('sin', 36, null, 742).cifra)).toBe('36 micro')
    expect(sp(T.textoChip('paro', 2, 0, 30).cifra)).toBe('0 de 2 micro')
    const t = T.tituloGlobo('Ev 2', 60, '10:02:13')
    expect(sp(`${t.principal} ${t.sinAnotar} · ${t.hora}`)).toBe('Ev 2 · micro de 60 s (+~20 s sin anotar) · 10:02:13')
  })

  it('el aviso de las micro de 0 s y la hora de planta: lo que dice el ⓘ coincide con lo que publica el backend (solo el total, `microN`)', () => {
    /* functions/publicMonitor.js descarta de `stopEvents` las detenciones de 0 s (`sec <= 0`) y suma `microN` por Baader en `live.mantencion.porMaquina`. */
    const fuente = readFileSync(resolve(__dirname, '../../../../../../functions/publicMonitor.js'), 'utf8')
    expect(fuente).toMatch(/if \(!desde \|\| sec <= 0\) continue/)
    expect(fuente).toMatch(/microN: k\.grupos\.micro\?\.n \?\? 0/)
    const notas = T.notasAyuda({ cal: null, probableTotal: null, porModo: null, verHora: 3 })
    expect(sp(notas.map((n) => n.map((p) => p.texto).join('')).join(' '))).toContain('Las de 0 s Shoplogix las anota con hora, pero sin duración. Al monitor llega solo cuántas son.')
  })

  it('las micro sin parámetros de planta caen a los de v3 y el resultado no cambia con una planta desconocida', () => {
    const d = { ...CHONCHI_0211_T2 }
    const base = clasificarMicros({ serie: { desde: d.pulse.serieMinuto.desde, maquinas: d.pulse.serieMinuto.maquinas.map((m) => ({ id: m.id, nombre: m.id, esperado: m.esperado, cycles: m.cycles })) }, stopEvents: d.live.stopEvents, stopReasons: d.live.stopReasons, stopMachines: d.live.stopMachines, inicioTurnoMs: Date.parse(d.live.scheduledStart) })
    const conPlanta = clasificarDoc(CHONCHI_0211_T2, { planta: 'chonchi' })
    expect(base.map((q: MicroClasificada) => [q.fila, q.inicioMs, q.causa, q.modo])).toEqual(conPlanta.map((q) => [q.fila, q.inicioMs, q.causa, q.modo]))
  })
})
