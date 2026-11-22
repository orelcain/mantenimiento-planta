/**
 * Lector e1.4 · lectura en vivo a pedido: prueba las funciones PURAS `Fin-Vivo` y `Espera-Ciclo` del
 * `espejo/lector-espejo.ps1` que sirve la función, ejecutándolas en PowerShell (powershell.exe 5.1 en Windows,
 * pwsh en Linux). Si no hay PowerShell en la máquina, el caso se salta (no se da por bueno).
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

/** Texto de `function <nombre> { … }` hasta su `}` de cierre en la columna 0. */
function funcion(nombre) {
  const i = LECTOR.indexOf(`\nfunction ${nombre}(`)
  assert.ok(i >= 0, `no está la función ${nombre}`)
  const f = LECTOR.indexOf('\n}\n', i)
  return LECTOR.slice(i + 1, f + 2)
}
function constante(nombre) {
  const m = new RegExp(`^\\$${nombre} = (\\d+)$`, 'm').exec(LECTOR)
  assert.ok(m, `no está $${nombre}`)
  return `$${nombre} = ${m[1]}\n`
}

function powershell() {
  for (const exe of process.platform === 'win32' ? ['powershell.exe', 'pwsh'] : ['pwsh']) {
    const r = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' })
    if (r.status === 0) return exe
  }
  return null
}
const PS = powershell()

/** Corre los casos en PowerShell y devuelve una línea por caso. */
function correr(casos) {
  const guion = constante('ESPERA_VIVO') + constante('VIVO_TOPE_SEG') + funcion('Fin-Vivo') + funcion('Espera-Ciclo')
    + '$ahora = [datetime]::new(2026, 11, 21, 14, 0, 0)\n'
    + casos.join('\n') + '\n'
  // Archivo con BOM: PowerShell 5.1 lee el UTF-8 sin BOM como ANSI. Por stdin no corre bloques de varias líneas.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'espejo-vivo-'))
  const archivo = path.join(dir, 'casos.ps1')
  fs.writeFileSync(archivo, BOM + guion.split(LF).join(CR + LF), 'utf8')
  let r
  try {
    r = spawnSync(PS, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', archivo], { encoding: 'utf8' })
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  assert.strictEqual(r.status, 0, r.stderr)
  return r.stdout.replace(/\r/g, '').trim().split('\n')
}

// «seg» = segundos desde $ahora hasta el fin calculado; «null» si no hay modo vivo.
const SEG = (expr) => `$f = ${expr}; if ($null -eq $f) { 'null' } else { [string][int](($f - $ahora).TotalSeconds) }`

test('Fin-Vivo: arma el plazo con los segundos de la función, con tope de 30 min', { skip: !PS && 'sin PowerShell' }, () => {
  assert.deepStrictEqual(correr([
    SEG('Fin-Vivo 900 $ahora'),
    SEG("Fin-Vivo '900' $ahora"),
    SEG('Fin-Vivo 1.5 $ahora'),
    SEG('Fin-Vivo 99999 $ahora'),
    SEG('Fin-Vivo $null $ahora'),
    SEG('Fin-Vivo 0 $ahora'),
    SEG('Fin-Vivo -5 $ahora'),
    SEG("Fin-Vivo 'abc' $ahora"),
    SEG("Fin-Vivo '' $ahora"),
  ]), ['900', '900', '2', '1800', 'null', 'null', 'null', 'null', 'null'])
})

test('Espera-Ciclo: 60 s mientras dura el plazo, ESPEJO_CADA fuera de él; nunca baja de lo configurado', { skip: !PS && 'sin PowerShell' }, () => {
  assert.deepStrictEqual(correr([
    '[string](Espera-Ciclo 300 $null $ahora)',
    '[string](Espera-Ciclo 300 $ahora.AddSeconds(30) $ahora)',
    '[string](Espera-Ciclo 300 $ahora $ahora)',
    '[string](Espera-Ciclo 300 $ahora.AddSeconds(-1) $ahora)',
    // ESPEJO_CADA ya menor que 60 (prueba manual): el modo vivo no la cambia.
    '[string](Espera-Ciclo 20 $ahora.AddSeconds(30) $ahora)',
    '[string](Espera-Ciclo 90 $ahora.AddSeconds(30) $ahora)',
  ]), ['300', '60', '300', '300', '20', '60'])
})

test('el lector usa Espera-Ciclo para esperar, informa «vivo» en el latido y es e1.7', () => {
  assert.match(LECTOR, /^\$VERSION = 'e1\.7'$/m)
  assert.match(LECTOR, /^\$ESPERA_VIVO = 60$/m)
  assert.ok(LECTOR.includes('  $espera = Espera-Ciclo $cada $script:vivoFin (Get-Date)\n'))
  assert.ok(LECTOR.includes('parcial = $latParcial; vivo = (Texto-Vivo); recarga = '))
  assert.ok(LECTOR.includes("relectura = $false; vivo = ''; recarga = ''; pantalla = (Texto-Pantalla $script:pantallaPedida (Sesion-Bloqueada) (Get-Date)); matrix = ''; huecos = ''; error = 'iniciando' }"))
  // La respuesta de cada 200 decide el modo; sin vivoSeg vuelve a ESPEJO_CADA.
  assert.ok(LECTOR.includes('    $script:vivoFin = $null\n    if ($jr) { try { $script:vivoFin = Fin-Vivo $jr.vivoSeg (Get-Date) }'))
})
