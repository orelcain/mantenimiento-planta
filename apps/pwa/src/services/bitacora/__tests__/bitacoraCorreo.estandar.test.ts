import { describe, expect, it } from 'vitest'
import { bitacoraAHtmlCorreo, cuerpoBitacoraHtml, type DatosCorreoBitacora } from '../bitacoraCorreo'
import { C, escaparHtml } from '../documentoCorreo'
import { explicacionMtbfMttr } from '../mtbf'
import { resumirBitacora } from '../resumenBitacora'
import type { EventoBitacora, TurnoMantencion } from '../bitacora.types'

/**
 * El estándar del correo (`documentoCorreo`), medido sobre el CUERPO del correo de turno —del
 * encabezado hacia abajo—. Desde el mockup «Correo» (10-11-2026) la escala del turno es 22 / 15 /
 * 13 px, con cifras en monoespaciada. La planilla «MTBF - MTTR» va al final, fuera del cuerpo: es
 * una copia del Excel y parecer una planilla es su trabajo.
 */
const turno: TurnoMantencion = {
  id: '2026-09-21_dia',
  fecha: '2026-09-21',
  banda: 'dia',
  inicio: new Date('2026-09-21T08:00:00'),
  fin: new Date('2026-09-21T16:00:00'),
}

const evento = (p: Partial<EventoBitacora> = {}): EventoBitacora =>
  ({
    id: 'e1',
    plantId: 'chonchi',
    turnoId: turno.id,
    fechaTurno: turno.fecha,
    banda: 'dia',
    tipo: 'correctivo',
    equipo: 'DESPLAZADOR AUTOMATICO 1',
    equipoCodigo: '720004411',
    equipoId: 'n1',
    titulo: 'Cable suelto',
    descripcion: 'Cable de control suelto en la botonera, se reapreta y se prueba.',
    horaInicio: '09:30',
    horaTermino: '10:05',
    impacto: 'con-parada',
    minutosParada: 35,
    ventana: null,
    pendiente: false,
    fotos: [],
    creadoPor: 'u1',
    autorNombre: 'Danilo Cortes',
    registradoPor: 'Danilo Cortes',
    ...p,
  }) as EventoBitacora

const datos = (eventos: EventoBitacora[], extra: Partial<DatosCorreoBitacora> = {}): DatosCorreoBitacora => ({
  turno,
  eventos,
  tecnicos: ['Danilo Cortes', 'Jose Chodil'],
  planta: 'Planta Chonchi',
  ...extra,
})

const tresEventos = () => [
  evento(),
  evento({ id: 'e2', impacto: 'en-ventana', ventana: 'cambio de producto', equipo: 'GRADER MS4', titulo: '' }),
  evento({ id: 'e3', impacto: 'afecta-sin-detener', contingencia: 'se opera a mano', pendiente: true, horaTermino: null, equipo: 'TOLVA RILES' }),
]

const completo = () =>
  cuerpoBitacoraHtml(
    datos(tresEventos(), {
      observacion: 'Turno tranquilo, queda la tolva a mano para la noche.',
      pendientesAnteriores: [evento({ id: 'e0', turnoId: '2026-09-20_noche', pendiente: true })],
    }),
  )

describe('el correo de turno sigue el estándar del correo', () => {
  it('ninguna caja de color: ni fondos ni barras a la izquierda', () => {
    const html = completo()
    expect(html).not.toContain('border-left')
    expect(html).not.toContain('border-radius')
    for (const fondo of [C.okFondo, C.pendFondo, C.critFondo, C.neutroFondo, C.citaFondo]) expect(html).not.toContain(`background:${fondo}`)
  })

  it('ningún filete vertical: las tablas no son rejas', () => {
    expect(completo()).not.toMatch(/<t[dh][^>]*border:1px solid/)
  })

  it('tres cuerpos y nada intermedio: 22, 15 y 13 px', () => {
    const cuerpos = new Set([...completo().matchAll(/font-size:([\d.]+)px/g)].map((m) => m[1] ?? ''))
    expect([...cuerpos].sort()).toEqual(['13', '15', '22'])
  })

  it('el color solo aparece donde codifica un estado', () => {
    const conColor = [...completo().matchAll(/color:(#[0-9A-Fa-f]{6})/g)].map((m) => (m[1] ?? '').toUpperCase())
    const permitidos = [C.ventana, C.parada, C.afectado, C.pendBorde, C.tinta, C.sec].map((c) => c.toUpperCase())
    expect(conColor.every((c) => permitidos.includes(c))).toBe(true)
  })

  it('el impacto es punto y palabra, no pastillas', () => {
    const html = completo()
    expect(html).toContain('Detuvo la máquina')
    expect(html).toContain('Afectó sin detener')
    expect(html).toContain('●')
    expect(html).not.toContain('display:inline-block')
  })

  it('no usa <small>: el navegador lo achica y un texto de 13 px quedaba en 10,8', () => {
    expect(bitacoraAHtmlCorreo(datos(tresEventos()))).not.toContain('<small>')
  })

  it('le dice al teléfono que no infle la letra (iOS Mail)', () => {
    expect(completo()).toContain('-webkit-text-size-adjust:100%')
  })

  it('cabe en un teléfono: ningún ancho fijo pasa de 340 px y las cifras van de a tres', () => {
    const html = cuerpoBitacoraHtml(
      datos([
        evento({ fotos: [{ url: 'https://x/a.jpg', path: 'p', etiqueta: 'antes', ancho: 1600, alto: 1200 }, { url: 'https://x/b.jpg', path: 'p', etiqueta: 'despues', ancho: 1600, alto: 1200 }] }),
        evento({ id: 'e2', impacto: 'en-ventana', ventana: 'colación' }),
        evento({ id: 'e3', impacto: 'afecta-sin-detener', contingencia: 'a mano', pendiente: true, horaTermino: null }),
      ]),
    )
    // Word borra `vertical-align` del estilo al pegar: el atributo es lo que sobrevive.
    for (const m of html.matchAll(/<td width="(\d+)"[^>]*>/g)) expect(m[0]).toContain('valign="top"')
    const anchos = [...html.matchAll(/width="(\d+)"/g)].map((m) => Number(m[1]))
    expect(Math.max(...anchos)).toBeLessThanOrEqual(340)
    // 2 fotos × 156 + 8 + 28 del número = 348 < 351 (cuerpo del correo en un teléfono).
    expect(html).toContain('width="156"')
    // Seis cifras vivas (eventos, parada, MTTR, afectados, ventana, pendientes) → dos filas de tres.
    expect((html.match(/<tr><td valign="top" style="padding:10px 24px 10px 0/g) ?? []).length).toBe(2)
    // Cada trabajo es una fila con filete arriba (no una caja): la hora va en su línea de datos.
    expect(html).toContain('border-top:1px solid #E3E3E3')
    expect(html).toContain('Correctivo · 09:30 – 10:05')
    expect(html).toContain('>720004411</span>')
    // Ya no hay banda azul del encabezado: el encabezado es texto de 13 px y el título de 22 px.
    expect(html).not.toContain('bgcolor="#00557F"')
    expect(html).toContain('Bitácora de Mantención · Planta Chonchi')
  })

  it('termina donde termina la entrega: sin pie de «generado con»', () => {
    expect(completo()).not.toContain('Generado con la app')
  })

  it('un cero no es noticia, salvo los pendientes al entregar', () => {
    const html = cuerpoBitacoraHtml(datos([evento()]))
    expect(html).not.toContain('sin detener producción')
    expect(html).toContain('pendientes')
  })
})

describe('el correo de turno en PC: título con el dato y planilla al final', () => {
  it('el título de 22 px dice el turno, la fecha y el dato del turno', () => {
    const html = bitacoraAHtmlCorreo(datos(tresEventos()))
    // El fixture es el turno del lunes 21-09-2026.
    expect(html).toContain('Turno día del lunes 21-09-2026: 3 trabajos; 1 detuvo la máquina 35 min')
    expect(html).toContain('font-size:22px')
  })

  it('la planilla MTBF · MTTR va después de los trabajos, a 13 px, con el cálculo del MTBF', () => {
    const html = bitacoraAHtmlCorreo(datos(tresEventos()))
    expect(html.indexOf('TRABAJOS DEL TURNO')).toBeGreaterThan(-1)
    expect(html.indexOf('MTBF - MTTR')).toBeGreaterThan(html.indexOf('TRABAJOS DEL TURNO'))
    expect(html).not.toContain('font-size:9pt')
    // La explicación del cálculo se conserva tal cual la da `explicacionMtbfMttr`.
    const r = resumirBitacora(tresEventos())
    expect(html).toContain(escaparHtml(explicacionMtbfMttr(turno, r)))
  })
})
