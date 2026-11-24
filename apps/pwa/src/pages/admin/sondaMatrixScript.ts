/**
 * Sonda de solo lectura que se copia desde la página Diagnóstico Matrix: dice si Matrix se puede manejar sin mouse ni teclado, si su selector de informes se podría pasar a «Puerta 0» sin tocar el PC, cómo está el lector del espejo en este PC y deja un resumen en el portapapeles.
 * Fuente: _HERRAMIENTAS/matrix-diagnostico/sonda-controles-matrix.ps1 (copiado TAL CUAL).
 * Si el .ps1 cambia, regenerar este archivo con generar-ts.mjs; no editarlo a mano.
 */
export const SONDA_MATRIX_PS1 = `# Sonda de controles de Matrix (Marelec). SOLO LECTURA: no pulsa, no escribe ni cambia nada en Matrix.
# Responde una pregunta: ¿se puede manejar Matrix sin mouse ni teclado (UI Automation de Windows)?
# Uso: abrir Matrix, dejar en pantalla lo que se quiere mirar, abrir PowerShell, pegar TODO y Enter.
#   Corrida 1: con el informe «Pieza pieza Grader» ya cargado en pantalla (también lista los combos,
#   como el de periodo «Usuario definido», con sus opciones; no los despliega ni los cambia, y en la
#   sección 5b busca el selector de informes y dice si se podría pasar a «Puerta 0» sin mouse ni teclado).
#   Corrida 2: con la ventana de exportar o guardar abierta (sin guardar nada).
#   También dice cómo está el lector del espejo en este PC (sección 7: solo mira sus archivos, sin red y sin
#   abrir la llave) y deja un resumen corto (sección 8) en pantalla y en el portapapeles, para una foto o pegarlo.
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
$combos = New-Object System.Collections.Generic.List[object]   # ComboBox vistos, para la sección 5
$contSel = New-Object System.Collections.Generic.List[object]  # listas, árboles, pestañas y menús, para la sección 5b
$botSel = New-Object System.Collections.Generic.List[object]   # botones con nombre de informe, para la sección 5b
# Nombres de informes de Matrix CG vistos en planta (20-11): sirven para reconocer el selector de informes.
$reInforme = '(?i)pieza\\s*(a\\s*)?pieza|puerta\\s*0|piezas\\s*errores|calidad\\s*grader|productividad|^\\s*lotes?\\s*$|totales\\s*de\\s*producci|calibraci|conservaci'
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
    if ($tipo -eq 'ComboBox' -and $combos.Count -lt 30) { $combos.Add($e) }
    if ($tipo -match '^(List|Tree|Tab|MenuBar|Menu)$' -and $c.ClassName -notmatch 'QComboBox' -and $contSel.Count -lt 40) { $contSel.Add($e) }
    if ($tipo -match '^(Button|SplitButton|Hyperlink|RadioButton)$' -and $c.Name -match $reInforme -and $botSel.Count -lt 20) { $botSel.Add($e) }
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

T '5. COMBOS DE LA VENTANA (¿hay un periodo que avance solo?)'
# Solo lee: nombre, valor, estado y los ítems que el combo ya expone. Nada de desplegar, elegir ni enfocar.
$reRel = '(?i)\\b(hoy|ayer|today|yesterday|[úu]ltim\\w*|last|semana\\w*|week\\w*|mes|month\\w*|turno\\w*|shift\\w*|current|hora\\w*|hours?|d[íi]as?|days?|anterior|previous)\\b'
$rePer = '(?i)usuario\\s*defin|user\\s*defin|period|periodo|per[íi]odo|rango|range'
$st.combo = ''; $relativas = New-Object System.Collections.Generic.List[string]; $otrasRel = New-Object System.Collections.Generic.List[string]
function Opciones($e, [int]$nivel, $acc) {
  if ($nivel -gt 4 -or $acc.visitas -ge 400) { return }
  $h = $null; try { $h = $RW.GetFirstChild($e) } catch {}
  while ($h -and $acc.visitas -lt 400) {
    $acc.visitas++
    try {
      $t = $h.Current.ControlType.ProgrammaticName -replace '^ControlType\\.', ''
      if ($t -match '^(ListItem|MenuItem|DataItem)$' -and $acc.items.Count -lt 60) { $acc.items.Add((Corto $h.Current.Name 50)) }
    } catch {}
    Opciones $h ($nivel + 1) $acc
    try { $h = $RW.GetNextSibling($h) } catch { $h = $null }
  }
}
if (-not $procs -or -not $uia) { F '(sin dato)' }
elseif ($combos.Count -eq 0) { $st.combo = 'ninguno'; F 'No se vio ningún combo. Abre el informe «Pieza pieza Grader» y vuelve a pegar la sonda.' }
else {
  $RW = [System.Windows.Automation.TreeWalker]::RawViewWalker
  if ($st.cortado) { F ("OJO: la lectura se cortó ({0}): puede faltar algún combo." -f $st.cortado) }
  $n = 0; $hayPer = $false; $perConOps = $false; $perSinOps = $false
  foreach ($e in $combos) {
    $n++
    try { $c = $e.Current } catch { F ("- combo {0}: no se pudo leer" -f $n); continue }
    $valor = ''; try { $valor = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {}
    if (-not $valor) { try { $valor = (@($e.GetCurrentPattern([System.Windows.Automation.SelectionPattern]::Pattern).Current.GetSelection() | ForEach-Object { $_.Current.Name }) -join ', ') } catch {} }
    $estado = ''; try { $estado = [string]$e.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Current.ExpandCollapseState } catch {}
    $vecino = ''; try { $ant = $W.GetPreviousSibling($e); if ($ant) { $vecino = $ant.Current.Name } } catch {}
    $acc = @{ visitas = 0; items = (New-Object System.Collections.Generic.List[string]) }
    Opciones $e 0 $acc
    $ops = @($acc.items | Where-Object { $_ } | Select-Object -Unique)
    $esPer = ($valor -match $rePer) -or ($c.Name -match $rePer) -or ($vecino -match $rePer) -or (@($ops | Where-Object { $_ -match $rePer }).Count -gt 0)
    F ("- combo {0}{1}: nombre=\`"{2}\`" junto a=\`"{3}\`" id={4} clase={5}" -f $n, $(if ($esPer) { ' (PROBABLE PERIODO)' } else { '' }), (Corto $c.Name 40), (Corto $vecino 30), (Corto $c.AutomationId 30), (Corto $c.ClassName 25))
    F ("    valor actual=\`"{0}\`"  estado={1}{2}" -f (Corto $valor 50), $(if ($estado) { $estado } else { '?' }), $(if (-not $c.IsEnabled) { '  (deshabilitado)' } else { '' }))
    if ($ops.Count -gt 0) {
      F ("    opciones ({0}): {1}" -f $ops.Count, ($ops -join ' | '))
      foreach ($o in $ops) { if ($o -match $reRel -and $o -notmatch $rePer) { if ($esPer) { $relativas.Add(('combo {0}: {1}' -f $n, $o)) } else { $otrasRel.Add(('combo {0}: {1}' -f $n, $o)) } } }
      if ($esPer) { $perConOps = $true }
    } else {
      F '    opciones: no se ven con el combo cerrado'
      if ($esPer) { $perSinOps = $true }
    }
    if ($esPer) { $hayPer = $true; if (-not $st.perVisto) { $st.perVisto = $true; $st.perValor = Corto $valor 40; $st.perOps = @($ops | ForEach-Object { Corto $_ 30 }) } }
  }
  if ($relativas.Count -gt 0) { $st.combo = 'relativo' }
  elseif (-not $hayPer) { $st.combo = 'sin-periodo' }
  elseif ($perSinOps) { $st.combo = 'sin-opciones' }
  else { $st.combo = 'sin-relativo' }
}
# Índice que Matrix guarda para el periodo (solo este valor; el resto del registro no se muestra).
foreach ($k in @('HKCU:\\Software\\Marelec\\MATRIX CG', 'HKCU:\\Software\\Marelec')) {
  try {
    $pr = Get-ItemProperty -LiteralPath $k -ErrorAction Stop
    $rp = @($pr.PSObject.Properties | Where-Object { $_.Name -match '^ReportPeriod' })
    if ($rp) { foreach ($x in $rp) { F ("Registro: {0} = {1}  (posición de la opción elegida; 0 = la primera)" -f $x.Name, (Corto ([string]$x.Value) 20)) }; break }
  } catch {}
}

T '5b. SELECTOR DE INFORMES (¿se puede pasar a «Puerta 0» sin mouse ni teclado?)'
# Solo lee: tipo, clase, patrones y qué ítem está elegido. No pulsa, no elige, no abre menús ni mueve el foco.
# Lo que se puede y lo que no, medido el 23-11 con una ventana de prueba en Qt 5.15 (Matrix CG es Qt 5.13), igual
# con la ventana minimizada: pestaña e ítem de menú cambian con Invoke; botón, con Invoke; un ítem de lista con Select
# cambia SOLO la selección (no el ítem actual ni simula clic); árbol y combo no cambian por UI Automation.
$st.sel = 'ninguno'; $st.selTxt = ''; $st.selActual = ''
$reMenuInf = '(?i)informe|report|ver\\b|view|ventana|window|listado'
function Items-De($e, [int]$nivel, $acc) {
  if ($nivel -gt 4 -or $acc.visitas -ge 300) { return }
  $h = $null; try { $h = $RW.GetFirstChild($e) } catch {}
  while ($h -and $acc.visitas -lt 300) {
    $acc.visitas++
    try {
      $t = $h.Current.ControlType.ProgrammaticName -replace '^ControlType\\.', ''
      $nm = [string]$h.Current.Name
      if ($t -match '^(ListItem|TreeItem|TabItem|MenuItem|DataItem|Button|RadioButton)$' -and $nm -and $nm -notmatch '(?i)licen|hardware') { $acc.items.Add(@{ el = $h; tipo = $t; nombre = $nm }) }
    } catch {}
    Items-De $h ($nivel + 1) $acc
    try { $h = $RW.GetNextSibling($h) } catch { $h = $null }
  }
}
function Patrones-De($e) { try { @($e.GetSupportedPatterns() | ForEach-Object { $_.ProgrammaticName -replace 'PatternIdentifiers\\.Pattern$', '' }) } catch { @() } }
function Padres-De($e) {
  $r = New-Object System.Collections.Generic.List[string]; $x = $e
  for ($i = 0; $i -lt 3; $i++) { try { $x = $W.GetParent($x); if (-not $x) { break }; $r.Add(((($x.Current.ControlType.ProgrammaticName -replace '^ControlType\\.', '')) + ':' + (Corto $x.Current.ClassName 25))) } catch { break } }
  ($r -join ' < ')
}
# Vía para cambiar de informe según el tipo del ítem (tabla medida en Qt 5.15). si | si-menu | quizas | no
function Via-Item([string]$tipo, [string[]]$pp, [string]$tipoCont, [string]$claseCont) {
  if ($tipoCont -eq 'ComboBox' -or $claseCont -match 'QComboBox') { return @('no', 'opción de combo: Qt 5 no cambia un combo por UI Automation (probado 23-11)') }
  switch ($tipo) {
    'TabItem' { if ($pp -contains 'Invoke') { return @('si', 'pestaña: Invoke la cambia sin mouse (probado en Qt 5.15)') } }
    'MenuItem' { if ($pp -contains 'Invoke') { return @('si-menu', 'opción de menú: Invoke la ejecuta; el menú se abre en pantalla un instante') } }
    { $_ -in 'Button', 'RadioButton' } { if ($pp -contains 'Invoke') { return @('si', 'botón: Invoke lo pulsa sin mouse') } }
    'ListItem' { if ($pp -contains 'SelectionItem') { return @('quizas', 'ítem de lista: Select cambia solo la selección (en Qt 5.15 no cambia el ítem actual ni simula clic); sirve si Matrix carga el informe al cambiar la selección, y eso solo se sabe probándolo una vez') } }
    { $_ -in 'TreeItem', 'DataItem' } { return @('no', 'ítem de árbol: Qt 5 no deja elegirlo por UI Automation (ni Select ni Invoke lo cambian)') }
  }
  return @('no', ('{0} sin la acción necesaria (patrones: {1})' -f $tipo, $(if ($pp) { $pp -join ',' } else { 'ninguno' })))
}
if (-not $procs -or -not $uia) { F '(sin dato)' }
else {
  $RW = [System.Windows.Automation.TreeWalker]::RawViewWalker
  $orden = @{ 'si' = 4; 'si-menu' = 3; 'quizas' = 2; 'no' = 1; 'menu-cerrado' = 0; 'ninguno' = -1 }
  $vistos = 0; $menusCerrados = New-Object System.Collections.Generic.List[string]
  $candidatos = New-Object System.Collections.Generic.List[object]
  foreach ($grupo in @($contSel, $combos, $botSel)) { foreach ($x in $grupo) { $candidatos.Add($x) } }
  foreach ($e in $candidatos) {
    try { $c = $e.Current; $tipoC = $c.ControlType.ProgrammaticName -replace '^ControlType\\.', '' } catch { continue }
    $acc = @{ visitas = 0; items = (New-Object System.Collections.Generic.List[object]) }
    if ($tipoC -match '^(Button|SplitButton|Hyperlink|RadioButton)$') { $acc.items.Add(@{ el = $e; tipo = $tipoC; nombre = [string]$c.Name }) } else { Items-De $e 0 $acc }
    $infs = @($acc.items | Where-Object { $_.nombre -match $reInforme })
    if ($tipoC -eq 'MenuBar') {
      foreach ($m in $acc.items) { if ($m.tipo -eq 'MenuItem' -and $m.nombre -match $reMenuInf) { $menusCerrados.Add((Corto $m.nombre 30)) } }
    }
    if ($infs.Count -eq 0) { continue }
    $vistos++
    $ppC = Patrones-De $e
    F ("- {0} «{1}» clase={2} id={3} {{{4}}}{5}{6}" -f $tipoC, (Corto $c.Name 40), (Corto $c.ClassName 25), (Corto $c.AutomationId 30), ($ppC -join ','), $(if ($c.IsOffscreen) { ' (fuera de pantalla)' } else { '' }), $(if (-not $c.IsEnabled) { ' (deshabilitado)' } else { '' }))
    F ('    dentro de: ' + (Padres-De $e))
    F ("    informes en él ({0} de {1} ítems): {2}" -f $infs.Count, $acc.items.Count, ((@($infs | ForEach-Object { Corto $_.nombre 30 }) | Select-Object -First 12) -join ' | '))
    $actual = ''
    try { $actual = (@($e.GetCurrentPattern([System.Windows.Automation.SelectionPattern]::Pattern).Current.GetSelection() | ForEach-Object { $_.Current.Name }) -join ', ') } catch {}
    if (-not $actual) { foreach ($it in $acc.items) { try { if ($it.el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Current.IsSelected) { $actual = $it.nombre; break } } catch {} } }
    if (-not $actual -and $tipoC -eq 'Tab' -and $c.Name -match $reInforme) { $actual = [string]$c.Name }   # Qt: la barra de pestañas se llama como la pestaña actual
    if (-not $actual -and $tipoC -eq 'ComboBox') { try { $actual = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {} }
    F ('    elegido ahora: ' + $(if ($actual) { Corto $actual 40 } else { 'no se puede leer' }))
    $obj = @($infs | Where-Object { $_.nombre -match '(?i)puerta\\s*0' })[0]
    if (-not $obj) { $obj = $infs[0] }
    $ppI = Patrones-De $obj.el
    $via = Via-Item $obj.tipo $ppI $tipoC ([string]$c.ClassName)
    F ("    «{0}»: {1} {{{2}}} -> {3}" -f (Corto $obj.nombre 30), $obj.tipo, ($ppI -join ','), $via[1])
    if ($orden[$via[0]] -gt $orden[$st.sel]) { $st.sel = $via[0]; $st.selTxt = ('{0} {1}' -f $tipoC, (Corto $c.ClassName 20)); $st.selActual = Corto $actual 30 }
  }
  if ($vistos -eq 0) {
    if ($menusCerrados.Count) { $st.sel = 'menu-cerrado'; $st.selTxt = ($menusCerrados -join ', '); F ('No se vio el selector. Hay menú(s) que pueden tenerlo: ' + $st.selTxt + '. Sus opciones no se ven sin abrirlo (la sonda no lo abre): saca una foto del menú abierto.') }
    else { F 'No se vio ningún control con nombres de informes. Saca una foto de la pantalla completa de Matrix, con la lista de informes a la vista.' }
    if ($st.cortado) { F ("OJO: la lectura se cortó ({0}): el selector puede estar en lo que no se leyó." -f $st.cortado) }
  }
}

T '6. VEREDICTO'
if (-not $procs) { F 'Sin dato: Matrix no estaba abierto.' }
elseif (-not $uia) { F 'Sin dato: este PowerShell no pudo cargar UI Automation.' }
elseif ($st.n -le 6 -and $st.sinAcceso) { F 'No se ven los controles y Windows niega leer el proceso: Matrix puede estar abierto como administrador. Repetir con PowerShell «como administrador».' }
elseif ($st.n -le 6) { F 'Matrix NO expone sus controles (interfaz dibujada a mano). Solo quedarían clics simulados, que sí ocupan el mouse.' }
elseif ($inv -ge 3) { F ("Matrix expone sus controles: {0} se pueden pulsar y {1} escribir sin mouse ni teclado. Falta la prueba real de exportar." -f $inv, $val) }
else { F 'Matrix muestra la ventana pero casi ningún control pulsable. Resultado dudoso: hay que mirar el archivo.' }
switch ($st.combo) {
  'relativo' { F ('Periodo: hay opciones relativas que harían avanzar el rango solo: ' + (($relativas | Select-Object -First 6) -join '; ') + '. Sirve para un lector e1.9.') }
  'sin-relativo' { F 'Periodo: el combo muestra sus opciones y ninguna es relativa (hoy, últimos N días...). El rango seguiría fijo.' }
  'sin-opciones' { F 'Periodo: las opciones no se ven sin desplegar el combo (la sonda no lo despliega). Eso NO significa que no haya periodo relativo: saca una foto del combo de periodo desplegado y mándala.' }
  'sin-periodo' { F ('Periodo: ningún combo parece de periodo (no se leyó «Usuario definido»). Revisa la lista de la sección 5 y saca una foto del combo de periodo desplegado.' + $(if ($otrasRel.Count) { ' Opciones relativas en otros combos: ' + (($otrasRel | Select-Object -First 4) -join '; ') + '.' } else { '' })) }
  'ninguno' { F 'Periodo: sin dato, no se vio ningún combo.' }
}
switch ($st.sel) {
  'si' { F ("Informes: el selector ({0}) se puede cambiar sin mouse ni teclado. Un lector podría leer «Puerta 0» y volver a «Pieza pieza Grader»; cambiar el informe cambia lo que ve quien mire Matrix." -f $st.selTxt) }
  'si-menu' { F ("Informes: se eligen desde un menú ({0}). Se puede sin teclado, pero el menú se abre en pantalla un instante." -f $st.selTxt) }
  'quizas' { F ("Informes: el selector es una lista ({0}). UI Automation solo cambia su selección: hay que probar una vez, con OK, si Matrix carga el informe así." -f $st.selTxt) }
  'no' { F ("Informes: el selector ({0}) no se puede cambiar por UI Automation en Qt 5. Leer «Puerta 0» exige que alguien lo elija a mano." -f $st.selTxt) }
  'menu-cerrado' { F ("Informes: sin dato. Pueden estar en el menú «{0}»: foto del menú abierto." -f $st.selTxt) }
  'ninguno' { F 'Informes: sin dato, no se vio el selector. Foto de la pantalla completa de Matrix.' }
}
if ($st.licencia) { F 'OJO: hay texto de licencia en pantalla. Revisa el archivo antes de enviarlo.' }

T '7. LECTOR DEL ESPEJO EN ESTE PC (solo sus archivos; sin red; la llave no se abre)'
$lecDir = Join-Path $env:LOCALAPPDATA 'espejo-grader'
if ($env:SONDA_DIR_LECTOR) { $lecDir = $env:SONDA_DIR_LECTOR }
$lec = @{ hay = $false; ver = ''; num = $null; latMin = $null; latTipo = ''; vivo = '?'; tarea = '?'; pant = '?'; pantFalla = ''; ciclo = ''; ultPieza = ''; ordenes = ''; nueva = ''; periodo = '' }
function Lec-Archivo([string]$nom) { Join-Path $lecDir $nom }
if (-not (Test-Path -LiteralPath $lecDir)) { F ('No está instalado: no existe ' + $lecDir) }
else {
  $lec.hay = $true
  try {
    $lecLat = ([IO.File]::ReadAllText((Lec-Archivo 'latido.txt'))).Trim().Split(' ')
    $lecT = [datetime]::MinValue
    if ([datetime]::TryParse($lecLat[0], [ref]$lecT)) { $lec.latMin = [int][math]::Floor(((Get-Date) - $lecT).TotalMinutes) }
    $lec.ver = [string]$lecLat[1]; $lec.latTipo = [string]$lecLat[2]
  } catch { }
  if ($lec.ver -match '^e(\\d{1,2}(\\.\\d{1,2}){1,2})$') { try { $lec.num = [version]$Matches[1] } catch { } }
  F ("Versión instalada: {0}   último latido local: {1}" -f $(if ($lec.ver) { $lec.ver } else { '?' }), $(if ($null -ne $lec.latMin) { "hace $($lec.latMin) min ($($lec.latTipo))" } else { 'sin latido' }))
  try {
    $lecPid = [int](([IO.File]::ReadAllText((Lec-Archivo 'lector.pid'))).Trim())
    $lecProc = Get-CimInstance Win32_Process -Filter ("ProcessId=$lecPid") -ErrorAction Stop
    $lec.vivo = $(if ($lecProc -and [string]$lecProc.CommandLine -match 'lector-espejo') { 'sí' } else { 'no' })
  } catch { $lec.vivo = 'no' }
  try { $lecTar = Get-ScheduledTask -TaskName 'Espejo del grader' -ErrorAction Stop; $lec.tarea = [string]$lecTar.State } catch { $lec.tarea = 'no existe' }
  F ("Proceso del lector vivo: {0}   tarea programada: {1}" -f $lec.vivo, $lec.tarea)
  # Pantalla despierta: desde e1.7 el lector la pide en cada ciclo; el log solo anota cuando Windows no la toma.
  $lecLog = @()
  try { $lecLog = @(Get-Content -LiteralPath (Lec-Archivo 'lector.log') -Tail 600 -Encoding UTF8 -ErrorAction Stop) } catch { }
  $lecIni = -1
  for ($i = $lecLog.Count - 1; $i -ge 0; $i--) { if ($lecLog[$i] -match '^\\S+ \\S+ Arranque ') { $lecIni = $i; break } }
  for ($i = $lecLog.Count - 1; $i -gt $lecIni; $i--) { if ($lecLog[$i] -match 'pantalla: Windows no tomó') { $lec.pantFalla = Corto $lecLog[$i] 120; break } }
  if ($null -eq $lec.num) { $lec.pant = '?' }
  elseif ($lec.num -lt [version]'1.7') { $lec.pant = 'no la pide (versión anterior a e1.7)' }
  elseif ($lec.pantFalla) { $lec.pant = 'la pide, pero Windows no la tomó' }
  else { $lec.pant = 'la pide (sin fallos en el log desde el arranque)' }
  F ('Pantalla despierta: ' + $lec.pant)
  if ($lec.pantFalla) { F ('    ' + $lec.pantFalla) }
  for ($i = $lecLog.Count - 1; $i -ge 0; $i--) { if ($lecLog[$i] -match '^(\\S+ \\S+) ciclo: filas-pieza leídas=(\\d+) enviadas=(\\d+).*error=(.*)$') { $lec.ciclo = ('{0} leídas={1} enviadas={2}{3}' -f $Matches[1], $Matches[2], $Matches[3], $(if ($Matches[4]) { ' error=' + (Corto $Matches[4] 30) } else { '' })); break } }
  for ($i = $lecLog.Count - 1; $i -ge 0; $i--) { if ($lecLog[$i] -match ' periodo: ') { $lec.periodo = Corto ($lecLog[$i] -replace '^\\S+ ', '') 110; break } }
  F ('Última lectura (log): ' + $(if ($lec.ciclo) { $lec.ciclo } else { 'ninguna en las últimas 600 líneas' }))
  try { $lecEst = Get-Content -LiteralPath (Lec-Archivo 'estado.json') -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json; $lec.ultPieza = [string]$lecEst.ultima } catch { }
  F ('Última pieza enviada: ' + $(if ($lec.ultPieza) { $lec.ultPieza } else { '?' }))
  $lecOrd = New-Object System.Collections.Generic.List[string]
  foreach ($lecNom in @('RECARGA', 'PERIODO', 'DETENER', 'REVOCADA')) { if (Test-Path -LiteralPath (Lec-Archivo $lecNom)) { $lecOrd.Add($lecNom) } }
  $lec.ordenes = $(if ($lecOrd.Count) { $lecOrd -join ', ' } else { 'ninguna' })
  F ('Órdenes activas (archivos): ' + $lec.ordenes + $(if ($lecOrd.Contains('RECARGA')) { '   (con RECARGA el lector no cambia de versión)' } else { '' }))
  try { $lecNue = Get-Content -LiteralPath (Lec-Archivo 'nuevo.json') -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json; $lec.nueva = [string]$lecNue.version } catch { }
  if ($lec.nueva) { F ('Versión ya bajada, esperando al vigilante: ' + $lec.nueva) }
  if ($lec.periodo) { F ('Periodo (log): ' + $lec.periodo) }
  F ('Llave guardada: ' + $(if (Test-Path -LiteralPath (Lec-Archivo 'llave.dat')) { 'sí (no se abre)' } else { 'no' }))
}

T '8. RESUMEN (para una foto, o pegarlo: ya quedó copiado)'
$res8 = New-Object System.Collections.Generic.List[string]
$res8.Add(('Sonda {0:dd-MM HH:mm}  {1}  PowerShell {2}' -f (Get-Date), $env:COMPUTERNAME, $PSVersionTable.PSVersion))
$res8.Add('Matrix: ' + $(if (-not $procs) { 'NO abierto' } elseif (-not $uia) { 'abierto, sin UI Automation' } else { "abierto, $($st.n) controles leídos" }))
$perTxt = switch ($st.combo) { 'relativo' { 'HAY opción relativa' } 'sin-relativo' { 'sin opción relativa' } 'sin-opciones' { 'opciones no visibles: foto del combo desplegado' } 'sin-periodo' { 'no se halló el combo de periodo' } default { 'sin dato' } }
$res8.Add('Periodo: ' + $perTxt + $(if ($st.perVisto) { ' | valor "' + $st.perValor + '"' } else { '' }))
if ($st.perVisto -and @($st.perOps).Count) { $res8.Add('Opciones: ' + (Corto (@($st.perOps) -join '; ') 160)) }
$selTxt8 = switch ($st.sel) { 'si' { 'se puede cambiar sin mouse' } 'si-menu' { 'por menú, sin teclado (se ve el menú)' } 'quizas' { 'lista: probar una vez con OK' } 'no' { 'no se puede por UIA' } 'menu-cerrado' { 'foto del menú abierto' } default { 'no visto: foto de Matrix' } }
$res8.Add('Selector de informes: ' + $selTxt8 + $(if ($st.selTxt -and $st.sel -ne 'menu-cerrado') { ' | ' + $st.selTxt } else { '' }) + $(if ($st.selActual) { ' | elegido "' + $st.selActual + '"' } else { '' }))
if (-not $lec.hay) { $res8.Add('Lector: no instalado en este usuario') }
else {
  $res8.Add(('Lector: {0} | latido {1} | proceso {2} | tarea {3}' -f $(if ($lec.ver) { $lec.ver } else { '?' }), $(if ($null -ne $lec.latMin) { "hace $($lec.latMin) min" } else { 'nunca' }), $lec.vivo, $lec.tarea))
  $res8.Add('Pantalla: ' + $lec.pant)
  $res8.Add('Última lectura: ' + $(if ($lec.ciclo) { $lec.ciclo } else { '?' }) + ' | última pieza ' + $(if ($lec.ultPieza) { $lec.ultPieza } else { '?' }))
  $res8.Add('Órdenes: ' + $lec.ordenes + $(if ($lec.nueva) { ' | bajada ' + $lec.nueva } else { '' }))
  if ($lec.periodo) { $res8.Add('Periodo del lector: ' + $lec.periodo) }
}
foreach ($x in $res8) { F $x }
# Lo único que la sonda escribe fuera de su archivo: el resumen en el portapapeles (nada en Matrix).
$copiado = $false
if (-not $env:SONDA_SIN_PORTAPAPELES) { try { Set-Clipboard -Value ($res8 -join "\`r\`n"); $copiado = $true } catch { } }

$out = Join-Path ([Environment]::GetFolderPath('Desktop')) ('sonda-matrix-{0:HHmmss}.txt' -f (Get-Date))
if ($env:SONDA_SALIDA) { $out = $env:SONDA_SALIDA }
@($L) + @('', 'DETALLE COMPLETO DE CONTROLES') + @($D) | Out-File -FilePath $out -Encoding utf8
Clear-Host
Write-Host 'SONDA DE CONTROLES DE MATRIX  (solo lectura)' -ForegroundColor Yellow
foreach ($linea in $L) { if ($linea -match '^\\d\\. ') { Write-Host $linea -ForegroundColor Cyan } else { Write-Host $linea } }
Write-Host ''
Write-Host "Guardado en: $out" -ForegroundColor Yellow
Write-Host $(if ($copiado) { 'El resumen (sección 8) quedó copiado: pégalo en el chat o saca una foto de la sección 8.' } else { 'No se pudo copiar el resumen: saca una foto de la sección 8.' }) -ForegroundColor Yellow
}
`
