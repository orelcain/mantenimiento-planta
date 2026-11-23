/**
 * Sondeo de solo lectura de la base de Matrix que se copia desde Diagnóstico Matrix: motor, servidor y base, sin conectarse ni mostrar credenciales.
 * Fuente: _HERRAMIENTAS/matrix-diagnostico/sondeo-base-matrix.ps1 (copiado TAL CUAL).
 * Si el .ps1 cambia, regenerar este archivo con generar-ts.mjs; no editarlo a mano.
 */
export const SONDEO_BASE_MATRIX_PS1 = `# Sondeo de la base de Matrix (Marelec). SOLO LECTURA: no se conecta a ninguna base, no escribe ni cambia nada.
# Responde: ¿qué motor usa Matrix?, ¿en qué servidor/instancia y base?, ¿qué falta para leer sin Matrix abierto?
# Uso: pegar TODO en PowerShell y Enter. Tarda menos de 1 minuto. No muestra usuarios ni contraseñas.
# Deja en el Escritorio: sondeo-base-matrix-HHmmss.txt
& {  # todo en un bloque: al pegarlo corre de una vez
if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') {
  Write-Host ("PowerShell en modo restringido ({0}): el sondeo no puede correr. Saca foto de este mensaje." -f $ExecutionContext.SessionState.LanguageMode) -ForegroundColor Yellow
  return
}
$reloj = [Diagnostics.Stopwatch]::StartNew()
$salidaDir = if ($env:SONDEO_SALIDA) { $env:SONDEO_SALIDA } else { [Environment]::GetFolderPath('Desktop') }
$extra = @()
if ($env:SONDEO_CARPETAS) { $extra = @($env:SONDEO_CARPETAS -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
$L = New-Object System.Collections.Generic.List[string]
$st = @{ vistos = 0 }
$todos = New-Object System.Collections.Generic.List[object]
$V = @{
  servicios = New-Object System.Collections.Generic.List[string]
  instancias = New-Object System.Collections.Generic.List[string]
  servidores = New-Object System.Collections.Generic.List[string]
  bases = New-Object System.Collections.Generic.List[string]
  motores = New-Object System.Collections.Generic.List[string]
  puertos = New-Object System.Collections.Generic.List[string]
  procesos = New-Object System.Collections.Generic.List[string]
}
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
function Fallo([string]$que, $e) { F ("no se pudo leer {0}: {1}" -f $que, (Recorta $e.Exception.Message 90)) }
# Anota un dato útil para el veredicto. Solo servidor, instancia y base: nunca usuario ni contraseña.
function Anota([string]$clave, [string]$valor) {
  $dato = $valor.Trim()
  if (-not $dato) { return }
  if ($clave -match '(?i)^(Server|Data Source|DataSource|Address|Addr|Network Address|Host)$') { [void]$V.servidores.Add($dato) }
  elseif ($clave -match '(?i)^(Database|Initial Catalog|DBQ|Dbname|DbName)$') { [void]$V.bases.Add($dato) }
}
# Un valor se acepta solo si es corto y no trae otra clave pegada (con «=»).
function Valor([string]$s) {
  $v = $s.Trim()
  if (-not $v -or $v -match '=' -or $v.Length -gt 120) { return $null }
  return $v
}
# Nombre de motor a partir de un proveedor, servicio o driver.
function Motor([string]$t) {
  if ($t -match '(?i)anywhere|sybase') { return 'SQL Anywhere' }
  if ($t -match '(?i)sql|mssql') { return 'SQL Server' }
  if ($t -match '(?i)firebird|interbase|fbclient') { return 'Firebird' }
  if ($t -match '(?i)postgre|npgsql') { return 'PostgreSQL' }
  if ($t -match '(?i)mysql|maria') { return 'MySQL/MariaDB' }
  if ($t -match '(?i)oracle') { return 'Oracle' }
  if ($t -match '(?i)jet|access') { return 'Access' }
  return $null
}
# Recorrido propio con topes: 3000 archivos, 6 niveles y 25 s. No abre nada: solo lista.
function Recorre([string]$raiz) {
  $pila = New-Object System.Collections.Stack
  $pila.Push([pscustomobject]@{ D = $raiz; N = 0 })
  while ($pila.Count -gt 0 -and $st.vistos -lt 3000 -and $reloj.Elapsed.TotalSeconds -lt 25) {
    $par = $pila.Pop()
    foreach ($h in @(Get-ChildItem -LiteralPath $par.D -Force -ErrorAction SilentlyContinue)) {
      if ($h.PSIsContainer) { if ($par.N -lt 6) { $pila.Push([pscustomobject]@{ D = $h.FullName; N = $par.N + 1 }) } }
      elseif ($st.vistos -lt 3000) { $st.vistos++; $todos.Add($h) }
    }
  }
}

T '1. EQUIPO'
F ("Fecha: {0:dd-MM-yyyy HH:mm:ss}  Equipo: {1}  Usuario: {2}" -f (Get-Date), $env:COMPUTERNAME, $env:USERNAME)

T '2. SERVICIOS DE BASE DE DATOS'
try {
  $patronSvc = 'SQL|Firebird|Postgre|MySQL|Maria|Sybase|Anywhere|Interbase'
  $svcs = @(Get-Service -ErrorAction Stop | Where-Object { $_.Name -like 'MSSQL*' -or $_.Name -like 'SQLAgent*' -or $_.Name -eq 'SQLBrowser' -or $_.Name -eq 'SQLWriter' -or $_.Name -match $patronSvc -or $_.DisplayName -match $patronSvc })
  if ($svcs.Count -eq 0) { F 'No hay servicios de base de datos instalados.' }
  foreach ($s in $svcs) {
    F ("{0} | {1} | estado: {2} | inicio: {3}" -f $s.Name, (Recorta $s.DisplayName 50), $s.Status, $s.StartType)
    [void]$V.servicios.Add(('{0}={1}' -f $s.Name, $s.Status))
    $m = Motor $s.Name
    if ($m) { [void]$V.motores.Add($m) }
  }
} catch { Fallo 'los servicios' $_ }

T '3. INSTANCIAS DE SQL SERVER (registro, solo lectura)'
try {
  $raicesSql = @(
    @{ Ruta = 'HKLM:\\SOFTWARE\\Microsoft\\Microsoft SQL Server'; Etiqueta = '' },
    @{ Ruta = 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Microsoft SQL Server'; Etiqueta = ' (WOW6432Node)' }
  )
  foreach ($raiz in $raicesSql) {
    try {
      $ip = Get-ItemProperty -Path ($raiz.Ruta + '\\Instance Names\\SQL') -ErrorAction Stop
      foreach ($prop in @($ip.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' })) {
        $id = [string]$prop.Value
        $ver = '?'; $ed = '?'
        try {
          $setup = Get-ItemProperty -Path ('{0}\\{1}\\Setup' -f $raiz.Ruta, $id) -ErrorAction Stop
          if ($setup.Version) { $ver = [string]$setup.Version }
          if ($setup.Edition) { $ed = Recorta ([string]$setup.Edition) 60 }
        } catch { }
        $srv = if ($prop.Name -eq 'MSSQLSERVER') { $env:COMPUTERNAME } else { $env:COMPUTERNAME + '\\' + $prop.Name }
        F ("instancia '{0}' -> id {1}{2}; versión {3}; edición {4}; servidor {5}" -f $prop.Name, $id, $raiz.Etiqueta, $ver, $ed, $srv)
        [void]$V.instancias.Add($srv)
        [void]$V.motores.Add('SQL Server')
      }
    } catch { }
  }
  if ($V.instancias.Count -eq 0) { F 'No hay instancias de SQL Server en el registro.' }
} catch { Fallo 'el registro de instancias' $_ }

T '4. ORIGEN DE DATOS ODBC (DSN) Y CONTROLADORES'
$atrDsn = @('Server', 'Database', 'DBQ', 'Dbname', 'DataSource')
try {
  if (Get-Command Get-OdbcDsn -ErrorAction SilentlyContinue) {
    $dsns = @(Get-OdbcDsn -ErrorAction Stop)
    if ($dsns.Count -eq 0) { F 'No hay DSN ODBC definidos.' }
    foreach ($d in $dsns) {
      F ("DSN '{0}' | plataforma: {1} | driver: {2}" -f $d.Name, $d.Platform, (Recorta $d.DriverName 60))
      if ($d.Attribute) {
        foreach ($k in @($d.Attribute.Keys)) {
          if ($atrDsn -contains $k) { F ("   {0} = {1}" -f $k, (Recorta ([string]$d.Attribute[$k]) 80)); Anota $k ([string]$d.Attribute[$k]) }
        }
      }
    }
  } else {
    $hubo = $false
    foreach ($ruta in @('HKLM:\\SOFTWARE\\ODBC\\ODBC.INI', 'HKLM:\\SOFTWARE\\WOW6432Node\\ODBC\\ODBC.INI', 'HKCU:\\Software\\ODBC\\ODBC.INI')) {
      if (-not (Test-Path -LiteralPath $ruta)) { continue }
      foreach ($sub in @(Get-ChildItem -LiteralPath $ruta -ErrorAction SilentlyContinue)) {
        if ($sub.PSChildName -eq 'ODBC Data Sources') { continue }
        $hubo = $true
        $pr = Get-ItemProperty -LiteralPath $sub.PSPath -ErrorAction SilentlyContinue
        F ("DSN '{0}' ({1})" -f $sub.PSChildName, $ruta)
        foreach ($k in @('Server', 'Database', 'DBQ', 'Dbname', 'DataSource', 'Driver')) {
          if ($pr.PSObject.Properties[$k]) {
            $val = [string]$pr.$k
            F ("   {0} = {1}" -f $k, (Recorta $val 80))
            Anota $k $val
          }
        }
      }
    }
    if (-not $hubo) { F 'No hay DSN ODBC en el registro.' }
  }
} catch { Fallo 'los DSN ODBC' $_ }
try {
  if (Get-Command Get-OdbcDriver -ErrorAction SilentlyContinue) {
    $drv = @(Get-OdbcDriver -ErrorAction Stop | ForEach-Object { [string]$_.Name })
  } else {
    $drv = @()
    try {
      $pd = Get-ItemProperty -LiteralPath 'HKLM:\\SOFTWARE\\ODBC\\ODBCINST.INI\\ODBC Drivers' -ErrorAction Stop
      $drv = @($pd.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { [string]$_.Name })
    } catch { }
  }
  F ('Drivers ODBC instalados: ' + $drv.Count)
  foreach ($n in @($drv | Select-Object -First 40)) { F ('   ' + (Recorta $n 70)) }
} catch { Fallo 'los drivers ODBC' $_ }

T '5. PROCESOS DE MATRIX Y CARPETAS CANDIDATAS'
$carpetas = New-Object System.Collections.Generic.List[string]
try {
  foreach ($p in @(Get-Process -ErrorAction Stop | Where-Object { $_.ProcessName -match 'matrix|marelec' })) {
    $rutaExe = ''
    try { $rutaExe = [string]$p.Path } catch { }
    $txtRuta = '(sin permiso para ver la ruta)'
    if ($rutaExe) { $txtRuta = $rutaExe; [void]$carpetas.Add((Split-Path -Parent $rutaExe)) }
    F ("proceso {0} (Id {1}) | exe: {2}" -f $p.ProcessName, $p.Id, $txtRuta)
    [void]$V.procesos.Add($p.ProcessName)
  }
  if ($V.procesos.Count -eq 0) { F 'Matrix no está abierto: se buscan carpetas candidatas.' }
} catch { Fallo 'los procesos' $_ }
try {
  foreach ($r in @('C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData', 'C:\\')) {
    foreach ($d in @(Get-ChildItem -LiteralPath $r -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'Matrix|Marelec' })) { [void]$carpetas.Add($d.FullName) }
  }
} catch { Fallo 'las carpetas candidatas' $_ }
try {
  foreach ($r in @($env:APPDATA, $env:LOCALAPPDATA)) {
    if (-not $r) { continue }
    foreach ($d in @(Get-ChildItem -LiteralPath $r -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'Matrix|Marelec' })) { [void]$carpetas.Add($d.FullName) }
  }
} catch { Fallo 'las carpetas del usuario' $_ }
foreach ($x in $extra) { [void]$carpetas.Add($x) }
# Sin repetidas ni carpetas dentro de otra ya incluida (duplican archivos y agotan el tope). La del proceso va primero.
$validas = @($carpetas | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | ForEach-Object { if ($_.Length -gt 3) { $_.TrimEnd('\\') } else { $_ } })
$raices = New-Object System.Collections.Generic.List[string]
foreach ($c in $validas) {
  $dentro = $false
  foreach ($o in $validas) { if ($o -ne $c -and $c.StartsWith($o.TrimEnd('\\') + '\\', [StringComparison]::OrdinalIgnoreCase)) { $dentro = $true; break } }
  $ya = $false
  foreach ($o in $raices) { if ($o -ieq $c) { $ya = $true; break } }
  if (-not $dentro -and -not $ya) { $raices.Add($c) }
}
F ('Carpetas a revisar: ' + $raices.Count)
foreach ($r in @($raices | Select-Object -First 10)) { F ('   ' + $r) }

T '6. ARCHIVOS DE CONFIGURACIÓN Y BASES LOCALES (no se abren las bases)'
$extCfg = @('.config', '.ini', '.xml', '.json', '.udl', '.dsn', '.cfg', '.conf', '.properties', '.settings')
$extLocal = @('.mdf', '.ldf', '.sdf', '.db', '.sqlite', '.fdb', '.gdb', '.mdb', '.accdb')
foreach ($r in $raices) { try { Recorre $r } catch { Fallo ('el recorrido de ' + $r) $_ } }
# Si se llegó a un tope, la lista de archivos está incompleta: el veredicto no puede afirmar que algo «no está».
$recorridoCortado = ($st.vistos -ge 3000 -or $reloj.Elapsed.TotalSeconds -ge 25)
if ($recorridoCortado) { F 'Aviso: el recorrido llegó a su tope (3000 archivos o 25 s); la lista de archivos está incompleta.' }
$cfgCount = 0; $locales = 0; $mostrados = 0
foreach ($f in $todos) {
  $ext = $f.Extension.ToLowerInvariant()
  $rel = $f.FullName
  foreach ($r in $raices) {
    if ($f.FullName.StartsWith($r, [StringComparison]::OrdinalIgnoreCase)) { $rel = $f.FullName.Substring($r.TrimEnd('\\').Length + 1); break }
  }
  if ($extLocal -contains $ext) {
    $locales++
    F ("base local: {0} | {1:N1} MB | modificado {2:dd-MM-yyyy HH:mm}" -f $rel, ($f.Length / 1MB), $f.LastWriteTime)
    if ($ext -in '.mdf', '.ldf', '.sdf') { [void]$V.motores.Add('SQL Server (archivo local)') }
    elseif ($ext -in '.fdb', '.gdb') { [void]$V.motores.Add('Firebird') }
    elseif ($ext -in '.mdb', '.accdb') { [void]$V.motores.Add('Access') }
    elseif ($ext -eq '.sqlite') { [void]$V.motores.Add('SQLite') }
  }
  if ($extCfg -notcontains $ext) { continue }
  $cfgCount++
  if ($f.Name -match '(?i)licen|license|lizenz|key|clave') { F ("{0}: archivo de licencia omitido" -f $rel); continue }
  if ($f.Length -gt 2MB) { F ("{0}: archivo mayor de 2 MB, omitido" -f $rel); continue }
  try { $txt = [IO.File]::ReadAllText($f.FullName) } catch { Fallo ('el archivo ' + $rel) $_; continue }
  # Se quitan antes los pares de secretos (con su valor, entrecomillado o hasta «;») y solo se extrae
  # si la clave arranca la cadena, va tras «;», espacio o comilla de apertura: nunca dentro de un valor.
  $limpio = [regex]::Replace($txt, '(?im)(?<=^|[;"''\\s])(User ID|UID|User|Password|PWD)\\s*=\\s*(''[^'']*''|"[^"]*"|[^;"''<>\\r\\n]*)', '')
  $hallazgos = New-Object System.Collections.Generic.List[string]
  foreach ($m in [regex]::Matches($limpio, '(?im)(?<=^|[;"''\\s])(Network Address|Data Source|Server|Address|Addr|Host)\\s*=\\s*([^;"''<>\\r\\n]{1,120})')) {
    $val = Valor $m.Groups[2].Value
    if ($val) { $hallazgos.Add("servidor: $val"); Anota $m.Groups[1].Value $val } else { $hallazgos.Add('servidor: (valor no reconocible, omitido)') }
  }
  foreach ($m in [regex]::Matches($limpio, '(?im)(?<=^|[;"''\\s])(Initial Catalog|Database|DBQ|DbName)\\s*=\\s*([^;"''<>\\r\\n]{1,120})')) {
    $val = Valor $m.Groups[2].Value
    if ($val) { $hallazgos.Add("base: $val"); Anota $m.Groups[1].Value $val } else { $hallazgos.Add('base: (valor no reconocible, omitido)') }
  }
  foreach ($m in [regex]::Matches($limpio, '(?i)(?<=^|[;"''\\s])Provider\\s*=\\s*([^;"''<>\\r\\n]{1,80})')) {
    $val = Valor $m.Groups[1].Value
    if ($val) { $hallazgos.Add("proveedor: $val"); $pm = Motor $val; if ($pm) { [void]$V.motores.Add($pm) } }
  }
  if ($txt -match '(?i)(?<![\\w])(Integrated Security|Trusted_Connection)\\s*=\\s*(true|yes|sspi)') { $hallazgos.Add('autenticación de Windows: sí') }
  elseif ($txt -match '(?i)(?<![\\w])(Integrated Security|Trusted_Connection)\\s*=') { $hallazgos.Add('autenticación de Windows: no') }
  if ($txt -match '(?i)(?<![\\w])(User ID|UID|User)\\s*=') { $hallazgos.Add('usuario: (oculto)') }
  if ($txt -match '(?i)(?<![\\w])(Password|PWD)\\s*=') { $hallazgos.Add('contraseña: (oculta)') }
  if ($txt -match '(?i)(?<![\\w])Initial Catalog\\s*=') { [void]$V.motores.Add('SQL Server') }
  if ($hallazgos.Count -gt 0 -and $mostrados -lt 40) {
    $mostrados++
    F ("{0}:" -f $rel)
    foreach ($h in $hallazgos) { F ('   ' + $h) }
  }
}
F ("Configuraciones revisadas: {0}; bases locales: {1}; archivos recorridos: {2}; tiempo: {3:N1} s" -f $cfgCount, $locales, $st.vistos, $reloj.Elapsed.TotalSeconds)
if ($mostrados -eq 0) { F 'Ninguna configuración trae servidor, base o proveedor reconocible.' }

T '7. PUERTOS EN ESCUCHA (SQL, Firebird, MySQL y Matrix)'
$nombresPid = @{}
try { foreach ($p in @(Get-Process -ErrorAction Stop)) { $nombresPid[[int]$p.Id] = $p.ProcessName } } catch { Fallo 'los procesos' $_ }
$filas = New-Object System.Collections.Generic.List[object]
try {
  if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
    foreach ($c in @(Get-NetTCPConnection -State Listen -ErrorAction Stop)) { $filas.Add([pscustomobject]@{ Puerto = [int]$c.LocalPort; ProcId = [int]$c.OwningProcess }) }
  } else {
    foreach ($linea in @(netstat -ano)) {
      if ($linea -match '^\\s*TCP\\s+\\S*:(\\d+)\\s+\\S+\\s+(LISTENING|ESCUCHANDO)\\s+(\\d+)') { $filas.Add([pscustomobject]@{ Puerto = [int]$matches[1]; ProcId = [int]$matches[3] }) }
    }
  }
} catch { Fallo 'los puertos' $_ }
$interes = @(1433, 1434, 3050, 5432, 3306)
$patronProc = 'sqlservr|sqlbrowser|sqlagent|firebird|fbserver|postgres|mysqld|mariadb|sybase|matrix|marelec'
$vistosP = @{}
foreach ($pf in $filas) {
  $nom = [string]$nombresPid[[int]$pf.ProcId]
  if (($interes -contains $pf.Puerto) -or ($nom -match $patronProc)) {
    $clave = '{0}/{1}' -f $pf.Puerto, $nom
    if (-not $vistosP.ContainsKey($clave)) {
      $vistosP[$clave] = 1
      $nomTxt = if ($nom) { $nom } else { '?' }
      F ("puerto {0} | proceso {1} (Id {2})" -f $pf.Puerto, $nomTxt, $pf.ProcId)
      [void]$V.puertos.Add(("{0} ({1})" -f $pf.Puerto, $nomTxt))
    }
  }
}
if ($V.puertos.Count -eq 0) { F 'Ningún puerto SQL, Firebird, MySQL ni Matrix está en escucha.' }

T '8. HERRAMIENTAS DISPONIBLES (nada se ejecuta ni se conecta)'
if (Get-Command -ErrorAction SilentlyContinue sqlcmd) { F 'sqlcmd: instalado (el sondeo no lo usa).' } else { F 'sqlcmd: no instalado.' }
try {
  $tabla = (New-Object System.Data.OleDb.OleDbEnumerator).GetElements()
  $prov = @($tabla.Rows | ForEach-Object { [pscustomobject]@{ N = [string]$_['SOURCES_NAME']; D = [string]$_['SOURCES_DESCRIPTION'] } })
  F ('Proveedores OLE DB instalados: ' + $prov.Count)
  foreach ($p in @($prov | Where-Object { $_.N -match 'SQL|Firebird|Postgre|MySQL|Maria|Sybase|Anywhere|Interbase|Oracle|Jet|ACE|Matrix' } | Select-Object -First 25)) {
    F ("   {0} | {1}" -f (Recorta $p.N 60), (Recorta $p.D 60))
  }
} catch { F ("proveedores OLE DB: no se pudieron listar ({0})" -f (Recorta $_.Exception.Message 70)) }
if ('System.Data.SqlClient.SqlClientFactory' -as [type]) { F 'Cliente .NET de SQL Server (System.Data.SqlClient): disponible.' } else { F 'Cliente .NET de SQL Server: no disponible.' }

T '9. INFORMES QUE OFRECE MATRIX (UI Automation: solo lectura, sin cambiar de informe ni hacer clic)'
if ($V.procesos.Count -eq 0) { F 'Matrix no está abierto: esta sección no se pudo leer. Abre Matrix y vuelve a pegar el sondeo.' }
else {
  try {
    Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop
    Add-Type -AssemblyName UIAutomationTypes -ErrorAction Stop
    $AE = [System.Windows.Automation.AutomationElement]
    $ctrl = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $uia = @{ nodos = 0; mejorTabla = $null; mejorArea = 0; relojU = [Diagnostics.Stopwatch]::StartNew() }
    $hallaz = New-Object System.Collections.Generic.List[string]
    function UiaTxt($e) { try { [string]$e.Current.Name } catch { '' } }
    function UiaHijos($e) {
      $res = New-Object System.Collections.Generic.List[object]
      $h = $null; try { $h = $ctrl.GetFirstChild($e) } catch { }
      $k = 0
      while ($h -and $k -lt 200) { $res.Add($h); $k++; try { $h = $ctrl.GetNextSibling($h) } catch { $h = $null } }
      return ,$res
    }
    # Recorre el árbol sin entrar en grillas (se miden solo por área). Nunca hace clic ni cambia el foco.
    function UiaVisita($e, [int]$nivel) {
      if ($uia.nodos -ge 4000 -or $nivel -gt 16 -or $uia.relojU.Elapsed.TotalSeconds -gt 20 -or $hallaz.Count -ge 150) { return }
      $uia.nodos++
      $tipo = ''; $nom = ''; $aid = ''; $cls = ''
      try { $tipo = ([string]$e.Current.ControlType.ProgrammaticName) -replace '^ControlType\\.', ''; $nom = UiaTxt $e; $aid = [string]$e.Current.AutomationId; $cls = [string]$e.Current.ClassName } catch { return }
      if ($nom -match '(?i)licen|hardware' -or $cls -match '(?i)licen|hardware') { return }
      if ([bool]$e.GetCurrentPropertyValue($AE::IsGridPatternAvailableProperty)) {
        try { $bb = $e.Current.BoundingRectangle; $area = $bb.Width * $bb.Height; if ($area -gt $uia.mejorArea) { $uia.mejorArea = $area; $uia.mejorTabla = $e } } catch { }
        return
      }
      if ($tipo -in 'ComboBox', 'List', 'Tree', 'Tab', 'Menu', 'MenuBar') {
        $hallaz.Add(("control {0} | Name: {1} | AutomationId: {2} | ClassName: {3}" -f $tipo, (Recorta $nom 60), (Recorta $aid 40), (Recorta $cls 40)))
        if ($tipo -eq 'ComboBox') {
          # Combo cerrado: solo se lee el valor visible y la selección; no se despliega.
          try { $vv = [string]$e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value; if ($vv) { $hallaz.Add('   valor visible: ' + (Recorta $vv 60)) } } catch { }
          try { foreach ($sel in @($e.GetCurrentPattern([System.Windows.Automation.SelectionPattern]::Pattern).Current.GetSelection())) { $hallaz.Add('   seleccionado: ' + (Recorta (UiaTxt $sel) 60)) } } catch { }
          return
        }
        $n = 0
        foreach ($c in (UiaHijos $e)) {
          if ($n -ge 60) { break }
          $cn = UiaTxt $c
          $marca = ''
          try { if ($c.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Current.IsSelected) { $marca = ' [seleccionado]' } } catch { }
          if ($cn -and $cn -notmatch '(?i)licen|hardware') { $hallaz.Add('   item: ' + (Recorta $cn 60) + $marca); $n++ }
        }
      }
      foreach ($h in (UiaHijos $e)) { UiaVisita $h ($nivel + 1) }
    }
    foreach ($p in @(Get-Process | Where-Object { $_.ProcessName -match 'matrix|marelec' })) {
      $cond = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, $p.Id)
      $vents = $null; try { $vents = $AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $cond) } catch { }
      if ($vents) { foreach ($vent in $vents) { UiaVisita $vent 0 } }
    }
    if ($uia.nodos -eq 0) { F 'Matrix está abierto, pero UI Automation no entregó ninguna ventana.' }
    if ($hallaz.Count -eq 0) { F 'No se encontraron listas, combos ni pestañas con nombres legibles.' }
    foreach ($hl in $hallaz) { F $hl }
    if ($uia.mejorTabla) {
      try {
        $tp = $uia.mejorTabla.GetCurrentPattern([System.Windows.Automation.TablePattern]::Pattern)
        F ('Tabla visible: filas ' + $tp.Current.RowCount)
        $hdrs = @($tp.GetCurrentColumnHeaders() | ForEach-Object { Recorta (UiaTxt $_) 40 })
        F ('   encabezados: ' + ($hdrs | Select-Object -First 40) -join ' | ')
      } catch { F 'Tabla visible: encabezados no disponibles por UI Automation.' }
    } else { F 'No hay tabla visible con cuadrícula.' }
    F ("Nodos recorridos: {0} (tope 4000)" -f $uia.nodos)
  } catch { Fallo 'la interfaz de Matrix (UI Automation)' $_ }
}

T '10. SUSPENSIÓN Y BLOQUEO DE PANTALLA (solo lectura)'
function Minutos([string]$hex) {
  $seg = [Convert]::ToInt64($hex, 16)
  if ($seg -eq 0) { 'nunca' } else { '{0} min' -f [math]::Round($seg / 60, 1) }
}
function Lee([string]$ruta, [string]$nombre) {
  if (-not (Test-Path -LiteralPath $ruta)) { return $null }
  $p = Get-ItemProperty -LiteralPath $ruta -ErrorAction SilentlyContinue
  if ($p -and $p.PSObject.Properties[$nombre]) { return $p.$nombre } else { return $null }
}
try {
  $plan = @(powercfg /getactivescheme) -join ' '
  F ('Plan activo: ' + (Recorta $plan 120))
} catch { Fallo 'el plan de energía' $_ }
foreach ($par in @(@('SUB_SLEEP', 'STANDBYIDLE', 'Suspender el equipo'), @('SUB_VIDEO', 'VIDEOIDLE', 'Apagar la pantalla'))) {
  try {
    $ac = $null; $dc = $null
    foreach ($ln in @(powercfg /q SCHEME_CURRENT $par[0] $par[1])) {
      if ($ln -match '0x([0-9a-fA-F]+)') {
        $hex = $matches[1]
        if ($ln -match '(?i)\\b(AC|CA)\\b|alterna') { $ac = $hex } elseif ($ln -match '(?i)\\b(DC|CC)\\b|continua') { $dc = $hex }
      }
    }
    $txtAc = if ($ac) { Minutos $ac } else { 'no leído' }
    $txtDc = if ($dc) { Minutos $dc } else { 'no leído' }
    F ("{0}: con corriente {1}; con batería {2}" -f $par[2], $txtAc, $txtDc)
  } catch { Fallo ('la suspensión (' + $par[1] + ')') $_ }
}
try {
  $rutaUsu = 'HKCU:\\Control Panel\\Desktop'
  $rutaPol = 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\Control Panel\\Desktop'
  $act = Lee $rutaUsu 'ScreenSaveActive'
  $tmo = Lee $rutaUsu 'ScreenSaveTimeOut'
  $sec = Lee $rutaUsu 'ScreenSaverIsSecure'
  $sA = if ($null -eq $act) { 'no definido' } elseif ([string]$act -eq '1') { 'sí' } else { 'no' }
  $sS = if ($null -eq $sec) { 'no definido' } elseif ([string]$sec -eq '1') { 'sí' } else { 'no' }
  $sT = if ($null -eq $tmo) { 'no definido' } else { '{0} min' -f [math]::Round([int]$tmo / 60, 1) }
  F ("Protector de pantalla activo: {0}; espera: {1}; pide contraseña al volver: {2}" -f $sA, $sT, $sS)
  $gTmo = Lee $rutaPol 'ScreenSaveTimeOut'
  $gAct = Lee $rutaPol 'ScreenSaveActive'
  $gSec = Lee $rutaPol 'ScreenSaverIsSecure'
  $gIna = Lee 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System' 'InactivityTimeoutSecs'
  $txtIna = if ($null -eq $gIna) { 'no definida' } else { '{0} min' -f [math]::Round([int]$gIna / 60, 1) }
  F ('Bloqueo por inactividad de la política (InactivityTimeoutSecs): ' + $txtIna)
  $hayGpo = @($gTmo, $gAct, $gSec, $gIna | Where-Object { $null -ne $_ }).Count -gt 0
  F ('Viene por GPO (política de la empresa): ' + $(if ($hayGpo) { 'sí' } else { 'no' }))
} catch { Fallo 'el protector de pantalla y las políticas' $_ }

T '11. CÓMO HABLA MATRIX CON SU SERVIDOR (solo se listan archivos y conexiones ya abiertas; nada se abre ni se conecta)'
$fuertes = New-Object System.Collections.Generic.List[string]
$posibles = New-Object System.Collections.Generic.List[string]
$evidencia = New-Object System.Collections.Generic.List[string]
$remotos = New-Object System.Collections.Generic.List[string]
$dllVistas = 0
$memoriaRevisada = $false
$patronSqlDll = '(?i)^(qsql\\w*|Qt\\d*Sql\\w*|libpq|libmysql|libmariadb|fbclient|gds32|sqlite3|sqlncli\\w*|msodbcsql\\w*|ntwdblib|dbodbc\\w*|dblib\\w*|oci|oraociei\\w*)\\.dll$'
$patronRedDll = '(?i)^(Qt\\d*Network|Qt\\d*WebSockets|Qt\\d*RemoteObjects|Qt\\d*Mqtt|Qt\\d*SerialPort|grpc\\w*|libprotobuf\\w*|libzmq\\w*)\\.dll$'
# Motor al que apunta una biblioteca. SQLite es un archivo local: no sirve para leer el servidor.
function MotorDll([string]$n) {
  if ($n -match '(?i)qsqlite|sqlite3') { return 'SQLite (archivo local, no servidor)' }
  if ($n -match '(?i)qsqlpsql|libpq') { return 'PostgreSQL' }
  if ($n -match '(?i)qsqlmysql|libmysql|libmariadb') { return 'MySQL/MariaDB' }
  if ($n -match '(?i)qsqlodbc|sqlncli|msodbcsql|ntwdblib') { return 'ODBC / SQL Server' }
  if ($n -match '(?i)qsqlibase|fbclient|gds32') { return 'Firebird' }
  if ($n -match '(?i)qsqloci|^oci|oraociei') { return 'Oracle' }
  if ($n -match '(?i)dbodbc|dblib') { return 'SQL Anywhere' }
  return 'módulo SQL de Qt (sin driver propio)'
}
# Un plugin qsql* suelto NO prueba nada: Qt suele copiar varios aunque el programa no los use.
# Evidencia fuerte: biblioteca cliente del motor en la carpeta, driver cargado en memoria o conexión a un puerto de base.
function Anota-Sql([string]$nombre, [string]$donde) {
  $md = MotorDll $nombre
  if ($md -match 'SQLite|módulo SQL') { return $md }
  if ($donde -eq 'memoria') { [void]$fuertes.Add($md); [void]$evidencia.Add($nombre + ' cargada en memoria') }
  elseif ($nombre -match '(?i)^qsql') { [void]$posibles.Add($md) }
  else { [void]$fuertes.Add($md); [void]$evidencia.Add($nombre + ' en la carpeta de Matrix') }
  return $md
}
# Nombres de los módulos cargados. Un proceso de 32 bits visto desde PowerShell de 64 bits entrega una lista
# incompleta sin dar error: se reconoce porque falta kernel32.dll, y entonces se pregunta al PowerShell de 32 bits.
function ModulosDe($p) {
  $nombres = @()
  try { $nombres = @($p.Modules | ForEach-Object { [string]$_.ModuleName }) } catch { }
  $completa = ($nombres.Count -ge 8 -and @($nombres | Where-Object { $_ -match '(?i)^kernel32\\.dll$' }).Count -gt 0)
  if (-not $completa -and [Environment]::Is64BitProcess) {
    $ps32 = Join-Path $env:WINDIR 'SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe'
    if (Test-Path -LiteralPath $ps32) {
      try {
        $orden = '(Get-Process -Id {0}).Modules | ForEach-Object {{ $_.ModuleName }}' -f [int]$p.Id
        $n32 = @(& $ps32 -NoProfile -NonInteractive -Command $orden 2>$null | ForEach-Object { [string]$_ })
        if ($n32.Count -ge 8 -and @($n32 | Where-Object { $_ -match '(?i)^kernel32\\.dll$' }).Count -gt 0) { $nombres = $n32; $completa = $true }
      } catch { }
    }
  }
  return [pscustomobject]@{ Completa = $completa; Nombres = $nombres }
}
try {
  foreach ($f in $todos) {
    if ($f.Extension.ToLowerInvariant() -ne '.dll') { continue }
    $dllVistas++
    if ($f.Name -match $patronSqlDll) {
      $md = Anota-Sql $f.Name 'carpeta'
      F ("biblioteca SQL: {0} | carpeta: {1} | {2}" -f $f.Name, (Recorta (Split-Path -Leaf $f.DirectoryName) 40), $md)
    } elseif ($f.Name -match $patronRedDll) {
      F ("biblioteca de red: {0}" -f $f.Name)
    } elseif ($f.Name -match '(?i)^Qt\\d*Core\\.dll$') {
      $vq = ''; try { $vq = [string]$f.VersionInfo.ProductVersion } catch { }
      F ("Qt: {0} versión {1}" -f $f.Name, $(if ($vq) { $vq } else { '?' }))
    }
  }
  F ('Bibliotecas (.dll) vistas en las carpetas de Matrix: ' + $dllVistas)
  if ($dllVistas -eq 0) { F 'No se vio ninguna: falta pasar la carpeta de Matrix.exe (variable SONDEO_CARPETAS).' }
  elseif ($fuertes.Count -eq 0 -and $posibles.Count -eq 0) { F 'Ninguna biblioteca SQL de servidor entre ellas.' }
} catch { Fallo 'las bibliotecas de Matrix' $_ }
$puertoDe = @{ 1433 = 'SQL Server'; 5432 = 'PostgreSQL'; 3306 = 'MySQL/MariaDB'; 3050 = 'Firebird'; 2638 = 'SQL Anywhere'; 1521 = 'Oracle' }
$pidsMx = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'matrix|marelec' } | ForEach-Object { [int]$_.Id })
if ($pidsMx.Count -eq 0) { F 'Matrix no está abierto: no hay conexiones ni módulos que mirar. Abre Matrix y vuelve a pegar el sondeo.' }
else {
  try {
    $pares = New-Object System.Collections.Generic.List[string]
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
      foreach ($c in @(Get-NetTCPConnection -State Established -ErrorAction Stop | Where-Object { $pidsMx -contains [int]$_.OwningProcess })) { $pares.Add(('{0}:{1}' -f $c.RemoteAddress, $c.RemotePort)) }
    } else {
      foreach ($linea in @(netstat -ano)) {
        if ($linea -match '^\\s*TCP\\s+\\S+\\s+(\\S+):(\\d+)\\s+(ESTABLISHED|ESTABLECIDO)\\s+(\\d+)' -and ($pidsMx -contains [int]$matches[4])) { $pares.Add(('{0}:{1}' -f $matches[1], $matches[2])) }
      }
    }
    foreach ($par in @($pares | Sort-Object -Unique)) {
      if ($par -match '^(127\\.|::1|\\[::1\\])') { continue }
      $pto = [int]($par -replace '^.*:', '')
      $que = if ($puertoDe.ContainsKey($pto)) { 'puerto habitual de ' + $puertoDe[$pto] } else { 'no es el puerto habitual de ningún motor de base' }
      F ("conexión abierta de Matrix -> {0} ({1})" -f $par, $que)
      [void]$remotos.Add($par)
      if ($puertoDe.ContainsKey($pto)) { [void]$fuertes.Add([string]$puertoDe[$pto]); [void]$evidencia.Add('conexión abierta a ' + $par) }
    }
    if ($remotos.Count -eq 0) { F 'Matrix no tiene conexiones abiertas hacia otro equipo.' }
  } catch { Fallo 'las conexiones de Matrix' $_ }
  foreach ($p in @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'matrix|marelec' })) {
    $mm = ModulosDe $p
    if (-not $mm.Completa) { F ("{0}: no se pudo listar los módulos cargados ({1} vistos, lista incompleta). La evidencia en memoria queda sin revisar." -f $p.ProcessName, @($mm.Nombres).Count); continue }
    $memoriaRevisada = $true
    $mods = @($mm.Nombres | Where-Object { $_ -match $patronSqlDll } | Sort-Object -Unique)
    if ($mods.Count -eq 0) { F ("{0}: {1} módulos cargados; ninguna biblioteca SQL entre ellos." -f $p.ProcessName, @($mm.Nombres).Count) }
    foreach ($mn in $mods) {
      $md = Anota-Sql $mn 'memoria'
      F ("{0}: cargada en memoria {1} | {2}" -f $p.ProcessName, $mn, $md)
    }
  }
}

T '12. REGISTRO DE MARELEC Y MATRIX (solo lectura; usuarios, contraseñas y licencias ocultos)'
$reg = @{ claves = 0; valores = 0 }
$patronReg = if ($env:SONDEO_REGISTRO) { $env:SONDEO_REGISTRO } else { 'Matrix|Marelec' }
$patronSecreto = '(?i)pass|pwd|user|usuario|uid|login|licen|lizenz|key|serial|token|secret|clave|hardware|hash|credential'
# Recorre una clave con topes: 200 claves, 400 valores y 5 niveles. Solo lee: nunca crea ni cambia valores.
function RegVisita($clave, [int]$nivel) {
  if ($reg.claves -ge 200 -or $reg.valores -ge 400 -or $nivel -gt 5) { return }
  $reg.claves++
  $ruta = [string]$clave.Name
  if ($ruta -match '(?i)licen|lizenz') { F ($ruta + ': clave de licencia omitida'); return }
  $lin = New-Object System.Collections.Generic.List[string]
  foreach ($n in @($clave.GetValueNames())) {
    if ($reg.valores -ge 400) { break }
    $reg.valores++
    $nom = if ($n) { [string]$n } else { '(predeterminado)' }
    if ($nom -match $patronSecreto) { $lin.Add(("   {0} = (oculto)" -f $nom)); continue }
    $tipo = ''; try { $tipo = [string]$clave.GetValueKind($n) } catch { }
    if ($tipo -eq 'Binary') { $lin.Add(("   {0} = (binario, omitido)" -f $nom)); continue }
    $val = ''; try { $val = (@($clave.GetValue($n)) | ForEach-Object { [string]$_ }) -join ' | ' } catch { }
    if ($val -match '(?i)(password|pwd|uid|user id|user)\\s*=') { $lin.Add(("   {0} = (cadena con credenciales, oculta)" -f $nom)); continue }
    if ($val -match '^[A-Za-z0-9+/=_-]{24,}$') { $lin.Add(("   {0} = (valor opaco, omitido)" -f $nom)); continue }
    $lin.Add(("   {0} = {1}" -f $nom, (Recorta $val 80)))
    if ($nom -match '(?i)server|servidor|host|address|addr|^ip') { $dato = Valor $val; if ($dato) { [void]$V.servidores.Add($dato) } }
    elseif ($nom -match '(?i)database|dbname|catalog') { $dato = Valor $val; if ($dato) { [void]$V.bases.Add($dato) } }
  }
  if ($lin.Count -gt 0) { F ($ruta + ':'); foreach ($rl in $lin) { F $rl } }
  foreach ($sub in @(Get-ChildItem -LiteralPath $clave.PSPath -ErrorAction SilentlyContinue)) { RegVisita $sub ($nivel + 1) }
}
try {
  foreach ($raizReg in @('HKCU:\\Software', 'HKLM:\\SOFTWARE', 'HKLM:\\SOFTWARE\\WOW6432Node')) {
    foreach ($k in @(Get-ChildItem -LiteralPath $raizReg -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match $patronReg })) { RegVisita $k 0 }
  }
  if ($reg.claves -eq 0) { F 'No hay claves de Marelec ni de Matrix en el registro.' }
  else { F ("Claves leídas: {0}; valores: {1} (topes 200 y 400)." -f $reg.claves, $reg.valores) }
} catch { Fallo 'el registro de Marelec y Matrix' $_ }

T '13. VEREDICTO'
$drvSrv = @(@($fuertes) | Sort-Object -Unique)
$mot = @(@($V.motores) + $drvSrv | Select-Object -Unique)
$srv = @(@($V.servidores) + @($V.instancias) | Select-Object -Unique)
$bas = @(@($V.bases) | Select-Object -Unique)
if ($mot.Count -eq 0) { F 'Motor: no identificado.' } else { F ('Motor probable: ' + ($mot -join ', ') + '.') }
F ('Servidor o instancia: ' + $(if ($srv.Count) { $srv -join ', ' } else { 'no encontrado en las carpetas revisadas' }))
F ('Base: ' + $(if ($bas.Count) { $bas -join ', ' } else { 'no encontrada en las configuraciones revisadas' }))
if ($remotos.Count) { F ('Matrix habla con: ' + (@($remotos | Sort-Object -Unique) -join ', ') + '.') }
$psb = @(@($posibles) | Sort-Object -Unique)
if ($drvSrv.Count) { F ('Vía de lectura: Matrix habla SQL con su servidor (' + ($drvSrv -join ', ') + '). Evidencia: ' + (@($evidencia | Sort-Object -Unique) -join '; ') + '. Se puede leer la base desde este PC, sin pantalla, con un usuario de SOLO LECTURA que entregue TI o Marelec.') }
elseif ($dllVistas -eq 0) { F 'Vía de lectura: sin decidir. No se vieron las bibliotecas de Matrix (pasar la carpeta de Matrix.exe en SONDEO_CARPETAS).' }
elseif ($recorridoCortado) { F 'Vía de lectura: sin decidir. El recorrido de archivos quedó incompleto (tope); pasar solo la carpeta de Matrix.exe en SONDEO_CARPETAS y repetir.' }
elseif ($psb.Count) {
  $cola = if ($memoriaRevisada) { 'Con Matrix abierto no estaba cargado: lo más probable es un protocolo propio; repetir con un informe en pantalla para confirmarlo.' } else { 'Falta verlo en uso: repetir con Matrix abierto y un informe en pantalla.' }
  F ('Vía de lectura: posible, sin confirmar. Matrix trae el plugin SQL de ' + ($psb -join ', ') + ', pero no se vio en uso (ni cargado en memoria ni conexión a un puerto de base). ' + $cola)
}
else {
  $cola = if ($memoriaRevisada) { '' } else { ' Repetir con Matrix abierto para confirmarlo en memoria.' }
  F ('Vía de lectura: Matrix no trae driver SQL de servidor: habla con Matrix CS por un protocolo propio. La base solo se puede leer en el servidor; hay que pedirlo a TI o a Marelec.' + $cola)
}
if ($V.procesos.Count) { F 'Matrix estaba abierto: el sondeo no lo tocó.' }
$falta = New-Object System.Collections.Generic.List[string]
if ($srv.Count -eq 0) { $falta.Add('la cadena de conexión: pasar la carpeta donde está Matrix.exe (variable SONDEO_CARPETAS)') }
if ($bas.Count -eq 0) { $falta.Add('el nombre de la base: está en la misma configuración que el servidor') }
if ($srv.Count -eq 0 -and $remotos.Count -eq 0 -and -not ($V.servicios | Where-Object { $_ -match '(?i)=Running' })) { $falta.Add('un servicio de base de datos en ejecución (no hay ninguno activo)') }
if ($V.puertos.Count -eq 0 -and $srv.Count -gt 0) { $falta.Add('confirmar el puerto o la instancia: no apareció ningún puerto SQL en escucha') }
$falta.Add('permiso de lectura en la base, que confirma el administrador de la base (el sondeo no pide ni muestra credenciales)')
F 'Para leer sin Matrix abierto, falta:'
foreach ($x in $falta) { F ('   - ' + $x) }
T ('Tiempo total: {0:N1} s (tope 60 s).' -f $reloj.Elapsed.TotalSeconds)

$salida = Join-Path $salidaDir ('sondeo-base-matrix-{0:HHmmss}.txt' -f (Get-Date))
$escrito = $false
try {
  [IO.File]::WriteAllLines($salida, [string[]]$L.ToArray(), (New-Object System.Text.UTF8Encoding($true)))
  $escrito = $true
} catch { Write-Host ("No se pudo guardar el informe en {0}: {1}" -f $salida, $_.Exception.Message) -ForegroundColor Red }
Write-Host 'SONDEO DE LA BASE DE MATRIX (solo lectura)' -ForegroundColor Yellow
foreach ($linea in $L) { if ($linea -match '^\\d+\\. ') { Write-Host $linea -ForegroundColor Cyan } else { Write-Host $linea } }
if ($escrito) {
  Write-Host ''
  Write-Host "Guardado en: $salida" -ForegroundColor Yellow
  if (-not $env:SONDEO_SALIDA) { Start-Process -FilePath 'notepad.exe' -ArgumentList ('"{0}"' -f $salida) }
}
}
`
