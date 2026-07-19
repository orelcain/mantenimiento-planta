/**
 * Utilidades para throttling, debouncing y rate limiting
 */

/**
 * Debounce: Retrasa la ejecución de una función hasta que pasen `delay` ms sin llamadas
 * Útil para: búsquedas, validaciones, resize events
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null

  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      func.apply(this, args)
      timeoutId = null
    }, delay)
  }
}

/**
 * Throttle: Limita la ejecución de una función a una vez cada `limit` ms
 * Útil para: scroll events, mouse move, resize
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false

  return function (this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

/**
 * Rate Limiter: Controla cuántas veces se puede ejecutar una acción en un período
 */
export class RateLimiter {
  private timestamps: number[] = []
  private maxCalls: number
  private windowMs: number

  constructor(maxCalls: number, windowMs: number) {
    this.maxCalls = maxCalls
    this.windowMs = windowMs
  }

  /**
   * Verifica si se puede ejecutar la acción
   */
  canExecute(): boolean {
    const now = Date.now()
    const windowStart = now - this.windowMs

    // Limpiar timestamps antiguos
    this.timestamps = this.timestamps.filter(ts => ts > windowStart)

    // Verificar si podemos agregar otra llamada
    if (this.timestamps.length < this.maxCalls) {
      this.timestamps.push(now)
      return true
    }

    return false
  }

  /**
   * Tiempo restante hasta que se pueda ejecutar de nuevo (en ms)
   */
  timeUntilNext(): number {
    if (this.timestamps.length < this.maxCalls) {
      return 0
    }

    const oldestTimestamp = this.timestamps[0] || Date.now()
    const timeUntilExpiry = (oldestTimestamp + this.windowMs) - Date.now()
    return Math.max(0, timeUntilExpiry)
  }

  /**
   * Resetea el rate limiter
   */
  reset(): void {
    this.timestamps = []
  }
}

/**
 * Hook para React que retorna una función con rate limiting
 */
export function useRateLimiter(
  maxCalls: number,
  windowMs: number
): { execute: () => boolean; timeUntilNext: () => number } {
  const limiter = new RateLimiter(maxCalls, windowMs)

  return {
    execute: () => limiter.canExecute(),
    timeUntilNext: () => limiter.timeUntilNext(),
  }
}

/**
 * Cooldown simple: No permite ejecutar hasta que pasen X ms desde última ejecución
 */
export class Cooldown {
  private lastExecution: number = 0
  private cooldownMs: number

  constructor(cooldownMs: number) {
    this.cooldownMs = cooldownMs
  }

  canExecute(): boolean {
    const now = Date.now()
    if (now - this.lastExecution >= this.cooldownMs) {
      this.lastExecution = now
      return true
    }
    return false
  }

  timeRemaining(): number {
    const elapsed = Date.now() - this.lastExecution
    return Math.max(0, this.cooldownMs - elapsed)
  }

  reset(): void {
    this.lastExecution = 0
  }
}

/**
 * Queue de acciones con límite de procesamiento simultáneo
 */
export class ActionQueue<T = any> {
  private queue: Array<() => Promise<T>> = []
  private processing = 0
  private maxConcurrent: number

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent
  }

  async add(action: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedAction = async () => {
        try {
          const result = await action()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      }

      this.queue.push(wrappedAction as () => Promise<T>)
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return
    }

    this.processing++
    const action = this.queue.shift()

    if (action) {
      try {
        await action()
      } finally {
        this.processing--
        this.processQueue()
      }
    }
  }

  get pending(): number {
    return this.queue.length
  }

  get active(): number {
    return this.processing
  }
}

/**
 * Limitador de INTENTOS FALLIDOS persistente en localStorage.
 *
 * A diferencia de RateLimiter (en memoria, se resetea con recargar la página):
 *  - Solo cuenta FALLOS explícitos (recordFailure) — un login exitoso o un
 *    error de validación local no consumen intentos.
 *  - Persiste entre recargas/pestañas: recargar la página NO burla el lockout.
 *  - isBlocked() no tiene efectos secundarios (se puede consultar libremente).
 *
 * Sigue siendo defensa del lado del cliente (la protección server-side real la
 * da el throttling propio de Firebase Auth); esto elimina el bypass trivial.
 */
export class PersistentFailureLimiter {
  private storageKey: string
  private maxFailures: number
  private windowMs: number

  constructor(storageKey: string, maxFailures: number, windowMs: number) {
    this.storageKey = storageKey
    this.maxFailures = maxFailures
    this.windowMs = windowMs
  }

  private load(): number[] {
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      const windowStart = Date.now() - this.windowMs
      return parsed.filter((ts): ts is number => typeof ts === 'number' && ts > windowStart)
    } catch {
      return [] // localStorage inaccesible (modo privado) → degrada a sin lockout
    }
  }

  private save(timestamps: number[]): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(timestamps))
    } catch {
      // sin persistencia disponible: el lockout queda solo en memoria de esta carga
    }
  }

  isBlocked(): boolean {
    return this.load().length >= this.maxFailures
  }

  recordFailure(): void {
    const timestamps = this.load()
    timestamps.push(Date.now())
    this.save(timestamps)
  }

  /** Tiempo restante de bloqueo en ms (0 si no está bloqueado). */
  timeUntilNext(): number {
    const timestamps = this.load()
    if (timestamps.length < this.maxFailures) return 0
    const oldest = timestamps[0] ?? Date.now()
    return Math.max(0, oldest + this.windowMs - Date.now())
  }

  /** Limpia el historial (llamar tras un login exitoso). */
  reset(): void {
    try {
      localStorage.removeItem(this.storageKey)
    } catch {
      // nada que limpiar si no hay storage
    }
  }
}
