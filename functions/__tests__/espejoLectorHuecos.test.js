/**
 * Lector e1.7 · leer siempre: pantalla despierta, Matrix abierto y relleno automático de huecos. Prueba en PowerShell las
 * funciones del `espejo/lector-espejo.ps1` que sirve la función, con la UI Automation simulada (Celda), y la consulta de
 * conteos de la función. La prueba de punta a punta contra la grilla WPF está en
 * `_HERRAMIENTAS/matrix-diagnostico/pruebas-espejo/probar-huecos.ps1`. Sin PowerShell, los casos de PS se saltan.
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

function funcion(nombre) {
  const i = LECTOR.indexOf(`\nfunction ${nombre}`)
  assert.ok(i >= 0, `no está la función ${nombre}`)
  const f = LECTOR.indexOf('\n}\n', i)
  return LECTOR.slice(i + 1, f + 2)
}

function powershell() {
  for (const exe of process.platform === 'win32' ? ['powershell.exe', 'pwsh'] : ['pwsh']) {
    const r = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' })
    if (r.status === 0) return exe
  }
  return null
}
const PS = powershell()

function correr(guion) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'espejo-huecos-'))
  const archivo = path.join(dir, 'casos.ps1')
  fs.writeFileSync(archivo, BOM + guion.split('@@DIR@@').join(dir).split(LF).join(CR + LF), 'utf8')
  let r
  try {
    r = spawnSync(PS, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', archivo], { encoding: 'utf8' })
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  assert.strictEqual(r.status, 0, r.stderr)
  return r.stdout.replace(/\r/g, '').trim().split('\n')
}

// Tabla simulada: 3 horas (06, 07, 08) del 2026-11-20 con 4 filas por hora, pares idénticos por segundo.
function tablaPs() {
  const filas = []
  for (const hh of ['06', '07', '08']) {
    for (const ss of ['00:10', '00:10', '30:00', '30:00']) {
      filas.push(['2026-11-20', `${hh}:${ss}`, '4,10 kg', '1', '720.260.747', '9', 'Premium', 'FRESCO', '8 - 10 LB', 'HG', 'A'])
    }
  }
  filas.push(['', '', 'Total', '', '', '', '', '', '', '', ''])
  return '$script:T = @(' + filas.map((f) => '@(' + f.map((c) => `'${c}'`).join(',') + ')').join(',') + ')\n'
    + 'function Celda($gp, [int]$r, [int]$c) { return $script:T[$r][$c] }\n'
}
const BASE = ["$FORMATO_FECHA = '^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$'", '$LOTE_MAX = 2000', 'function Revisa-Detener { }', 'function Log([string]$m) { }'].join('\n') + '\n'

test('la función valida las fechas de ?conteos y cuenta las filas por hora', () => {
  assert.deepStrictEqual(espejo.validarConteos('2026-11-20,2026-11-21,2026-11-20'), { ok: true, fechas: ['2026-11-20', '2026-11-21'] })
  assert.strictEqual(espejo.validarConteos('').ok, false)
  assert.strictEqual(espejo.validarConteos('2026-11-20,../x').ok, false)
  assert.strictEqual(espejo.validarConteos(Array.from({ length: 9 }, (_, i) => `2026-11-1${i}`).join(',')).ok, false)
  assert.deepStrictEqual(espejo.conteoPorHora([{ id: '03', filas: ['a', 'b'] }, { id: '04', filas: [] }, { id: 'xx', filas: ['a'] }, { id: '05' }]), { '03': 2 })
  assert.strictEqual(espejo.MAX_CLAVES_ESTADO, 24)
})

test('el latido de e1.7 trae pantalla, matrix y huecos y la función lo acepta', () => {
  const m = /\n {2}\$estC = @\{ (.*) \}\n/.exec(LECTOR)
  assert.ok(m, 'no está $estC')
  const claves = m[1].split('; ').map((p) => p.split(' = ')[0])
  for (const k of ['pantalla', 'matrix', 'huecos']) assert.ok(claves.includes(k), `falta ${k}`)
  assert.ok(claves.length <= espejo.MAX_CLAVES_ESTADO, `latido con ${claves.length} claves`)
  const estado = Object.fromEntries(claves.map((k) => [k, 'x']))
  estado.pantalla = 'pedida bloqueada-desde 2026-11-22 03:10 inactividad=900s(ti) protector=600s(usuario)'
  estado.huecos = 'rellenando 1200/45000 18h 2026-11-20 03'
  estado.matrix = 'abierto-por-lector 2026-11-22 07:01'
  const r = espejo.validarCuerpo({ v: 1, equipo: 'PC', informe: 'pieza', leidoEn: '2026-11-22T14:05:00-03:00', filas: [], estado })
  assert.deepStrictEqual(r.ok, true, r.error)
})

test('el error del ciclo ya no se tapa con «pantalla-bloqueada» y la pantalla se pide con ES_DISPLAY_REQUIRED', () => {
  assert.ok(!LECTOR.includes("$errC = 'pantalla-bloqueada'"))
  assert.ok(LECTOR.includes('SetThreadExecutionState([uint32]2147483651)'))
  // 0x80000003 = ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED.
  assert.strictEqual(0x80000003, 2147483651)
  // Nada de simular entrada ni de tocar políticas.
  assert.doesNotMatch(LECTOR, /SendKeys|SendInput|keybd_event|mouse_event|Set-ItemProperty|New-ItemProperty|powercfg|LockWorkStation/)
})

test('los huecos solo se rellenan con el turno al día, sin recarga ni modo vivo, y «Actualizar» sigue cada ESPEJO_CADA', () => {
  assert.ok(LECTOR.includes('if (-not $rec -and -not $fin -and $res.gp -and $res.lec -and -not $res.lec.parcial -and -not [string]$res.error -and $envioOk -and -not (Texto-Vivo)) {'))
  assert.ok(LECTOR.includes('    $refrescar = (((Get-Date) - $script:ultRefresco).TotalSeconds -ge $cada)'))
  assert.ok(LECTOR.includes("    $script:ultRefresco = Get-Date\n"))
})

test('Plan-Huecos: compara Matrix con el espejo por hora y salta las horas completas', { skip: !PS && 'sin PowerShell' }, () => {
  const guion = BASE + tablaPs() + funcion('Fila-Celdas') + funcion('Desde-Corte') + funcion('Plan-Huecos') + [
    '$script:horasAgotadas = @{}',
    "$horas = @([datetime]'2026-11-20 08:00:00', [datetime]'2026-11-20 07:00:00', [datetime]'2026-11-20 06:00:00', [datetime]'2026-11-20 05:00:00')",
    "$datos = @{ '2026-11-20' = @{ '06' = 4; '07' = 2 } }",
    '$p = Plan-Huecos 1 13 $horas $datos',
    "'error=[' + $p.error + '] revisadas=' + $p.revisadas",
    "foreach ($h in $p.huecos) { $h.clave + ' ' + $h.desde + '-' + $h.hasta + ' m=' + $h.matrix + ' e=' + $h.espejo }",
    "$script:horasAgotadas['2026-11-20 08'] = $true",
    "'agotada: ' + (Plan-Huecos 1 13 $horas $datos).huecos.Count",
  ].join('\n') + '\n'
  assert.deepStrictEqual(correr(guion), [
    'error=[] revisadas=4',
    '2026-11-20 08 8-12 m=4 e=0',
    '2026-11-20 07 4-8 m=4 e=2',
    'agotada: 1',
  ])
})

test('Plan-Huecos: una tabla fuera de orden no se relee', { skip: !PS && 'sin PowerShell' }, () => {
  const guion = BASE + tablaPs() + funcion('Fila-Celdas') + funcion('Desde-Corte') + funcion('Plan-Huecos') + [
    '$script:horasAgotadas = @{}',
    // La última fila del tramo de las 07 h es de las 06 h: la tabla no está en orden.
    "$script:T[7] = @('2026-11-20','06:59:59','x','1','1','1','a','b','c','d','e')",
    "$p = Plan-Huecos 1 13 @([datetime]'2026-11-20 07:00:00') @{ '2026-11-20' = @{} }",
    "'error=' + $p.error",
  ].join('\n') + '\n'
  assert.deepStrictEqual(correr(guion), ['error=desordenada'])
})

test('Lee-Hueco: #n por segundo que sigue entre tramos y se corta en la hora', { skip: !PS && 'sin PowerShell' }, () => {
  const guion = BASE + tablaPs() + funcion('Fila-Celdas') + funcion('Nuevo-Diccionario') + funcion('Lee-Hueco') + [
    "$h = @{ clave = '2026-11-20 07'; desde = 4; hasta = 8; idx = 4; dict = (Nuevo-Diccionario); dictSec = '' }",
    '$LOTE_MAX = 1',
    '$a = Lee-Hueco 1 $h 90',
    "'a idx=' + $a.idx + ' ' + (($a.items | ForEach-Object { $_.Substring($_.Length - 2) }) -join ',')",
    '$h.idx = $a.idx; $h.dict = $a.dict; $h.dictSec = $a.dictSec',
    '$LOTE_MAX = 2000',
    '$b = Lee-Hueco 1 $h 90',
    "'b idx=' + $b.idx + ' ' + (($b.items | ForEach-Object { $_.Substring($_.Length - 2) }) -join ',')",
    // Sin aplicar el avance (envío fallido), la misma lectura vuelve a dar lo mismo.
    "'c igual=' + (((Lee-Hueco 1 $h 90).items -join '|') -eq ($b.items -join '|'))",
    "$h2 = @{ clave = '2026-11-20 06'; desde = 4; hasta = 8; idx = 4; dict = (Nuevo-Diccionario); dictSec = '' }",
    "'otra hora=' + ($null -eq (Lee-Hueco 1 $h2 90))",
  ].join('\n') + '\n'
  assert.deepStrictEqual(correr(guion), ['a idx=5 #0', 'b idx=8 #1,#0,#1', 'c igual=True', 'otra hora=True'])
})

test('Horas-Rango: horas cerradas del rango, de la más nueva a la más vieja, sin la hora en curso', { skip: !PS && 'sin PowerShell' }, () => {
  const guion = BASE + funcion('Fecha-Exacta') + funcion('Hora-Abajo') + funcion('Horas-Rango') + [
    "$l = Horas-Rango ([string[]]@('2026-11-20 21:30:00', '2026-11-21 00:30:00')) ([datetime]'2026-11-22 10:05:00')",
    "($l | ForEach-Object { $_.ToString('dd HH') }) -join ','",
    "$l = Horas-Rango ([string[]]@('2026-11-22 00:00:00', '2026-11-23 00:00:00')) ([datetime]'2026-11-22 03:20:00')",
    "($l | ForEach-Object { $_.ToString('dd HH') }) -join ','",
    "'vacio=' + (Horas-Rango ([string[]]@('x', 'y')) (Get-Date)).Count",
  ].join('\n') + '\n'
  assert.deepStrictEqual(correr(guion), ['20 23,20 22', '22 02,22 01,22 00', 'vacio=0'])
})

test('Abre-Matrix: abre una vez, espera 30 min, tope de 6 en 24 h y sin ruta segura no abre', { skip: !PS && 'sin PowerShell' }, () => {
  const guion = BASE + funcion('Lee-Aperturas') + funcion('Abre-Matrix') + [
    "$UTF8 = New-Object System.Text.UTF8Encoding($false)",
    "$archivoAbrir = Join-Path '@@DIR@@' 'abrir.json'",
    '$script:abrirMatrix = $true',
    "$script:ruta = 'C:\\x\\MATRIX CG.exe'",
    'function Ruta-Matrix { return $script:ruta }',
    'function Lanza-Minimizado([string]$r) { $script:lanzadas++; return $true }',
    '$script:lanzadas = 0',
    "$t0 = [datetime]'2026-11-22 07:00:00'",
    'Abre-Matrix $t0',
    'Abre-Matrix $t0.AddMinutes(10)',
    'for ($i = 1; $i -le 6; $i++) { [void](Abre-Matrix $t0.AddMinutes(31 * $i)) }',
    "'lanzadas=' + $script:lanzadas",
    'Abre-Matrix $t0.AddHours(5)',
    "Remove-Item $archivoAbrir; $script:ruta = ''",
    'Abre-Matrix $t0',
    '$script:abrirMatrix = $false',
    'Abre-Matrix $t0',
  ].join('\n') + '\n'
  assert.deepStrictEqual(correr(guion), [
    'abierto-por-lector 2026-11-22 07:00',
    'abierto-por-lector 2026-11-22 07:00 esperando',
    'lanzadas=6',
    'no-abre tope-diario 6',
    'no-abre sin-ruta',
    'no-abre apagado',
  ])
})

test('Recuerda-Matrix y Ruta-Matrix: solo un .exe «matrix», y el único de la carpeta de Marelec', { skip: !PS && 'sin PowerShell' }, () => {
  const guion = BASE + funcion('Recuerda-Matrix') + funcion('Ruta-Matrix') + [
    "$UTF8 = New-Object System.Text.UTF8Encoding($false)",
    "$archivoRutaMatrix = Join-Path '@@DIR@@' 'matrix-ruta.txt'",
    "$script:rutaMatrix = ''",
    "$script:carpetaMatrix = Join-Path '@@DIR@@' 'marelec'",
    'New-Item -ItemType Directory -Path $script:carpetaMatrix | Out-Null',
    "Recuerda-Matrix 'C:\\Windows\\notepad.exe'",
    "'notepad=[' + $script:rutaMatrix + ']'",
    "'vacia=[' + (Ruta-Matrix) + ']'",
    "Set-Content -LiteralPath (Join-Path $script:carpetaMatrix 'MATRIX CG.exe') -Value 'x'",
    "Set-Content -LiteralPath (Join-Path $script:carpetaMatrix 'uninstall.exe') -Value 'x'",
    "'una=' + (Split-Path -Leaf (Ruta-Matrix))",
    "Set-Content -LiteralPath (Join-Path $script:carpetaMatrix 'MatrixUpdater.exe') -Value 'x'",
    "'dos=[' + (Ruta-Matrix) + ']'",
    "Recuerda-Matrix (Join-Path $script:carpetaMatrix 'MATRIX CG.exe')",
    "$script:rutaMatrix = ''",
    "'recordada=' + (Split-Path -Leaf (Ruta-Matrix))",
  ].join('\n') + '\n'
  assert.deepStrictEqual(correr(guion), ['notepad=[]', 'vacia=[]', 'una=MATRIX CG.exe', 'dos=[]', 'recordada=MATRIX CG.exe'])
})

test('Texto-Pantalla: hora del bloqueo, último bloqueo al volver y políticas', { skip: !PS && 'sin PowerShell' }, () => {
  const guion = BASE + funcion('Texto-Pantalla') + [
    '$script:bloqueoDesde = $null; $script:ultimoBloqueo = $null',
    "$script:politicas = ''",
    "Texto-Pantalla $true $false ([datetime]'2026-11-22 02:00:00')",
    "$script:politicas = 'inactividad=900s(ti)'",
    "Texto-Pantalla $true $true ([datetime]'2026-11-22 02:15:00')",
    "Texto-Pantalla $true $true ([datetime]'2026-11-22 03:00:00')",
    "Texto-Pantalla $false $false ([datetime]'2026-11-22 07:30:00')",
  ].join('\n') + '\n'
  assert.deepStrictEqual(correr(guion), [
    'pedida sin-bloqueo',
    'pedida bloqueada-desde 2026-11-22 02:15 inactividad=900s(ti)',
    'pedida bloqueada-desde 2026-11-22 02:15 inactividad=900s(ti)',
    'no-pedida ultimo-bloqueo 2026-11-22 02:15 inactividad=900s(ti)',
  ])
})

test('Texto-Recarga: el total es el de la última tabla leída y el avance nunca lo pasa', { skip: !PS && 'sin PowerShell' }, () => {
  const guion = funcion('Texto-Recarga') + [
    "$r = @{ enviadas = 124000 }",
    "Texto-Recarga $r '' 124000 207884 ''",
    "Texto-Recarga $r '' 124000 0 'sin-tabla'",
    "Texto-Recarga $r '' 130000 120000 ''",
  ].join('\n') + '\n'
  assert.deepStrictEqual(correr(guion), ['leyendo 124000/207884 124000', 'leyendo 124000/0 124000', 'leyendo 120000/120000 124000'])
})
