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
    expect(datos.bornes.filter(b => b.sentido === 'sin_etiqueta')).toHaveLength(40) // 41 sin rótulo en la hoja 23; el 132 ya tiene sentido (entrada, hojas 1 y 10)
    // 16 de la zona central + un «60V DC» por bloque SM1..SM6 junto a su conector X4.
    expect(datos.ledsEstado).toHaveLength(22)
    expect(new Set(datos.ledsEstado.map(l => l.id)).size).toBe(22)
  })

  it('126 → B50 (hoja 11) y 127 → B42 (hoja 21); 128 conserva el rótulo de la hoja 23 sin elemento', () => {
    const b = (n: number) => datos.bornes.find(x => x.borne === n)!
    expect(b(126).elemento).toBe('B50')
    expect(b(126).nota).toMatch(/hoja 11/)
    expect(b(127).elemento).toBe('B42')
    expect(b(127).nota).toMatch(/hoja 21/)
    expect(b(128).elemento).toBeNull()
    expect(b(128).senal_original).toBe('8) B50 Position Kratzer C')
    expect(b(128).nota).toBe('La hoja 23 rotula aquí B50; las hojas 9 y 21 le llevan la señal A3C_128 del contacto K7 y la hoja 11 cablea B50 al 126.')
    expect(datos.elementos.B50!.borne).toEqual([126])
    expect(datos.elementos.B42!.borne).toEqual([127])
    // Geometría y LED intactos.
    expect(b(126).led).toEqual({ x: 562.68, y: 814.25, r: 2.9 })
    expect(b(128).led).toEqual({ x: 562.68, y: 831.26, r: 2.9 })
  })

  it('mantiene válidas las referencias entre los 146 elementos y sus bornes', () => {
    expect(Object.keys(datos.elementos)).toHaveLength(146)
    const numeros = new Set(datos.bornes.map(b => b.borne))
    for (const b of datos.bornes) {
      if (b.elemento !== null) expect(b.elemento in datos.elementos).toBe(true)
    }
    for (const e of Object.values(datos.elementos)) {
      for (const n of e.borne) expect(numeros.has(n)).toBe(true)
    }
  })

  it('solo afirma lo respaldado: 104 en certeza alta con fuentes y 42 en baja sin descripción', () => {
    const todos = Object.entries(datos.elementos)
    for (const [k, e] of todos) expect(['alta', 'baja'], k).toContain(e.certeza)
    const altos = todos.filter(([, e]) => e.certeza === 'alta')
    const bajos = todos.filter(([, e]) => e.certeza === 'baja').map(([k]) => k)
    expect(altos).toHaveLength(104)
    expect(bajos.sort()).toEqual([
      'A3C.Entregen', 'A3C.R_L_SM', 'A3C.Reset', 'A3C.Step_SM', 'A5', 'B30', 'B40', 'B41', 'B50', 'H10',
      'J10', 'J11', 'J6', 'J7', 'J8', 'J9', 'Q0', 'TP', 'TP_5VV', 'TP_GNDDC',
      'X1', 'X10', 'X12', 'X13', 'X14', 'X15', 'X17', 'X2', 'X20', 'X5', 'X6', 'X7',
      'Y3', 'Y31', 'Y32', 'Y33', 'Y34', 'Y35', 'Y36', 'Y51', 'Y52', 'Y6',
    ])
    for (const [k, e] of altos) {
      expect(e.que_hace.startsWith('Sin descripción'), `${k}: sin descripción pese a certeza alta`).toBe(false)
      expect(e.fuentes?.length, `${k}: certeza alta sin fuentes`).toBeGreaterThan(0)
      expect(e.pregunta_terreno, `${k}: certeza alta con pregunta de terreno`).toBeUndefined()
      // Nada por analogía ni por posición: el texto no puede dudar de lo que afirma.
      expect(e.que_hace, k).not.toMatch(/probablemente|sería|podría|por contexto|según variante|por analogía/i)
    }
    for (const k of bajos) {
      const e = datos.elementos[k]!
      expect(e.que_hace, k).toBe('Sin descripción en el plano ni el manual.')
      expect(e.fuentes, k).toBeUndefined()
      expect(e.pregunta_terreno, k).toBeTruthy()
    }
    expect(datos.elementos.Y4!.certeza).toBe('alta')
    expect(datos.elementos.Y3!.certeza).toBe('baja')
  })

  it('marca como inductivos solo los sensores que el manual lista así', () => {
    const inductivos = Object.entries(datos.elementos).filter(([, e]) => e.tipo_sensor).map(([k]) => k)
    expect(inductivos.sort()).toEqual(['B1', 'B10', 'B11', 'B12', 'B14', 'B15', 'B16', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'])
    for (const k of inductivos) expect(datos.elementos[k]!.tipo_sensor).toMatch(/^Interruptor de aproximación inductivo \(manual 2005, p\. 6[67]\)$/)
  })

  it('el texto de LED de cada elemento es solo una de las frases genéricas de la tarjeta, o null', () => {
    const permitidos = new Set<string | null>([
      null,
      'Se enciende cuando la A3C recibe la señal del elemento.',
      'Se enciende cuando la A3C activa la salida.',
      'Se enciende cuando la A3C recibe la señal del elemento; hay un LED por bit (Bit 0 a Bit 9).',
    ])
    for (const [k, e] of Object.entries(datos.elementos)) expect(permitidos.has(e.led_texto), k).toBe(true)
  })

  it('los nombres y las preguntas no afirman lo que ninguna fuente dice', () => {
    expect(datos.elementos.Q0!.es).toBe('Sin nombre en el plano')
    for (const k of ['F27', 'F28', 'F29']) expect(datos.elementos[k]!.es, k).toBe('Sobrecarga de motores (Überlast Motore)')
    const prohibidos = /protección térmica|interruptor principal|de seguridad|presostato|sin corriente|sentido de giro|parpade|a mano|acercas|metal|relé de|conector o bornera/i
    const textos = [
      ...Object.entries(datos.elementos).map(([k, e]) => [k, e.es] as const),
      ...datos.ledsEstado.map(l => [l.id, l.es] as const),
      ...datos.quiz.flatMap((p, i) => [[`quiz ${i + 1}`, `${p.q} ${p.why} ${p.ops.map(o => o[1]).join(' ')}`] as const]),
    ]
    for (const [k, t] of textos) expect(t, k).not.toMatch(prohibidos)
  })

  it('módulo: nulo en certeza baja; en alta solo donde el nombre o la hoja 22 lo rotulan', () => {
    for (const [k, e] of Object.entries(datos.elementos)) {
      if (e.certeza === 'baja') expect(e.modulo, k).toBeNull()
      if (e.certeza === 'baja') expect(e.led_texto, k).toBeNull()
    }
    const conModulo = Object.entries(datos.elementos).filter(([, e]) => e.modulo !== null).map(([k]) => k)
    expect(conModulo.sort()).toEqual(['A3C.X4', 'A3C.X5', 'B1', 'B2', 'B21', 'B22', 'B23', 'B24', 'B25', 'B3', 'B4', 'B5', 'B6', 'F1', 'F2', 'SM1', 'SM2', 'SM3', 'SM4', 'SM5'])
    for (const k of ['F27', 'F28', 'F29', 'Q0', 'B30', 'B40', 'B41', 'B42']) expect(datos.elementos[k]!.modulo, k).toBeNull()
  })

  it('los bornes 112 a 115 rotulan el contacto de la hoja 23, sin «peso»', () => {
    for (const [n, c] of [[112, '2'], [113, '4'], [114, '8'], [115, '16']] as const) {
      expect(datos.bornes.find(b => b.borne === n)!.senal_es).toBe(`Contacto ${c} (grupo S20–S24)`)
    }
  })

  it('ningún texto del paquete llama «peso» a un contacto', () => {
    const textos = [
      ...datos.bornes.map(b => b.senal_es),
      ...Object.values(datos.elementos).flatMap(e => [e.es, e.que_hace, e.led_texto ?? '', e.nota ?? '']),
      ...datos.quiz.map(p => `${p.q} ${p.why} ${p.ops.map(o => o[1]).join(' ')}`),
    ]
    for (const t of textos) expect(t).not.toMatch(/(^|[^a-záéíóúñ])pesos?([^a-záéíóúñ]|$)/i)
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
