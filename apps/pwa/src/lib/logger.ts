/**
 * Servicio centralizado de logging y manejo de errores
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: Date
  context?: Record<string, unknown>
  error?: Error
}

class Logger {
  private isDevelopment = import.meta.env.DEV
  private logs: LogEntry[] = []
  private maxLogs = 100

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
      error,
    }

    // Almacenar en memoria (últimos 100)
    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // En desarrollo, mostrar en consola con formato
    if (this.isDevelopment) {
      const prefix = `[${entry.timestamp.toLocaleTimeString()}] ${level.toUpperCase()}`
      
      switch (level) {
        case 'error':
          console.error(prefix, message, context, error)
          break
        case 'warn':
          console.warn(prefix, message, context)
          break
        case 'info':
          console.info(prefix, message, context)
          break
        case 'debug':
          console.debug(prefix, message, context)
          break
      }
    }

    // En producción, podrías enviar a un servicio como Sentry
    if (!this.isDevelopment && level === 'error') {
      // TODO: Integrar con servicio de tracking de errores
      // Sentry.captureException(error || new Error(message), { extra: context })
    }
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context)
  }

  error(message: string, error?: Error, context?: Record<string, unknown>) {
    this.log('error', message, context, error)
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log('debug', message, context)
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clearLogs() {
    this.logs = []
  }
}

// Exportar instancia singleton
export const logger = new Logger()

/**
 * Manejador de errores para mostrar notificaciones al usuario
 */
export function handleError(error: unknown, userMessage?: string): string {
  const message = userMessage || 'Ha ocurrido un error inesperado'
  
  if (error instanceof Error) {
    logger.error(message, error, {
      name: error.name,
      stack: error.stack,
    })
    return `${message}: ${error.message}`
  }

  if (typeof error === 'string') {
    logger.error(message, new Error(error))
    return `${message}: ${error}`
  }

  logger.error(message, new Error('Unknown error'), { error })
  return message
}

/**
 * Wrapper para funciones async con manejo de errores
 */
export function withErrorHandling<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  errorMessage?: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (error) {
      throw new Error(handleError(error, errorMessage))
    }
  }) as T
}
