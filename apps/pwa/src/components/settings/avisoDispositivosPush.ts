/**
 * Qué decirle a un admin sobre a cuántos aparatos llegarían las alertas push.
 *
 * POR QUÉ EXISTE
 * --------------
 * La colección `fcmTokens` está **vacía**: hoy no hay ni un dispositivo
 * registrado, así que ninguna alerta push llega a nadie. La Cloud Function lo
 * resuelve en silencio (`{ success: true, skipped: true, reason: 'no_tokens' }`)
 * y el switch de la pantalla de configuración prometía "notificación push a
 * todos los usuarios activos con la planta habilitada".
 *
 * Un admin que prende ese switch se queda tranquilo creyendo que avisó.
 */

export type TonoAviso = 'ok' | 'alerta' | 'cargando'

export interface AvisoDispositivos {
  tono: TonoAviso
  texto: string
}

export function avisoDispositivosPush(total: number | null): AvisoDispositivos {
  if (total === null) {
    return { tono: 'cargando', texto: 'Contando dispositivos registrados…' }
  }
  if (total === 0) {
    return {
      tono: 'alerta',
      texto: 'No hay ningún dispositivo registrado: estas alertas no le llegan a nadie. Cada persona debe activarlas en Ajustes → Notificaciones, desde el teléfono con el que las quiere recibir.',
    }
  }
  if (total === 1) {
    return { tono: 'ok', texto: 'Llega a 1 dispositivo registrado.' }
  }
  return { tono: 'ok', texto: `Llega a ${total} dispositivos registrados.` }
}
