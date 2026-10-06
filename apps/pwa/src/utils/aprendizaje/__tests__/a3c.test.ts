import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { A3CDatos } from '@/data/baader142A3c'
import {
  buscar, camaraDePreset, camaraPellizco, centroRect, deltaRuedaPx, objetivosHoja22, resolverToqueAmbiguo, claveDeBorne, codigoCorto, colorLed, construirModelo,
  describir, elegirEn, guardarIdioma, guardarRacha, leerIdioma, leerRacha,
  limitarCamara, lineaLed, lineasDeTexto, matrizCamara, nuevoQuiz, objetivosHoja23,
  pantallaAUnidades, puntosGrupo, puntosLed, puntosNeutros, recorteRegleta, regletaDe, reiniciar, responder,
  siguiente, SIN_DESCRIPCION, tipoRespaldado, zoomCamara, LEDS_ENCENDIDOS_FOTO, LEDS_ESTADO_FOTO, LEDS_FOTO, type LimitesCamara,
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

  it('B13: los 10 LED son un grupo de bits, no se encienden; B1 sí se enciende', () => {
    const b13 = item('e:B13')
    expect(b13.modoLed).toBe('contorno')
    expect(puntosLed(m, b13)).toEqual([])
    expect(puntosGrupo(m, b13)).toHaveLength(10)
    const l = lineaLed(b13)
    expect(l).toMatchObject({ grande: 'LED 32–41', color: null, grupo: true, encendible: true })
    expect(l.texto).toContain('32, 35 y 37 a 40')
    expect(l.texto).toContain('En la foto de la N2 solo estaban encendidos 32, 35 y 37 a 40')
    expect(b13.cuandoLed).toContain('32, 35 y 37 a 40')
    expect(b13.cuandoLed).not.toMatch(/se enciende cuando/i)
    expect(item('e:B1').modoLed).toBe('senal')
    expect(puntosGrupo(m, item('e:B1'))).toEqual([])
    expect(puntosLed(m, item('e:B1'))).toHaveLength(1)
    // Los únicos elementos con LED X5 marcados como grupo: B13, los pares A/B, el encoder de pulsos B27,
    // B11 (en reposo) e Y51/Y52 (las hojas 21 y 23 se contradicen).
    const otros = Object.keys(datos.elementos).filter(k => item(`e:${k}`).modoLed === 'contorno' && item(`e:${k}`).leds.length)
    expect(otros.sort()).toEqual(['B11', 'B13', 'B21', 'B22', 'B23', 'B24', 'B25', 'B27', 'Y51', 'Y52'])
  })

  it('explica la salida Y8, el rango B13 y el par de LED del encoder B21', () => {
    expect(item('e:Y8').tipo).toBe('salida')
    expect(lineaLed(item('e:Y8')).texto).toContain('activa la salida')
    expect(item('e:B13').leds).toEqual(Array.from({ length: 10 }, (_, i) => 32 + i))
    expect(lineaLed(item('e:B13')).grande).toBe('LED 32–41')
    expect(item('e:B21').tipo).toBe('encoder')
    expect(item('e:B21').leds).toHaveLength(2)
    expect(lineaLed(item('e:B21')).texto).toBe('Canal A = LED 1, canal B = LED 2. En la foto de la N2: 1 y 2 apagados.')
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
    // Un LED de estado elegido por sí mismo no se enciende: punto gris fijo.
    expect(puntosLed(m, item('l:RL1'))).toHaveLength(0)
    expect(puntosNeutros(m, item('l:RL1'))).toEqual([expect.objectContaining({ tono: 'gris' })])
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
    // Y3: certeza baja en el nombre, pero la hoja 23 marca su borne como salida: texto de salida y la duda aparte.
    expect(item('e:Y3')).toMatchObject({ mostrarTipo: false, tipo: 'salida', cuandoLed: '', senal: 'Salida: la A3C activa el elemento' })
    expect(lineaLed(item('e:Y3')).texto).toContain('prende cuando la A3C activa la salida')
    expect(item('e:Y3').preguntaTerreno).toBeTruthy()
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

  // Color según la foto de la N2: verdes también en 1–28 (pares desde 14) y 66–94, no solo 95–111.
  it.each([[42, 'r'], [5, 'g'], [72, 'g'], [116, 'r'], [95, 'g'], [111, 'g'], [94, 'g'], [112, 'r'], [11, 'r'], [140, 'r']] as const)(
    'asigna el color del borne %i',
    (n, color) => {
      expect(colorLed(n)).toBe(color)
    },
  )

  it('la franja de B1 (borne 42) es roja y la de un borne verde de la foto es verde', () => {
    expect(lineaLed(item('e:B1'))).toMatchObject({ grande: 'LED 42', color: 'r' })
    expect(lineaLed(item(claveDeBorne(m, 72))).color).toBe('g')
    expect(lineaLed(item(claveDeBorne(m, 68))).color).toBe('g')
    // Borne 5 = canal A de B23: grupo, no se enciende (sin color de encendido).
    expect(lineaLed(item(claveDeBorne(m, 5)))).toMatchObject({ color: null, grupo: true })
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

describe('pellizco anclado al punto medio de los dedos', () => {
  const lim: LimitesCamara = { minW: 50, maxW: 2000, bounds: [-60, 0, 780, 1131] }
  const c0 = { cx: 400, cy: 500, w: 300 }

  it('el punto del dibujo bajo el punto medio inicial queda bajo el punto medio actual', () => {
    const m0: [number, number] = [80, 220]
    const u0 = pantallaAUnidades(c0, 343, 340, m0[0], m0[1])
    // Abre los dedos al doble y los corre 30 px a la derecha.
    const c1 = camaraPellizco(c0, 100, m0, 200, [110, 220], 343, 340, lim)
    expect(c1.w).toBeCloseTo(150)
    const u1 = pantallaAUnidades(c1, 343, 340, 110, 220)
    expect(u1[0]).toBeCloseTo(u0[0])
    expect(u1[1]).toBeCloseTo(u0[1])
  })

  it('sin cambiar la distancia ni el punto medio, la cámara no se mueve; el ancho respeta los límites', () => {
    const c1 = camaraPellizco(c0, 120, [50, 60], 120, [50, 60], 343, 340, lim)
    expect(c1.cx).toBeCloseTo(c0.cx)
    expect(c1.cy).toBeCloseTo(c0.cy)
    expect(c1.w).toBeCloseTo(c0.w)
    expect(camaraPellizco(c0, 10, [0, 0], 1000, [0, 0], 343, 340, lim).w).toBe(50)
  })
})

describe('LED «60V DC» de cada bloque SM (hoja 23)', () => {
  it('cada SMk tiene su LED 60V DC y la franja nombra los dos LED con «y»', () => {
    for (let k = 1; k <= 6; k++) expect(item(`e:SM${k}`).ledsEstado.map(l => l.id)).toEqual([`V60_${k}`, `STEP${k}`])
    expect(lineaLed(item('e:SM2')).grande).toBe('LED 60V DC SM2 y Step SM2')
    expect(lineaLed(item('e:SM2'))).toMatchObject({ color: null, grupo: true })
    expect(lineaLed(item('e:SM2')).texto).toBe('LED rotulados 60V DC y Step SM2 del bloque SM2. El plano no dice cuándo prende cada uno. En la foto de la N2, 60V DC estaba encendido (amarillo).')
    expect(lineaLed(item('e:SM4')).texto).toContain('encendido (ámbar)')
  })

  it('cada LED 60V DC queda junto a su rótulo «60V DC» y en el bloque de su SM (mismo lado, rótulo SM más cercano)', () => {
    const textos = datos.textos.hoja23
    const rotulos = textos.filter(t => t.original === '60V DC')
    expect(rotulos).toHaveLength(6)
    const sms = textos.filter(t => /^SM\d \S/.test(t.original))
    for (let k = 1; k <= 6; k++) {
      const l = datos.ledsEstado.find(e => e.id === `V60_${k}`)!
      expect(l.elemento).toBe(`SM${k}`)
      // A la izquierda el rótulo va bajo el LED; a la derecha, sobre el conector de 2 bornes.
      expect(Math.min(...rotulos.map(t => Math.hypot(t.x - l.led.x, t.y - l.led.y)))).toBeLessThan(60)
      const lado = sms.filter(t => (t.x < 400) === (l.led.x < 400))
      const cerca = lado.sort((a, b) => Math.abs(a.y - l.led.y) - Math.abs(b.y - l.led.y))[0]!
      expect(cerca.original.startsWith(`SM${k} `)).toBe(true)
    }
  })
})

// ─── Principio rector ─────────────────────────────────────────────────────
// Solo se ENCIENDE (núcleo, halo y anillos) el LED que el plano, el manual o la foto respaldan como
// señal de ESE elemento al activarse. Grupos de bits, canales A/B, LED de estado y de alimentación
// se marcan (contorno o punto neutro) y la franja dice qué son y cómo estaban en la foto de la N2.
describe('principio rector: solo se enciende el LED que es señal del elemento', () => {
  const todas = [
    ...Object.keys(datos.elementos).map(k => `e:${k}`),
    ...datos.bornes.map(b => `b:${b.borne}`),
    ...datos.ledsEstado.map(l => `l:${l.id}`),
  ]
  const svg = readFileSync(resolve(__dirname, '../../../../public/learning-assets/baader-142/a3c/placa-n2.svg'), 'utf8')
  const estados = [...svg.matchAll(/id="led-X5-(\d+)"[^>]*?data-estado="([^"]+)"/g)].map(x => [Number(x[1]), x[2]!] as const)

  it('ningún LED de grupo, de estado o de alimentación queda encendido, en ningún elemento ni borne', () => {
    for (const c of todas) {
      const it = item(c)
      const on = puntosLed(m, it)
      if (it.modoLed !== 'senal') expect(on, c).toEqual([])
      for (const p of on) {
        const n = Number(p.k.split(':').pop())
        expect(Number.isInteger(n), `${c}: LED de estado encendido (${p.k})`).toBe(true)
        expect(n, `${c}: LED de alimentación encendido`).toBeLessThan(136)
      }
      // Lista independiente de `modoLed`: LED que NUNCA se encienden, se elija lo que se elija
      // (canales A/B 1–10, bits 32–41, B27 53, B11 116, 128 (K7 u B50), Y51/Y52 105/107, 92, codificación
      // sin LED en el esquema, sin rótulo, alimentación 136–145).
      const prohibidos = new Set([...Array.from({ length: 10 }, (_, i) => i + 1), ...Array.from({ length: 10 }, (_, i) => i + 32), 53, 116, 128, 105, 107, 92, 118, 122, 133, 28, 50, 76, 93, 94, 95, 96, 97, 98, 99, 100, 106, 129, 130, 131, 132])
      for (const p of on) expect(prohibidos.has(Number(p.k.split(':').pop())), `${c}: enciende ${p.k}`).toBe(false)
      // Los tres modos se excluyen: lo que se enciende no se marca también como grupo o neutro.
      const marcas = [on.length, puntosGrupo(m, it).length, puntosNeutros(m, it).length].filter(Boolean)
      expect(marcas.length, c).toBeLessThanOrEqual(1)
      if (it.modoLed !== 'senal') expect(lineaLed(it).color, c).toBeNull()
    }
  })

  it.each([['B13', 10], ['B21', 2], ['B22', 2], ['B23', 2], ['B24', 2], ['B25', 2], ['SM1', 2], ['SM2', 2], ['SM3', 2], ['SM4', 2], ['SM5', 2], ['SM6', 2]] as const)(
    '%s: 0 LED encendidos y %i marcados como grupo',
    (k, n) => {
      const it = item(`e:${k}`)
      expect(puntosLed(m, it)).toEqual([])
      expect(puntosGrupo(m, it)).toHaveLength(n)
      expect(lineaLed(it)).toMatchObject({ grupo: true, color: null, encendible: true })
    },
  )

  it('un sensor (B1 → 42) y una salida (Y8 → 68) encienden exactamente su LED', () => {
    expect(puntosLed(m, item('e:B1')).map(p => p.k)).toEqual(['e:B1:42'])
    expect(puntosLed(m, item('e:Y8')).map(p => p.k)).toEqual(['e:Y8:68'])
    expect(lineaLed(item('e:Y8')).texto).toContain('prende cuando la A3C activa la salida')
  })

  it('B11 no usa el encendido por señal: en reposo ya está encendido y al probarlo se espera que se apague', () => {
    const b11 = item('e:B11')
    expect(b11.modoLed).toBe('contorno')
    expect(puntosLed(m, b11)).toEqual([])
    expect(puntosGrupo(m, b11).map(p => p.k)).toEqual(['e:B11:116'])
    expect(b11.cuandoLed).toContain('Manual p. 28 (impresa 26): con las puntas juntas se enciende el diodo del interruptor')
    expect(b11.cuandoLed).toContain('El LED 116 es su entrada en la A3C (hoja 12)')
    expect(b11.cuandoLed).toContain('En la foto de la N2, 116 encendido')
    expect(b11.cuandoLed).toContain('se espera que se apague')
    expect(lineaLed(b11).texto).not.toContain('prende con la señal')
  })

  it('todo texto de LED con foto trae «En la foto de la N2» y coincide con el estado de la foto', () => {
    for (const c of todas) {
      const it = item(c)
      if (!it.leds.some(n => LEDS_FOTO.has(n))) continue
      expect(lineaLed(it).texto, c).toContain('En la foto de la N2')
      if (it.cuandoLed) expect(it.cuandoLed, c).toContain('En la foto de la N2')
      const n0 = it.leds[0]!
      if (it.leds.length === 1 && it.modoLed !== 'contorno') {
        expect(lineaLed(it).texto, c).toContain(`En la foto de la N2: ${LEDS_ENCENDIDOS_FOTO.has(n0) ? 'encendido' : 'apagado'}.`)
      }
    }
    for (const k of ['V60_1', 'V60_6']) expect(lineaLed(item(`l:${k}`)).texto, k).toContain('En la foto de la N2: encendido')
  })

  it('las tablas de la foto (LED presentes, encendidos y 60V DC) coinciden con placa-n2.svg', () => {
    expect(estados).toHaveLength(90)
    const orden = (xs: number[]) => [...xs].sort((a, b) => a - b)
    expect(orden([...LEDS_FOTO])).toEqual(orden(estados.map(e => e[0])))
    expect(orden([...LEDS_ENCENDIDOS_FOTO])).toEqual(orden(estados.filter(e => e[1].endsWith('-encendido')).map(e => e[0])))
    const v60 = [...svg.matchAll(/data-estado="([a-z]+)-encendido"[^>]*?data-led-plano="(V60_\d)"/g)].map(x => [x[2], x[1]])
    expect(Object.fromEntries(v60)).toEqual(LEDS_ESTADO_FOTO)
  })

  it('LED de estado y de alimentación elegidos solos: punto neutro, con lo que dice el rótulo', () => {
    expect(lineaLed(item('l:V60_4'))).toMatchObject({ grande: 'LED 60V DC SM4', tono: 'ambar', color: null })
    expect(lineaLed(item('l:V60_1')).tono).toBe('amarillo')
    expect(lineaLed(item('l:RESET'))).toMatchObject({ tono: 'gris', texto: 'LED rotulado «Reset SM1-6». El plano no dice cuándo prende.' })
    for (const n of [139, 140, 142, 143, 145]) {
      const it = item(`b:${n}`)
      expect(it.modoLed, String(n)).toBe('neutro')
      expect(puntosNeutros(m, it), String(n)).toHaveLength(1)
      expect(lineaLed(it).texto, String(n)).toContain('El plano no dice cuándo prende')
    }
    expect(lineaLed(item('b:139')).texto).toBe('Borne de alimentación «24V Drehwertgeber». El plano no dice cuándo prende.')
    expect(lineaLed(item('b:145')).texto).toContain('alimentación de B13, no uno de sus bits')
    expect(item('b:31').queHace.texto).toBe('Borne de alimentación.')
  })

  it('B50 enciende el 126 (hojas 9, 11 y 21); el 128 queda con contorno y buscar «B50» avisa en los dos', () => {
    expect(puntosLed(m, item('e:B50')).map(p => p.k)).toEqual(['e:B50:126'])
    expect(puntosGrupo(m, item('e:B50'))).toEqual([])
    expect(lineaLed(item('e:B50'))).toMatchObject({ grande: 'LED 126', color: 'r', encendible: true })
    expect(item('b:128').modoLed).toBe('contorno')
    expect(puntosLed(m, item('b:128'))).toEqual([])
    expect(lineaLed(item('b:128')).texto).toContain(
      'La hoja 23 rotula B50 aquí, pero las hojas 9 y 21 llevan al 128 la señal A3C_128 del contacto K7 (relé), y la hoja 11 cablea B50 al 126',
    )
    const items = buscar(m, 'B50', 'es').flatMap(g => g.items)
    expect(items.map(i => i.clave).sort()).toEqual(['b:128', 'e:B50'])
    // Ninguno de los dos queda sin aviso: cada uno nombra el otro borne.
    expect(lineaLed(item('e:B50')).texto + item('e:B50').cuandoLed).toMatch(/128/)
    expect(lineaLed(item('b:128')).texto).toMatch(/126/)
    expect(item('e:B50').nota).toMatch(/hojas 9 y 21 llevan al 128 la señal A3C_128 del contacto K7/)
  })

  it('textos aprobados: S25, S20, Y14, Y55, SM6-1, A3C, B16, B27, B42 y salidas Y3/Y6', () => {
    expect(lineaLed(item('e:S25'))).toMatchObject({ grande: 'Sin LED', texto: 'Hoja 19: común en X5:91 (la hoja 23 no rotula ese borne ni le dibuja LED)' })
    expect(lineaLed(item('e:S20')).texto).toBe('Común X5:86; contactos 2/4/8/16 compartidos en X5:112–115 (sin LED)')
    expect(lineaLed(item('e:Y14')).texto).toBe('Sin borne X5 propio. Hoja 8: se alimenta por un contacto de K23 (X5:12)')
    expect(item('e:Y14').senal).not.toContain('la A3C activa el elemento')
    expect(item('e:Y55')).toMatchObject({ senal: 'El plano no indica por dónde llega a la A3C' })
    expect(item('e:Y55').preguntaTerreno).toBeTruthy()
    expect(lineaLed(item('e:SM6-1')).texto).toBe('Sin borne X5. Sale por A3C.X4.31–36 (hoja 17). Las hojas no aclaran si sus LED son los de SM6.')
    expect(lineaLed(item('e:A3C'))).toMatchObject({ texto: 'Es la tarjeta: elige un borne o un LED.', encendible: false })
    expect(item('e:B16').tipoSensorNota).toContain('Revisa qué sensor está montado antes de probar con metal.')
    expect(item('e:B27').cuandoLed).toBe(
      'Encoder de pulsos (hoja 13): LED en la entrada X5:53, pero ningún documento dice cómo se ve con pulsos. En la foto de la N2: apagado.',
    )
    expect(item('e:B27').modoLed).toBe('contorno')
    expect(item('e:B42').nota).toBe('El borne 127 sale de la hoja 21 (la hoja 23 no lo rotula).')
    for (const k of ['Y3', 'Y6']) {
      expect(lineaLed(item(`e:${k}`)).texto, k).toContain('prende cuando la A3C activa la salida')
      expect(item(`e:${k}`).preguntaTerreno, k).toBeTruthy()
    }
  })

  it('lista: pulsadores fuera de «Sensores», Y3/Y6/Y51/Y52 en «Salidas» y SM6 elegible', () => {
    const grupos = buscar(m, '', 'es')
    const de = (t: string) => grupos.find(g => g.titulo === t)?.items.map(i => i.clave) ?? []
    for (const k of ['S1', 'S3', 'S4', 'S5', 'S6', 'S9']) expect(de('Sensores'), k).not.toContain(`e:${k}`)
    for (const k of ['Y3', 'Y6', 'Y51', 'Y52']) expect(de('Salidas'), k).toContain(`e:${k}`)
    expect(de('Motores')).toContain('e:SM6')
    expect(de('Sensores')).toContain('e:B1')
  })
})

// ─── Auditoría de evidencia de LED (plano 888, hojas 9–15, 20, 21 y 23; manual 2005) ───────────
// Un LED solo se ENCIENDE si el plano respalda que es señal de ESE elemento; lo disputado va con contorno.
describe('auditoría de evidencia de LED', () => {
  const todas = [
    ...Object.keys(datos.elementos).map(k => `e:${k}`),
    ...datos.bornes.map(b => `b:${b.borne}`),
    ...datos.ledsEstado.map(l => `l:${l.id}`),
  ]
  const encendidosPor = (c: string) => puntosLed(m, item(c)).map(p => Number(p.k.split(':').pop())).filter(Number.isInteger)
  /** Todo lo que la herramienta escribe de un ítem (franja, ficha y búsqueda). */
  const textos = (c: string) => {
    const it = item(c)
    const l = lineaLed(it)
    return [l.grande, l.texto, it.cuandoLed, it.nota ?? '', it.senal, it.preguntaTerreno ?? '', it.queHace.texto, it.tipoSensor ?? '', it.tipoSensorNota ?? '', ...it.fuentes].join(' · ')
  }
  // Clasificación de `evidencia_led.json`.
  const SIN_RESPALDO = [28, 76, 93, 95, 96, 97, 98, 99, 130, 139, 140]
  const PARCIAL = [50, 92, 94, 100, 104, 105, 106, 107, 108, 118, 122, 128, 129, 133, 145]
  /** Bornes que las hojas 9–15 y 21 dibujan con símbolo de LED de entrada o de salida. */
  const CON_SIMBOLO = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 16, 18, 20, 22, 24, 26, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 52, 53, 54,
    66, 68, 70, 72, 74, 78, 80, 82, 84, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 116, 117, 119, 120, 121, 123, 124, 125, 126, 127,
    128, 131, 132, 134, 142, 143,
  ]

  it('los 11 LED SIN RESPALDO nunca se encienden, se elija lo que se elija', () => {
    for (const c of todas) for (const n of encendidosPor(c)) expect(SIN_RESPALDO, `${c} enciende ${n}`).not.toContain(n)
  })

  it('de los 15 PARCIAL solo se encienden 104 y 108 (salidas a K53/K54, hoja 21)', () => {
    const on = new Set(todas.flatMap(encendidosPor).filter(n => PARCIAL.includes(n)))
    expect([...on].sort((a, b) => a - b)).toEqual([104, 108])
  })

  it('B50 enciende el 126; el 128 no se enciende desde ningún ítem', () => {
    expect(encendidosPor('e:B50')).toEqual([126])
    expect(claveDeBorne(m, 126)).toBe('e:B50')
    for (const c of todas) expect(encendidosPor(c), c).not.toContain(128)
    expect(lineaLed(item('b:128')).texto).toContain(
      'La hoja 23 rotula B50 aquí, pero las hojas 9 y 21 llevan al 128 la señal A3C_128 del contacto K7 (relé), y la hoja 11 cablea B50 al 126',
    )
  })

  it('Y51 (107) e Y52 (105): contorno, con las dos hojas y la pregunta de terreno', () => {
    for (const [k, n] of [['Y51', 107], ['Y52', 105]] as const) {
      const it = item(`e:${k}`)
      expect(it.modoLed, k).toBe('contorno')
      expect(puntosLed(m, it), k).toEqual([])
      expect(puntosGrupo(m, it).map(p => p.k), k).toEqual([`e:${k}:${n}`])
      expect(it.preguntaTerreno, k).toMatch(new RegExp(`LED ${n}`))
      expect(encendidosPor(`b:${n}`), String(n)).toEqual([])
    }
    expect(lineaLed(item('e:Y52')).texto).toContain('LED de la salida X5:105. La hoja 21 lo lleva a K51 → Y51 (Schieber); la hoja 23 rotula Y52. Confirma en terreno')
    expect(lineaLed(item('e:Y51')).texto).toContain('LED de la salida X5:107. La hoja 21 lo lleva a K52 → Y52 (Kugelhahn auf/zu); la hoja 23 rotula Y51. Confirma en terreno')
  })

  it('bornes 12, 13 (K23, K25) y 31: no se encienden, dicen qué hoja dibuja el LED y piden confirmarlo en la placa', () => {
    for (const [n, hoja] of [[12, 9], [13, 9], [31, 13]] as const) {
      const c = claveDeBorne(m, n)
      const it = item(c)
      expect(puntosLed(m, it), c).toEqual([])
      expect(lineaLed(it), c).toMatchObject({
        grande: 'Sin LED en la hoja 23',
        texto: `La hoja ${hoja} dibuja LED en este borne, pero la hoja 23 no le pone círculo. Confirma en la placa si tiene LED`,
        encendible: false,
      })
      expect(it.preguntaTerreno, c).toContain(`X5:${n}`)
    }
  })

  it('«al acercar metal» solo en B1–B10, B12, B14 y B15 (manual p. 66: inductivos; plano: contacto de cierre)', () => {
    const inductivos = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B12', 'B14', 'B15']
    const con = todas.filter(c => /al acercar metal/.test(textos(c))).map(c => c.slice(2))
    expect(con.sort()).toEqual([...inductivos].sort())
    // Hoja del esquema que dibuja el LED de entrada de cada sensor (evidencia_led.json, cadena 3).
    const HOJA: Record<string, number> = { B1: 10, B2: 10, B3: 10, B4: 10, B5: 11, B6: 11, B7: 11, B8: 11, B9: 11, B10: 11, B12: 12, B14: 12, B15: 12 }
    for (const k of inductivos) {
      const n = datos.elementos[k]!.borne[0]
      const h = HOJA[k]
      expect(item(`e:${k}`).cuandoLed, k).toMatch(new RegExp(`^El plano \\(hoja ${h}\\) dibuja este sensor con contacto de cierre y un LED en la entrada X5:${n}\\.`))
      expect(lineaLed(item(`e:${k}`)).texto, k).toContain(`Plano 888, hoja ${h}: LED en la entrada X5:${n}`)
      expect(item(`e:${k}`).fuentes, k).toContain(`Plano 888, hoja ${h}`)
    }
    for (const k of ['B16', 'B18', 'B19', 'B42']) {
      expect(textos(`e:${k}`), k).toContain('prende cuando llega la señal')
      expect(textos(`e:${k}`), k).not.toMatch(/acercar metal/)
    }
  })

  it('B11: cita el manual p. 28 (impresa 26), diodo del interruptor; ningún texto dice «p. 66 y 18»', () => {
    for (const c of todas) expect(textos(c), c).not.toMatch(/p\. 66 y (p\. )?18/)
    const b11 = item('e:B11')
    expect(b11.cuandoLed).toMatch(/^Manual p\. 28 \(impresa 26\): con las puntas juntas se enciende el diodo del interruptor\./)
    expect(b11.cuandoLed).not.toMatch(/p\. 66|p\. 18/)
    expect(b11.fuentes).toContain('Manual 2005, p. 28 (impresa 26)')
    expect(b11.modoLed).toBe('contorno')
  })

  it('ningún borne con símbolo de LED de entrada o salida dice «el plano no indica el sentido»', () => {
    for (const n of CON_SIMBOLO) {
      for (const c of new Set([claveDeBorne(m, n), `b:${n}`])) expect(textos(c), `${c} (X5:${n})`).not.toMatch(/no indica el sentido/i)
    }
  })

  it('textos aprobados de la sección F (relés, SPS, Start, Y53/Y54, codificación, 92, B42, B27)', () => {
    const franja = (c: string) => lineaLed(item(c)).texto
    expect(franja('e:K20')).toContain('Salida de la A3C al relé K20 (hoja 9): prende cuando la A3C activa la salida')
    expect(franja('e:K22')).toContain('Salida de la A3C al relé K22 (hoja 9): prende cuando la A3C activa la salida')
    expect(franja('b:66')).toContain('Salida de la A3C al relé K26 (hoja 9)')
    for (const n of [101, 102, 109, 110, 111]) expect(franja(`b:${n}`), String(n)).toContain('Salida de la A3C hacia la SPS (hojas 20 y 21)')
    expect(franja('b:51')).toContain('Entrada de la A3C (hoja 9, contacto K24): prende con la orden de arranque')
    expect(encendidosPor('b:51')).toEqual([51])
    expect(encendidosPor('e:K20')).toEqual([26])
    for (const [k, rele] of [['Y53', 'K53'], ['Y54', 'K54']] as const) {
      expect(franja(`e:${k}`), k).toContain(`la A3C activa el relé. La válvula ${k} la acciona la SPS (hojas 20 y 21)`)
      expect(franja(`e:${k}`), k).toContain(`relé ${rele}`)
    }
    for (const n of [118, 122, 133]) {
      expect(item(`b:${n}`).modoLed, String(n)).toBe('contorno')
      expect(franja(`b:${n}`), String(n)).toContain('Entrada de codificación de la versión (hoja 1, tabla «Codierung»); el esquema no le dibuja LED')
    }
    expect(encendidosPor('b:117')).toEqual([117])
    expect(franja('b:117')).toContain('Entrada de codificación (hoja 11)')
    expect(item('b:92').modoLed).toBe('contorno')
    expect(franja('b:92')).toContain('La hoja 23 dibuja su LED; el esquema (hoja 9) no lo detalla: el plano no dice cuándo prende')
    const t42 = 'El plano dibuja un LED en la entrada X5:127 (hoja 21) para B42; prende cuando llega la señal de B42'
    for (const c of ['e:B42', 'b:127']) {
      expect(item(c).modoLed, c).toBe('senal')
      expect(encendidosPor(c), c).toEqual([127])
      expect(franja(c), c).toContain(t42)
    }
    expect(item('e:B27').modoLed).toBe('contorno')
    expect(encendidosPor('e:B27')).toEqual([])
  })

  it('el color solo se afirma como «según la foto de la N2»', () => {
    for (const c of todas) {
      const t = textos(c)
      for (const x of t.matchAll(/\b(verde|rojo|roja|verdes|rojos|ámbar|amarillo)\b/gi)) {
        expect(t.slice(Math.max(0, x.index - 80), x.index + 20), c).toMatch(/foto de la N2/)
      }
    }
  })
})
