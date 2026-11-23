/**
 * Lector e1.6 · recarga puntual de historia (archivo RECARGA): prueba en PowerShell las funciones del
 * `espejo/lector-espejo.ps1` que sirve la función, con la UI Automation simulada (Celda, controles), y comprueba que el
 * latido sigue cabiendo en el contrato. La prueba de punta a punta contra la grilla WPF está en
 * `_HERRAMIENTAS/matrix-diagnostico/pruebas-espejo/probar-recarga.ps1`. Sin PowerShell, los casos de PS se saltan.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'espejo-recarga-'))
  const archivo = path.join(dir, 'casos.ps1')
  fs.writeFileSync(archivo, BOM + guion.split(LF).join(CR + LF), 'utf8')
  let r
  try {
    r = spawnSync(PS, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', archivo], { encoding: 'utf8' })
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  assert.strictEqual(r.status, 0, r.stderr)
  return r.stdout.replace(/\r/g, '').trim().split('\n')
}

test('el lector es e1.8 y la recarga tiene sus archivos aparte del estado normal', () => {
  assert.match(LECTOR, /^\$VERSION = 'e1\.9'$/m)
  assert.ok(LECTOR.includes("$archivoRecarga = Join-Path $dir 'RECARGA'"))
  assert.ok(LECTOR.includes("$archivoRecargaEstado = Join-Path $dir 'recarga.json'"))
  // Los envíos de la recarga avanzan SU ancla, en recarga.json; estado.json no se toca.
  assert.ok(LECTOR.includes('      Guarda-Estado $est $archivoEst\n'))
  assert.ok(!/^\s*Guarda-Estado \$estado\s*$/m.test(LECTOR), 'queda un Guarda-Estado del estado normal sin archivo')
  assert.ok(LECTOR.includes('if ($rec) { $est = $rec.estado; $archivoEst = $archivoRecargaEstado }'))
})

test('el latido cabe en el contrato: ≤ 24 claves (e1.7) y la función acepta el de la recarga', () => {
  const m = /\n {2}\$estC = @\{ (.*) \}\n/.exec(LECTOR)
  assert.ok(m, 'no está $estC')
  const claves = m[1].split('; ').map((p) => p.split(' = ')[0])
  assert.ok(claves.includes('recarga'))
  assert.ok(claves.length <= espejo.MAX_CLAVES_ESTADO, `latido con ${claves.length} claves`)
  const estado = Object.fromEntries(claves.map((k) => [k, 'x']))
  estado.recarga = 'terminada 34145 2026-11-17 00:00:01 a 2026-11-18 23:59:58'
  estado.rango = ['2026-11-17 00:00:00', '2026-11-19 00:00:00']
  const r = espejo.validarCuerpo({ v: 1, equipo: 'PC', informe: 'pieza', leidoEn: '2026-11-21T14:05:00-03:00', filas: [], estado })
  assert.deepStrictEqual(r.ok, true, r.error)
  // El latido inicial también lleva la clave.
  assert.ok(LECTOR.includes("vivo = ''; recarga = ''; pantalla = "))
})

test('Texto-Recarga: avance, espera por «Limitar», cierre y nada', { skip: !PS && 'sin PowerShell' }, () => {
  const guion = funcion('Texto-Recarga') + [
    "$r = @{ enviadas = 4000 }",
    "Texto-Recarga $r '' 4200 34145 ''",
    "Texto-Recarga $r '' 0 0 'recarga-con-limite'",
    "Texto-Recarga $null 'terminada 34145 2026-11-17 00:00:01 a 2026-11-18 23:59:58' 0 9 ''",
    "'[' + (Texto-Recarga $null '' 0 0 '') + ']'",
  ].join('\n') + '\n'
  assert.deepStrictEqual(correr(guion), [
    'leyendo 4200/34145 4000',
    'con-limite',
    'terminada 34145 2026-11-17 00:00:01 a 2026-11-18 23:59:58',
    '[]',
  ])
})

test('Ajusta-Rango en recarga desmarca «Limitar» y NO escribe las fechas', { skip: !PS && 'sin PowerShell' }, () => {
  const stubs = [
    'function Log([string]$m) { }',
    'function Ventana-Raiz($el) { return 1 }',
    "function Controles-Rango($v) { return @{ error = ''; casilla = @{ el = 1 }; desde = @{ val = 'a' }; hasta = @{ val = 'b' } } }",
    "function Estado-Casilla($el) { return 'Off' }",
    "function Rango-Deseado($e) { return @{ desde = 'x'; hasta = 'y' } }",
    'function Mueve-Fechas($c, $q) { $script:movi = $script:movi + 1; return $true }',
  ].join('\n') + '\n'
  const guion = funcion('Ajusta-Rango') + funcion('Texto-Ajuste') + stubs + [
    '$script:movi = 0; $script:fechasApagadas = $false; $script:motivoFechas = \'\'',
    '$aj = Ajusta-Rango 1 @{} $true',
    "'recarga movi=' + $script:movi + ' aj=' + [bool]$aj",
    '$aj = Ajusta-Rango 1 @{}',
    "'normal movi=' + $script:movi + ' aj=' + [bool]$aj",
  ].join('\n') + '\n'
  assert.deepStrictEqual(correr(guion), ['recarga movi=0 aj=False', 'normal movi=1 aj=True'])
})

test('Lee-Tabla en recarga lee desde la fila 0, sin el corte de 16 h, con los #n por segundo', { skip: !PS && 'sin PowerShell' }, () => {
  // Tres filas de hace días (dos idénticas en el mismo segundo) y la tabla simulada.
  const filas = [
    ['2026-11-18', '06:00:00', '4,10 kg', '1', '720.260.747', '9', 'Premium', 'FRESCO', '8 - 10 LB', 'HG', 'A'],
    ['2026-11-18', '06:00:00', '4,10 kg', '1', '720.260.747', '9', 'Premium', 'FRESCO', '8 - 10 LB', 'HG', 'A'],
    ['2026-11-18', '06:00:01', '0,90 kg', '1', '720.260.747', '0', 'Industrial', 'FRESCO', '0 - 2 lb', 'HG', 'A'],
  ]
  const tabla = '$script:T = @(' + filas.map((f) => '@(' + f.map((c) => `'${c}'`).join(',') + ')').join(',') + ')\n'
  const stubs = 'function Celda($gp, [int]$r, [int]$c) { return $script:T[$r][$c] }\n'
  const guion = funcion('Fila-Celdas') + funcion('Nuevo-Diccionario') + funcion('Desde-Corte') + funcion('Lee-Tabla') + stubs + tabla + [
    '$LOTE_MAX = 2000; $script:topeTramoSeg = 90; $script:horasAtras = 16',
    '$gp = [pscustomobject]@{ Current = [pscustomobject]@{ RowCount = 3 } }',
    "$est = @{ ancla = $null; piezas = 0; primera = ''; ultima = ''; sec = ''; conteos = @() }",
    '$reloj = [Diagnostics.Stopwatch]::StartNew()',
    '$n = Lee-Tabla $gp 3 $est $reloj',
    "'normal=' + $n.items.Count",
    '$r = Lee-Tabla $gp 3 $est $reloj $true',
    "'recarga=' + $r.items.Count + ' ords=' + (($r.items | ForEach-Object { $_.ord }) -join ',') + ' gate0=' + $r.gate0 + ' parcial=' + $r.parcial",
  ].join('\n') + '\n'
  assert.deepStrictEqual(correr(guion), ['normal=0', 'recarga=3 ords=0,1,0 gate0=1 parcial=False'])
})

test('el bucle: recarga sin fechas, sin actualización a medias, con re-anclaje al volver y cancelación', () => {
  // Ciclo recibe el modo y lo pasa a Ajusta-Rango (solo casilla) y a Lee-Tabla (sin corte).
  assert.ok(LECTOR.includes('$aj = Ajusta-Rango $foto.el $estado $recarga'))
  assert.ok(LECTOR.includes('$lec = Lee-Tabla $foto.gp $n $estado $reloj $recarga'))
  // Con «Limitar» marcada no lee (un día cortado en 10 000 filas se vería completo).
  assert.ok(LECTOR.includes("if ($recarga -and $foto.limite) { $res.error = 'recarga-con-limite'; return $res }"))
  // Re-anclaje por contenido también sin $aj (al volver de una recarga).
  assert.ok(LECTOR.includes('if ($aj -or $reanclar -or $cambioPer) {'))
  // No baja una versión nueva durante la recarga.
  assert.ok(LECTOR.includes('-or $script:recarga) { } else {\n    $ra = Revisa-Actualizacion'))
  // Al terminar borra la orden y su estado, y vuelve al modo normal con re-anclaje.
  assert.ok(LECTOR.includes('Remove-Item -LiteralPath $archivoRecarga -Force -ErrorAction Stop'))
  assert.ok(LECTOR.includes('$script:recargaHecha = [string]$rec.marca'))
  // Borrar RECARGA a medias la cancela.
  assert.ok(LECTOR.includes("$script:recargaCierre = 'cancelada ' + [int]$script:recarga.enviadas"))
  // En recarga el latido va «parcial» y con las piezas del modo normal.
  assert.ok(LECTOR.includes('$latPiezas = $estado.piezas; $latPrimera = $estado.primera; $latUltima = $estado.ultima; $latParcial = $true'))
})
