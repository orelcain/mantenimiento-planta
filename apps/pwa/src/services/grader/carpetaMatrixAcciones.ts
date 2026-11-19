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
import { crearCandado, derivarEstado } from "./carpetaMatrix"
import type { UsuarioGuarda } from "./guardarTurnoGrader"
import { logger } from "@/lib/logger"

type ConPicker = { showDirectoryPicker?: (opts: { mode: "read" }) => Promise<HandleCarpeta> }

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
    const r = await revisarCarpeta(handle, usuario)
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
      ultimoPiezaAPieza: r.ultimoPiezaAPieza,
      errorTexto: r.errorTexto,
    })
  } catch (e) {
    logger.error("Carpeta Matrix: revisión fallida", e instanceof Error ? e : new Error(String(e)))
    actualizar({
      estado: "error",
      revisadoEn: Date.now(),
      errorTexto: `No se pudo leer la carpeta: ${e instanceof Error ? e.message : "error desconocido"}`,
    })
  }
}

/** Una revisión a la vez: candado de la pestaña y Web Lock entre pestañas. Si hay otra, se salta. */
export async function revisarSiToca(handle: HandleCarpeta): Promise<void> {
  if (!candadoPestana.tomar()) return
  try {
    if (typeof navigator !== "undefined" && navigator.locks) {
      await navigator.locks.request(NOMBRE_LOCK, { ifAvailable: true }, async (lock) => {
        if (lock) await revisarCon(handle)
      })
    } else {
      await revisarCon(handle)
    }
  } finally {
    candadoPestana.soltar()
  }
}

/** Acción «Elegir carpeta»: pide la carpeta (solo lectura), la guarda y revisa. */
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
  try {
    await carpetaMatrixStore.guardarHandle(handle)
  } catch (e) {
    logger.error("Carpeta Matrix: no se pudo guardar la carpeta", e instanceof Error ? e : new Error(String(e)))
    actualizar({ estado: "error", errorTexto: "No se pudo recordar la carpeta en este navegador." })
    return
  }
  actualizar({ estado: "vigilando", nombreCarpeta: handle.name, ultimo: null, cortado: null, ultimoPiezaAPieza: null, errorTexto: null })
  await revisarSiToca(handle)
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

