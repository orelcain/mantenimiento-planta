/**
 * Sonda de solo lectura que se copia desde la página Diagnóstico Matrix: dice si Matrix se puede manejar sin mouse ni teclado.
 * Fuente: _HERRAMIENTAS/matrix-diagnostico/sonda-controles-matrix.ps1 (copiado TAL CUAL).
 * Si el .ps1 cambia, regenerar este archivo con generar-ts.mjs; no editarlo a mano.
 */
export const SONDA_MATRIX_PS1 = `# Sonda de controles de Matrix (Marelec). SOLO LECTURA: no pulsa, no escribe ni cambia nada en Matrix.
# Responde una pregunta: ¿se puede manejar Matrix sin mouse ni teclado (UI Automation de Windows)?
# Uso: abrir Matrix, dejar en pantalla lo que se quiere mirar, abrir PowerShell, pegar TODO y Enter.
#   Corrida 1: con el informe «Pieza pieza Grader» ya cargado en pantalla.
#   Corrida 2: con la ventana de exportar o guardar abierta (sin guardar nada).
# No correr con la pantalla de Administración abierta (muestra la licencia).
# El detalle queda en el Escritorio: sonda-matrix-HHmmss.txt
& {  # todo en un bloque: al pegarlo corre de una vez y la pantalla queda limpia
if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') {
  Write-Host ("PowerShell en modo restringido ({0}): la sonda no puede correr. Saca foto de este mensaje." -f $ExecutionContext.SessionState.LanguageMode) -ForegroundColor Yellow
  return
}
$filtro = if ($env:SONDA_FILTRO) { $env:SONDA_FILTRO } else { 'matrix|marelec' }
$maxNodos = 2500; $maxNivel = 14; $maxSeg = 60
$L = New-Object System.Collections.Generic.List[string]   # informe corto (pantalla y archivo)
$D = New-Object System.Collections.Generic.List[string]   # detalle completo (solo archivo)
$clave = New-Object System.Collections.Generic.List[string]
function T([string]$s) { $L.Add(''); $L.Add($s) }
function F([string]$s) {
  $ancho = 88
  while ($s.Length -gt $ancho) {
    $corte = $s.LastIndexOf(' ', $ancho); if ($corte -lt 20) { $corte = $ancho }
    $L.Add('  ' + $s.Substring(0, $corte)); $s = '      ' + $s.Substring($corte).TrimStart()
  }
  $L.Add('  ' + $s)
}
# Texto corto y sin códigos: tapa lo que parezca licencia o identificador de equipo.
function Corto([string]$s, [int]$n) {
  if (-not $s) { return '' }
  $s = ($s -replace '\\s+', ' ').Trim()
  $s = $s -replace '\\b[A-Za-z0-9]{4,}(-[A-Za-z0-9]{4,})+\\b', '***'
  $s = $s -replace '\\b(?=\\w*\\d)(?=\\w*[A-Za-z])\\w{10,}\\b', '***'
  if ($s.Length -gt $n) { $s.Substring(0, $n) + '...' } else { $s }
}
function Cuenta($tabla, [string]$k) { if ($k) { $tabla[$k] = 1 + [int]$tabla[$k] } }
function Lista($tabla, [int]$n) {
  (($tabla.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First $n | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '  ')
}

T '1. EQUIPO Y ENTORNO'
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrators')
F ("Fecha: {0:dd-MM-yyyy HH:mm}  Equipo: {1}  Usuario: {2}" -f (Get-Date), $env:COMPUTERNAME, $env:USERNAME)
F ("PowerShell: {0}  Modo: {1}  Administrador: {2}  Scripts: {3}" -f $PSVersionTable.PSVersion, $ExecutionContext.SessionState.LanguageMode, $(if ($esAdmin) { 'sí' } else { 'no' }), (Get-ExecutionPolicy))

$uia = $true
try { Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop; Add-Type -AssemblyName UIAutomationTypes -ErrorAction Stop }
catch { $uia = $false; F ('No se pudo cargar UI Automation: ' + $_.Exception.Message) }

T '2. PROCESO Y VENTANAS DE MATRIX'
$procs = @(Get-Process | Where-Object { $_.ProcessName -match $filtro })
$st = @{ n = 0; cortado = ''; sinAcceso = $false; licencia = $false; ventanas = 0 }
$tipos = @{}; $pats = @{}; $marcos = @{}
$reloj = [Diagnostics.Stopwatch]::StartNew()
$reClave = '(?i)export|excel|csv|guardar|save|archivo|file|10\\s?[.,]?000|recuperad|pieza|informe|report|actualizar|refresh|desde|hasta|fecha|imprimir|print'
$reToolkit = '(?i)^(System\\.Windows\\.Forms|PresentationFramework|Qt\\d|vcl|rtl\\d|mfc\\d|wx|DevExpress|Telerik|Infragistics|Syncfusion|C1\\.|CrystalDecisions|FastReport|Stimulsoft|javaw|jvm|libcef|electron)'

function Nodo($e, [int]$nivel) {
  if ($st.cortado) { return }
  if ($st.n -ge $maxNodos) { $st.cortado = "tope de $maxNodos controles"; return }
  if ($reloj.Elapsed.TotalSeconds -gt $maxSeg) { $st.cortado = "tope de $maxSeg s"; return }
  $st.n++
  $tipo = ''
  try {
    $c = $e.Current
    $tipo = $c.ControlType.ProgrammaticName -replace '^ControlType\\.', ''
    if ($c.Name -match '(?i)licen|hardware') { $st.licencia = $true }
    $nombre = Corto $c.Name 60
    $pp = @($e.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName -replace 'PatternIdentifiers\\.Pattern$', '' })
    Cuenta $tipos $tipo; Cuenta $marcos $c.FrameworkId; foreach ($p in $pp) { Cuenta $pats $p }
    $extra = ''
    if ($pp -contains 'Toggle') { try { $extra += ' estado=' + $e.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Current.ToggleState } catch {} }
    if ($pp -contains 'Value' -and $tipo -match 'Edit|ComboBox|Custom|Pane') { try { $extra += ' valor="' + (Corto $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value 40) + '"' } catch {} }
    if ($pp -contains 'Grid') { try { $g = $e.GetCurrentPattern([System.Windows.Automation.GridPattern]::Pattern).Current; $extra += " filas=$($g.RowCount) columnas=$($g.ColumnCount)" } catch {} }
    if (-not $c.IsEnabled) { $extra += ' (deshabilitado)' }
    $linea = '[{0}] "{1}" id={2} clase={3} {{{4}}}{5}' -f $tipo, $nombre, (Corto $c.AutomationId 30), (Corto $c.ClassName 40), ($pp -join ','), $extra
    $D.Add(('  ' * $nivel) + $linea)
    $esControl = $tipo -match '^(Button|MenuItem|CheckBox|Edit|ComboBox|DataGrid|Table|TabItem|RadioButton|SplitButton|Hyperlink|Calendar|Text|StatusBar)$'
    $interesa = ($nombre -match $reClave) -or ($tipo -match '^(CheckBox|DataGrid|Table|ComboBox|Edit)$')
    if ($esControl -and $interesa -and $clave.Count -lt 120) {
      $id = Corto $c.AutomationId 30
      $clave.Add(('{0} "{1}"{2} -> {3}{4}' -f $tipo, $nombre, $(if ($id) { " id=$id" } else { '' }), $(if ($pp) { $pp -join ',' } else { 'sin patrones' }), $extra))
    }
  } catch { $D.Add(('  ' * $nivel) + '(no se pudo leer este control)'); return }
  if ($nivel -ge $maxNivel) { return }
  $tope = if ($tipo -match 'DataGrid|Table|List|Tree|DataItem') { 12 } else { 80 }
  $h = $null; try { $h = $W.GetFirstChild($e) } catch {}
  $k = 0
  while ($h -and -not $st.cortado) {
    if ($k -ge $tope) { $D.Add(('  ' * ($nivel + 1)) + "(... hermanos omitidos: tope de $tope en este control)"); break }
    Nodo $h ($nivel + 1); $k++
    try { $h = $W.GetNextSibling($h) } catch { $h = $null }
  }
}

if (-not $procs) { F 'Matrix no está abierto: ábrelo y vuelve a pegar el script.' }
elseif ($uia) {
  $W = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $raiz = [System.Windows.Automation.AutomationElement]::RootElement
  foreach ($p in $procs) {
    $ruta = ''; $ver = ''; $kits = ''
    try {
      $ruta = $p.MainModule.FileName; $ver = $p.MainModule.FileVersionInfo.FileVersion
      $kits = (@($p.Modules | ForEach-Object { $_.ModuleName } | Where-Object { $_ -match $reToolkit } | Sort-Object -Unique | Select-Object -First 12) -join ', ')
    } catch { $st.sinAcceso = $true }
    F ("- proceso {0} (id {1})  versión {2}" -f $p.ProcessName, $p.Id, $(if ($ver) { $ver } else { '?' }))
    if ($ruta) { F ("    en: " + $ruta) } else { F '    Windows niega leer el proceso: puede estar abierto como administrador.' }
    if ($kits) { F ("    librerías de interfaz: " + $kits) }
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $p.Id)
    $vents = $null; try { $vents = $raiz.FindAll([System.Windows.Automation.TreeScope]::Children, $cond) } catch {}
    if (-not $vents -or $vents.Count -eq 0) { F '    (sin ventanas visibles para UI Automation)'; continue }
    foreach ($v in $vents) {
      $st.ventanas++
      $estado = ''; try { $estado = [string]$v.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Current.WindowVisualState } catch {}
      $antes = $st.n
      $D.Add(''); $D.Add("=== VENTANA: $(Corto $v.Current.Name 70)")
      Nodo $v 0
      F ("    ventana \`"{0}\`"  clase={1}  marco={2}  {3}  controles={4}" -f (Corto $v.Current.Name 50), (Corto $v.Current.ClassName 30), $v.Current.FrameworkId, $estado, ($st.n - $antes))
    }
  }
}

T '3. RESUMEN'
$inv = [int]$pats['Invoke']; $val = [int]$pats['Value']; $tog = [int]$pats['Toggle']
F ("Controles leídos: {0} en {1} ventana(s), {2:N1} s{3}" -f $st.n, $st.ventanas, $reloj.Elapsed.TotalSeconds, $(if ($st.cortado) { "  (cortado: $($st.cortado))" } else { '' }))
if ($st.n -gt 0) {
  F ('Tecnología: ' + (Lista $marcos 6))
  F ('Tipos: ' + (Lista $tipos 14))
  F ("Sin mouse se puede: pulsar={0}  escribir={1}  marcar={2}  elegir={3}  desplegar={4}  grilla={5}" -f $inv, $val, $tog, [int]$pats['SelectionItem'], [int]$pats['ExpandCollapse'], ([int]$pats['Grid'] + [int]$pats['Table']))
}

T '4. CONTROLES CLAVE (exportar, informe, fechas, casillas, grilla)'
if ($clave.Count -eq 0) { F '(ninguno)' }
foreach ($x in ($clave | Select-Object -First 40)) { F ('- ' + $x) }
if ($clave.Count -gt 40) { F ("(... {0} más en el archivo)" -f ($clave.Count - 40)) }

T '5. VEREDICTO'
if (-not $procs) { F 'Sin dato: Matrix no estaba abierto.' }
elseif (-not $uia) { F 'Sin dato: este PowerShell no pudo cargar UI Automation.' }
elseif ($st.n -le 6 -and $st.sinAcceso) { F 'No se ven los controles y Windows niega leer el proceso: Matrix puede estar abierto como administrador. Repetir con PowerShell «como administrador».' }
elseif ($st.n -le 6) { F 'Matrix NO expone sus controles (interfaz dibujada a mano). Solo quedarían clics simulados, que sí ocupan el mouse.' }
elseif ($inv -ge 3) { F ("Matrix expone sus controles: {0} se pueden pulsar y {1} escribir sin mouse ni teclado. Falta la prueba real de exportar." -f $inv, $val) }
else { F 'Matrix muestra la ventana pero casi ningún control pulsable. Resultado dudoso: hay que mirar el archivo.' }
if ($st.licencia) { F 'OJO: hay texto de licencia en pantalla. Revisa el archivo antes de enviarlo.' }

$out = Join-Path ([Environment]::GetFolderPath('Desktop')) ('sonda-matrix-{0:HHmmss}.txt' -f (Get-Date))
if ($env:SONDA_SALIDA) { $out = $env:SONDA_SALIDA }
@($L) + @('', 'DETALLE COMPLETO DE CONTROLES') + @($D) | Out-File -FilePath $out -Encoding utf8
Clear-Host
Write-Host 'SONDA DE CONTROLES DE MATRIX  (solo lectura)' -ForegroundColor Yellow
foreach ($linea in $L) { if ($linea -match '^\\d\\. ') { Write-Host $linea -ForegroundColor Cyan } else { Write-Host $linea } }
Write-Host ''
Write-Host "Guardado en: $out" -ForegroundColor Yellow
}
`
