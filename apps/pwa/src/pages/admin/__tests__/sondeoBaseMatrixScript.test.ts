/**
 * El sondeo de la base de Matrix debe llegar INTACTO y seguir siendo de SOLO
 * LECTURA: no se conecta a ninguna base, no escribe, no inicia ni detiene
 * servicios y no abre credenciales. Un cambio que lo rompa se detecta aquí.
 */
import { describe, it, expect } from 'vitest'
import { SONDEO_BASE_MATRIX_PS1 } from '../sondeoBaseMatrixScript'

const ENCABEZADO = '# Sondeo de la base de Matrix (Marelec). SOLO LECTURA: no se conecta a ninguna base, no escribe ni cambia nada.'

// Todo lo que el sondeo NO puede contener: conexiones, escrituras, servicios, red de envío y teclas.
const PROHIBIDOS =
  /SqlConnection|OleDbConnection|OdbcConnection|\.Open\(|Invoke-Sqlcmd|&\s*['"]?sqlcmd|\bsqlcmd\s+-|Set-ItemProperty|New-ItemProperty|Remove-Item|Set-Content|Out-File|Stop-Service|Start-Service|Set-Service|Invoke-WebRequest|Invoke-RestMethod|SendKeys|\.Invoke\(\)|\.SetValue\(|\.Expand\(|\.Select\(|\.SetFocus\(|\.Invoke\(\)|powercfg\s+\/(change|set|s\b|x\b)/i

describe('SONDEO_BASE_MATRIX_PS1', () => {
  it('empieza con el encabezado exacto del script de solo lectura', () => {
    expect(SONDEO_BASE_MATRIX_PS1.split('\n')[0]).toBe(ENCABEZADO)
  })

  it('va en un solo bloque para que al pegarlo corra de una vez', () => {
    const codigo = SONDEO_BASE_MATRIX_PS1.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'))
    expect(codigo[0]?.startsWith('& {')).toBe(true)
    expect(codigo[codigo.length - 1]).toBe('}')
    expect(SONDEO_BASE_MATRIX_PS1.match(/^& \{/gm)?.length).toBe(1)
  })

  it('no contiene operaciones prohibidas (conexiones, escrituras, servicios, teclas)', () => {
    expect(SONDEO_BASE_MATRIX_PS1).not.toMatch(PROHIBIDOS)
  })

  it('no contiene tabuladores literales', () => {
    expect(SONDEO_BASE_MATRIX_PS1).not.toContain('\t')
  })

  it('escribe el informe una sola vez con WriteAllLines', () => {
    expect(SONDEO_BASE_MATRIX_PS1.split('WriteAllLines').length - 1).toBe(1)
  })

  it('conserva las barras invertidas de las rutas del registro y de los reemplazos', () => {
    expect(SONDEO_BASE_MATRIX_PS1).toContain("'HKLM:\\SOFTWARE\\Microsoft\\Microsoft SQL Server'")
    expect(SONDEO_BASE_MATRIX_PS1).toContain("'\\Instance Names\\SQL'")
    expect(SONDEO_BASE_MATRIX_PS1).toContain('HKLM:\\SOFTWARE\\WOW6432Node\\ODBC\\ODBC.INI')
    expect(SONDEO_BASE_MATRIX_PS1).toContain("-replace '\\s+', ' '")
  })

  it('nombra el archivo del Escritorio y usa la carpeta de Escritorio por defecto', () => {
    expect(SONDEO_BASE_MATRIX_PS1).toContain("'sondeo-base-matrix-{0:HHmmss}.txt'")
    expect(SONDEO_BASE_MATRIX_PS1).toContain("[Environment]::GetFolderPath('Desktop')")
  })

  it('acepta inyectar carpetas y salida por variables de entorno', () => {
    expect(SONDEO_BASE_MATRIX_PS1).toContain('$env:SONDEO_CARPETAS')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('$env:SONDEO_SALIDA')
  })

  it('tiene topes de archivos, profundidad, tiempo y tamaño de config', () => {
    expect(SONDEO_BASE_MATRIX_PS1).toContain('$st.vistos -lt 3000')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('$par.N -lt 6')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('$reloj.Elapsed.TotalSeconds -lt 25')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('$f.Length -gt 2MB')
  })

  it('no muestra usuario ni contraseña: los reemplaza por (oculto) y (oculta)', () => {
    expect(SONDEO_BASE_MATRIX_PS1).toContain('usuario: (oculto)')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('contraseña: (oculta)')
    expect(SONDEO_BASE_MATRIX_PS1).not.toMatch(/ClaveFalsa|OtraFalsa|LICENCIA-SECRETA/)
  })

  it('omite los archivos de licencia por nombre, sin leerlos', () => {
    expect(SONDEO_BASE_MATRIX_PS1).toContain('archivo de licencia omitido')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('licen|license|lizenz|key|clave')
  })

  it('incluye la sección de informes por UI Automation, sin clic ni cambio de informe', () => {
    expect(SONDEO_BASE_MATRIX_PS1).toContain('INFORMES QUE OFRECE MATRIX')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('ControlViewWalker')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('$uia.nodos -ge 4000')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('SelectionItemPattern')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('GetCurrentColumnHeaders()')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('Matrix no está abierto')
  })

  it('incluye la sección de suspensión y bloqueo, solo con powercfg de lectura', () => {
    expect(SONDEO_BASE_MATRIX_PS1).toContain('SUSPENSIÓN Y BLOQUEO DE PANTALLA')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('powercfg /getactivescheme')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('SUB_SLEEP')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('STANDBYIDLE')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('SUB_VIDEO')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('VIDEOIDLE')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('InactivityTimeoutSecs')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('HKCU:\\Software\\Policies\\Microsoft')
  })

  it('no extrae servidor ni base de dentro de un valor: quita antes los secretos', () => {
    expect(SONDEO_BASE_MATRIX_PS1).toContain('[regex]::Replace($txt,')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('(?<=^|[;"')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('[regex]::Matches($limpio,')
  })

  it('lista las bibliotecas SQL de Matrix y sus conexiones ya abiertas, sin abrir ninguna', () => {
    expect(SONDEO_BASE_MATRIX_PS1).toContain('CÓMO HABLA MATRIX CON SU SERVIDOR')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('qsql\\w*|Qt\\d*Sql\\w*|libpq')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('Get-NetTCPConnection -State Established')
    expect(SONDEO_BASE_MATRIX_PS1).toContain("'SQLite (archivo local, no servidor)'")
    expect(SONDEO_BASE_MATRIX_PS1).toContain('Matrix habla SQL con su servidor')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('habla con Matrix CS por un protocolo propio')
    expect(SONDEO_BASE_MATRIX_PS1).not.toMatch(/TcpClient|Test-NetConnection|Test-Connection|\.Connect\(|Resolve-DnsName/i)
  })

  it('un plugin qsql* suelto no basta: el veredicto pide evidencia fuerte', () => {
    // Qt copia varios drivers aunque el programa no los use: solo cuentan la biblioteca cliente,
    // el driver cargado en memoria o una conexión abierta a un puerto de base.
    expect(SONDEO_BASE_MATRIX_PS1).toContain("elseif ($nombre -match '(?i)^qsql') { [void]$posibles.Add($md) }")
    expect(SONDEO_BASE_MATRIX_PS1).toContain("' cargada en memoria'")
    expect(SONDEO_BASE_MATRIX_PS1).toContain("'conexión abierta a ' + $par")
    expect(SONDEO_BASE_MATRIX_PS1).toContain('$drvSrv = @(@($fuertes) | Sort-Object -Unique)')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('Vía de lectura: posible, sin confirmar.')
  })

  it('no afirma «sin SQL en memoria» con una lista de módulos incompleta (proceso de 32 bits)', () => {
    expect(SONDEO_BASE_MATRIX_PS1).toContain("'(?i)^kernel32\\.dll$'")
    expect(SONDEO_BASE_MATRIX_PS1).toContain("'SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe'")
    expect(SONDEO_BASE_MATRIX_PS1).toContain('La evidencia en memoria queda sin revisar.')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('$memoriaRevisada = $true')
  })

  it('con el recorrido de archivos cortado el veredicto queda sin decidir', () => {
    expect(SONDEO_BASE_MATRIX_PS1).toContain('$recorridoCortado = ($st.vistos -ge 3000 -or $reloj.Elapsed.TotalSeconds -ge 25)')
    expect(SONDEO_BASE_MATRIX_PS1).toContain("elseif ($recorridoCortado) { F 'Vía de lectura: sin decidir.")
    // El orden importa: «sin decidir» va antes que «posible» y que «protocolo propio».
    const iCortado = SONDEO_BASE_MATRIX_PS1.indexOf('elseif ($recorridoCortado)')
    expect(iCortado).toBeGreaterThan(0)
    expect(iCortado).toBeLessThan(SONDEO_BASE_MATRIX_PS1.indexOf('elseif ($psb.Count)'))
    expect(iCortado).toBeLessThan(SONDEO_BASE_MATRIX_PS1.indexOf('habla con Matrix CS por un protocolo propio'))
  })

  it('lee el registro de Marelec y Matrix con topes y sin mostrar secretos', () => {
    expect(SONDEO_BASE_MATRIX_PS1).toContain('REGISTRO DE MARELEC Y MATRIX')
    expect(SONDEO_BASE_MATRIX_PS1).toContain("'HKCU:\\Software', 'HKLM:\\SOFTWARE', 'HKLM:\\SOFTWARE\\WOW6432Node'")
    expect(SONDEO_BASE_MATRIX_PS1).toContain('$reg.claves -ge 200 -or $reg.valores -ge 400 -or $nivel -gt 5')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('pass|pwd|user|usuario|uid|login|licen')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('= (oculto)')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('(cadena con credenciales, oculta)')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('(valor opaco, omitido)')
    expect(SONDEO_BASE_MATRIX_PS1).toContain('clave de licencia omitida')
  })

  it('no pisa la lista del informe ni los datos del veredicto con variables de bucle', () => {
    // PowerShell no distingue mayúsculas: un «foreach ($l …)» o «($v …)» suelto reemplaza a $L o a $V.
    expect(SONDEO_BASE_MATRIX_PS1).not.toMatch(/foreach \(\$[lv] in /i)
  })

  it('no contiene URLs http(s): no sale a la red', () => {
    expect(SONDEO_BASE_MATRIX_PS1).not.toMatch(/https?:\/\//i)
  })
})
