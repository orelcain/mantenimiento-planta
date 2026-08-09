import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import type { GraderDailySummary } from '@/services/grader/types'
import type { LatestShift } from '@/services/grader/turnoKpis'

/**
 * Datos SINTÉTICOS para el piloto de la piel, activados solo con `?fixture=1`.
 *
 * Por qué existe: verificar una pantalla contra Firestore exige sesión iniciada,
 * y eso bloqueó dos veces la revisión visual de la piel (además de la
 * restricción de referrer de la API key por puerto). Con esto, cualquiera —o
 * cualquier agente— puede abrir la pantalla y juzgar el diseño sin credenciales.
 *
 * ⚠️ REGLA: la pantalla muestra un banner rojo permanente mientras el fixture
 * está activo. El repo ya tuvo el problema de cifras demo confundidas con
 * cifras reales (turnos en temporada baja mostrando 11.203 ciclos falsos), así
 * que acá los datos sintéticos NUNCA pueden pasar por reales: sin banner, no va.
 *
 * Los valores imitan un turno con problema para ejercitar el peor caso del
 * diseño: una máquina detenida AHORA, nombres largos y un equipo sin actividad.
 */
export const FIXTURE_PARAM = 'fixture'

function mkMachine(
  name: string,
  cycles: number,
  uptimeSec: number,
  downtimeSec: number,
  current: 'uptime' | 'downtime' | null,
  reason = '',
): UpstreamMachineShift {
  const now = Date.now()
  const states = [
    {
      startAt: new Date(now - 6 * 3600e3),
      endAt: new Date(now - 900e3),
      durationSec: uptimeSec,
      type: 'uptime' as const,
      name: 'Produciendo',
      reason: '',
      color: '',
      isCurrent: current === 'uptime',
    },
    {
      startAt: new Date(now - 5 * 3600e3),
      endAt: new Date(now - 4.5 * 3600e3),
      durationSec: 1800,
      type: 'break' as const,
      name: 'Pausa',
      reason: 'COLACION',
      color: '',
      isCurrent: false,
    },
    {
      startAt: new Date(now - 900e3),
      endAt: new Date(now),
      durationSec: downtimeSec,
      type: 'downtime' as const,
      name: 'Detencion',
      reason,
      color: '',
      isCurrent: current === 'downtime',
    },
  ]
  return {
    machineid: name.toLowerCase().replace(/\s+/g, '-'),
    machineName: name,
    machineType: 'evisceradora',
    dateKey: '2026-08-09',
    shiftId: 'Turno día',
    shiftStart: new Date(now - 6 * 3600e3),
    shiftEnd: new Date(now + 6 * 3600e3),
    totalCycles: cycles,
    expectedTotalCycles: Math.round(cycles * 1.28),
    totalPieces: cycles,
    overallRatio: 0.78,
    shiftRuntime: uptimeSec + downtimeSec,
    shiftRuntimeBreakdown: {
      uptimeSec,
      breakSec: 1800,
      plannedDowntimeSec: 0,
      downtimeSec,
      setupSec: 600,
      totalTrackedSec: uptimeSec + downtimeSec + 2400,
    },
    // `performanceISO` se calcula desde los INTERVALOS, no desde los totales:
    // sin ellos el Rendimiento sale 0 y arrastra el OEE a 0 (pasó al construir
    // este fixture). Se reparten los ciclos en 6 bloques horarios.
    intervals: Array.from({ length: 6 }, (_, i) => ({
      start: new Date(now - (6 - i) * 3600e3),
      end: new Date(now - (5 - i) * 3600e3),
      cycles: Math.round(cycles / 6),
      expectedCycles: Math.round((cycles / 6) * 1.28),
      shift: 'Turno día',
    })),
    states,
  } as unknown as UpstreamMachineShift
}

export function fixtureShift(): LatestShift {
  return {
    dateKey: '2026-08-09',
    shiftId: 'Turno día',
    machines: [
      mkMachine('Baader 142 N°2', 4820, 12800, 780, 'downtime', 'FALLA MOTOR ELEVADOR'),
      mkMachine('Grader MS4/12', 12480, 15600, 320, 'uptime'),
      mkMachine('Baader 200', 6210, 15100, 180, 'uptime'),
      mkMachine('Knuro', 0, 0, 0, null),
    ],
  }
}

export function fixtureSummary(): GraderDailySummary {
  return {
    id: '2026-08-09__Turno día',
    dateKey: '2026-08-09',
    shiftId: 'Turno día',
    totalPieces: 12480,
    pointZeroPieces: 399,
    pointZeroPct: 3.2,
  } as unknown as GraderDailySummary
}
