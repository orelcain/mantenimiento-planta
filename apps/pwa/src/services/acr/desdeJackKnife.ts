/**
 * Un análisis de causa raíz que nace desde una detención del Jack-Knife (no desde un evento de
 * la Bitácora). Sin cambiar reglas: `eventoBitacoraIds` guarda una referencia con prefijo `jk:`,
 * y `eventoDesdeDetencion` / `eventoRefDesdeAcr` arman el mismo `EventoRefAcr` en los dos sentidos.
 * Spec: spec-acr-ronda2.md §3.
 */
import type { TurnoJK } from '@/services/shoplogix/jackKnife'
import type { Acr, EventoRefAcr } from './acr.types'

const PREFIJO_JK = 'jk:'

/** Una detención de una causa en la ventana del Jack-Knife. */
export interface DetencionJK {
  turnoId: string
  dateKey: string
  shiftId: string
  inicioMs: number
  min: number
  /** Comentario del operador para esa detención (mismo inicio ±60 s), o null. */
  comentario: string | null
}

/** Tolerancia entre el inicio de una detención y el de su comentario. */
const TOLERANCIA_MS = 60_000

/** `true` si la referencia guardada en `eventoBitacoraIds` es de una detención del Jack-Knife. */
export function esEventoJK(id: string): boolean {
  return id.startsWith(PREFIJO_JK)
}

/**
 * Las detenciones de `causa` entre `desde` y `hasta` (índices de `turnos`, ambos incluidos),
 * de la más larga a la más corta.
 */
export function detencionesDeCausa(
  turnos: readonly TurnoJK[],
  desde: number,
  hasta: number,
  causa: string,
): DetencionJK[] {
  const out: DetencionJK[] = []
  for (const t of turnos.slice(desde, hasta + 1)) {
    const comentarios = t.resumen.comentarios.filter(([c]) => c === causa)
    for (const [c, inicioMs, min] of t.resumen.eventos) {
      if (c !== causa) continue
      out.push({
        turnoId: t.id,
        dateKey: t.dateKey,
        shiftId: t.shiftId,
        inicioMs,
        min,
        comentario: comentarioCercano(comentarios, inicioMs),
      })
    }
  }
  return out.sort((a, b) => b.min - a.min)
}

/** El comentario de la causa cuyo inicio está a menos de 60 s; el más cercano si hay varios. */
function comentarioCercano(
  comentarios: readonly [string, number, string][],
  inicioMs: number,
): string | null {
  let mejor: { texto: string; delta: number } | null = null
  for (const [, ms, texto] of comentarios) {
    const delta = Math.abs(ms - inicioMs)
    if (delta < TOLERANCIA_MS && (mejor === null || delta < mejor.delta)) mejor = { texto, delta }
  }
  return mejor?.texto ?? null
}

/** El evento de referencia de una detención del Jack-Knife (se guarda como `jk:<planta>:<turno>:<inicio>`). */
export function eventoDesdeDetencion(planta: string, d: DetencionJK, causa: string): EventoRefAcr {
  return {
    id: `${PREFIJO_JK}${planta}:${d.turnoId}:${d.inicioMs}`,
    tipo: 'correctivo',
    turnoId: d.turnoId,
    fechaTurno: d.dateKey,
    equipo: causa,
    descripcion: d.comentario ?? '',
    minutosParada: Math.round(d.min),
    fotos: [],
  }
}

/** Reconstruye el evento de referencia desde un ACR creado desde el Jack-Knife. */
export function eventoRefDesdeAcr(acr: Acr): EventoRefAcr {
  const id = acr.eventoBitacoraIds[0] ?? ''
  // `jk:<planta>:<turnoId>:<inicioMs>`: el turnoId no lleva dos puntos.
  const turnoId = id.split(':')[2] ?? ''
  return {
    id,
    tipo: 'correctivo',
    turnoId,
    fechaTurno: acr.fechaTurno,
    equipo: acr.equipo,
    descripcion: acr.definicion,
    minutosParada: acr.minutosDetencion,
    fotos: [],
  }
}
