import { describe, it, expect } from 'vitest'
import {
  CM_DATO_VIEJO_MS,
  CM_REGISTROS_CORTE,
  CM_VENTANA_MS,
  archivoEstable,
  calcularAlDia,
  claveArchivo,
  contarRegistrosPiezaAPieza,
  crearCandado,
  cortadoMasReciente,
  debeLimpiarCortado,
  debeOmitirPorDatosMasCompletos,
  decidirMarcado,
  decidirReintento,
  derivarEstado,
  esExporteCortado,
  esNombrePiezaAPieza,
  esSinDatos,
  idSubidaAutomatica,
  listadoIncompleto,
  recortarResultados,
  ultimaPiezaProcesada,
  ultimoTrasResultado,
  recortarProcesados,
  seleccionarCandidatos,
  type CandidatoCarpeta,
  type HechosCarpeta,
  type UltimoResultado,
} from '../carpetaMatrix'

const AHORA = Date.UTC(2026, 10, 19, 12, 0, 0)
const HORA = 3_600_000
const MIN = 60_000
const DIA = 86_400_000

function archivo(ruta: string, hacia: number, tamano = 1000): CandidatoCarpeta {
  return { ruta, tamano, modificado: AHORA - hacia }
}

const cargado: UltimoResultado = {
  tipo: 'cargado', archivo: 'p.xlsx', tamano: 1, modificado: AHORA - HORA, piezas: 27_371,
  desde: null, hasta: null, turnoDocId: null, cargadoEn: AHORA,
}

function hechos(extra: Partial<HechosCarpeta> = {}): HechosCarpeta {
  return {
    autorizada: true,
    permisoConcedido: true,
    ultimo: null,
    cortado: null,
    demasiados: false,
    alDia: true,
    errorReciente: false,
    ...extra,
  }
}

describe('seleccionarCandidatos (ventana, estabilidad, procesados)', () => {
  it('ignora archivos fuera de la ventana de 48 h y deja los de dentro', () => {
    const dentro = archivo('Pieza pieza hoy.xlsx', 47 * HORA)
    const fuera = archivo('Pieza pieza vieja.xlsx', CM_VENTANA_MS + HORA)
    const res = seleccionarCandidatos([dentro, fuera], AHORA, new Set())
    expect(res.map((c) => c.ruta)).toEqual(['Pieza pieza hoy.xlsx'])
  })

  it('no toma archivos inestables (modificados hace 30 s o menos)', () => {
    const inestable = archivo('escribiendo.xlsx', 10_000)
    const limite = archivo('limite.xlsx', 30_000)
    const estable = archivo('listo.xlsx', 31_000)
    const res = seleccionarCandidatos([inestable, limite, estable], AHORA, new Set())
    expect(res.map((c) => c.ruta)).toEqual(['listo.xlsx'])
  })

  it('no vuelve a procesar un archivo ya procesado, pero sí si cambió de tamaño o fecha', () => {
    const a = archivo('pieza.xlsx', 5 * MIN, 500)
    const procesados = new Set([claveArchivo(a)])
    expect(seleccionarCandidatos([a], AHORA, procesados)).toHaveLength(0)
    expect(seleccionarCandidatos([{ ...a, tamano: 501 }], AHORA, procesados)).toHaveLength(1)
    expect(seleccionarCandidatos([{ ...a, modificado: a.modificado + 1 }], AHORA, procesados)).toHaveLength(1)
  })

  it('ordena del más nuevo al más viejo', () => {
    const res = seleccionarCandidatos(
      [archivo('viejo.xlsx', 20 * HORA), archivo('nuevo.xlsx', 2 * HORA), archivo('medio.xlsx', 9 * HORA)],
      AHORA,
      new Set(),
    )
    expect(res.map((c) => c.ruta)).toEqual(['nuevo.xlsx', 'medio.xlsx', 'viejo.xlsx'])
  })
})

describe('regla 2: cortado cuenta el total de registros', () => {
  it('suma piezas, No aplicable y gate0', () => {
    const p = {
      pieceRecords: new Array(9_990).fill(0),
      notApplicableRecords: new Array(7).fill(0),
      gate0Records: new Array(3).fill(0),
    }
    expect(contarRegistrosPiezaAPieza(p)).toBe(10_000)
    expect(esExporteCortado('PIEZA_PIEZA', contarRegistrosPiezaAPieza(p))).toBe(true)
  })

  it('con solo pieceRecords de 10.000 pero más No aplicable el total no es 10.000', () => {
    const p = { pieceRecords: new Array(10_000).fill(0), notApplicableRecords: [{}] }
    expect(esExporteCortado('PIEZA_PIEZA', contarRegistrosPiezaAPieza(p))).toBe(false)
  })

  it('no marca 9.999 ni 10.001, ni otro tipo de archivo con 10.000', () => {
    expect(CM_REGISTROS_CORTE).toBe(10_000)
    expect(esExporteCortado('PIEZA_PIEZA', 9_999)).toBe(false)
    expect(esExporteCortado('PIEZA_PIEZA', 10_001)).toBe(false)
    expect(esExporteCortado('PUERTA_0', 10_000)).toBe(false)
  })
})

describe('regla 3: sin datos nunca es cargado', () => {
  it('cero registros o cero segmentos es sin datos', () => {
    expect(esSinDatos(0, 3)).toBe(true)
    expect(esSinDatos(120, 0)).toBe(true)
    expect(esSinDatos(120, 2)).toBe(false)
  })
})

describe('regla 4: estabilidad tras leer el archivo', () => {
  it('cambió el tamaño o la fecha: no es estable', () => {
    const listado = { tamano: 100, modificado: 500 }
    expect(archivoEstable(listado, { size: 100, lastModified: 500 })).toBe(true)
    expect(archivoEstable(listado, { size: 101, lastModified: 500 })).toBe(false)
    expect(archivoEstable(listado, { size: 100, lastModified: 501 })).toBe(false)
  })
})

describe('regla 1: no pisar datos más completos', () => {
  it('omite si Matrix ya tiene más piezas que el segmento nuevo', () => {
    expect(debeOmitirPorDatosMasCompletos(13_000, 12_000)).toBe(true)
  })

  it('no omite si hay igual o menos piezas, ni si no hay resumen', () => {
    expect(debeOmitirPorDatosMasCompletos(12_000, 12_000)).toBe(false)
    expect(debeOmitirPorDatosMasCompletos(11_000, 12_000)).toBe(false)
    expect(debeOmitirPorDatosMasCompletos(null, 12_000)).toBe(false)
  })
})

describe('regla 5: procesado solo si todo salió bien', () => {
  it('con fallos no se marca; sin fallos sí', () => {
    expect(decidirMarcado(['detalle de piezas X: red'])).toBe(false)
    expect(decidirMarcado([])).toBe(true)
  })
})

describe('regla 6: máximo 3 intentos por archivo', () => {
  it('el tercer intento fallido deja el archivo como fallido', () => {
    expect(decidirReintento(0)).toEqual({ intentos: 1, fallido: false })
    expect(decidirReintento(1)).toEqual({ intentos: 2, fallido: false })
    expect(decidirReintento(2)).toEqual({ intentos: 3, fallido: true })
  })
})

describe('regla 7: listado incompleto', () => {
  it('tope alcanzado o elementos no leídos cuentan como incompleto', () => {
    expect(listadoIncompleto(true, 0)).toBe(true)
    expect(listadoIncompleto(false, 2)).toBe(true)
    expect(listadoIncompleto(false, 0)).toBe(false)
  })
})

describe('regla 9: el cortado se limpia solo con un Pieza a pieza sano y más nuevo', () => {
  const cortado = { modificado: AHORA - 2 * HORA }
  const pp = (modificado: number) => ({ tipo: 'PIEZA_PIEZA' as const, modificado })

  it('un Pieza a pieza guardado sin fallos y más nuevo lo limpia', () => {
    expect(debeLimpiarCortado(cortado, pp(AHORA - HORA), true)).toBe(true)
  })

  it('un archivo más viejo que el cortado no lo limpia', () => {
    expect(debeLimpiarCortado(cortado, pp(AHORA - 3 * HORA), true)).toBe(false)
    expect(debeLimpiarCortado(null, pp(AHORA), true)).toBe(false)
  })

  it('un Puerta 0 más nuevo no lo limpia', () => {
    expect(debeLimpiarCortado(cortado, { tipo: 'PUERTA_0', modificado: AHORA }, true)).toBe(false)
  })

  it('si hubo fallos en el guardado, no lo limpia', () => {
    expect(debeLimpiarCortado(cortado, pp(AHORA - HORA), false)).toBe(false)
  })

  it('con cortado activo, cargar otro archivo no lo borra del estado visible', () => {
    const h = hechos({ ultimo: cargado, cortado: { archivo: 'c.xlsx', registros: 10_000, modificado: cortado.modificado, detectadoEn: AHORA } })
    expect(derivarEstado(h)).toBe('cortado')
  })
})

describe('varios cortados: queda el de fecha máxima', () => {
  const viejo = { archivo: 'a.xlsx', registros: 10_000, modificado: AHORA - 5 * HORA, detectadoEn: AHORA }
  const nuevo = { archivo: 'b.xlsx', registros: 10_000, modificado: AHORA - HORA, detectadoEn: AHORA }

  it('un cortado más nuevo reemplaza al actual; uno más viejo no', () => {
    expect(cortadoMasReciente(viejo, nuevo)).toBe(nuevo)
    expect(cortadoMasReciente(nuevo, viejo)).toBe(nuevo)
    expect(cortadoMasReciente(null, viejo)).toBe(viejo)
  })
})

describe('regla 5: "visto" no es "cargado"', () => {
  const pp = (tipo: 'cargado' | 'omitido' | 'vacio' | 'fallido' | 'cortado', modificado: number) =>
    ({ tipo, tipoArchivo: 'PIEZA_PIEZA' as const, archivo: 'p.xlsx', modificado, detectadoEn: AHORA })
  const p0 = (tipo: 'cargado' | 'vacio', modificado: number) =>
    ({ tipo, tipoArchivo: 'OTRO' as const, archivo: 'p0.xlsx', modificado, detectadoEn: AHORA })

  it('alDia solo cuenta Pieza a pieza cargado u omitido (no cortado, vacío ni fallido)', () => {
    expect(ultimaPiezaProcesada([pp('cortado', AHORA), pp('vacio', AHORA), pp('fallido', AHORA)])).toBeNull()
    expect(ultimaPiezaProcesada([pp('cargado', AHORA - HORA)])).toBe(AHORA - HORA)
    expect(ultimaPiezaProcesada([pp('omitido', AHORA - 2 * HORA)])).toBe(AHORA - 2 * HORA)
  })

  it('un Puerta 0 cargado no cuenta como Pieza a pieza al día', () => {
    expect(ultimaPiezaProcesada([p0('cargado', AHORA)])).toBeNull()
  })

  it('un Puerta 0 cargado no puede ocultar un vacío del Pieza a pieza', () => {
    const vacio: UltimoResultado = { tipo: 'vacio', archivo: 'p.xlsx', detectadoEn: AHORA }
    expect(ultimoTrasResultado(vacio, 'OTRO', { tipo: 'omitido', archivo: 'p0.xlsx', detectadoEn: AHORA })).toBe(vacio)
    expect(derivarEstado(hechos({ ultimo: ultimoTrasResultado(vacio, 'OTRO', cargado) }))).toBe('error')
  })

  it('un Pieza a pieza válido sí reemplaza el error', () => {
    const fallo: UltimoResultado = { tipo: 'fallo', archivo: 'p.xlsx', mensaje: 'x', detectadoEn: AHORA }
    expect(ultimoTrasResultado(fallo, 'PIEZA_PIEZA', cargado)).toBe(cargado)
  })

  it('recortarResultados conserva los más recientes', () => {
    const mapa = { a: { detectadoEn: 1 }, b: { detectadoEn: 3 }, c: { detectadoEn: 2 } }
    expect(Object.keys(recortarResultados(mapa, 2)).sort()).toEqual(['b', 'c'])
  })
})

describe('regla 8: ID de subida determinista', () => {
  it('la misma clave da el mismo ID; claves distintas, IDs distintos', () => {
    const a = idSubidaAutomatica('p.xlsx|100|5')
    expect(idSubidaAutomatica('p.xlsx|100|5')).toBe(a)
    expect(idSubidaAutomatica('p.xlsx|101|5')).not.toBe(a)
    expect(idSubidaAutomatica('p.xlsx|100|6')).not.toBe(a)
    expect(a.startsWith('cm-')).toBe(true)
  })
})

describe('regla 10: al día solo con dato reciente', () => {
  it('un procesado de los últimos 3 días está al día', () => {
    expect(calcularAlDia({ ultimoPiezaProcesado: AHORA - 2 * DIA, piezaPendienteFueraVentana: false, ahora: AHORA })).toBe(true)
  })

  it('sin Pieza a pieza, o más viejo que 3 días, no está al día', () => {
    expect(calcularAlDia({ ultimoPiezaProcesado: null, piezaPendienteFueraVentana: false, ahora: AHORA })).toBe(false)
    expect(calcularAlDia({ ultimoPiezaProcesado: AHORA - CM_DATO_VIEJO_MS - HORA, piezaPendienteFueraVentana: false, ahora: AHORA })).toBe(false)
  })

  it('un Pieza a pieza nuevo fuera de la ventana sin procesar no deja estar al día', () => {
    expect(calcularAlDia({ ultimoPiezaProcesado: AHORA - HORA, piezaPendienteFueraVentana: true, ahora: AHORA })).toBe(false)
  })

  it('en el estado: no está al día = viejo, nunca «cargado» ni «vigilando»', () => {
    expect(derivarEstado(hechos({ alDia: false, ultimo: cargado }))).toBe('viejo')
    expect(derivarEstado(hechos({ alDia: false }))).toBe('viejo')
  })
})

describe('regla 11: candado sin solapes', () => {
  it('una segunda revisión no entra mientras la primera no suelta', () => {
    const c = crearCandado()
    expect(c.tomar()).toBe(true)
    expect(c.tomar()).toBe(false)
    c.soltar()
    expect(c.tomar()).toBe(true)
  })
})

describe('regla 8 y mensajes: estados visibles en orden de precedencia', () => {
  it('sin autorizar y permiso mandan sobre todo', () => {
    expect(derivarEstado(hechos({ autorizada: false }))).toBe('sin-autorizar')
    expect(derivarEstado(hechos({ permisoConcedido: false, errorReciente: true }))).toBe('permiso')
  })

  it('error > cortado > demasiados > viejo > cargado > vigilando', () => {
    const fallo: UltimoResultado = { tipo: 'fallo', archivo: 'x.xlsx', mensaje: 'x', detectadoEn: AHORA }
    const corte = { archivo: 'c.xlsx', registros: 10_000, modificado: AHORA, detectadoEn: AHORA }
    expect(derivarEstado(hechos({ errorReciente: true, cortado: corte, demasiados: true, alDia: false }))).toBe('error')
    expect(derivarEstado(hechos({ ultimo: fallo }))).toBe('error')
    expect(derivarEstado(hechos({ cortado: corte, demasiados: true, alDia: false }))).toBe('cortado')
    expect(derivarEstado(hechos({ demasiados: true, alDia: false }))).toBe('demasiados')
    expect(derivarEstado(hechos({ alDia: false, ultimo: cargado }))).toBe('viejo')
    expect(derivarEstado(hechos({ ultimo: cargado }))).toBe('cargado')
    expect(derivarEstado(hechos())).toBe('vigilando')
  })

  it('demasiados nunca se muestra como «al día» aunque el dato esté reciente', () => {
    expect(derivarEstado(hechos({ demasiados: true, alDia: true, ultimo: cargado }))).toBe('demasiados')
  })
})

describe('nombre del Pieza a pieza y utilidades', () => {
  it('reconoce el nombre del parser (pieza o piece)', () => {
    expect(esNombrePiezaAPieza('Pieza pieza Grader STATICGRADER1 (20261119_000000 - 20261120_000000).xlsx')).toBe(true)
    expect(esNombrePiezaAPieza('Puerta 0.xlsx')).toBe(false)
  })

  it('recortarProcesados deja solo los últimos N', () => {
    expect(recortarProcesados(['a', 'b', 'c', 'd'], 2)).toEqual(['c', 'd'])
    expect(recortarProcesados(['a'], 2)).toEqual(['a'])
  })
})
