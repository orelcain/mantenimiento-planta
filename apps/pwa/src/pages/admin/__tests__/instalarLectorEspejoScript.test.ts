/**
 * El instalador del lector del espejo queda corriendo en el PC de Matrix: debe
 * llegar INTACTO, accionar SOLO los controles autorizados por Orel (las 2 fechas
 * del rango, la casilla «Limitar» para desmarcarla y «Actualizar») y no llevar
 * ninguna llave dentro del texto que se pega.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { INSTALAR_LECTOR_ESPEJO_PS1 } from '../instalarLectorEspejoScript'

const S = INSTALAR_LECTOR_ESPEJO_PS1

describe('INSTALAR_LECTOR_ESPEJO_PS1', () => {
  it('no está vacío y va en un solo bloque para pegar', () => {
    expect(S.length).toBeGreaterThan(5000)
    const codigo = S.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'))
    expect(codigo[0]?.startsWith('& {')).toBe(true)
    expect(codigo[codigo.length - 1]).toBe('}')
  })

  it('acciona un único control de Matrix: una sola llamada a Invoke, sobre el botón «Actualizar»', () => {
    expect(S.match(/\.Invoke\(\)/g)?.length).toBe(1)
    expect(S).toContain('Boton-Actualizar')
    expect(S).toContain('InvokePattern')
  })

  it('e1.2: escribe solo las 2 fechas del rango, con una única llamada a SetValue', () => {
    expect(S.match(/\.SetValue\(/g)?.length).toBe(1)
    expect(S).toContain('function Escribe-Valor($el, [string]$v)')
    // Escribe-Valor solo se usa sobre el campo de inicio o el de fin del rango.
    const usos = S.match(/Escribe-Valor \$[^\s]+/g) ?? []
    expect(usos.length).toBeGreaterThan(0)
    for (const u of usos) expect(['Escribe-Valor $ctl.desde.el', 'Escribe-Valor $ctl.hasta.el']).toContain(u)
  })

  it('e1.2: solo toca los controles si encuentra EXACTAMENTE 2 fechas y 1 casilla «Limitar el informe»', () => {
    expect(S).toContain('if ($acc.campos.Count -ne 2 -or $lim.Count -ne 1) { return $r }')
    expect(S).toContain("'^\\s*Limitar el informe'")
  })

  it('e1.2: la casilla «Limitar» solo se desmarca (Toggle único y solo si está marcada)', () => {
    expect(S.match(/\.Toggle\(\)/g)?.length).toBe(1)
    expect(S).toContain("if ((Estado-Casilla $ctl.casilla.el) -eq 'On') { $ctl.casilla.el.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Toggle() }")
  })

  it('no teclea, selecciona, cierra ni mueve el foco en Matrix', () => {
    expect(S).not.toMatch(
      /\.Select\(\)|\.Expand\(\)|\.Collapse\(\)|\.Close\(\)|\.SetFocus\(\)|\.ScrollIntoView\(|SendKeys|SendInput|Set-Clipboard|mouse_event|keybd_event/,
    )
  })

  it('e1.2: evita la suspensión sin tocar la pantalla ni el bloqueo (solo ES_CONTINUOUS | ES_SYSTEM_REQUIRED)', () => {
    expect(S).toContain('SetThreadExecutionState([uint32]2147483649)')
    expect(S.match(/SetThreadExecutionState\(\[uint32\]/g)?.length).toBe(1)
    expect(S).not.toMatch(/powercfg|ScreenSaveTimeOut|InactivityTimeoutSecs|LockWorkStation/i)
  })

  it('e1.2: con la sesión bloqueada no mueve el rango y lo informa en el latido', () => {
    expect(S).toContain('-and -not $script:bloqueada) { $aj = Ajusta-Rango $foto.el $estado }')
    expect(S).toContain("if ($script:bloqueada -and $errC) { $errC = 'pantalla-bloqueada' }")
  })

  it('es la versión e1.3 (una sola línea $VERSION) y avisa arranque, actualización y rango en el latido', () => {
    expect(S.match(/^\$VERSION = 'e[0-9.]+'\r?$/gm)).toEqual(["$VERSION = 'e1.3'"])
    expect(S).toContain('version = $VERSION; arranque = $script:arranque; actualiz = [string]$script:actualiz; ajuste = [string]$script:ajuste;')
    expect(S).not.toMatch(/version = 'e1\.[0-2]'/)
  })

  it('e1.3: el latido no pasa de 20 claves (la función rechaza más)', () => {
    const linea = S.split('\n').find((l) => l.includes('$estC = @{ version = $VERSION'))!
    const claves = linea.slice(linea.indexOf('@{') + 2, linea.lastIndexOf('}')).split(';').filter((x) => x.includes('='))
    expect(claves.length).toBeGreaterThan(15)
    expect(claves.length).toBeLessThanOrEqual(20)
  })

  it('solo lee una tabla con las columnas exactas de «Pieza pieza Grader»', () => {
    expect(S).toContain("'Fecha', 'Hora', 'Peso de las piezas', 'Cantidad de piezas', 'Lote', 'Gate', 'Calidad', 'Conservacion', 'Calibre', 'Producto', 'Turno'")
    expect(S).toContain('otro-informe')
    expect(S).toContain('licencia-en-pantalla')
  })

  it('e1.3: trae solo la marca del código de alta (la PWA la reemplaza) y nunca una llave', () => {
    expect(S.match(/@@ALTA@@/g)?.length).toBe(1)
    expect(S).toContain("$ALTA = '@@ALTA@@'")
    expect(S).not.toMatch(/Bearer [A-Za-z0-9_-]{43}/)
    expect(S).not.toMatch(/\$ALTA = '[A-Za-z0-9_-]{43}'/)
    expect(S).not.toContain('-AsSecureString')
  })

  it('e1.3: canjea el código sin Authorization, guarda la llave cifrada y limpia el historial pase lo que pase', () => {
    expect(S).toContain('$cuerpo = ConvertTo-Json -InputObject @{ v = 1; alta = $ALTA; equipo = $equipo } -Compress')
    expect(S).toContain('[IO.File]::WriteAllText($archivoLlave, (ConvertFrom-SecureString $ss), $UTF8)')
    expect(S).toMatch(/\} finally \{\s+Limpia-Historial\s+\}/)
    expect(S).toContain("$_ -notlike ('*' + $ALTA + '*')")
  })

  it('envía solo a la función del espejo', () => {
    const urls = S.match(/https?:\/\/[^\s'"]+/g) ?? []
    expect(new Set(urls)).toEqual(new Set(['https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/espejoGraderIngesta']))
  })

  it('e1.3 (OK de Orel 21-11): una sola tarea de usuario, oculta y sin privilegios; nada en Run ni en Inicio', () => {
    expect(S).toContain('-WindowStyle Hidden')
    expect(S).toContain("$TAREA = 'Espejo del grader'")
    expect(S.match(/Register-ScheduledTask -TaskName \$TAREA /g)?.length).toBe(2) // con y sin «al iniciar sesión»
    expect(S.match(/Register-ScheduledTask/g)?.length).toBe(2)
    expect(S).toContain('-LogonType Interactive -RunLevel Limited')
    expect(S).toContain('-MultipleInstances IgnoreNew')
    expect(S).toContain('-ExecutionTimeLimit (New-TimeSpan -Minutes 3) -Hidden')
    expect(S).not.toMatch(/schtasks|RunLevel Highest|CurrentVersion\\Run|shell:startup|Startup\\/i)
    expect(S).toContain('DETENER')
    expect(S).toContain('Local\\EspejoGraderLector')
  })

  it('ninguna variable se escribe con otra mayúscula (PowerShell no las distingue: $tarea pisaba a $TAREA)', () => {
    const grupos = new Map<string, Set<string>>()
    for (const v of S.match(/\$[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      const k = v.toLowerCase()
      if (!grupos.has(k)) grupos.set(k, new Set())
      grupos.get(k)!.add(v)
    }
    const choques = [...grupos.values()].filter((g) => g.size > 1).map((g) => [...g].join('/'))
    expect(choques).toEqual([])
  })

  it('e1.3: la app lo detiene para siempre (REVOCADA → el vigilante borra la tarea)', () => {
    expect(S.match(/Marca-Revocada/g)!.length).toBeGreaterThanOrEqual(4)
    expect(S).toContain("Unregister-ScheduledTask -TaskName $TAREA -Confirm:$false -ErrorAction Stop; VLog 'REVOCADA")
  })

  it('e1.3: el vigilante solo mata al lector por su PID y si su línea de comandos es la del lector', () => {
    expect(S).toContain("if ($proc -and ([string]$proc.CommandLine) -like ('*' + $lector + '*')) {")
    expect(S.match(/Stop-Process/g)?.length).toBe(1)
    expect(S).not.toMatch(/Stop-Process -Name|taskkill|Get-Process powershell/i)
  })

  it('e1.3: la actualización se baja de la misma función, se verifica el sha256 y la pone el vigilante', () => {
    expect(S).toContain("Invoke-WebRequest -Uri ($url + '?lector=' + [uri]::EscapeDataString($v)) -Method Get")
    expect(S).toContain('if ((Sha256-Hex $b) -ne $sha) {')
    expect(S).toContain('if (-not $info -or (Sha256-Archivo $nuevo) -ne $sha) {')
    // El lector nunca ejecuta lo bajado: solo lo escribe; el vigilante lo pone y vuelve atrás si no completa un ciclo.
    expect(S).not.toMatch(/Invoke-Expression|\biex\b|\. \$archivoNuevo|& \$archivoNuevo/i)
    expect(S).toContain("$lat.tipo -eq 'ciclo'")
  })

  it('e1.3: la función sirve EXACTAMENTE el lector que trae el instalador', () => {
    const raiz = resolve(__dirname, '../../../../../..')
    const deLaFuncion = readFileSync(resolve(raiz, 'functions/espejo/lector-espejo.ps1'), 'utf8')
      .replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), '')
      .replace(/\r\n/g, '\n')
    const marca = "$lectorTexto = @'\n"
    const i0 = S.indexOf(marca) + marca.length
    const i1 = S.indexOf("\n'@\n", i0)
    expect(S.slice(i0, i1)).toBe(deLaFuncion)
  })

  it('conserva las barras invertidas de las expresiones regulares', () => {
    expect(S).toContain("'^\\d{4}-\\d{2}-\\d{2}$'")
    expect(S).toContain("'^\\d{2}:\\d{2}:\\d{2}$'")
  })
})
