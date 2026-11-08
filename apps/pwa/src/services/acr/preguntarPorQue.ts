/**
 * ARIA pregunta: la siguiente pregunta «¿por qué?» de la cadena de porqués del ACR (forma B de los
 * 5 porqués, spec «ARIA pregunta»).
 *
 * Mismo patrón que `proponerAcr.ts`: va por `callGroq` de `services/ai.ts` (sin Cloud Functions
 * nuevas). La salida del modelo NO se confía: `interpretarPregunta` la valida y lanza error si no
 * sirve; la tarjeta (`CadenaPorQues`) cae entonces a «Escribe tú».
 */
import { callGroq } from '@/services/ai'

export interface EntradaPregunta {
  equipo: string
  queSeRompio: string
  /** Porqués del técnico, en orden, sin vacíos. El último es el que ARIA toma como punto de partida. */
  cadena: string[]
}

export type PreguntarPorQue = (e: EntradaPregunta) => Promise<string>

export const PROMPT_PORQUE = `Eres apoyo de Mantención en una planta de procesamiento de salmón. Recibes la cadena de porqués que escribió el técnico para una falla. Devuelve UNA pregunta corta que parta de la última respuesta y busque la causa de sistema (plan, stock, diseño o procedimiento).

Reglas:
- Una sola pregunta, en español neutro, que empiece con «¿» y termine con «?».
- Sin culpar personas: pregunta por el sistema, no por quién se equivocó.
- No inventes datos técnicos (medidas, códigos, tolerancias, fechas) que no estén en la entrada.
- Responde solo la pregunta: sin comillas y sin texto antes ni después.`

const MIN_LARGO = 8
const MAX_LARGO = 140
/** Comillas y espacios de los extremos que el modelo suele agregar. */
const ENVOLTURA = /^[\s"'`«»“”‘’]+|[\s"'`«»“”‘’]+$/g

/**
 * Toma la primera línea no vacía, le quita comillas y espacios de los extremos y la valida: debe
 * empezar con «¿», terminar en «?» y medir entre 8 y 140 caracteres. Si no, lanza error.
 */
export function interpretarPregunta(contenido: string): string {
  const primera = contenido.split('\n').find((linea) => linea.trim() !== '') ?? ''
  const pregunta = primera.replace(ENVOLTURA, '')
  if (!pregunta.startsWith('¿')) throw new Error('La respuesta de la IA no es una pregunta')
  if (!pregunta.endsWith('?')) throw new Error('La pregunta de la IA no termina en «?»')
  if (pregunta.length < MIN_LARGO || pregunta.length > MAX_LARGO) {
    throw new Error(`La pregunta de la IA mide ${pregunta.length} caracteres (se acepta ${MIN_LARGO}..${MAX_LARGO})`)
  }
  return pregunta
}

/** Llama al modelo (Groq con respaldo en Gemini, dentro de `callGroq`) y valida la pregunta. */
export const preguntarPorQue: PreguntarPorQue = async (e) => {
  const { content } = await callGroq(
    [
      { role: 'system', content: PROMPT_PORQUE },
      { role: 'user', content: JSON.stringify(e) },
    ],
    { temperature: 0.3, max_tokens: 80 },
  )
  return interpretarPregunta(content)
}
