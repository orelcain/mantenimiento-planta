import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { A3CDatos } from '@/data/baader142A3c'
import { MODULOS, PREGUNTAS_TERRENO, SEGURIDAD } from '@/data/baader142Diagnostico'
import {
  CODIGOS_MANUAL,
  CLAVE_LOCAL,
  cerrar,
  codigosDeElemento,
  codigosDeModulo,
  diagnosticar,
  leerLocal,
  marcar,
  revisados,
  teclear,
} from '../a3cDiagnostico'

const datos = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../public/learning-assets/baader-142/a3c/a3c-datos.json'), 'utf8'),
) as A3CDatos

const TODOS = [...CODIGOS_MANUAL, 900, 950, 999].map(n => diagnosticar(n)!)
/** Cita con página del manual o con hoja del plano. */
const CON_PAGINA = /(Manual 2005, p\. \d+|Plano 888, hojas? \d+)/

beforeEach(() => localStorage.clear())

describe('Diagnóstico A3C · datos', () => {
  it('cubre los códigos de la tabla del manual (p. 41–42)', () => {
    expect(CODIGOS_MANUAL).toEqual([
      770, 771, 772, 773, 774, 775, 777,
      801, 802, 803, 804, 805, 811, 812, 813, 814, 815, 821, 822, 823, 824, 825, 826, 827,
      831, 832, 833, 834, 835, 841, 842, 843, 844, 845, 851, 852, 853, 854, 855, 861, 862, 863, 864, 865,
    ])
    for (const n of [776, 800, 806, 809, 828, 866, 870, 899, 0, 1000]) expect(diagnosticar(n)).toBeNull()
  })

  it('todo paso y todo código tienen fuente con página u hoja', () => {
    for (const d of TODOS) {
      expect(d.fuente).toMatch(CON_PAGINA)
      for (const p of d.pasos) expect(p.fuente, `${d.etiqueta} · ${p.titulo}`).toMatch(CON_PAGINA)
    }
    for (const s of SEGURIDAD) expect(s.fuente).toMatch(/Manual 2005, p\. [45]/)
  })

  it('todo elemento referenciado existe en a3c-datos.json', () => {
    const claves = new Set<string>()
    for (const d of TODOS) for (const p of d.pasos) if (p.elemento) claves.add(p.elemento)
    for (const d of TODOS) for (const s of d.motores) [s.cero, s.encoder, s.sm].forEach(k => claves.add(k))
    for (const mod of MODULOS) mod.elementos.forEach(k => claves.add(k))
    expect(claves.size).toBeGreaterThan(15)
    for (const k of claves) expect(datos.elementos[k], k).toBeTruthy()
  })

  it('ningún texto especula sin cita (probablemente / podría / se recomienda)', () => {
    const textos = TODOS.flatMap(d => [d.titulo, d.aviso ?? '', d.accion ?? '', ...d.pasos.flatMap(p => [p.titulo, p.porque]), ...d.noIndica.flatMap(x => [x.texto, x.pregunta])])
    for (const t of [...textos, ...PREGUNTAS_TERRENO]) expect(t).not.toMatch(/probablemente|podr[íi]a|se recomienda/i)
  })

  it('conserva las 9 preguntas para terreno', () => {
    expect(PREGUNTAS_TERRENO).toHaveLength(9)
  })

  it('E 803: SM3 aspirador, sensor B3 y ajuste 0,8 mm, sin aviso de dígitos', () => {
    const d = diagnosticar(803)!
    expect(d.modulo).toBe('SM3 · Aspirador')
    expect(d.aviso).toBeNull()
    expect(d.pasos.map(p => p.elemento ?? p.tipo)).toEqual(['B3', 'ajuste'])
    expect(d.pasos[0]!.fuente).toBe('Manual 2005, p. 42')
  })

  it('E 821 y E 802: dígitos 1 y 2 muestran el aviso y los dos motores posibles', () => {
    const d = diagnosticar(802)!
    expect(d.aviso).toMatch(/verificar en terreno/)
    expect(d.aviso).toMatch(/p\. 41/)
    expect(d.aviso).toMatch(/p\. 45/)
    expect(d.pasos.filter(p => p.elemento).map(p => p.elemento)).toEqual(['B2', 'B1'])
    expect(diagnosticar(821)!.accion).toMatch(/Pulsar el pulsador I/)
  })

  it('E 827 muestra su aviso y B15 antes que B14', () => {
    const d = diagnosticar(827)!
    expect(d.aviso).toMatch(/verificar en terreno/)
    expect(d.pasos.filter(p => p.elemento).map(p => p.elemento)).toEqual(['B15', 'B14'])
    expect(d.pasos.find(p => p.elemento === 'B14')!.verificar).toBe(true)
    expect(d.noIndica[0]!.pregunta).toMatch(/B15, B14/)
  })

  it('códigos de un módulo: SM3 sin duda; SM1 con los dos grupos', () => {
    expect(codigosDeModulo(MODULOS.find(m => m.id === 'sm3')!)).toEqual([{ titulo: null, codigos: [803, 813, 823, 833, 843, 853, 863, 773] }])
    const sm1 = codigosDeModulo(MODULOS.find(m => m.id === 'sm1')!)
    expect(sm1.map(g => g.codigos[0])).toEqual([801, 802])
    expect(codigosDeElemento('B15')).toEqual([827])
  })
})

describe('Diagnóstico A3C · teclado y almacenamiento local', () => {
  it('el teclado arma hasta tres cifras y borra', () => {
    let c = ''
    for (const t of ['8', '0', '3'] as const) c = teclear(c, t)
    expect(c).toBe('803')
    expect(teclear(c, 'borrar')).toBe('80')
    expect(teclear(c, '7')).toBe('7')
  })

  it('marca, cuenta revisados, cierra y guarda solo en el equipo', () => {
    const d = diagnosticar(803)!
    let e = leerLocal()
    e = marcar(e, 'E 803#0', 'descartado')
    expect(revisados(e, d)).toBe(1)
    e = marcar(e, 'E 803#0', 'descartado')
    expect(revisados(e, d)).toBe(0)
    e = cerrar(marcar(e, 'E 803#1', 'sospechoso'), d)
    expect(e).toEqual({ marcas: {}, cerrados: 1 })
    localStorage.setItem(CLAVE_LOCAL, 'no es json')
    expect(leerLocal()).toEqual({ marcas: {}, cerrados: 0 })
  })
})
