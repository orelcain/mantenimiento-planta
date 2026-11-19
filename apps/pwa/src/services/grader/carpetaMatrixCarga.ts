/**
 * Carpeta de Matrix — una revisión: lista la carpeta, parsea los archivos nuevos
 * y los guarda con `guardarSegmentosTurno` (modo automático), la MISMA función
 * que usa la carga manual, más la misma subida del original (`saveGraderUpload`,
 * `uploadGraderFile`, `updateGraderUpload`). No escribe ni borra en la carpeta.
 *
 * Las reglas de decisión están en carpetaMatrix.ts (puras, con tests). Aquí solo
 * se leen y escriben datos. Los errores no se lanzan: quedan en el resultado.
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
import { saveGraderUpload, updateGraderUpload, uploadGraderFile } from './graderUpload.service'
import { getModuleRanges } from './graderModuleConfig.service'
import { loadShoplogixShiftWindows } from './graderShoplogixWindows'
import { normalizeShiftSchedule, DEFAULT_SHIFT_SCHEDULE } from './graderShiftSchedule'
import { DEFAULT_PLANT_LINE_ID, getPlantLineConfig } from '@/config/plantLines'
import { logger } from '@/lib/logger'
import {
  CM_VENTANA_MS,
  archivoEstable,
  calcularAlDia,
  claveArchivo,
  contarRegistrosPiezaAPieza,
  debeLimpiarCortado,
  debeOmitirPorDatosMasCompletos,
  decidirMarcado,
  decidirReintento,
  esExporteCortado,
  esNombrePiezaAPieza,
  esSinDatos,
  listadoIncompleto,
  seleccionarCandidatos,
  type CortadoInfo,
  type UltimoResultado,
} from './carpetaMatrix'
import { carpetaMatrixStore } from './carpetaMatrixStore'
import type { ParsedMatrixData } from './types'

export interface ResultadoRevision {
  ultimo: UltimoResultado | null
  cortado: CortadoInfo | null
  /** epoch ms del Pieza a pieza más nuevo de la carpeta, o null. */
  ultimoPiezaAPieza: number | null
  /** Ver `calcularAlDia`. Solo true con dato reciente y procesado. */
  alDia: boolean
  /** Listado incompleto: no se puede decir «al día». */
  demasiados: boolean
  errorReciente: boolean
  errorTexto: string | null
}

type Parseado = Awaited<ReturnType<typeof parseFile>> & { file: File; clave: string; modificado: number }

const MENSAJE_SIN_DATOS = 'El archivo no trae datos legibles'

function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : 'error desconocido'
}

/**
 * Revisa la carpeta una vez. Un fallo al leer la raíz sí se propaga (el vigilante
 * lo deja como error); el resto de fallos se registra por archivo.
 */
export async function revisarCarpeta(
  handle: CarpetaHandle,
  usuario: UsuarioGuarda,
  ahoraMs: number = Date.now(),
): Promise<ResultadoRevision> {
  const listado = await listarExcelsEnCarpeta(handle)
  const entradas = listado.archivos
  const demasiados = listadoIncompleto(listado.truncado, listado.elementosNoLeidos)
  const piezas = entradas.filter((e) => esNombrePiezaAPieza(e.nombre))
  const porRuta = new Map(entradas.map((e) => [e.ruta, e]))

  let ultimo: UltimoResultado | null = (await carpetaMatrixStore.leerUltimo()) ?? null
  let cortado: CortadoInfo | null = (await carpetaMatrixStore.leerCortado()) ?? null
  const intentos = await carpetaMatrixStore.leerIntentos()
  const procesados = new Set(await carpetaMatrixStore.leerProcesados())

  const candidatos = seleccionarCandidatos(
    entradas.map((e) => ({ ruta: e.ruta, tamano: e.tamano, modificado: e.modificado })),
    ahoraMs,
    procesados,
  )
  let errorTexto: string | null = null

  /** Regla 6: cuenta el intento; al tercero el archivo queda fallido y no se reintenta. */
  async function registrarFallo(clave: string, ruta: string, motivo: string): Promise<void> {
    errorTexto = motivo
    const { intentos: n, fallido } = decidirReintento(intentos[clave] ?? 0)
    if (fallido) {
      delete intentos[clave]
      await carpetaMatrixStore.guardarIntentos(intentos)
      await carpetaMatrixStore.marcarProcesado(clave)
      ultimo = { tipo: 'fallo', archivo: ruta, mensaje: `Falló ${n} veces: ${motivo}`, detectadoEn: ahoraMs }
      await carpetaMatrixStore.guardarUltimo(ultimo)
    } else {
      intentos[clave] = n
      await carpetaMatrixStore.guardarIntentos(intentos)
    }
  }

  /** Regla 3: sin datos legibles se marca visto y no se reintenta. */
  async function marcarSinDatos(clave: string, ruta: string): Promise<void> {
    ultimo = { tipo: 'fallo', archivo: ruta, mensaje: MENSAJE_SIN_DATOS, detectadoEn: ahoraMs }
    await carpetaMatrixStore.guardarUltimo(ultimo)
    await carpetaMatrixStore.marcarProcesado(clave)
  }

  const parseados: Parseado[] = []
  for (const c of candidatos) {
    const entrada = porRuta.get(c.ruta)
    if (!entrada) continue
    const clave = claveArchivo(c)
    let file: File
    try {
      file = await entrada.handle.getFile()
    } catch (e) {
      await registrarFallo(clave, c.ruta, `no se pudo abrir ${c.ruta}: ${mensajeError(e)}`)
      continue
    }
    // Regla 4: si cambió mientras lo leíamos, se salta sin marcar; la próxima revisión lo toma.
    if (!archivoEstable(c, { size: file.size, lastModified: file.lastModified })) continue
    let res: Awaited<ReturnType<typeof parseFile>>
    try {
      res = await parseFile(file)
    } catch (e) {
      await registrarFallo(clave, c.ruta, `no se pudo leer ${c.ruta}: ${mensajeError(e)}`)
      continue
    }
    // Regla 2: el total de registros del Pieza a pieza, no solo las piezas.
    const total = contarRegistrosPiezaAPieza(res.partialData)
    if (esExporteCortado(res.fileMeta.kind, total)) {
      cortado = { archivo: c.ruta, registros: total, modificado: c.modificado, detectadoEn: ahoraMs }
      await carpetaMatrixStore.guardarCortado(cortado)
      await carpetaMatrixStore.marcarProcesado(clave)
      continue
    }
    if (total === 0) {
      await marcarSinDatos(clave, c.ruta)
      continue
    }
    parseados.push({ ...res, file, clave, modificado: c.modificado })
  }

  if (parseados.length > 0) {
    try {
      await guardarLote(parseados)
    } catch (e) {
      errorTexto = `No se pudo guardar el Excel: ${mensajeError(e)}`
      logger.error('Carpeta Matrix: error guardando el lote', e instanceof Error ? e : new Error(mensajeError(e)))
    }
  }

  /** Guarda el lote de archivos nuevos: reglas 1, 3, 5, 8, 9. */
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

    // Regla 3: cero segmentos no es «cargado».
    if (!multi || esSinDatos(merged.pieceRecords.length + merged.gate0Records.length, multi.totalSegments)) {
      for (const p of lote) await marcarSinDatos(p.clave, p.fileMeta.name)
      return
    }

    // Regla 1: no pisar un turno que ya tiene más piezas guardadas.
    const omitir = new Set<string>()
    for (const [key, seg] of multi.entries) {
      const existente = await getDailySummary(seg.sessionDate, seg.shiftId)
      if (debeOmitirPorDatosMasCompletos(existente?.totalPieces ?? null, piezasDeSegmento(seg))) omitir.add(key)
    }
    const kept = quedarSegmentos(multi, (key) => !omitir.has(key))

    const fallos: string[] = []
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

    // Regla 8: el original se sube y se registra con las mismas funciones que la carga manual.
    const sessionDate = kept.entries[0]?.[1].sessionDate ?? merged.inferred.startAt?.slice(0, 10) ?? new Date(ahoraMs).toISOString().slice(0, 10)
    for (const p of lote) {
      try {
        const up = await saveGraderUpload({
          fileMeta: p.fileMeta,
          inferred: { startAt: merged.inferred.startAt, endAt: merged.inferred.endAt },
          sessionDate,
          plantLineId: DEFAULT_PLANT_LINE_ID,
          createdBy: usuario.id,
        })
        const info = await uploadGraderFile(p.file, up.id)
        await updateGraderUpload(up.id, {
          fileMeta: { ...up.fileMeta, storagePath: info.storagePath, downloadURL: info.downloadURL },
        })
      } catch (e) {
        fallos.push(`subida de ${p.fileMeta.name}: ${mensajeError(e)}`)
      }
    }

    // Regla 5: solo se marca procesado si todo salió bien.
    if (!decidirMarcado(fallos)) {
      for (const p of lote) await registrarFallo(p.clave, p.fileMeta.name, fallos.join('; '))
      return
    }
    for (const p of lote) {
      await carpetaMatrixStore.marcarProcesado(p.clave)
    }
    const masNuevo = lote.reduce((a, b) => (b.modificado > a.modificado ? b : a))
    if (kept.totalSegments === 0) {
      ultimo = { tipo: 'omitido', archivo: masNuevo.fileMeta.name, detectadoEn: ahoraMs }
    } else {
      const resumen = resumirAnalisis(masNuevo.fileMeta, merged)
      const piezasKept = kept.entries.reduce((s, [, seg]) => s + piezasDeSegmento(seg), 0)
      ultimo = {
        tipo: 'cargado',
        archivo: masNuevo.fileMeta.name,
        tamano: masNuevo.file.size,
        modificado: masNuevo.modificado,
        piezas: piezasKept,
        desde: resumen.desde,
        hasta: resumen.hasta,
        turnoDocId: kept.totalSegments === 1 ? `${kept.entries[0]![1].sessionDate}__${kept.entries[0]![1].shiftId}` : null,
        cargadoEn: ahoraMs,
      }
      // Regla 9: un Pieza a pieza completo más nuevo que el cortado lo limpia.
      if (debeLimpiarCortado(cortado, masNuevo.modificado)) {
        await carpetaMatrixStore.borrarCortado()
        cortado = null
      }
    }
    await carpetaMatrixStore.guardarUltimo(ultimo)
  }

  // Regla 10: «al día» depende de Pieza a pieza procesados recientes.
  const procesadosAhora = new Set(await carpetaMatrixStore.leerProcesados())
  const delMismoTipo = piezas.map((e) => ({ e, procesado: procesadosAhora.has(claveArchivo({ ruta: e.ruta, tamano: e.tamano, modificado: e.modificado })) }))
  const procesadosPiezas = delMismoTipo.filter((x) => x.procesado).map((x) => x.e.modificado)
  const ultimoPiezaProcesado = procesadosPiezas.length > 0 ? Math.max(...procesadosPiezas) : null
  const piezaPendienteFueraVentana = delMismoTipo.some(
    (x) => !x.procesado && ahoraMs - x.e.modificado > CM_VENTANA_MS,
  )
  const alDia = calcularAlDia({ ultimoPiezaProcesado, piezaPendienteFueraVentana, ahora: ahoraMs })
  const ultimoPiezaAPieza = piezas.length > 0 ? Math.max(...piezas.map((e) => e.modificado)) : null

  return {
    ultimo,
    cortado,
    ultimoPiezaAPieza,
    alDia,
    demasiados,
    errorReciente: errorTexto !== null,
    errorTexto,
  }

}
