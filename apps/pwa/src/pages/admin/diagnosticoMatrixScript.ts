/**
 * Script de solo lectura que se copia desde la página Diagnóstico Matrix.
 * Fuente: _HERRAMIENTAS/matrix-diagnostico/diagnostico-matrix.ps1 (copiado TAL CUAL).
 * Si el .ps1 cambia, regenerar este archivo desde el original; no editarlo a mano.
 */
export const DIAGNOSTICO_MATRIX_PS1 = `# Diagnóstico de SOLO LECTURA del PC de Matrix (Marelec). No instala, no cambia ni borra nada.
# Uso: abrir Matrix, abrir PowerShell (no hace falta administrador), pegar TODO este texto y presionar Enter.
# Al terminar limpia la pantalla y muestra el informe ordenado para sacarle foto.
# También lo guarda en "diagnostico-matrix.txt" en el Escritorio.
& {  # todo en un bloque: al pegarlo corre de una vez y la pantalla queda limpia
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'diagnostico-matrix.txt'
$L = New-Object System.Collections.Generic.List[string]
function T([string]$s) { $L.Add(''); $L.Add($s) }
function F([string]$s) {
  $ancho = 88
  while ($s.Length -gt $ancho) {
    $corte = $s.LastIndexOf(' ', $ancho); if ($corte -lt 20) { $corte = $ancho }
    $L.Add('  ' + $s.Substring(0, $corte)); $s = '      ' + $s.Substring($corte).TrimStart()
  }
  $L.Add('  ' + $s)
}
function Nada($x) { if (-not $x) { F '(nada)' } }
function Tam($b) { if ($b -ge 1MB) { '{0:N1} MB' -f ($b / 1MB) } else { '{0:N0} KB' -f ($b / 1KB) } }
$filtroBd = 'marelec|matrix|sql|firebird|interbase|mysql|maria|postgres'

T '1. EQUIPO'
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrators')
F ("Fecha: {0:dd-MM-yyyy HH:mm}  Equipo: {1}  Usuario: {2}" -f (Get-Date), $env:COMPUTERNAME, $env:USERNAME)
F ("Administrador: {0}  Windows: {1}" -f $(if ($esAdmin) { 'sí' } else { 'no' }), (Get-CimInstance Win32_OperatingSystem).Caption)

T '2. PROGRAMAS (Marelec, Matrix, bases de datos)'
$prog = Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -match "$filtroBd|access database|odbc" } | Sort-Object DisplayName -Unique
foreach ($p in $prog) {
  F ("- {0}  v{1}  ({2})" -f $p.DisplayName, $p.DisplayVersion, $p.Publisher)
  if ($p.InstallLocation) { F ("    en: " + $p.InstallLocation) }
}
Nada $prog

T '3. SERVICIOS'
$serv = Get-Service | Where-Object { $_.DisplayName -match $filtroBd -or $_.Name -match $filtroBd }
foreach ($s in $serv) { F ("- [{0}] {1}  ({2})" -f $(if ($s.Status -eq 'Running') { 'corre' } else { 'detenido' }), $s.DisplayName, $s.Name) }
Nada $serv

T '4. ORÍGENES ODBC'
$dsn = try { Get-OdbcDsn -ErrorAction Stop } catch { $null }
foreach ($d in $dsn) { F ("- {0} | {1} | {2} {3}" -f $d.Name, $d.DriverName, $d.DsnType, $d.Platform) }
Nada $dsn

T '5. CARPETAS DE MATRIX Y ARCHIVOS DE CONFIGURACIÓN O BASE'
$raices = @($env:ProgramFiles, \${env:ProgramFiles(x86)}, $env:ProgramData, 'C:\\', 'D:\\') | Where-Object { $_ -and (Test-Path $_) }
$dirs = foreach ($r in $raices) { Get-ChildItem $r -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'marelec|matrix' } }
foreach ($dir in $dirs) {
  F ("- " + $dir.FullName)
  $arch = Get-ChildItem $dir.FullName -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -match '^\\.(ini|config|udl|xml|mdb|accdb|fdb|gdb|mdf|ldf|db|sqlite|db3)$' } | Select-Object -First 40
  foreach ($a in $arch) { F ("    {0} | {1} | {2:dd-MM-yyyy}" -f $a.FullName.Substring($dir.FullName.Length), (Tam $a.Length), $a.LastWriteTime) }
  # Líneas de conexión de la configuración, con las claves TAPADAS
  $conf = $arch | Where-Object { $_.Extension -match '^\\.(ini|config|udl)$' -and $_.Length -lt 50KB } | Select-Object -First 15
  foreach ($c in $conf) {
    (Get-Content $c.FullName -ErrorAction SilentlyContinue) -replace '(?i)(password|pwd|pass|clave)\\s*=\\s*[^;"<\\s]+', '$1=***' |
      Where-Object { $_ -match '(?i)server|source|database|catalog|provider|dsn|host|port|export|path|report' } |
      Select-Object -First 8 | ForEach-Object { F ("    > {0}: {1}" -f $c.Name, $_.Trim()) }
  }
}
Nada $dirs

T '6. TAREAS PROGRAMADAS DE MATRIX'
$tareas = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match 'marelec|matrix' -or ($_.Actions.Execute -join ' ') -match 'marelec|matrix' }
foreach ($t in $tareas) { F ("- {0}  ({1})" -f $t.TaskName, $t.State) }
Nada $tareas

T '7. EXCEL RECIENTES (últimos 60 días, posibles exportes de Matrix)'
$xls = @("$env:USERPROFILE\\Documents", "$env:USERPROFILE\\Desktop", "$env:USERPROFILE\\Downloads", [Environment]::GetFolderPath('Desktop')) |
  Where-Object { Test-Path $_ } | Select-Object -Unique | ForEach-Object {
    Get-ChildItem $_ -Recurse -Include *.xls, *.xlsx, *.csv -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-60) }
  } | Sort-Object FullName -Unique | Sort-Object LastWriteTime -Descending | Select-Object -First 15
foreach ($x in $xls) { F ("- {0:dd-MM HH:mm} | {1} | {2}" -f $x.LastWriteTime, (Tam $x.Length), $x.FullName) }
Nada $xls

T '8. RED'
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127|169\\.254)\\.' }
foreach ($i in $ips) { F ("- {0}: {1}" -f $i.InterfaceAlias, $i.IPAddress) }
Nada $ips
$fs = (Test-NetConnection firestore.googleapis.com -Port 443 -WarningAction SilentlyContinue).TcpTestSucceeded
F ("Internet hacia Firestore: " + $(if ($fs) { 'sí' } else { 'NO' }))

T '9. CONEXIONES DE MATRIX (dónde vive su base)'
$pids = (Get-Process | Where-Object { $_.ProcessName -match 'marelec|matrix' }).Id
if ($pids) {
  $con = Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $pids -contains $_.OwningProcess -and $_.RemoteAddress -notmatch '^(0\\.0\\.0\\.0|::)$' }
  foreach ($k in $con) { F ("- puerto local {0} -> {1}:{2}  ({3})" -f $k.LocalPort, $k.RemoteAddress, $k.RemotePort, $k.State) }
  Nada $con
} else { F 'Matrix no está abierto: ábrelo y vuelve a pegar el script.' }

$L | Out-File -FilePath $out -Encoding utf8
Clear-Host
Write-Host 'DIAGNÓSTICO MATRIX  (solo lectura)' -ForegroundColor Yellow
foreach ($linea in $L) { if ($linea -match '^\\d\\. ') { Write-Host $linea -ForegroundColor Cyan } else { Write-Host $linea } }
Write-Host ''
Write-Host "Guardado en: $out" -ForegroundColor Yellow
}
`
