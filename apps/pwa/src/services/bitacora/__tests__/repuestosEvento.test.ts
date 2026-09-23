import { describe, expect, it } from 'vitest'
import type { EventoBitacora } from '../bitacora.types'
import { turnoDesdeId } from '../turnoMantencion'
import { bitacoraAHtmlCorreo, bitacoraATextoPlano } from '../bitacoraCorreo'
import { SEPARADOR_EVENTOS, bitacoraATextoWhatsapp, planLaminas } from '../bitacoraWhatsapp'
import { aFormulario, camposACambiar, fusionarFormulario } from '../borradores'
import {
  clampCantidadRepuesto,
  codigoEquipoDe,
  encabezadoEvento,
  etiquetaCodigoEquipo,
  lineaRepuestos,
  lineasRepuestos,
  nombreRepuesto,
  normalizarRepuestos,
} from '../presentacionEvento'
import { buscarRepuestos, desdeDocumento, esCodigoSap, limpiarCodigo } from '../repuestosBitacora'

const turno = turnoDesdeId('2026-09-16_tarde')!

// El evento real de Mauricio Gallardo en la BAADER 142 N2 (los repuestos, de ejemplo).
const ev = (p: Partial<EventoBitacora> = {}): EventoBitacora => ({
  id: 'b142',
  plantId: 'chonchi',
  turnoId: '2026-09-16_tarde',
  fechaTurno: '2026-09-16',
  banda: 'tarde',
  tipo: 'falla',
  equipo: 'EVISCERADORA BAADER 142 N2',
  equipoId: 'kRbjM6jI0bD60l5ABNPD',
  equipoCodigo: '720004447',
  titulo: 'Reaprete pernos base expulsador',
  descripcion: 'Al realizar pruebas se observa expulsador sueltos ya que sus pernos le falta reaprete',
  horaInicio: '21:15',
  horaTermino: '21:30',
  impacto: 'no-aplica',
  minutosParada: null,
  ventana: null,
  pendiente: false,
  fotos: [],
  creadoPor: 'u1',
  autorNombre: 'mantencion.plantach',
  registradoPor: 'Mauricio Gallardo',
  repuestos: [
    { codigoSAP: '3300011612', nombre: 'SOPORTE SECCION 519437', cantidad: 1 },
    { codigoSAP: '3300011654', nombre: 'ANILLO 31000251', cantidad: 2 },
  ],
  ...p,
})
const datos = (eventos: EventoBitacora[]) => ({ turno, eventos, tecnicos: [], planta: 'Planta Chonchi' })

describe('número del equipo', () => {
  it('solo con un equipo elegido del buscador', () => {
    expect(codigoEquipoDe(ev())).toBe('720004447')
    expect(codigoEquipoDe(ev({ equipoId: null }))).toBe('')
    expect(encabezadoEvento(ev())).toBe('21:15 – 21:30 · EVISCERADORA BAADER 142 N2 (720004447) · Reaprete pernos base expulsador')
    expect(encabezadoEvento(ev({ equipoCodigo: null }))).toBe('21:15 – 21:30 · EVISCERADORA BAADER 142 N2 · Reaprete pernos base expulsador')
  })

  it('un número de equipo o una ubicación técnica', () => {
    expect(etiquetaCodigoEquipo('720004447')).toBe('N° de equipo 720004447')
    expect(etiquetaCodigoEquipo('AQ-IN-CHO-EXTE-CASI')).toBe('Ubicación técnica AQ-IN-CHO-EXTE-CASI')
    expect(etiquetaCodigoEquipo('  ')).toBe('')
  })
})

describe('cantidad de repuesto escribible', () => {
  it('entero entre 1 y 999; vacío, 0 o algo no numérico vuelve al respaldo (no borra el repuesto)', () => {
    expect(clampCantidadRepuesto('7', 1)).toBe(7)
    expect(clampCantidadRepuesto('7.6', 1)).toBe(8)
    expect(clampCantidadRepuesto('', 3)).toBe(3)
    expect(clampCantidadRepuesto('0', 3)).toBe(3)
    expect(clampCantidadRepuesto('-5', 3)).toBe(3)
    expect(clampCantidadRepuesto('abc', 3)).toBe(3)
    expect(clampCantidadRepuesto('5000', 3)).toBe(999)
  })
})

describe('repuestos usados', () => {
  it('sin repetir (el mismo código suma), con cantidad entre 1 y 999 y hasta 20', () => {
    expect(
      normalizarRepuestos([
        { codigoSAP: '3300011612', nombre: 'SOPORTE', cantidad: 1 },
        { codigoSAP: ' 3300011612 ', nombre: 'otro nombre', cantidad: 2 },
        { codigoSAP: 'a/b', nombre: 'x', cantidad: 1 },
        { codigoSAP: '3300011654', nombre: 'ANILLO', cantidad: 0 },
        { codigoSAP: '3300012355', nombre: 'PERNO', cantidad: 5000 },
      ]),
    ).toEqual([
      { codigoSAP: '3300011612', nombre: 'SOPORTE', cantidad: 3 },
      { codigoSAP: '3300011654', nombre: 'ANILLO', cantidad: 1 },
      { codigoSAP: '3300012355', nombre: 'PERNO', cantidad: 999 },
    ])
    const muchos = Array.from({ length: 25 }, (_, i) => ({ codigoSAP: String(3300000000 + i), nombre: '', cantidad: 1 }))
    expect(normalizarRepuestos(muchos)).toHaveLength(20)
    expect(normalizarRepuestos(null)).toEqual([])
  })

  it('la línea usa el nombre legible del maestro y marca la cantidad solo si es más de uno', () => {
    const linea = lineaRepuestos(ev())
    expect(linea.startsWith('Repuestos: 3300011612 ')).toBe(true)
    expect(linea).toContain(`3300011654 ${nombreRepuesto({ nombre: 'ANILLO 31000251' })} ×2`)
    expect(linea).not.toContain('SOPORTE SECCION')
    expect(lineaRepuestos(ev({ repuestos: [{ codigoSAP: '3300099999', nombre: '', cantidad: 1 }] }))).toBe('Repuestos: 3300099999')
    expect(lineaRepuestos(ev({ repuestos: [] }))).toBe('')
  })

  it('sale en el correo, el texto plano, WhatsApp y la clave de la lámina', () => {
    const html = bitacoraAHtmlCorreo(datos([ev()]))
    // Correo 17-09: equipo arriba, N° de equipo en la línea de abajo y repuestos en tabla.
    expect(html).toContain('>EVISCERADORA BAADER 142 N2</div>')
    // La hora abre la línea de datos del evento (ya no es una tercera celda: en el teléfono
    // se llevaba un cuarto del ancho).
    expect(html).toContain('21:15 – 21:30 · Falla · N° de equipo 720004447')
    expect(html).toContain('Repuestos usados</div><table')
    expect(html).toMatch(/>3300011612<\/td><td[^>]*>Soporte sección 519437<\/td><td[^>]*>1<\/td>/)
    expect(html).toMatch(/>3300011654<\/td><td[^>]*>Anillo 31000251<\/td><td[^>]*>2<\/td>/)
    const conComun = bitacoraAHtmlCorreo(datos([ev({ repuestos: [{ codigoSAP: '3300135877', nombre: 'FILTRO 1/2 PURGA', nombreComun: 'Filtro FRL', cantidad: 1 }] })]))
    expect(conComun).toMatch(/<b>Filtro FRL<\/b><br><span[^>]*>Filtro 1\/2 purga<\/span>/)
    expect(bitacoraATextoPlano(datos([ev()]))).toContain('  Repuestos usados:\n  • 3300011612 · ')
    const wa = bitacoraATextoWhatsapp(datos([ev()]))
    expect(wa).toContain('*1. EVISCERADORA BAADER 142 N2* · `21:15–21:30`\n*Reaprete pernos base expulsador*')
    expect(wa).toContain('N° de equipo `720004447`')
    // En WhatsApp: código en monoespaciado y el nombre del maestro (con el común delante si lo hay).
    expect(bitacoraATextoWhatsapp(datos([ev({ repuestos: [{ codigoSAP: '3300135877', nombre: 'FILTRO 1/2 PURGA', nombreComun: 'Filtro FRL', cantidad: 1 }] })]))).toContain(
      '- `3300135877` Filtro FRL (Filtro 1/2 purga) ×1',
    )
    expect(wa).toContain('Repuestos usados:\n- `3300011612` Soporte sección 519437 ×1\n- `3300011654` Anillo 31000251 ×2')
    expect(lineasRepuestos(ev({ repuestos: [] }))).toEqual([])
    // Dos eventos: divisoria con una línea en blanco a cada lado (formato A2).
    const dos = datos([ev(), ev({ id: 'otro', horaInicio: '22:00', horaTermino: '22:10', repuestos: [] })])
    expect(bitacoraATextoWhatsapp(dos)).toContain(`\n\n${SEPARADOR_EVENTOS}\n\n*2. EVISCERADORA BAADER 142 N2* · \`22:00–22:10\``)
    expect(bitacoraATextoWhatsapp(datos([ev()]))).not.toContain(SEPARADOR_EVENTOS)
    const conFoto = (p: Partial<EventoBitacora>) =>
      planLaminas(datos([ev({ fotos: [{ url: 'u', path: 'p', etiqueta: 'antes' }], ...p })]))[0]?.clave
    expect(conFoto({})).not.toBe(conFoto({ repuestos: [] }))
    expect(conFoto({})).not.toBe(conFoto({ equipoCodigo: '720004411' }))
  })

  it('el formulario los compara y los escribe aparte; el número va con el equipo', () => {
    const base = aFormulario(ev())
    expect(base.repuestos).toBe(JSON.stringify(normalizarRepuestos(ev().repuestos)))
    const otroOrden = aFormulario(ev({ repuestos: [...(ev().repuestos ?? [])] }))
    expect(otroOrden.repuestos).toBe(base.repuestos)
    const conMas = { ...base, repuestos: JSON.stringify([...JSON.parse(base.repuestos), { codigoSAP: '3300012355', nombre: 'PERNO', cantidad: 1 }]) }
    expect(camposACambiar(base, conMas, [], [])).toEqual(['repuestos'])
    expect(camposACambiar(base, { ...base, equipo: 'KNURO N1', equipoId: 'e5', equipoCodigo: '720004415' }, [], [])).toEqual([
      'equipo',
      'equipoId',
      'equipoCodigo',
    ])
    // Otro equipo cambió el equipo y yo los repuestos: se adopta su equipo CON su número.
    const remoto = { ...base, equipo: 'KNURO N1', equipoId: 'e5', equipoCodigo: '720004415' }
    const f = fusionarFormulario(base, conMas, remoto)
    expect(f.valores).toMatchObject({ equipo: 'KNURO N1', equipoId: 'e5', equipoCodigo: '720004415', repuestos: conMas.repuestos })
    expect(f.conflictos).toEqual([])
    // Un equipo escrito a mano no arrastra número.
    expect(aFormulario(ev({ equipoId: null })).equipoCodigo).toBe('')
  })
})

describe('buscar repuestos del equipo', () => {
  const lista = [
    { codigoSAP: '3300012355', nombre: 'PERNO 1420301019', nombreComun: '', ubicacion: 'C-1' },
    { codigoSAP: '3300011612', nombre: 'SOPORTE SECCION 519437', nombreComun: '', ubicacion: 'C-6' },
    { codigoSAP: '3300074757', nombre: 'TORNILLO PARA PERNO', nombreComun: '', ubicacion: 'C-8' },
    { codigoSAP: '3300005482', nombre: 'PRESOSTATO 10773', nombreComun: '', ubicacion: 'C-11' },
  ]

  it('por palabras, sin tildes, primero lo que empieza con lo escrito', () => {
    expect(buscarRepuestos(lista, 'pern').map((r) => r.codigoSAP)).toEqual(['3300012355', '3300074757'])
    expect(buscarRepuestos(lista, 'sección 5194').map((r) => r.codigoSAP)).toEqual(['3300011612'])
    expect(buscarRepuestos(lista, '33000054').map((r) => r.codigoSAP)).toEqual(['3300005482'])
    expect(buscarRepuestos(lista, 'p')).toEqual([])
  })

  it('código SAP: solo dígitos; un material sin código no se ofrece', () => {
    expect(limpiarCodigo(' 3300 0116 12 ')).toBe('3300011612')
    expect(esCodigoSap('3300011612')).toBe(true)
    expect(esCodigoSap('ABC123')).toBe(false)
    expect(esCodigoSap('12345')).toBe(false)
    expect(desdeDocumento('x', { codigoSAP: null, textoBreve: 'MOTOR SEW' })).toBeNull()
    expect(desdeDocumento('3300011612', { codigoSAP: '3300011612', textoBreve: 'SOPORTE', ubicacionEnPlanta: 'C-6' })).toEqual({
      codigoSAP: '3300011612',
      nombre: 'SOPORTE',
      nombreComun: '',
      ubicacion: 'C-6',
    })
  })
})
