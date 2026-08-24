/**
 * Guard de los datos derivados del despiece que consume la UI:
 * familias (zona sugerida), destacados, piezas compartidas y el mapa
 * código→figura que usa el módulo Repuestos para el camino inverso.
 *
 * Todos se regeneran con scripts/planos/*.py; si un cambio del extractor
 * rompe la forma, esto lo detiene antes del deploy.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PUB = join(__dirname, '..', '..', '..', 'public')

// ⚠ Los assets del despiece (254 hojas, ~27 MB) viven en Firebase Storage y
// NO están en git: en el CI no existen. Lo que SÍ viaja en el repo son
// partes.json y el mapa código→figura, y esos se validan siempre. Las
// aserciones que dependen del índice completo corren solo en local, donde
// el staging está presente — así el guard protege lo que el repo publica
// sin romper el build por un archivo que a propósito no versionamos.
const RUTA_INDICE = join(PUB, 'planos', 'baader-142-despiece', 'indice.json')
// `busqueda` y `descs` viajan APARTE (son el 62% del peso y solo hacen falta
// al buscar): el guard tiene que mirar los dos archivos, igual que la app.
const RUTA_BUSQUEDA = join(PUB, 'planos', 'baader-142-despiece', 'busqueda.json')
const hayIndice = existsSync(RUTA_INDICE)
const soloLocal = hayIndice ? describe : describe.skip

const indice = (hayIndice
  ? {
      ...JSON.parse(readFileSync(RUTA_INDICE, 'utf8')),
      ...(existsSync(RUTA_BUSQUEDA) ? JSON.parse(readFileSync(RUTA_BUSQUEDA, 'utf8')) : {}),
    }
  : { hojas: [], indice: {}, busqueda: [] }) as {
  hojas: { blatt: number; fig?: string; tituloEs: string }[]
  destacados?: { hoja: number; etiqueta: string; detalle: string }[]
  usosPorCodigo?: Record<string, number>
  umbralComun?: number
  sapPorCodigo?: Record<string, { s: string; n: string; u: string }>
  indice: Record<string, { h: number }[]>
}
const partes = JSON.parse(
  readFileSync(join(PUB, 'planos', 'baader-142-888', 'partes.json'), 'utf8'),
) as {
  familias?: Record<string, { etiqueta: string; figuras: { fig: string; hoja: number; titulo: string; n: number }[] }>
}
const mapa = JSON.parse(
  readFileSync(join(PUB, 'data', 'despiece-142-figuras.json'), 'utf8'),
) as { plano: string; codigos: Record<string, [number, string]> }

const hojasValidas = new Set(indice.hojas.map((h) => h.blatt))

soloLocal('destacados del despiece', () => {
  it('existen y apuntan a una hoja real', () => {
    expect(indice.destacados?.length).toBeGreaterThan(0)
    for (const d of indice.destacados ?? []) {
      expect(hojasValidas.has(d.hoja)).toBe(true)
      expect(d.etiqueta).toBeTruthy()
    }
  })
  it('el acceso a piezas de desgaste sigue presente', () => {
    const desgaste = indice.destacados?.find((d) => /desgaste/i.test(d.etiqueta))
    expect(desgaste, 'se perdió el acceso directo a piezas de desgaste').toBeDefined()
  })
})

describe('familias (zona sugerida por letra IEC)', () => {
  it('cubre las familias que el técnico busca en gabinete', () => {
    for (const fam of ['K', 'Q', 'F', 'B']) {
      expect(partes.familias?.[fam], `falta la familia ${fam}`).toBeDefined()
    }
  })
  it('cada figura sugerida existe y trae etiqueta legible', () => {
    if (!hayIndice) return // sin el índice no hay contra qué validar las hojas
    for (const [fam, datos] of Object.entries(partes.familias ?? {})) {
      expect(datos.etiqueta, `familia ${fam} sin etiqueta`).toBeTruthy()
      expect(datos.figuras.length, `familia ${fam} sin figuras`).toBeGreaterThan(0)
      expect(datos.figuras.length, `familia ${fam} con demasiadas figuras`).toBeLessThanOrEqual(4)
      for (const f of datos.figuras) {
        expect(hojasValidas.has(f.hoja), `${fam}: hoja ${f.hoja} no existe`).toBe(true)
        expect(f.fig).toBeTruthy()
      }
    }
  })
  it('los contactores apuntan a alguna caja de distribución', () => {
    const titulos = (partes.familias?.['K']?.figuras ?? []).map((f) => f.titulo.toLowerCase())
    expect(titulos.some((t) => t.includes('distribu'))).toBe(true)
  })
})

soloLocal('piezas compartidas', () => {
  it('el umbral separa específicas de ferretería común', () => {
    expect(indice.umbralComun).toBeGreaterThan(1)
    const usos = Object.values(indice.usosPorCodigo ?? {})
    expect(usos.length).toBeGreaterThan(100)
    expect(usos.every((n) => n > 1), 'usosPorCodigo solo debe traer las compartidas').toBe(true)
  })
})

soloLocal('sinónimos de planta', () => {
  const sin = (indice as unknown as { sinonimos?: Record<string, string> }).sinonimos ?? {}
  it('existen y traducen a vocabulario REAL del catálogo', () => {
    expect(Object.keys(sin).length).toBeGreaterThanOrEqual(10)
    const vocab = new Set<string>()
    for (const b of (indice as unknown as { busqueda: { es?: string }[] }).busqueda) {
      for (const w of (b.es ?? '').toLowerCase().match(/[a-záéíóúñ]{3,}/g) ?? []) vocab.add(w)
    }
    for (const [alias, destino] of Object.entries(sin)) {
      for (const palabra of destino.split(' ')) {
        expect(vocab.has(palabra), `sinónimo ${alias}→${destino}: "${palabra}" no está en el catálogo`).toBe(true)
      }
      expect(vocab.has(alias), `"${alias}" ya existe en el catálogo, no necesita sinónimo`).toBe(false)
    }
  })
  it('cubre los chilenismos que el catálogo NO usa', () => {
    // "canaleta" (el catálogo dice atarjea), "descanso" y "golilla" no
    // aparecen nunca en el catálogo: sin sinónimo el buscador da cero.
    for (const alias of ['canaleta', 'descanso', 'golilla']) {
      expect(sin[alias], `falta el sinónimo "${alias}"`).toBeTruthy()
    }
  })
  it('no inventa sinónimos para palabras que el catálogo ya usa', () => {
    // "rodamiento" aparece 22 veces en el propio catálogo: agregarlo como
    // alias de "cojinete" solo ensuciaría los resultados.
    expect(sin['rodamiento']).toBeUndefined()
  })
})

soloLocal('cantidades heredadas del catálogo 2014', () => {
  it('la figura de infraestructura trae cantidades > 1', () => {
    const hoja6 = JSON.parse(
      readFileSync(join(PUB, 'planos', 'baader-142-despiece', 'hoja-06.json'), 'utf8'),
    ) as { filas: { pos: string; q?: number | string }[] }
    const conQ = hoja6.filas.filter((f) => f.q)
    expect(conQ.length).toBeGreaterThan(0)
    // x1 no se emite: es el caso normal y solo haría ruido
    for (const f of conQ) expect(String(f.q)).not.toBe('1')
  })
})

describe('mapa código→figura (camino inverso desde Repuestos)', () => {
  it('apunta al plano correcto y a hojas reales', () => {
    expect(mapa.plano).toBe('baader-142-despiece')
    const entradas = Object.entries(mapa.codigos)
    expect(entradas.length).toBeGreaterThan(1000)
    for (const [cod, [hoja, fig]] of entradas.slice(0, 200)) {
      expect(hoja, `${cod}: hoja inválida`).toBeGreaterThan(0)
      expect(fig, `${cod}: sin figura`).toBeTruthy()
      if (hayIndice) expect(hojasValidas.has(hoja), `${cod}: hoja ${hoja} no existe`).toBe(true)
    }
  })
  it('cubre las piezas de desgaste (uso diario)', () => {
    // cuchilla circular de la figura 00
    expect(mapa.codigos['94010405']).toBeDefined()
  })
  it('es consistente con el índice del despiece', () => {
    if (!hayIndice) return
    for (const [cod, [hoja]] of Object.entries(mapa.codigos).slice(0, 100)) {
      expect(indice.indice[cod]?.some((a) => a.h === hoja), `${cod} no coincide con el índice`).toBe(true)
    }
  })
})

/**
 * El mapa inverso de la fileteadora se generaba desde hacía tiempo (1.510
 * códigos) y la vista de Repuestos cargaba SOLO el de la evisceradora: el
 * botón "Ver dibujo" no aparecía nunca para la 200 aunque el dato estaba ahí.
 * Este guard obliga a que cada archivo generado tenga quien lo consuma.
 */
describe('mapas inversos codigo -> figura', () => {
  const VISTA = join(__dirname, '..', '..', 'pages', 'repuestos', 'CodigosFabricanteView.tsx')

  it('todos los archivos despiece-*-figuras.json estan declarados en la vista', () => {
    const fuente = readFileSync(VISTA, 'utf8')
    const generados = readdirSync(join(PUB, 'data')).filter((f) => /^despiece-\d+-figuras\.json$/.test(f))
    expect(generados.length).toBeGreaterThan(1)
    for (const archivo of generados) expect(fuente).toContain(archivo)
  })
})
