import { describe, it, expect } from 'vitest';
import {
  colorFromRatio,
  normalizeInterval,
  normalizeState,
  normalizeShift,
  buildLineSnapshot,
  effectiveProductionWindow,
  shouldFrameOnProduction,
} from '../shoplogixNormalizer';
import type {
  ShoplogixProductionMachine,
  ShoplogixSummaryMachine,
  ShoplogixMachineState,
} from '../types';
import { CHONCHI_EVISCERADORAS } from '../shoplogixMachines';

// ── Helpers ───────────────────────────────────────────────────────────────

const EV1_ID = CHONCHI_EVISCERADORAS[0]!.machineid;

function buildRawProduction(overrides: Partial<ShoplogixProductionMachine> = {}): ShoplogixProductionMachine {
  return {
    machineId: EV1_ID,
    machineName: 'Evisceradora 1',
    comments: [],
    currentShiftStart: '20260226T090000.000',
    currentShiftEnd:   '20260226T181500.000',
    finishedGoodUnits: '',
    inventoryUnits: '',
    lineUnits: '',
    machineProduction: [],
    productionUnits: 'Eviscerado',
    threshold: 15,
    time: '20260226T090000.000',
    ...overrides,
  };
}

function buildRawSummary(overrides: Partial<ShoplogixSummaryMachine> = {}): ShoplogixSummaryMachine {
  return {
    machineId: EV1_ID,
    machineName: 'Evisceradora 1',
    time: '20260226T090000.000',
    threshold: 15,
    finishedGoodUnits: '',
    inventoryUnits: '',
    lineUnits: '',
    productionUnits: 'Eviscerado',
    productionMachine: true,
    currentShiftStart: '20260226T090000.000',
    currentShiftEnd:   '20260226T181500.000',
    runtimeVariance: 0,
    expectedRuntime: 0.1,
    actualRuntime: 0.1,
    machineStates: [],
    comments: [],
    cameras: [],
    autoEnforceStatusReasons: false,
    ...overrides,
  };
}

// ── colorFromRatio ────────────────────────────────────────────────────────

describe('colorFromRatio', () => {
  it('verde cuando ratio >= 1 - threshold/100', () => {
    expect(colorFromRatio(1.0, true, 15)).toBe('green');
    expect(colorFromRatio(0.9, true, 15)).toBe('green');     // 0.9 >= 0.85
    expect(colorFromRatio(0.85, true, 15)).toBe('green');
  });

  it('amarillo cuando ratio está a medio camino', () => {
    // greenCutoff = 0.85, halfCutoff = 0.425
    expect(colorFromRatio(0.5, true, 15)).toBe('yellow');
    expect(colorFromRatio(0.84, true, 15)).toBe('yellow');
  });

  it('rojo cuando ratio < halfCutoff', () => {
    expect(colorFromRatio(0.3, true, 15)).toBe('red');
    expect(colorFromRatio(0.01, true, 15)).toBe('red');
  });

  it('rojo cuando ratio exactamente 0 pero hubo expected', () => {
    expect(colorFromRatio(0, true, 15)).toBe('red');
  });

  it('gray cuando no hubo expected (máquina no producía en ese rango)', () => {
    expect(colorFromRatio(0, false, 15)).toBe('gray');
    expect(colorFromRatio(2, false, 15)).toBe('gray');       // defensivo
  });

  it('threshold 0 → solo ratio >= 1 es verde', () => {
    expect(colorFromRatio(1.0, true, 0)).toBe('green');
    expect(colorFromRatio(0.99, true, 0)).toBe('yellow');
  });
});

// ── normalizeInterval ─────────────────────────────────────────────────────

describe('normalizeInterval', () => {
  it('calcula startAt/endAt desde totalDuration', () => {
    const start = new Date('2026-02-26T09:00:00.000Z');
    const interval = normalizeInterval(
      { cycles: 50, expectedCycles: 100, total: 50, expectedTotal: 100, totalDuration: 300000 },
      start,
      15,
    );
    expect(interval.startAt.toISOString()).toBe('2026-02-26T09:00:00.000Z');
    expect(interval.endAt.toISOString()).toBe('2026-02-26T09:05:00.000Z');
  });

  it('calcula ratio = cycles / expectedCycles', () => {
    const r = normalizeInterval(
      { cycles: 50, expectedCycles: 100, total: 50, expectedTotal: 100, totalDuration: 300000 },
      new Date(), 15,
    );
    expect(r.ratio).toBe(0.5);
  });

  it('ratio 0 cuando expectedCycles es 0 (evita NaN)', () => {
    const r = normalizeInterval(
      { cycles: 0, expectedCycles: 0, total: 0, expectedTotal: 0, totalDuration: 300000 },
      new Date(), 15,
    );
    expect(r.ratio).toBe(0);
    expect(r.color).toBe('gray');
  });

  it('ratio puede ser > 1 (sobre-producción)', () => {
    const r = normalizeInterval(
      { cycles: 120, expectedCycles: 100, total: 120, expectedTotal: 100, totalDuration: 300000 },
      new Date(), 15,
    );
    expect(r.ratio).toBe(1.2);
    expect(r.color).toBe('green');
  });
});

// ── normalizeState ────────────────────────────────────────────────────────

describe('normalizeState', () => {
  it('parsea Produciendo (Uptime, verde) correctamente', () => {
    const raw: ShoplogixMachineState = {
      name: 'Produciendo',
      reason: '',
      reasonRootCause: false,
      reasonRootCauseName: '',
      statusColor: '008000',
      reasonColor: '',
      acceptsReason: false,
      reasonExceeded: false,
      setupExceeded: false,
      type: 'Uptime',
      current: false,
      start: '20260226T091734.933',
      end:   '20260226T092319.916',
      startMilli: 1772097454933,
      endMilli:   1772097799916,
      durationMilli: 344983,
    };
    const st = normalizeState(raw);
    expect(st.name).toBe('Produciendo');
    expect(st.type).toBe('uptime');
    expect(st.color).toBe('#008000');
    expect(st.durationSec).toBe(345);  // 344983 / 1000 redondeado
    expect(st.startAt.toISOString()).toBe('2026-02-26T09:17:34.933Z');
  });

  it('parsea Detencion con reason', () => {
    const raw: ShoplogixMachineState = {
      name: 'Detencion', reason: 'COLACION',
      reasonRootCause: false, reasonRootCauseName: '',
      statusColor: 'ff0000', reasonColor: '313F4B',
      acceptsReason: true, reasonExceeded: false, setupExceeded: false,
      type: 'Break', current: false,
      start: '20260226T123000.000', end: '20260226T133000.000',
      startMilli: 0, endMilli: 0, durationMilli: 3600000,
    };
    const st = normalizeState(raw);
    expect(st.type).toBe('break');
    expect(st.reason).toBe('COLACION');
    expect(st.color).toBe('#ff0000');
    expect(st.durationSec).toBe(3600);
  });

  it('marca isCurrent cuando current es true', () => {
    const raw: ShoplogixMachineState = {
      name: 'Produciendo', reason: '',
      reasonRootCause: false, reasonRootCauseName: '',
      statusColor: '008000', reasonColor: '',
      acceptsReason: false, reasonExceeded: false, setupExceeded: false,
      type: 'Uptime', current: true,
      start: '20260226T150000.000', end: '20260226T151500.000',
      startMilli: 0, endMilli: 0, durationMilli: 900000,
    };
    expect(normalizeState(raw).isCurrent).toBe(true);
  });

  it('fallback color gris cuando statusColor vacío o inválido', () => {
    const raw: ShoplogixMachineState = {
      name: 'Detencion', reason: '',
      reasonRootCause: false, reasonRootCauseName: '',
      statusColor: '', reasonColor: '',
      acceptsReason: false, reasonExceeded: false, setupExceeded: false,
      type: 'Downtime', current: false,
      start: '20260226T090000.000', end: '20260226T091500.000',
      startMilli: 0, endMilli: 0, durationMilli: 900000,
    };
    expect(normalizeState(raw).color).toBe('#64748b');
  });

  it('mapea type desconocido a downtime (defensivo)', () => {
    const raw: ShoplogixMachineState = {
      name: 'Estado nuevo', reason: '',
      reasonRootCause: false, reasonRootCauseName: '',
      statusColor: '000000', reasonColor: '',
      acceptsReason: false, reasonExceeded: false, setupExceeded: false,
      type: 'AlgoNuevo' as unknown as string, current: false,
      start: '20260226T090000.000', end: '20260226T091500.000',
      startMilli: 0, endMilli: 0, durationMilli: 900000,
    };
    expect(normalizeState(raw).type).toBe('downtime');
  });
});

// ── normalizeShift ────────────────────────────────────────────────────────

describe('normalizeShift', () => {
  it('combina production + summary en un shift válido', () => {
    const production = buildRawProduction({
      machineProduction: [
        { cycles: 50, expectedCycles: 100, total: 50,  expectedTotal: 100, totalDuration: 300000 },
        { cycles: 80, expectedCycles: 100, total: 130, expectedTotal: 200, totalDuration: 300000 },
      ],
    });
    const summary = buildRawSummary({
      actualRuntime: 0.95, expectedRuntime: 1.0, runtimeVariance: -0.05,
      machineStates: [
        {
          name: 'Produciendo', reason: '',
          reasonRootCause: false, reasonRootCauseName: '',
          statusColor: '008000', reasonColor: '',
          acceptsReason: false, reasonExceeded: false, setupExceeded: false,
          type: 'Uptime', current: false,
          start: '20260226T090000.000', end: '20260226T095000.000',
          startMilli: 0, endMilli: 0, durationMilli: 3000000,
        },
      ],
    });

    const shift = normalizeShift({
      production, summary,
      dateKey: '2026-02-26', shiftId: 'Turno día',
    });

    expect(shift.machineid).toBe(EV1_ID);
    expect(shift.machineType).toBe('baader_142');      // desde registry
    expect(shift.intervals).toHaveLength(2);
    expect(shift.states).toHaveLength(1);
    expect(shift.totalCycles).toBe(130);
    expect(shift.expectedTotalCycles).toBe(200);
    expect(shift.totalPieces).toBe(130);                // último interval.total
    expect(shift.overallRatio).toBe(0.65);
    expect(shift.source).toBe('shoplogix');
  });

  it('tira error si machineId no coincide entre production y summary', () => {
    const production = buildRawProduction({ machineId: 'A' });
    const summary    = buildRawSummary({ machineId: 'B' });
    expect(() => normalizeShift({
      production, summary, dateKey: '2026-02-26', shiftId: 'Turno día',
    })).toThrow(/machineId mismatch/);
  });

  it('default machineType "other" si no está en registry', () => {
    const unknownId = '00000000-0000-0000-0000-000000000000';
    const shift = normalizeShift({
      production: buildRawProduction({ machineId: unknownId, machineName: 'Máquina X' }),
      summary:    buildRawSummary({ machineId: unknownId, machineName: 'Máquina X' }),
      dateKey: '2026-02-26', shiftId: 'Turno día',
    });
    expect(shift.machineType).toBe('other');
  });

  it('intervalos consecutivos están espaciados 5 min', () => {
    const shift = normalizeShift({
      production: buildRawProduction({
        machineProduction: [
          { cycles: 0, expectedCycles: 0, total: 0, expectedTotal: 0, totalDuration: 300000 },
          { cycles: 0, expectedCycles: 0, total: 0, expectedTotal: 0, totalDuration: 300000 },
          { cycles: 0, expectedCycles: 0, total: 0, expectedTotal: 0, totalDuration: 300000 },
        ],
      }),
      summary: buildRawSummary(),
      dateKey: '2026-02-26', shiftId: 'Turno día',
    });
    const deltas = shift.intervals.slice(1).map(
      (it, i) => it.startAt.getTime() - shift.intervals[i]!.startAt.getTime(),
    );
    expect(deltas).toEqual([5 * 60 * 1000, 5 * 60 * 1000]);
  });

  // ── Planned Downtime (post-shift) ─────────────────────────────────────────
  // Fixture representativo de Feb 26 Turno día: ventana consulta 09:00-22:00 (13h).
  // "Planned Downtime" = estado post-turno (17:15-21:30 = 255 min).
  // Debe separarse de breakSec y excluirse del denominador de shiftRuntime.
  it('Planned Downtime se separa de breakSec y se excluye del denominador', () => {
    const UPTIME_MS       = 6 * 3600 * 1000        // 6h produciendo (360 min)
    const BREAK_MS        = 72 * 60 * 1000          // 72 min Colación
    const PLANNED_DT_MS   = 255 * 60 * 1000         // 255 min post-turno (Planned Downtime)
    const DOWNTIME_MS     = 39 * 60 * 1000          // 39 min Limpieza de Ducto
    const TOTAL_MS        = UPTIME_MS + BREAK_MS + PLANNED_DT_MS + DOWNTIME_MS
    const PRODUCTIVE_MS   = TOTAL_MS - PLANNED_DT_MS

    const summary = buildRawSummary({
      machineStates: [
        // Colación — break normal, dentro del turno
        {
          name: 'Detencion', reason: 'COLACION',
          reasonRootCause: false, reasonRootCauseName: '',
          statusColor: 'ff0000', reasonColor: '',
          acceptsReason: true, reasonExceeded: false, setupExceeded: false,
          type: 'Break', current: false,
          start: '20260226T120000.000', end: '20260226T131200.000',
          startMilli: 0, endMilli: 0, durationMilli: BREAK_MS,
        },
        // Produciendo
        {
          name: 'Produciendo', reason: '',
          reasonRootCause: false, reasonRootCauseName: '',
          statusColor: '008000', reasonColor: '',
          acceptsReason: false, reasonExceeded: false, setupExceeded: false,
          type: 'Uptime', current: false,
          start: '20260226T091700.000', end: '20260226T171500.000',
          startMilli: 0, endMilli: 0, durationMilli: UPTIME_MS,
        },
        // Limpieza de Ducto — downtime
        {
          name: 'Detencion', reason: 'Limpieza de Ducto',
          reasonRootCause: false, reasonRootCauseName: '',
          statusColor: '0000ff', reasonColor: '',
          acceptsReason: true, reasonExceeded: false, setupExceeded: false,
          type: 'Downtime', current: false,
          start: '20260226T145000.000', end: '20260226T152900.000',
          startMilli: 0, endMilli: 0, durationMilli: DOWNTIME_MS,
        },
        // Planned Downtime — post-turno. Tipo Break en Shoplogix.
        {
          name: 'Detencion', reason: 'Planned Downtime',
          reasonRootCause: false, reasonRootCauseName: '',
          statusColor: 'aaaaaa', reasonColor: '',
          acceptsReason: false, reasonExceeded: false, setupExceeded: false,
          type: 'Break', current: false,
          start: '20260226T171500.000', end: '20260226T213000.000',
          startMilli: 0, endMilli: 0, durationMilli: PLANNED_DT_MS,
        },
      ],
    });

    const shift = normalizeShift({
      production: buildRawProduction(),
      summary,
      dateKey: '2026-02-26', shiftId: 'Turno día',
    });

    const bd = shift.shiftRuntimeBreakdown;
    // plannedDowntimeSec separado y correcto
    expect(bd.plannedDowntimeSec).toBe(PLANNED_DT_MS / 1000);
    // breakSec solo incluye breaks DENTRO del turno (Colación)
    expect(bd.breakSec).toBe(BREAK_MS / 1000);
    // totalTrackedSec incluye TODO (inclusive post-turno)
    expect(bd.totalTrackedSec).toBe(TOTAL_MS / 1000);
    // shiftRuntime excluye planned DT del denominador → uptimeSec / productiveSec
    expect(shift.shiftRuntime).toBeCloseTo(UPTIME_MS / PRODUCTIVE_MS, 4);
    // Verifica que el resultado es distinto de uptime/total (sin la corrección sería ~0.623)
    const wrongFormula = UPTIME_MS / TOTAL_MS;
    expect(shift.shiftRuntime).not.toBeCloseTo(wrongFormula, 3);
  });
});

// ── buildLineSnapshot ─────────────────────────────────────────────────────

describe('buildLineSnapshot', () => {
  it('agrega 3 máquinas en un snapshot de línea', () => {
    const mkShift = (id: string, name: string, cycles: number, expected: number, runtime: number) =>
      normalizeShift({
        production: buildRawProduction({
          machineId: id, machineName: name,
          machineProduction: [{ cycles, expectedCycles: expected, total: cycles, expectedTotal: expected, totalDuration: 3600000 }],
        }),
        summary: buildRawSummary({
          machineId: id, machineName: name,
          actualRuntime: runtime, expectedRuntime: 1,
        }),
        dateKey: '2026-02-26', shiftId: 'Turno día',
      });

    const machines = [
      mkShift('a', 'Evisceradora 1', 1000, 1200, 0.9),
      mkShift('b', 'Evisceradora 2',  900, 1200, 0.85),
      mkShift('c', 'Evisceradora 3', 1100, 1200, 0.95),
    ];

    const snap = buildLineSnapshot({
      dateKey: '2026-02-26', shiftId: 'Turno día', machines,
    });

    expect(snap.machines).toHaveLength(3);
    // El throughput se mide sobre la ventana REAL de operación (primera →
    // última pieza), no sobre la ventana del turno: acá hay un único intervalo
    // de 1 h con producción, así que 3000 piezas / 1 h.
    expect(snap.lineWindowSource).toBe('effective');
    expect(snap.lineWindowHours).toBeCloseTo(1, 2);
    expect(snap.lineThroughputActual).toBeCloseTo(3000, 1);
    expect(snap.lineThroughputExpected).toBeCloseTo(3600, 1);
    // lineAvailability ahora promedia `shiftRuntime` (calculado desde states),
    // no el `actualRuntime` opaco de Shoplogix. Las máquinas del test no tienen
    // states, por lo que el shiftRuntime resultante es 0.
    expect(snap.lineAvailability).toBe(0);
    expect(snap.machinesProducing).toBe(0);   // ningún state marcado como current
  });

  it('turno sin acotar (Filete): mide el ritmo sobre las horas reales, no sobre las 24 h', () => {
    // Caso real 2026-07-28: el área Filete no tiene el turno acotado en
    // Shoplogix, así que "Turno Dia" abarca 24 h. Dividir por la ventana del
    // turno daba 2 pz/h para un turno que produjo durante 1 h.
    const machine = normalizeShift({
      production: buildRawProduction({
        machineId: 'f1', machineName: 'Linea 1',
        machineProduction: [
          { cycles: 0,  expectedCycles: 0,  total: 0,  expectedTotal: 0,  totalDuration: 3600000, start: '20260728T080000.000' },
          { cycles: 60, expectedCycles: 90, total: 60, expectedTotal: 90, totalDuration: 3600000, start: '20260728T120000.000' },
          { cycles: 0,  expectedCycles: 0,  total: 60, expectedTotal: 90, totalDuration: 3600000, start: '20260728T230000.000' },
        ],
      }),
      summary: buildRawSummary({ machineId: 'f1', machineName: 'Linea 1' }),
      dateKey: '2026-07-28', shiftId: 'Turno Dia',
      shiftStartAt: new Date('2026-07-28T08:00:00.000Z'),
      shiftEndAt:   new Date('2026-07-29T08:00:00.000Z'),
    });

    const snap = buildLineSnapshot({ dateKey: '2026-07-28', shiftId: 'Turno Dia', machines: [machine] });

    expect(snap.lineWindowSource).toBe('effective');
    expect(snap.lineWindowHours).toBeCloseTo(1, 2);
    expect(snap.lineThroughputActual).toBeCloseTo(60, 1);   // NO 60/24 = 2.5
  });

  it('retorna throughput 0 si no hay máquinas', () => {
    const snap = buildLineSnapshot({ dateKey: '2026-02-26', shiftId: 'Turno día', machines: [] });
    expect(snap.lineThroughputActual).toBe(0);
    expect(snap.lineAvailability).toBe(0);
    expect(snap.machinesProducing).toBe(0);
  });
});

// ── Encuadre del eje temporal ────────────────────────────────────────────────

describe('effectiveProductionWindow / shouldFrameOnProduction', () => {
  const iv = (startISO: string, cycles: number) => ({
    startAt: new Date(startISO),
    endAt: new Date(new Date(startISO).getTime() + 5 * 60_000),
    cycles,
  })

  it('toma del primer al último tramo CON producción (ignora los vacíos)', () => {
    const w = effectiveProductionWindow([{ intervals: [
      iv('2026-07-28T08:00:00Z', 0),
      iv('2026-07-28T09:55:00Z', 5),
      iv('2026-07-28T16:05:00Z', 13),
      iv('2026-07-28T23:00:00Z', 0),
    ] }])!
    expect(w.start.toISOString()).toBe('2026-07-28T09:55:00.000Z')
    expect(w.end.toISOString()).toBe('2026-07-28T16:10:00.000Z')
  })

  it('sin producción no hay ventana real', () => {
    expect(effectiveProductionWindow([{ intervals: [iv('2026-07-28T08:00:00Z', 0)] }])).toBeNull()
    expect(effectiveProductionWindow([])).toBeNull()
  })

  it('abarca todas las máquinas de la línea', () => {
    const w = effectiveProductionWindow([
      { intervals: [iv('2026-05-08T15:00:00Z', 100)] },
      { intervals: [iv('2026-05-08T23:30:00Z', 80)] },
    ])!
    expect(w.start.toISOString()).toBe('2026-05-08T15:00:00.000Z')
    expect(w.end.toISOString()).toBe('2026-05-08T23:35:00.000Z')
  })

  it('encuadra en la producción cuando el turno es mucho más ancho (Filete: 6 h en 24 h)', () => {
    const shift = { start: new Date('2026-07-28T08:00:00Z'), end: new Date('2026-07-29T08:00:00Z') }
    const efe   = { start: new Date('2026-07-28T09:55:00Z'), end: new Date('2026-07-28T16:10:00Z') }
    expect(shouldFrameOnProduction(shift, efe)).toBe(true)
  })

  it('NO recorta el eje de un turno bien acotado (Yal: 8,6 h en 9,25 h)', () => {
    const shift = { start: new Date('2026-05-08T14:45:00Z'), end: new Date('2026-05-09T00:00:00Z') }
    const efe   = { start: new Date('2026-05-08T15:00:00Z'), end: new Date('2026-05-08T23:35:00Z') }
    expect(shouldFrameOnProduction(shift, efe)).toBe(false)
  })

  it('sin ventana de turno, la producción manda', () => {
    const efe = { start: new Date('2026-07-28T09:55:00Z'), end: new Date('2026-07-28T16:10:00Z') }
    expect(shouldFrameOnProduction(null, efe)).toBe(true)
    expect(shouldFrameOnProduction(null, null)).toBe(false)
  })
})
