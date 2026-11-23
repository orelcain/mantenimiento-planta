/**
 * Lector e1.9 · periodo relativo del informe (archivo PERIODO, apagado por defecto): prueba en PowerShell el bloque de
 * funciones del `espejo/lector-espejo.ps1` con el combo de Matrix simulado (valor, opciones y Select), y que la clave
 * «periodo» del latido nunca pase el tope de la función. La prueba contra una ventana Qt real está en
 * `_HERRAMIENTAS/matrix-diagnostico/pruebas-espejo/probar-periodo.ps1`. Sin PowerShell, los casos de PS se saltan.
 */
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')
const espejo = require('../espejoGrader')

const BOM = String.fromCharCode(0xfeff)
const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)
const LECTOR = fs.readFileSync(path.join(__dirname, '..', 'espejo', 'lector-espejo.ps1'), 'utf8').replace(BOM, '').split(CR + LF).join(LF)

function bloquePeriodo() {
  const i = LECTOR.indexOf('# ---- e1.9: periodo relativo del informe')
  const f = LECTOR.indexOf('# Sesión de Windows bloqueada')
  assert.ok(i > 0 && f > i, 'no está el bloque del periodo')
  return LECTOR.slice(i, f)
}

function powershell() {
  for (const exe of process.platform === 'win32' ? ['powershell.exe', 'pwsh'] : ['pwsh']) {
    const r = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' })
    if (r.status === 0) return exe
  }
  return null
}
const PS = powershell()

// Combo falso: opciones con Select (que cambia o no el valor, según $script:selectCambia) y conteo de llamadas.
const PRELUDIO = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$UTF8 = New-Object System.Text.UTF8Encoding($false)
$dir = Join-Path ([IO.Path]::GetTempPath()) ('periodo-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$archivoPeriodo = Join-Path $dir 'PERIODO'
$archivoPeriodoHecho = Join-Path $dir 'periodo-hecho.txt'
$script:logs = New-Object System.Collections.Generic.List[string]
function Log([string]$m) { $script:logs.Add($m) }
function Espera([double]$s) { }
function Ventana-Raiz($el) { return $null }
$script:valorFalso = 'Usuario definido'
$script:selects = 0
$script:selectCambia = $false
$script:hayCombo = $true
$script:opcionesFalsas = [string[]]@('Usuario definido', 'Hoy', 'Ayer', 'Ultimas 24 horas', 'Esta semana')
function Valor-De($el) { return $script:valorFalso }
function Item-Falso([string]$nombre) {
  $pat = New-Object psobject
  $pat | Add-Member -MemberType NoteProperty -Name nombre -Value $nombre
  $pat | Add-Member -MemberType ScriptMethod -Name Select -Value { $script:selects++; if ($script:selectCambia) { $script:valorFalso = $this.nombre } }
  $it = New-Object psobject
  $it | Add-Member -MemberType NoteProperty -Name pat -Value $pat
  $it | Add-Member -MemberType ScriptMethod -Name GetCurrentPattern -Value { param($p) return $this.pat }
  return $it
}
`
// Tras el bloque real: Combo-Periodo simulado (el real usa UIA de verdad: se prueba contra Qt).
const COMBO_FALSO = `
function Combo-Periodo($ventana) {
  if (-not $script:hayCombo) { return @{ error = 'sin-combo'; el = $null; valor = ''; items = @(); nombres = [string[]]@() } }
  return @{ error = ''; el = 'combo'; valor = $script:valorFalso; items = @($script:opcionesFalsas | ForEach-Object { Item-Falso $_ }); nombres = $script:opcionesFalsas }
}
function Paso([bool]$rec = $false, [bool]$blo = $false) { $c = Paso-Periodo 'el' $rec $blo; return ('cambio=' + $c + ' sel=' + $script:selects + ' rel=' + $script:periodoRelativo + ' | ' + $script:periodoTexto) }
`

function correr(guion) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'espejo-periodo-'))
  const archivo = path.join(dir, 'casos.ps1')
  fs.writeFileSync(archivo, BOM + (PRELUDIO + bloquePeriodo() + COMBO_FALSO + guion).split(LF).join(CR + LF), 'utf8')
  let r
  try {
    r = spawnSync(PS, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', archivo], { encoding: 'utf8' })
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  assert.strictEqual(r.status, 0, r.stderr)
  return r.stdout.replace(/\r/g, '').trim().split('\n')
}

test('sinónimos: prefiere la ventana móvil, nunca ayer ni semana; el archivo PERIODO puede nombrar la opción exacta', { skip: !PS }, () => {
  const salida = correr([
    "Elige-Periodo ([string[]]@('Usuario definido', 'Hoy', 'Últimas 24 horas', 'Esta semana')) ''",
    "Elige-Periodo ([string[]]@('User defined', 'Today', 'Current shift')) ''",
    "Elige-Periodo ([string[]]@('Usuario definido', 'Ayer', 'Esta semana', 'Este mes')) ''",
    "Elige-Periodo ([string[]]@('Usuario definido', 'HOY', 'Ayer')) ''",
    "Elige-Periodo ([string[]]@('Usuario definido', 'Hoy', 'Ultimas 8 horas')) 'últimas 8 HORAS'",
    "Elige-Periodo ([string[]]@('Usuario definido', 'Hoy')) 'Turno actual'",
  ].join('\n'))
  assert.deepStrictEqual(salida, ['2', '2', '-1', '1', '2', '-1'])
})

test('apagado (sin archivo PERIODO): solo mira el combo, nunca elige, e informa valor y opciones', { skip: !PS }, () => {
  const salida = correr('Paso\n$script:valorFalso = "Hoy"; Paso\n$script:hayCombo = $false; Paso')
  assert.deepStrictEqual(salida, [
    'cambio=False sel=0 rel=False | apagado valor=Usuario definido ops=Usuario definido;Hoy;Ayer;Ultimas 24 horas;Esta semana',
    'cambio=False sel=0 rel=True | apagado valor=Hoy ops=Usuario definido;Hoy;Ayer;Ultimas 24 horas;Esta semana',
    'cambio=False sel=0 rel=False | sin-combo valor=',
  ])
})

test('encendido: elige una sola vez por archivo, aunque el lector se reinicie; un archivo nuevo permite otro intento', { skip: !PS }, () => {
  const salida = correr([
    '$script:selectCambia = $true',
    "[IO.File]::WriteAllText($archivoPeriodo, '')",
    'Paso',
    'Paso',
    // «Reinicio»: el estado en memoria se pierde, la marca en disco no.
    "$script:periodoTexto = ''; $script:valorFalso = 'Usuario definido'; Paso",
    // Archivo nuevo (otra hora de escritura): vuelve a intentar.
    "Start-Sleep -Milliseconds 30; [IO.File]::WriteAllText($archivoPeriodo, ''); (Get-Item $archivoPeriodo).LastWriteTimeUtc = (Get-Date).ToUniversalTime().AddMinutes(1); Paso",
    "($script:logs | Where-Object { $_ -like 'periodo: *' }).Count",
  ].join('\n'))
  assert.deepStrictEqual(salida, [
    'cambio=True sel=1 rel=True | elegida:Ultimas 24 horas valor=Ultimas 24 horas ops=Usuario definido;Hoy;Ayer;Ultimas 24 horas;Esta semana',
    'cambio=False sel=1 rel=True | elegida:Ultimas 24 horas valor=Ultimas 24 horas ops=Usuario definido;Hoy;Ayer;Ultimas 24 horas;Esta semana',
    'cambio=False sel=1 rel=False | elegida:Ultimas 24 horas valor=Usuario definido ops=Usuario definido;Hoy;Ayer;Ultimas 24 horas;Esta semana',
    'cambio=True sel=2 rel=True | elegida:Ultimas 24 horas valor=Ultimas 24 horas ops=Usuario definido;Hoy;Ayer;Ultimas 24 horas;Esta semana',
    '2',
  ])
})

test('encendido: Qt no toma el Select → «no-cambia» y no reintenta; ya en la opción → no elige', { skip: !PS }, () => {
  const salida = correr([
    "[IO.File]::WriteAllText($archivoPeriodo, '')",
    'Paso',
    'Paso',
    "Remove-Item $archivoPeriodoHecho; $script:valorFalso = 'Ultimas 24 horas'; Paso",
  ].join('\n'))
  assert.deepStrictEqual(salida, [
    'cambio=False sel=1 rel=False | no-cambia:Ultimas 24 horas valor=Usuario definido ops=Usuario definido;Hoy;Ayer;Ultimas 24 horas;Esta semana',
    'cambio=False sel=1 rel=False | no-cambia:Ultimas 24 horas valor=Usuario definido ops=Usuario definido;Hoy;Ayer;Ultimas 24 horas;Esta semana',
    'cambio=False sel=1 rel=True | ya-en:Ultimas 24 horas valor=Ultimas 24 horas ops=Usuario definido;Hoy;Ayer;Ultimas 24 horas;Esta semana',
  ])
})

test('encendido: no elige durante una recarga ni con la sesión bloqueada (y lo intenta después); sin opciones ni coincidencia no toca', { skip: !PS }, () => {
  const salida = correr([
    '$script:selectCambia = $true',
    "[IO.File]::WriteAllText($archivoPeriodo, '')",
    'Paso $true $false',
    'Paso $false $true',
    'Paso',
    "Remove-Item $archivoPeriodoHecho; $script:valorFalso = 'Usuario definido'; $script:opcionesFalsas = [string[]]@(); Paso",
    "Remove-Item $archivoPeriodoHecho; $script:opcionesFalsas = [string[]]@('Usuario definido', 'Ayer', 'Este mes'); Paso",
  ].join('\n'))
  assert.deepStrictEqual(salida, [
    'cambio=False sel=0 rel=False | pospuesto-recarga valor=Usuario definido ops=Usuario definido;Hoy;Ayer;Ultimas 24 horas;Esta semana',
    'cambio=False sel=0 rel=False | pospuesto-bloqueo valor=Usuario definido ops=Usuario definido;Hoy;Ayer;Ultimas 24 horas;Esta semana',
    'cambio=True sel=1 rel=True | elegida:Ultimas 24 horas valor=Ultimas 24 horas ops=Usuario definido;Hoy;Ayer;Ultimas 24 horas;Esta semana',
    'cambio=False sel=1 rel=False | sin-opciones valor=Usuario definido',
    'cambio=False sel=1 rel=False | sin-coincidencia valor=Usuario definido ops=Usuario definido;Ayer;Este mes',
  ])
})

test('la clave «periodo» nunca pasa 200 caracteres y el latido completo cabe en el contrato (24 claves)', { skip: !PS }, () => {
  const salida = correr([
    "$muchas = [string[]]@(1..60 | ForEach-Object { 'Opción larga de periodo número ' + $_ })",
    "$t = Texto-Periodo 'sin-coincidencia' '' 'Usuario definido; con = raros' $muchas",
    '$t.Length',
    "$t.Contains('valor=Usuario definido con raros')",
  ].join('\n'))
  assert.ok(Number(salida[0]) <= 200, salida[0])
  assert.strictEqual(salida[1], 'True')
  // El latido del bucle trae 24 claves y la función lo acepta con una clave «periodo» de 200 caracteres.
  const m = /\n {2}\$estC = @\{ (.*) \}\n/.exec(LECTOR)
  assert.ok(m, 'no está $estC')
  const claves = m[1].split(';').map((x) => x.split('=')[0].trim()).filter(Boolean)
  assert.strictEqual(claves.length, 24)
  assert.ok(claves.includes('periodo'))
  const estado = Object.fromEntries(claves.map((k) => [k, k === 'rango' ? [] : 'x']))
  estado.periodo = 'x'.repeat(200)
  const cuerpo = { v: 1, equipo: 'PRUEBA', informe: 'pieza', leidoEn: '2026-11-24T08:00:00-03:00', filas: [], estado }
  assert.strictEqual(espejo.validarCuerpo(cuerpo).ok, true)
  estado.periodo = 'x'.repeat(201)
  assert.strictEqual(espejo.validarCuerpo(cuerpo).ok, false)
})
