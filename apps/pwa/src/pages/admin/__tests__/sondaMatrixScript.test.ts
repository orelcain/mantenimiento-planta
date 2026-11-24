/**
 * La sonda que se copia debe llegar INTACTA y seguir siendo de SOLO LECTURA:
 * un escape mal hecho en el template literal pierde barras invertidas o
 * acentos graves sin dar error, y una llamada que pulse o escriba en Matrix
 * rompería la promesa que la página le hace al admin.
 */
import { describe, it, expect } from 'vitest'
import { SONDA_MATRIX_PS1 } from '../sondaMatrixScript'

describe('SONDA_MATRIX_PS1', () => {
  it('empieza con el encabezado de la sonda de solo lectura', () => {
    expect(SONDA_MATRIX_PS1.startsWith('# Sonda de controles de Matrix (Marelec). SOLO LECTURA')).toBe(true)
  })

  it('va en un solo bloque para que al pegarla corra de una vez', () => {
    const codigo = SONDA_MATRIX_PS1.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'))
    expect(codigo[0]?.startsWith('& {')).toBe(true)
    expect(codigo[codigo.length - 1]).toBe('}')
  })

  it('conserva las barras invertidas de las expresiones regulares', () => {
    expect(SONDA_MATRIX_PS1).toContain("-replace '\\s+', ' '")
    expect(SONDA_MATRIX_PS1).toContain("'^ControlType\\.'")
  })

  it('conserva los acentos graves con que PowerShell escapa las comillas', () => {
    expect(SONDA_MATRIX_PS1).toContain('ventana `"{0}`"')
  })

  it('conserva los $ de PowerShell y las llaves de formato sin tocar', () => {
    expect(SONDA_MATRIX_PS1).toContain('function T([string]$s)')
    expect(SONDA_MATRIX_PS1).toContain('"$($_.Key)=$($_.Value)"')
    expect(SONDA_MATRIX_PS1).toContain('clase={3} {{{4}}}{5}')
  })

  it('nombra el archivo que el admin debe buscar en el Escritorio', () => {
    expect(SONDA_MATRIX_PS1).toContain("'sonda-matrix-{0:HHmmss}.txt'")
  })

  it('es de solo lectura: no pulsa, no escribe ni mueve el foco en Matrix', () => {
    expect(SONDA_MATRIX_PS1).not.toMatch(
      /\.Invoke\(\)|\.SetValue\(|\.Toggle\(\)|\.Select\(\)|\.Expand\(\)|\.Collapse\(\)|\.Close\(\)|\.SetFocus\(\)|SendKeys|SendInput|mouse_event|keybd_event|clip\.exe/,
    )
  })

  it('solo escribe fuera de su archivo una vez: el resumen en el portapapeles', () => {
    expect(SONDA_MATRIX_PS1.match(/Set-Clipboard/g)?.length).toBe(1)
    expect(SONDA_MATRIX_PS1).toContain('Set-Clipboard -Value ($res8 -join "`r`n")')
  })

  it('sección 7: mira los archivos del lector sin red, sin abrir la llave y sin escribir en su carpeta', () => {
    const s7 = SONDA_MATRIX_PS1.slice(SONDA_MATRIX_PS1.indexOf("T '7. LECTOR"), SONDA_MATRIX_PS1.indexOf("T '8. RESUMEN"))
    expect(s7.length).toBeGreaterThan(1000)
    for (const nom of ["'latido.txt'", "'lector.pid'", "'lector.log'", "'estado.json'", "'nuevo.json'", "'RECARGA', 'PERIODO', 'DETENER', 'REVOCADA'"]) {
      expect(s7).toContain(nom)
    }
    // La llave solo se mira si existe: nunca se lee ni se descifra.
    expect(s7).toContain("Test-Path -LiteralPath (Lec-Archivo 'llave.dat')")
    expect(s7).not.toMatch(/Get-Content[^\n]*llave|ReadAllText[^\n]*llave|ConvertTo-SecureString|Unprotect|Invoke-WebRequest|Invoke-RestMethod|Net\.WebClient/)
    expect(s7).not.toMatch(/Set-Content|Out-File|Remove-Item|New-Item|WriteAll|Move-Item|Stop-Process/)
  })

  it('sección 8: resumen corto con periodo, lector, pantalla, última lectura y órdenes', () => {
    expect(SONDA_MATRIX_PS1).toContain("T '8. RESUMEN")
    for (const k of ["'Periodo: '", "'Opciones: '", "'Pantalla: '", "'Última lectura: '", "'Órdenes: '"]) {
      expect(SONDA_MATRIX_PS1).toContain(k)
    }
  })

  it('no despliega ni elige opciones de los combos para leerlas', () => {
    expect(SONDA_MATRIX_PS1).not.toMatch(
      /\.AddToSelection\(|\.RemoveFromSelection\(|\.ScrollIntoView\(|\.Realize\(|FindItemByProperty|\.Scroll\(|\.SetScrollPercent\(|Set-ItemProperty|New-ItemProperty|Remove-ItemProperty/,
    )
  })

  it('lista los combos de la ventana con su valor, su estado y sus opciones', () => {
    expect(SONDA_MATRIX_PS1).toContain("T '5. COMBOS DE LA VENTANA")
    expect(SONDA_MATRIX_PS1).toContain('[System.Windows.Automation.TreeWalker]::RawViewWalker')
    expect(SONDA_MATRIX_PS1).toContain('.Current.ExpandCollapseState')
    expect(SONDA_MATRIX_PS1).toContain("T '6. VEREDICTO'")
  })

  it('distingue los cuatro casos del periodo y pide foto si las opciones no se ven', () => {
    for (const caso of ["'relativo'", "'sin-relativo'", "'sin-opciones'", "'sin-periodo'", "'ninguno'"]) {
      expect(SONDA_MATRIX_PS1).toContain(caso)
    }
    expect(SONDA_MATRIX_PS1).toContain('Eso NO significa que no haya periodo relativo')
    expect(SONDA_MATRIX_PS1).toContain('saca una foto del combo de periodo desplegado')
  })

  it('sección 5b: busca el selector de informes y dice si se podría pasar a «Puerta 0» sin mouse', () => {
    const s5b = SONDA_MATRIX_PS1.slice(SONDA_MATRIX_PS1.indexOf("T '5b. SELECTOR DE INFORMES"), SONDA_MATRIX_PS1.indexOf("T '6. VEREDICTO'"))
    expect(s5b.length).toBeGreaterThan(2000)
    // Reconoce los informes de Matrix por nombre, con «Puerta 0» como objetivo.
    expect(SONDA_MATRIX_PS1).toContain('puerta\\s*0')
    expect(SONDA_MATRIX_PS1).toContain('pieza\\s*(a\\s*)?pieza')
    // Tabla medida en Qt 5.15: pestaña y botón sí, menú con pantalla, lista a probar, árbol y combo no.
    for (const via of ["@('si', 'pestaña", "@('si-menu'", "@('si', 'botón", "@('quizas'", "@('no', 'ítem de árbol", "@('no', 'opción de combo"]) {
      expect(s5b).toContain(via)
    }
    // Los ítems del menú solo existen con el menú abierto: pide foto, no lo abre.
    expect(s5b).toContain("$st.sel = 'menu-cerrado'")
    // Solo lee patrones y estado; nunca los usa.
    expect(s5b).toContain('.GetSupportedPatterns()')
    expect(s5b).not.toMatch(/\.Invoke\(\)|\.Select\(\)|\.Expand\(\)|DoDefaultAction|SetFocus|PostMessage|SendMessage/)
    // Mantiene el filtro de licencia al juntar ítems.
    expect(s5b).toContain("$nm -notmatch '(?i)licen|hardware'")
  })

  it('veredicto y resumen dicen qué pasa con el selector de informes', () => {
    for (const caso of ["'si'", "'si-menu'", "'quizas'", "'no'", "'menu-cerrado'"]) {
      expect(SONDA_MATRIX_PS1).toContain(`  ${caso} { F ("Informes: `)
    }
    expect(SONDA_MATRIX_PS1).toContain("  'ninguno' { F 'Informes: sin dato")
    expect(SONDA_MATRIX_PS1).toContain("$res8.Add('Selector de informes: '")
    // Los combos de Qt (y su lista interna) no cuentan como lista elegible.
    expect(SONDA_MATRIX_PS1).toContain("$c.ClassName -notmatch 'QComboBox'")
  })

  it('del registro de Marelec solo muestra ReportPeriod', () => {
    expect(SONDA_MATRIX_PS1).toContain("'HKCU:\\Software\\Marelec\\MATRIX CG'")
    expect(SONDA_MATRIX_PS1).toContain("$_.Name -match '^ReportPeriod'")
  })
})
