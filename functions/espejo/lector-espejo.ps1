# Lector del espejo del grader, contrato E1 (fuente: espejo-grader-e1-contrato.md).
# Corre OCULTO y en una sola instancia. Lee «Pieza pieza Grader» de Matrix CG por UI Automation y envía las
# filas-pieza nuevas a espejoGraderIngesta. Controles que acciona (y ningún otro, nunca datos):
#   1. las 2 fechas del rango (ValuePattern.SetValue): inicio = última pieza enviada - 10 min (o 00:00 de hoy),
#      fin = mañana 00:00; nunca más atrás que el corte por antigüedad;
#   2. la casilla «Limitar el informe…» (TogglePattern.Toggle), solo para desmarcarla;
#   3. el botón «Actualizar» (InvokePattern.Invoke).
# Si no encuentra EXACTAMENTE 2 fechas editables y 1 casilla «Limitar el informe», no toca ni el rango ni la casilla.
# Si Matrix no toma el rango nuevo, devuelve las fechas como estaban y sigue sin moverlas (clave «ajuste» del latido).
# Mientras corre pide a Windows que no SUSPENDA el equipo (SetThreadExecutionState, sin pantalla: no toca el bloqueo
# con contraseña de planta). Con la sesión bloqueada igual intenta leer, no mueve el rango y lo informa («bloqueada»).
# Configuración por variables de entorno (opcionales): ESPEJO_URL, ESPEJO_CADA (s, 300), ESPEJO_FILTRO
# (matrix|marelec), ESPEJO_DIR (%LOCALAPPDATA%\espejo-grader), ESPEJO_EQUIPO (nombre del PC),
# ESPEJO_ESPERA_RECARGA (s, 12), ESPEJO_TOPE_CICLO (s, 600), ESPEJO_TOPE_TRAMO (s, 90: la lectura de la
# tabla se corta en tramos y el siguiente ciclo la continúa), ESPEJO_HORAS_ATRAS (h, 16: no lee filas más
# viejas; 0 o negativo = sin corte), ESPEJO_RANGO_AUTO (0 = no mueve el rango ni la casilla, como e1.1).
# La llave vive cifrada (DPAPI) en <dir>\llave.dat. Nunca se escribe en el log ni en pantalla.
# Sin Write-Host ni ventanas: todo va a <dir>\lector.log.

$ErrorActionPreference = 'Continue'
$VERSION = 'e1.3'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
try {
  Add-Type -AssemblyName UIAutomationClient -ErrorAction Stop
  Add-Type -AssemblyName UIAutomationTypes -ErrorAction Stop
} catch { }

# ---- Parámetros ----
$URL_CONTRATO = 'https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/espejoGraderIngesta'
$url = $URL_CONTRATO
if ($env:ESPEJO_URL) { $url = $env:ESPEJO_URL }
$cada = 300
if ($env:ESPEJO_CADA) { $cada = [double]$env:ESPEJO_CADA }
$filtro = 'matrix|marelec'
if ($env:ESPEJO_FILTRO) { $filtro = $env:ESPEJO_FILTRO }
$dir = Join-Path $env:LOCALAPPDATA 'espejo-grader'
if ($env:ESPEJO_DIR) { $dir = $env:ESPEJO_DIR }
$esperaRecarga = 12
if ($env:ESPEJO_ESPERA_RECARGA) { $esperaRecarga = [double]$env:ESPEJO_ESPERA_RECARGA }
$topeCiclo = 600
if ($env:ESPEJO_TOPE_CICLO) { $topeCiclo = [double]$env:ESPEJO_TOPE_CICLO }
$topeTramo = 90
if ($env:ESPEJO_TOPE_TRAMO) { $topeTramo = [double]$env:ESPEJO_TOPE_TRAMO }
$horasAtras = 16
if ($env:ESPEJO_HORAS_ATRAS) { $horasAtras = [double]$env:ESPEJO_HORAS_ATRAS }
$rangoAuto = ($env:ESPEJO_RANGO_AUTO -ne '0')
$equipo = ([string]$env:COMPUTERNAME) -replace '[^A-Za-z0-9_-]', ''
if ($env:ESPEJO_EQUIPO) { $equipo = ([string]$env:ESPEJO_EQUIPO) -replace '[^A-Za-z0-9_-]', '' }
if ($equipo.Length -gt 40) { $equipo = $equipo.Substring(0, 40) }
if (-not $equipo) { $equipo = 'PC' }

# Informes aceptados: solo el encabezado EXACTO. Cualquier otra tabla no se lee.
$INFORMES = @{
  'Pieza pieza Grader' = @('Fecha', 'Hora', 'Peso de las piezas', 'Cantidad de piezas', 'Lote', 'Gate', 'Calidad', 'Conservacion', 'Calibre', 'Producto', 'Turno')
}
$FORMATO_FECHA = '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$'
$LIMITE_LOG = 1MB
$LOTE_MAX = 2000
$archivoLog = Join-Path $dir 'lector.log'
$archivoEstado = Join-Path $dir 'estado.json'
$archivoDetener = Join-Path $dir 'DETENER'
$archivoLlave = Join-Path $dir 'llave.dat'
# E1.3: el vigilante (tarea programada) lee latido.txt y lector.pid; REVOCADA le dice que borre la tarea;
# lector-nuevo.ps1 + nuevo.json son una versión ya bajada y verificada que el vigilante pone en marcha.
$archivoLatido = Join-Path $dir 'latido.txt'
$archivoPid = Join-Path $dir 'lector.pid'
$archivoRevocada = Join-Path $dir 'REVOCADA'
$archivoNuevo = Join-Path $dir 'lector-nuevo.ps1'
$archivoNuevoInfo = Join-Path $dir 'nuevo.json'
$archivoRechazadas = Join-Path $dir 'rechazadas.txt'
$archivoActualiz = Join-Path $dir 'actualiz.txt'
$TAREA = 'Espejo del grader'
if ($env:ESPEJO_TAREA) { $TAREA = $env:ESPEJO_TAREA }
$UTF8 = New-Object System.Text.UTF8Encoding($false)
$AE = [System.Windows.Automation.AutomationElement]
$WALK = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$script:llave = ''
$script:filtroProc = $filtro

function Log([string]$msg) {
  try {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    if (Test-Path -LiteralPath $archivoLog) {
      if ((Get-Item -LiteralPath $archivoLog).Length -ge $LIMITE_LOG) {
        Move-Item -LiteralPath $archivoLog -Destination ($archivoLog + '.1') -Force
      }
    }
    $limpio = [string]$msg
    if ($script:llave) { $limpio = $limpio.Replace($script:llave, '***') }
    [IO.File]::AppendAllText($archivoLog, ('{0:yyyy-MM-dd HH:mm:ss} {1}' -f (Get-Date), $limpio) + "`r`n", $UTF8)
  } catch { }
}

# Lanza 'DETENER' si el archivo de parada existe. Se usa entre pasos y en las esperas.
function Revisa-Detener {
  if (Test-Path -LiteralPath $archivoDetener) { throw 'DETENER' }
}

function Espera([double]$seg) {
  $fin = (Get-Date).AddSeconds($seg)
  Revisa-Detener
  while ((Get-Date) -lt $fin) {
    $falta = ($fin - (Get-Date)).TotalMilliseconds
    Start-Sleep -Milliseconds ([int][math]::Min(1000, [math]::Max(50, $falta)))
    Revisa-Detener
  }
}

# ---- Llave (DPAPI) ----
function Lee-Llave {
  $enc = (Get-Content -LiteralPath $archivoLlave -Raw -Encoding UTF8 -ErrorAction Stop).Trim()
  $ss = ConvertTo-SecureString $enc
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# ---- Estado (ancla y conteos) ----
function Estado-Nuevo {
  return @{ ancla = $null; piezas = 0; primera = ''; ultima = ''; sec = ''; conteos = @() }
}
function Carga-Estado {
  $e = Estado-Nuevo
  if (-not (Test-Path -LiteralPath $archivoEstado)) { return $e }
  try {
    $j = Get-Content -LiteralPath $archivoEstado -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.ancla) { $e.ancla = @{ idx = [int]$j.ancla.idx; texto = [string]$j.ancla.texto } }
    $e.piezas = [int]$j.piezas
    $e.primera = [string]$j.primera
    $e.ultima = [string]$j.ultima
    $e.sec = [string]$j.sec
    $lista = New-Object System.Collections.Generic.List[object]
    foreach ($p in @($j.conteos)) { if ($p) { $lista.Add(@{ k = [string]$p.k; n = [int]$p.n }) } }
    $e.conteos = $lista.ToArray()
  } catch {
    Log 'estado.json ilegible: se relee todo'
    return (Estado-Nuevo)
  }
  return $e
}
function Guarda-Estado($e) {
  try {
    $txt = ConvertTo-Json -InputObject $e -Depth 5
    $tmp = $archivoEstado + '.tmp'
    [IO.File]::WriteAllText($tmp, $txt, $UTF8)
    Move-Item -LiteralPath $tmp -Destination $archivoEstado -Force
  } catch { Log ('estado.json no guardado: ' + $_.Exception.Message) }
}

# ---- UI Automation: búsqueda (reutiliza la forma de la prueba de vida) ----
function Recorre($e, [int]$nivel, $acc, $reloj) {
  if ($acc.visitados -ge 4000 -or $nivel -gt 16 -or $reloj.Elapsed.TotalSeconds -gt 20) { $acc.cortado = $true; return }
  $acc.visitados++
  try {
    $nom = [string]$e.Current.Name
    $tipo = [string]$e.Current.ControlType.ProgrammaticName
    # Licencia: solo texto visible (no menús), para no bloquear por una palabra de menú.
    if ($tipo -in @('ControlType.Text', 'ControlType.Document') -and $nom -match '(?i)licen|hardware') { $acc.licencia = $true }
    if ([bool]$e.GetCurrentPropertyValue($AE::IsGridPatternAvailableProperty)) { $acc.grillas.Add($e); return }
    if ($tipo -eq 'ControlType.CheckBox') {
      $estadoCb = '?'
      try { $estadoCb = [string]$e.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Current.ToggleState } catch { }
      $acc.casillas.Add(@{ nombre = $nom; estado = $estadoCb; el = $e })
    } elseif ([bool]$e.GetCurrentPropertyValue($AE::IsValuePatternAvailableProperty)) {
      $val = ''
      $soloLectura = $true
      try {
        $vp = $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        $val = [string]$vp.Current.Value
        $soloLectura = [bool]$vp.Current.IsReadOnly
      } catch { }
      if ($val -match $FORMATO_FECHA) {
        $acc.fechas.Add($val)
        if ($null -ne $acc.campos) { $acc.campos.Add(@{ el = $e; val = $val; soloLectura = $soloLectura }) }
      }
    }
  } catch { return }
  $h = $null
  try { $h = $WALK.GetFirstChild($e) } catch { }
  $k = 0
  while ($h -and $k -lt 200) {
    Recorre $h ($nivel + 1) $acc $reloj
    $k++
    try { $h = $WALK.GetNextSibling($h) } catch { $h = $null }
  }
}

function Escanea($acc, $reloj) {
  $raiz = $AE::RootElement
  $procs = @(Get-Process | Where-Object { $_.ProcessName -match $script:filtroProc })
  $acc.procesos = $procs.Count
  foreach ($p in $procs) {
    try {
      $cond = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, $p.Id)
      $vents = $raiz.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
      foreach ($v in $vents) { Recorre $v 0 $acc $reloj }
    } catch { }
  }
}

function Celda($gp, [int]$r, [int]$c) {
  try {
    $it = $gp.GetItem($r, $c)
    if (-not $it) { return $null }
    $t = [string]$it.Current.Name
    if (-not $t) { try { $t = [string]$it.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch { } }
    return $t
  } catch { return $null }
}

# Lee las 11 celdas de una fila, ya sin espacios sobrantes.
function Fila-Celdas($gp, [int]$r) {
  $c = New-Object 'string[]' 11
  for ($k = 0; $k -lt 11; $k++) { $c[$k] = ([string](Celda $gp $r $k)).Trim() }
  return , $c
}

# Foto de Matrix: informe, tabla más grande y campos. Devuelve error ('' si la tabla es «Pieza pieza Grader»).
function Foto {
  $acc = @{ grillas = (New-Object System.Collections.Generic.List[object]); casillas = (New-Object System.Collections.Generic.List[object]); fechas = (New-Object System.Collections.Generic.List[string]); licencia = $false; visitados = 0; procesos = 0 }
  $reloj = [Diagnostics.Stopwatch]::StartNew()
  Escanea $acc $reloj
  $f = @{ error = ''; el = $null; gp = $null; filas = 0; rango = [string[]]@(); limite = $false }
  $f.rango = [string[]]@($acc.fechas | Select-Object -First 4)
  $f.limite = (@($acc.casillas | Where-Object { $_.nombre -match '(?i)limit' -and $_.estado -eq 'On' }).Count -gt 0)
  if ($acc.procesos -eq 0) { $f.error = 'sin-matrix'; return $f }
  $mejor = $null
  foreach ($g in $acc.grillas) {
    try {
      $gp = $g.GetCurrentPattern([System.Windows.Automation.GridPattern]::Pattern)
      $n = [int]$gp.Current.RowCount
      if (-not $mejor -or $n -gt $mejor.Filas) { $mejor = @{ El = $g; Gp = $gp; Filas = $n } }
    } catch { }
  }
  if (-not $mejor) { $f.error = 'sin-tabla'; return $f }
  if ($acc.licencia) { $f.error = 'licencia-en-pantalla'; return $f }
  $enc = @()
  try {
    $tp = $mejor.El.GetCurrentPattern([System.Windows.Automation.TablePattern]::Pattern)
    $enc = @($tp.Current.GetColumnHeaders() | ForEach-Object { ([string]$_.Current.Name).Trim() })
  } catch { }
  $esp = $INFORMES['Pieza pieza Grader']
  $calza = ($enc.Count -eq $esp.Count)
  if ($calza) { for ($i = 0; $i -lt $esp.Count; $i++) { if ($enc[$i] -ne $esp[$i]) { $calza = $false; break } } }
  if (-not $calza) { $f.error = 'otro-informe'; return $f }
  $f.el = $mejor.El
  $f.gp = $mejor.Gp
  $f.filas = $mejor.Filas
  return $f
}

# Ventana de nivel superior que contiene la grilla.
function Ventana-De($el) {
  $x = $el
  for ($i = 0; $i -lt 40 -and $x; $i++) {
    try { if ($x.Current.ControlType.ProgrammaticName -eq 'ControlType.Window') { return $x } } catch { return $null }
    try { $x = $WALK.GetParent($x) } catch { return $null }
  }
  return $null
}

# Botón «Actualizar» (Name exacto, tipo Button) dentro de la ventana. Solo si hay exactamente uno.
function Boton-Actualizar($ventana) {
  if (-not $ventana) { return $null }
  $c = New-Object System.Windows.Automation.AndCondition -ArgumentList @(
    (New-Object System.Windows.Automation.PropertyCondition($AE::NameProperty, 'Actualizar')),
    (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)))
  $lista = $ventana.FindAll([System.Windows.Automation.TreeScope]::Descendants, $c)
  if ($lista.Count -eq 1) { return $lista.Item(0) }
  return $null
}

# ---- E1.2: rango automático ----
# Ventana de nivel superior (hija directa del escritorio) que contiene la grilla: ahí viven las fechas y la casilla.
function Ventana-Raiz($el) {
  $x = $el
  $raiz = $AE::RootElement
  for ($i = 0; $i -lt 40 -and $x; $i++) {
    $p = $null
    try { $p = $WALK.GetParent($x) } catch { return $null }
    if (-not $p) { return $null }
    if ([System.Windows.Automation.Automation]::Compare($p, $raiz)) { return $x }
    $x = $p
  }
  return $null
}

# Busca los controles del rango. Solo vale si hay EXACTAMENTE 2 campos con fecha «yyyy-MM-dd HH:mm:ss»
# (inicio <= fin) y EXACTAMENTE 1 casilla «Limitar el informe…». error: '' | sin-controles | solo-lectura.
function Controles-Rango($ventana) {
  $r = @{ error = 'sin-controles'; desde = $null; hasta = $null; casilla = $null }
  if (-not $ventana) { return $r }
  $acc = @{ grillas = (New-Object System.Collections.Generic.List[object]); casillas = (New-Object System.Collections.Generic.List[object]); fechas = (New-Object System.Collections.Generic.List[string]); campos = (New-Object System.Collections.Generic.List[object]); licencia = $false; visitados = 0; procesos = 0 }
  $reloj = [Diagnostics.Stopwatch]::StartNew()
  Recorre $ventana 0 $acc $reloj
  # Un recorrido cortado (tope de nodos, nivel o tiempo) no prueba que haya EXACTAMENTE 2 fechas: no se toca nada.
  if ($acc.cortado) { return $r }
  $lim = @($acc.casillas | Where-Object { $_.nombre -match '^\s*Limitar el informe' })
  if ($acc.campos.Count -ne 2 -or $lim.Count -ne 1) { return $r }
  $d = $acc.campos[0]
  $h = $acc.campos[1]
  if ([string]::CompareOrdinal([string]$d.val, [string]$h.val) -gt 0) { return $r }
  if ($d.soloLectura -or $h.soloLectura) { $r.error = 'solo-lectura'; return $r }
  $r.error = ''
  $r.desde = $d
  $r.hasta = $h
  $r.casilla = $lim[0]
  return $r
}

function Valor-De($el) {
  try { return [string]$el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch { return '' }
}
function Escribe-Valor($el, [string]$v) {
  $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue($v)
}
function Estado-Casilla($el) {
  try { return [string]$el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Current.ToggleState } catch { return '?' }
}

# Inicio deseado: última pieza enviada - 10 min (o 00:00 de hoy sin ancla), nunca antes del corte por
# antigüedad, redondeado al minuto hacia atrás. Fin: mañana 00:00.
function Rango-Deseado($estado) {
  $ahora = Get-Date
  $ini = $ahora.Date
  $u = [string]$estado.ultima
  $t = [datetime]::MinValue
  if ($u -match $FORMATO_FECHA -and [datetime]::TryParseExact($u, 'yyyy-MM-dd HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$t)) {
    $ini = $t.AddMinutes(-10)
  }
  if ($script:horasAtras -gt 0) {
    $piso = $ahora.AddHours(-$script:horasAtras)
    if ($ini -lt $piso) { $ini = $piso }
  }
  if ($ini -gt $ahora) { $ini = $ahora }
  $ini = $ini.AddSeconds(-$ini.Second)
  return @{ desde = $ini.ToString('yyyy-MM-dd HH:mm:ss'); hasta = $ahora.Date.AddDays(1).ToString('yyyy-MM-dd HH:mm:ss') }
}

# Antes de «Actualizar»: escribe las 2 fechas (solo si cambian) y desmarca «Limitar» (solo si está marcada).
# Devuelve $null si no tocó nada; si tocó, lo necesario para verificar y deshacer.
function Ajusta-Rango($el, $estado) {
  $ctl = Controles-Rango (Ventana-Raiz $el)
  if ($ctl.error) { $script:ajuste = $ctl.error; return $null }
  $q = Rango-Deseado $estado
  # Se deshace siempre hacia las fechas que había ANTES de que el lector tocara nada en esta corrida.
  if (-not $script:rangoOriginal) { $script:rangoOriginal = @{ desde = [string]$ctl.desde.val; hasta = [string]$ctl.hasta.val } }
  $orig = $script:rangoOriginal
  $cambia = @{ desde = ([string]$ctl.desde.val -ne $q.desde); hasta = ([string]$ctl.hasta.val -ne $q.hasta) }
  try {
    # Si el inicio nuevo queda después del fin actual, primero el fin (Matrix no ve un inicio > fin).
    if ([string]::CompareOrdinal($q.desde, [string]$ctl.hasta.val) -gt 0) {
      if ($cambia.hasta) { Escribe-Valor $ctl.hasta.el $q.hasta }
      if ($cambia.desde) { Escribe-Valor $ctl.desde.el $q.desde }
    } else {
      if ($cambia.desde) { Escribe-Valor $ctl.desde.el $q.desde }
      if ($cambia.hasta) { Escribe-Valor $ctl.hasta.el $q.hasta }
    }
    if ((Estado-Casilla $ctl.casilla.el) -eq 'On') { $ctl.casilla.el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle() }
  } catch {
    Log ('ajuste: Matrix rechazó el cambio: ' + $_.Exception.Message)
    Deshace-Rango $ctl $orig 'no-aplico'
    return $null
  }
  if ((Valor-De $ctl.desde.el) -ne $q.desde -or (Valor-De $ctl.hasta.el) -ne $q.hasta -or (Estado-Casilla $ctl.casilla.el) -ne 'Off') {
    Log ('ajuste: los controles no quedaron como se escribieron (inicio=' + (Valor-De $ctl.desde.el) + ', casilla=' + (Estado-Casilla $ctl.casilla.el) + ')')
    Deshace-Rango $ctl $orig 'no-aplico'
    return $null
  }
  $script:ajuste = 'ok'
  if ($cambia.desde -or $cambia.hasta) { Log ('ajuste: rango ' + $q.desde + ' -> ' + $q.hasta) }
  return @{ ctl = $ctl; orig = $orig; q = $q }
}

# Devuelve las fechas a como estaban y apaga el rango automático por el resto de la corrida.
function Deshace-Rango($ctl, $orig, [string]$motivo) {
  try {
    # Si el inicio original queda después del fin escrito, primero el fin (Matrix no ve un inicio > fin).
    if ([string]::CompareOrdinal($orig.desde, (Valor-De $ctl.hasta.el)) -gt 0) {
      if ((Valor-De $ctl.hasta.el) -ne $orig.hasta) { Escribe-Valor $ctl.hasta.el $orig.hasta }
      if ((Valor-De $ctl.desde.el) -ne $orig.desde) { Escribe-Valor $ctl.desde.el $orig.desde }
    } else {
      if ((Valor-De $ctl.desde.el) -ne $orig.desde) { Escribe-Valor $ctl.desde.el $orig.desde }
      if ((Valor-De $ctl.hasta.el) -ne $orig.hasta) { Escribe-Valor $ctl.hasta.el $orig.hasta }
    }
  } catch { Log ('ajuste: no se pudo devolver el rango: ' + $_.Exception.Message) }
  if ((Valor-De $ctl.desde.el) -ne $orig.desde -or (Valor-De $ctl.hasta.el) -ne $orig.hasta) { $motivo = 'no-devuelto' }
  $script:ajuste = $motivo
  $script:ajusteApagado = $true
  Log ('ajuste: ' + $motivo + '; el lector deja el rango como estaba y sigue sin moverlo.')
}

# Tras «Actualizar»: las fechas siguen escritas, la casilla desmarcada y la tabla empieza en el inicio pedido.
function Verifica-Ajuste($aj, $gp, [int]$filas) {
  if (-not $aj) { return }
  $ctl = $aj.ctl
  if ((Valor-De $ctl.desde.el) -ne $aj.q.desde -or (Valor-De $ctl.hasta.el) -ne $aj.q.hasta -or (Estado-Casilla $ctl.casilla.el) -ne 'Off') {
    Deshace-Rango $ctl $aj.orig 'no-aplico'
    return
  }
  for ($r = 0; $r -lt [math]::Min($filas, 5); $r++) {
    $f = ([string](Celda $gp $r 0)).Trim() + ' ' + ([string](Celda $gp $r 1)).Trim()
    if ($f -match $FORMATO_FECHA) {
      if ([string]::CompareOrdinal($f, $aj.q.desde) -lt 0) { Deshace-Rango $ctl $aj.orig 'no-filtra' }
      return
    }
  }
}

# El ancla se guarda por índice; al mover el rango el índice cambia. La busca por contenido: primera fila de
# su segundo (búsqueda binaria) y, dentro de ese segundo, la n-ésima fila idéntica (n = su conteo).
# Devuelve movida | sin-ancla | sin-fecha | no-esta | desordenada.
function Re-Ancla($gp, [int]$filas, $estado) {
  if (-not $estado.ancla) { return 'sin-ancla' }
  $texto = [string]$estado.ancla.texto
  # Siempre por contenido: tras mover el rango, el índice viejo puede caer en OTRA copia idéntica (Codex, 21-11).
  $p = $texto.Split([char]9)
  if ($p.Count -ne 11 -or $p[0] -notmatch '^\d{4}-\d{2}-\d{2}$' -or $p[1] -notmatch '^\d{2}:\d{2}:\d{2}$') { return 'sin-fecha' }
  $sec = $p[0] + ' ' + $p[1]
  if ([string]$estado.sec -ne $sec) { return 'sin-fecha' }
  $n = 0
  foreach ($c in @($estado.conteos)) { if ([string]$c.k -eq $texto) { $n = [int]$c.n } }
  if ($n -lt 1) { return 'sin-fecha' }
  $lo = Desde-Corte $gp $filas $sec
  # Orden ascendente: la fila de antes es de un segundo anterior.
  if ($lo -gt 0) {
    $antes = ([string](Celda $gp ($lo - 1) 0)).Trim() + ' ' + ([string](Celda $gp ($lo - 1) 1)).Trim()
    if ($antes -match $FORMATO_FECHA -and [string]::CompareOrdinal($antes, $sec) -ge 0) { return 'desordenada' }
  }
  $cuenta = 0
  $hallada = -1
  $r = $lo
  for (; $r -lt $filas -and $r -lt ($lo + 2000); $r++) {
    $c = Fila-Celdas $gp $r
    if (($c[0] + ' ' + $c[1]) -ne $sec) { break }
    if ($hallada -lt 0 -and ($c -join "`t") -eq $texto) { $cuenta++; if ($cuenta -eq $n) { $hallada = $r } }
  }
  if ($hallada -lt 0) { return 'no-esta' }
  # La primera fila después del segundo del ancla, si tiene fecha, debe ser posterior.
  if ($r -lt $filas) {
    $despues = ([string](Celda $gp $r 0)).Trim() + ' ' + ([string](Celda $gp $r 1)).Trim()
    if ($despues -match $FORMATO_FECHA -and [string]::CompareOrdinal($despues, $sec) -le 0) { return 'desordenada' }
  }
  $estado.ancla = @{ idx = $hallada; texto = $texto }
  return 'movida'
}

function Nuevo-Diccionario {
  return New-Object 'System.Collections.Generic.Dictionary[string,int]' ([StringComparer]::Ordinal)
}

# Primera fila cuya «fecha hora» (yyyy-MM-dd HH:mm:ss) es >= $corte. Búsqueda binaria que lee solo las
# columnas 0 y 1. Supone la tabla en orden ascendente; una fila sin fecha válida cuenta como «después».
function Desde-Corte($gp, [int]$filas, [string]$corte) {
  $lo = 0
  $hi = $filas
  while ($lo -lt $hi) {
    $mid = [int][math]::Floor(($lo + $hi) / 2)
    $f = ([string](Celda $gp $mid 0)).Trim() + ' ' + ([string](Celda $gp $mid 1)).Trim()
    $despues = $true
    if ($f -match '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$') { $despues = ([string]::CompareOrdinal($f, $corte) -ge 0) }
    if ($despues) { $hi = $mid } else { $lo = $mid + 1 }
  }
  return $lo
}

# Lee un tramo de filas nuevas (desde el ancla) o, si el ancla no calza, desde el corte por antigüedad.
# El tramo termina al llegar a la última fila, a $script:topeTramoSeg segundos o a $LOTE_MAX filas-pieza;
# en los dos últimos casos parcial=$true y hastaIdx/hastaTexto marcan la última fila recorrida.
# Devuelve $null si la tabla cambió durante la lectura.
function Lee-Tabla($gp, [int]$filas, $estado, $reloj) {
  $desde = 0
  $relectura = $false
  $semilla = Nuevo-Diccionario
  $semillaSec = ''
  $dict = Nuevo-Diccionario
  $dictSec = ''
  $anclaOk = $false
  if ($estado.ancla) {
    $idxA = [int]$estado.ancla.idx
    if ($idxA -lt $filas) { $anclaOk = (((Fila-Celdas $gp $idxA) -join "`t") -eq $estado.ancla.texto) }
    if ($anclaOk) {
      $desde = $idxA + 1
      $semillaSec = [string]$estado.sec
      foreach ($p in @($estado.conteos)) { $semilla[[string]$p.k] = [int]$p.n }
      foreach ($p in @($estado.conteos)) { $dict[[string]$p.k] = [int]$p.n }
      $dictSec = $semillaSec
    } else {
      $relectura = $true
    }
  }
  if (-not $anclaOk -and $script:horasAtras -gt 0) {
    $corte = (Get-Date).AddHours(-$script:horasAtras).ToString('yyyy-MM-dd HH:mm:ss')
    $desde = Desde-Corte $gp $filas $corte
  }
  $items = New-Object System.Collections.Generic.List[object]
  $gate0 = 0
  $parcial = $false
  $hastaIdx = $desde - 1
  $hastaTexto = ''
  $tramo = [Diagnostics.Stopwatch]::StartNew()
  for ($r = $desde; $r -lt $filas; $r++) {
    $c = Fila-Celdas $gp $r
    $hastaIdx = $r
    if ($c[0] -match '^\d{4}-\d{2}-\d{2}$' -and $c[1] -match '^\d{2}:\d{2}:\d{2}$') {
      $sec = $c[0] + ' ' + $c[1]
      if ($sec -ne $dictSec) { $dict = Nuevo-Diccionario; $dictSec = $sec }
      $clave = $c -join "`t"
      $ord = 0
      if ($dict.ContainsKey($clave)) { $ord = $dict[$clave] }
      $dict[$clave] = $ord + 1
      $items.Add(@{ idx = $r; texto = $clave; sec = $sec; ord = $ord; ordNext = ($ord + 1); cel = $c })
      if ((($c[5]) -replace '\s', '') -eq '0') { $gate0++ }
    }
    if ($r -lt ($filas - 1) -and ($tramo.Elapsed.TotalSeconds -ge $script:topeTramoSeg -or $items.Count -ge $LOTE_MAX)) {
      $hastaTexto = ($c -join "`t")
      $parcial = $true; break
    }
  }
  # Revalidación: misma cantidad de filas y el último punto de referencia sigue igual.
  if ([int]$gp.Current.RowCount -ne $filas) { return $null }
  $ref = $null
  if ($items.Count -gt 0) { $ref = $items[$items.Count - 1] }
  elseif ($anclaOk) { $ref = @{ idx = [int]$estado.ancla.idx; texto = [string]$estado.ancla.texto } }
  if ($ref -and (((Fila-Celdas $gp ([int]$ref.idx)) -join "`t") -ne $ref.texto)) { return $null }
  return @{ items = $items; relectura = $relectura; gate0 = $gate0; semilla = $semilla; semillaSec = $semillaSec; anclaOk = $anclaOk; parcial = $parcial; hastaIdx = $hastaIdx; hastaTexto = $hastaTexto }
}

# Conteos de la última fila enviada (lote que termina en $j): semilla más lo leído hasta $j, del mismo segundo.
function Conteos-Hasta($lec, $j) {
  $sec = $lec.items[$j].sec
  $d = Nuevo-Diccionario
  if ($lec.semillaSec -eq $sec) { foreach ($kv in $lec.semilla.GetEnumerator()) { $d[$kv.Key] = $kv.Value } }
  for ($i = 0; $i -le $j; $i++) { if ($lec.items[$i].sec -eq $sec) { $d[$lec.items[$i].texto] = $lec.items[$i].ordNext } }
  $salida = New-Object System.Collections.Generic.List[object]
  foreach ($kv in $d.GetEnumerator()) { $salida.Add(@{ k = $kv.Key; n = $kv.Value }) }
  return , $salida.ToArray()
}

# ---- E1.3: vigilante y autoactualización ----
# La llave ya no sirve: el vigilante lo ve en REVOCADA y borra la tarea programada (no vuelve a arrancar).
function Marca-Revocada {
  try { [IO.File]::WriteAllText($archivoRevocada, (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'), $UTF8) } catch { }
}

# Fin de cada ciclo: el vigilante mira la fecha y la versión para saber si el lector sigue sano.
# $tipo: inicio (recién arrancado) | vivo (ciclo con falla) | ciclo (ciclo sano con envío aceptado: solo eso
# confirma una versión nueva).
function Escribe-Latido([string]$tipo) {
  try { [IO.File]::WriteAllText($archivoLatido, ((Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz') + ' ' + $VERSION + ' ' + $tipo), $UTF8) } catch { }
}

function Sha256-Hex([byte[]]$b) {
  $h = [Security.Cryptography.SHA256]::Create()
  try { return (-join ($h.ComputeHash($b) | ForEach-Object { $_.ToString('x2') })) } finally { $h.Dispose() }
}

# La función ofrece { version, sha256 } solo si un admin pulsó «Publicar». Baja el lector de ESA misma
# función (con la llave), comprueba el sha256 sobre los bytes recibidos y que declare esa versión, y lo deja
# en lector-nuevo.ps1. Nunca ejecuta nada: el vigilante lo pone en marcha y vuelve atrás si no late.
# Devuelve '' (nada que hacer) | 'bajada eX' | otro motivo para el latido.
function Revisa-Actualizacion {
  $act = $script:actualizar
  if (-not $act) { return '' }
  $v = [string]$act.version
  $sha = ([string]$act.sha256).ToLower()
  if ($v -notmatch '^e\d{1,2}(\.\d{1,2}){1,2}$' -or $sha -notmatch '^[0-9a-f]{64}$') { return 'oferta-mal-formada' }
  if ($v -eq $VERSION) { return '' }
  # Sin tarea programada nadie pondría la versión nueva: el lector sigue con la actual y lo informa.
  if ((Modo-Arranque) -ne 'tarea') { return ('sin-tarea ' + $v) }
  if ((Test-Path -LiteralPath $archivoRechazadas) -and (@(Get-Content -LiteralPath $archivoRechazadas -ErrorAction SilentlyContinue) -contains $sha)) { return ('rechazada ' + $v) }
  if ((Test-Path -LiteralPath $archivoNuevo) -and (Test-Path -LiteralPath $archivoNuevoInfo)) { return ('bajada ' + $v) }
  $b = $null
  try {
    $r = Invoke-WebRequest -Uri ($url + '?lector=' + [uri]::EscapeDataString($v)) -Method Get -Headers @{ Authorization = ('Bearer ' + $script:llave) } -UseBasicParsing -TimeoutSec 60
    if ([int]$r.StatusCode -ne 200) { return ('sin-descarga ' + $v) }
    $b = $r.RawContentStream.ToArray()
  } catch { return ('sin-descarga ' + $v) }
  if (-not $b -or $b.Length -lt 1000) { return ('sin-descarga ' + $v) }
  if ((Sha256-Hex $b) -ne $sha) { Log ('Actualización ' + $v + ' descartada: el sha256 no coincide.'); return ('hash-distinto ' + $v) }
  $texto = (New-Object System.Text.UTF8Encoding($false)).GetString($b)
  if ($texto -notmatch ("(?m)^\`$VERSION = '" + [regex]::Escape($v) + "'\r?$")) { Log ('Actualización ' + $v + ' descartada: no declara esa versión.'); return ('version-distinta ' + $v) }
  try {
    [IO.File]::WriteAllBytes($archivoNuevo, $b)
    [IO.File]::WriteAllText($archivoNuevoInfo, (ConvertTo-Json -InputObject @{ version = $v; sha256 = $sha } -Compress), $UTF8)
  } catch { return ('sin-escribir ' + $v) }
  Log ('Actualización ' + $v + ' bajada y verificada (sha256 ' + $sha.Substring(0, 8) + '): el lector sale y el vigilante la pone en marcha.')
  return ('bajada ' + $v)
}

# ¿Lo levanta la tarea programada? (latido «arranque»: tarea | manual)
function Modo-Arranque {
  try { if (Get-ScheduledTask -TaskName $TAREA -ErrorAction Stop) { return 'tarea' } } catch { }
  return 'manual'
}

# Envía un lote. Devuelve: ok | reintento | fin (401/403: el lector termina).
function Envia($filas, $estC) {
  $cuerpo = @{ v = 1; equipo = $equipo; informe = 'pieza'; leidoEn = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'); filas = [object[]]@($filas); estado = $estC }
  $json = ConvertTo-Json -InputObject $cuerpo -Depth 5 -Compress
  $bytes = $UTF8.GetBytes($json)
  $code = -1
  $cuerpoResp = ''
  try {
    $r = Invoke-WebRequest -Uri $url -Method Post -Headers @{ Authorization = ('Bearer ' + $script:llave) } -ContentType 'application/json; charset=utf-8' -Body $bytes -UseBasicParsing -TimeoutSec 60
    $code = [int]$r.StatusCode
    $cuerpoResp = [string]$r.Content
  } catch {
    $resp = $_.Exception.Response
    if ($resp) { try { $code = [int]$resp.StatusCode } catch { $code = -1 } }
  }
  if ($code -eq 200) {
    $detener = $false
    $jr = $null
    try { $jr = ConvertFrom-Json $cuerpoResp } catch { }
    if ($jr) { try { $detener = [bool]$jr.detener } catch { } }
    if ($detener) { Log 'HTTP 200 con detener=true: el lector termina.'; Marca-Revocada; return 'fin' }
    $script:actualizar = $null
    if ($jr -and $jr.actualizar) { $script:actualizar = $jr.actualizar }
    return 'ok'
  }
  if ($code -eq 403) { Log 'HTTP 403: llave revocada. El lector termina.'; Marca-Revocada; return 'fin' }
  if ($code -eq 401) { Log 'HTTP 401: sin llave o llave desconocida. El lector termina.'; Marca-Revocada; return 'fin' }
  if ($code -eq -1) { Log 'Sin respuesta (red o tiempo agotado): se reintenta en el ciclo siguiente.' }
  else { Log ('HTTP ' + $code + ': se reintenta en el ciclo siguiente sin avanzar el ancla.') }
  return 'reintento'
}

# Un ciclo completo: pulsa Actualizar, espera la estabilización, lee y envía. Devuelve un resumen para el log.
function Ciclo($estado, $reloj, [bool]$refrescar) {
  $res = @{ error = ''; ftabla = 0; leidas = 0; enviadas = 0; relectura = $false; parcial = $false; pendientes = 0; gate0 = 0; rango = [string[]]@(); limite = $false; primera = $estado.primera; ultima = $estado.ultima; piezas = $estado.piezas; fin = '' }
  $foto = Foto
  $res.rango = $foto.rango
  $res.limite = $foto.limite
  if ($foto.error) { $res.error = $foto.error; return $res }
  $res.ftabla = $foto.filas
  $script:ultFoto = @{ ftabla = $foto.filas; rango = $foto.rango; limite = $foto.limite }

  # Un ciclo de puesta al día (la lectura anterior quedó a medias) no pulsa «Actualizar» ni espera la recarga,
  # y tampoco mueve el rango.
  $aj = $null
  if ($refrescar) {
    $boton = Boton-Actualizar (Ventana-De $foto.el)
    if (-not $boton) { $res.error = 'sin-boton'; return $res }
    # Con la sesión bloqueada no se mueve el rango (un fallo ahí apagaría el ajuste por toda la corrida).
    if ($script:rangoAuto -and -not $script:ajusteApagado -and -not $script:bloqueada) { $aj = Ajusta-Rango $foto.el $estado }
    try { $boton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
    catch { $res.error = 'invoke-fallo'; return $res }

    Espera $esperaRecarga
    $foto = Foto
    if ($foto.error) { $res.error = $foto.error; return $res }
    $script:ultFoto = @{ ftabla = $foto.filas; rango = $foto.rango; limite = $foto.limite }
  }
  $res.rango = $foto.rango
  $res.limite = $foto.limite

  # Estabilidad: tres lecturas iguales de RowCount separadas 2 s (tope 120 s).
  $ult = -1
  $iguales = 0
  $t0 = [Diagnostics.Stopwatch]::StartNew()
  $n = -1
  while ($true) {
    if ($reloj.Elapsed.TotalSeconds -gt $script:topeCicloSeg) { throw 'tope-10-min' }
    try { $n = [int]$foto.gp.Current.RowCount } catch { $n = -1 }
    if ($n -lt 0) {
      Espera 1
      $foto = Foto
      if ($foto.error) { $res.error = $foto.error; return $res }
      continue
    }
    # Con el rango corto la tabla puede quedar vacía de verdad: entonces 0 filas también vale como estable.
    if ($n -eq $ult -and ($n -gt 0 -or $aj)) { $iguales++ } else { $iguales = 1; $ult = $n }
    if ($iguales -ge 3) { break }
    if ($t0.Elapsed.TotalSeconds -gt 120) { $res.error = 'tabla-inestable'; return $res }
    Espera 2
  }

  # Tras mover el rango: comprobar que Matrix lo tomó y buscar el ancla por contenido (su índice cambió).
  if ($aj) {
    Verifica-Ajuste $aj $foto.gp $n
    $ra = Re-Ancla $foto.gp $n $estado
    Log ('reancla=' + $ra)
  }

  # Lectura, con un reintento si la tabla cambió mientras se leía.
  $lec = Lee-Tabla $foto.gp $n $estado $reloj
  if (-not $lec) {
    Espera 2
    $foto = Foto
    if ($foto.error) { $res.error = $foto.error; return $res }
    $n = [int]$foto.gp.Current.RowCount
    if ($aj) { [void](Re-Ancla $foto.gp $n $estado) }
    $lec = Lee-Tabla $foto.gp $n $estado $reloj
    if (-not $lec) { $res.error = 'tabla-cambio'; return $res }
  }
  $res.ftabla = $n
  $res.relectura = $lec.relectura
  $res.gate0 = $lec.gate0
  $res.parcial = [bool]$lec.parcial
  if ($lec.parcial) { $res.pendientes = [math]::Max(0, [int]($n - $lec.hastaIdx - 1)) }
  $res.lec = $lec
  $res.base = $(if ($lec.relectura) { 0 } else { $estado.piezas })
  return $res
}

# Sesión de Windows bloqueada: LogonUI corre mientras se muestra la pantalla de bloqueo.
function Sesion-Bloqueada {
  try { return (@(Get-Process -Name LogonUI -ErrorAction SilentlyContinue).Count -gt 0) } catch { return $false }
}

function Fecha-Hora($cel) { return ('{0} {1}' -f $cel[0], $cel[1]) }

# ---------- Arranque ----------
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$nuevoMutex = $false
$script:mutex = New-Object System.Threading.Mutex -ArgumentList @($false, 'Local\EspejoGraderLector', ([ref]$nuevoMutex))
if (-not $nuevoMutex) { Log 'Ya hay un lector corriendo: este proceso sale.'; exit 0 }
$script:topeCicloSeg = $topeCiclo
$script:topeTramoSeg = $topeTramo
$script:horasAtras = $horasAtras
$script:ultFoto = $null
$script:rangoAuto = $rangoAuto
$script:ajusteApagado = $false
$script:rangoOriginal = $null
$script:ajuste = $(if ($rangoAuto) { '' } else { 'apagado' })
try { (Get-Process -Id $PID).PriorityClass = 'BelowNormal' } catch { }
# Que el equipo no se suspenda mientras el lector corre (ES_CONTINUOUS | ES_SYSTEM_REQUIRED). No mantiene la
# pantalla encendida ni evita el bloqueo con contraseña: esa política de planta no se toca.
try {
  Add-Type -Namespace EspejoGrader -Name Energia -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);' -ErrorAction Stop
  [void][EspejoGrader.Energia]::SetThreadExecutionState([uint32]2147483649)
} catch { }
$script:bloqueada = $false
$script:actualizar = $null
try { [IO.File]::WriteAllText($archivoPid, [string]$PID, $UTF8) } catch { }
$script:arranque = Modo-Arranque
$script:actualiz = ''
if (Test-Path -LiteralPath $archivoActualiz) { try { $script:actualiz = ([IO.File]::ReadAllText($archivoActualiz)).Trim() } catch { } }
if ($script:actualiz.Length -gt 60) { $script:actualiz = $script:actualiz.Substring(0, 60) }
try { $script:llave = Lee-Llave } catch { Log 'No se pudo leer llave.dat (falta o no es de este usuario). El lector termina.'; exit 1 }
if (-not $script:llave) { Log 'llave.dat vacío. El lector termina.'; exit 1 }
Log ('Arranque ' + $VERSION + ' (' + $script:arranque + '): equipo=' + $equipo + ' cada=' + $cada + ' s, filtro=' + $filtro + ', dir=' + $dir)

$estado = Carga-Estado
$terminar = $false
# Latido inmediato: Matrix queda visible como «vivo» sin esperar el primer ciclo.
$estIni = @{ version = $VERSION; arranque = $script:arranque; actualiz = [string]$script:actualiz; ajuste = [string]$script:ajuste; filasTabla = 0; piezas = [int]$estado.piezas; primera = [string]$estado.primera; ultima = [string]$estado.ultima; rango = [string[]]@(); limite = $false; gate0 = 0; relectura = $false; error = 'iniciando' }
$respIni = Envia @() $estIni
if ($respIni -eq 'fin') { $terminar = $true }
Escribe-Latido 'inicio'
if (-not $terminar) {
  $ra = Revisa-Actualizacion
  if ($ra) { $script:actualiz = $ra }
  if ($ra -like 'bajada *') { $terminar = $true }
}
$refrescar = $true
while (-not $terminar) {
  $reloj = [Diagnostics.Stopwatch]::StartNew()
  $res = $null
  $script:bloqueada = Sesion-Bloqueada
  try {
    Revisa-Detener
    # Ciclo puede dejar salida suelta en el pipeline: se toma solo el resumen (hashtable).
    $res = @(Ciclo $estado $reloj $refrescar) | Where-Object { $_ -is [hashtable] } | Select-Object -Last 1
  } catch {
    $msg = [string]$_.Exception.Message
    if ($msg -eq 'DETENER') {
      try { Remove-Item -LiteralPath $archivoDetener -Force } catch { }
      Log 'Archivo DETENER: el lector termina.'
      break
    }
    Log ('Error de ciclo: ' + $msg)
    # Se conserva lo que la última Foto válida alcanzó a ver.
    $ftErr = 0; $rangoErr = [string[]]@(); $limiteErr = $false
    if ($script:ultFoto) { $ftErr = [int]$script:ultFoto.ftabla; $rangoErr = [string[]]@($script:ultFoto.rango); $limiteErr = [bool]$script:ultFoto.limite }
    $res = @{ error = $(if ($msg -eq 'tope-10-min') { 'tope-10-min' } else { 'excepcion' }); ftabla = $ftErr; leidas = 0; enviadas = 0; relectura = $false; parcial = $false; pendientes = 0; gate0 = 0; rango = $rangoErr; limite = $limiteErr; primera = $estado.primera; ultima = $estado.ultima; piezas = $estado.piezas; fin = '' }
  }

  $items = @()
  if ($res.lec) { $items = $res.lec.items.ToArray() }
  $base = $res.base
  if ($null -eq $base) { $base = $estado.piezas }
  $piezas = $base + $items.Count
  if ($res.lec -and $res.lec.relectura) { $piezas = $items.Count }
  $primera = $estado.primera
  if (($res.lec -and $res.lec.relectura) -or -not $primera) { $primera = '' }
  if ($items.Count -gt 0 -and -not $primera) { $primera = (Fecha-Hora ($items[0].cel)) }
  $ultima = $estado.ultima
  if ($items.Count -gt 0) { $ultima = (Fecha-Hora ($items[$items.Count - 1].cel)) }
  # Con la sesión bloqueada, si no pudo leer, el motivo que se informa es el bloqueo (el original queda en el log).
  $errC = [string]$res.error
  if ($script:bloqueada -and $errC) { $errC = 'pantalla-bloqueada' }
  $estC = @{ version = $VERSION; arranque = $script:arranque; actualiz = [string]$script:actualiz; ajuste = [string]$script:ajuste; bloqueada = [bool]$script:bloqueada; filasTabla = [int]$res.ftabla; piezas = [int]$piezas; primera = $primera; ultima = $ultima; rango = [string[]]@($res.rango); limite = [bool]$res.limite; gate0 = [int]$res.gate0; relectura = [bool]$res.relectura; error = $errC; seg = [math]::Round($reloj.Elapsed.TotalSeconds, 1); leidas = [int]$items.Count; pendientes = [int]$res.pendientes; parcial = [bool]$res.parcial }

  $enviadas = 0
  $fin = ''
  if ($items.Count -eq 0) {
    $resp = Envia @() $estC
    if ($resp -eq 'fin') { $fin = 'fin' }
  } else {
    $inicio = 0
    while ($inicio -lt $items.Count) {
      $ultimo = [math]::Min($items.Count - 1, $inicio + $LOTE_MAX - 1)
      $lote = New-Object System.Collections.Generic.List[string]
      for ($i = $inicio; $i -le $ultimo; $i++) { $lote.Add((($items[$i].cel) -join "`t") + "`t#" + [string]$items[$i].ord) }
      $resp = Envia ($lote.ToArray()) $estC
      if ($resp -ne 'ok') { if ($resp -eq 'fin') { $fin = 'fin' }; break }
      # Solo tras el 200: avanza el ancla, los conteos y las piezas.
      $estado.ancla = @{ idx = [int]$items[$ultimo].idx; texto = [string]$items[$ultimo].texto }
      $estado.conteos = Conteos-Hasta $res.lec $ultimo
      $estado.sec = [string]$items[$ultimo].sec
      $estado.piezas = $base + $ultimo + 1
      $estado.primera = $primera
      $estado.ultima = (Fecha-Hora ($items[$ultimo].cel))
      Guarda-Estado $estado
      $enviadas += ($ultimo - $inicio + 1)
      $inicio = $ultimo + 1
    }
  }

  # Lectura a medias y todo enviado: avanza el ancla hasta la última fila recorrida (las filas sin fecha
  # del final del tramo no producen lote). Solo si el tramo fue parcial: al final de la tabla las filas
  # de cierre sin fecha cambian de índice cuando la tabla crece.
  $envioOk = ($enviadas -eq $items.Count)
  if ($res.lec -and $res.lec.parcial -and -not $fin -and $envioOk) {
    $idxActual = -1
    if ($estado.ancla -and ($items.Count -gt 0 -or -not $res.lec.relectura)) { $idxActual = [int]$estado.ancla.idx }
    if ([int]$res.lec.hastaIdx -gt $idxActual) {
      $estado.ancla = @{ idx = [int]$res.lec.hastaIdx; texto = [string]$res.lec.hastaTexto }
      if ($idxActual -lt 0 -and $res.lec.relectura) { $estado.conteos = @(); $estado.sec = ''; $estado.piezas = 0; $estado.primera = ''; $estado.ultima = '' }
      Guarda-Estado $estado
    }
  }

  $seg = [math]::Round($reloj.Elapsed.TotalSeconds, 1)
  $leidas = $items.Count
  Log ('ciclo: filas-pieza leídas=' + $leidas + ' enviadas=' + $enviadas + ' filas-tabla=' + [int]$res.ftabla + ' seg=' + $seg + ' relectura=' + [bool]$res.relectura + ' parcial=' + [bool]$res.parcial + ' pendientes=' + [int]$res.pendientes + ' bloqueada=' + [bool]$script:bloqueada + ' error=' + [string]$res.error)
  if ($fin) { $terminar = $true; break }
  # «ciclo» (confirma una versión nueva) solo si la función aceptó el envío y el ciclo no reventó; si no, «vivo».
  $tipoLat = 'vivo'
  if ($resp -eq 'ok' -and @('excepcion', 'tope-10-min') -notcontains [string]$res.error) { $tipoLat = 'ciclo' }
  Escribe-Latido $tipoLat
  if ($res.lec -and $res.lec.parcial -and -not [string]$res.error -and $envioOk) { } else {
    $ra = Revisa-Actualizacion
    if ($ra) { $script:actualiz = $ra }
    if ($ra -like 'bajada *') { $terminar = $true; break }
  }
  # Si quedó a medias (sin error ni fallo de envío), el siguiente ciclo sigue ya, sin pulsar «Actualizar».
  $espera = $cada
  $refrescar = $true
  if ($res.lec -and $res.lec.parcial -and -not [string]$res.error -and $envioOk) { $espera = 5; $refrescar = $false }
  try { Espera $espera } catch {
    if ([string]$_.Exception.Message -eq 'DETENER') {
      try { Remove-Item -LiteralPath $archivoDetener -Force } catch { }
      Log 'Archivo DETENER: el lector termina.'
      $terminar = $true
    }
  }
}
Log 'Fin del lector.'
try { $script:mutex.ReleaseMutex() } catch { }
exit 0