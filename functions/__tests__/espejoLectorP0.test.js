/**
 * Lector e1.10 · informe «Puerta 0»: prueba en PowerShell las funciones del `espejo/lector-espejo.ps1` que sirve la
 * función (bloque puro + Paso-P0 con la UI Automation y el envío simulados) y que lo que manda calza con el contrato de
 * `espejoGrader.js` y con lo que compara el monitor. La prueba contra una ventana Qt real (pestaña, botón y menú) está en
 * `_HERRAMIENTAS/matrix-diagnostico/pruebas-espejo/probar-p0.ps1`. Sin PowerShell, los casos de PS se saltan.
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
  const i = LECTOR.indexOf(`\nfunction ${nombre}(`) >= 0 ? LECTOR.indexOf(`\nfunction ${nombre}(`) : LECTOR.indexOf(`\nfunction ${nombre} {`)
  assert.ok(i >= 0, `no está la función ${nombre}`)
  const f = LECTOR.indexOf('\n}\n', i)
  return LECTOR.slice(i + 1, f + 2)
}

function bloquePuro() {
  const i = LECTOR.indexOf('# ---- e1.10: Puerta 0 (puro) ----')
  const f = LECTOR.indexOf('# ---- e1.10: Puerta 0 (UI Automation) ----')
  assert.ok(i > 0 && f > i, 'no está el bloque puro de Puerta 0')
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

const VERSION = /\n\$VERSION = '([^']+)'\n/.exec(LECTOR)[1]

// Archivos en una carpeta temporal, Log en memoria y el envío simulado (cada envío queda en $script:envios).
const PRELUDIO = `
$ErrorActionPreference = 'Stop'
$UTF8 = New-Object System.Text.UTF8Encoding($false)
$VERSION = '${VERSION}'
$LOTE_MAX = 2000
$dir = '@@DIR@@'
$archivoAlternar = Join-Path $dir 'ALTERNAR'
$archivoAlternarBloq = Join-Path $dir 'alternar-bloqueado.txt'
$archivoP0 = Join-Path $dir 'p0.json'
$script:logs = New-Object System.Collections.Generic.List[string]
function Log([string]$m) { $script:logs.Add($m) }
$script:envios = New-Object System.Collections.Generic.List[object]
$script:respuesta = 'ok'
function Envia($filas, $estC, [string]$informe = 'pieza') { $script:envios.Add(@{ filas = [string[]]@($filas); est = $estC; informe = $informe }); return $script:respuesta }
$script:vivoFin = $null
$script:p0Pedido = ''
$script:p0Pendiente = $null
$script:topeP0Seg = 240
`

function correr(guion, extra = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'espejo-p0-'))
  const archivo = path.join(dir, 'casos.ps1')
  const codigo = [PRELUDIO, funcion('Nuevo-Diccionario'), funcion('Normaliza-Texto'), funcion('Texto-Vivo'), bloquePuro(),
    funcion('Envia-P0'), funcion('Paso-P0'), extra, guion].join('\n')
  fs.writeFileSync(archivo, BOM + codigo.split('@@DIR@@').join(dir).split(LF).join(CR + LF), 'utf8')
  let r
  try {
    r = spawnSync(PS, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', archivo], { encoding: 'utf8' })
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  assert.strictEqual(r.status, 0, r.stderr + r.stdout)
  return r.stdout.replace(/\r/g, '').trim().split('\n')
}

test('la versión del lector es e1.10 (la que el monitor reconoce como «con Puerta 0»)', () => {
  assert.strictEqual(VERSION, 'e1.10')
  const ts = fs.readFileSync(path.join(__dirname, '..', '..', 'apps', 'pwa', 'src', 'services', 'grader', 'espejo', 'espejoP0.ts'), 'utf8')
  assert.ok(ts.includes(`VERSION_CON_P0 = '${VERSION}'`))
})

test('el encabezado de «Puerta 0» del lector es el que el monitor documenta (Fecha y Hora en 2 y 3)', () => {
  const m = /'Puerta 0' = @\(([^)]*)\)/.exec(LECTOR)
  assert.ok(m, 'no está la lista blanca de Puerta 0')
  const cols = m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''))
  assert.deepStrictEqual(cols, ['Especie', 'Lote', 'Fecha', 'Hora', 'Turno', 'Gate', 'Cantidad de piezas', 'Calidad', 'Peso de las piezas', 'Error', 'peso en Gr'])
  assert.deepStrictEqual(espejo.INDICES ? espejo.INDICES.p0 : { fecha: 2, hora: 3 }, { fecha: 2, hora: 3 })
})

test('p0Pedido se toma tal cual del texto crudo (el monitor lo compara letra por letra)', { skip: !PS }, () => {
  const iso = espejo.pedidoP0Vigente(Date.parse('2026-11-23T21:52:41.080Z'), Date.parse('2026-11-23T22:00:00Z')).p0Pedido
  const salida = correr([
    `Iso-Pedido '${JSON.stringify({ ok: true, guardadas: 0, p0Pedido: iso })}'`,
    `Iso-Pedido '{"ok":true}'`,
    `Iso-Pedido '{"p0Pedido":"ayer"}'`,
    `Iso-Pedido ''`,
  ].join('\n'))
  assert.deepStrictEqual(salida, [iso])
})

test('cierre de turno entre +10 y +55 min de 07:00 y 19:00; motivo: pedido nuevo > cierre > hora', { skip: !PS }, () => {
  const salida = correr([
    "'[' + (Clave-Cierre ([datetime]'2026-11-23 07:09:59')) + ']'",
    "'[' + (Clave-Cierre ([datetime]'2026-11-23 07:10:00')) + ']'",
    "'[' + (Clave-Cierre ([datetime]'2026-11-23 19:54:00')) + ']'",
    "'[' + (Clave-Cierre ([datetime]'2026-11-23 19:55:00')) + ']'",
    "$st = @{ hora = ''; cierre = ''; pedido = '' }",
    "'[' + (Motivo-P0 ([datetime]'2026-11-23 12:00:00') $st '') + ']'",
    "$st.hora = '2026-11-23 11:30:00'; '[' + (Motivo-P0 ([datetime]'2026-11-23 12:00:00') $st '') + ']'",
    "'[' + (Motivo-P0 ([datetime]'2026-11-23 12:29:00') $st '') + ']'",
    "'[' + (Motivo-P0 ([datetime]'2026-11-23 12:30:00') $st '') + ']'",
    "'[' + (Motivo-P0 ([datetime]'2026-11-23 12:00:00') $st '2026-11-23T14:59:00.000Z') + ']'",
    "$st.pedido = '2026-11-23T14:59:00.000Z'; '[' + (Motivo-P0 ([datetime]'2026-11-23 12:00:00') $st '2026-11-23T14:59:00.000Z') + ']'",
    "$st.hora = '2026-11-23 19:05:00'; '[' + (Motivo-P0 ([datetime]'2026-11-23 19:20:00') $st '') + ']'",
    "$st.cierre = '2026-11-23 19'; '[' + (Motivo-P0 ([datetime]'2026-11-23 19:20:00') $st '') + ']'",
    // Reloj movido hacia atrás: el último intento «en el futuro» no frena para siempre.
    "$st.hora = '2026-11-24 10:00:00'; '[' + (Motivo-P0 ([datetime]'2026-11-23 20:00:00') $st '') + ']'",
  ].join('\n'))
  assert.deepStrictEqual(salida, ['[]', '[2026-11-23 07]', '[2026-11-23 19]', '[]', '[hora]', '[]', '[]', '[hora]', '[pedido]', '[]', '[cierre]', '[]', '[hora]'])
})

test('filas de Puerta 0: #n por fila completa en toda la tabla (sin suponer orden), sin filas que tumben el lote', { skip: !PS }, () => {
  const fila = (f, h, err = "'Fuera de limites'") => `@('Salar','720.1','${f}','${h}','A','0','1','Premium','4,32 kg',${err},'4320')`
  const salida = correr([
    '$c = @(' + [
      fila('2026-11-23', '10:00:05'),
      fila('2026-11-23', '09:59:01'),
      fila('2026-11-23', '10:00:05'),
      "@('Total','','','','','','','','','','')",
      fila('2026-11-23', '10:00:05', "('No' + [char]9 + 'leido')"),
      fila('2026-11-23', '10:00:05'),
      fila('23-11-2026', '10:00:05'),
    ].join(',') + ')',
    '$r = Filas-P0 $c',
    '$r.filas | ForEach-Object { $_ }',
    "'primera=' + $r.primera + ' ultima=' + $r.ultima + ' malas=' + $r.malas",
  ].join('\n'))
  const filas = salida.slice(0, -1)
  assert.strictEqual(filas.length, 5)
  assert.deepStrictEqual(filas.map((f) => f.split('\t')[11]), ['#0', '#0', '#1', '#0', '#2'])
  assert.strictEqual(filas[3].split('\t')[9], 'No leido')
  assert.strictEqual(salida.at(-1), 'primera=2026-11-23 09:59:01 ultima=2026-11-23 10:00:05 malas=2')
  // Lo que se envía pasa la validación de la función y el estado p0 cabe en el contrato.
  const cuerpo = { v: 1, equipo: 'PRUEBA', informe: 'p0', leidoEn: '2026-11-23T10:05:00-03:00', filas, estado: { resultado: 'leido', filas: 5, primera: '2026-11-23 09:59:01', ultima: '2026-11-23 10:00:05', motivo: 'hora', pedido: '', via: 'pestana', volvio: true, cambio: '', version: VERSION } }
  assert.strictEqual(espejo.validarCuerpo(cuerpo).ok, true, JSON.stringify(espejo.validarCuerpo(cuerpo)))
})

test('selector: exactamente un «Puerta 0» y un «Pieza pieza Grader» en la misma vía; si no, varios > sin-vuelta > sin-selector', { skip: !PS }, () => {
  const c = (via, nombre) => `@{ via = '${via}'; nombre = '${nombre}' }`
  const vias = "[string[]]@('pestana','boton','menu')"
  const caso = (lista, v = vias) => `$s = Selector-Via @(${lista.join(',')}) (${v}); $s.resultado + '|' + $s.via`
  const salida = correr([
    caso([c('pestana', 'Puerta 0'), c('pestana', 'Pieza pieza Grader')]),
    caso([c('boton', 'PUERTA  0 '), c('boton', 'Pieza a pieza Grader'), c('menu', 'Puerta 0')]),
    // Nombre que solo contiene «Puerta 0» no vale (podría hacer otra cosa).
    caso([c('boton', 'Exportar Puerta 0'), c('boton', 'Pieza pieza Grader')]),
    caso([c('pestana', 'Puerta 0'), c('boton', 'Pieza pieza Grader')]),
    caso([c('pestana', 'Puerta 0'), c('pestana', 'Puerta 0'), c('pestana', 'Pieza pieza Grader'), c('boton', 'Puerta 0')]),
    caso([]),
    // ALTERNAR con «menu»: solo esa vía.
    caso([c('pestana', 'Puerta 0'), c('pestana', 'Pieza pieza Grader')], "[string[]]@('menu')"),
  ].join('\n'))
  assert.deepStrictEqual(salida, ['|pestana', '|boton', 'sin-selector|', 'sin-vuelta|', 'varios|', 'sin-selector|', 'sin-selector|'])
})

test('ALTERNAR: apagado sin archivo; con texto restringe la vía; el bloqueo vale solo para esa marca de ALTERNAR', { skip: !PS }, () => {
  const salida = correr([
    '$a = Alternar-Config; "$($a.on) $($a.vias -join \',\') $($a.bloqueado)"',
    "[IO.File]::WriteAllText($archivoAlternar, '')",
    '$a = Alternar-Config; "$($a.on) $($a.vias -join \',\') $($a.bloqueado)"',
    "[IO.File]::WriteAllText($archivoAlternar, 'Pestaña')",
    '$a = Alternar-Config; "$($a.on) $($a.vias -join \',\') $($a.bloqueado)"',
    "[IO.File]::WriteAllText($archivoAlternar, 'lista')",
    '$a = Alternar-Config; "$($a.on) [$($a.vias -join \',\')] $($a.bloqueado)"',
    "Bloquea-Alternar $a.marca 'no-volvio'",
    '$a = Alternar-Config; "bloqueado=$($a.bloqueado)"',
    "(Get-Item $archivoAlternar).LastWriteTimeUtc = (Get-Date).ToUniversalTime().AddMinutes(1)",
    '$a = Alternar-Config; "bloqueado=$($a.bloqueado)"',
  ].join('\n'))
  assert.deepStrictEqual(salida, ['False pestana,boton,menu False', 'True pestana,boton,menu False', 'True pestana False', 'True [] False', 'bloqueado=True', 'bloqueado=False'])
})

test('texto de cambio al volver: rango o casilla distintos, vacío si quedaron igual', { skip: !PS }, () => {
  const salida = correr([
    "'[' + (Texto-Cambio @{ rango = @('2026-11-23 00:00:00','2026-11-24 00:00:00'); limite = $false } @{ rango = @('2026-11-23 00:00:00','2026-11-24 00:00:00'); limite = $false }) + ']'",
    "Texto-Cambio @{ rango = @('2026-11-23 00:00:00','2026-11-24 00:00:00'); limite = $false } @{ rango = @('2026-11-22 00:00:00','2026-11-24 00:00:00'); limite = $true }",
  ].join('\n'))
  assert.deepStrictEqual(salida, ['[]', 'rango 2026-11-23 00:00:00 a 2026-11-24 00:00:00 -> 2026-11-22 00:00:00 a 2026-11-24 00:00:00; limitar marcada'])
})

// Paso-P0 con la alternancia y la lectura simuladas.
const FALSOS = `
# La hora real no debe caer en la ventana de cierre (se prueba aparte).
function Clave-Cierre([datetime]$ahora) { return '' }
$script:alternas = 0
$script:resultadoFalso = 'leido'
function Alterna-P0($pieza, $cfg) {
  $script:alternas++
  $l = New-Object System.Collections.Generic.List[string]
  $l.Add("Salar\`t1\`t2026-11-23\`t10:00:05\`tA\`t0\`t1\`tPremium\`t4,32 kg\`tFuera de limites\`t4320\`t#0")
  return @{ resultado = $script:resultadoFalso; filas = $l; primera = '2026-11-23 10:00:05'; ultima = '2026-11-23 10:00:05'; via = 'pestana'; volvio = $true; cambio = '' }
}
function Filas-Estables($gp, [double]$tope) { return 2 }
function Lee-CeldasP0($gp, [int]$filas, [double]$tope) {
  return @{ parcial = $false; celdas = @(@('Salar','1','2026-11-23','10:00:05','A','0','1','Premium','4,32 kg','Fuera de limites','4320'), @('Salar','1','2026-11-23','10:00:06','A','0','1','Premium','4,10 kg','Fotocelula','4100')) }
}
$sano = @{ error = ''; el = 'grilla'; rango = @(); limite = $false; p0 = $null }
function Ultimo { if ($script:envios.Count -eq 0) { return 'sin envio' }; $e = $script:envios[$script:envios.Count - 1]; return ($e.informe + ' ' + $e.filas.Count + ' ' + $e.est.resultado + ' motivo=' + $e.est.motivo + ' pedido=' + $e.est.pedido) }
function P([bool]$ok = $true, $res = $sano) { $n0 = $script:envios.Count; $r = Paso-P0 $res $ok; return ('envios=' + ($script:envios.Count - $n0) + ' alternas=' + $script:alternas + ' | ' + (Ultimo)) }
`

test('ALTERNAR apagado: un pedido se contesta «apagado» una sola vez; sin pedido no hace nada', { skip: !PS }, () => {
  const salida = correr([
    'P',
    "$script:p0Pedido = '2026-11-23T14:59:00.000Z'; P",
    'P',
    "$script:p0Pedido = '2026-11-23T15:10:00.000Z'; P $false",
  ].join('\n'), FALSOS)
  assert.deepStrictEqual(salida, [
    'envios=0 alternas=0 | sin envio',
    'envios=1 alternas=0 | p0 0 apagado motivo=pedido pedido=2026-11-23T14:59:00.000Z',
    'envios=0 alternas=0 | p0 0 apagado motivo=pedido pedido=2026-11-23T14:59:00.000Z',
    'envios=1 alternas=0 | p0 0 apagado motivo=pedido pedido=2026-11-23T15:10:00.000Z',
  ])
})

test('ALTERNAR encendido: solo tras un ciclo sano; cada hora; un pedido pospuesto queda pendiente y no se da por atendido', { skip: !PS }, () => {
  const salida = correr([
    "[IO.File]::WriteAllText($archivoAlternar, '')",
    "$script:p0Pedido = '2026-11-23T14:59:00.000Z'",
    // Ciclo no sano: pospuesto, sin envío y sin marcar el pedido.
    'P $false',
    "[string](Lee-EstadoP0).pedido",
    'P',
    'P',
    // Sin pedido, ya alternó hace menos de una hora: nada.
    "$script:p0Pedido = ''; P",
    // Una hora después.
    "$st = Lee-EstadoP0; $st.hora = (Get-Date).AddMinutes(-61).ToString('yyyy-MM-dd HH:mm:ss'); Guarda-EstadoP0 $st; P",
    // En modo vivo, la hora no alterna; un pedido sí.
    "$st = Lee-EstadoP0; $st.hora = (Get-Date).AddMinutes(-61).ToString('yyyy-MM-dd HH:mm:ss'); Guarda-EstadoP0 $st; $script:vivoFin = (Get-Date).AddMinutes(10); P",
    "$script:p0Pedido = '2026-11-23T16:00:00.000Z'; P",
  ].join('\n'), FALSOS)
  assert.deepStrictEqual(salida, [
    'envios=0 alternas=0 | sin envio',
    '',
    'envios=1 alternas=1 | p0 1 leido motivo=pedido pedido=2026-11-23T14:59:00.000Z',
    'envios=0 alternas=1 | p0 1 leido motivo=pedido pedido=2026-11-23T14:59:00.000Z',
    'envios=0 alternas=1 | p0 1 leido motivo=pedido pedido=2026-11-23T14:59:00.000Z',
    'envios=1 alternas=2 | p0 1 leido motivo=hora pedido=',
    'envios=0 alternas=2 | p0 1 leido motivo=hora pedido=',
    'envios=1 alternas=3 | p0 1 leido motivo=pedido pedido=2026-11-23T16:00:00.000Z',
  ])
})

test('bloqueada tras «no-volvio»: no alterna más y un pedido se contesta «bloqueado»', { skip: !PS }, () => {
  const salida = correr([
    "[IO.File]::WriteAllText($archivoAlternar, '')",
    "$script:resultadoFalso = 'no-volvio'; P",
    "Bloquea-Alternar (Alternar-Config).marca 'no-volvio'",
    "$st = Lee-EstadoP0; $st.hora = '2026-01-01 00:00:00'; Guarda-EstadoP0 $st; P",
    "$script:p0Pedido = '2026-11-23T14:59:00.000Z'; P",
  ].join('\n'), FALSOS)
  assert.deepStrictEqual(salida, [
    'envios=1 alternas=1 | p0 1 no-volvio motivo=hora pedido=',
    'envios=0 alternas=1 | p0 1 no-volvio motivo=hora pedido=',
    'envios=1 alternas=1 | p0 0 bloqueado motivo=pedido pedido=2026-11-23T14:59:00.000Z',
  ])
})

test('pasiva: con «Puerta 0» a la vista lee sin alternar, solo si cambió, a los 30 min o a pedido', { skip: !PS }, () => {
  const salida = correr([
    "$p0 = @{ error = 'otro-informe'; p0 = @{ el = 'g'; gp = 'gp'; filas = 2 } }",
    'P $false $p0',
    'P $false $p0',
    "$p0.p0.filas = 3; P $false $p0",
    "$script:p0Pedido = '2026-11-23T14:59:00.000Z'; P $false $p0",
    'P $false $p0',
  ].join('\n'), FALSOS)
  assert.deepStrictEqual(salida, [
    'envios=1 alternas=0 | p0 2 pasiva motivo=pasiva pedido=',
    'envios=0 alternas=0 | p0 2 pasiva motivo=pasiva pedido=',
    'envios=1 alternas=0 | p0 2 pasiva motivo=pasiva pedido=',
    'envios=1 alternas=0 | p0 2 pasiva motivo=pedido pedido=2026-11-23T14:59:00.000Z',
    'envios=0 alternas=0 | p0 2 pasiva motivo=pedido pedido=2026-11-23T14:59:00.000Z',
  ])
})

test('un envío de Puerta 0 que falla por red se repite en el ciclo siguiente, sin volver a alternar; lotes de LOTE_MAX', { skip: !PS }, () => {
  const salida = correr([
    "[IO.File]::WriteAllText($archivoAlternar, '')",
    "$script:respuesta = 'reintento'; P",
    "$script:respuesta = 'ok'; P",
    "$script:p0Pendiente -eq $null",
    '$LOTE_MAX = 2; $script:envios.Clear(); [void](Envia-P0 ([string[]]@("a","b","c","d","e")) @{ resultado = "leido" }); ($script:envios | ForEach-Object { $_.filas.Count }) -join ","',
  ].join('\n'), FALSOS)
  assert.deepStrictEqual(salida, [
    'envios=1 alternas=1 | p0 1 leido motivo=hora pedido=',
    'envios=1 alternas=1 | p0 1 leido motivo=hora pedido=',
    'True',
    '2,2,1',
  ])
})

test('el latido de pieza no cambia: 24 claves, sin claves de Puerta 0', () => {
  const m = /\n {2}\$estC = @\{ (.*) \}\n/.exec(LECTOR)
  assert.ok(m, 'no está $estC')
  const claves = m[1].split('; ').map((p) => p.split(' = ')[0])
  assert.strictEqual(claves.length, espejo.MAX_CLAVES_ESTADO)
  assert.ok(!claves.some((k) => /p0/i.test(k)))
})

test('la alternancia vuelve en un finally y solo pulsa controles de nombre exacto (nunca lista, árbol ni combo)', () => {
  const alterna = funcion('Alterna-P0')
  assert.ok(/\} finally \{[\s\S]*Invoca-Informe \$ventana \$r\.via \$RE_INF_PIEZA/.test(alterna), 'la vuelta no está en el finally')
  assert.ok(!/\bEspera \$/.test(alterna), 'la alternancia no debe usar Espera (DETENER cortaría la vuelta)')
  const tipos = /\$TIPOS_VIA = @\{([^}]*)\}/.exec(LECTOR)[1]
  assert.ok(!/ListItem|TreeItem|ComboBox|DataItem/.test(tipos))
})
