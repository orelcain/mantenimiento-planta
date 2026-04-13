#!/usr/bin/env node
/**
 * Claude Multi-Model Orchestrator
 * ─────────────────────────────────────────────────────────────────────
 * Clasifica una tarea → elige haiku / sonnet / opus → llama a la API
 * de Anthropic → trackea tokens y costo estimado por modelo en la sesión.
 *
 * Subcomandos:
 *   classify  "mensaje"              → JSON con modelo sugerido y razón
 *   status                           → Resumen de tokens de la sesión
 *   reset                            → Reinicia el contador de la sesión
 *   "mensaje"                        → Orquesta la llamada al modelo correcto
 *   "mensaje" --model haiku|sonnet|opus → Fuerza un modelo específico
 *   pipeline  phases.json            → Ejecuta fases en paralelo con sub-agentes
 *
 * Pipeline (fases paralelas):
 *   Recibe un JSON con un array de fases, cada una con su prompt y modelo opcional.
 *   Ejecuta todas las fases en PARALELO con Promise.all, cada una con su modelo óptimo.
 *   Ejemplo de phases.json:
 *   [
 *     { "id": "analisis",  "prompt": "analiza el componente X", "model": "sonnet" },
 *     { "id": "tests",     "prompt": "genera tests para X",     "model": "sonnet" },
 *     { "id": "resumen",   "prompt": "resume el módulo Y en 3 líneas" }
 *   ]
 *   El modelo se puede omitir → se clasifica automáticamente.
 *
 * Requiere: ANTHROPIC_API_KEY en el entorno
 * Requiere: Node.js 18+ (usa fetch nativo)
 */

'use strict'

const fs   = require('fs')
const path = require('path')

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DE MODELOS
// ═══════════════════════════════════════════════════════════════════════

const MODELS = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-6',
}

const MODEL_EMOJI = { haiku: '🐦', sonnet: '🎵', opus: '🎭' }

// Costo en USD por millón de tokens (MTok) — precios Anthropic 2025
const COST_PER_MTOK = {
  haiku:  { input: 0.80,  output: 4.00  },
  sonnet: { input: 3.00,  output: 15.00 },
  opus:   { input: 15.00, output: 75.00 },
}

// Max tokens de respuesta por modelo
const MAX_OUTPUT = { haiku: 1024, sonnet: 2048, opus: 4096 }

// ═══════════════════════════════════════════════════════════════════════
// CLASIFICADOR DE TAREAS
// ═══════════════════════════════════════════════════════════════════════

const HAIKU_PATTERNS = [
  /^(hola|hi|hey|buenas|gracias|ok|sí|si|no|dale|listo|perfecto|genial)\b/i,
  /\b(qué es|qué significa|cuándo es|cuánto cuesta|qué versión|define|traduc[ei]|lista de|muestra|ejemplos? de|cómo se llama)\b/i,
  /\b(fecha|hora|versión|número|nombre|sinónimo)\b/i,
]

const OPUS_PATTERNS = [
  /\b(arquitectura|diseña el sistema|plan completo|planifica todo|revisa todo el proyecto|analiza profundo|refactor completo|migra[ci]|auditor[ií]a de seguridad|estrategia global|implementa desde cero|todo el módulo)\b/i,
]

const CODE_PATTERNS = [
  /\b(bug|error|fix|código|función|componente|hook|servicio|refactor|agrega|implementa|crea|edita|modifica|typescript|react|firebase|test|ci|build)\b/i,
]

/**
 * Clasifica la complejidad de una tarea y devuelve el modelo óptimo.
 * @param {string} message
 * @returns {{ model: 'haiku'|'sonnet'|'opus', reason: string }}
 */
function classifyTask(message) {
  const msg = message.trim()
  const len = msg.length

  // Opus: mensajes largos con keywords de alta complejidad
  if (len > 350 && OPUS_PATTERNS.some(p => p.test(msg))) {
    return { model: 'opus', reason: 'tarea compleja de arquitectura / análisis profundo' }
  }

  // Haiku: mensajes cortos o con keywords de consulta simple
  if (len < 100 || HAIKU_PATTERNS.some(p => p.test(msg))) {
    return { model: 'haiku', reason: 'consulta simple o mensaje corto' }
  }

  // Sonnet: código, análisis medio, la mayoría de las tareas
  if (CODE_PATTERNS.some(p => p.test(msg))) {
    return { model: 'sonnet', reason: 'tarea de código / análisis técnico' }
  }

  // Default sonnet para todo lo demás
  return { model: 'sonnet', reason: 'tarea de complejidad media' }
}

// ═══════════════════════════════════════════════════════════════════════
// TRACKING DE TOKENS
// ═══════════════════════════════════════════════════════════════════════

const SESSION_FILE = path.join(__dirname, '../session-tokens.json')

function emptySession() {
  return {
    startTime: new Date().toISOString(),
    calls: [],
    totals: {
      haiku:  { input: 0, output: 0, calls: 0 },
      sonnet: { input: 0, output: 0, calls: 0 },
      opus:   { input: 0, output: 0, calls: 0 },
    },
  }
}

function loadSession() {
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) }
  catch { return emptySession() }
}

function saveSession(data) {
  try { fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2)) }
  catch { /* no-op si no hay permisos */ }
}

function calcCostUsd(model, inputTok, outputTok) {
  const c = COST_PER_MTOK[model]
  return (inputTok * c.input + outputTok * c.output) / 1_000_000
}

function trackTokens(model, inputTok, outputTok) {
  const s = loadSession()
  s.totals[model].input  += inputTok
  s.totals[model].output += outputTok
  s.totals[model].calls  += 1
  s.calls.push({ model, input: inputTok, output: outputTok, ts: new Date().toISOString() })
  saveSession(s)
}

// ═══════════════════════════════════════════════════════════════════════
// LLAMADA A LA API DE ANTHROPIC (fetch nativo — Node 18+)
// ═══════════════════════════════════════════════════════════════════════

async function callClaude(model, message, systemPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no está configurada en el entorno')

  const body = {
    model: MODELS[model],
    max_tokens: MAX_OUTPUT[model],
    messages: [{ role: 'user', content: message }],
  }
  if (systemPrompt) body.system = systemPrompt

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API ${res.status}: ${err}`)
  }

  return res.json()
}

// ═══════════════════════════════════════════════════════════════════════
// SUBCOMANDOS
// ═══════════════════════════════════════════════════════════════════════

function cmdStatus() {
  const s = loadSession()
  const lines = ['', '📊  USO DE TOKENS — SESIÓN ACTUAL', '─'.repeat(50)]
  let totalCost = 0

  for (const [model, t] of Object.entries(s.totals)) {
    if (t.calls === 0) continue
    const cost = calcCostUsd(model, t.input, t.output)
    totalCost += cost
    const emoji = MODEL_EMOJI[model]
    lines.push(
      `  ${emoji}  ${model.padEnd(7)} │ ${String(t.calls).padStart(3)} llamadas │ ` +
      `in: ${t.input.toLocaleString().padStart(7)} tok │ out: ${t.output.toLocaleString().padStart(7)} tok │ ~$${cost.toFixed(5)}`
    )
  }

  if (totalCost === 0) {
    lines.push('  (sin llamadas registradas en esta sesión)')
  } else {
    lines.push('─'.repeat(50))
    lines.push(`  💰  Costo total estimado: ~$${totalCost.toFixed(5)} USD`)
    lines.push(`  ⏱   Sesión iniciada: ${s.startTime}`)
  }
  lines.push('')
  console.log(lines.join('\n'))
}

function cmdReset() {
  saveSession(emptySession())
  console.log('✅  Contador de tokens reseteado.')
}

function cmdClassify(args) {
  const msg = args.join(' ')
  if (!msg) { console.error('Uso: classify "mensaje"'); process.exit(1) }
  const result = classifyTask(msg)
  console.log(JSON.stringify(result))
}

/**
 * Pipeline de fases en paralelo.
 * Acepta un JSON de fases como argumento o desde stdin (pipe).
 * Ejecuta todas las fases en paralelo, cada una con su modelo óptimo.
 *
 * @param {string[]} args  Si args[0] es un path .json o un string JSON, lo usa.
 *                         Si args está vacío, lee de stdin.
 */
async function cmdPipeline(args) {
  let phases

  // Leer fases: desde argumento o desde stdin
  if (args.length > 0) {
    const raw = args[0]
    if (raw.startsWith('[') || raw.startsWith('{')) {
      // JSON inline
      phases = JSON.parse(raw)
    } else {
      // Ruta a archivo
      phases = JSON.parse(fs.readFileSync(raw, 'utf8'))
    }
  } else {
    // Leer desde stdin (para uso en pipes)
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    phases = JSON.parse(Buffer.concat(chunks).toString())
  }

  if (!Array.isArray(phases) || phases.length === 0) {
    throw new Error('Pipeline: se esperaba un array de fases [{ id, prompt, model? }]')
  }

  const startMs = Date.now()
  console.error(`🚀 Pipeline iniciado — ${phases.length} fase(s) en paralelo...`)

  // Ejecutar todas las fases en paralelo
  const results = await Promise.allSettled(
    phases.map(async (phase) => {
      const phaseStart = Date.now()
      const { model: autoModel } = classifyTask(phase.prompt || '')
      const model = (phase.model && MODELS[phase.model]) ? phase.model : autoModel

      console.error(`  ${MODEL_EMOJI[model]}  [${phase.id || '?'}] → ${model} (${phase.prompt?.slice(0, 60) || ''}...)`)

      const response = await callClaude(model, phase.prompt, phase.systemPrompt)
      const content = response.content?.[0]?.text || ''
      const { input_tokens, output_tokens } = response.usage
      const costUsd = calcCostUsd(model, input_tokens, output_tokens)

      trackTokens(model, input_tokens, output_tokens)

      return {
        id:      phase.id || String(phases.indexOf(phase)),
        model,
        modelId: MODELS[model],
        content,
        tokens:  { input: input_tokens, output: output_tokens, costUsd: parseFloat(costUsd.toFixed(7)) },
        latencyMs: Date.now() - phaseStart,
      }
    })
  )

  const totalMs = Date.now() - startMs

  // Separar éxitos y errores
  const succeeded = []
  const failed    = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      succeeded.push(r.value)
    } else {
      failed.push({ id: phases[i]?.id || String(i), error: r.reason?.message || String(r.reason) })
    }
  })

  // Resumen de tokens del pipeline
  const totalTokens = succeeded.reduce((s, r) => ({
    input:  s.input  + r.tokens.input,
    output: s.output + r.tokens.output,
    cost:   s.cost   + r.tokens.costUsd,
  }), { input: 0, output: 0, cost: 0 })

  const output = {
    summary: {
      totalPhases:   phases.length,
      succeeded:     succeeded.length,
      failed:        failed.length,
      totalMs,
      totalTokens:   { input: totalTokens.input, output: totalTokens.output },
      totalCostUsd:  parseFloat(totalTokens.cost.toFixed(7)),
    },
    phases: succeeded,
    errors: failed.length > 0 ? failed : undefined,
  }

  console.log(JSON.stringify(output, null, 2))
  console.error(`\n✅ Pipeline completado en ${(totalMs / 1000).toFixed(1)}s — ${succeeded.length}/${phases.length} fases OK`)
}

async function cmdOrchestrate(rawArgs) {
  // Detectar --model flag
  let forcedModel = null
  const modelIdx = rawArgs.indexOf('--model')
  if (modelIdx >= 0 && rawArgs[modelIdx + 1]) {
    forcedModel = rawArgs[modelIdx + 1]
    rawArgs.splice(modelIdx, 2)
  }

  const message = rawArgs.join(' ')
  if (!message) {
    console.error('Uso: node claude-orchestrator.js "tu pregunta" [--model haiku|sonnet|opus]')
    process.exit(1)
  }

  const { model: autoModel } = classifyTask(message)
  const model = (forcedModel && MODELS[forcedModel]) ? forcedModel : autoModel

  const response = await callClaude(model, message)
  const content = response.content?.[0]?.text || ''
  const { input_tokens, output_tokens } = response.usage
  const costUsd = calcCostUsd(model, input_tokens, output_tokens)

  trackTokens(model, input_tokens, output_tokens)

  console.log(JSON.stringify({
    model,
    modelId:  MODELS[model],
    content,
    tokens: {
      input:   input_tokens,
      output:  output_tokens,
      costUsd: parseFloat(costUsd.toFixed(7)),
    },
  }, null, 2))
}

// ═══════════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2)
  const cmd  = args[0]

  if (cmd === 'status')   return cmdStatus()
  if (cmd === 'reset')    return cmdReset()
  if (cmd === 'classify') return cmdClassify(args.slice(1))
  if (cmd === 'pipeline') return cmdPipeline(args.slice(1))

  // Sin subcomando → orquestar
  await cmdOrchestrate(args)
}

main().catch(err => {
  console.error(JSON.stringify({ error: err.message }))
  process.exit(1)
})
