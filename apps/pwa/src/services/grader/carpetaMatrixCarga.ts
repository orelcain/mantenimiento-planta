/**
 * Carpeta de Matrix — una revisión: lista la carpeta, parsea los archivos nuevos
 * y los guarda con `guardarSegmentosTurno` (modo automático), la MISMA función
 * que usa la carga manual, y sube el original con las mismas funciones del
 * servicio de uploads, con ID y ruta deterministas (reintentos sin duplicados).
 * No escribe ni borra nada en la carpeta.
 *
 * Las reglas de decisión están en carpetaMatrix.ts (puras, con tests). Aquí solo
 * se leen y escriben datos. Ningún fallo sale hacia afuera: cada archivo queda
 * con su resultado y su contador de intentos.
 */
import { listarExcelsEnCarpeta, resumirAnalisis, type CarpetaHandle } from './diagnosticoMatrix'
import { mergeParsedData, parseFile } from './graderExcelParser'
import { getDailySummary } from './graderDailySummary.service'
import {
  derivarSegmentosTurno,
  getDefaultGates,
  guardarSegmentosTurno,
  piezasDeSegmento,
  quedarSegmentos,
  type SegmentosTurno,
  type UsuarioGuarda,
} from './guardarTurnoGrader'
import { getGraderUpload, saveGraderUpload, updateGraderUpload, uploadGraderFile } from './graderUpload.service'
import { getModuleRanges } from './graderModuleConfig.service'
import { loadShoplogixShiftWindows } from './graderShoplogixWindows'
import { normalizeShiftSchedule, DEFAULT_SHIFT_SCHEDULE } from './graderShiftSchedule'
import { DEFAULT_PLANT_LINE_ID, getPlantLineConfig } from '@/config/plantLines'
import { logger } from '@/lib/logger'
import {
  CM_VENTANA_MS,
  OPCIONES_LISTADO_CARPETA,
  archivoEstable,
  calcularAlDia,
  claveArchivo,
  contarRegistrosPiezaAPieza,
  cortadoMasReciente,
  debeLimpiarCortado,
  debeOmitirPorDatosMasCompletos,
  decidirMarcado,
  decidirReintento,
  esExporteCortado,
  esNombrePiezaAPieza,
  esSinDatos,
  idSubidaAutomatica,
  listadoIncompleto,
  seleccionarCandidatos,
  ultimaPiezaProcesada,
  ultimoOtroTrasLote,
  ultimoTrasResultado,
  type CortadoInfo,
  type ResultadoArchivo,
  type TipoResultado,
  type UltimoOtro,
  type UltimoResultado,
} from './carpetaMatrix'
import { carpetaMatrixStore } from './carpetaMatrixStore'
import type { ParsedMatrixData } from './types'

export interface ResultadoRevision {
  ultimo: UltimoResultado | null
  cortado: CortadoInfo | null
  /** Último archivo que no es Pieza a pieza (p. ej. Puerta 0) cargado, o null. */
  ultimoOtro: UltimoOtro | null
  /** epoch ms del Pieza a pieza más nuevo de la carpeta, o null. */
  ultimoPiezaAPieza: number | null
  /** Regla 10: solo con Pieza a pieza cargado u omitido reciente. */
  alDia: boolean
  /** Listado incompleto: no se puede decir «al día». */
  demasiados: boolean
  errorReciente: boolean
  errorTexto: string | null
}

type TipoArchivo = 'PIEZA_PIEZA' | 'OTRO'
type Parseado = Awaited<ReturnType<typeof parseFile>> & {
  file: File
  clave: string
  modificado: number
  tipoArchivo: TipoArchivo
}

const MENSAJE_SIN_DATOS = 'El archivo no trae datos legibles'

function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : 'error desconocido'
}

/** Revisa la carpeta una vez. Solo un fallo al leer la raíz se propaga (lo deja en error el vigilante). */
export async function revisarCarpeta(
  handle: CarpetaHandle,
  usuario: UsuarioGuarda,
  ahoraMs: number = Date.now(),
): Promise<ResultadoRevision> {
  const listado = await listarExcelsEnCarpeta(handle, OPCIONES_LISTADO_CARPETA)
  const entradas = listado.archivos
  const demasiados = listadoIncompleto(listado.truncado, listado.elementosNoLeidos)
  const piezas = entradas.filter((e) => esNombrePiezaAPieza(e.nombre))
  const porRuta = new Map(entradas.map((e) => [e.ruta, e]))

  let ultimo: UltimoResultado | null = (await carpetaMatrixStore.leerUltimo()) ?? null
  let cortado: CortadoInfo | null = (await carpetaMatrixStore.leerCortado()) ?? null
  let ultimoOtro: UltimoOtro | null = (await carpetaMatrixStore.leerUltimoOtro()) ?? null
  const intentos = await carpetaMatrixStore.leerIntentos()
  const procesados = new Set(await carpetaMatrixStore.leerProcesados())
  const candidatos = seleccionarCandidatos(
    entradas.map((e) => ({ ruta: e.ruta, tamano: e.tamano, modificado: e.modificado })),
    ahoraMs,
    procesados,
  )
  let errorTexto: string | null = null

  /** Guarda el resultado del archivo (regla 5) y, si es Pieza a pieza, el «último». */
  async function anotar(clave: string, archivo: string, modificado: number, tipoArchivo: TipoArchivo, tipo: TipoResultado, mensaje?: string): Promise<void> {
    const r: ResultadoArchivo = { tipo, tipoArchivo, archivo, modificado, detectadoEn: ahoraMs, mensaje }
    await carpetaMatrixStore.guardarResultado(clave, r)
  }

  async function fijarUltimo(tipoArchivo: TipoArchivo, nuevo: UltimoResultado): Promise<void> {
    ultimo = ultimoTrasResultado(ultimo, tipoArchivo, nuevo)
    if (ultimo) await carpetaMatrixStore.guardarUltimo(ultimo)
  }

  /** Regla 6: cada fallo cuenta; al tercero el archivo queda fallido definitivo. */
  async function registrarFallo(clave: string, archivo: string, modificado: number, tipoArchivo: TipoArchivo, motivo: string): Promise<void> {
    errorTexto = motivo
    const { intentos: n, fallido } = decidirReintento(intentos[clave] ?? 0)
    if (!fallido) {
      intentos[clave] = n
      await carpetaMatrixStore.guardarIntentos(intentos)
      return
    }
    delete intentos[clave]
    await carpetaMatrixStore.guardarIntentos(intentos)
    await carpetaMatrixStore.marcarProcesado(clave)
    const mensaje = `Falló ${n} veces: ${motivo}`
    await anotar(clave, archivo, modificado, tipoArchivo, 'fallido', mensaje)
    await fijarUltimo(tipoArchivo, { tipo: 'fallo', archivo, mensaje, detectadoEn: ahoraMs })
  }

  /** Subida del original: ID y ruta deterministas, reanuda sin duplicar ni dejar huérfanos. */
  async function subirOriginal(p: Parseado, inferred: { startAt?: string; endAt?: string }, sessionDate: string): Promise<void> {
    const id = idSubidaAutomatica(p.clave)
    const existente = await getGraderUpload(id)
    if (existente?.fileMeta?.downloadURL) return
    if (!existente) {
      await saveGraderUpload({ id, fileMeta: p.fileMeta, inferred, sessionDate, plantLineId: DEFAULT_PLANT_LINE_ID, createdBy: usuario.id })
    }
    const info = await uploadGraderFile(p.file, id, { rutaFija: true })
    await updateGraderUpload(id, {
      fileMeta: { ...(existente?.fileMeta ?? p.fileMeta), storagePath: info.storagePath, downloadURL: info.downloadURL },
    })
  }

  /** Guarda un lote de archivos nuevos. Nunca lanza: los fallos quedan en los contadores. */
  async function guardarLote(lote: Parseado[]): Promise<void> {
    const merged: ParsedMatrixData = mergeParsedData(lote)
    const linea = getPlantLineConfig(DEFAULT_PLANT_LINE_ID)
    const moduleCfg = await getModuleRanges(DEFAULT_PLANT_LINE_ID).catch(() => null)
    const shiftSchedule = normalizeShiftSchedule(moduleCfg?.shiftSchedule, linea.defaultShiftSchedule ?? DEFAULT_SHIFT_SCHEDULE)
    const fechas = new Set<string>()
    for (const r of [...merged.pieceRecords, ...merged.gate0Records]) if (r.ts) fechas.add(r.ts.slice(0, 10))
    const slxWindows = fechas.size > 0
      ? await loadShoplogixShiftWindows(Array.from(fechas), linea.plantSlug).catch(() => [])
      : []
    const multi: SegmentosTurno | null = derivarSegmentosTurno(merged, shiftSchedule, slxWindows)

    // Regla 3: cero segmentos o cero registros no es «cargado».
    const registros = merged.pieceRecords.length + merged.gate0Records.length
    if (!multi || esSinDatos(registros, multi.totalSegments)) {
      for (const p of lote) {
        await carpetaMatrixStore.marcarProcesado(p.clave)
        await anotar(p.clave, p.fileMeta.name, p.modificado, p.tipoArchivo, 'vacio', MENSAJE_SIN_DATOS)
        await fijarUltimo(p.tipoArchivo, { tipo: 'vacio', archivo: p.fileMeta.name, detectadoEn: ahoraMs })
        if (ultimo) await carpetaMatrixStore.guardarUltimo(ultimo)
      }
      return
    }

    const fallos: string[] = []
    // Regla 1: no pisar un turno con más piezas. Si no se puede leer el resumen, el segmento no se escribe.
    const omitir = new Set<string>()
    for (const [key, seg] of multi.entries) {
      let existente: Awaited<ReturnType<typeof getDailySummary>>
      try {
        existente = await getDailySummary(seg.sessionDate, seg.shiftId)
      } catch (e) {
        fallos.push(`lectura del resumen de ${key}: ${mensajeError(e)}`)
        omitir.add(key)
        continue
      }
      if (debeOmitirPorDatosMasCompletos(existente?.totalPieces ?? null, piezasDeSegmento(seg))) omitir.add(key)
    }
    const kept = quedarSegmentos(multi, (key) => !omitir.has(key))

    if (kept.totalSegments > 0) {
      const r = await guardarSegmentosTurno({
        modo: 'automatico',
        multiDayInfo: kept,
        parsedData: merged,
        user: usuario,
        gates: getDefaultGates(),
        gatesEditadas: false,
        lineId: DEFAULT_PLANT_LINE_ID,
        isClassificationPlant: linea.isClassificationPlant,
      })
      fallos.push(...r.fallos)
    }

    const sessionDate = kept.entries[0]?.[1].sessionDate ?? merged.inferred.startAt?.slice(0, 10) ?? new Date(ahoraMs).toISOString().slice(0, 10)
    const inferred = { startAt: merged.inferred.startAt, endAt: merged.inferred.endAt }
    for (const p of lote) {
      try {
        await subirOriginal(p, inferred, sessionDate)
      } catch (e) {
        fallos.push(`subida de ${p.fileMeta.name}: ${mensajeError(e)}`)
      }
    }

    // Regla 5: procesado solo si todo salió bien; si no, cada archivo cuenta un intento.
    if (!decidirMarcado(fallos)) {
      for (const p of lote) await registrarFallo(p.clave, p.fileMeta.name, p.modificado, p.tipoArchivo, fallos.join('; '))
      return
    }

    const tipo: TipoResultado = kept.totalSegments > 0 ? 'cargado' : 'omitido'
    for (const p of lote) {
      await carpetaMatrixStore.marcarProcesado(p.clave)
      await anotar(p.clave, p.fileMeta.name, p.modificado, p.tipoArchivo, tipo)
    }

    // Un Puerta 0 (u otro tipo) cargado no toca el «último» del Pieza a pieza: tiene su propio registro.
    if (tipo === 'cargado') {
      const nuevoOtro = ultimoOtroTrasLote(
        ultimoOtro,
        lote.map((p) => ({ tipoArchivo: p.tipoArchivo, kind: p.fileMeta.kind, archivo: p.fileMeta.name, modificado: p.modificado })),
        ahoraMs,
      )
      if (nuevoOtro !== ultimoOtro && nuevoOtro) {
        ultimoOtro = nuevoOtro
        await carpetaMatrixStore.guardarUltimoOtro(nuevoOtro)
      }
    }

    const pp = lote.filter((p) => p.tipoArchivo === 'PIEZA_PIEZA')
    if (pp.length > 0) {
      const masNuevo = pp.reduce((a, b) => (b.modificado > a.modificado ? b : a))
      if (tipo === 'omitido') {
        await fijarUltimo('PIEZA_PIEZA', { tipo: 'omitido', archivo: masNuevo.fileMeta.name, detectadoEn: ahoraMs })
      } else {
        const resumen = resumirAnalisis(masNuevo.fileMeta, merged)
        const piezasKept = kept.entries.reduce((s, [, seg]) => s + piezasDeSegmento(seg), 0)
        const turno = kept.entries.length === 1 ? kept.entries[0]![1] : null
        await fijarUltimo('PIEZA_PIEZA', {
          tipo: 'cargado',
          archivo: masNuevo.fileMeta.name,
          tamano: masNuevo.file.size,
          modificado: masNuevo.modificado,
          piezas: piezasKept,
          desde: resumen.desde,
          hasta: resumen.hasta,
          turnoDocId: turno ? `${turno.sessionDate}__${turno.shiftId}` : null,
          cargadoEn: ahoraMs,
        })
      }
      if (ultimo) await carpetaMatrixStore.guardarUltimo(ultimo)
      // Regla 9: solo un Pieza a pieza guardado sin fallos y más nuevo que el cortado lo limpia.
      if (debeLimpiarCortado(cortado, { tipo: 'PIEZA_PIEZA', modificado: masNuevo.modificado }, true)) {
        await carpetaMatrixStore.borrarCortado()
        cortado = null
      }
    }
  }

  const parseados: Parseado[] = []
  for (const c of candidatos) {
    const entrada = porRuta.get(c.ruta)
    if (!entrada) continue
    const clave = claveArchivo(c)
    const tipoNombre: TipoArchivo = esNombrePiezaAPieza(c.ruta) ? 'PIEZA_PIEZA' : 'OTRO'
    let file: File
    try {
      file = await entrada.handle.getFile()
    } catch (e) {
      await registrarFallo(clave, c.ruta, c.modificado, tipoNombre, `no se pudo abrir ${c.ruta}: ${mensajeError(e)}`)
      continue
    }
    // Regla 4: si cambió mientras se leía, se salta sin marcar ni contar intento.
    if (!archivoEstable(c, { size: file.size, lastModified: file.lastModified })) continue
    let res: Awaited<ReturnType<typeof parseFile>>
    try {
      res = await parseFile(file)
    } catch (e) {
      await registrarFallo(clave, c.ruta, c.modificado, tipoNombre, `no se pudo leer ${c.ruta}: ${mensajeError(e)}`)
      continue
    }
    const tipoArchivo: TipoArchivo = res.fileMeta.kind === 'PIEZA_PIEZA' ? 'PIEZA_PIEZA' : 'OTRO'
    // Regla 2: total de registros del Pieza a pieza.
    const total = contarRegistrosPiezaAPieza(res.partialData)
    if (esExporteCortado(res.fileMeta.kind, total)) {
      // Varios cortados: como referencia queda el de fecha máxima.
      const siguiente = cortadoMasReciente(cortado, { archivo: c.ruta, registros: total, modificado: c.modificado, detectadoEn: ahoraMs })
      if (siguiente !== cortado) {
        cortado = siguiente
        await carpetaMatrixStore.guardarCortado(cortado)
      }
      await carpetaMatrixStore.marcarProcesado(clave)
      await anotar(clave, c.ruta, c.modificado, tipoArchivo, 'cortado')
      continue
    }
    // Regla 3: sin registros, visto y no se reintenta.
    if (total === 0) {
      await carpetaMatrixStore.marcarProcesado(clave)
      await anotar(clave, c.ruta, c.modificado, tipoArchivo, 'vacio', MENSAJE_SIN_DATOS)
      await fijarUltimo(tipoArchivo, { tipo: 'vacio', archivo: c.ruta, detectadoEn: ahoraMs })
      if (ultimo) await carpetaMatrixStore.guardarUltimo(ultimo)
      continue
    }
    parseados.push({ ...res, file, clave, modificado: c.modificado, tipoArchivo })
  }

  if (parseados.length > 0) {
    try {
      await guardarLote(parseados)
    } catch (e) {
      // Red de seguridad: cualquier excepción inesperada cuenta como fallo de cada archivo.
      logger.error('Carpeta Matrix: error guardando el lote', e instanceof Error ? e : new Error(mensajeError(e)))
      for (const p of parseados) await registrarFallo(p.clave, p.fileMeta.name, p.modificado, p.tipoArchivo, mensajeError(e))
    }
  }

  // Regla 10: «al día» solo con Pieza a pieza cargado u omitido reciente y sin uno pendiente fuera de ventana.
  const resultados = Object.values(await carpetaMatrixStore.leerResultados())
  const procesadosAhora = new Set(await carpetaMatrixStore.leerProcesados())
  const piezaPendienteFueraVentana = piezas.some(
    (e) => !procesadosAhora.has(claveArchivo({ ruta: e.ruta, tamano: e.tamano, modificado: e.modificado })) && ahoraMs - e.modificado > CM_VENTANA_MS,
  )
  const alDia = calcularAlDia({ ultimoPiezaProcesado: ultimaPiezaProcesada(resultados), piezaPendienteFueraVentana, ahora: ahoraMs })

  return {
    ultimo,
    cortado,
    ultimoOtro,
    ultimoPiezaAPieza: piezas.length > 0 ? Math.max(...piezas.map((e) => e.modificado)) : null,
    alDia,
    demasiados,
    errorReciente: errorTexto !== null,
    errorTexto,
  }
}
