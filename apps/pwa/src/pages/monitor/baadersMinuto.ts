/**
 * Las filas de cada Baader de la tarjeta Ritmo (franja y detalle): piezas, último minuto contra su esperado y estado. Puro: sin
 * React, para que `RitmoBaaders.tsx` exporte solo componentes.
 */
import type { EstadoBaader } from './ejeTurno'
import { filasBaader, minutosVisibles } from './ejeTurno'
import type { EjeDatos } from './GraficoRitmoVivo'
import type { MonitorV2Props } from './MonitorV2'
import { paradasPorMaquina, segundosCubiertos } from './ritmoVivo'

/* «Mal» con `--rv-mal` (monitorGlass.css, también lo usa el gráfico): un tono que se distingue del ámbar en barras y puntos chicos. */
export const MAL = 'var(--rv-mal, var(--v2-mal))'
export const PUNTO_ESTADO: Record<EstadoBaader, string> = { andando: 'var(--v2-acento)', lenta: 'var(--v2-atento)', detenida: MAL, parcial: 'var(--v2-gris)', 'sin-dato': 'var(--v2-gris)' }
/** La palabra solo la llevan «lenta» y «detenida»: «parcial» y «sin dato» son puntos grises, sin palabra. */
export const TEXTO_ESTADO: Partial<Record<EstadoBaader, string>> = { lenta: 'var(--v2-atento-texto)', detenida: 'var(--v2-mal-texto)' }

// ── Las filas de cada Baader ─────────────────────────────────────────────────

export interface FilaBaader {
  id: string
  nombre: string
  piezas: number
  /** Piezas del último minuto cerrado y lo que daba esa Baader a su esperado. */
  ritmo: number | null
  esperado: number | null
  /** Promedio andando (el del doc del corte): solo cuando no hay serie por minuto. */
  promedio: number | null
  /** null = sin dato (no se acusa a la Baader de lo que no se sabe). */
  estado: EstadoBaader | null
  /** % de llenado de ese minuto normalizado por los segundos andando: la base del punto y la palabra. */
  llenado: number | null
  /** Segundos que esa Baader anduvo del último minuto cerrado (60 − paradas); null si no se sabe. */
  anduvoS: number | null
}

/** Debajo de esto el minuto no se anduvo entero: se dice cuántos segundos fueron (el número crudo no es de un minuto completo). */
export const ANDUVO_COMPLETO_S = 55

/**
 * Una fila por Baader: sus piezas, el último minuto cerrado contra su esperado (la serie por minuto de Shoplogix) y su
 * estado con la MISMA normalización que las filas Ev del gráfico (`filasBaader`: segundos andando, línea en cero = sin
 * dato). Una Baader parada ahora (pulso fresco) manda sobre lo que dijo su último minuto.
 *
 * Las piezas de cada Baader salen del contador vivo cuando suma lo mismo que la cifra grande (`repro.tope.porMaquina` ya
 * trae esa guarda: PSM solo la arma si `totalCycles === contador`); si no, del doc del corte (`m.piezas`). Así la cifra
 * de cada una y la de la línea cuentan del mismo momento.
 */
export function filasDeBaader(p: MonitorV2Props, e: EjeDatos | null): FilaBaader[] {
  const vivo = !p.cerrado
  const minuto = e?.minuto ?? null
  if (minuto && minuto.maquinas.length > 0) {
    const n = minutosVisibles(minuto.maquinas, p.cerrado)
    const celdas = n > 0 ? filasBaader(minuto, n, e?.paradasMaquina) : []
    const paradas = e?.paradasMaquina ? paradasPorMaquina(e.paradasMaquina) : null
    const delContador = p.repro?.tope?.porMaquina ?? null
    return minuto.maquinas.map((q) => {
      const m = p.maquinas.find((x) => x.name === q.nombre)
      const k = n - 1
      const hay = k >= 0 && k < q.cycles.length
      const fila = celdas.find((c) => c.id === q.id)
      let estado: EstadoBaader | null = vivo && hay ? fila?.celdas[k]?.estado ?? null : null
      if (vivo && m?.status === 'detenida') estado = 'detenida'
      const ini = Date.parse(minuto.desde) + k * 60_000
      const crudo = delContador?.[q.id]
      return {
        id: q.id, nombre: q.nombre,
        piezas: crudo != null && Number.isFinite(crudo) ? crudo : m?.piezas ?? q.cycles.reduce((a, b) => a + b, 0),
        ritmo: vivo && hay ? q.cycles[k] ?? 0 : null,
        esperado: q.esperado,
        promedio: m?.promedio ?? null,
        estado,
        llenado: vivo && hay ? fila?.llenados[k] ?? null : null,
        anduvoS: vivo && hay && paradas && Number.isFinite(ini) ? 60 - segundosCubiertos(paradas.todas.get(q.id), ini, ini + 60_000) : null,
      }
    })
  }
  return p.maquinas.map((m) => ({
    id: m.name, nombre: m.name, piezas: m.piezas, ritmo: null, esperado: null, promedio: m.promedio,
    estado: vivo && m.status === 'detenida' ? 'detenida' : null,
    llenado: null,
    anduvoS: null,
  }))
}

