/**
 * Lectura de solo lectura de la tabla de Matrix que se copia desde la página Diagnóstico Matrix: mide cuánto tarda leer el informe en pantalla sin Excel.
 * Fuente: _HERRAMIENTAS/matrix-diagnostico/lectura-tabla-matrix.ps1 (copiado TAL CUAL).
 * Si el .ps1 cambia, regenerar este archivo con generar-ts.mjs; no editarlo a mano.
 */
export const LECTURA_TABLA_MATRIX_PS1 = `# Lectura de la tabla de Matrix (Marelec). SOLO LECTURA: no pulsa, no escribe ni cambia nada en Matrix.
# Responde una pregunta: ¿cuánto tarda leer el informe que está en pantalla, sin pasar por Excel?
# Uso: abrir Matrix con el informe ya cargado («Pieza pieza Grader» o «Puerta 0»), abrir PowerShell, pegar TODO y Enter.
# Tarda como máximo 1 minuto. No correr con la pantalla de Administración abierta (muestra la licencia).
# Deja en el Escritorio: lectura-matrix-HHmmss.txt (resumen y una muestra de filas).
& {  # todo en un bloque: al pegarlo corre de una vez y la pantalla queda limpia
if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') {
  Write-Host ("PowerShell en modo restringido ({0}): la lectura no puede correr. Saca foto de este mensaje." -f $ExecutionContext.SessionState.LanguageMode) -ForegroundColor Yellow
  return
}
$filtro = if ($env:LECTURA_FILTRO) { $env:LECTURA_FILTRO } else { 'matrix|marelec' }
$maxSeg = if ($env:LECTURA_SEG) { [int]$env:LECTURA_SEG } else { 45 }
$L = New-Object System.Collections.Generic.List[string]   # informe corto (pantalla y archivo)
$M = New-Object System.Collections.Generic.List[string]   # muestra de filas (solo archivo)
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

T '1. EQUIPO'
F ("Fecha: {0:dd-MM-yyyy HH:mm:ss}  Equipo: {1}  Usuario: {2}" -f (Get-Date), $env:COMPUTERNAME, $env:USERNAME)

$uia = $true
try { Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop; Add-Type -AssemblyName UIAutomationTypes -ErrorAction Stop }
catch { $uia = $false; F ('No se pudo cargar UI Automation: ' + $_.Exception.Message) }

$procs = @(Get-Process | Where-Object { $_.ProcessName -match $filtro })
$grillas = New-Object System.Collections.Generic.List[object]
$st = @{ vistos = 0; licencia = $false }
$relojBusca = [Diagnostics.Stopwatch]::StartNew()

# Busca controles con grilla sin entrar en ellos (una tabla tiene miles de celdas).
function Busca($e, [int]$nivel) {
  if ($st.vistos -ge 4000 -or $nivel -gt 16 -or $relojBusca.Elapsed.TotalSeconds -gt 20) { return }
  $st.vistos++
  $esGrilla = $false
  try {
    if ($e.Current.Name -match '(?i)licen|hardware') { $st.licencia = $true }
    $esGrilla = [bool]$e.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::IsGridPatternAvailableProperty)
  } catch { return }
  if ($esGrilla) { $grillas.Add($e); return }
  $h = $null; try { $h = $W.GetFirstChild($e) } catch {}
  $k = 0
  while ($h -and $k -lt 200) {
    Busca $h ($nivel + 1); $k++
    try { $h = $W.GetNextSibling($h) } catch { $h = $null }
  }
}

# Texto de una celda. Devuelve $null si Matrix no la entrega.
function Celda($gp, [int]$r, [int]$c) {
  try {
    $it = $gp.GetItem($r, $c)
    if (-not $it) { return $null }
    $t = [string]$it.Current.Name
    if (-not $t) { try { $t = [string]$it.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {} }
    return $t
  } catch { return $null }
}

T '2. TABLAS QUE MATRIX MUESTRA'
$res = $null
if (-not $procs) { F 'Matrix no está abierto: ábrelo, carga el informe y vuelve a pegar el script.' }
elseif ($uia) {
  $W = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $raiz = [System.Windows.Automation.AutomationElement]::RootElement
  foreach ($p in $procs) {
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
    $vents = $null; try { $vents = $raiz.FindAll([System.Windows.Automation.TreeScope]::Children, $cond) } catch {}
    if ($vents) { foreach ($v in $vents) { Busca $v 0 } }
  }
  $info = @()
  foreach ($g in $grillas) {
    try {
      $gp = $g.GetCurrentPattern([System.Windows.Automation.GridPattern]::Pattern)
      $info += [pscustomobject]@{ El = $g; Gp = $gp; Filas = [int]$gp.Current.RowCount; Cols = [int]$gp.Current.ColumnCount; Tipo = ($g.Current.ControlType.ProgrammaticName -replace '^ControlType\\.', '') }
    } catch {}
  }
  $info = @($info | Sort-Object Filas -Descending)
  if ($info.Count -eq 0) { F ("No se encontró ninguna tabla ({0} controles revisados). ¿Está el informe cargado en pantalla?" -f $st.vistos) }
  foreach ($x in $info) { F ("- {0}: {1} filas x {2} columnas" -f $x.Tipo, $x.Filas, $x.Cols) }

  if ($info.Count -gt 0 -and $info[0].Filas -gt 0) {
    $x = $info[0]; $gp = $x.Gp
    T '3. LECTURA DE LA TABLA MÁS GRANDE'
    $enc = @()
    try {
      $tp = $x.El.GetCurrentPattern([System.Windows.Automation.TablePattern]::Pattern)
      $enc = @($tp.Current.GetColumnHeaders() | ForEach-Object { [string]$_.Current.Name })
    } catch {}
    if ($enc.Count -gt 0) { F ('Columnas: ' + (($enc | ForEach-Object { Recorta $_ 22 }) -join ' | ')) }
    else { F 'Columnas: Matrix no entrega los títulos por esta vía (se ven en la primera fila o en el detalle).' }

    $filasTxt = New-Object System.Collections.Generic.List[string]
    $nulas = 0; $vacias = 0; $celdas = 0
    $reloj = [Diagnostics.Stopwatch]::StartNew()
    $r = 0
    while ($r -lt $x.Filas -and $reloj.Elapsed.TotalSeconds -lt $maxSeg) {
      $vals = New-Object string[] $x.Cols
      for ($c = 0; $c -lt $x.Cols; $c++) {
        $t = Celda $gp $r $c
        $celdas++
        if ($null -eq $t) { $nulas++; $t = '' } elseif ($t -eq '') { $vacias++ }
        $vals[$c] = $t
      }
      $filasTxt.Add(($vals -join "\`t"))
      $r++
    }
    $reloj.Stop()
    $seg = [math]::Max($reloj.Elapsed.TotalSeconds, 0.001)
    $leidas = $filasTxt.Count
    $ritmo = $leidas / $seg
    $completa = ($leidas -ge $x.Filas)
    $estimado = if ($ritmo -gt 0) { $x.Filas / $ritmo } else { 0 }
    F ("Filas leídas: {0} de {1} en {2:N1} s  ->  {3:N0} filas por segundo" -f $leidas, $x.Filas, $seg, $ritmo)
    if (-not $completa) { F ("Se cortó a los {0} s (tope de la prueba). La tabla completa tardaría cerca de {1:N0} s." -f $maxSeg, $estimado) }
    F ("Celdas: {0} leídas, {1} vacías, {2} que Matrix no entregó" -f $celdas, $vacias, $nulas)

    T '4. MUESTRA (para confirmar que es el mismo dato del Excel)'
    $ver = { param($linea) (($linea -split "\`t") | ForEach-Object { Recorta $_ 14 }) -join ' | ' }
    $n = [math]::Min(3, $leidas)
    for ($i = 0; $i -lt $n; $i++) { F ("fila {0}: {1}" -f ($i + 1), (& $ver $filasTxt[$i])) }
    if ($leidas -gt 3) { F ("fila {0}: {1}" -f $leidas, (& $ver $filasTxt[$leidas - 1])) }

    if ($enc.Count -gt 0) { $M.Add(($enc -join "\`t")) }
    $tope = [math]::Min(20, $leidas)
    for ($i = 0; $i -lt $tope; $i++) { $M.Add($filasTxt[$i]) }
    if ($leidas -gt 25) { $M.Add('...'); for ($i = $leidas - 5; $i -lt $leidas; $i++) { $M.Add($filasTxt[$i]) } }
    $res = @{ completa = $completa; seg = $seg; estimado = $estimado; nulas = $nulas; celdas = $celdas; leidas = $leidas; filas = $x.Filas }
  }
}

T '5. VEREDICTO'
if (-not $procs) { F 'Sin dato: Matrix no estaba abierto.' }
elseif (-not $uia) { F 'Sin dato: este PowerShell no pudo cargar UI Automation.' }
elseif (-not $res) { F 'Sin dato: no había una tabla con filas en pantalla. Carga el informe en Matrix y repite.' }
elseif ($res.celdas -gt 0 -and ($res.nulas / $res.celdas) -gt 0.5) { F 'Matrix muestra la tabla pero NO entrega el texto de las celdas por esta vía. Habría que seguir con el exporte a Excel.' }
elseif ($res.completa) { F ("La tabla se lee COMPLETA en {0:N1} s, sin Excel y sin mouse. Sirve para el espejo en la PWA." -f $res.seg) }
elseif ($res.estimado -le 300) { F ("La tabla se lee bien pero lenta: cerca de {0:N0} s completa. Sirve si se leen solo las filas nuevas." -f $res.estimado) }
else { F ("La tabla se lee, pero completa tardaría cerca de {0:N0} min. Solo sirve leyendo las filas nuevas, o seguir con Excel." -f ($res.estimado / 60)) }
if ($st.licencia) { F 'OJO: hay texto de licencia en pantalla. Revisa el archivo antes de enviarlo.' }

$out = Join-Path ([Environment]::GetFolderPath('Desktop')) ('lectura-matrix-{0:HHmmss}.txt' -f (Get-Date))
if ($env:LECTURA_SALIDA) { $out = $env:LECTURA_SALIDA }
@($L) + @('', 'MUESTRA DE FILAS (separadas por tabulación)') + @($M) | Out-File -FilePath $out -Encoding utf8
if (-not $env:LECTURA_SALIDA) { Clear-Host }
Write-Host 'LECTURA DE LA TABLA DE MATRIX  (solo lectura)' -ForegroundColor Yellow
foreach ($linea in $L) { if ($linea -match '^\\d\\. ') { Write-Host $linea -ForegroundColor Cyan } else { Write-Host $linea } }
Write-Host ''
Write-Host "Guardado en: $out" -ForegroundColor Yellow
}
`
