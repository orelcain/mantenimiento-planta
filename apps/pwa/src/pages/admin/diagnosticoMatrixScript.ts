/**
 * Script de solo lectura que se copia desde la página Diagnóstico Matrix.
 * Fuente: _HERRAMIENTAS/matrix-diagnostico/diagnostico-matrix.ps1 (copiado TAL CUAL).
 * Si el .ps1 cambia, regenerar este archivo desde el original; no editarlo a mano.
 */
export const DIAGNOSTICO_MATRIX_PS1 = `# Diagnóstico de SOLO LECTURA del PC de Matrix (Marelec). No instala, no cambia ni borra nada.
# Uso: abrir PowerShell (no hace falta administrador), pegar TODO este texto y presionar Enter.
# Resultado: archivo "diagnostico-matrix.txt" en el Escritorio. Revisarlo antes de enviarlo.
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'diagnostico-matrix.txt'
& {
  "== Fecha: $(Get-Date)  Equipo: $env:COMPUTERNAME  Usuario: $env:USERNAME"
  "== Es administrador: " + ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrators')
  "== Windows: " + (Get-CimInstance Win32_OperatingSystem).Caption
  "\`n== Programas instalados (Marelec / Matrix / bases de datos)"
  Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -match 'marelec|matrix|sql|firebird|interbase|mysql|maria|postgres|access database|odbc' } |
    Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation | Format-Table -AutoSize -Wrap | Out-String -Width 250
  "\`n== Servicios relacionados"
  Get-Service | Where-Object { $_.DisplayName -match 'marelec|matrix|sql|firebird|interbase|mysql|maria|postgres' } |
    Select-Object Status, Name, DisplayName | Format-Table -AutoSize | Out-String -Width 250
  "\`n== Orígenes ODBC"
  try { Get-OdbcDsn | Select-Object Name, DsnType, DriverName, Platform | Format-Table -AutoSize | Out-String -Width 250 } catch { "sin acceso a ODBC" }
  "\`n== Carpetas de Marelec/Matrix y archivos de configuración o base"
  $raices = @($env:ProgramFiles, \${env:ProgramFiles(x86)}, $env:ProgramData, 'C:\\', 'D:\\') | Where-Object { $_ -and (Test-Path $_) }
  $dirs = foreach ($r in $raices) { Get-ChildItem $r -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'marelec|matrix' } }
  foreach ($d in $dirs) {
    "-- $($d.FullName)"
    Get-ChildItem $d.FullName -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -match '^\\.(ini|config|udl|xml|mdb|accdb|fdb|gdb|mdf|ldf|db|sqlite|db3)$' } |
      Select-Object -First 60 FullName, Length, LastWriteTime | Format-Table -AutoSize | Out-String -Width 300
    # Contenido de configuración con las claves TAPADAS
    Get-ChildItem $d.FullName -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '^\\.(ini|config|udl)$' -and $_.Length -lt 50KB } |
      Select-Object -First 15 | ForEach-Object {
        "---- $($_.FullName)"
        (Get-Content $_.FullName -ErrorAction SilentlyContinue) -replace '(?i)(password|pwd|pass|clave)\\s*=\\s*[^;"<\\s]+', '$1=***' |
          Where-Object { $_ -match '(?i)server|source|database|catalog|provider|dsn|host|port|export|path|report' }
      }
  }
  "\`n== Tareas programadas con Marelec/Matrix"
  Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match 'marelec|matrix' -or ($_.Actions.Execute -join ' ') -match 'marelec|matrix' } |
    Select-Object TaskName, State | Format-Table -AutoSize | Out-String
  "\`n== Excel recientes (posibles exportes de Matrix, últimos 60 días)"
  @("$env:USERPROFILE\\Documents", "$env:USERPROFILE\\Desktop", "$env:USERPROFILE\\Downloads") | Where-Object { Test-Path $_ } | ForEach-Object {
    Get-ChildItem $_ -Recurse -Include *.xls,*.xlsx,*.csv -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-60) }
  } | Sort-Object LastWriteTime -Descending | Select-Object -First 20 FullName, Length, LastWriteTime | Format-Table -AutoSize | Out-String -Width 300
  "\`n== Red (IP propias) e internet hacia Firestore"
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^127' } | Select-Object InterfaceAlias, IPAddress | Format-Table -AutoSize | Out-String
  "Firestore 443: " + (Test-NetConnection firestore.googleapis.com -Port 443 -WarningAction SilentlyContinue).TcpTestSucceeded
  "\`n== Conexiones abiertas de procesos Matrix/Marelec (para ver dónde vive la base)"
  $pids = (Get-Process | Where-Object { $_.ProcessName -match 'marelec|matrix' }).Id
  if ($pids) { Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $pids -contains $_.OwningProcess } | Select-Object LocalPort, RemoteAddress, RemotePort, State | Format-Table -AutoSize | Out-String } else { "Matrix no está abierto ahora (abrirlo y volver a correr para ver esto)" }
} *>&1 | Out-File -FilePath $out -Encoding utf8
"Listo: $out"
`
