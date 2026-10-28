/**
 * Tests del gráfico «Ritmo en vivo»: escalas Y, horas del eje, zoom «Turno | 1 h | 15 min», proyección (una sola fuente
 * para «Al cierre», detenida = plana), trazo que no retrocede, tonos de Shoplogix, filas por Baader sin falsos rojos,
 * paradas en el eje y alturas que caben y no se pisan.
 */
import { describe, expect, it } from 'vitest'
import type { GrupoDelTurno } from '@/services/shoplogix/monitorEventos'
import {
  acumulado, anchoRotuloAhora, celdaBaader, cifraTurnoAnterior, cubetasDeLinea, disenar, dominioVisible, episodiosParada, escalaAcumulado, escalaVentana,
  anclaRotuloAhora, brechaALaIzquierda, escalaY, esperadoPorMinuto, filasBaader, finDelEje, horasMin, marcasEje, minutosCompletos, minutosConParada, minutosPorCubeta, minutosVisibles,
  paradaEn, paradasEn, paradasEnEje, pasoMarcas, pctAndando, pctARitmo, proyeccion, rayasY, recortarCurva, separarRotulos, sumaPorMinuto, tamanoGrafico,
  tonoDeCubeta, tonoRitmo, trazoHastaLectura, valorEnCurva, ventanaDe, zoomActivo, zoomMaxPara,
  type ParadaEje,
} from '../ejeTurno'

describe('escala Y del acumulado', () => {
  it('con proyección 15.623 y meta 15.000: 0…16.000 y rejilla cada 4.000', () => {
    expect(escalaAcumulado(15623)).toEqual({ paso: 2000, max: 16000, rejilla: 4000 })
  })
  it('paso 1.000 hasta 8.000, 2.000 hasta 20.000 y 5.000 después; la rejilla va cada 2 pasos', () => {
    expect(escalaAcumulado(7200)).toEqual({ paso: 1000, max: 8000, rejilla: 2000 })
    expect(escalaAcumulado(8000)).toEqual({ paso: 1000, max: 8000, rejilla: 2000 })
    expect(escalaAcumulado(20000)).toEqual({ paso: 2000, max: 20000, rejilla: 4000 })
  })
  it('el máximo es siempre múltiplo de la rejilla: la raya de arriba existe (5.000 → 6.000, no 5.000 con rayas en 0, 2 y 4 mil)', () => {
    expect(escalaAcumulado(5000)).toEqual({ paso: 1000, max: 6000, rejilla: 2000 })
    expect(escalaAcumulado(8001)).toEqual({ paso: 2000, max: 12000, rejilla: 4000 })
    expect(escalaAcumulado(21000)).toEqual({ paso: 5000, max: 30000, rejilla: 10000 })
    for (const tope of [1, 950, 2546, 5000, 7200, 9000, 14543, 15479, 15623, 19999, 21000, 26000]) {
      const { max, rejilla } = escalaAcumulado(tope)
      expect(max % rejilla).toBe(0)
    }
  })
  it('con el acumulado a menos de 4 % del tope sube a la siguiente raya (15.479 y 15.623 se quedan en 16.000)', () => {
    expect(escalaAcumulado(15479).max).toBe(16000)
    expect(escalaAcumulado(15623).max).toBe(16000)
    expect(escalaAcumulado(15990).max).toBe(16000)
    expect(escalaAcumulado(16001).max).toBe(20000)
  })
  it('el máximo nunca queda por debajo de lo que se dibuja y no deja la mitad de arriba vacía', () => {
    for (const tope of [1, 950, 2546, 9000, 14543, 15000, 15623, 19999]) {
      const { max } = escalaAcumulado(tope)
      expect(max).toBeGreaterThanOrEqual(tope)
      expect(max).toBeLessThan(tope + (tope > 8000 ? 4000 : 2000) + 1)
    }
  })
  it('sin nada que dibujar da una escala mínima', () => {
    expect(escalaAcumulado(0)).toEqual({ paso: 1000, max: 2000, rejilla: 2000 })
  })
  it('la escala del Duelo no cambió (la usa DueloPC)', () => {
    expect(escalaY(2546)).toEqual({ paso: 1000, max: 3000 })
    expect(escalaY(14543)).toEqual({ paso: 5000, max: 20000 })
    expect(escalaY(9000)).toEqual({ paso: 2000, max: 10000 })
  })
})

describe('horas del eje X', () => {
  it('pantalla de 1920: cada 30 min y sin la marca pegada al «ahora» (02:35)', () => {
    const m = marcasEje({ totalMin: 450, pxPorMin: 3.6, minPx: 100, ahoraMin: 305, ahoraPx: 64 })
    expect(m[0]).toBe(0)
    expect(m[m.length - 1]).toBe(450)
    expect(m).not.toContain(300)
    expect(m).toContain(330)
    expect(m).toContain(270)
  })
  it('1366: cada hora y el fin del turno', () => {
    expect(marcasEje({ totalMin: 450, pxPorMin: 2.5, minPx: 100, ahoraMin: null, ahoraPx: 0 })).toEqual([0, 60, 120, 180, 240, 300, 360, 420, 450])
  })
  it('375: cada 2 h y el fin del turno', () => {
    expect(marcasEje({ totalMin: 450, pxPorMin: 0.58, minPx: 64, ahoraMin: null, ahoraPx: 0 })).toEqual([0, 120, 240, 360, 450])
  })
  it('el fin del turno no se rotula si quedaría pegado a la última marca', () => {
    const m = marcasEje({ totalMin: 455, pxPorMin: 3.6, minPx: 100, ahoraMin: null, ahoraPx: 0 })
    expect(m[m.length - 1]).toBe(450)
  })
  it('el paso baja al acercarse: con «15 min» (108 px por minuto) hay una marca por minuto', () => {
    expect(pasoMarcas(108, 100)).toBe(1)
    expect(pasoMarcas(3.6, 100)).toBe(30)
    expect(pasoMarcas(0.001, 100)).toBe(240)
  })
  it('sin turno o sin ancho no hay marcas', () => {
    expect(marcasEje({ totalMin: 0, pxPorMin: 3, minPx: 100, ahoraMin: null, ahoraPx: 0 })).toEqual([])
    expect(marcasEje({ totalMin: 450, pxPorMin: 0, minPx: 100, ahoraMin: null, ahoraPx: 0 })).toEqual([])
  })
})

describe('zoom «Turno | 1 h | 15 min»', () => {
  it('«Turno» no tiene ventana: se ve todo', () => {
    expect(ventanaDe('turno', 305, 450)).toBeNull()
  })
  it('«1 h» y «15 min» terminan un poco por delante del ahora', () => {
    expect(ventanaDe('1h', 305, 450)).toEqual({ desdeMin: 254, hastaMin: 314 })
    const v = ventanaDe('15m', 305, 450)!
    expect(v.hastaMin - v.desdeMin).toBeCloseTo(15, 9)
    expect(v.hastaMin).toBeCloseTo(307.25, 9)
  })
  it('no se sale del turno: al principio parte en 0 y al final termina en el cierre', () => {
    expect(ventanaDe('1h', 10, 450)).toEqual({ desdeMin: 0, hastaMin: 60 })
    expect(ventanaDe('1h', 450, 450)).toEqual({ desdeMin: 390, hastaMin: 450 })
    expect(ventanaDe('1h', 20, 30)).toEqual({ desdeMin: 0, hastaMin: 30 })
  })
  it('reconoce el atajo por el ancho de la ventana; un zoom a mano no es ninguno', () => {
    expect(zoomActivo(null)).toBe('turno')
    expect(zoomActivo({ desdeMin: 254, hastaMin: 314 })).toBe('1h')
    expect(zoomActivo({ desdeMin: 292, hastaMin: 307 })).toBe('15m')
    expect(zoomActivo({ desdeMin: 100, hastaMin: 250 })).toBeNull()
  })
  it('el tope de zoom del hook deja alcanzar «15 min» en cualquier turno', () => {
    for (const total of [60, 450, 600]) expect(zoomMaxPara(total)).toBeGreaterThanOrEqual(total / 15)
    expect(zoomMaxPara(60)).toBe(12)
  })
})

describe('trazo de la curva', () => {
  it('acumula minuto a minuto desde cero', () => {
    expect(acumulado([10, 5, 0, 7])).toEqual([0, 10, 15, 15, 22])
  })
  it('termina en la recta real anterior → última y no retrocede', () => {
    const acum = acumulado([10, 20, 30, 40, 50])
    const t = trazoHastaLectura(acum, { min: 3.6, v: 62 }, { min: 4.6, v: 112 })
    expect(t[t.length - 1]).toEqual({ min: 4.6, v: 112 })
    expect(t[t.length - 2]).toEqual({ min: 3.6, v: 62 })
    for (let i = 1; i < t.length; i++) expect(t[i]!.v).toBeGreaterThanOrEqual(t[i - 1]!.v)
    expect(t.slice(0, -2).every((p) => p.min < 3.6)).toBe(true)
  })
  it('sin lectura anterior, el trazo llega directo a la última', () => {
    const t = trazoHastaLectura(acumulado([10, 20, 30]), null, { min: 2.5, v: 45 })
    expect(t[t.length - 1]).toEqual({ min: 2.5, v: 45 })
    expect(t.every((p) => p.v <= 45)).toBe(true)
  })
  it('interpola la curva y devuelve null fuera de rango', () => {
    const ps = [{ min: 0, v: 0 }, { min: 10, v: 100 }]
    expect(valorEnCurva(ps, 5)).toBe(50)
    expect(valorEnCurva(ps, 11)).toBeNull()
    expect(valorEnCurva([], 1)).toBeNull()
  })
  it('recorta la curva del turno anterior en el fin del eje sin extrapolar', () => {
    const ps = [{ min: 0, v: 0 }, { min: 10, v: 100 }, { min: 20, v: 300 }]
    expect(recortarCurva(ps, 15)).toEqual([{ min: 0, v: 0 }, { min: 10, v: 100 }, { min: 15, v: 200 }])
    expect(recortarCurva(ps, 30)).toEqual(ps)
    expect(recortarCurva(ps, 10)).toEqual([{ min: 0, v: 0 }, { min: 10, v: 100 }])
    expect(recortarCurva([], 10)).toEqual([])
  })
})

describe('proyección punteada', () => {
  const punta = { min: 51, v: 1929 }
  it('con el turno entero a la vista termina EXACTO en «Al cierre» (una sola fuente)', () => {
    const p = proyeccion({ punta, finEje: 450, totalMin: 450, cierre: 14543, detenida: false })!
    expect(p.alCierre).toBe(true)
    expect(p.hasta).toEqual({ min: 450, v: 14543 })
    expect(p.aplanada).toBe(false)
  })
  it('con el eje corto, sigue la misma recta hacia el cierre y se corta en el borde', () => {
    const p = proyeccion({ punta, finEje: 141, totalMin: 450, cierre: 14543, detenida: false })!
    expect(p.alCierre).toBe(false)
    const esperado = 1929 + ((14543 - 1929) * (141 - 51)) / (450 - 51)
    expect(p.hasta.v).toBeCloseTo(esperado, 6)
  })
  it('detenida: se aplana al valor actual y no sube', () => {
    const p = proyeccion({ punta, finEje: 450, totalMin: 450, cierre: 14543, detenida: true })!
    expect(p.aplanada).toBe(true)
    expect(p.hasta.v).toBe(1929)
  })
  it('sin cifra de cierre no se inventa una pendiente', () => {
    expect(proyeccion({ punta, finEje: 450, totalMin: 450, cierre: null, detenida: false })).toBeNull()
  })
  it('nunca queda por debajo de la punta aunque el cierre calculado sea menor', () => {
    const p = proyeccion({ punta, finEje: 450, totalMin: 450, cierre: 1500, detenida: false })!
    expect(p.hasta.v).toBeGreaterThanOrEqual(punta.v)
  })
  it('sin eje por delante no hay proyección', () => {
    expect(proyeccion({ punta, finEje: 51, totalMin: 450, cierre: 14543, detenida: false })).toBeNull()
  })
})

describe('minuto a minuto', () => {
  it('tonos de Shoplogix: 75 % bien, 50 % atento, debajo mal', () => {
    expect(tonoRitmo(39, 51)).toBe('bien')
    expect(tonoRitmo(38, 51)).toBe('atento')
    expect(tonoRitmo(25, 51)).toBe('mal')
    expect(tonoRitmo(null, 51)).toBe('sin')
    expect(tonoRitmo(0, null)).toBe('sin')
    /* Sin esperado no hay vara con qué juzgar: con piezas tampoco es «bien» (misma regla que ritmoVivo.ts). */
    expect(tonoRitmo(3, null)).toBe('sin')
  })
  it('% a ritmo cuenta solo los minutos con dato', () => {
    expect(pctARitmo([20, 20, 5, 12], 20)).toBe(50)
    expect(pctARitmo([null, 20], 20)).toBe(100)
    expect(pctARitmo([], 20)).toBeNull()
    expect(pctARitmo([5], null)).toBeNull()
  })
  it('suma la línea y recorta la cola en cero solo con el turno cerrado', () => {
    const m = [{ cycles: [5, 5, 0, 0] }, { cycles: [5, 0, 0, 0] }]
    expect(sumaPorMinuto(m, 4)).toEqual([10, 5, 0, 0])
    expect(minutosVisibles(m, false)).toBe(4)
    expect(minutosVisibles(m, true)).toBe(2)
    expect(minutosVisibles([], true)).toBe(0)
  })
  it('una serie más corta no borra el último minuto de las demás', () => {
    const m = [{ cycles: [1, 2, 3] }, { cycles: [1, 2, 3, 4, 5] }]
    expect(minutosVisibles(m, false)).toBe(5)
    expect(sumaPorMinuto(m, 5)).toEqual([2, 4, 6, 4, 5])
  })
  it('para la cifra de la LÍNEA vale el último minuto que todas entregaron (el menor de los largos)', () => {
    const m = [{ cycles: [1, 2, 3] }, { cycles: [1, 2, 3, 4, 5] }]
    expect(minutosCompletos(m)).toBe(3)
    expect(minutosCompletos([{ cycles: [1, 2] }, { cycles: [] }])).toBe(0)
    expect(minutosCompletos([])).toBe(0)
  })
  it('el esperado de la línea de cada minuto suma solo a las máquinas que tienen ese minuto', () => {
    const m = [{ cycles: [1, 2, 3], esperado: 19 }, { cycles: [1, 2], esperado: 16 }]
    expect(esperadoPorMinuto(m, 3)).toEqual([35, 35, 19])
    expect(esperadoPorMinuto([{ cycles: [1], esperado: null }], 1)).toEqual([null])
    expect(esperadoPorMinuto([], 2)).toEqual([null, null])
  })
})

describe('filas Ev: sin falsos rojos', () => {
  const ini = Date.UTC(2026, 9, 27, 21, 30)
  const desde = new Date(ini).toISOString()
  const hora = (min: number) => new Date(ini + min * 60_000).toISOString()
  const maq = (id: string, esperado: number | null, cycles: number[]) => ({ id, nombre: `Evisceradora ${id}`, esperado, cycles })

  it('cada minuto cae en el tono y la palabra de Shoplogix', () => {
    expect(celdaBaader(99, 11)).toEqual({ tono: 'bien', estado: 'andando' })
    expect(celdaBaader(63, 12)).toEqual({ tono: 'atento', estado: 'lenta' })
    expect(celdaBaader(42, 8)).toEqual({ tono: 'mal', estado: 'lenta' })
    expect(celdaBaader(0, 0)).toEqual({ tono: 'mal', estado: 'detenida' })
    expect(celdaBaader(null, 0)).toEqual({ tono: 'sin', estado: 'detenida' })
    expect(celdaBaader(null, 5)).toEqual({ tono: 'sin', estado: 'parcial' })
    /* La línea entera en cero sin una parada que lo explique: no se afirma «detenida». */
    expect(celdaBaader(null, 0, true)).toEqual({ tono: 'sin', estado: 'sin-dato' })
    expect(celdaBaader(null, 5, true)).toEqual({ tono: 'sin', estado: 'parcial' })
  })

  it('línea en cero: la fila queda neutra, no roja (el conteo crudo la pintaba mal)', () => {
    const serie = { desde, maquinas: [maq('A', 19, [19, 19, 0, 0, 19]), maq('B', 16, [16, 16, 0, 0, 16]), maq('C', 16, [16, 16, 0, 0, 16])] }
    expect(tonoRitmo(0, 19)).toBe('mal')
    const filas = filasBaader(serie, 5)
    for (const f of filas) {
      expect(f.celdas.map((c) => c.tono)).toEqual(['bien', 'bien', 'sin', 'sin', 'bien'])
      /* Sin una parada registrada que lo explique, el minuto en cero de TODA la línea es «sin dato», no «detenida». */
      expect(f.celdas[2]!.estado).toBe('sin-dato')
    }
  })

  it('línea en cero CON una parada registrada que cubre el minuto: sí es «detenida»', () => {
    const serie = { desde, maquinas: [maq('A', 19, [19, 19, 0, 0, 19]), maq('B', 16, [16, 16, 0, 0, 16]), maq('C', 16, [16, 16, 0, 0, 16])] }
    const paradas = { stopEvents: [0, 1, 2].map((m) => ({ r: 0, f: hora(2), s: 120, m })), stopReasons: ['Detencion'], stopMachines: ['A', 'B', 'C'], enCurso: [] }
    for (const f of filasBaader(serie, 5, paradas)) {
      expect(f.celdas.map((c) => c.estado)).toEqual(['andando', 'andando', 'detenida', 'detenida', 'andando'])
    }
  })

  it('Baader lenta con la línea andando: roja solo bajo 50 %, ámbar entre 50 y 75', () => {
    const serie = { desde, maquinas: [maq('A', 19, [19, 8, 12, 19]), maq('B', 16, [16, 16, 16, 16]), maq('C', 16, [16, 16, 16, 16])] }
    const [a, b, c] = filasBaader(serie, 4)
    expect(a!.celdas.map((x) => x.tono)).toEqual(['bien', 'mal', 'atento', 'bien'])
    expect(a!.celdas[1]!.estado).toBe('lenta')
    expect(a!.celdas[2]!.estado).toBe('lenta')
    /* El llenado normalizado de cada minuto sale con las celdas: es la base del punto, la palabra y la barra de la franja. */
    expect(a!.llenados).toEqual([100, 42, 63, 100])
    expect(b!.celdas.every((x) => x.tono === 'bien' && x.estado === 'andando')).toBe(true)
    expect(c!.celdas.every((x) => x.tono === 'bien')).toBe(true)
  })

  it('con la línea andando, una Baader en cero es «detenida» y roja', () => {
    const serie = { desde, maquinas: [maq('A', 19, [19, 0, 19]), maq('B', 16, [16, 16, 16])] }
    const [a] = filasBaader(serie, 3)
    expect(a!.celdas[1]).toEqual({ tono: 'mal', estado: 'detenida' })
  })

  it('minuto parcial de arranque: se mide contra los segundos andando, no contra el minuto entero', () => {
    /* A estuvo parada los primeros 25 s del minuto 1: andando 35 s. 11 de 19 contado crudo es 58 % (atento);
       contra lo que daba andando (19 × 35/60 = 11,1) es 99 %: arrancó bien. */
    const serie = { desde, maquinas: [maq('A', 19, [19, 11, 19]), maq('B', 16, [16, 16, 16])] }
    const paradas = { stopEvents: [{ r: 0, f: hora(1), s: 25, m: 0 }], stopReasons: ['Detencion'], stopMachines: ['A', 'B'], enCurso: [] }
    expect(tonoRitmo(11, 19)).toBe('atento')
    const [a] = filasBaader(serie, 3, paradas)
    expect(a!.celdas[1]).toEqual({ tono: 'bien', estado: 'andando' })
  })

  it('menos de 30 s andando no tiene dato: ni rojo ni verde', () => {
    const serie = { desde, maquinas: [maq('A', 19, [19, 3, 19]), maq('B', 16, [16, 16, 16])] }
    const paradas = { stopEvents: [{ r: 0, f: hora(1), s: 40, m: 0 }], stopReasons: ['Detencion'], stopMachines: ['A', 'B'], enCurso: [] }
    const [a] = filasBaader(serie, 3, paradas)
    expect(a!.celdas[1]).toEqual({ tono: 'sin', estado: 'parcial' })
  })

  it('la parada en curso (que aún no está en stopEvents) deja sin dato esos minutos', () => {
    const serie = { desde, maquinas: [maq('A', 19, [19, 19, 19, 19]), maq('B', 16, [16, 16, 16, 0])] }
    const paradas = { stopEvents: [], stopReasons: [], stopMachines: ['A', 'B'], enCurso: [{ id: 'B', desdeMs: ini + 3 * 60_000 }] }
    const [a, b] = filasBaader(serie, 4, paradas)
    expect(b!.celdas.map((x) => x.tono)).toEqual(['bien', 'bien', 'bien', 'sin'])
    expect(a!.celdas[3]!.tono).toBe('bien')
  })

  it('sin esperado no hay vara: con piezas queda sin dato (no «andando»); una serie corta deja sin dato su último minuto', () => {
    const serie = { desde, maquinas: [maq('A', null, [5, 0, 5, 5]), maq('B', 16, [16, 16])] }
    const [a, b] = filasBaader(serie, 4)
    expect(a!.celdas.map((x) => x.tono)).toEqual(['sin', 'sin', 'sin', 'sin'])
    expect(a!.celdas.map((x) => x.estado)).toEqual(['sin-dato', 'detenida', 'sin-dato', 'sin-dato'])
    expect(b!.celdas.map((x) => x.tono)).toEqual(['bien', 'bien', 'sin', 'sin'])
    /* Un minuto que su serie aún no trae es «sin dato», no «detenida»: la Baader solo va atrasada. */
    expect(b!.celdas.map((x) => x.estado)).toEqual(['andando', 'andando', 'sin-dato', 'sin-dato'])
  })

  it('% a ritmo cuenta solo los minutos con dato', () => {
    expect(pctAndando([{ tono: 'bien', estado: 'andando' }, { tono: 'bien', estado: 'andando' }, { tono: 'mal', estado: 'lenta' }, { tono: 'sin', estado: 'detenida' }])).toBe(67)
    expect(pctAndando([{ tono: 'sin', estado: 'detenida' }])).toBeNull()
    expect(pctAndando([])).toBeNull()
  })
})

describe('paradas en el eje', () => {
  const grupos: GrupoDelTurno[] = [
    { dueno: 'mantencion', min: 5, piezas: 100, causas: [{ reason: 'Cintas', min: 5, count: 1, piezas: 100, categoria: null, extension: false, paradas: [{ hora: '22:10', hasta: '22:15', min: 5, desdeMin: 40, hastaMin: 45, maquina: 'Evisceradora 1' }] }] },
    { dueno: 'sin-imputar', min: 1, piezas: 10, causas: [{ reason: 'Micro Detencion', min: 1, count: 1, piezas: 10, categoria: null, extension: false, paradas: [{ hora: '21:40', hasta: '21:41', min: 1, desdeMin: 10, hastaMin: 11 }, { hora: '--', hasta: '--', min: 1, desdeMin: null, hastaMin: null }] }] },
  ]
  it('pasa de minutos-desde-el-primer-dato a minutos-desde-el-inicio-del-turno y ordena', () => {
    const ini = Date.UTC(2026, 9, 27, 21, 30)
    const t0 = ini + 5 * 60_000 // la primera pieza llegó 5 min después
    const ps = paradasEnEje(grupos, t0, ini)
    expect(ps.map((p) => p.desdeMin)).toEqual([15, 45])
    expect(ps[1]).toMatchObject({ dueno: 'mantencion', causa: 'Cintas', maquina: 'Evisceradora 1', hastaMin: 50 })
  })
  it('sin base de tiempo no inventa posiciones', () => {
    expect(paradasEnEje(grupos, null, 0)).toEqual([])
    expect(paradasEnEje(null, 1, 0)).toEqual([])
  })
  it('encuentra la parada que cubre un minuto', () => {
    const ps = [{ desdeMin: 10, hastaMin: 20, dueno: 'externo' as const, causa: 'A', maquina: null }]
    expect(paradaEn(ps, 15)?.causa).toBe('A')
    expect(paradaEn(ps, 25)).toBeNull()
  })
})

describe('alturas del gráfico', () => {
  it('el tamaño sale del ancho del gráfico: 1920, 1366 y 375', () => {
    expect(tamanoGrafico(1806)).toBe('grande')
    expect(tamanoGrafico(1480)).toBe('grande')
    expect(tamanoGrafico(1479)).toBe('medio')
    expect(tamanoGrafico(1276)).toBe('medio')
    expect(tamanoGrafico(600)).toBe('medio')
    expect(tamanoGrafico(599)).toBe('chico')
    expect(tamanoGrafico(309)).toBe('chico')
  })
  it('con 3 Baader mide 504 / 384 / 322 px y las bandas del mockup', () => {
    const g = disenar(1806, 'grande', 3, true)
    const m = disenar(1276, 'medio', 3, true)
    const c = disenar(309, 'chico', 3, true)
    expect([g.alto, m.alto, c.alto]).toEqual([504, 384, 322])
    expect([g.acum.h, m.acum.h, c.acum.h]).toEqual([290, 206, 160])
    expect([g.barras!.h, m.barras!.h, c.barras!.h]).toEqual([84, 60, 48])
    expect([g.carriles[0]!.h, m.carriles[0]!.h, c.carriles[0]!.h]).toEqual([14, 11, 10])
    expect([g.paradas.h, m.paradas.h, c.paradas.h]).toEqual([14, 11, 10])
  })
  it('columna de rótulos: 52/48/44 a la izquierda y 128/104/4 a la derecha (en el celular los rótulos van dentro)', () => {
    expect([disenar(1806, 'grande', 3, true), disenar(1276, 'medio', 3, true), disenar(309, 'chico', 3, true)].map((d) => [d.pl, d.pr]))
      .toEqual([[52, 128], [48, 104], [44, 4]])
    expect(disenar(1806, 'grande', 3, true).plotW).toBe(1626)
  })
  for (const [w, tam] of [[1806, 'grande'], [1276, 'medio'], [309, 'chico']] as const) {
    it(`cada banda queda debajo de la anterior y las filas no se pisan (${w} px)`, () => {
      const d = disenar(w, tam, 3, true)
      expect(d.barras!.y0).toBeGreaterThanOrEqual(d.acum.y0 + d.acum.h + 16)
      expect(d.carriles[0]!.y0).toBeGreaterThanOrEqual(d.barras!.y0 + d.barras!.h + 10)
      for (let i = 1; i < d.carriles.length; i++) expect(d.carriles[i]!.y0).toBe(d.carriles[i - 1]!.y0 + d.carriles[i - 1]!.h + 3)
      expect(d.paradas.y0).toBeGreaterThanOrEqual(d.carriles[2]!.y0 + d.carriles[2]!.h + 6)
      expect(d.ejeX).toBe(d.paradas.y0 + d.paradas.h + 8)
      expect(d.alto).toBe(d.ejeX + 18)
    })
  }
  it('con una sola Baader (Filete) el alto se ajusta; sin serie por minuto no hay barras ni filas', () => {
    expect(disenar(1806, 'grande', 1, true).alto).toBe(504 - 2 * 14 - 2 * 3)
    const sin = disenar(1806, 'grande', 3, false)
    expect(sin.barras).toBeNull()
    expect(sin.carriles).toEqual([])
    expect(sin.alto).toBe(10 + 290 + 16 + 14 + 8 + 18)
  })
  it('1366×768 deja lugar: gráfico de 384 px + 118 de tarjeta (502) + franja de 153 + cabecera de 76 + aire de 12 ≤ 768', () => {
    expect(76 + 153 + 12 + (disenar(1276, 'medio', 3, true).alto + 118)).toBeLessThanOrEqual(768)
  })
})


// ── Pulido G3 ────────────────────────────────────────────────────────────────

const parada = (desdeMin: number, hastaMin: number, extra: Partial<ParadaEje> = {}): ParadaEje => ({ desdeMin, hastaMin, dueno: 'sin-imputar', causa: 'Detencion', maquina: null, ...extra })

describe('paradas: tiempo de reloj y episodios (no la suma por máquina)', () => {
  const tres = [
    parada(70, 125, { maquinaId: 'a', maquina: 'Evisceradora 1' }),
    parada(70, 125, { maquinaId: 'b', maquina: 'Evisceradora 2' }),
    parada(70, 125, { maquinaId: 'c', maquina: 'Evisceradora 3' }),
  ]
  it('3 paradas idénticas en Ev1–3 son 55 min de reloj y 1 episodio (la suma daba 165)', () => {
    expect(minutosConParada(tres)).toBe(55)
    expect(episodiosParada(tres)).toBe(1)
  })
  it('las paradas que se solapan o se tocan se fusionan; las separadas cuentan aparte', () => {
    const ps = [parada(10, 20), parada(15, 30), parada(30, 40), parada(100, 105)]
    expect(minutosConParada(ps)).toBe(35)
    expect(episodiosParada(ps)).toBe(2)
  })
  it('las programadas no cuentan y lo que sale del eje se recorta', () => {
    const ps = [parada(10, 20, { dueno: 'programado' }), parada(-5, 10), parada(440, 470)]
    expect(minutosConParada(ps)).toBe(45)
    expect(minutosConParada(ps, { min: 0, max: 450 })).toBe(20)
    expect(episodiosParada(ps, { min: 0, max: 450 })).toBe(2)
    expect(minutosConParada([])).toBe(0)
    expect(episodiosParada([])).toBe(0)
  })
  it('`paradasEn` devuelve TODAS las que cubren el minuto, la más larga primero', () => {
    const ps = [...tres, parada(60, 200, { maquinaId: 'd' }), parada(300, 310)]
    const en = paradasEn(ps, 100.5)
    expect(en.length).toBe(4)
    expect(en[0]!.maquinaId).toBe('d')
    expect(paradasEn(ps, 250)).toEqual([])
    expect(paradaEn(ps, 100.5)?.maquinaId).toBe('d')
  })
  it('`paradasEnEje` conserva el id de la máquina', () => {
    const grupos: GrupoDelTurno[] = [{ dueno: 'sin-imputar', min: 5, piezas: 0, causas: [{ reason: 'X', min: 5, count: 1, piezas: 0, categoria: null, extension: false, paradas: [{ hora: '22:10', hasta: '22:15', min: 5, desdeMin: 40, hastaMin: 45, maquina: 'Evisceradora 1', maquinaId: 'a' }] }] }]
    expect(paradasEnEje(grupos, 0, 0)[0]!.maquinaId).toBe('a')
  })
})

describe('horasMin', () => {
  it('«X h Y min», «N min» y, bajo 1 min, segundos (no «0 min»)', () => {
    expect(horasMin(125)).toBe('2 h 5 min')
    expect(horasMin(55)).toBe('55 min')
    expect(horasMin(0.6)).toBe('36 s')
    expect(horasMin(0.01)).toBe('1 s')
    expect(horasMin(0)).toBe('0 min')
    expect(horasMin(119.6)).toBe('2 h 0 min')
  })
})

describe('escala Y con zoom', () => {
  it('el dominio sale de los datos visibles, con paso 100 / 200 / 500 / 1.000 según el rango y la rejilla cada 2 pasos', () => {
    const casos: Array<[number, number, number]> = [[9300, 9800, 100], [13500, 15479, 200], [4000, 8000, 500], [1000, 9000, 1000]]
    for (const [min, max, paso] of casos) {
      const e = escalaVentana(min, max)
      expect(e.paso).toBe(paso)
      expect(e.rejilla).toBe(paso * 2)
      expect(e.yMin).toBeLessThanOrEqual(min)
      expect(e.yMax).toBeGreaterThanOrEqual(max)
      expect(e.yMin % paso).toBe(0)
      expect(e.yMax % e.rejilla).toBe(0)
    }
  })
  it('deja aire arriba y abajo y nunca baja de 0', () => {
    const e = escalaVentana(9400, 9800)
    expect(e.yMin).toBeLessThan(9400)
    expect(e.yMax).toBeGreaterThan(9800)
    expect(escalaVentana(0, 300).yMin).toBe(0)
    const plano = escalaVentana(5000, 5000)
    expect(plano.yMax).toBeGreaterThan(plano.yMin)
  })
  it('las rayas son múltiplos de la rejilla (números redondos) y la última cae en `yMax`', () => {
    expect(rayasY(0, 6000, 2000)).toEqual([0, 2000, 4000, 6000])
    const e = escalaVentana(12700, 15300)
    expect(e.paso).toBe(500)
    const r = rayasY(e.yMin, e.yMax, e.rejilla)
    expect(r.every((v) => v % e.rejilla === 0 && v >= e.yMin && v <= e.yMax)).toBe(true)
    expect(r[r.length - 1]).toBe(e.yMax)
    expect(e.yMin).toBe(12500)
    expect(r).toEqual([13000, 14000, 15000, 16000])
  })
  it('`dominioVisible` toma los puntos dentro de la ventana y el valor interpolado en sus bordes', () => {
    const a = [{ min: 0, v: 0 }, { min: 100, v: 1000 }]
    const b = [{ min: 0, v: 0 }, { min: 100, v: 500 }]
    expect(dominioVisible([a, b], 40, 60)).toEqual({ min: 200, max: 600 })
    expect(dominioVisible([a], 200, 300)).toBeNull()
    expect(dominioVisible([[]], 0, 10)).toBeNull()
  })
})

describe('horas del eje X en múltiplos de reloj', () => {
  const ini2130 = Date.UTC(2026, 9, 27, 21, 30)
  const ini2140 = Date.UTC(2026, 9, 27, 21, 40)
  const horas = (iniMs: number, marcas: number[]) => marcas.map((t) => new Date(iniMs + t * 60_000).toISOString().slice(11, 16))
  it('turno que parte a las 21:30: 22:00, 23:00… y el inicio rotulado porque queda lejos de la primera marca', () => {
    const m = marcasEje({ totalMin: 450, pxPorMin: 2.5, minPx: 100, ahoraMin: null, ahoraPx: 0, iniMs: ini2130 })
    expect(horas(ini2130, m)).toEqual(['21:30', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00'])
  })
  it('turno que parte a las 21:40: la primera marca es 22:00 y el inicio NO se rotula si queda a menos de 0,6 de paso', () => {
    const m = marcasEje({ totalMin: 450, pxPorMin: 2.5, minPx: 100, ahoraMin: null, ahoraPx: 0, iniMs: ini2140 })
    expect(horas(ini2140, m)).toEqual(['22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00'])
    expect(m).not.toContain(0)
  })
  it('con paso de 2 h cae en horas pares', () => {
    const m = marcasEje({ totalMin: 450, pxPorMin: 0.58, minPx: 64, ahoraMin: null, ahoraPx: 0, iniMs: ini2130 })
    expect(horas(ini2130, m).filter((_, i) => i > 0 && i < m.length - 1).every((h) => Number(h.slice(0, 2)) % 2 === 0 && h.endsWith(':00'))).toBe(true)
  })
  it('rótulo del «ahora» con ancla `end`: se omite la marca que se montaría sobre él (antes 04:30 pisaba «05:00 ahora»)', () => {
    const m = marcasEje({ totalMin: 450, pxPorMin: 2.5, minPx: 100, ahoraMin: 435, ahoraPx: 64, iniMs: ini2130, ahoraAncla: 'end', ahoraRotuloPx: anchoRotuloAhora(12) })
    expect(m).not.toContain(450)
    expect(m).toContain(390)
  })
  it('con ancla `end` la zona sin marcas va hacia la izquierda: la marca de la derecha del texto no estorba', () => {
    const m = marcasEje({ totalMin: 450, pxPorMin: 2.5, minPx: 100, ahoraMin: 300, ahoraPx: 64, iniMs: ini2130, ahoraAncla: 'end', ahoraRotuloPx: 64 })
    expect(m).not.toContain(270)
    expect(m).toContain(330)
  })
  it('con ancla `start` la zona va hacia la derecha y con `middle` es simétrica', () => {
    const s = marcasEje({ totalMin: 450, pxPorMin: 2.5, minPx: 100, ahoraMin: 10, ahoraPx: 64, iniMs: ini2130, ahoraAncla: 'start', ahoraRotuloPx: 64 })
    expect(s).not.toContain(0)
    expect(s).not.toContain(30)
    expect(s).toContain(90)
    const c = marcasEje({ totalMin: 450, pxPorMin: 2.5, minPx: 100, ahoraMin: 215, ahoraPx: 64, iniMs: ini2130, ahoraAncla: 'middle', ahoraRotuloPx: 64 })
    expect(c).not.toContain(210)
    expect(c).toContain(150)
    expect(c).toContain(270)
  })
  it('celular (255 px de lienzo): el fin del turno no se rotula si su texto pisaría la hora de al lado (antes «14:00» y «15:00» se montaban 6 px)', () => {
    const ini = Date.UTC(2026, 9, 28, 8, 0)
    const pxMin = 255 / 420
    const sin = marcasEje({ totalMin: 420, pxPorMin: pxMin, minPx: 64, ahoraMin: null, ahoraPx: 0, iniMs: ini, marcaPx: 27 })
    expect(horas(ini, sin)).toEqual(['08:00', '10:00', '12:00', '14:00'])
    /* Con 90 min entre la última hora y el fin (Filete 08:00 → 15:30) sí caben las dos. */
    const con = marcasEje({ totalMin: 450, pxPorMin: 255 / 450, minPx: 64, ahoraMin: null, ahoraPx: 0, iniMs: ini, marcaPx: 27 })
    expect(horas(ini, con)).toEqual(['08:00', '10:00', '12:00', '14:00', '15:30'])
  })
  it('celular: el inicio del turno tampoco se rotula si su texto pisaría la primera hora (turno que parte 13 min antes de las 08:00)', () => {
    const ini = Date.UTC(2026, 9, 28, 7, 47)
    const m = marcasEje({ totalMin: 420, pxPorMin: 255 / 420, minPx: 64, ahoraMin: null, ahoraPx: 0, iniMs: ini, marcaPx: 27 })
    expect(m[0]).toBe(13)
    expect(horas(ini, m)[0]).toBe('08:00')
  })
  it('el ancho del rótulo: 64 px a 12 px y 59 px a 11 px', () => {
    expect([anchoRotuloAhora(12), anchoRotuloAhora(11)]).toEqual([64, 59])
  })
})

describe('rótulos en vivo contra el borde VISIBLE (con zoom, la ventana)', () => {
  const ancho = anchoRotuloAhora(11)
  it('en el medio, centrado sobre la raya', () => {
    expect(anclaRotuloAhora({ xAhora: 130, visIni: 0, visDer: 261, anchoRotulo: ancho })).toEqual({ ancla: 'middle', x: 130 })
  })
  it('cerca del borde derecho se ancla hacia adentro, y si la raya quedó FUERA de la ventana el texto se acota al borde (turno cerrado con zoom de 15 min: «04:50 fin» se salía 29 px)', () => {
    expect(anclaRotuloAhora({ xAhora: 245, visIni: 0, visDer: 261, anchoRotulo: ancho })).toEqual({ ancla: 'end', x: 245 })
    expect(anclaRotuloAhora({ xAhora: 268, visIni: 0, visDer: 261, anchoRotulo: ancho })).toEqual({ ancla: 'end', x: 259 })
  })
  it('cerca del borde izquierdo de la ventana se ancla hacia adentro', () => {
    expect(anclaRotuloAhora({ xAhora: 1010, visIni: 1000, visDer: 1261, anchoRotulo: ancho })).toEqual({ ancla: 'start', x: 1010 })
    expect(anclaRotuloAhora({ xAhora: 990, visIni: 1000, visDer: 1261, anchoRotulo: ancho })).toEqual({ ancla: 'start', x: 1002 })
  })
  it('«a esta hora»: a la derecha de la punta si cabe en lo visible; si no, a su izquierda (a 375 con zoom de 1 h se cortaba 56 px)', () => {
    const texto = 'a esta hora +108'.length * 7.4
    expect(brechaALaIzquierda(100, texto, 261)).toBe(false)
    expect(brechaALaIzquierda(222, texto, 261)).toBe(true)
    /* Sin zoom la «ventana» es el lienzo entero: la punta a medio camino sigue cabiendo. */
    expect(brechaALaIzquierda(900, texto, 3000)).toBe(false)
  })
})

describe('cubetas de las barras con poco ancho', () => {
  it('desde 2 px por minuto se dibuja minuto a minuto; debajo, cubetas de ≥ 3 px (a 375 en «Turno»: 6 min)', () => {
    expect(minutosPorCubeta(3.5)).toBe(1)
    expect(minutosPorCubeta(2)).toBe(1)
    expect(minutosPorCubeta(1.99)).toBe(2)
    expect(minutosPorCubeta(0.58)).toBe(6)
    expect(minutosPorCubeta(0)).toBe(1)
  })
  it('la cubeta promedia pz/min y el esperado; el minuto parcial no entra al promedio si hay minutos cerrados', () => {
    const suma = [10, 12, 14, 10, 10, 0]
    const esp = suma.map(() => 20)
    const cs = cubetasDeLinea(suma, esp, 3, 5)
    expect(cs.length).toBe(2)
    expect(cs[0]).toMatchObject({ k0: 0, len: 3, prom: 12, esperado: 20, parcial: false })
    expect(cs[1]).toMatchObject({ k0: 3, len: 3, prom: 10, parcial: false })
  })
  it('una cubeta toda parcial se marca para dibujarla atenuada; sin esperado en algún minuto no hay esperado', () => {
    const cs = cubetasDeLinea([10, 10, 10, 4], [20, 20, 20, null], 3, 3)
    expect(cs[1]).toMatchObject({ prom: 4, esperado: null, parcial: true })
    expect(cs[0]!.parcial).toBe(false)
    expect(cubetasDeLinea([10, 10], [20, 20], 1, 2).every((c) => !c.parcial)).toBe(true)
  })
  it('la fila Ev toma el peor tono que ocupe 2 o más minutos de la cubeta', () => {
    expect(tonoDeCubeta(['bien', 'bien', 'mal', 'bien', 'bien', 'bien'])).toBe('bien')
    expect(tonoDeCubeta(['mal', 'mal', 'bien', 'bien', 'atento', 'sin'])).toBe('mal')
    expect(tonoDeCubeta(['atento', 'atento', 'bien', 'bien', 'bien', 'bien'])).toBe('atento')
    expect(tonoDeCubeta(['mal', 'bien'])).toBe('mal')
    expect(tonoDeCubeta(['mal'])).toBe('mal')
    expect(tonoDeCubeta(['sin', 'sin'])).toBe('sin')
  })
  it('una cubeta sin ningún minuto no se pinta de rojo: es neutra', () => {
    expect(tonoDeCubeta([])).toBe('sin')
  })
})

describe('turno cerrado: hasta dónde llega el eje', () => {
  const fin = Date.UTC(2026, 9, 28, 5, 0)
  it('en vivo, el fin previsto', () => {
    expect(finDelEje({ finMs: fin, cerrado: false, finRealMs: fin + 600_000 })).toBe(fin)
  })
  it('cerrado nunca encoge el eje (corte anticipado) y llega al fin real o al último dato si pasan del previsto', () => {
    expect(finDelEje({ finMs: fin, cerrado: true, finRealMs: fin - 10 * 60_000, ultimoDatoMs: fin - 10 * 60_000 })).toBe(fin)
    expect(finDelEje({ finMs: fin, cerrado: true, finRealMs: fin + 5 * 60_000 })).toBe(fin + 5 * 60_000)
    expect(finDelEje({ finMs: fin, cerrado: true, finRealMs: null, ultimoDatoMs: fin + 2 * 60_000 })).toBe(fin + 2 * 60_000)
    expect(finDelEje({ finMs: fin, cerrado: true, finRealMs: NaN })).toBe(fin)
  })
})

describe('turno anterior: UNA cifra', () => {
  const previo = [{ minutes: 5, pieces: 90 }, { minutes: 300, pieces: 9325 }, { minutes: 440, pieces: 14000 }]
  it('en vivo es el valor de su curva en el mismo minuto desde la primera pieza (lo que se dibuja)', () => {
    const c = cifraTurnoAnterior({ curva: previo, cerrado: false, ultimaMin: 305, baseMin: 5 })
    expect(c).toEqual({ piezas: 9325, modo: 'a-esta-hora' })
    expect(cifraTurnoAnterior({ curva: previo, cerrado: false, ultimaMin: 500, baseMin: 5 })).toBeNull()
  })
  it('cerrado es su total, el último punto de su curva COMPLETA (el mismo de «Comparado con otros días»)', () => {
    expect(cifraTurnoAnterior({ curva: previo, cerrado: true, ultimaMin: 440, baseMin: 5 })).toEqual({ piezas: 14000, modo: 'al-cierre' })
  })
  it('sin curva (o con un solo punto) no hay cifra', () => {
    expect(cifraTurnoAnterior({ curva: null, cerrado: false, ultimaMin: 10, baseMin: 0 })).toBeNull()
    expect(cifraTurnoAnterior({ curva: [previo[0]!], cerrado: true, ultimaMin: 10, baseMin: 0 })).toBeNull()
  })
})

describe('rótulos en vivo que se cruzan', () => {
  it('la brecha baja a `yCierre + 16`; si no cabe, el cierre sube', () => {
    expect(separarRotulos(100, 105, 200)).toEqual({ yBrecha: 121, yCierre: 105 })
    expect(separarRotulos(190, 195, 200)).toEqual({ yBrecha: 190, yCierre: 174 })
  })
  it('lejos uno del otro no se tocan', () => {
    expect(separarRotulos(100, 140, 200)).toEqual({ yBrecha: 100, yCierre: 140 })
  })
})
