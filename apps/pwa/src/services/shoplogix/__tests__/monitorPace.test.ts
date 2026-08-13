/**
 * monitorPace — el ritmo que hace falta para llegar a la cuota.
 *
 * La pregunta de Orel: a mitad de turno, ¿se puede compensar? Para que la
 * respuesta sirva tiene que ser honesta en los dos sentidos: decir cuánto hay
 * que acelerar cuando alcanza, y decir que NO se llega cuando no alcanza.
 */
import { describe, it, expect } from 'vitest'
import { computePaceToTarget, lineMaxPerHour } from '../monitorPace'

const INICIO = Date.parse('2026-08-12T07:15:00Z')
const CIERRE = Date.parse('2026-08-12T15:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

/** Turno de Chonchi: 07:15–15:00, meta 20.000 pz. */
function base(over: Partial<Parameters<typeof computePaceToTarget>[0]> = {}) {
  return computePaceToTarget({
    targetPieces: 20_000,
    producedPieces: 5_453,
    scheduledEnd: iso(CIERRE),
    nowWallMs: Date.parse('2026-08-12T11:00:00Z'),
    currentPerHour: 1_449,
    maxPerHour: 2_768,
    ...over,
  })
}

describe('computePaceToTarget', () => {
  it('calcula cuánto falta y en cuánto tiempo', () => {
    const p = base()!
    expect(p.remainingPieces).toBe(20_000 - 5_453)
    expect(p.remainingMin).toBe(4 * 60) // 11:00 → 15:00
  })

  it('da el ritmo requerido en pz/h y pz/min', () => {
    const p = base()!
    // 14.547 piezas en 240 min = 3.636,75 pz/h
    expect(p.requiredPerHour).toBeCloseTo((14_547 / 240) * 60, 2)
    expect(p.requiredPerMinute).toBeCloseTo(p.requiredPerHour / 60, 6)
  })

  it('dice cuánto hay que ACELERAR sobre el ritmo actual', () => {
    const p = base()!
    expect(p.gapPerHour).toBeCloseTo(p.requiredPerHour - 1_449, 4)
    expect(p.gapPerHour).toBeGreaterThan(0)
  })

  it('AVISA cuando la cuota no se alcanza — no promete lo imposible', () => {
    // Requiere 3.637 pz/h y la línea da 2.768 como máximo.
    expect(base()!.verdict).toBe('fuera-de-alcance')
  })

  it('y la da por alcanzable cuando el ritmo requerido cabe en el techo', () => {
    const p = base({ targetPieces: 10_000 })!
    // 4.547 pz en 4 h = 1.137 pz/h, muy por debajo de 2.768.
    expect(p.verdict).toBe('alcanzable')
    expect(p.requiredPerHour).toBeLessThan(p.maxPerHour!)
  })

  it('con el ritmo actual alcanzando, la brecha es negativa', () => {
    const p = base({ targetPieces: 10_000 })!
    expect(p.gapPerHour).toBeLessThan(0)
  })

  it('proyecta a dónde llega si sigue al ritmo actual', () => {
    const p = base()!
    // 5.453 + 4 h × 1.449 = 11.249
    expect(p.projectedPieces).toBe(Math.round(5_453 + 4 * 1_449))
  })

  it('cuota cumplida: lo dice y no pide acelerar', () => {
    const p = base({ producedPieces: 21_000 })!
    expect(p.verdict).toBe('cumplida')
    expect(p.remainingPieces).toBe(0)
    expect(p.requiredPerHour).toBe(0)
    expect(p.gapPerHour).toBe(0)
  })

  it('sin techo conocido igual marca imposible cuando pide MÁS de +30% del ritmo real', () => {
    /*
     * Segunda vuelta de Orel (13-ago): "se alcanza pero con 36 pz/min" en una
     * línea que viene a 10 sigue siendo irreal — nadie apura 3,6×. El tope de
     * apuro (+30% sobre el ritmo real) marca imposible aunque no haya techo.
     */
    const p = base({ maxPerHour: null })!
    // required 3.637 pz/h contra un ritmo real de 1.449 (tope 1.884): fuera.
    expect(p.verdict).toBe('fuera-de-alcance')
    expect(p.maxPerHour).toBeNull()
    // Y la hora extra tampoco lo salva: 2.909 pz/h sigue siendo 2× el ritmo.
    expect(p.withExtraHour!.feasible).toBe(false)
  })

  it('EXIGENTE: cabe en el techo y en el tope de apuro, pero pide más que el ritmo real', () => {
    /*
     * El caso de Orel (13-ago): "dice que se alcanza pero pide 24 pz/min" en
     * una línea que viene a 10. El techo histórico no es lo que la línea está
     * haciendo HOY: entre "alcanzable" e "imposible" falta el escalón honesto.
     */
    const p = base({ targetPieces: 12_500 })!
    // required = 7.047/240·60 ≈ 1.762 pz/h: bajo el techo (2.768) y bajo el
    // tope de apuro (1.449·1,3 ≈ 1.884), pero por encima del ritmo real
    // (1.449 · 1,05 ≈ 1.521) → apuro plausible, no promesa fácil.
    expect(p.verdict).toBe('exigente')
    // Y la hora extra se ofrece YA en este escalón, no recién en imposible:
    // 7.047/300·60 ≈ 1.409 pz/h ≤ 1.521 → con la hora extra basta el ritmo
    // que la línea ya trae.
    expect(p.withExtraHour).not.toBeNull()
    expect(p.withExtraHour!.feasible).toBe(true)
    expect(p.withExtraHour!.realistic).toBe(true)
  })

  it('el margen del 5% no dispara "exigente" por una diferencia que la línea absorbe', () => {
    // required ≈ 1.480 pz/h contra 1.449 reales: 2% arriba, alcanzable.
    const p = base({ targetPieces: 5_453 + Math.round((1_480 / 60) * 240) })!
    expect(p.verdict).toBe('alcanzable')
    expect(p.withExtraHour).toBeNull()
  })

  it('para juzgar lo realista usa el MAYOR entre promedio y ritmo reciente', () => {
    // Promedio 1.449 (arrancó mal), pero la última media hora va a 2.100:
    // required 1.887 entra en lo que la línea ESTÁ haciendo → alcanzable.
    const p = base({ targetPieces: 13_000, recentPerHour: 2_100 })!
    expect(p.verdict).toBe('alcanzable')
    // Y al revés: el reciente en cero (colación) NO vuelve todo exigente si
    // el promedio ya cubre el requerido.
    const q = base({ targetPieces: 10_000, recentPerHour: 0 })!
    expect(q.verdict).toBe('alcanzable')
  })

  it('DESCARTA un techo por debajo del ritmo ya demostrado', () => {
    /*
     * Caso real visto en pantalla: techo 1.029 pz/h en una línea que venía
     * corriendo a 1.464. Con ese número la tarjeta decía a la vez "con este
     * ritmo alcanza" y "la meta ya no se alcanza". Un techo que la línea ya
     * superó no es un techo.
     */
    const p = base({ currentPerHour: 1_464, maxPerHour: 1_029, targetPieces: 30_000 })!
    expect(p.maxPerHour).toBeNull()
    // El techo malo queda descartado — pero el veredicto igual puede decir
    // imposible por el TOPE DE APURO (pide 6.137 pz/h viniendo a 1.464): esa
    // razón es legítima; la que no lo era es el techo falso.
    expect(p.verdict).toBe('fuera-de-alcance')
  })

  it('y conserva el techo cuando sí está por encima del ritmo actual', () => {
    const p = base({ currentPerHour: 1_449, maxPerHour: 2_768 })!
    expect(p.maxPerHour).toBe(2_768)
  })

  it('con 1 h extra baja el ritmo necesario, y dice si así SÍ entra', () => {
    // Sin extra: 14.547 pz en 240 min = 3.637 pz/h, por encima del techo 2.768.
    // Con 1 h más: 14.547 en 300 min = 2.909 — sigue arriba, no basta.
    const p = base()!
    expect(p.withExtraHour).not.toBeNull()
    expect(p.withExtraHour!.requiredPerHour).toBeCloseTo((14_547 / 300) * 60, 2)
    expect(p.withExtraHour!.requiredPerHour).toBeLessThan(p.requiredPerHour)
    expect(p.withExtraHour!.feasible).toBe(false)
  })

  it('marca la hora extra como suficiente cuando entra en el techo Y en el ritmo real', () => {
    // Con la línea viniendo a 2.600: required 3.637 supera el techo (3.000) →
    // fuera; con la hora extra pide 2.909, que entra en el techo y en el tope
    // de apuro (2.600·1,3 = 3.380) → la hora extra SÍ resuelve.
    const p = base({ maxPerHour: 3_000, currentPerHour: 2_600 })!
    expect(p.verdict).toBe('fuera-de-alcance')
    expect(p.withExtraHour!.feasible).toBe(true)
  })

  it('NO ofrece la hora extra cuando ya se alcanza sin estirar nada', () => {
    // Proponer alargar el turno cuando no hace falta sugiere que sí hace falta.
    expect(base({ targetPieces: 10_000 })!.withExtraHour).toBeNull()
    expect(base({ producedPieces: 21_000 })!.withExtraHour).toBeNull()
  })

  it('publica el avance de la meta en porcentaje', () => {
    expect(base()!.progressPct).toBeCloseTo((5_453 / 20_000) * 100, 4)
    expect(base({ producedPieces: 21_000 })!.progressPct).toBe(100)
  })

  it('no recomienda nada con el turno cerrado', () => {
    expect(base({ shiftClosed: true })).toBeNull()
  })

  it('sin cuota cae al objetivo del sensor — la mayoría de los links no trae meta', () => {
    const p = base({ targetPieces: null, expectedPieces: 21_225 })!
    expect(p.targetSource).toBe('objetivo-sensor')
    expect(p.targetPieces).toBe(21_225)
    expect(p.remainingPieces).toBe(21_225 - 5_453)
  })

  it('la cuota le gana al objetivo del sensor cuando están las dos', () => {
    const p = base({ targetPieces: 20_000, expectedPieces: 21_225 })!
    expect(p.targetSource).toBe('cuota')
    expect(p.targetPieces).toBe(20_000)
  })

  it('sin cuota NI objetivo no inventa una meta', () => {
    expect(base({ targetPieces: null, expectedPieces: null })).toBeNull()
    expect(base({ targetPieces: 0, expectedPieces: 0 })).toBeNull()
  })

  it('no divide por cero cuando ya no queda tiempo NI la línea produce', () => {
    expect(base({ nowWallMs: CIERRE, currentPerHour: 0 })).toBeNull()
    expect(base({ nowWallMs: CIERRE + 60_000, shiftClosed: true })).toBeNull()
  })

  it('HORA EXTRA: pasado el cierre con la línea andando, sigue diciendo cuánto falta', () => {
    /*
     * Antes acá devolvía null y la tarjeta desaparecía entera — justo cuando la
     * hora extra se hace PARA alcanzar la cuota (Orel, 13-ago).
     */
    const p = base({ nowWallMs: CIERRE + 20 * 60_000 })!
    expect(p.verdict).toBe('hora-extra')
    expect(p.remainingPieces).toBe(20_000 - 5_453)
    expect(p.remainingMin).toBe(0)
    // No hay ritmo que pedir: ya no queda ventana que repartir.
    expect(p.requiredPerHour).toBe(0)
    // 14.547 pz a 1.449 pz/h = 24,15 h = 1.449 min
    expect(p.extraMinutesNeeded).toBe(Math.round(14_547 / (1_449 / 60)))
    expect(p.withExtraHour).toBeNull()
  })

  it('pero con el turno CERRADO no recomienda nada aunque falten piezas', () => {
    expect(base({ nowWallMs: CIERRE + 20 * 60_000, shiftClosed: true })).toBeNull()
  })

  it('pero SÍ informa la cuota cumplida aunque el turno ya haya terminado su horario', () => {
    // El orden importa: "cumplida" se evalúa ANTES que "sin tiempo", porque es
    // la buena noticia y no depende de que queden minutos.
    const p = computePaceToTarget({
      targetPieces: 20_000,
      producedPieces: 20_500,
      scheduledEnd: iso(CIERRE),
      nowWallMs: CIERRE + 10 * 60_000,
      currentPerHour: 1_400,
    })!
    expect(p.verdict).toBe('cumplida')
    expect(p.remainingMin).toBe(0)
  })

  it('sin cierre programado no inventa una ventana', () => {
    expect(base({ scheduledEnd: null })).toBeNull()
    expect(base({ scheduledEnd: 'no-es-fecha' })).toBeNull()
  })
})

describe('lineMaxPerHour', () => {
  it('reparte lo que el sensor espera del turno sobre sus horas programadas', () => {
    // 21.225 pz esperadas en 7,75 h = 2.738,7 pz/h
    const max = lineMaxPerHour(21_225, iso(INICIO), iso(CIERRE))
    expect(max).toBeCloseTo(21_225 / 7.75, 1)
  })

  it('ante la duda devuelve null en vez de un techo subestimado', () => {
    expect(lineMaxPerHour(null, iso(INICIO), iso(CIERRE))).toBeNull()
    expect(lineMaxPerHour(0, iso(INICIO), iso(CIERRE))).toBeNull()
    expect(lineMaxPerHour(21_225, null, iso(CIERRE))).toBeNull()
    expect(lineMaxPerHour(21_225, iso(INICIO), null)).toBeNull()
    expect(lineMaxPerHour(21_225, 'x', iso(CIERRE))).toBeNull()
  })

  it('no acepta una ventana invertida o de duración cero', () => {
    expect(lineMaxPerHour(21_225, iso(CIERRE), iso(INICIO))).toBeNull()
    expect(lineMaxPerHour(21_225, iso(INICIO), iso(INICIO))).toBeNull()
  })
})
