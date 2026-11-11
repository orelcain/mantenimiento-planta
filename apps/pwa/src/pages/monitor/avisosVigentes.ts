/**
 * Vigencia del aviso «falla que suele volver»: 30 min desde que terminó el paro,
 * contra el reloj de la planta (el doc del Monitor solo se reescribe cuando
 * cambia el turno, así que no basta con lo que dejó el backend).
 */
import type { FallaRepetidaAviso } from '@/services/shoplogix/publicShiftMonitor.service'

const VIGENCIA_MS = 30 * 60_000

/** Avisos todavía vigentes según el reloj de la planta. */
export function avisosVigentes(avisos: ReadonlyArray<FallaRepetidaAviso> | null | undefined, nowMs: number): FallaRepetidaAviso[] {
  const nowWall = nowMs - new Date(nowMs).getTimezoneOffset() * 60_000
  return (avisos ?? []).filter((a) => {
    const fin = Date.parse(a.finAt)
    return Number.isFinite(fin) && nowWall >= fin && nowWall - fin <= VIGENCIA_MS
  })
}

