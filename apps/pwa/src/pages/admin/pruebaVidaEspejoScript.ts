/**
 * Prueba de vida del espejo del grader que se copia desde Diagnóstico Matrix: mide, sin tocar Matrix, si la tabla crece sola, si Pieza pieza trae la Gate 0 y si el PC llega a la app.
 * Fuente: _HERRAMIENTAS/matrix-diagnostico/prueba-vida-espejo.ps1 (copiado TAL CUAL).
 * Si el .ps1 cambia, regenerar este archivo con generar-ts.mjs; no editarlo a mano.
 */
export const PRUEBA_VIDA_ESPEJO_PS1 = `# Prueba de vida del espejo del grader (Matrix, Marelec). SOLO LECTURA: no pulsa, no escribe ni cambia nada en Matrix.
# Responde, antes de dejar un lector corriendo: ¿la tabla crece sola?, ¿qué guarda el límite de 10 000?,
# ¿«Pieza pieza Grader» trae las piezas de la Gate 0?, ¿PowerShell puede correr oculto? y ¿este PC llega a la app?
# Uso: Matrix abierto con «Pieza pieza Grader» en pantalla y el rango hasta mañana. Pegar TODO en PowerShell y Enter.
# Tarda unos 6 minutos y termina sola. No correr con la pantalla de Administración abierta (muestra la licencia).
# Deja en el Escritorio: vida-espejo-HHmmss.txt
& {  # todo en un bloque: al pegarlo corre de una vez y la pantalla queda limpia
if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') {
  Write-Host ("PowerShell en modo restringido ({0}): la prueba no puede correr. Saca foto de este mensaje." -f $ExecutionContext.SessionState.LanguageMode) -ForegroundColor Yellow
  return
}
$filtro = if ($env:VIDA_FILTRO) { $env:VIDA_FILTRO } else { 'matrix|marelec' }
$espera = if ($env:VIDA_ESPERA) { [int]$env:VIDA_ESPERA } else { 300 }
$L = New-Object System.Collections.Generic.List[string]
function T([string]$s) { $L.Add(''); $L.Add($s) }
function F([string]$s) {
  $ancho = 96
  while ($s.Length -gt $ancho) {
    $corte = $s.LastIndexOf(' ', $ancho); if ($corte -lt 20) { $corte = $ancho }
    $L.Add('  ' + $s.Substring(0, $corte)); $s = '      ' + $s.Substring($corte).TrimStart()
  }
  $L.Add('  ' + $s)
}
function Recorta([string]$s, [int]$n) {
  if (-not $s) { return '' }
  $s = ($s -replace '\\s+', ' ').Trim()
  if ($s.Length -gt $n) { $s.Substring(0, $n) + '~' } else { $s }
}
$V = @{}   # respuestas para el veredicto

T '1. EQUIPO Y POWERSHELL'
F ("Fecha: {0:dd-MM-yyyy HH:mm:ss}  Equipo: {1}  Usuario: {2}" -f (Get-Date), $env:COMPUTERNAME, $env:USERNAME)
$pol = @(Get-ExecutionPolicy -List)
F ('Política de scripts: ' + (($pol | ForEach-Object { '{0}={1}' -f $_.Scope, $_.ExecutionPolicy }) -join ', '))
$gpo = @($pol | Where-Object { $_.Scope -match 'Policy$' -and [string]$_.ExecutionPolicy -ne 'Undefined' })
$V.gpo = ($gpo.Count -gt 0)
if ($V.gpo) { F 'La política viene impuesta por la empresa (GPO): el lector oculto no podrá saltarla.' }
else { F 'La política no viene impuesta por la empresa: un lector oculto puede correr sin administrador.' }

T '2. RED (¿llega este PC a la app?)'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
function Probar([string]$nombre, [string]$url) {
  $r = [Diagnostics.Stopwatch]::StartNew()
  try {
    $resp = Invoke-WebRequest -Uri $url -Method Get -UseBasicParsing -TimeoutSec 15
    $code = [int]$resp.StatusCode
  } catch {
    $code = $null
    $we = $_.Exception
    if ($we.Response) { try { $code = [int]$we.Response.StatusCode } catch { $code = -1 } }
    if ($null -eq $code) { F ("{0}: NO llega ({1})" -f $nombre, (Recorta $we.Message 70)); return $false }
  }
  F ("{0}: llega (respuesta {1} en {2:N1} s)" -f $nombre, $code, $r.Elapsed.TotalSeconds)
  return $true
}
$V.redFirestore = Probar 'Base de datos (firestore.googleapis.com)' 'https://firestore.googleapis.com/'
$V.redFunciones = Probar 'Funciones (cloudfunctions.net)' 'https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/espejoPrueba'
$V.redRun = Probar 'Funciones nuevas (run.app)' 'https://espejo-prueba-uc.a.run.app/'

$uia = $true
try { Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop; Add-Type -AssemblyName UIAutomationTypes -ErrorAction Stop }
catch { $uia = $false }
$AE = [System.Windows.Automation.AutomationElement]
$W = $null
$st = @{ vistos = 0; licencia = $false }

# Busca grillas, casillas y campos de fecha sin entrar en las grillas (tienen miles de celdas).
function Busca($e, [int]$nivel, $acc, $reloj) {
  if ($st.vistos -ge 4000 -or $nivel -gt 16 -or $reloj.Elapsed.TotalSeconds -gt 20) { return }
  $st.vistos++
  try {
    $nom = [string]$e.Current.Name
    if ($nom -match '(?i)licen|hardware') { $st.licencia = $true }
    if ([bool]$e.GetCurrentPropertyValue($AE::IsGridPatternAvailableProperty)) { $acc.grillas.Add($e); return }
    $tipo = $e.Current.ControlType.ProgrammaticName
    if ($tipo -eq 'ControlType.CheckBox') {
      $estado = '?'
      try { $estado = [string]$e.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Current.ToggleState } catch {}
      $acc.casillas.Add(('{0} = {1}' -f (Recorta $nom 50), $estado))
    } elseif ([bool]$e.GetCurrentPropertyValue($AE::IsValuePatternAvailableProperty)) {
      $val = ''
      try { $val = [string]$e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {}
      if ($val -match '^\\s*\\d{1,4}[-/.]\\d{1,2}[-/.]\\d{1,4}') { $acc.fechas.Add((Recorta $val 30)) }
    }
  } catch { return }
  $h = $null; try { $h = $W.GetFirstChild($e) } catch {}
  $k = 0
  while ($h -and $k -lt 200) {
    Busca $h ($nivel + 1) $acc $reloj; $k++
    try { $h = $W.GetNextSibling($h) } catch { $h = $null }
  }
}

function Celda($gp, [int]$r, [int]$c) {
  try {
    $it = $gp.GetItem($r, $c)
    if (-not $it) { return $null }
    $t = [string]$it.Current.Name
    if (-not $t) { try { $t = [string]$it.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {} }
    return $t
  } catch { return $null }
}

# Columnas exactas de cada informe: si la tabla no calza con ninguno, no se toca.
$INFORMES = @{
  'Pieza pieza Grader' = @('Fecha', 'Hora', 'Peso de las piezas', 'Cantidad de piezas', 'Lote', 'Gate', 'Calidad', 'Conservacion', 'Calibre', 'Producto', 'Turno')
  'Puerta 0' = @('Especie', 'Lote', 'Fecha', 'Hora', 'Turno', 'Gate', 'Cantidad de piezas', 'Calidad', 'Peso de las piezas', 'Error', 'peso en Gr')
}

# Una foto de la tabla más grande: informe, filas, columnas y la primera y última fila con datos.
function Foto {
  $acc = @{ grillas = (New-Object System.Collections.Generic.List[object]); casillas = (New-Object System.Collections.Generic.List[string]); fechas = (New-Object System.Collections.Generic.List[string]) }
  $reloj = [Diagnostics.Stopwatch]::StartNew()
  $raiz = $AE::RootElement
  foreach ($p in @(Get-Process | Where-Object { $_.ProcessName -match $filtro })) {
    $cond = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, $p.Id)
    $vents = $null; try { $vents = $raiz.FindAll([System.Windows.Automation.TreeScope]::Children, $cond) } catch {}
    if ($vents) { foreach ($v in $vents) { Busca $v 0 $acc $reloj } }
  }
  $mejor = $null
  foreach ($g in $acc.grillas) {
    try {
      $gp = $g.GetCurrentPattern([System.Windows.Automation.GridPattern]::Pattern)
      $n = [int]$gp.Current.RowCount
      if (-not $mejor -or $n -gt $mejor.Filas) { $mejor = @{ El = $g; Gp = $gp; Filas = $n; Cols = [int]$gp.Current.ColumnCount } }
    } catch {}
  }
  $f = @{ casillas = $acc.casillas; fechas = $acc.fechas; tabla = $mejor; informe = $null; enc = @() }
  if (-not $mejor) { return $f }
  try {
    $tp = $mejor.El.GetCurrentPattern([System.Windows.Automation.TablePattern]::Pattern)
    $f.enc = @($tp.Current.GetColumnHeaders() | ForEach-Object { ([string]$_.Current.Name).Trim() })
  } catch {}
  foreach ($k in $INFORMES.Keys) {
    $esp = $INFORMES[$k]
    if ($f.enc.Count -eq $esp.Count) {
      $ok = $true
      for ($i = 0; $i -lt $esp.Count; $i++) { if ($f.enc[$i] -ne $esp[$i]) { $ok = $false; break } }
      if ($ok) { $f.informe = $k }
    }
  }
  if (-not $f.informe) { return $f }
  $cF = [array]::IndexOf($f.enc, 'Fecha'); $cH = [array]::IndexOf($f.enc, 'Hora')
  $ult = $mejor.Filas - 1
  # La fila «Total» de Puerta 0 no es una pieza.
  if ($ult -ge 0 -and ((Celda $mejor.Gp $ult 0) -match '^\\s*Total')) { $ult-- }
  $f.datos = $ult + 1
  if ($ult -ge 0) {
    $f.primera = '{0} {1}' -f (Celda $mejor.Gp 0 $cF), (Celda $mejor.Gp 0 $cH)
    $f.ultima = '{0} {1}' -f (Celda $mejor.Gp $ult $cF), (Celda $mejor.Gp $ult $cH)
  }
  return $f
}

T '3. MATRIX AHORA'
$f1 = $null
if (-not $uia) { F 'Este PowerShell no pudo cargar UI Automation.' }
elseif (-not (Get-Process | Where-Object { $_.ProcessName -match $filtro })) { F 'Matrix no está abierto: ábrelo con «Pieza pieza Grader» en pantalla y vuelve a pegar.' }
else {
  $W = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $f1 = Foto
  if (-not $f1.tabla) { F 'No se encontró ninguna tabla. ¿Está el informe cargado en pantalla?' }
  elseif (-not $f1.informe) {
    F ('La tabla en pantalla no es «Pieza pieza Grader» ni «Puerta 0» (columnas: ' + ((($f1.enc | ForEach-Object { Recorta $_ 14 }) -join ' | ')) + '). No se lee.')
    $f1 = $null
  } else {
    F ("Informe: {0}. Filas con datos: {1}. Primera: {2}. Última: {3}." -f $f1.informe, $f1.datos, $f1.primera, $f1.ultima)
    if ($f1.fechas.Count) { F ('Campos de fecha: ' + ($f1.fechas -join ' | ')) }
    foreach ($c in $f1.casillas) { F ('Casilla: ' + $c) }
    $lim = @($f1.casillas | Where-Object { $_ -match '(?i)limit' })
    $V.limite = ($lim.Count -gt 0 -and ($lim[0] -match '= On$'))
    if ($V.limite -and $f1.datos -ge 9999) {
      F ('Con el límite marcado y la tabla llena: Matrix guarda desde ' + $f1.primera + ' hasta ' + $f1.ultima + '. Compáralo con el rango de fechas: si parte en el inicio del rango, guarda las PRIMERAS 10 000.')
    }
  }
}

if ($f1 -and $f1.informe -eq 'Pieza pieza Grader') {
  T '4. ¿TRAE «PIEZA PIEZA GRADER» LAS PIEZAS DE LA GATE 0?'
  $cG = [array]::IndexOf($f1.enc, 'Gate')
  $reloj = [Diagnostics.Stopwatch]::StartNew()
  $g0 = 0; $r = 0
  while ($r -lt $f1.datos -and $reloj.Elapsed.TotalSeconds -lt 90) {
    if (((Celda $f1.tabla.Gp $r $cG) -replace '\\s', '') -eq '0') { $g0++ }
    $r++
  }
  $V.gate0 = $g0
  F ("Revisadas {0} de {1} filas en {2:N0} s: {3} piezas con Gate 0." -f $r, $f1.datos, $reloj.Elapsed.TotalSeconds, $g0)
}

if ($f1) {
  T ('5. ¿CRECE LA TABLA SOLA? (espera de {0} min, sin tocar nada)' -f [math]::Round($espera / 60, 1))
  $fin = (Get-Date).AddSeconds($espera)
  while ((Get-Date) -lt $fin) {
    $quedan = [int]($fin - (Get-Date)).TotalSeconds
    Write-Progress -Activity 'Prueba de vida del espejo: esperando sin tocar Matrix' -Status ("Quedan {0} s" -f $quedan) -PercentComplete ([math]::Min(100, 100 * ($espera - $quedan) / [math]::Max($espera, 1)))
    Start-Sleep -Seconds ([math]::Min(10, [math]::Max(1, $quedan)))
  }
  Write-Progress -Activity 'Prueba de vida del espejo' -Completed
  $f2 = Foto
  if (-not $f2.informe) { F 'Después de la espera la tabla ya no es la misma (¿cambiaron el informe o se cerró Matrix?).' }
  else {
    $V.crece = ($f2.datos -gt $f1.datos) -or ($f2.ultima -ne $f1.ultima)
    F ("Antes: {0} filas, última {1}. Después: {2} filas, última {3}." -f $f1.datos, $f1.ultima, $f2.datos, $f2.ultima)
    $V.mismoInforme = ($f2.informe -eq $f1.informe)
  }
}

T '6. VEREDICTO'
if (-not $f1) { F 'Sin dato de Matrix: revisa el punto 3 y repite.' }
else {
  if ($V.crece) { F 'La tabla CRECE SOLA: el lector no necesita pulsar «Actualizar».' }
  elseif ($null -ne $V.crece) { F 'La tabla NO creció en la espera: el lector tendrá que pulsar «Actualizar» (o la línea estaba detenida; repite con la línea andando).' }
  if ($null -ne $V.gate0) {
    if ($V.gate0 -gt 0) { F '«Pieza pieza Grader» TRAE las piezas de la Gate 0: P0 % sale de ese informe; Puerta 0 solo agrega el motivo.' }
    else { F '«Pieza pieza Grader» NO trae piezas de la Gate 0: hacen falta los dos informes para el P0 %.' }
  }
}
if ($V.redFunciones -or $V.redRun) { F 'Este PC llega a las funciones de la app: sirve la vía con llave.' }
elseif ($V.redFirestore) { F 'Este PC llega a la base pero no a las funciones: hay que usar la vía de respaldo (directo a la base).' }
else { F 'Este PC no llega a la app por internet: el espejo no puede enviar desde aquí.' }
if ($V.gpo) { F 'Ojo: la política de scripts la impone la empresa; el lector oculto necesitará otra forma de arranque.' }
if ($st.licencia) { F 'OJO: hay texto de licencia en pantalla. Revisa el archivo antes de enviarlo.' }

$out = Join-Path ([Environment]::GetFolderPath('Desktop')) ('vida-espejo-{0:HHmmss}.txt' -f (Get-Date))
if ($env:VIDA_SALIDA) { $out = $env:VIDA_SALIDA }
@($L) | Out-File -FilePath $out -Encoding utf8
if (-not $env:VIDA_SALIDA) { Clear-Host }
Write-Host 'PRUEBA DE VIDA DEL ESPEJO DEL GRADER  (solo lectura)' -ForegroundColor Yellow
foreach ($linea in $L) { if ($linea -match '^\\d\\. ') { Write-Host $linea -ForegroundColor Cyan } else { Write-Host $linea } }
Write-Host ''
Write-Host "Guardado en: $out" -ForegroundColor Yellow
}
`
