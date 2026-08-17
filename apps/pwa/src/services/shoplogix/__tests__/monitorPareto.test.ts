/**
 * El Pareto de las paradas, con los 6 turnos REALES de Filete leídos del doc
 * del monitor el 14-08-2026. Los números de este archivo son los que se vieron
 * en pantalla, no un ejemplo inventado.
 */
import { describe, it, expect } from 'vitest'
import { buildPareto, contextoPareto, contextoPorTurno, equipoDe, turnosParaVentana, type TurnoCtx } from '../monitorPareto'

/** `timeBreakdown.recoverable` de cada uno de los 6 turnos anteriores. */
const TURNOS = [
  // 13-ago · 4.707 pz
  [
    { reason: 'ATASCAMIENTO', min: 23, count: 6 },
    { reason: 'Micro Detencion', min: 16, count: 39 },
    { reason: 'Baader 200/CUCHILLERIA DORSAL', min: 15, count: 3 },
    { reason: 'Equipo Auxiliar / CINTAS', min: 5, count: 2 },
  ],
  // 12-ago · 4.486 pz
  [
    { reason: 'Micro Detencion', min: 19, count: 45 },
    { reason: 'FALLA OPERACIONAL', min: 10, count: 2 },
    { reason: 'ATASCAMIENTO', min: 4, count: 2 },
  ],
  // 11-ago · 3.618 pz — el turno del evento grande de cuchillería
  [
    { reason: 'Baader 200/CUCHILLERIA RASCADOR', min: 47, count: 7 },
    { reason: 'Micro Detencion', min: 17, count: 38 },
    { reason: 'ATASCAMIENTO', min: 8, count: 3 },
    { reason: 'Detencion', min: 7, count: 2 },
  ],
  // 10-ago · 4.915 pz — el MEJOR turno, y el que más micro-detenciones tuvo
  [
    { reason: 'Micro Detencion', min: 27, count: 58 },
    { reason: 'Baader 200/CUCHILLERIA DORSAL', min: 13, count: 2 },
    { reason: 'ATASCAMIENTO', min: 9, count: 3 },
    { reason: 'AJUSTE MANTENIMIENTO', min: 5, count: 2 },
  ],
  // 8-ago · 3.454 pz — el incidente de acumulación
  [
    { reason: 'ACUMULACION', min: 36, count: 9 },
    { reason: 'Micro Detencion', min: 20, count: 43 },
  ],
  // 7-ago · 4.364 pz
  [
    { reason: 'Micro Detencion', min: 27, count: 63 },
    { reason: 'CAMBIO LOTE/MMPP', min: 11, count: 2 },
    { reason: 'Baader 200/PERNOS/RESORTES', min: 11, count: 2 },
    { reason: 'ATASCAMIENTO', min: 6, count: 3 },
  ],
]

describe('equipoDe', () => {
  it('saca el equipo de una causa "Equipo/Parte"', () => {
    expect(equipoDe('Baader 200/CUCHILLERIA DORSAL')).toBe('Baader 200')
    expect(equipoDe('Equipo Auxiliar / CINTAS')).toBe('Equipo Auxiliar')
  })

  it('una causa sin equipo se queda como está', () => {
    expect(equipoDe('Micro Detencion')).toBeNull()
    expect(equipoDe('ATASCAMIENTO')).toBeNull()
  })

  it('⚠ "CAMBIO LOTE/MMPP" NO es un equipo con parte', () => {
    // Es una sola causa que lleva una barra en el nombre. Se agrupa igual bajo
    // "CAMBIO LOTE", que es su propio nombre: no inventa un equipo falso ni
    // rompe, pero conviene saberlo si un día hay que afinar la regla.
    expect(equipoDe('CAMBIO LOTE/MMPP')).toBe('CAMBIO LOTE')
  })
})

/*
 * cpm UNIFORME (10 pz/min) en los tests históricos: con la misma vara en todos
 * los turnos, las piezas son proporcionales a los minutos y el orden y los %
 * heredados siguen valiendo tal cual. El cpm DIFERENCIAL —que reordena— tiene
 * su describe propio más abajo.
 */
const conCpm = (causas: Array<{ reason: string; min: number; count: number }> | null | undefined) =>
  causas ? { causas, total: 3000, producingMin: 300 } : causas

describe('buildPareto · 6 turnos reales de Filete', () => {
  const p = buildPareto(TURNOS.map(conCpm))

  it('suma los 336 min recuperables de la muestra', () => {
    expect(p.totalMin).toBe(336)
    expect(p.shifts).toBe(6)
  })

  it('ordena por minutos y agrupa las tres causas de la Baader en una', () => {
    expect(p.rows[0]!.label).toBe('Micro Detencion')
    expect(p.rows[0]!.minutes).toBe(126)
    expect(p.rows[1]!.label).toBe('Baader 200')
    // 15 + 47 + 13 + 11: sueltas ninguna pasa de 47 y ninguna llama la atención.
    expect(p.rows[1]!.minutes).toBe(86)
    expect(p.rows[1]!.parts).toHaveLength(3)
    expect(p.rows[2]!.label).toBe('ATASCAMIENTO')
    expect(p.rows[2]!.minutes).toBe(50)
  })

  it('cuatro causas explican el 89% del tiempo parado', () => {
    /*
     * El corte es el estándar: la primera fila que alcanza el 80% acumulado.
     * Acá la tercera llega a 78,0 y la cuarta a 89,3, así que entran cuatro.
     * Se resistió la tentación de mover el corte a "la más cercana al 80%"
     * para que diera tres: con 6 turnos, discutir 78 contra 80 es precisión
     * falsa, y una regla torcida a mano deja de ser auditable.
     */
    expect(p.vitalCount).toBe(4)
    expect(Math.round(p.vitalPct)).toBe(89)
    expect(Math.round(p.rows[2]!.cumPct)).toBe(78)
  })

  it('⚠ el segundo eje: en cuántos turnos aparece cada una', () => {
    // Sin esto, ACUMULACION (36 min, cuarta por minutos) se lee como causa
    // crónica cuando ocurrió UNA vez.
    expect(p.rows[0]!.shifts).toBe(6)   // Micro Detencion, en todos
    expect(p.rows[1]!.shifts).toBe(4)   // Baader 200
    expect(p.rows[2]!.shifts).toBe(5)   // ATASCAMIENTO
    const acum = p.rows.find((r) => r.label === 'ACUMULACION')!
    expect(acum.minutes).toBe(36)
    expect(acum.shifts).toBe(1)
  })

  it('cuenta las paradas, que es otra escala del problema', () => {
    // 286 micro-detenciones en 6 turnos: 48 por turno.
    expect(p.rows[0]!.count).toBe(286)
    expect(p.rows[1]!.count).toBe(14)
  })

  it('los porcentajes suman 100 y el acumulado es creciente', () => {
    expect(Math.round(p.rows.reduce((a, r) => a + r.sharePct, 0))).toBe(100)
    for (let i = 1; i < p.rows.length; i++) {
      expect(p.rows[i]!.cumPct).toBeGreaterThanOrEqual(p.rows[i - 1]!.cumPct)
    }
    expect(Math.round(p.rows[p.rows.length - 1]!.cumPct)).toBe(100)
  })
})

describe('buildPareto · bordes', () => {
  it('sin turnos no inventa nada', () => {
    expect(buildPareto([]).rows).toEqual([])
    expect(buildPareto([null, undefined]).totalMin).toBe(0)
  })

  it('descarta causas de duración cero en vez de listarlas con 0%', () => {
    const p = buildPareto([conCpm([{ reason: 'X', min: 0, count: 3 }, { reason: 'Y', min: 5, count: 1 }])])
    expect(p.rows).toHaveLength(1)
    expect(p.rows[0]!.label).toBe('Y')
  })

  it('una sola causa se lleva el 100% y el corte es de una fila', () => {
    const p = buildPareto([conCpm([{ reason: 'X', min: 10, count: 1 }])])
    expect(p.vitalCount).toBe(1)
    expect(p.vitalPct).toBe(100)
  })

  it('con todas parejas y ninguna llegando al 80%, igual corta donde lo cruza', () => {
    const p = buildPareto([conCpm([
      { reason: 'A', min: 10, count: 1 }, { reason: 'B', min: 10, count: 1 },
      { reason: 'C', min: 10, count: 1 }, { reason: 'D', min: 10, count: 1 },
      { reason: 'E', min: 10, count: 1 },
    ])])
    expect(p.vitalCount).toBe(4)   // 4 de 5 = 80%
  })
})

describe('dueño de la recurrencia', () => {
  it('⚠ cada fila dice de quién es, según el árbol oficial', () => {
    const p = buildPareto([conCpm([
      { reason: 'Baader 200/CUCHILLERIA DORSAL', min: 75, count: 5 },
      { reason: 'ATASCAMIENTO', min: 58, count: 20 },
      { reason: 'Micro Detencion', min: 113, count: 260 },
    ])])
    const por = Object.fromEntries(p.rows.map((r) => [r.label, r.dueno]))
    expect(por['Baader 200']).toBe('mantencion')
    expect(por['ATASCAMIENTO']).toBe('externo')       // MMPP en el curso
    expect(por['Micro Detencion']).toBe('sin-imputar')
  })

  it('el reparto por dueño suma lo mismo que las filas', () => {
    const p = buildPareto([conCpm([
      { reason: 'Baader 200/CUCHILLERIA DORSAL', min: 75, count: 5 },
      { reason: 'ATASCAMIENTO', min: 58, count: 20 },
      { reason: 'Micro Detencion', min: 113, count: 260 },
    ])])
    expect(p.porDueno.mantencion).toBe(75)
    expect(p.porDueno.externo).toBe(58)
    expect(p.porDueno['sin-imputar']).toBe(113)
    expect(p.porDueno.mantencion + p.porDueno.externo + p.porDueno['sin-imputar']).toBe(p.totalMin)
  })
})

describe('contextoPareto · el marco temporal del Pareto', () => {
  /*
   * Los 7 turnos REALES de Filete al 15-08 (verificados contra Firestore).
   * El sábado 15 tiene la línea apagada: 465 min de ventana y 0 produciendo.
   */
  const TURNOS: TurnoCtx[] = [
    { dateKey: '2026-08-08', windowMin: 460, producingMin: 340, plannedMin: 62, recoverableMin: 51 },
    { dateKey: '2026-08-10', windowMin: 515, producingMin: 395, plannedMin: 57, recoverableMin: 55 },
    { dateKey: '2026-08-11', windowMin: 505, producingMin: 343, plannedMin: 65, recoverableMin: 90 },
    { dateKey: '2026-08-12', windowMin: 495, producingMin: 375, plannedMin: 77, recoverableMin: 37 },
    { dateKey: '2026-08-13', windowMin: 520, producingMin: 403, plannedMin: 50, recoverableMin: 63 },
    { dateKey: '2026-08-14', windowMin: 455, producingMin: 338, plannedMin: 63, recoverableMin: 55 },
    { dateKey: '2026-08-15', windowMin: 465, producingMin: 0, plannedMin: 0, recoverableMin: 0 },
  ]

  /*
   * ⚠⚠ EL BUG que esto congela: la página sumaba el turno VISTO más el
   * historial completo, y el historial ya lo incluye. Mirando el 14-08 el
   * bloque decía «7 turnos · 6 h 42 min» cuando eran 6 turnos y 5 h 48 min.
   */
  it('⚠ el turno que se está mirando no se cuenta dos veces', () => {
    const conDuplicado = [TURNOS[5]!, ...TURNOS]     // el 14-08, como en la página
    const c = contextoPareto(conDuplicado)
    expect(c.turnos).toBe(6)                         // 7 menos el sábado sin producción
    expect(c.recuperableMin).toBe(351)               // no 406
  })


  it('⚠ el titular es la SUMA EXACTA de las causas, no el total redondeado', () => {
    // El backend redondea cada causa a minuto: recoverableMin decía 55 y las
    // causas sumaban 54, y esos 3 minutos reaparecían en cada frase que
    // comparara las dos cifras («12 h 40» arriba, dueños sumando 12 h 37).
    const c = contextoPareto([
      { dateKey: '2026-08-14', shiftId: 'Turno Dia', windowMin: 455, producingMin: 338, plannedMin: 63,
        recoverableMin: 55, causas: [{ reason: 'Micro Detencion', min: 30, count: 10 },
                                     { reason: 'AGUA', min: 24, count: 1 }] },
    ])
    expect(c.recuperableMin).toBe(54)   // 30 + 24, no el 55 del backend
  })

  it('el 100% es el tiempo TOTAL, con el convenio a la vista', () => {
    const c = contextoPareto(TURNOS)
    expect(c.ventanaMin).toBe(2950)                  // 3.415 menos los 465 del sábado
    expect(c.convenioMin).toBe(374)                  // el convenio se muestra, no se descuenta
    expect(c.recuperableMin).toBe(351)
    expect(c.pct).toBeCloseTo(11.9, 1)
    // Con el tiempo útil como base daría más: 351/(2950-374).
    expect(c.pct).toBeLessThan((351 / (2950 - 374)) * 100)
  })

  /*
   * ⚠⚠ El turno con la línea APAGADA no puede diluir el indicador: aporta
   * ventana al denominador y cero al numerador, así que el % «mejora» sin que
   * nadie haya arreglado una parada. Mirando el turno de hoy el bloque decía
   * «7 turnos · 10,3%» y mirando el de ayer «6 turnos · 11,9%», con los mismos
   * seis turnos de trabajo adentro.
   */
  it('⚠ un turno sin producción no baja el indicador por no trabajar', () => {
    const soloConTrabajo = TURNOS.filter((t) => (t.producingMin ?? 0) > 0)
    const conElSabado = contextoPareto(TURNOS)
    const sinElSabado = contextoPareto(soloConTrabajo)
    expect(conElSabado.pct).toBeCloseTo(sinElSabado.pct, 5)
    expect(conElSabado.ventanaMin).toBe(sinElSabado.ventanaMin)
    // Pero el día no desaparece: queda contado aparte.
    expect(conElSabado.sinProduccion).toEqual(['2026-08-15'])
  })

  it('⚠ el turno sin producción no dibuja una mejora que no ocurrió', () => {
    const c = contextoPareto(TURNOS)
    expect(c.serie).toHaveLength(6)                  // el sábado queda fuera
    expect(c.serie.some((p) => p.dateKey === '2026-08-15')).toBe(false)
    expect(c.sinProduccion).toEqual(['2026-08-15'])  // pero no desaparece
  })

  it('la serie va del más viejo al más nuevo, con el % de cada turno', () => {
    const c = contextoPareto(TURNOS)
    expect(c.serie.map((p) => p.dateKey)[0]).toBe('2026-08-08')
    expect(c.serie.map((p) => Math.round(p.pct))).toEqual([11, 11, 18, 7, 12, 12])
  })

  it('⚠⚠ con datos ruidosos NO declara una mejora: hace falta una racha', () => {
    // 11,1 · 10,7 · 17,8 · 7,5 · 12,1 · 12,1 no tiene tendencia, y el bloque
    // tiene que decirlo en vez de dibujar una flecha sobre el ruido.
    expect(contextoPareto(TURNOS).veredicto).toBe('sin-cambio')
  })

  it('con tres turnos seguidos bajo lo habitual, sí lo dice', () => {
    const mejorando: TurnoCtx[] = [
      ...TURNOS.slice(0, 3),
      { dateKey: '2026-08-16', windowMin: 480, producingMin: 400, plannedMin: 60, recoverableMin: 10 },
      { dateKey: '2026-08-17', windowMin: 480, producingMin: 400, plannedMin: 60, recoverableMin: 9 },
      { dateKey: '2026-08-18', windowMin: 480, producingMin: 400, plannedMin: 60, recoverableMin: 8 },
    ]
    expect(contextoPareto(mejorando).veredicto).toBe('mejora')
  })
})


describe('ventana elegible y comparación entre turnos', () => {
  /* Día y noche del mismo período, como quedará Filete desde el 17-08. */
  const MIXTO: TurnoCtx[] = [
    { dateKey: '2026-08-10', shiftId: 'Turno Dia', windowMin: 480, producingMin: 380, plannedMin: 60, recoverableMin: 40 },
    { dateKey: '2026-08-10', shiftId: 'Turno Noche', windowMin: 360, producingMin: 300, plannedMin: 30, recoverableMin: 30 },
    { dateKey: '2026-08-11', shiftId: 'Turno Dia', windowMin: 480, producingMin: 370, plannedMin: 60, recoverableMin: 50 },
    { dateKey: '2026-08-11', shiftId: 'Turno Noche', windowMin: 360, producingMin: 290, plannedMin: 30, recoverableMin: 40 },
    { dateKey: '2026-08-12', shiftId: 'Turno Dia', windowMin: 480, producingMin: 390, plannedMin: 60, recoverableMin: 30 },
    { dateKey: '2026-08-12', shiftId: 'Turno Noche', windowMin: 360, producingMin: 280, plannedMin: 30, recoverableMin: 50 },
  ]

  it('⚠ dos turnos del MISMO día son dos entradas, no una', () => {
    // Con la fecha como clave, el que llegaba segundo pisaba al primero.
    expect(turnosParaVentana(MIXTO, { turno: 'todos' })).toHaveLength(6)
  })

  it('la ventana recorta por los MÁS RECIENTES y devuelve en orden natural', () => {
    const r = turnosParaVentana(MIXTO, { ventana: 5, turno: 'Turno Dia' })
    expect(r.map((t) => t.dateKey)).toEqual(['2026-08-10', '2026-08-11', '2026-08-12'])
  })

  it('sin ventana se miran todos los turnos que haya', () => {
    expect(turnosParaVentana(MIXTO, { ventana: null, turno: 'Turno Dia' })).toHaveLength(3)
  })

  it('⚠⚠ el nocturno se mide con SU propia vara, no con la del diurno', () => {
    const porTurno = contextoPorTurno(MIXTO)
    const dia = porTurno.find((x) => x.turno === 'Turno Dia')!
    const noche = porTurno.find((x) => x.turno === 'Turno Noche')!
    // El diurno mide 24 h de ventana y el nocturno 18: mezclarlos daba un
    // porcentaje que no era el de ninguno de los dos.
    expect(dia.ctx.ventanaMin).toBe(1440)
    expect(noche.ctx.ventanaMin).toBe(1080)
    // Y el nocturno sale PEOR, que es justo lo que hay que poder ver:
    expect(noche.ctx.pct).toBeGreaterThan(dia.ctx.pct)
  })

  it('con un solo turno corriendo no hay comparación que ofrecer', () => {
    const soloDia = MIXTO.filter((t) => t.shiftId === 'Turno Dia')
    expect(contextoPorTurno(soloDia)).toHaveLength(1)
  })
})


describe('buildPareto · la valorización usa el cpm de CADA turno', () => {
  it('⚠ los mismos minutos en un turno lento cuestan menos piezas — y eso reordena', () => {
    /*
     * El caso real que el mockup mostró: MOTORES (20 min) cae bajo CAMBIO LOTE
     * (17 min) porque sus paradas fueron en turnos lentos. Acá: A tiene MÁS
     * minutos que B, pero paró en el turno de 8 pz/min; B paró en el de 14.
     */
    const p = buildPareto([
      { causas: [{ reason: 'A', min: 20, count: 1 }], total: 2400, producingMin: 300 },  // 8 pz/min
      { causas: [{ reason: 'B', min: 17, count: 1 }], total: 4200, producingMin: 300 },  // 14 pz/min
    ])
    expect(p.rows[0]!.label).toBe('B')                   // 238 pz > 160 pz
    expect(Math.round(p.rows[0]!.piezas)).toBe(238)
    expect(Math.round(p.rows[1]!.piezas)).toBe(160)
    // …aunque por minutos A sigue siendo mayor: la diferencia ES la información.
    expect(p.rows[1]!.minutes).toBeGreaterThan(p.rows[0]!.minutes)
  })

  it('un turno sin cpm (sin producción registrada) aporta minutos pero 0 piezas', () => {
    const p = buildPareto([
      { causas: [{ reason: 'A', min: 10, count: 1 }], total: 0, producingMin: 0 },
    ])
    expect(p.rows[0]!.minutes).toBe(10)
    expect(p.rows[0]!.piezas).toBe(0)
  })

  it('el reparto por dueño en piezas suma el total valorizado', () => {
    const p = buildPareto([
      { causas: [
        { reason: 'Baader 200/CUCHILLERIA DORSAL', min: 10, count: 1 },
        { reason: 'ATASCAMIENTO', min: 10, count: 1 },
        { reason: 'Micro Detencion', min: 10, count: 1 },
      ], total: 3000, producingMin: 300 },
    ])
    const d = p.porDuenoPiezas
    expect(d.mantencion + d.externo + d['sin-imputar']).toBeCloseTo(p.totalPiezas, 6)
    expect(d.mantencion).toBeCloseTo(100, 6)
  })
})
