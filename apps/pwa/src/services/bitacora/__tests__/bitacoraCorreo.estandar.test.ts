import { describe, expect, it } from 'vitest'
import { cuerpoBitacoraHtml, type DatosCorreoBitacora } from '../bitacoraCorreo'
import { C } from '../documentoCorreo'
import type { EventoBitacora, TurnoMantencion } from '../bitacora.types'

/**
 * El estándar del correo (`documentoCorreo`), medido sobre el CUERPO del correo de turno —del
 * encabezado hacia abajo. La planilla «Recolección MTTR» de arriba queda fuera a propósito: es
 * una copia del Excel y parecer una planilla es su trabajo.
 *
 * Son las mismas cinco pruebas que guardan el correo de la inspección: si alguien vuelve a
 * meter una caja de color, una reja o un quinto cuerpo, se cae acá.
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

const completo = () =>
  cuerpoBitacoraHtml(
    datos(
      [
        evento(),
        evento({ id: 'e2', impacto: 'en-ventana', ventana: 'cambio de producto', equipo: 'GRADER MS4', titulo: '' }),
        evento({ id: 'e3', impacto: 'afecta-sin-detener', contingencia: 'se opera a mano', pendiente: true, horaTermino: null, equipo: 'TOLVA RILES' }),
      ],
      { observacion: 'Turno tranquilo, queda la tolva a mano para la noche.', pendientesAnteriores: [evento({ id: 'e0', turnoId: '2026-09-20_noche', pendiente: true })] },
    ),
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

  it('cuatro cuerpos y nada intermedio', () => {
    const cuerpos = new Set([...completo().matchAll(/font-size:([\d.]+)px/g)].map((m) => m[1] ?? ''))
    expect([...cuerpos].sort()).toEqual(['10.5', '11', '14', '21'])
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

  it('le dice al teléfono que no infle la letra (iOS Mail)', () => {
    expect(completo()).toContain('-webkit-text-size-adjust:100%')
  })

  it('cabe en un teléfono: ningún ancho fijo pasa de 340 px y las cifras van de a tres', () => {
    const html = cuerpoBitacoraHtml(
      datos(
        [evento({ fotos: [{ url: 'https://x/a.jpg', path: 'p', etiqueta: 'antes', ancho: 1600, alto: 1200 }, { url: 'https://x/b.jpg', path: 'p', etiqueta: 'despues', ancho: 1600, alto: 1200 }] }),
         evento({ id: 'e2', impacto: 'en-ventana', ventana: 'colación' }),
         evento({ id: 'e3', impacto: 'afecta-sin-detener', contingencia: 'a mano', pendiente: true, horaTermino: null })],
      ),
    )
    // Word borra `vertical-align` del estilo al pegar: el atributo es lo que sobrevive.
    for (const m of html.matchAll(/<td width="(\d+)"[^>]*>/g)) expect(m[0]).toContain('valign="top"')
    const anchos = [...html.matchAll(/width="(\d+)"/g)].map((m) => Number(m[1]))
    expect(Math.max(...anchos)).toBeLessThanOrEqual(340)
    // 2 fotos × 156 + 8 + 28 del número = 348 < 351 (cuerpo del correo en un teléfono).
    expect(html).toContain('width="156"')
    // Seis cifras vivas (eventos, parada, MTTR, afectados, ventana, pendientes) → dos filas.
    expect((html.match(/<tr><td valign="top" style="padding:0 34px/g) ?? []).length).toBe(2)
    // La hora va a la derecha de la cabecera celeste del evento; la tabla del evento lleva el
    // marco, no las celdas (regla 3 del estándar: nada de rejas).
    expect(html).toMatch(/bgcolor="#BDD7EE"[^>]*><small>09:30 – 10:05<\/small><\/td><\/tr>/)
    expect(html).toContain('<small>Correctivo · N° de equipo 720004411</small>')
    // Dos bloques: la bitácora abre con su banda azul, la misma de la planilla.
    expect(html).toContain('bgcolor="#00557F"')
    expect(html).toContain('<font color="#FFFFFF"><b>Bitácora de Mantención</b>')
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
