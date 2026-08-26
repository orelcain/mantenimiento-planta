/**
 * Freno para el registro de errores en Firestore.
 *
 * POR QUÉ EXISTE
 * --------------
 * `errorLogs` es, por lejos, la colección más grande del proyecto: 147.824
 * documentos, y **143.623 de ellos son la misma línea** —"Error fetching
 * isometric maps · Missing or insufficient permissions"— escrita entre febrero
 * y marzo de 2026 desde `/map`. Un día solo dejó 1.101 copias: la pantalla
 * reintentaba, el logger escribía, y nadie lo miraba (ninguna pantalla de la
 * app lee esa colección).
 *
 * Un error que se repite 143.623 veces no aporta 143.623 veces más información
 * que la primera. Lo que importa es: pasó, y pasó mucho.
 *
 * QUÉ HACE
 * --------
 * Deja pasar la primera aparición de cada error, calla las repeticiones dentro
 * de una ventana de tiempo y, cuando la ventana vence, vuelve a escribir UNA
 * línea que además dice cuántas se omitieron. Un tope por sesión evita que una
 * pestaña abierta toda la noche escriba miles igual.
 */

export interface DecisionDeRegistro {
  /** ¿Se escribe este error en Firestore? */
  escribir: boolean
  /** Repeticiones que se callaron desde la última escritura de esta clave. */
  repeticionesOmitidas: number
  /** true la única vez que se avisa que la sesión llegó al tope. */
  topeAlcanzado?: boolean
}

interface EstadoClave {
  ultimaEscrituraMs: number
  omitidas: number
}

export const VENTANA_POR_DEFECTO_MS = 5 * 60_000
export const TOPE_POR_DEFECTO = 50

export class FrenoDeErroresRepetidos {
  private porClave = new Map<string, EstadoClave>()
  private escrituras = 0
  private avisoTopeEmitido = false

  constructor(
    private ventanaMs: number = VENTANA_POR_DEFECTO_MS,
    private topePorSesion: number = TOPE_POR_DEFECTO,
  ) {}

  /** Cuántos errores se escribieron en esta sesión. */
  get escritas(): number {
    return this.escrituras
  }

  decidir(clave: string, ahoraMs: number): DecisionDeRegistro {
    const estado = this.porClave.get(clave)

    if (estado && ahoraMs - estado.ultimaEscrituraMs < this.ventanaMs) {
      estado.omitidas += 1
      return { escribir: false, repeticionesOmitidas: estado.omitidas }
    }

    if (this.escrituras >= this.topePorSesion) {
      // Se avisa una sola vez y después se calla del todo.
      if (!this.avisoTopeEmitido) {
        this.avisoTopeEmitido = true
        this.escrituras += 1
        return { escribir: true, repeticionesOmitidas: estado?.omitidas ?? 0, topeAlcanzado: true }
      }
      if (estado) estado.omitidas += 1
      return { escribir: false, repeticionesOmitidas: estado?.omitidas ?? 0 }
    }

    const omitidas = estado?.omitidas ?? 0
    this.porClave.set(clave, { ultimaEscrituraMs: ahoraMs, omitidas: 0 })
    this.escrituras += 1
    return { escribir: true, repeticionesOmitidas: omitidas }
  }
}

/**
 * Clave de agrupación: el mensaje más la primera línea del stack. Dos fallas
 * distintas que comparten mensaje (por ejemplo "Error fetching X" desde dos
 * lugares) no se pisan entre sí.
 */
export function claveDeError(mensaje: string, stack?: string): string {
  const primeraLinea = (stack ?? '').split('\n')[0]?.trim() ?? ''
  return primeraLinea ? `${mensaje}::${primeraLinea}` : mensaje
}
