#!/usr/bin/env node
/**
 * PostToolUse (Edit|Write) — red de seguridad del sync de Shoplogix.
 *
 * Por qué existe: el 28 y 29-09-2026 dos sesiones distintas tocaron
 * `functions/shoplogix/sync.js` el mismo día y dos errores llegaron a
 * producción (doble conteo en los bordes de turno; turno que arranca antes de
 * las 08:00 congelado hasta las 08:00). Este hook corre la suite de functions
 * cada vez que un agente edita el sync, el monitor público o el vigía, y le
 * devuelve la falla en el momento — antes del commit, no en la planta.
 *
 * - Solo actúa sobre: functions/shoplogix/**, functions/publicMonitor.js y
 *   los tests functions/__tests__/*.test.js. Cualquier otro archivo: sale en
 *   silencio.
 * - Corre en el ÁRBOL donde se editó (sirve en worktrees). Si ese árbol no
 *   tiene functions/node_modules, usa el del proyecto principal.
 * - Tests en verde: le recuerda al agente los casos límite ya pagados.
 *   Tests en rojo: exit 2 con las fallas (Claude Code se las muestra al
 *   agente, que debe arreglarlas antes de seguir).
 *
 * La suite completa tarda ~2 s (506 tests al 30-09-2026).
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function leerEntrada() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
  } catch {
    return {}
  }
}

const entrada = leerEntrada()
const archivo = String(
  entrada?.tool_input?.file_path || entrada?.tool_response?.filePath || '',
).replace(/\\/g, '/')

const RELEVANTE = /\/functions\/(shoplogix\/.+\.js|publicMonitor\.js|__tests__\/.+\.test\.js)$/
if (!RELEVANTE.test(archivo)) process.exit(0)

const raiz = archivo.slice(0, archivo.lastIndexOf('/functions/'))
const functionsDir = path.join(raiz, 'functions')
if (!fs.existsSync(functionsDir)) process.exit(0)

const env = { ...process.env }
if (!fs.existsSync(path.join(functionsDir, 'node_modules'))) {
  const principal = process.env.CLAUDE_PROJECT_DIR
    ? path.join(process.env.CLAUDE_PROJECT_DIR, 'functions', 'node_modules')
    : null
  if (principal && fs.existsSync(principal)) env.NODE_PATH = principal
}

const r = spawnSync(
  process.execPath,
  ['--test', 'shoplogix/__tests__/*.test.js', '__tests__/*.test.js'],
  { cwd: functionsDir, env, encoding: 'utf8', timeout: 110_000 },
)
const salida = `${r.stdout || ''}\n${r.stderr || ''}`
const n = (clave) => (salida.match(new RegExp(`^ℹ ${clave} (\\d+)`, 'm')) || [])[1]
const total = n('tests')
const fallas = n('fail')

if (r.status === 0 && fallas === '0') {
  const recordatorio = [
    `Tests de functions en verde (${total}/${total}) tras editar ${path.basename(archivo)}.`,
    'Casos límite del sync que ya costaron: turno que arranca antes de las 08:00 (la ventana es de AYER hasta las 08:00),',
    'bordes entre turnos pegados (cada tramo de 5 min va a UN turno), turno en curso vs cerrado/congelado,',
    'wall-clock-as-UTC (intervals, scheduled*) vs UTC real (lastSyncAt, syncedAt). Si el cambio toca uno de estos,',
    'agregar un test con valores reales y romper el arreglo a propósito para ver que el test falle.',
  ].join(' ')
  // writeSync: con process.stdout.write + exit, en Windows la salida por pipe se pierde.
  fs.writeSync(1, JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: recordatorio },
  }))
  process.exit(0)
}

// ── En rojo: mostrar qué falló, corto ────────────────────────────────────
const lineas = salida.split(/\r?\n/)
const nombres = [...new Set(lineas
  .filter((l) => /^✖ /.test(l) && !/^✖ failing tests:/.test(l))
  .map((l) => l.replace(/\s*\(\d+(\.\d+)?ms\)\s*$/, '')))]
const detalle = lineas.filter((l) => /AssertionError|^\s+(actual|expected|operator):|^\s*\w*Error: /.test(l)).slice(0, 12)
const motivo = r.error
  ? `No se pudo correr la suite: ${r.error.message}`
  : `${fallas ?? '?'} de ${total ?? '?'} tests de functions FALLAN tras editar ${path.basename(archivo)}.`
fs.writeSync(2, [
  `⛔ ${motivo}`,
  ...nombres.slice(0, 15),
  ...(detalle.length ? ['--- detalle ---', ...detalle] : []),
  `Correr: cd "${functionsDir}" && node --test "shoplogix/__tests__/*.test.js" "__tests__/*.test.js"`,
  'Arreglar antes de commitear: el sync alimenta el monitor que mira Producción.',
].join('\n'))
process.exit(2)
