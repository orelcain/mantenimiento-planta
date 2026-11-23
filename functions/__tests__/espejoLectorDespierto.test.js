/**
 * Lector e1.8 · sesión despierta sin ventana aparte: prueba `Pide-Pantalla` y `Texto-Pantalla` del
 * `espejo/lector-espejo.ps1` que sirve la función, ejecutándolas en PowerShell (powershell.exe 5.1 en Windows,
 * pwsh en Linux). SetThreadExecutionState solo existe en Windows: fuera de Windows esos casos se saltan.
 */
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')

const BOM = String.fromCharCode(0xfeff)
const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)
const LECTOR = fs.readFileSync(path.join(__dirname, '..', 'espejo', 'lector-espejo.ps1'), 'utf8').replace(BOM, '').split(CR + LF).join(LF)

function funcion(nombre) {
  const i = LECTOR.indexOf(`\nfunction ${nombre}(`)
  assert.ok(i >= 0, `no está la función ${nombre}`)
  const f = LECTOR.indexOf('\n}\n', i)
  return LECTOR.slice(i + 1, f + 2)
}

/** Bloque del arranque que crea el tipo EspejoGrader.Energia (desde `$script:energiaError = ''` hasta su `}`). */
function bloqueTipo() {
  const i = LECTOR.indexOf("$script:energiaError = ''\n")
  assert.ok(i >= 0, 'no está el bloque del tipo')
  const f = LECTOR.indexOf('\n}\n', LECTOR.indexOf("if (-not ('EspejoGrader.Energia' -as [type])) {", i))
  return LECTOR.slice(i, f + 3)
}

function powershell() {
  if (process.platform !== 'win32') return null
  for (const exe of ['powershell.exe', 'pwsh']) {
    const r = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' })
    if (r.status === 0) return exe
  }
  return null
}
const PS = powershell()

function correr(casos) {
  const guion = "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)\n$script:logs = @()\nfunction Log([string]$m) { $script:logs += $m }\n"
    + "$script:politicas = ''\n$script:bloqueoDesde = $null\n$script:ultimoBloqueo = $null\n"
    + bloqueTipo() + funcion('Pide-Pantalla') + funcion('Texto-Pantalla')
    + '$ahora = [datetime]::new(2026, 11, 23, 3, 0, 0)\n'
    + casos.join('\n') + '\n'
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'espejo-despierto-'))
  const archivo = path.join(dir, 'casos.ps1')
  fs.writeFileSync(archivo, BOM + guion.split(LF).join(CR + LF), 'utf8')
  let r
  try {
    r = spawnSync(PS, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', archivo], { encoding: 'utf8' })
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  assert.strictEqual(r.status, 0, r.stderr)
  return r.stdout.replace(/\r/g, '').trim().split('\n')
}

test('Pide-Pantalla: Windows toma el pedido, sin motivo, y la clave «pantalla» dice «pedida»', { skip: !PS && 'sin Windows PowerShell' }, () => {
  assert.deepStrictEqual(correr([
    "[string](Pide-Pantalla) + ' [' + $script:pantallaMotivo + ']'",
    "Texto-Pantalla (Pide-Pantalla) $false $ahora",
    // Devolver el equipo a lo normal también lo toma Windows y no ensucia el motivo.
    "[string](Pide-Pantalla 2147483648) + ' [' + $script:pantallaMotivo + ']'",
    '[string]$script:logs.Count',
  ]), ['True []', 'pedida sin-bloqueo', 'True []', '0'])
})

test('el tipo ya creado en el mismo proceso no es error', { skip: !PS && 'sin Windows PowerShell' }, () => {
  assert.deepStrictEqual(correr([
    bloqueTipo(),
    "'[' + $script:energiaError + '] ' + [string](Pide-Pantalla)",
  ]), ['[] True'])
})

test('sin el tipo: «no-pedida:sin-tipo» en la clave y el detalle una sola vez en el log', { skip: !PS && 'sin Windows PowerShell' }, () => {
  assert.deepStrictEqual(correr([
    "$script:energiaError = 'no compila'",
    '[string](Pide-Pantalla)',
    "Texto-Pantalla (Pide-Pantalla) $false $ahora",
    '[string]$script:logs.Count',
    '$script:logs[0]',
  ]), ['False', 'no-pedida:sin-tipo sin-bloqueo', '1', 'pantalla: Windows no tomó el pedido de pantalla despierta (sin-tipo: no compila).'])
})

test('e1.8: banderas en decimal (en PS 5.1 el hex 0x80000003 es un Int32 negativo) y se devuelve al salir', () => {
  assert.match(LECTOR, /^\$VERSION = 'e1\.8'$/m)
  assert.ok(!/0x8000000[0-3]/i.test(LECTOR))
  assert.ok(LECTOR.includes('function Pide-Pantalla([uint32]$flags = 2147483651) {'))
  // Se pide al arrancar y en cada ciclo; al salir del bucle se devuelve antes del «Fin del lector».
  assert.strictEqual(LECTOR.split('$script:pantallaPedida = Pide-Pantalla\n').length - 1, 2)
  assert.ok(LECTOR.includes("$null = Pide-Pantalla 2147483648\nLog 'Fin del lector.'\n"))
})
