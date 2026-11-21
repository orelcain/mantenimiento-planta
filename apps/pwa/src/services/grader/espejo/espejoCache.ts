/**
 * Caché de piezas del espejo por documento de hora (`{fecha}/{HH}`), lógica pura.
 *
 * Por qué: cada envío del lector agrega filas a UN documento de hora (`arrayUnion`
 * conserva el orden y solo agrega al final). Volver a parsear todas las horas en
 * cada snapshot costaba ~130-160 ms de hilo principal con 2 días cargados (E1.1).
 * Aquí se parsea solo lo nuevo: si las filas del documento empiezan igual que las
 * que ya se tenían, se parsea únicamente la cola; si no (documento reescrito), ese
 * documento se parsea entero. Nunca se tocan los demás documentos.
 *
 * Los documentos reparten las filas por fecha y hora de la pieza, así que una
 * misma cadena no puede estar en dos documentos: unir en orden de clave da piezas
 * ya ordenadas y sin duplicados.
 */
import { ordenarPorHora, parsearFila, type PiezaEspejo } from './espejoFilas'

interface Entrada {
  filas: readonly string[]
  piezas: PiezaEspejo[]
}

export class CacheHorasEspejo {
  /** Filas parseadas desde que se creó la caché (los tests miden con esto que no se reparse todo). */
  parseadas = 0
  private docs = new Map<string, Entrada>()
  private version = 0
  private unidas: { version: number; claves: string; piezas: PiezaEspejo[] } | null = null

  /** Pone las filas de un documento. Devuelve `true` si cambió algo. */
  actualizar(clave: string, filas: readonly string[]): boolean {
    const prev = this.docs.get(clave)
    if (prev && mismoPrefijo(prev.filas, filas)) {
      if (filas.length === prev.filas.length) return false
      const nuevas = this.parsear(filas.slice(prev.filas.length))
      // Un documento no tiene cadenas repetidas (arrayUnion), pero si llegara una se ignora.
      const vistas = new Set(prev.piezas.map((p) => p.cadena))
      const sumar = nuevas.filter((p) => !vistas.has(p.cadena))
      this.docs.set(clave, { filas, piezas: ordenarPorHora([...prev.piezas, ...sumar]) })
    } else {
      const unicas = Array.from(new Set(filas))
      this.docs.set(clave, { filas, piezas: ordenarPorHora(this.parsear(unicas)) })
    }
    this.version++
    return true
  }

  /** Quita un documento (borrado o fuera de la ventana). Devuelve `true` si estaba. */
  quitar(clave: string): boolean {
    const ok = this.docs.delete(clave)
    if (ok) this.version++
    return ok
  }

  /** Piezas de las claves pedidas, en orden de clave (= orden por hora). Memo por versión. */
  piezas(claves: readonly string[]): PiezaEspejo[] {
    const orden = [...claves].sort()
    const firma = orden.join('|')
    if (this.unidas && this.unidas.version === this.version && this.unidas.claves === firma) return this.unidas.piezas
    const out: PiezaEspejo[] = []
    for (const k of orden) {
      const e = this.docs.get(k)
      if (e) for (const p of e.piezas) out.push(p)
    }
    this.unidas = { version: this.version, claves: firma, piezas: out }
    return out
  }

  private parsear(cadenas: readonly string[]): PiezaEspejo[] {
    const out: PiezaEspejo[] = []
    for (const c of cadenas) {
      this.parseadas++
      const p = parsearFila(c)
      if (p) out.push(p)
    }
    return out
  }
}

function mismoPrefijo(viejas: readonly string[], nuevas: readonly string[]): boolean {
  if (nuevas.length < viejas.length) return false
  for (let i = 0; i < viejas.length; i++) if (viejas[i] !== nuevas[i]) return false
  return true
}

/** Margen alrededor del turno que se baja del espejo: hora extra antes y después. */
export const MARGEN_ANTES_MIN = 60
export const MARGEN_DESPUES_MIN = 120

/** `YYYY-MM-DDTHH:MM:SS.000Z` en convención wall-clock-as-UTC. */
function isoWall(ms: number): string {
  return new Date(ms).toISOString()
}

/**
 * Documentos de hora (`{fecha, hh}`) que cubren la ventana del turno con su margen.
 * Un turno de 13 h son ~16 documentos, no los 48 de dos días completos.
 */
export function horasDeVentana(
  ventana: { startMs: number; endMs: number } | null | undefined,
  antesMin: number = MARGEN_ANTES_MIN,
  despuesMin: number = MARGEN_DESPUES_MIN,
): { fecha: string; hh: string }[] {
  if (!ventana || !Number.isFinite(ventana.startMs) || !Number.isFinite(ventana.endMs)) return []
  const desde = Math.floor((ventana.startMs - antesMin * 60_000) / 3_600_000) * 3_600_000
  const hasta = ventana.endMs + despuesMin * 60_000
  const out: { fecha: string; hh: string }[] = []
  for (let t = desde; t < hasta && out.length < 48; t += 3_600_000) {
    const iso = isoWall(t)
    out.push({ fecha: iso.slice(0, 10), hh: iso.slice(11, 13) })
  }
  return out
}

/** Recorta piezas ordenadas a la ventana con su margen (mismo margen que `horasDeVentana`). */
export function recortarAVentana(
  piezas: readonly PiezaEspejo[],
  ventana: { startMs: number; endMs: number } | null | undefined,
  antesMin: number = MARGEN_ANTES_MIN,
  despuesMin: number = MARGEN_DESPUES_MIN,
): PiezaEspejo[] {
  if (!ventana) return [...piezas]
  const ini = isoWall(ventana.startMs - antesMin * 60_000)
  const fin = isoWall(ventana.endMs + despuesMin * 60_000)
  return piezas.filter((p) => p.ts >= ini && p.ts < fin)
}
