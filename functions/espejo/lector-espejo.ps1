# Lector del espejo del grader, contrato E1 (fuente: espejo-grader-e1-contrato.md).
# Corre OCULTO y en una sola instancia. Lee «Pieza pieza Grader» de Matrix CG por UI Automation y envía las
# filas-pieza nuevas a espejoGraderIngesta. Controles que acciona (y ningún otro, nunca datos):
#   1. las 2 fechas del rango (ValuePattern.SetValue): inicio = última pieza enviada - 10 min (o 00:00 de hoy),
#      fin = mañana 00:00; nunca más atrás que el corte por antigüedad;
#   2. la casilla «Limitar el informe…» (TogglePattern.Toggle), solo para desmarcarla;
#   3. el botón «Actualizar» (InvokePattern.Invoke);
#   4. e1.9, solo con el archivo <dir>\PERIODO: la opción del combo de periodo (SelectionItemPattern.Select), una vez por
#      archivo, sin desplegar el combo.
#   5. e1.10, solo con el archivo <dir>\ALTERNAR: la pestaña, el botón o la opción de menú de nombre EXACTO «Puerta 0» y
#      la de «Pieza pieza Grader» para volver (InvokePattern.Invoke; el menú se abre con ExpandCollapsePattern.Expand).
#      En «Puerta 0» solo desmarca «Limitar» y pulsa «Actualizar» una vez. Nunca lista, árbol ni combo.
# Si no encuentra EXACTAMENTE 2 fechas editables y 1 casilla «Limitar el informe», no toca ni el rango ni la casilla.
# Si Matrix no toma el rango nuevo, devuelve las fechas como estaban y sigue sin moverlas (clave «ajuste» del latido).
# e1.5: la casilla se revisa en cada «Actualizar» aunque las fechas fallen. Matrix (Qt) ignora la escritura de sus
# fechas por UI Automation: entonces «ajuste» = fechas-fijas y el fin del rango hay que moverlo a mano.
# Mientras corre pide a Windows que no suspenda el equipo ni apague la pantalla (SetThreadExecutionState, e1.7; e1.8 lo
# devuelve al salir y dice por qué falló). Con la sesión bloqueada igual intenta leer, no mueve el rango y lo informa
# («bloqueada», «pantalla»).
# Configuración por variables de entorno (opcionales): ESPEJO_URL, ESPEJO_CADA (s, 300), ESPEJO_FILTRO
# (matrix|marelec), ESPEJO_DIR (%LOCALAPPDATA%\espejo-grader), ESPEJO_EQUIPO (nombre del PC),
# ESPEJO_ESPERA_RECARGA (s, 12), ESPEJO_TOPE_CICLO (s, 600), ESPEJO_TOPE_TRAMO (s, 90: la lectura de la
# tabla se corta en tramos y el siguiente ciclo la continúa), ESPEJO_HORAS_ATRAS (h, 16: no lee filas más
# viejas; 0 o negativo = sin corte), ESPEJO_RANGO_AUTO (0 = no mueve el rango ni la casilla, como e1.1).
# La llave vive cifrada (DPAPI) en <dir>\llave.dat. Nunca se escribe en el log ni en pantalla.
# Sin Write-Host ni ventanas: todo va a <dir>\lector.log.
# e1.4 — lectura en vivo a pedido: si la respuesta de un envío trae vivoSeg (botón «En vivo 15 min» del monitor), la
# espera entre ciclos baja a 60 s hasta ese plazo (nunca menos: Matrix tarda ~12 s en recargar) y vuelve sola a
# ESPEJO_CADA. El plazo se arma con los segundos que manda la función, no con el reloj de este PC. Latido: clave «vivo».
# e1.6 — recarga puntual de historia: con el archivo <dir>\RECARGA el lector lee ENTERO el rango que Orel puso a mano
# en Matrix (sin el corte ESPEJO_HORAS_ATRAS), por tramos y lotes, con su propia ancla en <dir>\recarga.json: el
# estado normal (estado.json) no se toca. En recarga no mueve las fechas (solo desmarca «Limitar» y pulsa «Actualizar»
# una vez) y no lee si «Limitar» sigue marcada. Al llegar al final borra RECARGA y recarga.json y vuelve solo al modo
# normal, buscando su ancla por contenido. Borrar RECARGA a medias la cancela. El servidor no duplica: cada fila lleva
# su #n por segundo y se une con arrayUnion por hora. Latido: clave «recarga».

$ErrorActionPreference = 'Continue'
# e1.7 — leer siempre, sin nadie en planta:
#   · Pantalla: pide a Windows que no apague la pantalla ni suspenda (SetThreadExecutionState con ES_DISPLAY_REQUIRED),
#     sin simular teclas ni mouse. Si la sesión se bloquea igual, lo informa con la hora y las políticas de bloqueo que
#     lee del registro (solo lectura; una política de TI no se evade). Latido: clave «pantalla».
#   · Matrix: si no corre, lo abre minimizado y sin activar con la misma ruta del proceso que vio antes (matrix-ruta.txt)
#     o el único .exe «Matrix» de la carpeta de Marelec. Como mucho una vez cada 30 min y 6 al día (abrir.json). No lo
#     cierra ni lo configura: si no abre el informe solo, el latido lo dice. ESPEJO_ABRIR_MATRIX=0 lo apaga. Clave «matrix».
#   · Huecos: compara las filas por hora de la tabla de Matrix (búsqueda binaria en los bordes de hora) con las que tiene
#     el espejo (GET ?conteos= a la función) y relee solo las horas que faltan, por tramos, entre los ciclos del turno: el
#     turno en curso va primero («Actualizar» al menos cada ESPEJO_CADA) y en modo vivo no se rellena. El servidor no
#     duplica (#n por segundo + arrayUnion). Solo dentro del rango que muestra Matrix: Qt ignora la escritura de las
#     fechas por UI Automation y el lector no teclea. Latido: clave «huecos» (filas releídas / filas de las horas con hueco).
#   · El error del ciclo va tal cual aunque la sesión esté bloqueada (antes se tapaba con «pantalla-bloqueada»).
#   · Recarga e1.6: el total del avance es el de la última tabla leída (antes salía «/0» si el ciclo fallaba).
# e1.8 — sesión despierta sin ventana aparte (probado a mano en planta el 23-11: con el pedido vivo no salió el
# protector de pantalla en ~10 min):
#   · El pedido de pantalla se hace desde el mismo lector oculto, al arrancar y en cada ciclo, en su único hilo.
#   · Si el tipo de Windows no se puede crear o Windows rechaza el pedido, la clave «pantalla» lo dice:
#     «no-pedida:<sin-tipo|rechazo|error>» (el detalle va al log una vez). Un tipo que ya existe no es error.
#   · Al salir limpio (DETENER, versión nueva, fin) devuelve el equipo a lo normal (solo ES_CONTINUOUS).

# e1.9 — periodo relativo del informe, APAGADO por defecto. Interruptor: el archivo <dir>\PERIODO (vacío = la primera
# opción conocida: últimas 24 h, último día, turno actual, hoy; con texto = esa opción exacta). Borrarlo lo apaga, pero
# NO devuelve el combo a «Usuario definido»: eso se hace a mano en Matrix.
#   · Siempre (aunque esté apagado) mira el combo de periodo solo leyendo: su valor y las opciones que expone cerrado.
#   · Encendido elige una vez por archivo (marca en periodo-hecho.txt, sobrevive a reinicios), nunca durante una
#     recarga ni con la sesión bloqueada, y no elige si ya está en esa opción. Nunca despliega el combo ni teclea.
#     Probado el 23-11 contra Qt 5.15 y 6.12 de prueba: Select sobre la opción NO cambia un QComboBox; lo esperable en
#     planta es «no-cambia», y entonces la opción se elige a mano una vez.
#   · Con el informe fuera de «Usuario definido» (elegido por el lector o a mano) no escribe las fechas; si quedan de solo
#     lectura igual desmarca «Limitar». Tras un cambio de periodo re-ancla por contenido.
#   · Latido: clave «periodo» (24 de 24): «<estado>[:<opción>] valor=<valor> ops=<opciones>», tope 200.

# e1.10 — informe «Puerta 0» (el motivo real de cada pieza en gate 0). Va en envíos propios (informe 'p0') con su estado
# aparte (graderEspejoEstado.p0): el latido de pieza sigue con sus 24 claves.
#   · Pasiva (siempre): si Matrix ya muestra «Puerta 0» (alguien lo dejó ahí), la lee sin tocar nada: cuando cambia su
#     número de filas, cada 30 min o a pedido. El latido de pieza sigue diciendo «otro-informe».
#   · Alternancia, APAGADA por defecto. Interruptor: el archivo <dir>\ALTERNAR (vacío = cualquier vía; con texto
#     pestana | boton | menu = solo esa). Cada hora, al cierre de turno (entre +10 y +55 min de las 07:00 y las 19:00) y a
#     pedido («Actualizar causas P0» en el monitor: la respuesta trae p0Pedido; se atiende una vez por pedido). Solo tras
#     un ciclo de pieza sano y enviado, nunca en recarga, con huecos por rellenar ni con la sesión bloqueada. Exige
#     exactamente un «Puerta 0» y un «Pieza pieza Grader» de la misma vía. Lee la tabla entera a memoria (tope
#     ESPEJO_TOPE_P0 s, 240), vuelve SIEMPRE a «Pieza pieza Grader» verificando el encabezado y recién entonces envía.
#     Si no vuelve, no reintenta: deja alternar-bloqueado.txt con la marca de ALTERNAR y no alterna más hasta que se
#     vuelva a escribir ALTERNAR. Una marca en p0.json avisa si el lector murió a medias: al arrancar intenta la vuelta.
#   · Con ALTERNAR apagado, un pedido se contesta «apagado» (sin filas) para que el monitor lo diga.
#   · Matrix reabierto por el lector: Qt suele ignorar el «minimizado» del arranque; durante 60 s el lector minimiza las
#     ventanas del proceso recién lanzado (WindowPattern.SetWindowVisualState). Sin verificar en planta.
$VERSION = 'e1.10'
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
# e1.7: abrir Matrix si no corre (0 = no), carpeta donde buscar su .exe, tope por ciclo del relleno de huecos (s) y
# cada cuánto se piden los conteos del espejo a la función (min).
$abrirMatrix = ($env:ESPEJO_ABRIR_MATRIX -ne '0')
$carpetaMatrix = Join-Path ([string]${env:ProgramFiles(x86)}) 'Marelec Food Technologies\MATRIX CG'
if ($env:ESPEJO_CARPETA_MATRIX) { $carpetaMatrix = $env:ESPEJO_CARPETA_MATRIX }
$topeHueco = 90
if ($env:ESPEJO_TOPE_HUECO) { $topeHueco = [double]$env:ESPEJO_TOPE_HUECO }
$minConteos = 30
if ($env:ESPEJO_MIN_CONTEOS) { $minConteos = [double]$env:ESPEJO_MIN_CONTEOS }
# e1.10: tope de la lectura de «Puerta 0» (s).
$topeP0 = 240
if ($env:ESPEJO_TOPE_P0) { $topeP0 = [double]$env:ESPEJO_TOPE_P0 }
$equipo =([string]$env:COMPUTERNAME) -replace '[^A-Za-z0-9_-]', ''
if ($env:ESPEJO_EQUIPO) { $equipo = ([string]$env:ESPEJO_EQUIPO) -replace '[^A-Za-z0-9_-]', '' }
if ($equipo.Length -gt 40) { $equipo = $equipo.Substring(0, 40) }
if (-not $equipo) { $equipo = 'PC' }

# Informes aceptados: solo el encabezado EXACTO. Cualquier otra tabla no se lee.
$INFORMES = @{
  'Pieza pieza Grader' = @('Fecha', 'Hora', 'Peso de las piezas', 'Cantidad de piezas', 'Lote', 'Gate', 'Calidad', 'Conservacion', 'Calibre', 'Producto', 'Turno')
  # e1.10: solo se lee pasiva o con ALTERNAR; Fecha y Hora van en las columnas 2 y 3.
  'Puerta 0' = @('Especie', 'Lote', 'Fecha', 'Hora', 'Turno', 'Gate', 'Cantidad de piezas', 'Calidad', 'Peso de las piezas', 'Error', 'peso en Gr')
}
$FORMATO_FECHA = '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$'
$LIMITE_LOG = 1MB
$LOTE_MAX = 2000
# e1.4: espera en modo vivo y tope del plazo que acepta (la regla de Firestore ya limita a 30 min).
$ESPERA_VIVO = 60
$VIVO_TOPE_SEG = 1800
$archivoLog = Join-Path $dir 'lector.log'
$archivoEstado = Join-Path $dir 'estado.json'
$archivoDetener = Join-Path $dir 'DETENER'
$archivoLlave = Join-Path $dir 'llave.dat'
# e1.6: orden de recarga de historia y el ancla propia de esa recarga.
$archivoRecarga = Join-Path $dir 'RECARGA'
$archivoRecargaEstado = Join-Path $dir 'recarga.json'
# e1.9: interruptor del periodo relativo y la marca de que ya se resolvió con ese archivo.
$archivoPeriodo = Join-Path $dir 'PERIODO'
$archivoPeriodoHecho = Join-Path $dir 'periodo-hecho.txt'
# E1.3: el vigilante (tarea programada) lee latido.txt y lector.pid; REVOCADA le dice que borre la tarea;
# lector-nuevo.ps1 + nuevo.json son una versión ya bajada y verificada que el vigilante pone en marcha.
$archivoLatido = Join-Path $dir 'latido.txt'
$archivoPid = Join-Path $dir 'lector.pid'
$archivoRevocada = Join-Path $dir 'REVOCADA'
$archivoNuevo = Join-Path $dir 'lector-nuevo.ps1'
$archivoNuevoInfo = Join-Path $dir 'nuevo.json'
$archivoRechazadas = Join-Path $dir 'rechazadas.txt'
$archivoActualiz = Join-Path $dir 'actualiz.txt'
# e1.7: ruta del Matrix que se vio corriendo y registro de las veces que el lector lo abrió.
$archivoRutaMatrix = Join-Path $dir 'matrix-ruta.txt'
$archivoAbrir = Join-Path $dir 'abrir.json'
# e1.10: interruptor de la alternancia a «Puerta 0», su bloqueo tras una vuelta fallida y el estado de Puerta 0.
$archivoAlternar = Join-Path $dir 'ALTERNAR'
$archivoAlternarBloq = Join-Path $dir 'alternar-bloqueado.txt'
$archivoP0 = Join-Path $dir 'p0.json'
$TAREA ='Espejo del grader'
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
function Carga-Estado([string]$archivo = $archivoEstado) {
  $e = Estado-Nuevo
  if (-not (Test-Path -LiteralPath $archivo)) { return $e }
  try {
    $j = Get-Content -LiteralPath $archivo -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.ancla) { $e.ancla = @{ idx = [int]$j.ancla.idx; texto = [string]$j.ancla.texto } }
    $e.piezas = [int]$j.piezas
    $e.primera = [string]$j.primera
    $e.ultima = [string]$j.ultima
    $e.sec = [string]$j.sec
    $lista = New-Object System.Collections.Generic.List[object]
    foreach ($p in @($j.conteos)) { if ($p) { $lista.Add(@{ k = [string]$p.k; n = [int]$p.n }) } }
    $e.conteos = $lista.ToArray()
  } catch {
    Log ((Split-Path -Leaf $archivo) + ' ilegible: se relee todo')
    return (Estado-Nuevo)
  }
  return $e
}
function Guarda-Estado($e, [string]$archivo = $archivoEstado) {
  try {
    $txt = ConvertTo-Json -InputObject $e -Depth 5
    $tmp = $archivo + '.tmp'
    [IO.File]::WriteAllText($tmp, $txt, $UTF8)
    Move-Item -LiteralPath $tmp -Destination $archivo -Force
  } catch { Log ((Split-Path -Leaf $archivo) + ' no guardado: ' + $_.Exception.Message) }
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
  # e1.7: la ruta del Matrix que corre queda guardada para volver a abrirlo si se cierra.
  foreach ($p in $procs) { try { Recuerda-Matrix ([string]$p.Path) } catch { } }
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

# Encabezado idéntico a la lista blanca (mismas columnas, mismo orden).
function Calza-Encabezado($enc, $esp) {
  $enc = @($enc)
  if ($enc.Count -ne $esp.Count) { return $false }
  for ($i = 0; $i -lt $esp.Count; $i++) { if ([string]$enc[$i] -ne $esp[$i]) { return $false } }
  return $true
}

# Foto de Matrix: informe, tabla más grande y campos. Devuelve error ('' si la tabla es «Pieza pieza Grader»).
function Foto {
  $acc = @{ grillas = (New-Object System.Collections.Generic.List[object]); casillas = (New-Object System.Collections.Generic.List[object]); fechas = (New-Object System.Collections.Generic.List[string]); licencia = $false; visitados = 0; procesos = 0 }
  $reloj = [Diagnostics.Stopwatch]::StartNew()
  Escanea $acc $reloj
  $f = @{ error = ''; el = $null; gp = $null; filas = 0; rango = [string[]]@(); limite = $false; p0 = $null }
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
  if (-not (Calza-Encabezado $enc $INFORMES['Pieza pieza Grader'])) {
    $f.error = 'otro-informe'
    # e1.10: con «Puerta 0» a la vista, su tabla queda para la lectura pasiva (el latido de pieza sigue «otro-informe»).
    if (Calza-Encabezado $enc $INFORMES['Puerta 0']) { $f.p0 = @{ el = $mejor.El; gp = $mejor.Gp; filas = $mejor.Filas } }
    return $f
  }
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
  # e1.9: con las fechas de solo lectura (p. ej. un periodo relativo) la casilla igual se entrega para desmarcarla.
  if ($d.soloLectura -or $h.soloLectura) { $r.error = 'solo-lectura'; $r.casilla = $lim[0]; return $r }
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

# Antes de «Actualizar»: desmarca «Limitar» (solo si está marcada) y escribe las 2 fechas (solo si cambian).
# e1.5: la casilla va por su cuenta. Un fallo de las fechas no la apaga, y ella se revisa en cada «Actualizar».
# Devuelve $null si no tocó nada; si tocó, lo necesario para verificar y deshacer (movio = las fechas cambiaron).
# e1.6: $soloCasilla (recarga de historia) no toca las fechas: el rango lo puso Orel a mano.
function Ajusta-Rango($el, $estado, [bool]$soloCasilla = $false) {
  $ctl = Controles-Rango (Ventana-Raiz $el)
  if ($ctl.error -and -not ($ctl.error -eq 'solo-lectura' -and $ctl.casilla)) { $script:ajuste = $ctl.error; return $null }
  # e1.9: fechas de solo lectura o informe fuera de «Usuario definido»: solo la casilla, nunca las fechas.
  if ($ctl.error -or $script:periodoRelativo) { $soloCasilla = $true }
  $toco = $false
  $script:casillaFalla = $false
  if ((Estado-Casilla $ctl.casilla.el) -eq 'On') {
    try { $ctl.casilla.el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle() } catch { Log ('ajuste: Matrix no dejó desmarcar «Limitar»: ' + $_.Exception.Message) }
    if ((Estado-Casilla $ctl.casilla.el) -eq 'Off') { $toco = $true; Log 'ajuste: casilla «Limitar» desmarcada.' }
    else { $script:casillaFalla = $true; Log ('ajuste: la casilla «Limitar» sigue en ' + (Estado-Casilla $ctl.casilla.el) + '.') }
  }
  $movio = $false
  $q = Rango-Deseado $estado
  if (-not $script:fechasApagadas -and -not $soloCasilla) { $movio = Mueve-Fechas $ctl $q }
  $script:ajuste = Texto-Ajuste
  if ($ctl.error -and $script:ajuste -eq 'ok') { $script:ajuste = $ctl.error }
  if (-not $toco -and -not $movio) { return $null }
  return @{ ctl = $ctl; orig = $script:rangoOriginal; q = $q; movio = $movio }
}

# Estado del ajuste para el latido. La casilla manda: si no se desmarca, el informe se corta en 10 000 filas.
function Texto-Ajuste {
  if ($script:casillaFalla) { return 'casilla-no-aplico' }
  if ($script:motivoFechas) { return $script:motivoFechas }
  return 'ok'
}

# Escribe las 2 fechas. Devuelve $true si quedaron movidas. Si Matrix no las toma, deja todo como estaba y apaga
# solo las fechas por el resto de la corrida. Matrix es Qt: su campo de fecha (QDateTimeEdit) acepta SetValue sin
# error pero lo ignora (probado el 21-11 con Qt 5 y Qt 6). Ese caso queda como «fechas-fijas».
function Mueve-Fechas($ctl, $q) {
  # Se deshace siempre hacia las fechas que había ANTES de que el lector tocara nada en esta corrida.
  if (-not $script:rangoOriginal) { $script:rangoOriginal = @{ desde = [string]$ctl.desde.val; hasta = [string]$ctl.hasta.val } }
  $orig = $script:rangoOriginal
  $antes = @{ desde = [string]$ctl.desde.val; hasta = [string]$ctl.hasta.val }
  $cambia = @{ desde = ($antes.desde -ne $q.desde); hasta = ($antes.hasta -ne $q.hasta) }
  if (-not $cambia.desde -and -not $cambia.hasta) { return $false }
  try {
    # Si el inicio nuevo queda después del fin actual, primero el fin (Matrix no ve un inicio > fin).
    if ([string]::CompareOrdinal($q.desde, $antes.hasta) -gt 0) {
      if ($cambia.hasta) { Escribe-Valor $ctl.hasta.el $q.hasta }
      if ($cambia.desde) { Escribe-Valor $ctl.desde.el $q.desde }
    } else {
      if ($cambia.desde) { Escribe-Valor $ctl.desde.el $q.desde }
      if ($cambia.hasta) { Escribe-Valor $ctl.hasta.el $q.hasta }
    }
  } catch {
    Log ('ajuste: Matrix rechazó las fechas: ' + $_.Exception.Message)
    Deshace-Rango $ctl $orig 'no-aplico'
    return $false
  }
  $leido = @{ desde = (Valor-De $ctl.desde.el); hasta = (Valor-De $ctl.hasta.el) }
  if ($leido.desde -eq $q.desde -and $leido.hasta -eq $q.hasta) {
    Log ('ajuste: rango ' + $q.desde + ' -> ' + $q.hasta)
    return $true
  }
  $detalle = 'escrito ' + $q.desde + ' -> ' + $q.hasta + ', leído ' + $leido.desde + ' -> ' + $leido.hasta
  if ($leido.desde -eq $antes.desde -and $leido.hasta -eq $antes.hasta) {
    # Nada cambió: no hay nada que devolver.
    $script:motivoFechas = 'fechas-fijas'
    $script:fechasApagadas = $true
    Log ('ajuste: Matrix ignora la escritura de las fechas (' + $detalle + '); el lector las deja como están y no vuelve a intentarlo en esta corrida.')
    return $false
  }
  Log ('ajuste: las fechas no quedaron como se escribieron (' + $detalle + ')')
  Deshace-Rango $ctl $orig 'no-aplico'
  return $false
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
  $script:motivoFechas = $motivo
  $script:fechasApagadas = $true
  $script:ajuste = Texto-Ajuste
  Log ('ajuste: ' + $motivo + '; el lector deja el rango como estaba y sigue sin moverlo (la casilla «Limitar» la sigue revisando).')
}

# Tras «Actualizar»: la casilla desmarcada y, si se movieron, las fechas siguen escritas y la tabla empieza en el
# inicio pedido.
function Verifica-Ajuste($aj, $gp, [int]$filas) {
  if (-not $aj) { return }
  $ctl = $aj.ctl
  if ((Estado-Casilla $ctl.casilla.el) -ne 'Off') {
    $script:casillaFalla = $true
    $script:ajuste = Texto-Ajuste
    Log ('ajuste: tras «Actualizar» la casilla «Limitar» volvió a ' + (Estado-Casilla $ctl.casilla.el) + '.')
  }
  if (-not $aj.movio) { return }
  if ((Valor-De $ctl.desde.el) -ne $aj.q.desde -or (Valor-De $ctl.hasta.el) -ne $aj.q.hasta) {
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
# Devuelve $null si la tabla cambió durante la lectura. e1.6: $sinCorte (recarga de historia) lee desde la fila 0.
function Lee-Tabla($gp, [int]$filas, $estado, $reloj, [bool]$sinCorte = $false) {
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
  if (-not $anclaOk -and $script:horasAtras -gt 0 -and -not $sinCorte) {
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

# e1.4: plazo del modo vivo a partir de los segundos que devuelve la función (vivoSeg). $null = cada ESPEJO_CADA.
# Sin campo, 0, negativo o no numérico → $null; más de 30 min → se recorta a 30 min.
function Fin-Vivo($seg, [datetime]$ahora) {
  $s = 0.0
  if ($null -eq $seg -or -not [double]::TryParse([string]$seg, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$s)) { return $null }
  if ([double]::IsNaN($s) -or $s -le 0) { return $null }
  return $ahora.AddSeconds([math]::Min($s, $VIVO_TOPE_SEG))
}

# e1.4: espera hasta el ciclo siguiente. En vivo, 60 s (si ESPEJO_CADA ya es menor, se respeta: nunca la baja más).
function Espera-Ciclo([double]$cadaSeg, $finVivo, [datetime]$ahora) {
  if ($finVivo -and $ahora -lt $finVivo) { return [math]::Min($cadaSeg, $ESPERA_VIVO) }
  return $cadaSeg
}

# Envía un lote. Devuelve: ok | reintento | fin (401/403: el lector termina).
# e1.10: $informe = 'p0' para las filas de «Puerta 0» (su estado va aparte en el servidor).
function Envia($filas, $estC, [string]$informe = 'pieza') {
  $cuerpo = @{ v = 1; equipo = $equipo; informe = $informe; leidoEn = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'); filas = [object[]]@($filas); estado = $estC }
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
    # e1.10: pedido de Puerta 0, tal cual (del texto crudo: PowerShell 7 convertiría el ISO a fecha y el monitor lo
    # compara letra por letra). Sin campo = sin pedido vigente.
    $script:p0Pedido = Iso-Pedido $cuerpoResp
    # e1.4: cada 200 dice si sigue el modo vivo (sin vivoSeg = vuelve a ESPEJO_CADA). Un envío fallido no lo toca.
    $antes = $script:vivoFin
    $script:vivoFin = $null
    if ($jr) { try { $script:vivoFin = Fin-Vivo $jr.vivoSeg (Get-Date) } catch { $script:vivoFin = $null } }
    if ($script:vivoFin -and -not $antes) { Log ('Lectura en vivo pedida: cada ' + (Espera-Ciclo $cada $script:vivoFin (Get-Date)) + ' s hasta ' + $script:vivoFin.ToString('HH:mm:ss') + '.') }
    elseif ($antes -and -not $script:vivoFin) { Log ('Fin de la lectura en vivo: vuelve a cada ' + $cada + ' s.') }
    return 'ok'
  }
  if ($code -eq 403) { Log 'HTTP 403: llave revocada. El lector termina.'; Marca-Revocada; return 'fin' }
  if ($code -eq 401) { Log 'HTTP 401: sin llave o llave desconocida. El lector termina.'; Marca-Revocada; return 'fin' }
  if ($code -eq -1) { Log 'Sin respuesta (red o tiempo agotado): se reintenta en el ciclo siguiente.' }
  else { Log ('HTTP ' + $code + ': se reintenta en el ciclo siguiente sin avanzar el ancla.') }
  return 'reintento'
}

# Un ciclo completo: pulsa Actualizar, espera la estabilización, lee y envía. Devuelve un resumen para el log.
# e1.6: $recarga = lectura entera del rango de Matrix (solo casilla, sin corte, no lee con «Limitar» marcada);
# $reanclar = buscar el ancla por contenido aunque no se haya tocado nada (al volver de una recarga).
function Ciclo($estado, $reloj, [bool]$refrescar, [bool]$recarga = $false, [bool]$reanclar = $false) {
  $res = @{ error = ''; ftabla = 0; leidas = 0; enviadas = 0; relectura = $false; parcial = $false; pendientes = 0; gate0 = 0; rango = [string[]]@(); limite = $false; primera = $estado.primera; ultima = $estado.ultima; piezas = $estado.piezas; fin = ''; reancla = ''; p0 = $null }
  $foto = Foto
  $res.rango = $foto.rango
  $res.limite = $foto.limite
  # e1.10: «Puerta 0» a la vista: no se pulsa nada; la tabla queda para la lectura pasiva.
  if ($foto.error) { $res.error = $foto.error; $res.p0 = $foto.p0; return $res }
  $res.ftabla = $foto.filas
  $script:ultFoto = @{ ftabla = $foto.filas; rango = $foto.rango; limite = $foto.limite }

  # Un ciclo de puesta al día (la lectura anterior quedó a medias) no pulsa «Actualizar» ni espera la recarga,
  # y tampoco mueve el rango.
  $aj = $null
  $cambioPer = $false
  if ($refrescar) {
    $boton = Boton-Actualizar (Ventana-De $foto.el)
    if (-not $boton) { $res.error = 'sin-boton'; return $res }
    # Con la sesión bloqueada no se mueve el rango ni la casilla. e1.5: un fallo de las fechas ya no apaga la casilla.
    # e1.9: mira el combo de periodo y, solo con el archivo PERIODO, elige una vez (nunca en recarga ni con bloqueo).
    try { $cambioPer = [bool](@(Paso-Periodo $foto.el $recarga ([bool]$script:bloqueada)) | Select-Object -Last 1) } catch { if ([string]$_.Exception.Message -eq 'DETENER') { throw }; Log ('periodo: error ' + $_.Exception.Message) }
    if ($script:rangoAuto -and -not $script:bloqueada) { $aj = Ajusta-Rango $foto.el $estado $recarga }
    try { $boton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() }
    catch { $res.error = 'invoke-fallo'; return $res }
    $script:ultRefresco = Get-Date

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
    if ($n -eq $ult -and ($n -gt 0 -or $aj -or $recarga -or $cambioPer)) { $iguales++ } else { $iguales = 1; $ult = $n }
    if ($iguales -ge 3) { break }
    if ($t0.Elapsed.TotalSeconds -gt 120) { $res.error = 'tabla-inestable'; return $res }
    Espera 2
  }

  # Tras mover el rango: comprobar que Matrix lo tomó y buscar el ancla por contenido (su índice cambió).
  if ($aj) { Verifica-Ajuste $aj $foto.gp $n }
  # e1.6: con «Limitar» marcada el informe se corta en 10 000 filas: una recarga así daría un día por completo sin
  # estarlo. No lee; la recarga sigue pendiente hasta que la casilla quede desmarcada.
  if ($recarga -and $foto.limite) { $res.error = 'recarga-con-limite'; return $res }
  if ($aj -or $reanclar -or $cambioPer) {
    $ra = Re-Ancla $foto.gp $n $estado
    $res.reancla = $ra
    Log ('reancla=' + $ra)
  }

  # Lectura, con un reintento si la tabla cambió mientras se leía.
  $lec = Lee-Tabla $foto.gp $n $estado $reloj $recarga
  if (-not $lec) {
    Espera 2
    $foto = Foto
    if ($foto.error) { $res.error = $foto.error; return $res }
    $n = [int]$foto.gp.Current.RowCount
    if ($aj -or $reanclar -or $cambioPer) { [void](Re-Ancla $foto.gp $n $estado) }
    $lec = Lee-Tabla $foto.gp $n $estado $reloj $recarga
    if (-not $lec) { $res.error = 'tabla-cambio'; return $res }
  }
  $res.ftabla = $n
  $res.relectura = $lec.relectura
  $res.gate0 = $lec.gate0
  $res.parcial = [bool]$lec.parcial
  if ($lec.parcial) { $res.pendientes = [math]::Max(0, [int]($n - $lec.hastaIdx - 1)) }
  $res.lec = $lec
  # e1.7: la misma tabla, ya estable, sirve para buscar y rellenar huecos en este ciclo.
  $res.gp = $foto.gp
  # e1.10: la grilla de pieza, desde donde se busca el selector de informes.
  $res.el = $foto.el
  $res.base = $(if ($lec.relectura) { 0 } else { $estado.piezas })
  return $res
}

# ---- e1.9: periodo relativo del informe (interruptor = archivo PERIODO; apagado si no existe) ----
# Texto comparable: minúsculas, sin tildes y con un solo espacio.
function Normaliza-Texto([string]$s) {
  if (-not $s) { return '' }
  $d = $s.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $d.ToCharArray()) { if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) { [void]$sb.Append($ch) } }
  return (($sb.ToString().ToLowerInvariant() -replace '\s+', ' ').Trim())
}

# Opciones que el lector sabe elegir, en orden de preferencia (ventana móvil primero; nunca semana, mes ni ayer).
$PERIODO_SINONIMOS = @(
  '^(ultimas?|last|past) 24 ?(horas?|hours?|hrs?|h)$',
  '^(ultimo|last|past) (dia|day)$',
  '^(turno actual|turno en curso|current shift|this shift|turno|shift)$',
  '^(hoy|today)$'
)
$PERIODO_MANUAL = '^(usuario definido|definido por el usuario|user defined|user-defined|custom|personalizado)$'

# Combo de periodo de la ventana: el único ComboBox cuyo valor u opciones son «Usuario definido» o una opción conocida.
# Solo lee: valor (ValuePattern) y opciones que el combo expone CERRADO (Qt 5 las expone; nunca se despliega).
function Combo-Periodo($ventana) {
  $r = @{ error = 'sin-combo'; el = $null; valor = ''; items = @(); nombres = [string[]]@() }
  if (-not $ventana) { return $r }
  $cond = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::ComboBox)
  $condItem = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::ListItem)
  $hallados = New-Object System.Collections.Generic.List[object]
  foreach ($cb in @($ventana.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond))) {
    $valor = Valor-De $cb
    $items = @()
    try { $items = @($cb.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condItem)) } catch { }
    $nombres = [string[]]@($items | ForEach-Object { try { [string]$_.Current.Name } catch { '' } })
    $todos = @($valor) + $nombres
    $es = $false
    foreach ($t in $todos) {
      $n = Normaliza-Texto $t
      if ($n -match $PERIODO_MANUAL) { $es = $true; break }
      foreach ($re in $PERIODO_SINONIMOS) { if ($n -match $re) { $es = $true; break } }
      if ($es) { break }
    }
    if ($es) { $hallados.Add(@{ el = $cb; valor = $valor; items = $items; nombres = $nombres }) }
  }
  if ($hallados.Count -gt 1) { $r.error = 'varios'; return $r }
  if ($hallados.Count -eq 0) { return $r }
  $h = $hallados[0]
  $r.error = ''; $r.el = $h.el; $r.valor = $h.valor; $r.items = $h.items; $r.nombres = $h.nombres
  return $r
}

# Índice de la opción a elegir: la que nombra el archivo PERIODO (texto exacto, sin importar tildes ni mayúsculas) o la
# primera de la lista de sinónimos. -1 si ninguna sirve.
function Elige-Periodo([string[]]$nombres, [string]$pedido) {
  $p = Normaliza-Texto $pedido
  if ($p) {
    for ($i = 0; $i -lt $nombres.Count; $i++) { if ((Normaliza-Texto $nombres[$i]) -eq $p) { return $i } }
    return -1
  }
  foreach ($re in $PERIODO_SINONIMOS) {
    for ($i = 0; $i -lt $nombres.Count; $i++) { if ((Normaliza-Texto $nombres[$i]) -match $re) { return $i } }
  }
  return -1
}

# Clave «periodo» del latido (tope 200: la función rechaza el envío ENTERO si se pasa).
# «<estado>[:<opción>] valor=<valor> ops=<a;b;…>»; estado: apagado | sin-combo | varios | sin-opciones | sin-coincidencia
# | ya-en | elegida | no-cambia | error | pospuesto-recarga | pospuesto-bloqueo.
function Texto-Periodo([string]$estado, [string]$opcion, [string]$valor, [string[]]$nombres) {
  $limpia = { param($x) (([string]$x) -replace '[\s;=]+', ' ').Trim() }
  $t = $estado
  if ($opcion) { $t += ':' + (& $limpia $opcion) }
  $t += ' valor=' + (& $limpia $valor)
  if ($nombres -and $nombres.Count) { $t += ' ops=' + ((@($nombres | ForEach-Object { & $limpia $_ }) | Where-Object { $_ }) -join ';') }
  if ($t.Length -gt 200) { $t = $t.Substring(0, 197) + '...' }
  return $t
}

# Marca del archivo PERIODO (hora de escritura) y su contenido (opción pedida, opcional).
function Marca-Periodo {
  try {
    if (-not (Test-Path -LiteralPath $archivoPeriodo)) { return '' }
    return [string](Get-Item -LiteralPath $archivoPeriodo).LastWriteTimeUtc.Ticks
  } catch { return '' }
}
function Pedido-Periodo {
  try { return ([IO.File]::ReadAllText($archivoPeriodo)).Trim() } catch { return '' }
}

# Antes de «Actualizar». Siempre mira el combo (solo lectura) para el latido y para no mover las fechas si el informe ya
# no está en «Usuario definido». Con el archivo PERIODO, y una sola vez por archivo (la marca queda en periodo-hecho.txt,
# así un reinicio del lector no vuelve a elegir): si el combo está cerrado y expone sus opciones, elige por UIA
# (SelectionItemPattern.Select) la opción pedida o la primera conocida. Nunca despliega el combo, no teclea, no elige
# durante una recarga ni con la sesión bloqueada, y no elige si ya está en la opción correcta.
# Devuelve $true solo si el valor del combo cambió (el ciclo re-ancla).
function Paso-Periodo($el, [bool]$recarga, [bool]$bloqueada) {
  $obs = Combo-Periodo (Ventana-Raiz $el)
  $vNorm = Normaliza-Texto $obs.valor
  $script:periodoRelativo = ((-not $obs.error) -and $vNorm -and ($vNorm -notmatch $PERIODO_MANUAL))
  $marca = Marca-Periodo
  if (-not $marca) {
    $script:periodoTexto = Texto-Periodo $(if ($obs.error) { $obs.error } else { 'apagado' }) '' $obs.valor $obs.nombres
    return $false
  }
  $hecho = ''
  try { $hecho = ([IO.File]::ReadAllText($archivoPeriodoHecho)).Trim() } catch { }
  $partes = $hecho.Split("`t")
  if ($partes[0] -eq $marca) {
    # Ya se resolvió con este archivo: se informa el resultado guardado y el valor de ahora.
    $script:periodoTexto = Texto-Periodo $(if ($partes.Count -gt 1) { $partes[1] } else { 'hecho' }) $(if ($partes.Count -gt 2) { $partes[2] } else { '' }) $obs.valor $obs.nombres
    return $false
  }
  if ($recarga) { $script:periodoTexto = Texto-Periodo 'pospuesto-recarga' '' $obs.valor $obs.nombres; return $false }
  if ($bloqueada) { $script:periodoTexto = Texto-Periodo 'pospuesto-bloqueo' '' $obs.valor $obs.nombres; return $false }
  if ($obs.error) { $script:periodoTexto = Texto-Periodo $obs.error '' $obs.valor $obs.nombres; return $false }
  $resultado = ''
  $opcion = ''
  $cambio = $false
  if ($obs.nombres.Count -eq 0) { $resultado = 'sin-opciones' }
  else {
    $i = Elige-Periodo $obs.nombres (Pedido-Periodo)
    if ($i -lt 0) { $resultado = 'sin-coincidencia' }
    else {
      $opcion = [string]$obs.nombres[$i]
      if ($vNorm -eq (Normaliza-Texto $opcion)) { $resultado = 'ya-en' }
      else {
        try {
          $obs.items[$i].GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
          Espera 2
          $ahora = Valor-De $obs.el
          if ((Normaliza-Texto $ahora) -eq (Normaliza-Texto $opcion)) { $resultado = 'elegida'; $cambio = $true; $obs.valor = $ahora; $script:periodoRelativo = $true }
          else { $resultado = 'no-cambia'; $obs.valor = $ahora }
        } catch {
          if ([string]$_.Exception.Message -eq 'DETENER') { throw }
          $resultado = 'error'
          Log ('periodo: error al elegir «' + $opcion + '»: ' + $_.Exception.Message)
        }
      }
    }
  }
  try { [IO.File]::WriteAllText($archivoPeriodoHecho, ($marca + "`t" + $resultado + "`t" + $opcion), $UTF8) } catch { }
  $script:periodoTexto = Texto-Periodo $resultado $opcion $obs.valor $obs.nombres
  Log ('periodo: ' + $script:periodoTexto)
  return $cambio
}

# Sesión de Windows bloqueada: LogonUI corre mientras se muestra la pantalla de bloqueo.
function Sesion-Bloqueada {
  try { return (@(Get-Process -Name LogonUI -ErrorAction SilentlyContinue).Count -gt 0) } catch { return $false }
}

function Texto-Vivo {
  if ($script:vivoFin -and (Get-Date) -lt $script:vivoFin) { return $script:vivoFin.ToString('yyyy-MM-ddTHH:mm:sszzz') }
  return ''
}
function Fecha-Hora($cel) { return ('{0} {1}' -f $cel[0], $cel[1]) }

# ---- e1.6: recarga puntual de historia ----
# Marca del archivo RECARGA (hora de escritura): sirve para no volver a empezar con el mismo archivo si no se pudo borrar.
function Marca-Recarga {
  try { return [string](Get-Item -LiteralPath $archivoRecarga -ErrorAction Stop).LastWriteTimeUtc.Ticks } catch { return '' }
}

# Clave «recarga» del latido (texto <= 200): '' sin recarga | 'leyendo <recorridas>/<filas> <enviadas>' |
# 'con-limite' (no lee con «Limitar» marcada) | 'terminada <enviadas> <primera> a <ultima>' | 'cancelada <enviadas>'.
function Texto-Recarga($rec, [string]$cierre, [int]$recorridas, [int]$filas, [string]$errorCiclo) {
  if ($rec) {
    if ($errorCiclo -eq 'recarga-con-limite') { return 'con-limite' }
    # e1.7: $filas es la tabla de la última lectura buena (no la de un ciclo fallido): nunca «/0» por un error.
    if ($filas -gt 0 -and $recorridas -gt $filas) { $recorridas = $filas }
    return ('leyendo ' + $recorridas + '/' + $filas + ' ' + [int]$rec.enviadas)
  }
  return [string]$cierre
}

# ---- e1.7: pantalla despierta y políticas de bloqueo ----
# ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED: ni suspensión ni pantalla apagada mientras el lector corre
# (es lo que hace un reproductor de video). No simula teclas ni mouse. $true si Windows aceptó el pedido.
# e1.8: el pedido vale para el hilo que lo hace; el bucle principal corre en un solo hilo y lo renueva en cada ciclo.
# Si falla deja el motivo en $script:pantallaMotivo (sin-tipo | rechazo | error) y el detalle en el log, una vez.
# Con $flags = 2147483648 (solo ES_CONTINUOUS) devuelve el equipo a lo normal al salir.
function Pide-Pantalla([uint32]$flags = 2147483651) {
  $motivo = ''
  if ($script:energiaError) { $motivo = 'sin-tipo' }
  else {
    try { if ([EspejoGrader.Energia]::SetThreadExecutionState($flags) -eq 0) { $motivo = 'rechazo' } }
    catch { $motivo = 'error'; $script:energiaError2 = [string]$_.Exception.Message }
  }
  if ($flags -eq 2147483651) {
    if ($motivo -and $motivo -ne $script:pantallaMotivo) { Log ('pantalla: Windows no tomó el pedido de pantalla despierta (' + $motivo + $(if ($script:energiaError) { ': ' + $script:energiaError } elseif ($script:energiaError2) { ': ' + $script:energiaError2 } else { '' }) + ').') }
    $script:pantallaMotivo = $motivo
  }
  return (-not $motivo)
}

function Valor-Registro([string]$ruta, [string]$nombre) {
  try { return [string](Get-ItemProperty -LiteralPath $ruta -Name $nombre -ErrorAction Stop).$nombre } catch { return '' }
}

# Políticas que bloquean la sesión aunque la pantalla siga encendida (solo se leen, nunca se cambian): «Límite de
# inactividad del equipo» de TI y protector de pantalla con contraseña (de TI o del usuario). '' si no hay ninguna.
function Politicas-Bloqueo {
  $p = New-Object System.Collections.Generic.List[string]
  $ina = Valor-Registro 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' 'InactivityTimeoutSecs'
  if ($ina -match '^\d+$' -and [int64]$ina -gt 0) { $p.Add('inactividad=' + $ina + 's(ti)') }
  $g = 'HKCU:\Software\Policies\Microsoft\Windows\Control Panel\Desktop'
  $u = 'HKCU:\Control Panel\Desktop'
  if ((Valor-Registro $g 'ScreenSaveActive') -eq '1' -and (Valor-Registro $g 'ScreenSaverIsSecure') -eq '1') {
    $p.Add('protector=' + (Valor-Registro $g 'ScreenSaveTimeOut') + 's(ti)')
  } elseif ((Valor-Registro $u 'SCRNSAVE.EXE') -and (Valor-Registro $u 'ScreenSaveActive') -eq '1' -and (Valor-Registro $u 'ScreenSaverIsSecure') -eq '1') {
    $p.Add('protector=' + (Valor-Registro $u 'ScreenSaveTimeOut') + 's(usuario)')
  }
  return ($p -join ' ')
}

# Clave «pantalla» del latido: '<pedida|no-pedida> <sin-bloqueo|bloqueada-desde F H|ultimo-bloqueo F H>[ políticas]'.
# Si la sesión se bloquea con la pantalla pedida, la causa es una política (TI o usuario) o alguien la bloqueó a mano.
function Texto-Pantalla([bool]$pedida, [bool]$bloqueada, [datetime]$ahora) {
  if ($bloqueada) {
    if (-not $script:bloqueoDesde) { $script:bloqueoDesde = $ahora; Log ('pantalla: la sesión se bloqueó (' + $(if ($script:politicas) { $script:politicas } else { 'sin política de bloqueo leída' }) + ').') }
    $script:ultimoBloqueo = $script:bloqueoDesde
  } elseif ($script:bloqueoDesde) {
    Log ('pantalla: la sesión volvió a estar desbloqueada (bloqueada desde ' + $script:bloqueoDesde.ToString('yyyy-MM-dd HH:mm') + ').')
    $script:bloqueoDesde = $null
  }
  $b = 'sin-bloqueo'
  if ($script:bloqueoDesde) { $b = 'bloqueada-desde ' + $script:bloqueoDesde.ToString('yyyy-MM-dd HH:mm') }
  elseif ($script:ultimoBloqueo) { $b = 'ultimo-bloqueo ' + $script:ultimoBloqueo.ToString('yyyy-MM-dd HH:mm') }
  $t = $(if ($pedida) { 'pedida' } elseif ($script:pantallaMotivo) { 'no-pedida:' + $script:pantallaMotivo } else { 'no-pedida' }) + ' ' + $b
  if ($script:politicas) { $t += ' ' + $script:politicas }
  if ($t.Length -gt 200) { $t = $t.Substring(0, 200) }
  return $t
}

# ---- e1.7: abrir Matrix si no corre ----
# Guarda la ruta del Matrix que corre (solo un .exe con «matrix» en el nombre).
function Recuerda-Matrix([string]$ruta) {
  if (-not $ruta -or $ruta -notmatch '(?i)\.exe$' -or (Split-Path -Leaf $ruta) -notmatch '(?i)matrix') { return }
  if ($script:rutaMatrix -eq $ruta) { return }
  $script:rutaMatrix = $ruta
  try { [IO.File]::WriteAllText($archivoRutaMatrix, $ruta, $UTF8) } catch { }
}

# Ruta para abrir Matrix: la del proceso que se vio correr (matrix-ruta.txt) o el ÚNICO .exe con «matrix» en el nombre
# de la carpeta de Marelec. '' si no hay una respuesta segura: entonces no se abre nada.
function Ruta-Matrix {
  $r = [string]$script:rutaMatrix
  if (-not $r -and (Test-Path -LiteralPath $archivoRutaMatrix)) { try { $r = ([IO.File]::ReadAllText($archivoRutaMatrix)).Trim() } catch { } }
  if ($r -and (Test-Path -LiteralPath $r -PathType Leaf)) { return $r }
  $exes = @(Get-ChildItem -LiteralPath $script:carpetaMatrix -Filter '*.exe' -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '(?i)matrix' })
  if ($exes.Count -eq 1) { return [string]$exes[0].FullName }
  return ''
}

# Aperturas de las últimas 24 h (abrir.json sobrevive a los reinicios del lector: así no hay tormenta de instancias).
function Lee-Aperturas([datetime]$ahora) {
  $l = New-Object System.Collections.Generic.List[datetime]
  if (-not (Test-Path -LiteralPath $archivoAbrir)) { return , $l }
  try {
    $j = Get-Content -LiteralPath $archivoAbrir -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($s in @($j.veces)) {
      $t = [datetime]::MinValue
      # PowerShell 7 convierte solo las fechas ISO al leer el JSON; PowerShell 5.1 (planta) las deja como texto.
      $ok = $false
      if ($s -is [datetime]) { $t = $s; $ok = $true }
      else { $ok = [datetime]::TryParseExact([string]$s, 'yyyy-MM-ddTHH:mm:ss', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$t) }
      if ($ok) {
        if (($ahora - $t).TotalHours -lt 24 -and $t -le $ahora.AddMinutes(1)) { $l.Add($t) }
      }
    }
  } catch { }
  return , $l
}

# Minimizado y sin activar (SW_SHOWMINNOACTIVE = 7): no le quita el foco a quien esté usando el PC.
function Lanza-Minimizado([string]$ruta) {
  $carpeta = Split-Path -Parent $ruta
  try {
    $sh = New-Object -ComObject WScript.Shell
    $sh.CurrentDirectory = $carpeta
    [void]$sh.Run('"' + $ruta + '"', 7, $false)
    return $true
  } catch { }
  try { Start-Process -FilePath $ruta -WorkingDirectory $carpeta -WindowStyle Minimized -ErrorAction Stop | Out-Null; return $true } catch { return $false }
}

# Matrix no corre: lo abre si se puede. Como mucho 1 vez cada 30 min y 6 en 24 h. Devuelve la clave «matrix».
function Abre-Matrix([datetime]$ahora) {
  if (-not $script:abrirMatrix) { return 'no-abre apagado' }
  $veces = Lee-Aperturas $ahora
  $ult = $null
  foreach ($t in $veces) { if (-not $ult -or $t -gt $ult) { $ult = $t } }
  if ($veces.Count -ge 6) { return ('no-abre tope-diario ' + $veces.Count) }
  if ($ult -and ($ahora - $ult).TotalMinutes -lt 30) { return ('abierto-por-lector ' + $ult.ToString('yyyy-MM-dd HH:mm') + ' esperando') }
  $ruta = Ruta-Matrix
  if (-not $ruta) { return 'no-abre sin-ruta' }
  $veces.Add($ahora)
  $txt = ConvertTo-Json -InputObject @{ veces = [string[]]@($veces | ForEach-Object { $_.ToString('yyyy-MM-ddTHH:mm:ss') }) } -Compress
  try { [IO.File]::WriteAllText($archivoAbrir, $txt, $UTF8) } catch { }
  if (-not (Lanza-Minimizado $ruta)) { Log ('matrix: no se pudo abrir ' + $ruta); return 'no-abre fallo' }
  # e1.10: tras el latido, 60 s minimizando las ventanas que abra (Qt suele ignorar el minimizado del arranque).
  $script:minimizar = @{ desde = $ahora; hasta = (Get-Date).AddSeconds(60) }
  Log ('matrix: no corría; el lector lo abrió minimizado (' + $ruta + ', vez ' + $veces.Count + ' en 24 h). No toca nada más de Matrix.')
  return ('abierto-por-lector ' + $ahora.ToString('yyyy-MM-dd HH:mm'))
}

# ---- e1.7: huecos del espejo dentro del rango que muestra Matrix ----
function Fecha-Exacta([string]$s) {
  $t = [datetime]::MinValue
  if ($s -match $FORMATO_FECHA -and [datetime]::TryParseExact($s, 'yyyy-MM-dd HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$t)) { return $t }
  return $null
}
function Hora-Abajo([datetime]$t) { return $t.Date.AddHours($t.Hour) }

# Filas del espejo por hora para esas fechas (GET ?conteos=a,b): @{ 'yyyy-MM-dd' = @{ 'HH' = n } }. $null si la función
# no responde o no lo conoce (una función anterior a e1.7 contesta 404): entonces no se rellena nada.
function Pide-Conteos([string[]]$fechas) {
  try {
    $r = Invoke-WebRequest -Uri ($url + '?conteos=' + [uri]::EscapeDataString(($fechas -join ','))) -Method Get -Headers @{ Authorization = ('Bearer ' + $script:llave) } -UseBasicParsing -TimeoutSec 60
    if ([int]$r.StatusCode -ne 200) { return $null }
    $j = ConvertFrom-Json ([string]$r.Content)
    if (-not $j -or -not $j.conteos) { return $null }
    $out = @{}
    foreach ($f in $fechas) {
      $h = @{}
      $d = $j.conteos.$f
      if ($d) { foreach ($p in $d.PSObject.Properties) { $h[[string]$p.Name] = [int]$p.Value } }
      $out[$f] = $h
    }
    return $out
  } catch { return $null }
}

# Las horas del rango que ya cerraron (hasta 10 min antes de ahora), de la más nueva a la más vieja, tope 7 días.
function Horas-Rango([string[]]$rango, [datetime]$ahora) {
  $l = New-Object System.Collections.Generic.List[datetime]
  if ($rango.Count -lt 2) { return , $l }
  $d = Fecha-Exacta $rango[0]
  $h = Fecha-Exacta $rango[1]
  if (-not $d -or -not $h) { return , $l }
  $fin = Hora-Abajo $ahora.AddMinutes(-10)
  if ($h -lt $fin) { $fin = Hora-Abajo $h }
  $ini = Hora-Abajo $d
  if ($ini -lt $d) { $ini = $ini.AddHours(1) }
  if ($ini -lt $fin.AddDays(-7)) { $ini = $fin.AddDays(-7) }
  for ($t = $fin.AddHours(-1); $t -ge $ini; $t = $t.AddHours(-1)) { $l.Add($t) }
  return , $l
}

# Filas de Matrix por hora (bordes por búsqueda binaria) contra las del espejo. Devuelve @{ error; revisadas; huecos }:
# cada hueco = @{ clave = 'yyyy-MM-dd HH'; desde; hasta (índices de la tabla, hasta exclusivo); matrix; espejo }.
# error 'desordenada' si un borde no calza (tabla fuera de orden): entonces no se relee nada.
function Plan-Huecos($gp, [int]$filas, $horas, $datos) {
  $res = @{ error = ''; revisadas = 0; huecos = (New-Object System.Collections.Generic.List[object]) }
  # Las horas van de la más nueva a la más vieja y son seguidas: el inicio de una hora es el fin de la anterior, y su
  # búsqueda binaria se hace solo bajo ese borde (la mitad de lecturas de celdas).
  $prevT = $null
  $prevI0 = $filas
  foreach ($t in $horas) {
    Revisa-Detener
    $clave = $t.ToString('yyyy-MM-dd HH')
    if ($prevT -and $prevT -eq $t.AddHours(1)) { $i1 = $prevI0 }
    else { $i1 = Desde-Corte $gp $prevI0 ($t.AddHours(1).ToString('yyyy-MM-dd HH:mm:ss')) }
    $i0 = Desde-Corte $gp $i1 ($t.ToString('yyyy-MM-dd HH:mm:ss'))
    $prevT = $t
    $prevI0 = $i0
    if ($script:horasAgotadas.ContainsKey($clave)) { continue }
    $res.revisadas++
    $m = $i1 - $i0
    if ($m -le 0) { continue }
    # Los bordes deben caer dentro de la hora: la primera y la última fila del tramo son de esa hora.
    $a = ([string](Celda $gp $i0 0)).Trim() + ' ' + ([string](Celda $gp $i0 1)).Trim()
    $z = ([string](Celda $gp ($i1 - 1) 0)).Trim() + ' ' + ([string](Celda $gp ($i1 - 1) 1)).Trim()
    if (-not $a.StartsWith($clave + ':') -or -not $z.StartsWith($clave + ':')) { $res.error = 'desordenada'; return $res }
    $e = 0
    $dia = $datos[$t.ToString('yyyy-MM-dd')]
    if ($dia -and $dia.ContainsKey($t.ToString('HH'))) { $e = [int]$dia[$t.ToString('HH')] }
    if ($m -gt $e) { $res.huecos.Add(@{ clave = $clave; desde = $i0; hasta = $i1; matrix = $m; espejo = $e; firma = ((Fila-Celdas $gp $i0) -join "`t") }) }
  }
  return $res
}

# Lee un tramo de una hora con hueco desde $h.idx, con el #n por segundo que sigue de los tramos anteriores. No cambia $h:
# devuelve el avance para aplicarlo solo tras el 200. $null si una fila no es de esa hora (la tabla cambió).
function Lee-Hueco($gp, $h, [double]$tope) {
  $items = New-Object System.Collections.Generic.List[string]
  $dict = New-Object 'System.Collections.Generic.Dictionary[string,int]' -ArgumentList @($h.dict, [StringComparer]::Ordinal)
  $dictSec = [string]$h.dictSec
  $t = [Diagnostics.Stopwatch]::StartNew()
  $r = [int]$h.idx
  while ($r -lt [int]$h.hasta) {
    if (($r % 200) -eq 0) { Revisa-Detener }
    $c = Fila-Celdas $gp $r
    $sec = $c[0] + ' ' + $c[1]
    if ($sec -notmatch $FORMATO_FECHA -or -not $sec.StartsWith($h.clave + ':')) { return $null }
    if ($sec -ne $dictSec) { $dict = Nuevo-Diccionario; $dictSec = $sec }
    $clave = $c -join "`t"
    $ord = 0
    if ($dict.ContainsKey($clave)) { $ord = $dict[$clave] }
    $dict[$clave] = $ord + 1
    $items.Add(($clave + "`t#" + [string]$ord))
    $r++
    if ($items.Count -ge $LOTE_MAX -or $t.Elapsed.TotalSeconds -ge $tope) { break }
  }
  return @{ items = $items; idx = $r; dict = $dict; dictSec = $dictSec }
}

# Clave «huecos» del latido: 'rellenando <releídas>/<total> <horas>h <hora en curso>' mientras hay horas con hueco,
# 'al-dia <horas revisadas>h <desde> a <hasta>[ releidas N]' sin huecos, o el motivo por el que no se revisa
# (sin-rango | sin-conteos | desordenada).
function Texto-Huecos {
  $t = [string]$script:huecosTexto
  if ($t.Length -gt 200) { $t = $t.Substring(0, 200) }
  return $t
}

function Texto-Rellenando($h) {
  return ('rellenando ' + [int]$script:huecosRonda.leidas + '/' + [int]$script:huecosRonda.total + ' ' + [int]$h.horas + 'h ' + $h.clave)
}

# Un paso de relleno (tope ESPEJO_TOPE_HUECO s). Se llama solo con el turno al día. Devuelve @{ resp; enviadas; sigue }:
# sigue = quedan horas con hueco (el ciclo siguiente vuelve enseguida, con «Actualizar» al menos cada ESPEJO_CADA).
function Paso-Huecos($gp, [int]$filas, [string[]]$rango, $estC) {
  $out = @{ resp = ''; enviadas = 0; sigue = $false }
  $ahora = Get-Date
  $reloj = [Diagnostics.Stopwatch]::StartNew()
  $h = $script:huecoActual
  # Una hora a medias sigue solo si la tabla es la misma (misma primera fila del tramo y el tramo entero a la vista).
  if ($h) {
    $firma = ((Fila-Celdas $gp ([int]$h.desde)) -join "`t")
    if ($filas -lt [int]$h.hasta -or $firma -ne $h.firma) { Log ('huecos: la tabla cambió, se vuelve a planear (' + $h.clave + ').'); $h = $null; $script:huecoActual = $null; $script:huecosPlan = $null }
  }
  # Las horas que quedan del plan de esta ronda (la tabla solo crece al final: sus índices siguen valiendo si la primera
  # fila de cada hora es la misma). Sin plan, se planea de nuevo con conteos frescos o en caché.
  if (-not $h -and $script:huecosPlan -and $script:huecosPlan.Count -gt 0) {
    $x = $script:huecosPlan[0]
    $script:huecosPlan.RemoveAt(0)
    if ($filas -ge [int]$x.hasta -and ((Fila-Celdas $gp ([int]$x.desde)) -join "`t") -eq $x.firma) {
      $h = @{ clave = $x.clave; desde = [int]$x.desde; hasta = [int]$x.hasta; idx = [int]$x.desde; matrix = [int]$x.matrix; espejo = [int]$x.espejo; dict = (Nuevo-Diccionario); dictSec = ''; firma = $x.firma; horas = $script:huecosPlan.Count + 1 }
      $script:huecoActual = $h
      Log ('huecos: relee ' + $h.clave + ' h (Matrix ' + $h.matrix + ' filas, espejo ' + $h.espejo + ').')
    } else {
      Log ('huecos: la tabla cambió, se vuelve a planear (' + $x.clave + ').')
      $script:huecosPlan = $null
    }
  }
  if (-not $h) {
    $horas = Horas-Rango $rango $ahora
    if ($horas.Count -eq 0) { $script:huecosTexto = 'sin-rango'; return $out }
    $fechas = [string[]]@($horas | ForEach-Object { $_.ToString('yyyy-MM-dd') } | Select-Object -Unique)
    $clavesF = $fechas -join ','
    $c = $script:conteos
    $pedidos = $false
    if (-not $c -or $c.fechas -ne $clavesF -or ($ahora - $c.en).TotalMinutes -ge $script:minConteos) {
      $d = Pide-Conteos $fechas
      if ($null -eq $d) { $script:huecosTexto = 'sin-conteos'; return $out }
      $c = @{ en = $ahora; fechas = $clavesF; datos = $d }
      $script:conteos = $c
      $pedidos = $true
    }
    $plan = Plan-Huecos $gp $filas $horas $c.datos
    if ($plan.error) { $script:huecosTexto = $plan.error; Log ('huecos: ' + $plan.error + ', no se relee nada.'); return $out }
    # Un hueco en una hora que seguía en curso cuando se pidieron los conteos puede ser solo un conteo viejo: se piden otra vez.
    $reciente = @($plan.huecos | Where-Object { (Fecha-Exacta ($_.clave + ':00:00')).AddHours(1) -gt $c.en.AddMinutes(-10) })
    if ($reciente.Count -gt 0 -and -not $pedidos) {
      $d = Pide-Conteos $fechas
      if ($null -eq $d) { $script:huecosTexto = 'sin-conteos'; return $out }
      $c = @{ en = $ahora; fechas = $clavesF; datos = $d }
      $script:conteos = $c
      $plan = Plan-Huecos $gp $filas $horas $c.datos
      if ($plan.error) { $script:huecosTexto = $plan.error; return $out }
    }
    $desdeT = $horas[$horas.Count - 1].ToString('yyyy-MM-dd HH')
    $hastaT = $horas[0].ToString('yyyy-MM-dd HH')
    if ($plan.huecos.Count -eq 0) {
      $t = 'al-dia ' + $plan.revisadas + 'h ' + $desdeT + ' a ' + $hastaT
      if ($script:huecosRonda) { $t += ' releidas ' + [int]$script:huecosRonda.leidas; Log ('huecos: al día; ' + [int]$script:huecosRonda.leidas + ' filas releídas en esta ronda.') }
      $script:huecosRonda = $null
      $script:huecosTexto = $t
      return $out
    }
    $falta = 0
    foreach ($x in $plan.huecos) { $falta += [int]$x.matrix }
    if (-not $script:huecosRonda) {
      $script:huecosRonda = @{ leidas = 0; total = $falta }
      Log ('huecos: ' + $plan.huecos.Count + ' horas con menos filas en el espejo que en Matrix (' + $falta + ' filas a releer), entre ' + $desdeT + ' y ' + $hastaT + '.')
    } else {
      $script:huecosRonda.total = [int]$script:huecosRonda.leidas + $falta
    }
    $script:huecosPlan = $plan.huecos
    $x = $script:huecosPlan[0]
    $script:huecosPlan.RemoveAt(0)
    $h = @{ clave = $x.clave; desde = [int]$x.desde; hasta = [int]$x.hasta; idx = [int]$x.desde; matrix = [int]$x.matrix; espejo = [int]$x.espejo; dict = (Nuevo-Diccionario); dictSec = ''; firma = $x.firma; horas = $script:huecosPlan.Count + 1 }
    $script:huecoActual = $h
    Log ('huecos: relee ' + $h.clave + ' h (Matrix ' + $h.matrix + ' filas, espejo ' + $h.espejo + ').')
  }
  while ($reloj.Elapsed.TotalSeconds -lt $script:topeHuecoSeg -and [int]$h.idx -lt [int]$h.hasta) {
    $lec = Lee-Hueco $gp $h ($script:topeHuecoSeg - $reloj.Elapsed.TotalSeconds)
    if (-not $lec) { Log ('huecos: una fila no es de ' + $h.clave + ' h: se vuelve a planear.'); $script:huecoActual = $null; $script:huecosPlan = $null; $out.sigue = $true; return $out }
    if ($lec.items.Count -gt 0) {
      $script:huecosTexto = 'rellenando ' + ([int]$script:huecosRonda.leidas + $lec.items.Count) + '/' + [int]$script:huecosRonda.total + ' ' + [int]$h.horas + 'h ' + $h.clave
      $estC.huecos = Texto-Huecos
      $resp = Envia ([string[]]$lec.items.ToArray()) $estC
      $out.resp = $resp
      if ($resp -ne 'ok') { $script:huecosTexto = Texto-Rellenando $h; $out.sigue = ($resp -ne 'fin'); return $out }
      $out.enviadas += $lec.items.Count
      $script:huecosRonda.leidas = [int]$script:huecosRonda.leidas + $lec.items.Count
    }
    $h.idx = $lec.idx; $h.dict = $lec.dict; $h.dictSec = $lec.dictSec
  }
  $script:huecosTexto = Texto-Rellenando $h
  if ([int]$h.idx -ge [int]$h.hasta) {
    # Hora terminada: hasta los conteos siguientes, el espejo de esa hora cuenta como el de Matrix. Si ya se releyó dos
    # veces y el espejo sigue corto, no se insiste en esta corrida (queda en el log).
    $f = $h.clave.Substring(0, 10)
    $hh = $h.clave.Substring(11, 2)
    $n = 0
    if ($script:horasReleidas.ContainsKey($h.clave)) { $n = [int]$script:horasReleidas[$h.clave] }
    $script:horasReleidas[$h.clave] = $n + 1
    if ($n + 1 -ge 2) { $script:horasAgotadas[$h.clave] = $true; Log ('huecos: ' + $h.clave + ' h releída 2 veces; no se insiste en esta corrida.') }
    if ($script:conteos -and $script:conteos.datos[$f]) { $script:conteos.datos[$f][$hh] = [int]$h.matrix }
    Log ('huecos: ' + $h.clave + ' h releída (' + $h.matrix + ' filas).')
    $script:huecoActual = $null
  }
  $out.sigue = $true
  return $out
}

# ---- e1.10: Puerta 0 (puro) ----
# Nombres EXACTOS (tras quitar tildes, mayúsculas y espacios de más) del control que elige cada informe.
$RE_INF_P0 = '^puerta 0$'
$RE_INF_PIEZA = '^pieza (a )?pieza grader$'
$VIAS_P0 = [string[]]@('pestana', 'boton', 'menu')
$FMT_P0 = 'yyyy-MM-dd HH:mm:ss'

# p0Pedido de la respuesta CRUDA de la función: el ISO tal cual ('' si no viene o no tiene forma de ISO en UTC).
function Iso-Pedido([string]$crudo) {
  if (-not $crudo) { return '' }
  $m = [regex]::Match($crudo, '"p0Pedido"\s*:\s*"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z)"')
  if ($m.Success) { return $m.Groups[1].Value }
  return ''
}

function Fecha-P0([string]$s) {
  $t = [datetime]::MinValue
  if ([datetime]::TryParseExact($s, $FMT_P0, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$t)) { return $t }
  return $null
}

# Cierre de turno en curso: 'yyyy-MM-dd HH' del cambio de turno (07 o 19) si ahora cae entre +10 y +55 min; '' si no.
function Clave-Cierre([datetime]$ahora) {
  foreach ($h in @(7, 19)) {
    $t = $ahora.Date.AddHours($h)
    $min = ($ahora - $t).TotalMinutes
    if ($min -ge 10 -and $min -lt 55) { return $t.ToString('yyyy-MM-dd HH') }
  }
  return ''
}

# Por qué alternar a «Puerta 0» ahora: pedido (uno no atendido) | cierre | hora | ''. $st = p0.json: hora (último
# intento, «yyyy-MM-dd HH:mm:ss»), cierre (último cierre leído) y pedido (último ISO atendido).
function Motivo-P0([datetime]$ahora, $st, [string]$pedido) {
  if ($pedido -and $pedido -ne [string]$st.pedido) { return 'pedido' }
  $c = Clave-Cierre $ahora
  if ($c -and $c -ne [string]$st.cierre) { return 'cierre' }
  $t = Fecha-P0 ([string]$st.hora)
  # Sin intento previo, reloj movido hacia atrás o una hora desde el último intento.
  if (-not $t -or $t -gt $ahora.AddMinutes(1) -or ($ahora - $t).TotalMinutes -ge 60) { return 'hora' }
  return ''
}

# Celdas leídas de «Puerta 0» → filas del contrato (11 celdas + #n). #n = cuántas veces apareció antes la MISMA fila
# completa en toda la tabla (diccionario de la tabla entera: no supone orden). Descarta lo que la función rechazaría
# (sin fecha u hora válidas, más de 300 caracteres, #n de más de 4 cifras): una sola fila mala tumba el lote entero.
# primera/ultima = la menor y la mayor «fecha hora» enviada.
function Filas-P0($celdas) {
  $dict = Nuevo-Diccionario
  $out = New-Object System.Collections.Generic.List[string]
  $primera = ''
  $ultima = ''
  $malas = 0
  # Sin @(): con una List[object] de arreglos, @() falla («Los tipos de argumentos no coinciden»).
  foreach ($c0 in $celdas) {
    $c = [string[]]@(@($c0) | ForEach-Object { ([string]$_ -replace '[\t\r\n]', ' ').Trim() })
    if ($c.Count -ne 11 -or $c[2] -notmatch '^\d{4}-\d{2}-\d{2}$' -or $c[3] -notmatch '^\d{2}:\d{2}:\d{2}$') { $malas++; continue }
    $clave = $c -join "`t"
    $ord = 0
    if ($dict.ContainsKey($clave)) { $ord = $dict[$clave] }
    $dict[$clave] = $ord + 1
    $fila = $clave + "`t#" + [string]$ord
    if ($ord -gt 9999 -or $fila.Length -gt 300) { $malas++; continue }
    $out.Add($fila)
    $s = $c[2] + ' ' + $c[3]
    if (-not $primera -or [string]::CompareOrdinal($s, $primera) -lt 0) { $primera = $s }
    if (-not $ultima -or [string]::CompareOrdinal($s, $ultima) -gt 0) { $ultima = $s }
  }
  return @{ filas = $out; primera = $primera; ultima = $ultima; malas = $malas }
}

# Vía para cambiar de informe. $cands: @{ via; nombre } (solo pestaña, botón u opción de menú con Invoke). Vale la primera
# vía de $vias con EXACTAMENTE un «Puerta 0» y un «Pieza pieza Grader». Si ninguna: varios (dos o más iguales) >
# sin-vuelta (hay «Puerta 0» pero no la vuelta) > sin-selector. Devuelve @{ resultado; via }.
function Selector-Via($cands, [string[]]$vias) {
  $rango = @{ 'sin-selector' = 0; 'sin-vuelta' = 1; 'varios' = 2 }
  $peor = 'sin-selector'
  foreach ($v in @($vias)) {
    $p0 = @(@($cands) | Where-Object { $_ -and $_.via -eq $v -and (Normaliza-Texto $_.nombre) -match $RE_INF_P0 }).Count
    $pz = @(@($cands) | Where-Object { $_ -and $_.via -eq $v -and (Normaliza-Texto $_.nombre) -match $RE_INF_PIEZA }).Count
    if ($p0 -eq 1 -and $pz -eq 1) { return @{ resultado = ''; via = $v } }
    $r = 'sin-selector'
    if ($p0 -gt 1 -or $pz -gt 1) { $r = 'varios' }
    elseif ($p0 -eq 1) { $r = 'sin-vuelta' }
    if ($rango[$r] -gt $rango[$peor]) { $peor = $r }
  }
  return @{ resultado = $peor; via = '' }
}

# Interruptor ALTERNAR: @{ on; vias; marca; bloqueado }. Texto del archivo = una sola vía (pestana | boton | menu);
# otro texto = ninguna. bloqueado = una vuelta falló con ESTA misma marca de ALTERNAR (se desbloquea reescribiéndolo).
function Alternar-Config {
  $r = @{ on = $false; vias = $VIAS_P0; marca = ''; bloqueado = $false }
  try {
    if (-not (Test-Path -LiteralPath $archivoAlternar)) { return $r }
    $r.marca = [string](Get-Item -LiteralPath $archivoAlternar).LastWriteTimeUtc.Ticks
  } catch { return $r }
  $r.on = $true
  $t = ''
  try { $t = Normaliza-Texto ([IO.File]::ReadAllText($archivoAlternar)) } catch { }
  if ($t) { $r.vias = [string[]]@($VIAS_P0 | Where-Object { $_ -eq $t }) }
  try {
    if ((Test-Path -LiteralPath $archivoAlternarBloq) -and ([IO.File]::ReadAllText($archivoAlternarBloq)).Trim().Split("`t")[0] -eq $r.marca) { $r.bloqueado = $true }
  } catch { }
  return $r
}

function Bloquea-Alternar([string]$marca, [string]$motivo) {
  try { [IO.File]::WriteAllText($archivoAlternarBloq, ($marca + "`t" + (Get-Date).ToString($FMT_P0) + "`t" + $motivo), $UTF8) } catch { }
  Log ('p0: alternancia bloqueada (' + $motivo + '). No vuelve a alternar hasta que se escriba de nuevo ALTERNAR.')
}

# Estado de Puerta 0 que viaja en los envíos 'p0' (graderEspejoEstado.p0; claves fijas, muy por debajo de 24).
function Estado-P0([string]$resultado, [int]$filas, [string]$primera, [string]$ultima, [string]$motivo, [string]$pedido, [string]$via, [bool]$volvio, [string]$cambio) {
  return @{ resultado = $resultado; filas = $filas; primera = $primera; ultima = $ultima; motivo = $motivo; pedido = $pedido; via = $via; volvio = $volvio; cambio = $cambio; version = $VERSION }
}

# Rango o casilla «Limitar» distintos al volver a «Pieza pieza Grader» ('' si quedaron igual). Tope 200.
function Texto-Cambio($antes, $despues) {
  $p = New-Object System.Collections.Generic.List[string]
  $a = (@($antes.rango) -join ' a ')
  $d = (@($despues.rango) -join ' a ')
  if ($a -ne $d) { $p.Add('rango ' + $a + ' -> ' + $d) }
  if ([bool]$antes.limite -ne [bool]$despues.limite) { $p.Add('limitar ' + $(if ($despues.limite) { 'marcada' } else { 'desmarcada' })) }
  $t = $p -join '; '
  if ($t.Length -gt 200) { $t = $t.Substring(0, 200) }
  return $t
}

# p0.json: último intento de alternar, último cierre leído, último pedido atendido, última lectura pasiva y la marca de
# una alternancia en curso (si el lector muere a medias, el siguiente intenta volver al arrancar).
function Lee-EstadoP0 {
  $e = @{ hora = ''; cierre = ''; pedido = ''; pasivaEn = ''; pasivaFilas = -1; enCurso = $null }
  if (-not (Test-Path -LiteralPath $archivoP0)) { return $e }
  try {
    $j = Get-Content -LiteralPath $archivoP0 -Raw -Encoding UTF8 | ConvertFrom-Json
    $e.hora = [string]$j.hora
    $e.cierre = [string]$j.cierre
    # PowerShell 7 convierte el ISO a fecha al leer el JSON; PowerShell 5.1 (planta) lo deja como texto.
    if ($j.pedido -is [datetime]) { $e.pedido = $j.pedido.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ') } else { $e.pedido = [string]$j.pedido }
    $e.pasivaEn = [string]$j.pasivaEn
    if ($null -ne $j.pasivaFilas) { $e.pasivaFilas = [int]$j.pasivaFilas }
    if ($j.enCurso) { $e.enCurso = @{ via = [string]$j.enCurso.via; desde = [string]$j.enCurso.desde; marca = [string]$j.enCurso.marca } }
  } catch { Log 'p0.json ilegible: se empieza de cero.' }
  return $e
}
function Guarda-EstadoP0($e) {
  try {
    $tmp = $archivoP0 + '.tmp'
    [IO.File]::WriteAllText($tmp, (ConvertTo-Json -InputObject $e -Depth 4), $UTF8)
    Move-Item -LiteralPath $tmp -Destination $archivoP0 -Force
  } catch { Log ('p0.json no guardado: ' + $_.Exception.Message) }
}

# ---- e1.10: Puerta 0 (UI Automation) ----
$TIPOS_VIA = @{ 'ControlType.TabItem' = 'pestana'; 'ControlType.Button' = 'boton'; 'ControlType.RadioButton' = 'boton'; 'ControlType.MenuItem' = 'menu' }
# Menú de la barra que puede tener los informes (se abre solo si es exactamente uno).
$RE_MENU_INFORMES = '^(informes?|reports?|ver|view|ventana|window|listados?)$'

function Tiene-Patron($e, $prop) { try { return [bool]$e.GetCurrentPropertyValue($prop) } catch { return $false } }

# Junta los candidatos @{ via; nombre; el } (pestaña, botón u opción de menú con Invoke y nombre exacto de informe;
# nunca lista, árbol ni combo) y los menús de la barra con nombre de informes (@{ nombre; el } con ExpandCollapse).
function Busca-Nodo($e, [int]$nivel, $acc, $reloj, [bool]$enBarra) {
  if ($acc.visitados -ge 4000 -or $nivel -gt 18 -or $reloj.Elapsed.TotalSeconds -gt 20) { return }
  $acc.visitados++
  $tipo = ''
  $nom = ''
  try { $tipo = [string]$e.Current.ControlType.ProgrammaticName; $nom = [string]$e.Current.Name } catch { return }
  $n = Normaliza-Texto $nom
  if ($TIPOS_VIA.ContainsKey($tipo) -and ($n -match $RE_INF_P0 -or $n -match $RE_INF_PIEZA) -and (Tiene-Patron $e $AE::IsInvokePatternAvailableProperty)) {
    $acc.cands.Add(@{ via = $TIPOS_VIA[$tipo]; nombre = $nom; el = $e })
  }
  if ($enBarra -and $tipo -eq 'ControlType.MenuItem' -and $n -match $RE_MENU_INFORMES -and (Tiene-Patron $e $AE::IsExpandCollapsePatternAvailableProperty)) {
    $acc.menus.Add(@{ nombre = $nom; el = $e })
  }
  $h = $null
  try { $h = $WALK.GetFirstChild($e) } catch { }
  $k = 0
  while ($h -and $k -lt 300) {
    Busca-Nodo $h ($nivel + 1) $acc $reloj ($tipo -eq 'ControlType.MenuBar')
    $k++
    try { $h = $WALK.GetNextSibling($h) } catch { $h = $null }
  }
}

# La ventana y las demás ventanas de su proceso (en Qt el menú abierto es una ventana aparte).
function Ventanas-Proceso($ventana) {
  $l = New-Object System.Collections.Generic.List[object]
  if (-not $ventana) { return , $l }
  $l.Add($ventana)
  try {
    $cond = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, [int]$ventana.Current.ProcessId)
    foreach ($v in $AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)) {
      if (-not [System.Windows.Automation.Automation]::Compare($v, $ventana)) { $l.Add($v) }
    }
  } catch { }
  return , $l
}

function Busca-Informes($ventana) {
  $acc = @{ cands = (New-Object System.Collections.Generic.List[object]); menus = (New-Object System.Collections.Generic.List[object]); visitados = 0 }
  $reloj = [Diagnostics.Stopwatch]::StartNew()
  foreach ($r in (Ventanas-Proceso $ventana)) { Busca-Nodo $r 0 $acc $reloj $false }
  return $acc
}

function Cierra-Menu($m) {
  if (-not $m) { return }
  try { $m.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Collapse() } catch { }
}

# Candidatos de una vía. Para «menu», si sus opciones no están a la vista, abre (Expand) el ÚNICO menú de la barra con
# nombre de informes y las busca ahí; devuelve ese menú para cerrarlo si no se usa. @{ cands; menu }
function Candidatos-Via($ventana, [string]$via) {
  $b = Busca-Informes $ventana
  $out = @{ cands = @($b.cands | Where-Object { $_.via -eq $via }); menu = $null }
  if ($via -ne 'menu' -or $out.cands.Count -gt 0 -or $b.menus.Count -ne 1) { return $out }
  $m = $b.menus[0].el
  try { $m.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern).Expand() } catch { return $out }
  $out.menu = $m
  Start-Sleep -Milliseconds 600
  $out.cands = @((Busca-Informes $ventana).cands | Where-Object { $_.via -eq 'menu' })
  return $out
}

# Busca de nuevo (los controles pueden rehacerse al cambiar de informe) y pulsa el único control de esa vía con ese
# nombre. $true si el Invoke no falló.
function Invoca-Informe($ventana, [string]$via, [string]$re) {
  $cv = Candidatos-Via $ventana $via
  $obj = @($cv.cands | Where-Object { (Normaliza-Texto $_.nombre) -match $re })
  if ($obj.Count -ne 1) { Cierra-Menu $cv.menu; Log ('p0: en la vía ' + $via + ' hay ' + $obj.Count + ' controles para ' + $re + '.'); return $false }
  try { $obj[0].el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); return $true }
  catch { Cierra-Menu $cv.menu; Log ('p0: Invoke de «' + $obj[0].nombre + '» falló: ' + $_.Exception.Message); return $false }
}

# Espera hasta que la tabla grande sea de ese informe ('p0' | 'pieza'). Sin DETENER: también corre en la vuelta.
function Espera-Informe([string]$cual, [double]$seg) {
  $t = [Diagnostics.Stopwatch]::StartNew()
  while ($true) {
    $f = Foto
    if ($cual -eq 'p0' -and $f.p0) { return $f }
    if ($cual -eq 'pieza' -and -not $f.error) { return $f }
    if ($t.Elapsed.TotalSeconds -ge $seg) { return $null }
    Start-Sleep -Milliseconds 1000
  }
}

# Tres lecturas iguales de RowCount separadas 2 s. -1 si no se estabiliza antes del tope.
function Filas-Estables($gp, [double]$tope) {
  $ult = -1
  $iguales = 0
  $t = [Diagnostics.Stopwatch]::StartNew()
  while ($t.Elapsed.TotalSeconds -lt $tope) {
    $n = -1
    try { $n = [int]$gp.Current.RowCount } catch { return -1 }
    if ($n -eq $ult) { $iguales++ } else { $iguales = 1; $ult = $n }
    if ($iguales -ge 3) { return $n }
    Start-Sleep -Milliseconds 2000
  }
  return -1
}

# Lee la tabla de «Puerta 0» entera a memoria (tope en segundos: entonces parcial).
function Lee-CeldasP0($gp, [int]$filas, [double]$tope) {
  $l = New-Object System.Collections.Generic.List[object]
  $t = [Diagnostics.Stopwatch]::StartNew()
  for ($r = 0; $r -lt $filas; $r++) {
    if ($t.Elapsed.TotalSeconds -ge $tope) { return @{ celdas = $l; parcial = $true } }
    $l.Add((Fila-Celdas $gp $r))
  }
  return @{ celdas = $l; parcial = $false }
}

# En «Puerta 0»: desmarca «Limitar el informe» si hay exactamente una y está marcada.
function Desmarca-Limitar($ventana) {
  if (-not $ventana) { return }
  $acc = @{ grillas = (New-Object System.Collections.Generic.List[object]); casillas = (New-Object System.Collections.Generic.List[object]); fechas = (New-Object System.Collections.Generic.List[string]); licencia = $false; visitados = 0; procesos = 0 }
  Recorre $ventana 0 $acc ([Diagnostics.Stopwatch]::StartNew())
  $lim = @($acc.casillas | Where-Object { $_.nombre -match '^\s*Limitar el informe' })
  if ($lim.Count -ne 1 -or $lim[0].estado -ne 'On') { return }
  try { $lim[0].el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle() } catch { }
  Log ('p0: casilla «Limitar» de «Puerta 0» ' + $(if ((Estado-Casilla $lim[0].el) -eq 'Off') { 'desmarcada.' } else { 'sigue marcada.' }))
}

# Alternancia completa desde «Pieza pieza Grader» ($pieza = @{ el; rango; limite } del ciclo sano). Lee a memoria, vuelve
# SIEMPRE (finally) verificando el encabezado de pieza y recién después se envía. Devuelve @{ resultado; filas;
# primera; ultima; via; volvio; cambio }.
function Alterna-P0($pieza, $cfg) {
  $r = @{ resultado = ''; filas = (New-Object System.Collections.Generic.List[string]); primera = ''; ultima = ''; via = ''; volvio = $true; cambio = '' }
  $ventana = Ventana-Raiz $pieza.el
  if (-not $ventana) { $r.resultado = 'sin-selector'; return $r }
  $todos = New-Object System.Collections.Generic.List[object]
  foreach ($v in @($cfg.vias)) {
    $cv = Candidatos-Via $ventana $v
    foreach ($x in $cv.cands) { $todos.Add($x) }
    $s = Selector-Via $cv.cands @($v)
    Cierra-Menu $cv.menu
    if (-not $s.resultado) { $r.via = $v; break }
  }
  if (-not $r.via) { $r.resultado = (Selector-Via $todos.ToArray() $cfg.vias).resultado; return $r }
  $st = Lee-EstadoP0
  $st.enCurso = @{ via = $r.via; desde = (Get-Date).ToString($FMT_P0); marca = [string]$cfg.marca }
  Guarda-EstadoP0 $st
  try {
    if (-not (Invoca-Informe $ventana $r.via $RE_INF_P0)) { $r.resultado = 'error' }
    else {
      $fp = Espera-Informe 'p0' 30
      if (-not $fp) { $r.resultado = 'no-cambia' }
      else {
        Desmarca-Limitar (Ventana-Raiz $fp.p0.el)
        $bot = Boton-Actualizar (Ventana-De $fp.p0.el)
        if ($bot) {
          try { $bot.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() } catch { Log ('p0: «Actualizar» falló: ' + $_.Exception.Message) }
          Start-Sleep -Milliseconds ([int]($esperaRecarga * 1000))
          $fp = Espera-Informe 'p0' 30
        }
        $n = -1
        if ($fp) { $n = Filas-Estables $fp.p0.gp 120 }
        if ($n -lt 0) { $r.resultado = 'error'; Log 'p0: la tabla de «Puerta 0» no se estabilizó.' }
        else {
          $lc = Lee-CeldasP0 $fp.p0.gp $n $script:topeP0Seg
          $fl = Filas-P0 $lc.celdas
          $r.filas = $fl.filas
          $r.primera = $fl.primera
          $r.ultima = $fl.ultima
          $r.resultado = $(if ($lc.parcial) { 'parcial' } else { 'leido' })
          if ($fl.malas) { Log ('p0: ' + $fl.malas + ' filas sin fecha u hora válidas no se envían.') }
        }
      }
    }
  } catch {
    $r.resultado = 'error'
    Log ('p0: error en «Puerta 0» (línea ' + $_.InvocationInfo.ScriptLineNumber + '): ' + $_.Exception.Message)
  } finally {
    # La vuelta: si la tabla ya es de pieza no se toca nada; si no, una sola vez, verificando el encabezado.
    $fz = Foto
    if ($fz.error) {
      $fz = $null
      if (Invoca-Informe $ventana $r.via $RE_INF_PIEZA) { $fz = Espera-Informe 'pieza' 30 }
    }
    if ($fz) {
      $r.volvio = $true
      $r.cambio = Texto-Cambio $pieza @{ rango = $fz.rango; limite = $fz.limite }
    } else {
      $r.volvio = $false
      $r.resultado = 'no-volvio'
      Bloquea-Alternar ([string]$cfg.marca) 'no-volvio'
    }
    $st = Lee-EstadoP0
    $st.enCurso = $null
    Guarda-EstadoP0 $st
    # De vuelta en pieza: el ancla se busca por contenido y el plan de huecos se rehace (la tabla se recargó).
    $script:reanclar = $true
    $script:huecoActual = $null
    $script:huecosPlan = $null
  }
  return $r
}

# Envía las filas de Puerta 0 por lotes, todas con el estado final. Sin filas, un envío vacío con el estado.
function Envia-P0($filas, $estP0) {
  $arr = [string[]]@($filas)
  if ($arr.Count -eq 0) { return (Envia @() $estP0 'p0') }
  for ($i = 0; $i -lt $arr.Count; $i += $LOTE_MAX) {
    $u = [math]::Min($arr.Count, $i + $LOTE_MAX) - 1
    $resp = Envia ([string[]]$arr[$i..$u]) $estP0 'p0'
    if ($resp -ne 'ok') { return $resp }
  }
  return 'ok'
}

# Después del latido de pieza. $res = el ciclo de pieza; $sano = ciclo normal completo, enviado, sin huecos pendientes ni
# bloqueo. Lectura pasiva, alternancia o respuesta a un pedido. Devuelve @{ resp } ('' | ok | reintento | fin).
function Paso-P0($res, [bool]$sano) {
  $out = @{ resp = '' }
  # Un envío de Puerta 0 que falló por red se repite antes que nada (la lectura ya se hizo).
  if ($script:p0Pendiente) {
    $out.resp = Envia-P0 $script:p0Pendiente.filas $script:p0Pendiente.est
    if ($out.resp -ne 'reintento') { $script:p0Pendiente = $null }
    if ($out.resp -ne 'ok') { return $out }
  }
  $ahora = Get-Date
  $st = Lee-EstadoP0
  $pedido = [string]$script:p0Pedido
  if ($pedido -and $pedido -eq [string]$st.pedido) { $pedido = '' }
  # Pasiva: Matrix ya muestra «Puerta 0»; no se pulsa nada.
  if ([string]$res.error -eq 'otro-informe' -and $res.p0) {
    $pas = Fecha-P0 ([string]$st.pasivaEn)
    $vieja = (-not $pas -or $pas -gt $ahora.AddMinutes(1) -or ($ahora - $pas).TotalMinutes -ge 30)
    if (-not $pedido -and -not $vieja -and [int]$res.p0.filas -eq [int]$st.pasivaFilas) { return $out }
    $n = Filas-Estables $res.p0.gp 60
    if ($n -lt 0) { return $out }
    $lc = Lee-CeldasP0 $res.p0.gp $n $script:topeP0Seg
    $fl = Filas-P0 $lc.celdas
    $est = Estado-P0 $(if ($lc.parcial) { 'parcial' } else { 'pasiva' }) $fl.filas.Count $fl.primera $fl.ultima $(if ($pedido) { 'pedido' } else { 'pasiva' }) $pedido '' $false ''
    $out.resp = Envia-P0 $fl.filas $est
    if ($out.resp -eq 'ok') {
      $st.pasivaEn = $ahora.ToString($FMT_P0)
      $st.pasivaFilas = [int]$res.p0.filas
      if ($pedido) { $st.pedido = $pedido }
      Guarda-EstadoP0 $st
      Log ('p0: lectura pasiva de «Puerta 0»: ' + $fl.filas.Count + ' filas (' + $fl.primera + ' a ' + $fl.ultima + ')' + $(if ($pedido) { ', a pedido' } else { '' }) + '.')
    }
    return $out
  }
  $cfg = Alternar-Config
  $motivo = Motivo-P0 $ahora $st $pedido
  if (-not $motivo) { return $out }
  if (-not $cfg.on -or $cfg.bloqueado) {
    # Sin alternancia solo se contesta el pedido, para que el monitor diga por qué no llega.
    if ($motivo -ne 'pedido') { return $out }
    $resu = $(if ($cfg.on) { 'bloqueado' } else { 'apagado' })
    $out.resp = Envia-P0 @() (Estado-P0 $resu 0 '' '' 'pedido' $pedido '' $true '')
    if ($out.resp -eq 'ok') { $st.pedido = $pedido; Guarda-EstadoP0 $st; Log ('p0: pedido ' + $pedido + ' contestado «' + $resu + '».') }
    return $out
  }
  # Pospuesto (sin enviar nada): el pedido sigue pendiente mientras valga (1 h). Hora y cierre no van en modo vivo.
  if (-not $sano) { return $out }
  if ($motivo -ne 'pedido' -and (Texto-Vivo)) { return $out }
  # El intento se anota antes de alternar: un fallo no se repite en el ciclo siguiente.
  $st.hora = $ahora.ToString($FMT_P0)
  $c = Clave-Cierre $ahora
  if ($c) { $st.cierre = $c }
  if ($pedido) { $st.pedido = $pedido }
  Guarda-EstadoP0 $st
  Log ('p0: alterna a «Puerta 0» (' + $motivo + ', vías ' + ($cfg.vias -join ',') + ').')
  $r = Alterna-P0 @{ el = $res.el; rango = [string[]]@($res.rango); limite = [bool]$res.limite } $cfg
  $est = Estado-P0 $r.resultado $r.filas.Count $r.primera $r.ultima $motivo $pedido $r.via $r.volvio $r.cambio
  Log ('p0: ' + $r.resultado + ' filas=' + $r.filas.Count + ' via=' + $r.via + ' volvio=' + $r.volvio + $(if ($r.cambio) { ' cambio=' + $r.cambio } else { '' }))
  $out.resp = Envia-P0 $r.filas $est
  if ($out.resp -eq 'reintento') { $script:p0Pendiente = @{ filas = $r.filas; est = $est } }
  return $out
}

# Al arrancar: si el lector anterior murió con «Puerta 0» a la vista en medio de una alternancia, una sola vuelta
# verificada; si falla, la alternancia queda bloqueada igual que tras «no-volvio».
function Recupera-P0 {
  $st = Lee-EstadoP0
  if (-not $st.enCurso) { return }
  $via = [string]$st.enCurso.via
  $f = Foto
  if ($f.p0) {
    Log ('p0: el lector anterior quedó en «Puerta 0» a medias (vía ' + $via + '): intenta volver una vez.')
    $ventana = Ventana-Raiz $f.p0.el
    $ok = $false
    if ($ventana -and $VIAS_P0 -contains $via -and (Invoca-Informe $ventana $via $RE_INF_PIEZA)) { $ok = [bool](Espera-Informe 'pieza' 30) }
    if ($ok) { Log 'p0: de vuelta en «Pieza pieza Grader».'; $script:reanclar = $true }
    else { Bloquea-Alternar ([string]$st.enCurso.marca) 'no-volvio al arrancar' }
  }
  $st.enCurso = $null
  Guarda-EstadoP0 $st
}

# e1.10: Qt suele ignorar el «minimizado» del arranque. Durante el plazo minimiza las ventanas de los procesos de Matrix
# que arrancaron después de abrirlo (filtro de proceso + hora de inicio, no la ruta: puede ser un lanzador). Sin
# teclas ni foco. Corre fuera de todo ciclo: no usa Espera (DETENER solo corta la espera).
function Minimiza-Matrix {
  $m = $script:minimizar
  if (-not $m) { return }
  $script:minimizar = $null
  $hechas = @{}
  while ((Get-Date) -lt $m.hasta) {
    if (Test-Path -LiteralPath $archivoDetener) { break }
    foreach ($p in @(Get-Process | Where-Object { $_.ProcessName -match $script:filtroProc })) {
      $ini = $null
      try { $ini = $p.StartTime } catch { continue }
      if ($ini -lt $m.desde.AddSeconds(-5)) { continue }
      try {
        $cond = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, $p.Id)
        foreach ($v in $AE::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)) {
          try {
            $wp = $v.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern)
            if ($wp.Current.CanMinimize -and $wp.Current.WindowVisualState -ne [System.Windows.Automation.WindowVisualState]::Minimized) {
              $wp.SetWindowVisualState([System.Windows.Automation.WindowVisualState]::Minimized)
              $k = [string]$p.Id + ':' + [string]$v.Current.Name
              if (-not $hechas.ContainsKey($k)) { $hechas[$k] = $true; Log ('matrix: ventana «' + [string]$v.Current.Name + '» minimizada (pid ' + $p.Id + ').') }
            }
          } catch { }
        }
      } catch { }
    }
    Start-Sleep -Milliseconds 1000
  }
}

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
$script:fechasApagadas = $false
$script:motivoFechas = ''
$script:casillaFalla = $false
$script:rangoOriginal = $null
$script:ajuste = $(if ($rangoAuto) { '' } else { 'apagado' })
try { (Get-Process -Id $PID).PriorityClass = 'BelowNormal' } catch { }
# e1.7: que el equipo no se suspenda ni apague la pantalla mientras el lector corre (Pide-Pantalla, se repite en cada
# ciclo). No simula teclas ni mouse, y las políticas de bloqueo de TI solo se leen: no se tocan.
# e1.8: si el tipo ya existe (mismo proceso) no es error; si no se pudo crear, el motivo viaja en «pantalla».
$script:energiaError = ''
$script:energiaError2 = ''
$script:pantallaMotivo = ''
if (-not ('EspejoGrader.Energia' -as [type])) {
  try { Add-Type -Namespace EspejoGrader -Name Energia -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);' -ErrorAction Stop } catch { $script:energiaError = [string]$_.Exception.Message; if ($script:energiaError.Length -gt 160) { $script:energiaError = $script:energiaError.Substring(0, 160) } }
}
$script:pantallaPedida = Pide-Pantalla
$script:politicas = Politicas-Bloqueo
$script:bloqueoDesde = $null
$script:ultimoBloqueo = $null
# e1.7: Matrix (ruta vista, abrir si no corre) y huecos (conteos del espejo, hora a medias, ronda en curso).
$script:abrirMatrix = $abrirMatrix
$script:carpetaMatrix = $carpetaMatrix
$script:rutaMatrix = ''
$script:matrixTexto = ''
$script:topeHuecoSeg = $topeHueco
$script:minConteos = $minConteos
$script:conteos = $null
$script:huecoActual = $null
$script:huecosPlan = $null
$script:huecosRonda = $null
$script:huecosTexto = ''
$script:horasReleidas = @{}
$script:horasAgotadas = @{}
$script:ultRefresco = [datetime]::MinValue
$script:bloqueada = $false
$script:actualizar = $null
$script:vivoFin = $null
# e1.6: recarga en curso (@{ estado; enviadas; marca; avance }), su cierre para el latido y el re-anclaje al volver.
$script:recarga = $null
$script:recargaCierre = ''
$script:recargaHecha = ''
$script:reanclar = $false
# e1.9: clave «periodo» del latido y si el informe está fuera de «Usuario definido» (entonces no se escriben fechas).
$script:periodoTexto = ''
$script:periodoRelativo = $false
# e1.10: pedido de Puerta 0 de la última respuesta, envío de Puerta 0 pendiente por red, tope de lectura y minimizado.
$script:p0Pedido = ''
$script:p0Pendiente = $null
$script:topeP0Seg = $topeP0
$script:minimizar = $null
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
$estIni = @{ version = $VERSION; arranque = $script:arranque; actualiz = [string]$script:actualiz; ajuste = [string]$script:ajuste; filasTabla = 0; piezas = [int]$estado.piezas; primera = [string]$estado.primera; ultima = [string]$estado.ultima; rango = [string[]]@(); limite = $false; gate0 = 0; relectura = $false; vivo = ''; recarga = ''; pantalla = (Texto-Pantalla $script:pantallaPedida (Sesion-Bloqueada) (Get-Date)); matrix = ''; huecos = ''; periodo = ''; error = 'iniciando' }
$respIni = Envia @() $estIni
if ($respIni -eq 'fin') { $terminar = $true }
Escribe-Latido 'inicio'
if (-not $terminar) {
  $ra = Revisa-Actualizacion
  if ($ra) { $script:actualiz = $ra }
  if ($ra -like 'bajada *') { $terminar = $true }
}
# e1.10: una alternancia que quedó a medias (el lector murió en «Puerta 0») intenta volver una vez.
if (-not $terminar) { try { Recupera-P0 } catch { Log ('p0: error al recuperar: ' + $_.Exception.Message) } }
$refrescar = $true
while (-not $terminar) {
  $reloj = [Diagnostics.Stopwatch]::StartNew()
  $res = $null
  $script:bloqueada = Sesion-Bloqueada
  # e1.7: el pedido de pantalla se renueva y las políticas se vuelven a leer en cada ciclo (son lecturas de registro).
  $script:pantallaPedida = Pide-Pantalla
  $script:politicas = Politicas-Bloqueo
  # e1.6: empieza, sigue o se cancela la recarga de historia según el archivo RECARGA.
  $marcaRec = Marca-Recarga
  if ($marcaRec -and -not $script:recarga -and $marcaRec -ne $script:recargaHecha) {
    $script:recarga = @{ estado = (Carga-Estado $archivoRecargaEstado); enviadas = 0; marca = $marcaRec; avance = 0; total = 0; reanclar = $false }
    $script:recarga.reanclar = [bool]$script:recarga.estado.ancla
    # Al retomar, lo ya enviado sale de recarga.json (sus «piezas»), no vuelve a 0.
    $script:recarga.enviadas = [int]$script:recarga.estado.piezas
    $script:recargaCierre = ''
    $refrescar = $true
    Log ('Recarga de historia: lee entero el rango que muestra Matrix, sin corte por antigüedad' + $(if ($script:recarga.reanclar) { ' (sigue la que quedó a medias)' } else { '' }) + '.')
  } elseif (-not $marcaRec -and $script:recarga) {
    Log ('Recarga cancelada (se borró RECARGA): ' + $script:recarga.enviadas + ' filas-pieza enviadas. Vuelve al modo normal.')
    $script:recargaCierre = 'cancelada ' + [int]$script:recarga.enviadas
    $script:recarga = $null
    try { Remove-Item -LiteralPath $archivoRecargaEstado -Force -ErrorAction Stop } catch { }
    $script:reanclar = $true
    $refrescar = $true
  }
  $rec = $script:recarga
  # El estado que se lee y avanza: el de la recarga (recarga.json) o el normal (estado.json), nunca los dos.
  $est = $estado
  $archivoEst = $archivoEstado
  if ($rec) { $est = $rec.estado; $archivoEst = $archivoRecargaEstado }
  $reanclarCiclo = $(if ($rec) { [bool]$rec.reanclar } else { [bool]$script:reanclar })
  try {
    Revisa-Detener
    # Ciclo puede dejar salida suelta en el pipeline: se toma solo el resumen (hashtable).
    $res = @(Ciclo $est $reloj $refrescar ([bool]$rec) $reanclarCiclo) | Where-Object { $_ -is [hashtable] } | Select-Object -Last 1
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
    $res = @{ error = $(if ($msg -eq 'tope-10-min') { 'tope-10-min' } else { 'excepcion' }); ftabla = $ftErr; leidas = 0; enviadas = 0; relectura = $false; parcial = $false; pendientes = 0; gate0 = 0; rango = $rangoErr; limite = $limiteErr; primera = $est.primera; ultima = $est.ultima; piezas = $est.piezas; fin = ''; reancla = '' }
  }

  $items = @()
  if ($res.lec) { $items = $res.lec.items.ToArray() }
  $base = $res.base
  if ($null -eq $base) { $base = $est.piezas }
  $piezas = $base + $items.Count
  if ($res.lec -and $res.lec.relectura) { $piezas = $items.Count }
  $primera = $est.primera
  if (($res.lec -and $res.lec.relectura) -or -not $primera) { $primera = '' }
  if ($items.Count -gt 0 -and -not $primera) { $primera = (Fecha-Hora ($items[0].cel)) }
  $ultima = $est.ultima
  if ($items.Count -gt 0) { $ultima = (Fecha-Hora ($items[$items.Count - 1].cel)) }
  # e1.7: el error va tal cual; el bloqueo viaja aparte (claves «bloqueada» y «pantalla»).
  $errC = [string]$res.error
  # e1.7: Matrix no corre: el lector lo abre (con tope). Con Matrix a la vista la clave conserva solo la última apertura.
  if ($errC -eq 'sin-matrix') { $script:matrixTexto = Abre-Matrix (Get-Date) }
  elseif ($script:matrixTexto -like 'no-abre*') { $script:matrixTexto = '' }
  elseif ($script:matrixTexto -like '* esperando') { $script:matrixTexto = $script:matrixTexto.Substring(0, $script:matrixTexto.Length - 10) }
  # e1.6: en recarga el latido sigue contando el turno normal (piezas, primera, última) y va «parcial»: el monitor
  # no da por leídos los minutos de hoy mientras el lector mira días viejos.
  $latPiezas = $piezas; $latPrimera = $primera; $latUltima = $ultima; $latParcial = [bool]$res.parcial
  if ($rec) {
    $latPiezas = $estado.piezas; $latPrimera = $estado.primera; $latUltima = $estado.ultima; $latParcial = $true
    if ($res.lec) { $rec.avance = [int]$res.lec.hastaIdx + 1; $rec.total = [int]$res.ftabla }
  }
  $estC = @{ version = $VERSION; arranque = $script:arranque; actualiz = [string]$script:actualiz; ajuste = [string]$script:ajuste; bloqueada = [bool]$script:bloqueada; filasTabla = [int]$res.ftabla; piezas = [int]$latPiezas; primera = $latPrimera; ultima = $latUltima; rango = [string[]]@($res.rango); limite = [bool]$res.limite; gate0 = [int]$res.gate0; relectura = [bool]$res.relectura; error = $errC; seg = [math]::Round($reloj.Elapsed.TotalSeconds, 1); leidas = [int]$items.Count; pendientes = [int]$res.pendientes; parcial = $latParcial; vivo = (Texto-Vivo); recarga = (Texto-Recarga $rec $script:recargaCierre $(if ($rec) { [int]$rec.avance } else { 0 }) $(if ($rec) { [int]$rec.total } else { 0 }) ([string]$res.error)); pantalla = (Texto-Pantalla $script:pantallaPedida $script:bloqueada (Get-Date)); matrix = [string]$script:matrixTexto; huecos = (Texto-Huecos); periodo = [string]$script:periodoTexto }

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
      # Solo tras el 200: avanza el ancla, los conteos y las piezas (de la recarga o del modo normal).
      $est.ancla = @{ idx = [int]$items[$ultimo].idx; texto = [string]$items[$ultimo].texto }
      $est.conteos = Conteos-Hasta $res.lec $ultimo
      $est.sec = [string]$items[$ultimo].sec
      $est.piezas = $base + $ultimo + 1
      $est.primera = $primera
      $est.ultima = (Fecha-Hora ($items[$ultimo].cel))
      Guarda-Estado $est $archivoEst
      $enviadas += ($ultimo - $inicio + 1)
      if ($rec) { $rec.enviadas = [int]$est.piezas }
      $inicio = $ultimo + 1
    }
  }

  # Lectura a medias y todo enviado: avanza el ancla hasta la última fila recorrida (las filas sin fecha
  # del final del tramo no producen lote). Solo si el tramo fue parcial: al final de la tabla las filas
  # de cierre sin fecha cambian de índice cuando la tabla crece.
  $envioOk = ($enviadas -eq $items.Count)
  if ($res.lec -and $res.lec.parcial -and -not $fin -and $envioOk) {
    $idxActual = -1
    if ($est.ancla -and ($items.Count -gt 0 -or -not $res.lec.relectura)) { $idxActual = [int]$est.ancla.idx }
    if ([int]$res.lec.hastaIdx -gt $idxActual) {
      $est.ancla = @{ idx = [int]$res.lec.hastaIdx; texto = [string]$res.lec.hastaTexto }
      if ($idxActual -lt 0 -and $res.lec.relectura) { $est.conteos = @(); $est.sec = ''; $est.piezas = 0; $est.primera = ''; $est.ultima = '' }
      Guarda-Estado $est $archivoEst
    }
  }

  if ($rec) {
    # El re-anclaje de una recarga retomada se intenta una vez; después manda el índice.
    if ($res.lec) { $rec.reanclar = $false }
    # Llegó al final del rango sin error y con todo enviado: termina la recarga y vuelve solo al modo normal.
    if ($res.lec -and -not $res.lec.parcial -and -not [string]$res.error -and $envioOk -and -not $fin) {
      $script:recargaCierre = ('terminada ' + [int]$rec.enviadas + ' ' + [string]$est.primera + ' a ' + [string]$est.ultima).Trim()
      Log ('Recarga terminada: ' + [int]$rec.enviadas + ' filas-pieza enviadas (' + [string]$est.primera + ' a ' + [string]$est.ultima + '). Vuelve al modo normal; pon de nuevo en Matrix el rango de hoy.')
      try { Remove-Item -LiteralPath $archivoRecarga -Force -ErrorAction Stop } catch { Log ('No se pudo borrar RECARGA: ' + $_.Exception.Message + '. No se vuelve a recargar con el mismo archivo.') }
      try { Remove-Item -LiteralPath $archivoRecargaEstado -Force -ErrorAction Stop } catch { }
      $script:recargaHecha = [string]$rec.marca
      $script:recarga = $null
      $script:reanclar = $true
    }
  } elseif ($script:reanclar -and $res.lec -and ($res.lec.anclaOk -or $items.Count -gt 0 -or -not $estado.ancla)) {
    # De vuelta en el modo normal: el ancla volvió a aparecer (o se reemplazó al enviar). Hasta entonces, cada ciclo la
    # busca por contenido; mientras Matrix siga con el rango viejo no hay filas nuevas y el ancla no se pierde.
    $script:reanclar = $false
  }

  # e1.7: huecos del espejo, solo con el turno al día: sin recarga ni modo vivo, y la lectura normal completa y enviada.
  $huecoSigue = $false
  $enviadasH = 0
  if (-not $rec -and -not $fin -and $res.gp -and $res.lec -and -not $res.lec.parcial -and -not [string]$res.error -and $envioOk -and -not (Texto-Vivo)) {
    try {
      $ph = Paso-Huecos $res.gp ([int]$res.ftabla) ([string[]]@($res.rango)) $estC
      $enviadasH = [int]$ph.enviadas
      $huecoSigue = [bool]$ph.sigue
      if ($ph.resp -eq 'fin') { $fin = 'fin' }
      # Sin filas que mandar pero con otro texto (p. ej. quedó «al-dia»): latido corto para que la ficha lo vea ya.
      if (-not $fin -and $enviadasH -eq 0 -and [string]$estC.huecos -ne (Texto-Huecos)) {
        $estC.huecos = Texto-Huecos
        if ((Envia @() $estC) -eq 'fin') { $fin = 'fin' }
      }
    } catch {
      if ([string]$_.Exception.Message -eq 'DETENER') {
        try { Remove-Item -LiteralPath $archivoDetener -Force } catch { }
        Log 'Archivo DETENER: el lector termina.'
        $terminar = $true
        break
      }
      Log ('huecos: error ' + $_.Exception.Message)
      $script:huecoActual = $null
      $script:huecosPlan = $null
      $script:huecosTexto = 'error'
    }
  }

  $seg = [math]::Round($reloj.Elapsed.TotalSeconds, 1)
  $leidas = $items.Count
  Log ('ciclo: filas-pieza leídas=' + $leidas + ' enviadas=' + $enviadas + ' filas-tabla=' + [int]$res.ftabla + ' seg=' + $seg + ' relectura=' + [bool]$res.relectura + ' parcial=' + [bool]$res.parcial + ' pendientes=' + [int]$res.pendientes + ' bloqueada=' + [bool]$script:bloqueada + ' vivo=' + [bool]((Texto-Vivo) -ne '') + ' recarga=' + [bool]$rec + ' huecos=' + $enviadasH + ' error=' + [string]$res.error)
  if ($fin) { $terminar = $true; break }
  # «ciclo» (confirma una versión nueva) solo si la función aceptó el envío y el ciclo no reventó; si no, «vivo».
  $tipoLat = 'vivo'
  if ($resp -eq 'ok' -and @('excepcion', 'tope-10-min') -notcontains [string]$res.error) { $tipoLat = 'ciclo' }
  Escribe-Latido $tipoLat
  # e1.10: Puerta 0 (pasiva, alternancia o respuesta a un pedido) después del latido, para que el vigilante vea el ciclo.
  # Alterna solo tras un ciclo normal sano: sin recarga, todo leído y enviado, sin huecos pendientes ni sesión bloqueada.
  $sanoP0 = ($resp -eq 'ok' -and -not $rec -and $res.lec -and -not $res.lec.parcial -and -not [string]$res.error -and $envioOk -and -not $huecoSigue -and -not $script:bloqueada)
  try {
    $pp = @(Paso-P0 $res ([bool]$sanoP0)) | Where-Object { $_ -is [hashtable] } | Select-Object -Last 1
    if ($pp -and $pp.resp -eq 'fin') { $terminar = $true; break }
  } catch { Log ('p0: error ' + $_.Exception.Message) }
  try { Minimiza-Matrix } catch { }
  # Una versión nueva no se pone en marcha a mitad de un tramo ni de una recarga (la recarga la retoma igual al volver).
  if (($res.lec -and $res.lec.parcial -and -not [string]$res.error -and $envioOk) -or $script:recarga) { } else {
    $ra = Revisa-Actualizacion
    if ($ra) { $script:actualiz = $ra }
    if ($ra -like 'bajada *') { $terminar = $true; break }
  }
  # Si quedó a medias (sin error ni fallo de envío), el siguiente ciclo sigue ya, sin pulsar «Actualizar».
  $espera = Espera-Ciclo $cada $script:vivoFin (Get-Date)
  $refrescar = $true
  # e1.6: una recarga que no pudo leer (Matrix ocupado, «Limitar» marcada) reintenta en 1 min, no en 5.
  if ($res.lec -and $res.lec.parcial -and -not [string]$res.error -and $envioOk) { $espera = 5; $refrescar = $false }
  elseif ($script:recarga) { $espera = [math]::Min($espera, $ESPERA_VIVO) }
  elseif ($huecoSigue) {
    # e1.7: quedan huecos: sigue enseguida, pero el turno va primero: «Actualizar» al menos cada ESPEJO_CADA.
    $espera = 5
    $refrescar = (((Get-Date) - $script:ultRefresco).TotalSeconds -ge $cada)
  }
  try { Espera $espera } catch {
    if ([string]$_.Exception.Message -eq 'DETENER') {
      try { Remove-Item -LiteralPath $archivoDetener -Force } catch { }
      Log 'Archivo DETENER: el lector termina.'
      $terminar = $true
    }
  }
}
# e1.8: al salir limpio el equipo vuelve a suspender y apagar la pantalla como siempre (solo ES_CONTINUOUS).
$null = Pide-Pantalla 2147483648
Log 'Fin del lector.'
try { $script:mutex.ReleaseMutex() } catch { }
exit 0