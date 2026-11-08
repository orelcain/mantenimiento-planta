/**
 * Propuesta de causas y acciones del ACR (SPEC_ACR_R1.md §5).
 *
 * Contrato intercambiable: la función `ProponerAcr` la va a reemplazar el motor de ARIA
 * (sesión #45). Hoy va por `callGroq` de `services/ai.ts`, que ya cae a Gemini y tiene sus guardas.
 * La salida del modelo NO se confía: `interpretarPropuesta` la valida y descarta lo que no sirve.
 * Si no queda una causa latente o una acción, lanza error y la UI cae a «armar a mano».
 */
import { callGroq } from '@/services/ai'
import type { AccionAcr, CausaAcr, Categoria6M, FuerzaAccion, NivelCausa } from './acr.types'
import { nuevoIdSubdoc } from './acrLogica'

export interface EntradaPropuesta {
  equipo: string
  queSeRompio: string
  porQue: string
  queHacemos: string
  /** Porqués extra de la cadena «¿Y por qué?» (sin vacíos). Lista vacía si no hay. */
  porQues: string[]
  descripcionEvento: string
  /** Texto del detector de repetición, o null. */
  repeticion: string | null
}

export interface PropuestaIA {
  causas: CausaAcr[]
  acciones: AccionAcr[]
  modelo: string
}

export type ProponerAcr = (entrada: EntradaPropuesta) => Promise<PropuestaIA>

/** Etiqueta del modelo que queda registrada en `propuesta.modelo`. */
export const MODELO_PROPUESTA = 'callGroq'

const NIVELES: readonly NivelCausa[] = ['fisica', 'humana', 'latente']
const FUERZAS: readonly FuerzaAccion[] = ['debil', 'media', 'fuerte']
const MAX_ITEMS = 3

export const PROMPT_ACR = `Eres apoyo de Mantención en una planta de procesamiento de salmón. Con lo que escribe el técnico, propón la cadena de causas y las acciones de un Análisis de Causa Raíz.

Niveles de causa:
- fisica: qué falló en la pieza.
- humana: qué hizo o no hizo la tarea. No culpes a personas.
- latente: qué del sistema permite que la falla se repita (plan, stock, diseño, procedimiento).

Fuerza de cada acción:
- debil: depende de la memoria (capacitar, avisar).
- media: checklist o alerta.
- fuerte: poka-yoke, rediseño o eliminar la tarea.

Reglas:
- El error humano no es causa raíz: la cadena tiene que llegar a una causa latente.
- No inventes datos técnicos (medidas, códigos, tolerancias, fechas) que no estén en la entrada.
- Máximo 3 causas y 3 acciones. Exactamente una causa de nivel latente.
- Cada acción ataca una causa: indícalo en "causa" con el número de esa causa, empezando en 1.
- Si viene "porQues", es la cadena de los 5 porqués que hizo el técnico después de "porQue": úsala; la última respuesta suele apuntar a la causa latente.

Responde SOLO con JSON, sin texto alrededor, con esta forma:
{"causas":[{"texto":"...","nivel":"fisica|humana|latente"}],"acciones":[{"texto":"...","fuerza":"debil|media|fuerte","causa":1}]}`

const esNivel = (v: unknown): v is NivelCausa => typeof v === 'string' && (NIVELES as readonly string[]).includes(v)
const esFuerza = (v: unknown): v is FuerzaAccion => typeof v === 'string' && (FUERZAS as readonly string[]).includes(v)
const textoLimpio = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Saca el objeto JSON aunque venga con cercas de markdown o texto alrededor. */
function extraerObjeto(crudo: string): unknown {
  const ini = crudo.indexOf('{')
  const fin = crudo.lastIndexOf('}')
  if (ini < 0 || fin <= ini) throw new Error('La IA no devolvió JSON')
  try {
    return JSON.parse(crudo.slice(ini, fin + 1))
  } catch {
    throw new Error('La IA devolvió JSON mal formado')
  }
}

/**
 * Valida la respuesta del modelo. Descarta cada causa o acción con nivel/fuerza inválidos o sin
 * texto; exige al menos una causa latente y una acción. Un JSON bueno pasa; uno malo lanza error.
 */
export function interpretarPropuesta(crudo: string, modelo: string): PropuestaIA {
  const data = extraerObjeto(crudo) as { causas?: unknown; acciones?: unknown }
  const causasCrudas = Array.isArray(data.causas) ? data.causas : []
  const accionesCrudas = Array.isArray(data.acciones) ? data.acciones : []

  // Índice de la causa en la respuesta (1-based) → id de la causa válida.
  const idPorIndice = new Map<number, string>()
  const causas: CausaAcr[] = []
  causasCrudas.forEach((c: unknown, i: number) => {
    const o = c as { texto?: unknown; nivel?: unknown }
    const texto = textoLimpio(o?.texto)
    if (!texto || !esNivel(o?.nivel)) return
    const id = nuevoIdSubdoc()
    idPorIndice.set(i + 1, id)
    causas.push({ id, texto, nivel: o.nivel, m6: null as Categoria6M | null })
  })

  const acciones: AccionAcr[] = []
  for (const a of accionesCrudas as Array<{ texto?: unknown; fuerza?: unknown; causa?: unknown }>) {
    const texto = textoLimpio(a?.texto)
    if (!texto || !esFuerza(a?.fuerza)) continue
    const causaId = typeof a.causa === 'number' ? idPorIndice.get(a.causa) ?? null : null
    acciones.push({
      id: nuevoIdSubdoc(),
      texto,
      fuerza: a.fuerza,
      causaId,
      responsable: '',
      fechaLimite: null,
      estado: 'pendiente',
    })
  }

  const causasFinales = causas.slice(0, MAX_ITEMS)
  // Una acción que apunta a una causa descartada por el límite queda sin causa, no con un id huérfano.
  const idsFinales = new Set(causasFinales.map((c) => c.id))
  const accionesFinales = acciones
    .slice(0, MAX_ITEMS)
    .map((a) => ({ ...a, causaId: a.causaId && idsFinales.has(a.causaId) ? a.causaId : null }))
  if (!causasFinales.some((c) => c.nivel === 'latente')) {
    throw new Error('La propuesta no trae una causa latente')
  }
  if (accionesFinales.length === 0) {
    throw new Error('La propuesta no trae acciones válidas')
  }
  return { causas: causasFinales, acciones: accionesFinales, modelo }
}

/** Llama al modelo (Groq con respaldo en Gemini, dentro de `callGroq`) y valida la respuesta. */
export const proponerAcr: ProponerAcr = async (entrada) => {
  const { content } = await callGroq(
    [
      { role: 'system', content: PROMPT_ACR },
      { role: 'user', content: JSON.stringify(entrada) },
    ],
    { temperature: 0.2, max_tokens: 900 },
  )
  return interpretarPropuesta(content, MODELO_PROPUESTA)
}
