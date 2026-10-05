import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { A3CDatos } from '@/data/baader142A3c'
import {
  buscar, camaraDePreset, centroRect, deltaRuedaPx, objetivosHoja22, resolverToqueAmbiguo, claveDeBorne, codigoCorto, colorLed, construirModelo,
  describir, elegirEn, guardarIdioma, guardarRacha, leerIdioma, leerRacha,
  limitarCamara, lineaLed, lineasDeTexto, matrizCamara, nuevoQuiz, objetivosHoja23,
  pantallaAUnidades, puntosLed, recorteRegleta, regletaDe, reiniciar, responder,
  siguiente, SIN_DESCRIPCION, tipoRespaldado, zoomCamara, type LimitesCamara,
} from '../a3c'

const datos = JSON.parse(readFileSync(resolve(__dirname, '../../../../public/learning-assets/baader-142/a3c/a3c-datos.json'), 'utf8')) as A3CDatos
const m = construirModelo(datos)
const item = (clave: string) => {
  const resultado = describir(m, clave, 'es')
  expect(resultado).not.toBeNull()
  return resultado!
}

describe('selección y descripción con datos reales', () => {
  it.each([[45, 'e:B4'], [68, 'e:Y8'], [51, 'b:51'], [11, 'b:11']] as const)('resuelve el borne %i como %s', (n, clave) => {
    expect(claveDeBorne(m, n)).toBe(clave)
  })

  it('describe el sensor B4 y su LED rojo', () => {
    const b4 = item('e:B4')
    expect(b4).toMatchObject({ tipo: 'sensor', bornes: [45], leds: [45] })
    expect(lineaLed(b4)).toMatchObject({ grande: 'LED 45', color: 'r', encendible: true })
  })

  it('explica la salida Y8, el rango B13 y el par de LED del encoder B21', () => {
    expect(item('e:Y8').tipo).toBe('salida')
    expect(lineaLed(item('e:Y8')).texto).toContain('activa la salida')
    expect(item('e:B13').leds).toEqual(Array.from({ length: 10 }, (_, i) => 32 + i))
    expect(lineaLed(item('e:B13')).grande).toBe('LED 32–41')
    expect(item('e:B21').tipo).toBe('encoder')
    expect(item('e:B21').leds).toHaveLength(2)
    expect(lineaLed(item('e:B21')).texto).toContain('prende con la señal del elemento')
  })

  it('asocia STEP2 al motor SM2 aunque no tenga bornes', () => {
    const sm2 = item('e:SM2')
    expect(sm2.tipo).toBe('motor')
    expect(sm2.bornes).toEqual([])
    expect(sm2.ledsEstado.map(l => l.id)).toContain('STEP2')
    expect(lineaLed(sm2).encendible).toBe(true)
  })

  it('distingue un borne sin etiqueta de un LED de estado', () => {
    expect(item('b:11')).toMatchObject({ tipo: 'sin', nombre: 'Sin etiqueta en el plano' })
    expect(lineaLed(item('b:11')).grande).toBe('Sin LED')
    expect(item('l:RL1').tipo).toBe('led')
    expect(puntosLed(m, item('l:RL1'))).toHaveLength(1)
  })

  it('no presenta como documentados los elementos de certeza baja', () => {
    const bajos = Object.entries(datos.elementos).filter(([, e]) => e.certeza === 'baja')
    expect(bajos.length).toBeGreaterThan(0)
    for (const [clave] of bajos) expect(item(`e:${clave}`).queHace).toEqual({ texto: SIN_DESCRIPCION, conDatos: false })
  })

  it('la píldora de tipo y el módulo solo salen donde una fuente propia los respalda', () => {
    // F27, Q0, B30: sin tipo ni módulo; el tipo de un baja no se usa ni para el LED ni para la señal.
    for (const k of ['F27', 'Q0', 'B30', 'B40', 'B41']) {
      expect(item(`e:${k}`), k).toMatchObject({ mostrarTipo: false, modulo: null })
    }
    expect(item('e:B30').tipo).toBe('otro')
    expect(item('e:Y3')).toMatchObject({ mostrarTipo: false, tipo: 'otro', cuandoLed: '', senal: 'El plano no indica el sentido' })
    expect(lineaLed(item('e:Y3')).texto).not.toContain('activa la salida')
    // B42 es alta, pero solo del plano: sin píldora de tipo (el nombre ya lo dice).
    expect(item('e:B42')).toMatchObject({ mostrarTipo: false, modulo: null })
    // B11: el manual lo lista como interruptor de aproximación; su módulo era cercanía en el dibujo.
    expect(item('e:B11')).toMatchObject({ mostrarTipo: true, tipo: 'sensor', modulo: null })
    // B1 y SM2: tipo del manual y módulo rotulado.
    expect(item('e:B1')).toMatchObject({ mostrarTipo: true, modulo: 'SM1: centrado' })
    expect(item('e:SM2')).toMatchObject({ mostrarTipo: true, modulo: 'SM2: cuchilla hendedora' })
    // Un pulsador que no llega a la A3C no es «Sensor · entrada».
    expect(item('e:S1').mostrarTipo).toBe(false)
    expect(tipoRespaldado(datos.elementos.S1!)).toBe(false)
    expect(tipoRespaldado(datos.elementos.Y8!)).toBe(true)
  })

  it('los bornes 112–115 se muestran como «Contacto N», también en «Original», y ya no dicen peso', () => {
    for (const [n, c] of [[112, '2'], [113, '4'], [114, '8'], [115, '16']] as const) {
      for (const idioma of ['es', 'or'] as const) {
        const it = describir(m, `b:${n}`, idioma)!
        expect(it.nombre).toBe(`Contacto ${c} (grupo S20–S24)`)
        expect(it.enPlano).toBe(`Contacto ${c} (grupo S20–S24)`)
        expect(JSON.stringify(it)).not.toMatch(/peso/i)
      }
    }
  })

  it('muestra el nombre original con apoyo en español solo cuando corresponde', () => {
    expect(describir(m, 'e:Y8', 'or')).toMatchObject({ nombre: datos.elementos.Y8!.original, nombreApoyo: datos.elementos.Y8!.es })
    expect(item('e:Y8').nombreApoyo).toBeNull()
  })

  it.each([[95, 'g'], [111, 'g'], [94, 'r'], [112, 'r']] as const)('asigna el color del borne %i', (n, color) => {
    expect(colorLed(n)).toBe(color)
  })

  it('no asigna regleta al borne inexistente 135', () => {
    expect(regletaDe(135)).toBeUndefined()
  })

  it.each([[1, 'B21A'], [33, 'bit1'], [11, '—'], [101, 'OK'], [112, 'S·2'], [115, 'S·16']] as const)('abrevia la señal del borne %i', (n, codigo) => {
    expect(codigoCorto(m.bornes.get(n)!)).toBe(codigo)
  })
})

describe('búsqueda y textos', () => {
  it('agrupa B4 entre los sensores', () => {
    expect(buscar(m, 'B4', 'es').find(g => g.titulo === 'Sensores')?.items.map(i => i.codigo)).toContain('B4')
  })

  it.each([['68', 'e:Y8'], ['140', claveDeBorne(m, 140)], ['codificador', 'e:B13']])('encuentra %s', (consulta, clave) => {
    expect(buscar(m, consulta, 'es').flatMap(g => g.items.map(i => i.clave))).toContain(clave)
  })

  it('encuentra el expulsor por su nombre español', () => {
    expect(buscar(m, 'expulsor', 'es').flatMap(g => g.items).length).toBeGreaterThan(0)
  })

  it('respeta los largos originales y las líneas traducidas del layout', () => {
    const textos = [...datos.textos.hoja22, ...datos.textos.hoja23].filter(t => t.layout_v5.k === 't')
    expect(textos.length).toBeGreaterThan(0)
    // Medido en el v5: ningún texto en español necesitó partirse en dos líneas.
    expect(textos.every(t => (t.layout_v5.lines?.length ?? 0) >= 1)).toBe(true)
    for (const t of textos) {
      expect(lineasDeTexto(t, 'or')).toHaveLength(1)
      expect(lineasDeTexto(t, 'or')[0]?.largo).toBe(t.layout_v5.tlo)
      expect(lineasDeTexto(t, 'es')).toHaveLength(t.layout_v5.lines!.length)
    }
  })

  it('conserva el anclaje de los títulos en ambos idiomas', () => {
    const titulos = [...datos.textos.hoja22, ...datos.textos.hoja23].filter(t => t.layout_v5.k === 'title')
    expect(titulos.length).toBeGreaterThan(0)
    for (const t of titulos) for (const idioma of ['or', 'es'] as const) {
      const lineas = lineasDeTexto(t, idioma)
      expect(lineas.length).toBeGreaterThan(0)
      for (const linea of lineas) expect(linea.anchor).toBe(t.layout_v5.a)
    }
  })
})

describe('cámara y selección geométrica', () => {
  const lim: LimitesCamara = { minW: 50, maxW: 1000, bounds: [0, 0, 1200, 1200] }
  const camara = { cx: 400, cy: 500, w: 600 }

  it.each([[800, 400, 600], [400, 800, 200]])('encaja el bb en una pantalla de %i × %i', (vw, vh, w) => {
    expect(camaraDePreset({ bb: [10, 20, 210, 320], cx: -1, cy: -1, w: 1, l: 'Prueba' }, vw, vh)).toEqual({ cx: 110, cy: 170, w })
  })

  it('limita el ancho y ambos extremos del centro', () => {
    expect(limitarCamara({ cx: -10, cy: 1300, w: 2000 }, lim)).toEqual({ cx: 0, cy: 1200, w: 1000 })
    expect(limitarCamara({ cx: 1300, cy: -10, w: 1 }, lim)).toEqual({ cx: 1200, cy: 0, w: 50 })
  })

  it('mantiene fijo el punto bajo el cursor al acercar', () => {
    const antes = pantallaAUnidades(camara, 800, 400, 170, 290)
    const zoom = zoomCamara(camara, 0.5, lim, ...antes)
    const despues = pantallaAUnidades(zoom, 800, 400, 170, 290)
    expect(zoom.w).toBe(300)
    expect(despues[0]).toBeCloseTo(antes[0])
    expect(despues[1]).toBeCloseTo(antes[1])
  })

  it('invierte la matriz y hace coincidir los centros', () => {
    expect(pantallaAUnidades(camara, 800, 400, 400, 200)).toEqual([400, 500])
    const { s, tx, ty } = matrizCamara(camara, 800, 400)
    for (const [x, y] of [[0, 0], [325, 710], [400, 500]] as [number, number][]) {
      const u = pantallaAUnidades(camara, 800, 400, x * s + tx, y * s + ty)
      expect(u[0]).toBeCloseTo(x)
      expect(u[1]).toBeCloseTo(y)
    }
  })

  it('elige B4 al tocar el centro del borne 45 y nada lejos del dibujo', () => {
    const objetivos = objetivosHoja23(m)
    const r = m.bornes.get(45)!.celda
    expect(elegirEn(objetivos, [r.x + r.w / 2, r.y + r.h / 2], 0).cerca[0]?.o).toMatchObject({ clave: 'e:B4', n: 45 })
    expect(elegirEn(objetivos, [-10000, -10000], 0)).toEqual({ cerca: [], distintos: 0 })
  })

  it('recorta la regleta 66–94 con dimensiones positivas', () => {
    const recorte = recorteRegleta(m, 68)!
    expect(recorte.regleta).toMatchObject({ desde: 66, hasta: 94 })
    expect(recorte.viewBox[2]).toBeGreaterThan(0)
    expect(recorte.viewBox[3]).toBeGreaterThan(0)
  })
})

describe('quiz', () => {
  it('puntúa una sola vez, conserva el récord y permite repetir errores o todas las preguntas', () => {
    const preguntas = datos.quiz.slice(0, 3)
    let s = nuevoQuiz(3)
    expect(s).toEqual({ orden: [0, 1, 2], pos: 0, aciertos: [], elegida: null, revision: false, racha: 0, mejor: 0 })
    s = responder(s, preguntas, preguntas[0]!.ok)
    expect(s).toMatchObject({ racha: 1, mejor: 1, aciertos: [true] })
    expect(responder(s, preguntas, (preguntas[0]!.ok + 1) % preguntas[0]!.ops.length)).toBe(s)
    s = responder(siguiente(s), preguntas, preguntas[1]!.ok)
    expect(s).toMatchObject({ racha: 2, mejor: 2 })
    s = responder(siguiente(s), preguntas, (preguntas[2]!.ok + 1) % preguntas[2]!.ops.length)
    expect(s).toMatchObject({ racha: 0, mejor: 2, aciertos: [true, true, false] })
    s = siguiente(s)
    expect(s.revision).toBe(true)
    const errores = reiniciar(s, 3, true)
    expect(errores).toMatchObject({ orden: [2], pos: 0, aciertos: [], elegida: null, revision: false, mejor: 2 })
    expect(reiniciar(errores, 3, false).orden).toEqual([0, 1, 2])
  })
})

describe('persistencia local', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('guarda y recupera idioma y racha', () => {
    expect(leerIdioma()).toBe('es')
    expect(leerRacha()).toEqual({ racha: 0, mejor: 0 })
    guardarIdioma('or')
    expect(leerIdioma()).toBe('or')
    guardarIdioma('es')
    expect(leerIdioma()).toBe('es')
    guardarRacha(3, 7)
    expect(leerRacha()).toEqual({ racha: 3, mejor: 7 })
  })

  it('recupera valores predeterminados cuando falla getItem', () => {
    const spy = vi.fn(() => { throw new Error('Almacenamiento no disponible') })
    vi.stubGlobal('localStorage', { getItem: spy, setItem: spy, clear: () => {} })
    expect(leerIdioma()).toBe('es')
    expect(leerRacha()).toEqual({ racha: 0, mejor: 0 })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('no lanza cuando falla setItem', () => {
    const spy = vi.fn(() => { throw new Error('Almacenamiento no disponible') })
    vi.stubGlobal('localStorage', { getItem: spy, setItem: spy, clear: () => {} })
    expect(() => guardarIdioma('or')).not.toThrow()
    expect(() => guardarRacha(2, 5)).not.toThrow()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('descarta una racha almacenada con JSON corrupto', () => {
    localStorage.setItem('a3c-racha', '{corrupto')
    expect(leerRacha()).toEqual({ racha: 0, mejor: 0 })
  })
})

describe('toque ambiguo en el plano de ubicación (hoja 22)', () => {
  const obj22 = objetivosHoja22(m)
  const grupoS = ['S20', 'S21', 'S22', 'S23', 'S24', 'S25'].map(k => `e:${k}`)
  const sobre = (clave: string) => centroRect(obj22.find(o => o.clave === clave)!.r)

  it('S20..S25 comparten posición: con el zoom al límite ofrece la lista con los seis', () => {
    const u = sobre('e:S20')
    const r = resolverToqueAmbiguo(elegirEn(obj22, u, 22 / 4.9).cerca, 4.9, false)
    expect(r?.tipo).toBe('lista')
    if (r?.tipo === 'lista') expect(grupoS.every(c => r.claves.includes(c))).toBe(true)
  })

  it('si aún se puede acercar, acerca en vez de adivinar', () => {
    const u = sobre('e:S20')
    expect(resolverToqueAmbiguo(elegirEn(obj22, u, 22 / 4.9).cerca, 4.9, true)).toEqual({ tipo: 'acercar' })
  })

  it('sin empate elige el más cercano al punto tocado', () => {
    const cerca = [
      { o: { clave: 'e:A', r: { x: 0, y: 0, w: 2, h: 2 } }, d: 0 },
      { o: { clave: 'e:B', r: { x: 3, y: 0, w: 2, h: 2 } }, d: 1.5 },
    ]
    expect(resolverToqueAmbiguo(cerca, 5, false)).toEqual({ tipo: 'elegir', clave: 'e:A' })
  })

  it('un vecino lejos en pantalla no es ambiguo y un toque vacío devuelve null', () => {
    const cerca = [
      { o: { clave: 'e:A', r: { x: 0, y: 0, w: 2, h: 2 } }, d: 0 },
      { o: { clave: 'e:B', r: { x: 30, y: 0, w: 2, h: 2 } }, d: 1 },
    ]
    expect(resolverToqueAmbiguo(cerca, 5, false)).toEqual({ tipo: 'elegir', clave: 'e:A' })
    expect(resolverToqueAmbiguo([], 5, false)).toBeNull()
  })
})

describe('rueda', () => {
  it('normaliza líneas y páginas a píxeles', () => {
    expect(deltaRuedaPx(100, 0)).toBe(100)
    expect(deltaRuedaPx(3, 1)).toBe(48)
    expect(deltaRuedaPx(1, 2)).toBe(100)
  })
})
