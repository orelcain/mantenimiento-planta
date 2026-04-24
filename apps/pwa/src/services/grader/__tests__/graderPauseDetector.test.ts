/**
 * Tests para graderPauseDetector.
 *
 * Cubre: tiers (micro/pausa/larga/parada), auto-tag colación
 * (ventanas turno día/noche, duración, criterio solape),
 * totalDeadTimeSec, formato de ID, colectSortedTimestamps.
 *
 * Todas las funciones son puras — sin mocks de Firebase.
 */

import { describe, it, expect } from 'vitest'
import { detectPauses, collectSortedTimestamps } from '../graderPauseDetector'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** ISO string con la hora local planta (convención Z-suffix = hora local). */
function mkTs(dayIso: string, h: number, m: number, s = 0): string {
  return `${dayIso}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000Z`
}

/** Retorna [startTs, endTs] donde la diferencia es exactamente gapSec. */
function mkGap(startTs: string, gapSec: number): [string, string] {
  const endMs = Date.parse(startTs) + gapSec * 1000
  return [startTs, new Date(endMs).toISOString()]
}

const DAY = '2024-01-15'

// ── Entradas vacías y borde ───────────────────────────────────────────────────

describe('detectPauses — entradas vacías y borde', () => {
  it('array vacío → resultado vacío', () => {
    const r = detectPauses([], 'Turno día')
    expect(r.pauses).toHaveLength(0)
    expect(r.microDetentions.count).toBe(0)
    expect(r.totalDeadTimeSec).toBe(0)
  })

  it('un solo timestamp → sin gaps posibles', () => {
    const r = detectPauses([mkTs(DAY, 8, 0)], 'Turno día')
    expect(r.pauses).toHaveLength(0)
    expect(r.totalDeadTimeSec).toBe(0)
  })

  it('timestamps inválidos son ignorados', () => {
    const r = detectPauses(['invalid', mkTs(DAY, 8, 0), 'bad'], 'Turno día')
    expect(r.pauses).toHaveLength(0)
    expect(r.totalDeadTimeSec).toBe(0)
  })

  it('gap de 59s → ignorado (por debajo del umbral micro)', () => {
    const [s, e] = mkGap(mkTs(DAY, 8, 0), 59)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses).toHaveLength(0)
    expect(r.microDetentions.count).toBe(0)
    expect(r.totalDeadTimeSec).toBe(0)
  })
})

// ── Micro-detenciones (60–299 s) ──────────────────────────────────────────────

describe('detectPauses — micro-detenciones', () => {
  it('gap 60s → micro, no emite Pause individual', () => {
    const [s, e] = mkGap(mkTs(DAY, 8, 0), 60)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses).toHaveLength(0)
    expect(r.microDetentions.count).toBe(1)
    expect(r.microDetentions.totalSec).toBe(60)
    expect(r.totalDeadTimeSec).toBe(60)
  })

  it('gap 299s → micro (borde superior)', () => {
    const [s, e] = mkGap(mkTs(DAY, 9, 0), 299)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses).toHaveLength(0)
    expect(r.microDetentions.count).toBe(1)
  })

  it('micro se agrupa en byHour por hora UTC de inicio', () => {
    const [s, e] = mkGap(mkTs(DAY, 10, 30), 120)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.microDetentions.byHour['10']).toBe(120)
  })
})

// ── Tiers de pausas ───────────────────────────────────────────────────────────

describe('detectPauses — tiers', () => {
  it('gap 300s → tier "pausa" (borde inferior)', () => {
    const [s, e] = mkGap(mkTs(DAY, 9, 0), 300)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses).toHaveLength(1)
    expect(r.pauses[0]!.tier).toBe('pausa')
    expect(r.pauses[0]!.durationSec).toBe(300)
  })

  it('gap 1799s → tier "pausa" (borde superior)', () => {
    const [s, e] = mkGap(mkTs(DAY, 9, 0), 1799)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses[0]!.tier).toBe('pausa')
  })

  it('gap 1800s → tier "larga" (borde inferior)', () => {
    const [s, e] = mkGap(mkTs(DAY, 9, 0), 1800)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses[0]!.tier).toBe('larga')
  })

  it('gap 3599s → tier "larga" (borde superior)', () => {
    const [s, e] = mkGap(mkTs(DAY, 9, 0), 3599)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses[0]!.tier).toBe('larga')
  })

  it('gap 3600s → tier "parada" (borde inferior)', () => {
    const [s, e] = mkGap(mkTs(DAY, 9, 0), 3600)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses[0]!.tier).toBe('parada')
  })

  it('totalDeadTimeSec suma micro + pausas', () => {
    const ts0 = mkTs(DAY, 8, 0)
    const ts1 = new Date(Date.parse(ts0) +  120_000).toISOString() // micro 2 min
    const ts2 = new Date(Date.parse(ts1) +  600_000).toISOString() // pausa 10 min
    const r = detectPauses([ts0, ts1, ts2], 'Turno día')
    expect(r.totalDeadTimeSec).toBe(720)
    expect(r.pauses).toHaveLength(1)
    expect(r.microDetentions.count).toBe(1)
  })
})

// ── Auto-tag colación ─────────────────────────────────────────────────────────

describe('detectPauses — auto-tag colación (turno día)', () => {
  it('60 min dentro de ventana 12:30–14:30 → autoTag colacion', () => {
    const s = mkTs(DAY, 13, 0)
    const e = mkTs(DAY, 14, 0)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses[0]!.autoTag).toBe('colacion')
  })

  it('45 min desde el borde de la ventana (12:30) → autoTag colacion', () => {
    const s = mkTs(DAY, 12, 30)
    const e = mkTs(DAY, 13, 15)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses[0]!.autoTag).toBe('colacion')
  })

  it('60 min fuera de ventana (09:00–10:00) → sin autoTag', () => {
    const s = mkTs(DAY, 9, 0)
    const e = mkTs(DAY, 10, 0)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses[0]!.autoTag).toBeUndefined()
  })

  it('20 min en ventana → sin autoTag (duración < mínimo 45 min)', () => {
    const s = mkTs(DAY, 13, 0)
    const e = mkTs(DAY, 13, 20)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses[0]!.autoTag).toBeUndefined()
  })

  it('100 min en ventana → sin autoTag (duración > máximo 90 min)', () => {
    const s = mkTs(DAY, 12, 30)
    const e = mkTs(DAY, 14, 10) // 100 min
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses[0]!.autoTag).toBeUndefined()
  })
})

describe('detectPauses — auto-tag colación (turno noche)', () => {
  it('60 min en ventana 00:30–03:30 → autoTag colacion', () => {
    const s = mkTs(DAY, 1, 30)
    const e = mkTs(DAY, 2, 30)
    const r = detectPauses([s, e], 'Turno noche')
    expect(r.pauses[0]!.autoTag).toBe('colacion')
  })

  it('mismo gap en turno día no detecta colacion nocturna', () => {
    const s = mkTs(DAY, 1, 30)
    const e = mkTs(DAY, 2, 30)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses[0]!.autoTag).toBeUndefined()
  })

  it('turno desconocido → sin autoTag aun con duración válida', () => {
    const s = mkTs(DAY, 13, 0)
    const e = mkTs(DAY, 14, 0)
    const r = detectPauses([s, e], 'Turno parcial')
    expect(r.pauses[0]!.autoTag).toBeUndefined()
  })
})

// ── Formato de pause ID ───────────────────────────────────────────────────────

describe('detectPauses — pause ID', () => {
  it('genera ID en formato p-HHMM-Xm', () => {
    const s = mkTs(DAY, 10, 30)
    const [, e] = mkGap(s, 600) // 10 min
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses[0]!.id).toBe('p-1030-10m')
  })

  it('IDs son únicos entre múltiples pausas', () => {
    const ts0 = mkTs(DAY, 9, 0)
    const ts1 = new Date(Date.parse(ts0) +  600_000).toISOString() // pausa 10 min
    const ts2 = new Date(Date.parse(ts1) +  300_000).toISOString() // pausa 5 min (en ventana)
    const ts3 = new Date(Date.parse(ts2) + 1800_000).toISOString() // larga 30 min
    const r = detectPauses([ts0, ts1, ts2, ts3], 'Turno día')
    const ids = r.pauses.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ── Auto-tag ejercicios ───────────────────────────────────────────────────────

describe('detectPauses — auto-tag ejercicios', () => {
  it('15 min a las 2.5h del inicio → autoTag ejercicios', () => {
    // Inicio turno 06:00, pausa 08:30–08:45 (2.5h después, 15 min)
    const start = mkTs(DAY, 6, 0)
    const s     = mkTs(DAY, 8, 30)
    const [, e] = mkGap(s, 900) // 15 min
    const r = detectPauses([start, s, e], 'Turno día')
    const pausa = r.pauses.find(p => p.startAt === s)
    expect(pausa?.autoTag).toBe('ejercicios')
  })

  it('15 min a las 1h del inicio → sin autoTag (muy temprano)', () => {
    const start = mkTs(DAY, 6, 0)
    const s     = mkTs(DAY, 7, 0)
    const [, e] = mkGap(s, 900)
    const r = detectPauses([start, s, e], 'Turno día')
    const pausa = r.pauses.find(p => p.startAt === s)
    expect(pausa?.autoTag).toBeUndefined()
  })

  it('40 min a las 2.5h → sin autoTag (duración fuera de rango)', () => {
    const start = mkTs(DAY, 6, 0)
    const s     = mkTs(DAY, 8, 30)
    const [, e] = mkGap(s, 2400) // 40 min → colación?? no (no en ventana), no ejercicios (>20min)
    const r = detectPauses([start, s, e], 'Turno día')
    const pausa = r.pauses.find(p => p.startAt === s)
    expect(pausa?.autoTag).toBeUndefined()
  })

  it('gap 60 min en ventana colación → colación (no ejercicios: dur fuera de rango 10-20m)', () => {
    // Los rangos de duración son mutuamente excluyentes: colación 45-90m, ejercicios 10-20m.
    // Un gap de 60 min a las 2.5h del turno está en ventana ejercicios (timing) pero
    // como no cumple la duración, no activa ejercicios — y sí activa colación.
    const s = mkTs(DAY, 13, 0)
    const e = mkTs(DAY, 14, 0) // 60 min → colación ✓, ejercicios ✗ (>20 min)
    // Solo 2 timestamps → shiftStartMs = 13:00, elapsed = 0 → ejercicios no aplica igual
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses[0]!.autoTag).toBe('colacion')
  })
})

// ── Auto-tag cambio_lote ──────────────────────────────────────────────────────

describe('detectPauses — auto-tag cambio_lote', () => {
  it('pausa dentro de ±15 min de un cambio de lote → autoTag cambio_lote', () => {
    const s = mkTs(DAY, 10, 0)
    const [, e] = mkGap(s, 600) // 10 min
    // Cambio de lote a las 10:05 (dentro de la ventana ±15 min del inicio 10:00)
    const loteChange = Date.parse(mkTs(DAY, 10, 5))
    const r = detectPauses([s, e], 'Turno día', [loteChange])
    expect(r.pauses[0]!.autoTag).toBe('cambio_lote')
  })

  it('pausa fuera de ±15 min del cambio de lote → sin autoTag', () => {
    const s = mkTs(DAY, 10, 0)
    const [, e] = mkGap(s, 600)
    const loteChange = Date.parse(mkTs(DAY, 11, 0)) // 60 min después
    const r = detectPauses([s, e], 'Turno día', [loteChange])
    expect(r.pauses[0]!.autoTag).toBeUndefined()
  })

  it('sin loteChangeTsMs → sin autoTag cambio_lote', () => {
    const s = mkTs(DAY, 10, 0)
    const [, e] = mkGap(s, 600)
    const r = detectPauses([s, e], 'Turno día')
    expect(r.pauses[0]!.autoTag).toBeUndefined()
  })
})

// ── collectSortedTimestamps ───────────────────────────────────────────────────

describe('collectSortedTimestamps', () => {
  it('combina dos arrays y ordena ascendentemente', () => {
    const a = [{ ts: mkTs(DAY, 10, 5) }, { ts: mkTs(DAY, 10, 1) }]
    const b = [{ ts: mkTs(DAY, 10, 3) }]
    const result = collectSortedTimestamps(a, b)
    expect(result).toEqual([
      mkTs(DAY, 10, 1),
      mkTs(DAY, 10, 3),
      mkTs(DAY, 10, 5),
    ])
  })

  it('filtra registros sin campo ts', () => {
    const a = [{ ts: mkTs(DAY, 10, 0) }, {}]
    const result = collectSortedTimestamps(a)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(mkTs(DAY, 10, 0))
  })

  it('funciona con segundo argumento omitido', () => {
    const a = [{ ts: mkTs(DAY, 10, 0) }]
    expect(collectSortedTimestamps(a)).toHaveLength(1)
  })

  it('devuelve array vacío si ambas entradas están vacías', () => {
    expect(collectSortedTimestamps([], [])).toHaveLength(0)
  })
})

// ── M16 — PauseDetectorConfig override ───────────────────────────────────────

describe('detectPauses — cfg override (M16)', () => {
  it('cfg.microMaxSec eleva el umbral micro → gaps antes en tier pausa', () => {
    // Sin cfg: gap 200s → micro (microMax default = 300s). Con cfg microMaxSec=100 → pausa
    const [s, e] = mkGap(mkTs(DAY, 9, 0), 200)
    const r = detectPauses([s, e], 'Turno día', [], { microMaxSec: 100 })
    expect(r.pauses).toHaveLength(1)
    expect(r.pauses[0]!.tier).toBe('pausa')
    expect(r.microDetentions.count).toBe(0)
  })

  it('cfg.microMaxSec más alto convierte pausas normales en micro', () => {
    // Gap 350s — default: pausa. Con cfg microMaxSec=400 → micro
    const [s, e] = mkGap(mkTs(DAY, 9, 0), 350)
    const r = detectPauses([s, e], 'Turno día', [], { microMaxSec: 400 })
    expect(r.pauses).toHaveLength(0)
    expect(r.microDetentions.count).toBe(1)
  })

  it('cfg.pausaMaxSec desplaza el límite pausa/larga', () => {
    // Gap 600s — default: pausa (<1800s). Con cfg pausaMaxSec=300 → larga
    const [s, e] = mkGap(mkTs(DAY, 9, 0), 600)
    const r = detectPauses([s, e], 'Turno día', [], { pausaMaxSec: 300 })
    expect(r.pauses[0]!.tier).toBe('larga')
  })

  it('cfg.largaMaxSec desplaza el límite larga/parada', () => {
    // Gap 2000s — default: larga (1800-3600). Con cfg largaMaxSec=1500 → parada
    const [s, e] = mkGap(mkTs(DAY, 9, 0), 2000)
    const r = detectPauses([s, e], 'Turno día', [], { largaMaxSec: 1500 })
    expect(r.pauses[0]!.tier).toBe('parada')
  })

  it('cfg.colacionMinMin/colacionMaxMin estrecha la ventana de duración', () => {
    // Gap 50 min en ventana 12:30-14:30 — default: colación (45-90 min). Con cfg min=60 → sin autoTag
    const s = mkTs(DAY, 13, 0)
    const [, e] = mkGap(s, 50 * 60)
    const r = detectPauses([s, e], 'Turno día', [], { colacionMinMin: 60, colacionMaxMin: 90 })
    expect(r.pauses[0]!.autoTag).toBeUndefined()
  })

  it('cfg.colacionWindowDia sobreescribe la ventana de colación para turno día', () => {
    // Ventana custom 10:00-12:00; gap 60 min en 10:30 → autoTag colacion
    const s = mkTs(DAY, 10, 30)
    const [, e] = mkGap(s, 60 * 60)
    const r = detectPauses([s, e], 'Turno día', [], {
      colacionWindowDia: { start: 10 * 60, end: 12 * 60 },
    })
    expect(r.pauses[0]!.autoTag).toBe('colacion')
  })

  it('cfg.colacionWindowDia custom NO activa colación en la ventana default 12:30-14:30', () => {
    // Sin el override la ventana default habría detectado colación a las 13:00
    const s = mkTs(DAY, 13, 0)
    const [, e] = mkGap(s, 60 * 60)
    const r = detectPauses([s, e], 'Turno día', [], {
      colacionWindowDia: { start: 10 * 60, end: 12 * 60 },
    })
    // 13:00 queda fuera de la ventana custom (10:00-12:00) → sin autoTag
    expect(r.pauses[0]!.autoTag).toBeUndefined()
  })

  it('cfg.colacionWindowNoche sobreescribe la ventana de colación para turno noche', () => {
    // Ventana custom noche 22:00-00:00 (1320-0); gap 60 min en 22:30
    const s = mkTs(DAY, 22, 30)
    const [, e] = mkGap(s, 60 * 60)
    const r = detectPauses([s, e], 'Turno noche', [], {
      colacionWindowNoche: { start: 22 * 60, end: 24 * 60 },
    })
    expect(r.pauses[0]!.autoTag).toBe('colacion')
  })
})
