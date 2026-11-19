/**
 * Carpeta de Matrix — una revisión: lista la carpeta, parsea los archivos nuevos
 * y los guarda con `guardarSegmentosTurno`, la MISMA función que usa la carga
 * manual del wizard. No escribe ni borra nada en la carpeta.
 *
 * Los errores no se lanzan hacia afuera: quedan en `errorReciente` para que el
 * aviso lo diga sin romper la app.
 */
import { listarExcelsEnCarpeta, resumirAnalisis, type CarpetaHandle } from './diagnosticoMatrix'
import { mergeParsedData, parseFile } from './graderExcelParser'
import { derivarSegmentosTurno, getDefaultGates, guardarSegmentosTurno, type UsuarioGuarda } from './guardarTurnoGrader'
import { getModuleRanges } from './graderModuleConfig.service'
import { loadShoplogixShiftWindows } from './graderShoplogixWindows'
import { normalizeShiftSchedule, DEFAULT_SHIFT_SCHEDULE } from './graderShiftSchedule'
import { DEFAULT_PLANT_LINE_ID, getPlantLineConfig } from '@/config/plantLines'
import { logger } from '@/lib/logger'
import {
  claveArchivo,
  esExporteCortado,
  esNombrePiezaAPieza,
  seleccionarCandidatos,
  type UltimoResultado,
} from './carpetaMatrix'
import { carpetaMatrixStore } from './carpetaMatrixStore'
import type { ParsedMatrixData } from './types'

export interface ResultadoRevision {
  ultimoResultado: UltimoResultado | null
  /** epoch ms del Pieza a pieza más nuevo que hay en la carpeta, o null. */
  ultimoPiezaAPieza: number | null
  errorReciente: boolean
  errorTexto: string | null
  /** Archivos nuevos que se guardaron en esta revisión. */
  cargadosEnRevision: number
}

type Parseado = Awaited<ReturnType<typeof parseFile>> & { file: File }

function mensajeError(e: unknown): string {
  return e instanceof Error ? e.message : 'error desconocido'
}

/**
 * Revisa la carpeta una vez. Un fallo al leer la raíz sí se propaga (lo ve el
 * vigilante, que lo deja como error); un fallo por archivo se registra y ese
 * archivo se reintenta en la siguiente revisión.
 */
export async function revisarCarpeta(
  handle: CarpetaHandle,
  usuario: UsuarioGuarda,
  ahora: number = Date.now(),
): Promise<ResultadoRevision> {
  const listado = await listarExcelsEnCarpeta(handle)
  const entradas = listado.archivos
  const piezas = entradas.filter((e) => esNombrePiezaAPieza(e.nombre))
  const ultimoPiezaAPieza = piezas.length > 0 ? Math.max(...piezas.map((e) => e.modificado)) : null
  const ultimoGuardado = (await carpetaMatrixStore.leerUltimo()) ?? null

  const procesados = new Set(await carpetaMatrixStore.leerProcesados())
  const candidatos = seleccionarCandidatos(
    entradas.map((e) => ({ ruta: e.ruta, tamano: e.tamano, modificado: e.modificado })),
    ahora,
    procesados,
  )
  const base = { ultimoPiezaAPieza, cargadosEnRevision: 0 }
  if (candidatos.length === 0) {
    return { ...base, ultimoResultado: ultimoGuardado, errorReciente: false, errorTexto: null }
  }

  const porRuta = new Map(entradas.map((e) => [e.ruta, e]))
  const parseados: Parseado[] = []
  const clavesParseadas: string[] = []
  let ultimoResultado: UltimoResultado | null = ultimoGuardado
  let errorTexto: string | null = null

  for (const c of candidatos) {
    const entrada = porRuta.get(c.ruta)
    if (!entrada) continue
    try {
      const file = await entrada.handle.getFile()
      const res = await parseFile(file)
      const registros = res.partialData.pieceRecords?.length ?? 0
      if (esExporteCortado(res.fileMeta.kind, registros)) {
        // Un exporte cortado no se carga: se marca visto para no reintentarlo.
        ultimoResultado = { tipo: 'cortado', archivo: c.ruta, registros, detectadoEn: ahora }
        await carpetaMatrixStore.guardarUltimo(ultimoResultado)
        await carpetaMatrixStore.marcarProcesado(claveArchivo(c))
        continue
      }
      parseados.push({ ...res, file })
      clavesParseadas.push(claveArchivo(c))
    } catch (e) {
      logger.warn('Carpeta Matrix: no se pudo leer un archivo', { ruta: c.ruta, err: mensajeError(e) })
      errorTexto = `No se pudo leer ${c.ruta}: ${mensajeError(e)}`
    }
  }

  if (parseados.length === 0) {
    return { ...base, ultimoResultado, errorReciente: errorTexto !== null, errorTexto }
  }

  try {
    const merged: ParsedMatrixData = mergeParsedData(parseados)
    const linea = getPlantLineConfig(DEFAULT_PLANT_LINE_ID)
    const moduleCfg = await getModuleRanges(DEFAULT_PLANT_LINE_ID).catch(() => null)
    const shiftSchedule = normalizeShiftSchedule(
      moduleCfg?.shiftSchedule,
      linea.defaultShiftSchedule ?? DEFAULT_SHIFT_SCHEDULE,
    )
    const fechas = new Set<string>()
    for (const r of [...merged.pieceRecords, ...merged.gate0Records]) if (r.ts) fechas.add(r.ts.slice(0, 10))
    const slxWindows = fechas.size > 0
      ? await loadShoplogixShiftWindows(Array.from(fechas), linea.plantSlug).catch(() => [])
      : []

    const multiDayInfo = derivarSegmentosTurno(merged, shiftSchedule, slxWindows)
    if (multiDayInfo) {
      await guardarSegmentosTurno({
        multiDayInfo,
        parsedData: merged,
        user: usuario,
        gates: getDefaultGates(),
        gatesEditadas: false,
        lineId: DEFAULT_PLANT_LINE_ID,
        isClassificationPlant: linea.isClassificationPlant,
      })
    }

    for (const k of clavesParseadas) await carpetaMatrixStore.marcarProcesado(k)

    const resumen = resumirAnalisis(parseados[0]!.fileMeta, merged)
    ultimoResultado = {
      tipo: 'cargado',
      archivo: parseados[0]!.fileMeta.name,
      piezas: resumen.piezas ?? 0,
      desde: resumen.desde,
      hasta: resumen.hasta,
      cargadoEn: ahora,
    }
    await carpetaMatrixStore.guardarUltimo(ultimoResultado)
    return {
      ...base,
      cargadosEnRevision: parseados.length,
      ultimoResultado,
      errorReciente: errorTexto !== null,
      errorTexto,
    }
  } catch (e) {
    logger.error('Carpeta Matrix: error guardando el turno', e instanceof Error ? e : new Error(mensajeError(e)))
    return {
      ...base,
      ultimoResultado,
      errorReciente: true,
      errorTexto: `No se pudo guardar el Excel: ${mensajeError(e)}`,
    }
  }
}
