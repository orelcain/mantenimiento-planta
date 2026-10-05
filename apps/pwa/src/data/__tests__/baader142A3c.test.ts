import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { interiorSvg, type A3CDatos } from '../baader142A3c'
import { REGLETAS } from '../../utils/aprendizaje/a3c'

const assets = resolve(__dirname, '../../../public/learning-assets/baader-142/a3c')
const datos = JSON.parse(readFileSync(resolve(assets, 'a3c-datos.json'), 'utf8')) as A3CDatos

describe('integridad del paquete A3C real', () => {
  it('conserva los bornes, LED y posiciones sin etiqueta del plano', () => {
    const numeros = datos.bornes.map(b => b.borne)
    expect(numeros).toHaveLength(144)
    expect(new Set(numeros).size).toBe(144)
    expect(numeros).not.toContain(135)
    expect(datos.bornes.filter(b => b.led)).toHaveLength(95)
    expect(datos.bornes.filter(b => b.sentido === 'sin_etiqueta')).toHaveLength(41)
    expect(datos.ledsEstado).toHaveLength(16)
    expect(new Set(datos.ledsEstado.map(l => l.id)).size).toBe(16)
  })

  it('mantiene válidas las referencias entre los 145 elementos y sus bornes', () => {
    expect(Object.keys(datos.elementos)).toHaveLength(145)
    const numeros = new Set(datos.bornes.map(b => b.borne))
    for (const b of datos.bornes) {
      if (b.elemento !== null) expect(b.elemento in datos.elementos).toBe(true)
    }
    for (const e of Object.values(datos.elementos)) {
      for (const n of e.borne) expect(numeros.has(n)).toBe(true)
    }
  })

  it('documenta cada elemento de certeza alta o media y deja 13 en baja', () => {
    const todos = Object.entries(datos.elementos)
    const bajos = todos.filter(([, e]) => e.certeza === 'baja').map(([k]) => k)
    expect(bajos.sort()).toEqual(['A5', 'B30', 'B40', 'B41', 'B50', 'H10', 'X13', 'Y31', 'Y32', 'Y33', 'Y34', 'Y35', 'Y36'])
    expect(datos.elementos.Y4!.certeza).toBe('media')
    for (const [k, e] of todos.filter(([, x]) => x.certeza !== 'baja')) {
      if (e.que_hace.startsWith('Sin descripción')) throw new Error(`${k}: sin descripción pese a certeza ${e.certeza}`)
    }
    // Los 33 elementos investigados en esta ronda traen fuentes; el resto aún no tiene el campo.
    const investigados = ['A3C.Entregen', 'A3C.R_L_SM', 'A3C.Reset', 'A4', 'B6', 'B11', 'B15', 'B18', 'B19', 'C1', 'C2', 'J6', 'J7', 'J8', 'J9', 'J10', 'J11', 'R1', 'R2', 'S25', 'SM6', 'SM6-1', 'T1', 'T2', 'V1', 'V2', 'X6', 'X17', 'Y3', 'Y4', 'Y6', 'Y15', 'Y52']
    for (const k of investigados) expect(datos.elementos[k]!.fuentes?.length, k).toBeGreaterThan(0)
    expect(todos.filter(([, e]) => e.fuentes).map(([k]) => k).sort()).toEqual([...investigados].sort())
    for (const k of bajos) expect(datos.elementos[k]!.pregunta_terreno).toBeTruthy()
  })

  it('marca como inductivos solo los sensores que el manual lista así', () => {
    const inductivos = Object.entries(datos.elementos).filter(([, e]) => e.tipo_sensor).map(([k]) => k)
    expect(inductivos.sort()).toEqual(['B1', 'B10', 'B11', 'B12', 'B14', 'B15', 'B16', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'])
    for (const k of inductivos) expect(datos.elementos[k]!.tipo_sensor).toMatch(/^Interruptor de aproximación inductivo \(manual 2005, p\. 6[67]\)$/)
  })

  it('incluye doce preguntas válidas, repartidas entre PC y teléfono', () => {
    expect(datos.quiz).toHaveLength(12)
    expect(datos.quiz.filter(p => p.contexto === 'pc')).toHaveLength(6)
    expect(datos.quiz.filter(p => p.contexto === 'telefono')).toHaveLength(6)
    const conLed = new Set(datos.bornes.filter(b => b.led).map(b => b.borne))
    for (const p of datos.quiz) {
      expect(Number.isInteger(p.ok)).toBe(true)
      expect(p.ok).toBeGreaterThanOrEqual(0)
      expect(p.ok).toBeLessThan(p.ops.length)
      for (const n of [...p.lit, ...(p.after ?? [])]) expect(conLed.has(n)).toBe(true)
    }
  })

  it('cubre cada borne exactamente una vez con las siete regletas y sus presets', () => {
    expect(REGLETAS).toHaveLength(7)
    const cubiertos = REGLETAS.flatMap(r => Array.from({ length: r.hasta - r.desde + 1 }, (_, i) => r.desde + i))
    expect(cubiertos).toHaveLength(144)
    expect(new Set(cubiertos).size).toBe(144)
    expect([...cubiertos].sort((a, b) => a - b)).toEqual(datos.bornes.map(b => b.borne).sort((a, b) => a - b))
    for (const r of REGLETAS) expect(r.preset in datos.presets_v5.hoja23).toBe(true)
  })

  it.each(['hoja22.svg', 'hoja23.svg'])('extrae %s sin envoltorio, estilos ni textos y prefija las clases', archivo => {
    const interior = interiorSvg(readFileSync(resolve(assets, archivo), 'utf8'))
    expect(typeof interior).toBe('string')
    expect(interior).not.toContain('<svg')
    expect(interior).not.toContain('<style')
    expect(interior).not.toContain('<text')
    expect(interior).toContain('a3c-tinta')
    expect(interior).not.toContain('class="tinta')
    const clases = [...interior.matchAll(/class="([^"]*)"/g)]
    expect(clases.length).toBeGreaterThan(0)
    for (const [, lista = ''] of clases) {
      for (const clase of lista.split(/\s+/)) expect(clase).toMatch(/^a3c-/)
    }
  })
})
