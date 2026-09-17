import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { EventoBitacora } from '../bitacora.types'
import {
  formatoMinutos,
  horaSugeridaParaEvento,
  minutosEntre,
  turnoAdyacente,
  turnoDesdeId,
  turnoMantencionEn,
  turnosElegibles,
  horaCalzaEnTurno,
} from '../turnoMantencion'
import { fuePendiente, minutosParadaDe, ordenarEventos, resumirBitacora } from '../resumenBitacora'
import { minutosDesdeInicioTurno } from '../turnoMantencion'
import { bandaDeCelda, nombreCorto, normalizarFechaCalendario, tecnicosDelCalendario, tecnicosDeTurno } from '../tecnicosDeTurno'
import { bitacoraAHtmlCorreo, bitacoraATextoPlano, escaparHtml } from '../bitacoraCorreo'

// Las etiquetas cortas muestran el año solo si no es el actual: el reloj de
// estas pruebas queda en 2026 para que no cambien al pasar de año.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-17T12:00:00') })
})
afterAll(() => {
  vi.useRealTimers()
})


const ev = (p: Partial<EventoBitacora>): EventoBitacora => ({
  id: p.id ?? 'e1',
  plantId: 'chonchi',
  turnoId: '2026-09-15_tarde',
  fechaTurno: '2026-09-15',
  banda: 'tarde',
  tipo: 'falla',
  equipo: 'BAADER 142',
  descripcion: 'Detención por E777.',
  horaInicio: '16:20',
  horaTermino: '16:55',
  impacto: 'no-aplica',
  minutosParada: null,
  ventana: null,
  pendiente: false,
  fotos: [],
  creadoPor: 'u1',
  autorNombre: 'Danilo',
  ...p,
})

describe('la bitácora archivada no cambia sola (revisión 15-09)', () => {
  const cierre = { tipo: 'resuelto' as const, turnoId: '2026-09-16_noche', porNombre: 'Lucas Adrade', eventoId: 'e9', motivo: null }

  it('un pendiente que otro turno cerró sigue contando como pendiente de SU turno', () => {
    const r = resumirBitacora([
      ev({ id: 'a', pendiente: true }),
      ev({ id: 'b', pendiente: false, cierre }),
      ev({ id: 'c' }),
    ])
    expect(r.pendientes).toBe(1)
    expect(r.pendientesDelTurno).toBe(2)
    expect(r.pendientesResueltosDespues).toBe(1)
    expect(fuePendiente({ pendiente: false, cierre })).toBe(true)
  })

  it('el correo lo deja en el bloque de pendientes y dice quién lo resolvió', () => {
    const html = bitacoraAHtmlCorreo({
      turno: turnoDesdeId('2026-09-15_tarde')!,
      eventos: [ev({ id: 'b', equipo: 'KNURO N1', pendiente: false, cierre })],
      tecnicos: [],
      planta: 'Planta Chonchi',
    })
    expect(html).toContain('Pendiente para el turno siguiente')
    expect(html).toContain('Resuelto en Turno noche 16-09 por Lucas Adrade')
    expect(html).toContain('pendiente (1 ya cerrado)')
  })

  it('dos eventos que resuelven el MISMO pendiente cuentan como uno cerrado', () => {
    const origen = { id: 'p1', turnoId: '2026-09-14_noche', equipo: 'KNURO N1', descripcion: 'x', registradoPor: 'Danilo' }
    const r = resumirBitacora([
      ev({ id: 'a', resuelvePendiente: origen }),
      ev({ id: 'b', resuelvePendiente: origen }),
      ev({ id: 'c', resuelvePendiente: { ...origen, id: 'p2' } }),
    ])
    expect(r.pendientesCerrados).toBe(2)
  })
})

describe('orden dentro del turno', () => {
  it('el corte queda a 16 h del inicio, lejos de cualquier hora real', () => {
    // Turno tarde (16:00): el fin del turno (00:00) y el inicio son las horas
    // plausibles; el salto del orden cae a las 08:00, a 8 h de las dos.
    const tarde = { banda: 'tarde' as const }
    expect(minutosDesdeInicioTurno(tarde, '16:00')).toBe(0)
    expect(minutosDesdeInicioTurno(tarde, '23:59')).toBe(479)
    expect(minutosDesdeInicioTurno(tarde, '15:50')).toBe(-10)
    // 07:59 todavía se ordena al final; 08:01 ya cuenta como "antes del turno".
    expect(minutosDesdeInicioTurno(tarde, '07:59')).toBeGreaterThan(0)
    expect(minutosDesdeInicioTurno(tarde, '08:01')).toBeLessThan(0)
  })
})

describe('turno de Mantención por reloj', () => {
  it('asigna la banda por la hora', () => {
    expect(turnoMantencionEn(new Date(2026, 8, 15, 7, 59)).id).toBe('2026-09-15_noche')
    expect(turnoMantencionEn(new Date(2026, 8, 15, 8, 0)).id).toBe('2026-09-15_dia')
    expect(turnoMantencionEn(new Date(2026, 8, 15, 15, 59)).id).toBe('2026-09-15_dia')
    expect(turnoMantencionEn(new Date(2026, 8, 15, 16, 0)).id).toBe('2026-09-15_tarde')
    expect(turnoMantencionEn(new Date(2026, 8, 15, 23, 59)).id).toBe('2026-09-15_tarde')
  })

  it('la tarde termina a las 00:00 del día siguiente', () => {
    const t = turnoMantencionEn(new Date(2026, 8, 15, 22, 34))
    expect(t.fin.getDate()).toBe(16)
    expect(t.fin.getHours()).toBe(0)
  })

  it('pasada la medianoche ya es la noche del día nuevo, no la tarde anterior', () => {
    expect(turnoMantencionEn(new Date(2026, 8, 16, 0, 5)).id).toBe('2026-09-16_noche')
  })

  it('recorre turnos adyacentes cruzando días y meses', () => {
    const tarde = turnoDesdeId('2026-09-30_tarde')!
    expect(turnoAdyacente(tarde, 1).id).toBe('2026-10-01_noche')
    expect(turnoAdyacente(turnoDesdeId('2026-10-01_noche')!, -1).id).toBe('2026-09-30_tarde')
    expect(turnoAdyacente(turnoDesdeId('2026-09-15_dia')!, 1).id).toBe('2026-09-15_tarde')
  })

  it('rechaza ids mal formados o fechas imposibles', () => {
    expect(turnoDesdeId('2026-02-31_dia')).toBeNull()
    expect(turnoDesdeId('2026-09-15_madrugada')).toBeNull()
    expect(turnoDesdeId(undefined)).toBeNull()
  })

  it('sugiere la hora actual solo si el turno está corriendo', () => {
    const t = turnoDesdeId('2026-09-15_tarde')!
    expect(horaSugeridaParaEvento(t, new Date(2026, 8, 15, 22, 34))).toBe('22:34')
    expect(horaSugeridaParaEvento(t, new Date(2026, 8, 16, 9, 0))).toBe('16:00')
  })

  it('mide duraciones que cruzan la medianoche', () => {
    expect(minutosEntre('16:20', '16:55')).toBe(35)
    expect(minutosEntre('23:40', '00:20')).toBe(40)
    expect(minutosEntre('16:20', null)).toBeNull()
  })

  it('formatea minutos', () => {
    expect(formatoMinutos(35)).toBe('35 min')
    expect(formatoMinutos(65)).toBe('1 h 05 min')
    expect(formatoMinutos(120)).toBe('2 h')
    expect(formatoMinutos(null)).toBe('—')
  })
})

describe('resumen del turno', () => {
  const eventos = [
    ev({ id: 'a', impacto: 'con-parada', minutosParada: 40 }),
    ev({ id: 'b', equipo: 'baader  142 ', impacto: 'con-parada', minutosParada: null, horaInicio: '18:00', horaTermino: '18:20' }),
    ev({ id: 'c', equipo: 'Grader MS4/12', tipo: 'ajuste', impacto: 'en-ventana', ventana: 'Colación HG' }),
    ev({ id: 'd', equipo: 'Enzunchadora TP-6000', tipo: 'novedad', pendiente: true, horaTermino: null }),
  ]

  it('la parada usa lo declarado y, si falta, la duración', () => {
    expect(minutosParadaDe(eventos[0]!)).toBe(40)
    expect(minutosParadaDe(eventos[1]!)).toBe(20)
    expect(minutosParadaDe(eventos[2]!)).toBeNull()
  })

  it('calcula parada, MTTR, ventanas, pendientes y equipos distintos', () => {
    const r = resumirBitacora(eventos)
    expect(r.eventos).toBe(4)
    expect(r.conParada).toBe(2)
    expect(r.minutosParada).toBe(60)
    expect(r.mttrMin).toBe(30)
    expect(r.enVentana).toBe(1)
    expect(r.pendientes).toBe(1)
    expect(r.equipos).toBe(3) // "BAADER 142" y "baader  142 " son el mismo
    expect(r.porTipo.falla).toBe(2)
  })

  it('sin paradas el MTTR queda vacío, no en cero', () => {
    expect(resumirBitacora([ev({})]).mttrMin).toBeNull()
  })

  it('ordena la tarde con lo que cruza 00:00 al final', () => {
    const t = turnoDesdeId('2026-09-15_tarde')!
    const orden = ordenarEventos(t, [ev({ id: 'x', horaInicio: '00:10' }), ev({ id: 'y', horaInicio: '16:05' }), ev({ id: 'z', horaInicio: '21:00' })])
    expect(orden.map((e) => e.id)).toEqual(['y', 'z', 'x'])
  })
})

describe('técnicos de turno desde el calendario', () => {
  // Forma real del doc `calendario_mantencion_state/current` (leída el 15-09-2026).
  const cal = {
    dayCols: [{ c: 22, dateRaw: '15/09/2026' }, { c: 23, dateRaw: '16/09/2026' }],
    techRows: [
      { name: 'CHODIL MACIAS, JOSE LUIS', shifts: { '22': '08:00 - 16:00' } },
      { name: 'LUCAS EDUARDO ADRADE MANSILLA', shifts: { '22': 'LIBRE' } },
      { name: 'IGOR NAIMAN, LEANDRO JESUS', shifts: { '22': '00:00 - 08:00' } },
      { name: 'CORTES BARRIA, DANILO FELIPE', shifts: { '22': '16:00 - 00:00' } },
      { name: 'SERPA ALVAREZ, MATIAS IGNACIO', shifts: { '22': '19:00 - 00:00' } },
    ],
  }

  it('normaliza fechas y bandas de celda', () => {
    expect(normalizarFechaCalendario('5/9/2026')).toBe('2026-09-05')
    expect(bandaDeCelda('19:00 - 00:00')).toBe('tarde')
    expect(bandaDeCelda('00:00 - 05:00')).toBe('noche')
    expect(bandaDeCelda('LIBRE')).toBeNull()
  })

  it('arma nombres cortos con y sin coma', () => {
    expect(nombreCorto('CORTES BARRIA, DANILO FELIPE')).toBe('Danilo Cortes')
    expect(nombreCorto('LUCAS EDUARDO ADRADE MANSILLA')).toBe('Lucas Adrade')
    expect(nombreCorto('ERNESTO DIAZ')).toBe('Ernesto Diaz')
  })

  it('lista a TODOS los técnicos del calendario, sin repetidos y en orden de planilla', () => {
    const conRepetido = { ...cal, techRows: [...cal.techRows, { name: 'CORTES BARRIA, DANILO FELIPE', shifts: {} }, { name: '  ', shifts: {} }] }
    expect(tecnicosDelCalendario(conRepetido)).toEqual(['Jose Chodil', 'Lucas Adrade', 'Leandro Igor', 'Danilo Cortes', 'Matias Serpa'])
    expect(tecnicosDelCalendario(null)).toEqual([])
  })

  it('lista a quienes tienen esa banda ese día, incluido el turno reducido', () => {
    expect(tecnicosDeTurno(cal, { fecha: '2026-09-15', banda: 'tarde' })).toEqual(['Danilo Cortes', 'Matias Serpa'])
    expect(tecnicosDeTurno(cal, { fecha: '2026-09-15', banda: 'noche' })).toEqual(['Leandro Igor'])
    expect(tecnicosDeTurno(cal, { fecha: '2026-12-31', banda: 'dia' })).toEqual([])
  })
})

describe('correo de la bitácora', () => {
  const turno = turnoDesdeId('2026-09-15_tarde')!
  const base = {
    turno,
    tecnicos: ['Danilo Cortes'],
    planta: 'Planta Chonchi',
  }

  it('escapa el texto del técnico', () => {
    expect(escaparHtml('<b>"x" & y</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;')
    const html = bitacoraAHtmlCorreo({ ...base, eventos: [ev({ descripcion: '<script>alert(1)</script>' })] })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('las fotos llevan width y height como atributos, con proporción real', () => {
    const html = bitacoraAHtmlCorreo({
      ...base,
      eventos: [ev({ fotos: [{ url: 'https://x/a.jpg', path: 'p', etiqueta: 'despues', ancho: 1600, alto: 1200 }, { url: 'https://x/b.jpg', path: 'p', etiqueta: 'antes', ancho: 1200, alto: 1600 }] })],
    })
    expect(html).toContain('width="260" height="195"')
    expect(html).toContain('width="260" height="347"')
    // "Antes" sale primero aunque se haya cargado después.
    expect(html.indexOf('b.jpg')).toBeLessThan(html.indexOf('a.jpg'))
  })

  it('permite reemplazar la fuente de las fotos (data URI para Outlook nuevo)', () => {
    const html = bitacoraAHtmlCorreo({
      ...base,
      eventos: [ev({ fotos: [{ url: 'https://x/a.jpg', path: 'p', etiqueta: 'foto' }] })],
      fuenteFoto: () => 'data:image/jpeg;base64,AAAA',
    })
    expect(html).toContain('src="data:image/jpeg;base64,AAAA"')
    expect(html).not.toContain('https://x/a.jpg')
  })

  it('separa los pendientes al final y muestra parada y ventana', () => {
    const eventos = [
      ev({ id: 'p', equipo: 'Enzunchadora TP-6000', pendiente: true, horaInicio: '22:30', horaTermino: null }),
      ev({ id: 'a', impacto: 'con-parada', minutosParada: 35 }),
      ev({ id: 'c', equipo: 'Grader MS4/12', tipo: 'ajuste', impacto: 'en-ventana', ventana: 'Colación HG', horaInicio: '18:05' }),
    ]
    const html = bitacoraAHtmlCorreo({ ...base, eventos })
    expect(html).toContain('Detuvo la máquina 35 min')
    expect(html).toContain('Sin detener: Colación HG')
    expect(html.indexOf('Pendiente para el turno siguiente')).toBeGreaterThan(html.indexOf('Grader MS4/12'))
    expect(html.indexOf('Enzunchadora')).toBeGreaterThan(html.indexOf('Pendiente para el turno siguiente'))
    const texto = bitacoraATextoPlano({ ...base, eventos })
    expect(texto).toContain('3 eventos · 35 min de parada (1) · MTTR 35 min · 1 sin detener producción · 1 pendiente')
    expect(texto).toContain('Técnicos de turno: Danilo Cortes')
  })

  it('incluye la observación general escapada y con saltos de línea', () => {
    const html = bitacoraAHtmlCorreo({ ...base, eventos: [ev({})], observacion: 'Planta sin agua caliente <2 h>\nSe avisó a jefatura' })
    expect(html).toContain('Observaciones del turno: </span>Planta sin agua caliente &lt;2 h&gt;<br>Se avisó a jefatura')
    expect(bitacoraAHtmlCorreo({ ...base, eventos: [ev({})], observacion: '   ' })).not.toContain('Observaciones del turno')
    expect(bitacoraATextoPlano({ ...base, eventos: [ev({})], observacion: 'Sin novedad' })).toContain('Observaciones del turno: Sin novedad')
  })

  it('«Registrado por» usa el técnico elegido, no la cuenta compartida', () => {
    const eventos = [
      ev({ id: 'a', autorNombre: 'mantencion.plantach', registradoPor: 'Matias Serpa' }),
      ev({ id: 'b', autorNombre: 'mantencion.plantach', registradoPor: 'Danilo Cortes', horaInicio: '18:00' }),
      ev({ id: 'c', autorNombre: 'Leandro Igor', registradoPor: null, horaInicio: '19:00' }),
    ]
    const html = bitacoraAHtmlCorreo({ ...base, eventos })
    expect(html).toContain('Registrado por: Matias Serpa, Danilo Cortes, Leandro Igor')
    expect(html).not.toContain('mantencion.plantach')
  })

  it('con participantes, el evento lista a todos sus técnicos sin repetir; sin ellos no agrega ruido', () => {
    const conEquipo = ev({ registradoPor: 'Danilo Cortes', participantes: ['Lucas Adrade', 'danilo cortes', ' '] })
    expect(bitacoraAHtmlCorreo({ ...base, eventos: [conEquipo] })).toContain('Técnicos: Danilo Cortes, Lucas Adrade')
    expect(bitacoraATextoPlano({ ...base, eventos: [conEquipo] })).toContain('  Técnicos: Danilo Cortes, Lucas Adrade')
    expect(bitacoraAHtmlCorreo({ ...base, eventos: [ev({ registradoPor: 'Danilo Cortes', participantes: [] })] })).not.toContain('Técnicos: ')
  })

  it('un turno sin eventos lo dice', () => {
    expect(bitacoraAHtmlCorreo({ ...base, eventos: [] })).toContain('Sin eventos registrados en el turno.')
  })
})

describe('mover un evento de turno (17-09-2026)', () => {
  const actual = turnoDesdeId('2026-09-17_dia')!

  it('ofrece el actual y los 7 días anteriores, nunca uno futuro', () => {
    const lista = turnosElegibles(actual)
    expect(lista).toHaveLength(21)
    expect(lista[0]?.id).toBe('2026-09-17_dia')
    expect(lista[1]?.id).toBe('2026-09-17_noche')
    expect(lista[2]?.id).toBe('2026-09-16_tarde')
    expect(lista[lista.length - 1]?.id).toBe('2026-09-10_tarde')
  })

  it('al resolver, no ofrece turnos anteriores al del pendiente', () => {
    expect(turnosElegibles(actual, 7, '2026-09-16_tarde').map((t) => t.id)).toEqual([
      '2026-09-17_dia',
      '2026-09-17_noche',
      '2026-09-16_tarde',
    ])
    expect(turnosElegibles(actual, 7, 'basura')).toHaveLength(21)
  })

  it('la hora tiene que ser del turno, con una hora de holgura', () => {
    const noche = turnoDesdeId('2026-09-17_noche')!
    expect(horaCalzaEnTurno(noche, '03:15')).toBe(true)
    expect(horaCalzaEnTurno(noche, '23:30')).toBe(true)
    expect(horaCalzaEnTurno(noche, '08:40')).toBe(true)
    expect(horaCalzaEnTurno(noche, '09:30')).toBe(false)
    expect(horaCalzaEnTurno(noche, '15:00')).toBe(false)
  })
})
