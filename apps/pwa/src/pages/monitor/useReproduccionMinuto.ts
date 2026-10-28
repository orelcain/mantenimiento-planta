/**
 * Hook de la «reproducción del último minuto» (reglas y porqué en `reproduccionMinuto.ts` y DESIGN.md §8).
 *
 * Entrega el MISMO contrato que `useRelojDeDatos` (`reloj`), así la cifra grande y la punta de la curva no cambian de
 * código: solo que su valor sube un escalón por pieza en vez de una recta. Además deja el desglose por Baader en
 * `CuadroReloj.rep` y el minuto que se reproduce en `minuto`.
 *
 * No re-renderiza por cuadro: el estado vive en un ref y quien dibuja se suscribe con `alCuadro`. React se entera una
 * vez por minuto cerrado nuevo (`version`). El `requestAnimationFrame` corre solo mientras el minuto se reproduce
 * (≤ 90 s); el resto del tiempo no hay cuadro pendiente.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMovimientoReducido } from './ampliarHooks'
import {
  MIN_MS, cuadroRep, detenidaRep, minutosCerrados, registrarSerie, repInicial, reproduciendo,
  type EntradaRep, type EstadoRep, type MinutoMaq, type Tope,
} from './reproduccionMinuto'
import type { CuadroReloj, RelojDeDatos } from './useRelojDeDatos'

/** El minuto que se está reproduciendo, con sus horas en hora de planta. */
export interface MinutoVista {
  iniMs: number
  finMs: number
  maquinas: MinutoMaq[]
  /** Hora REAL (UTC) del pulso que trajo el minuto. */
  pulsoAtMs: number | null
  /** El minuto se anima; si no (primera vista, hueco, contador que bajó) cae entero al llegar. */
  animado: boolean
}

export interface Reproduccion {
  /** Hay serie por minuto y contador vivo: la cifra grande y las reglas siguen a la reproducción. */
  activa: boolean
  /** Contrato del reloj de datos de siempre (cifra, punta de la curva), con `rep` en cada cuadro. */
  reloj: RelojDeDatos
  /** El minuto en reproducción; cambia con `reloj.version`. */
  minuto: MinutoVista | null
  /** Lo que registra el contador vivo ahora (el techo de la reproducción). */
  tope: Tope | null
}

/** La reproducción del monitor, para quien la dibuja sin recibirla por props (tarjetas, reglas, nota). */
export const ReproduccionCtx = createContext<Reproduccion | null>(null)
export const useReproduccion = () => useContext(ReproduccionCtx)

const SIN_CUADRO: CuadroReloj = { valor: null, frac: 1, previa: null, ultima: null, atrasada: false }

export function useReproduccionMinuto(entrada: EntradaRep | null, limite: Tope | null): Reproduccion {
  const reducido = useMovimientoReducido()
  const reducidoRef = useRef(reducido)
  reducidoRef.current = reducido
  const est = useRef<EstadoRep>(repInicial())
  const entradaRef = useRef(entrada)
  entradaRef.current = entrada
  const limiteRef = useRef(limite)
  limiteRef.current = limite
  const subs = useRef(new Set<(c: CuadroReloj) => void>())
  const raf = useRef(0)
  const [version, setVersion] = useState(0)

  const cuadro = useCallback((): CuadroReloj => {
    const e = est.current
    if (e.cerrados < 1 || e.desdeMs == null) return SIN_CUADRO
    const c = cuadroRep(e, limiteRef.current, performance.now(), reducidoRef.current)
    const finMs = e.desdeMs + e.cerrados * MIN_MS
    return {
      valor: c.total,
      frac: c.frac,
      previa: e.duracionMs > 0 ? { valor: c.totalPiso, atMs: finMs - MIN_MS } : null,
      ultima: { valor: c.totalFinal, atMs: finMs },
      atrasada: c.atrasada,
      rep: c,
    }
  }, [])

  const emitir = useCallback(() => {
    const c = cuadro()
    subs.current.forEach((fn) => fn(c))
  }, [cuadro])

  const correr = useCallback(() => {
    cancelAnimationFrame(raf.current)
    const paso = () => {
      emitir()
      if (reproduciendo(est.current, performance.now(), reducidoRef.current)) raf.current = requestAnimationFrame(paso)
    }
    paso()
  }, [emitir])

  /* Un minuto cerrado nuevo: se registra ANTES de pintar y arranca la reproducción. Una lectura repetida no cambia nada. */
  const clave = entrada ? `${entrada.desdeMs}|${minutosCerrados(entrada)}|${entrada.maquinas.map((m) => m.id).join(',')}` : ''
  useLayoutEffect(() => {
    const en = entradaRef.current
    if (!en) {
      if (est.current.cerrados > 0) { est.current = repInicial(); setVersion((v) => v + 1); emitir() }
      return
    }
    const nuevo = registrarSerie(est.current, en, performance.now())
    if (nuevo === est.current) return
    est.current = nuevo
    setVersion((v) => v + 1)
    correr()
  }, [clave, correr, emitir])

  /* El contador vivo avanzó (tope nuevo) o se activó «reducir movimiento»: se vuelve a leer el cuadro. */
  const topeTotal = limite?.total ?? null
  useEffect(() => { emitir() }, [reducido, topeTotal, emitir])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const alCuadro = useCallback((fn: (c: CuadroReloj) => void) => {
    subs.current.add(fn)
    fn(cuadro())
    return () => { subs.current.delete(fn) }
  }, [cuadro])

  const detenida = detenidaRep(est.current)
  const reloj = useMemo<RelojDeDatos>(
    () => ({ cuadro, alCuadro, version, detenida, reducido }),
    [cuadro, alCuadro, version, detenida, reducido],
  )
  const activa = entrada != null && minutosCerrados(entrada) >= 1
  const minuto = useMemo<MinutoVista | null>(() => {
    const e = est.current
    if (!activa || e.cerrados < 1 || e.desdeMs == null) return null
    const finMs = e.desdeMs + e.cerrados * MIN_MS
    return { iniMs: finMs - MIN_MS, finMs, maquinas: e.minuto, pulsoAtMs: e.pulsoAtMs, animado: e.duracionMs > 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cambia con cada minuto registrado (`version`)
  }, [activa, version])

  /* El techo cambia con cada lectura nueva, no con cada render de la página: el contexto no se invalida por una identidad. */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- se rehace cuando cambia el total del contador vivo
  const tope = useMemo(() => limite, [topeTotal])
  return useMemo(() => ({ activa, reloj, minuto, tope }), [activa, reloj, minuto, tope])
}

/** ¿Está la reproducción atrasada ahora mismo? (lectura puntual, para la nota; el cuadro por cuadro no lo necesita). */
export const reproduccionAtrasada = (r: Reproduccion): boolean => r.reloj.cuadro().atrasada
