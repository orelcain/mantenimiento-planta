/**
 * «Reloj de datos» del monitor de turno (DESIGN.md §8, excepción de movimiento).
 *
 * Lógica pura, sin React ni DOM: la usa `useRelojDeDatos` y la prueban los tests.
 *
 * ⚠ Es solo el RESPALDO de la cifra: cuando hay serie por minuto (todas las líneas, Filete incluido) el reloj de la pantalla es
 * la cola de reproducción (`reproduccionMinuto.ts`, spec `docs/SPEC_MONITOR_EN_VIVO_COLA.md`), que NO usa este módulo: ni el
 * tope de 90 s ni el corte de 180 s de aquí fijan su duración (la cola avanza a ×1 con desfase y se pone al día con un factor).
 * Esta recta queda para lo que no tiene serie por minuto (turno cerrado, serie ausente) y para su propia prueba.
 *
 * ── Qué hace ────────────────────────────────────────────────────────────────
 * Shoplogix entrega una lectura del contador cada ~1 min. Entre dos lecturas la
 * cifra grande y la punta de la curva avanzan en LÍNEA RECTA desde la lectura
 * anterior hasta la última, durante el intervalo que de verdad hubo entre ellas
 * (tope 90 s). Es reproducir con una lectura de retraso, no predecir:
 *
 *   · nunca se muestra un valor fuera de [anterior, última] (no se extrapola);
 *   · si la lectura siguiente se atrasa, todo se queda quieto en la última;
 *   · con «reducir movimiento» salta directo a cada lectura;
 *   · un hueco largo entre lecturas (> 3 min: pestaña dormida, sync caído) o un
 *     contador que baja (cambio de turno) NO se anima: salta, porque recorrer
 *     ese tramo en 90 s mostraría un ritmo que nunca existió.
 */

/** Lo más que dura la interpolación entre dos lecturas. */
export const TOPE_INTERVALO_MS = 90_000
/** Si no se puede medir el intervalo, el ritmo de sync de Shoplogix (~1 min). */
export const INTERVALO_DEFECTO_MS = 60_000
/** Más hueco que esto entre dos lecturas = no son vecinas: no se interpola. */
export const HUECO_MAX_MS = 180_000
/** Cuántas lecturas se recuerdan para saber si la línea paró. */
export const MEMORIA_LECTURAS = 8

export interface Lectura {
  /** El contador acumulado del turno. */
  valor: number
  /** Hora de la lectura (cualquier base: solo se usa la diferencia entre dos). null si no se sabe. */
  atMs: number | null
}

export interface EstadoReloj {
  previa: Lectura | null
  ultima: Lectura | null
  /** Reloj monotónico (performance.now) en que llegó la última lectura. */
  llegadaMs: number
  /** Cuánto dura la recta previa → última. 0 = sin interpolar. */
  duracionMs: number
  /** Valores de las últimas lecturas, la más nueva al final. */
  historial: number[]
}

export function relojInicial(semilla: number[] = []): EstadoReloj {
  return { previa: null, ultima: null, llegadaMs: 0, duracionMs: 0, historial: semilla.slice(-MEMORIA_LECTURAS) }
}

/** Duración de la recta entre dos lecturas vecinas: lo medido, con tope; 0 si no son vecinas. */
export function intervaloMedido(previa: Lectura, ultima: Lectura, llegadaPreviaMs: number, llegadaMs: number): number {
  const porHora = previa.atMs != null && ultima.atMs != null ? ultima.atMs - previa.atMs : NaN
  const porLlegada = llegadaPreviaMs > 0 ? llegadaMs - llegadaPreviaMs : NaN
  const medido = Number.isFinite(porHora) && porHora > 0 ? porHora : porLlegada
  if (!Number.isFinite(medido) || medido <= 0) return INTERVALO_DEFECTO_MS
  if (medido > HUECO_MAX_MS) return 0
  return Math.min(medido, TOPE_INTERVALO_MS)
}

/**
 * Registra una lectura nueva. Devuelve el mismo objeto si no trae nada nuevo
 * (mismo valor y misma hora), así el llamador puede comparar por identidad.
 */
export function registrarLectura(est: EstadoReloj, lectura: Lectura, llegadaMs: number): EstadoReloj {
  const u = est.ultima
  if (u && u.valor === lectura.valor && u.atMs === lectura.atMs) return est
  /* La primera lectura repite a la última de la semilla (el contador ya estaba entre las lecturas del doc): no se cuenta dos veces. */
  const repite = !u && est.historial[est.historial.length - 1] === lectura.valor
  const historial = repite ? est.historial : [...est.historial, lectura.valor].slice(-MEMORIA_LECTURAS)
  /* Primera lectura, o el contador bajó (otro turno, reconciliación): no hay recta que recorrer. */
  if (!u || lectura.valor < u.valor) {
    return { previa: null, ultima: lectura, llegadaMs, duracionMs: 0, historial: u ? [lectura.valor] : historial }
  }
  const duracionMs = intervaloMedido(u, lectura, est.llegadaMs, llegadaMs)
  return { previa: duracionMs > 0 ? u : null, ultima: lectura, llegadaMs, duracionMs, historial }
}

/** Qué fracción de la recta previa → última ya corrió (0..1). Sin recta, 1. */
export function fraccion(est: EstadoReloj, ahoraMs: number, reducido: boolean): number {
  if (reducido || !est.previa || est.duracionMs <= 0) return 1
  return Math.min(1, Math.max(0, (ahoraMs - est.llegadaMs) / est.duracionMs))
}

/** El valor a mostrar ahora: sobre la recta, jamás por encima de la última lectura. */
export function valorMostrado(est: EstadoReloj, ahoraMs: number, reducido: boolean): number | null {
  const u = est.ultima
  if (!u) return null
  const p = est.previa
  if (!p) return u.valor
  const v = p.valor + (u.valor - p.valor) * fraccion(est, ahoraMs, reducido)
  return Math.min(u.valor, Math.max(p.valor, v))
}

/** ¿Falta la lectura siguiente? Pasado este margen sobre la recta, la cifra está congelada en la última. */
export function lecturaAtrasada(est: EstadoReloj, ahoraMs: number): boolean {
  if (!est.ultima) return false
  return ahoraMs - est.llegadaMs > Math.max(est.duracionMs, INTERVALO_DEFECTO_MS) * 1.5
}

/** ¿Sigue corriendo la recta? (el hook apaga el cuadro por cuadro cuando ya no) */
export function interpolando(est: EstadoReloj, ahoraMs: number, reducido: boolean): boolean {
  return !!est.previa && est.duracionMs > 0 && !reducido && ahoraMs - est.llegadaMs < est.duracionMs
}

/**
 * Línea detenida por las lecturas: las dos últimas variaciones seguidas son cero
 * (hacen falta tres lecturas). Con menos historial no se puede afirmar.
 */
export function detenidaPorLecturas(historial: number[]): boolean {
  const n = historial.length
  if (n < 3) return false
  return historial[n - 1] === historial[n - 2] && historial[n - 2] === historial[n - 3]
}

/** Lecturas seguidas sin piezas al final del historial (0 si la última sumó). */
export function lecturasSinPiezas(historial: number[]): number {
  let k = 0
  for (let i = historial.length - 1; i > 0 && historial[i] === historial[i - 1]; i--) k++
  return k
}
