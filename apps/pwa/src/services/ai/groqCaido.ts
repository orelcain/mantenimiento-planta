/**
 * ¿El error dice que Groq no va a contestar, se reintente lo que se reintente?
 *
 * POR QUÉ EXISTE
 * --------------
 * `errorLogs` guardaba 7 fallas del 22-08 al abrir una incidencia prellenada
 * desde el protocolo de la Baader 142: **"Error extrayendo síntomas con IA:
 * FirebaseError: Groq 404 (upstream)"**. Probado hoy desde la app, sigue igual:
 * `callGroq` devuelve 404 — el modelo que pide (`llama-3.3-70b-versatile`) ya
 * no lo sirve Groq.
 *
 * Y como `extractSymptomsFromDescription` atrapa el error y devuelve `[]`, en
 * pantalla no se ve una falla: se ve una lista de síntomas vacía, como si la
 * descripción no tuviera ninguno.
 *
 * Un 404 o un 400 de modelo no se arreglan reintentando: hay que ir a otro
 * proveedor. Un 429 (cuota) o un 503 sí pueden ser pasajeros, pero mientras
 * duren tampoco sirve insistir en el mismo instante — la respuesta de Gemini
 * llega igual y es mejor que devolver vacío.
 */

/** Códigos upstream ante los que no vale la pena insistir con Groq. */
const CODIGOS_SIN_VUELTA = [400, 401, 403, 404, 413, 429, 500, 502, 503]

export function groqNoVaAContestar(error: unknown): boolean {
  const mensaje = error instanceof Error ? error.message : String(error ?? '')
  if (!mensaje) return false

  // El proxy mapea el status upstream a "Groq <status> (upstream)".
  const upstream = /Groq\s+(\d{3})\s*\(upstream\)/i.exec(mensaje)
  if (upstream) return CODIGOS_SIN_VUELTA.includes(Number(upstream[1]))

  // El proxy también puede caer por su cuenta.
  if (/Groq: error interno del proxy/i.test(mensaje)) return true
  if (/groqProxy no configurada/i.test(mensaje)) return true

  return false
}

/**
 * Presupuesto de salida mínimo cuando responde Gemini en lugar de Groq.
 *
 * Los `max_tokens` del código están calibrados para Groq, que contesta directo.
 * Gemini 3.5 Flash **piensa antes de responder y ese pensamiento gasta del
 * mismo presupuesto**: con `max_tokens: 300` —el que usa la extracción de
 * síntomas— se queda sin espacio y devuelve texto vacío, que aguas arriba se
 * transforma en una lista de síntomas vacía. Medido: con 20 tokens contesta
 * "" (22 consumidos); con 512 contesta "ok".
 */
export const PISO_TOKENS_GEMINI = 1024

export function conTechoParaGemini<T extends { max_tokens?: number }>(opts?: T): T {
  const base = (opts ?? {}) as T
  return { ...base, max_tokens: Math.max(base.max_tokens ?? 0, PISO_TOKENS_GEMINI) }
}
