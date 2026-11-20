/**
 * Acciones de la carga automática de la carpeta de Matrix (sin componentes):
 * soporte del navegador, elegir carpeta, renovar permiso y la revisión protegida
 * contra solapes (regla 11). La usan el vigilante (montado en el layout) y los
 * avisos de Análisis de turno.
 */
import { useAuthStore } from "@/store"
import { useCarpetaMatrixEstado } from "@/store/carpetaMatrixEstado"
import { carpetaMatrixStore, type HandleCarpeta } from "./carpetaMatrixStore"
import { revisarCarpeta } from "./carpetaMatrixCarga"
import { RevisionObsoleta, crearCandado, crearGuardia, derivarEstado } from "./carpetaMatrix"
import type { UsuarioGuarda } from "./guardarTurnoGrader"
import { logger } from "@/lib/logger"

type ConPicker = { showDirectoryPicker?: (opts: { mode: "read" }) => Promise<HandleCarpeta> }

export const MENSAJE_CAMBIO_OCUPADO = "Espera a que termine la revisión y vuelve a intentarlo"

const NOMBRE_LOCK = "carpeta-matrix-grader"

/** Regla 11: candado en memoria de la pestaña (además del Web Lock entre pestañas). */
const candadoPestana = crearCandado()

/** El navegador ofrece la API de carpetas (Chrome o Edge de escritorio). */
export function soportaCarpetaMatrix(): boolean {
  return typeof window !== "undefined" && typeof (window as unknown as ConPicker).showDirectoryPicker === "function"
}

function esAbort(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError"
}

function usuarioActual(): UsuarioGuarda | null {
  const u = useAuthStore.getState().user
  if (!u) return null
  return { id: u.id, nombre: u.nombre, apellido: u.apellido, email: u.email }
}

async function revisarCon(handle: HandleCarpeta): Promise<void> {
  const { actualizar } = useCarpetaMatrixEstado.getState()
  const usuario = usuarioActual()
  if (!usuario) return
  try {
    const permiso = await handle.queryPermission({ mode: "read" })
    if (permiso !== "granted") {
      actualizar({ estado: "permiso", nombreCarpeta: handle.name, revisadoEn: Date.now() })
      return
    }
    const guardia = crearGuardia(await carpetaMatrixStore.leerGeneracion(), carpetaMatrixStore.leerGeneracion)
    const r = await revisarCarpeta(handle, usuario, Date.now(), guardia)
    await guardia.exigir()
    const ahora = Date.now()
    actualizar({
      estado: derivarEstado({
        autorizada: true,
        permisoConcedido: true,
        ultimo: r.ultimo,
        cortado: r.cortado,
        demasiados: r.demasiados,
        alDia: r.alDia,
        errorReciente: r.errorReciente,
      }),
      nombreCarpeta: handle.name,
      revisadoEn: ahora,
      ultimo: r.ultimo,
      cortado: r.cortado,
      ultimoOtro: r.ultimoOtro,
      ultimoPiezaAPieza: r.ultimoPiezaAPieza,
      errorTexto: r.errorTexto,
    })
  } catch (e) {
    // La carpeta cambió a mitad de la revisión: el resultado ya no vale y no se escribe nada.
    if (e instanceof RevisionObsoleta) return
    logger.error("Carpeta Matrix: revisión fallida", e instanceof Error ? e : new Error(String(e)))
    actualizar({
      estado: "error",
      revisadoEn: Date.now(),
      errorTexto: `No se pudo leer la carpeta: ${e instanceof Error ? e.message : "error desconocido"}`,
    })
  }
}

/**
 * Corre `trabajo` con EL candado de las revisiones (pestaña + Web Lock entre
 * pestañas). Devuelve false, sin correrlo, si hay otra revisión o un cambio de carpeta en curso.
 */
async function conCandado(trabajo: () => Promise<void>): Promise<boolean> {
  if (!candadoPestana.tomar()) return false
  useCarpetaMatrixEstado.getState().actualizar({ revisando: true })
  try {
    if (typeof navigator !== "undefined" && navigator.locks) {
      let corrio = false
      await navigator.locks.request(NOMBRE_LOCK, { ifAvailable: true }, async (lock) => {
        if (!lock) return
        corrio = true
        await trabajo()
      })
      return corrio
    }
    await trabajo()
    return true
  } finally {
    candadoPestana.soltar()
    useCarpetaMatrixEstado.getState().actualizar({ revisando: false })
  }
}

/** Una revisión a la vez. Si hay otra, se salta. Revisa la carpeta guardada AHORA (ya con el candado), no una leída antes. */
export async function revisarSiToca(handle: HandleCarpeta): Promise<void> {
  await conCandado(async () => {
    const vigente = (await carpetaMatrixStore.leerHandle()) ?? handle
    await revisarCon(vigente)
  })
}

/**
 * Botón «Revisar ahora»: salta la espera de 5 min y revisa ya. Respeta el
 * candado: si ya hay una revisión en curso, no lanza otra (`revisarSiToca` sale).
 */
export async function revisarAhoraCarpetaMatrix(): Promise<void> {
  const { actualizar } = useCarpetaMatrixEstado.getState()
  try {
    const handle = await carpetaMatrixStore.leerHandle()
    if (!handle) {
      actualizar({ estado: "sin-autorizar" })
      return
    }
    await revisarSiToca(handle)
  } catch (e) {
    logger.error("Carpeta Matrix: no se pudo revisar ahora", e instanceof Error ? e : new Error(String(e)))
    actualizar({ estado: "error", errorTexto: "No se pudo leer la carpeta guardada." })
  }
}

/**
 * Acción «Elegir carpeta» y «Cambiar carpeta»: pide la carpeta (solo lectura), la
 * guarda en lugar de la anterior, olvida los avisos de la anterior y revisa de
 * inmediato. Si el usuario cancela el selector, o hay una revisión en curso,
 * no cambia nada (y en el segundo caso deja un mensaje visible).
 */
export async function elegirCarpetaMatrix(): Promise<void> {
  const pick = (window as unknown as ConPicker).showDirectoryPicker
  const { actualizar } = useCarpetaMatrixEstado.getState()
  if (!pick) return
  let handle: HandleCarpeta
  try {
    handle = await pick({ mode: "read" })
  } catch (e) {
    if (!esAbort(e)) actualizar({ estado: "error", errorTexto: "No se pudo abrir el selector de carpetas." })
    return
  }
  actualizar({ mensajeCambio: null })
  // El reemplazo y la primera revisión de la carpeta nueva van dentro del MISMO candado:
  // ninguna revisión de la carpeta anterior puede estar viva ni colarse entre medio.
  const corrio = await conCandado(async () => {
    try {
      await carpetaMatrixStore.reemplazarCarpeta(handle)
    } catch (e) {
      logger.error("Carpeta Matrix: no se pudo guardar la carpeta", e instanceof Error ? e : new Error(String(e)))
      actualizar({ estado: "error", errorTexto: "No se pudo recordar la carpeta en este navegador." })
      return
    }
    actualizar({ estado: "vigilando", nombreCarpeta: handle.name, ultimo: null, cortado: null, ultimoOtro: null, ultimoPiezaAPieza: null, errorTexto: null })
    await revisarCon(handle)
  })
  if (!corrio) actualizar({ mensajeCambio: MENSAJE_CAMBIO_OCUPADO })
}

/** Acción «Renovar permiso»: requiere gesto del usuario (clic). */
export async function renovarPermisoCarpetaMatrix(): Promise<void> {
  const { actualizar } = useCarpetaMatrixEstado.getState()
  try {
    const handle = await carpetaMatrixStore.leerHandle()
    if (!handle) {
      actualizar({ estado: "sin-autorizar" })
      return
    }
    const permiso = await handle.requestPermission({ mode: "read" })
    if (permiso === "granted") await revisarSiToca(handle)
  } catch (e) {
    logger.error("Carpeta Matrix: no se pudo renovar el permiso", e instanceof Error ? e : new Error(String(e)))
    actualizar({ estado: "error", errorTexto: "No se pudo renovar el permiso de la carpeta." })
  }
}

