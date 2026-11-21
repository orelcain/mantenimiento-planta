/**
 * El instalador del lector del espejo queda corriendo en el PC de Matrix: debe
 * llegar INTACTO, accionar SOLO los controles autorizados por Orel (las 2 fechas
 * del rango, la casilla «Limitar» para desmarcarla y «Actualizar») y no llevar
 * ninguna llave dentro del texto que se pega.
 */
import { describe, it, expect } from 'vitest'
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

  it('es la versión e1.2 y avisa el resultado del rango en el latido', () => {
    expect(S).toContain("version = 'e1.2'; ajuste = [string]$script:ajuste;")
    expect(S).not.toContain("'e1.1'")
  })

  it('solo lee una tabla con las columnas exactas de «Pieza pieza Grader»', () => {
    expect(S).toContain("'Fecha', 'Hora', 'Peso de las piezas', 'Cantidad de piezas', 'Lote', 'Gate', 'Calidad', 'Conservacion', 'Calibre', 'Producto', 'Turno'")
    expect(S).toContain('otro-informe')
    expect(S).toContain('licencia-en-pantalla')
  })

  it('la llave se pide oculta, se guarda cifrada y nunca viaja en el texto pegado', () => {
    expect(S).toContain('-AsSecureString')
    expect(S).toContain('ConvertFrom-SecureString')
    expect(S).not.toMatch(/Bearer [A-Za-z0-9_-]{43}/)
  })

  it('envía solo a la función del espejo', () => {
    const urls = S.match(/https?:\/\/[^\s'"]+/g) ?? []
    expect(new Set(urls)).toEqual(new Set(['https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/espejoGraderIngesta']))
  })

  it('arranca oculto, sin tarea programada ni inicio automático, y se puede detener', () => {
    expect(S).toContain('-WindowStyle Hidden')
    expect(S).not.toMatch(/schtasks|Register-ScheduledTask|CurrentVersion\\Run|shell:startup/i)
    expect(S).toContain('DETENER')
    expect(S).toContain('Local\\EspejoGraderLector')
  })

  it('conserva las barras invertidas de las expresiones regulares', () => {
    expect(S).toContain("'^\\d{4}-\\d{2}-\\d{2}$'")
    expect(S).toContain("'^\\d{2}:\\d{2}:\\d{2}$'")
  })
})
