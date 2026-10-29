/**
 * Hook de la «cola de reproducción» (reglas y porqué en `reproduccionMinuto.ts` y DESIGN.md §8).
 *
 * Entrega el MISMO contrato que `useRelojDeDatos` (`reloj`), así la cifra grande y la punta de la curva no cambian de
 * código: solo que su valor sube un escalón por pieza en vez de una recta. Además deja el desglose por Baader y el estado
 * del reloj en `CuadroReloj.rep` (`estado`, `atrasoS`, `factor`, `ultimaLecturaHHMM`, y por Baader `cadenciaS` y
 * `progreso`) y el minuto que corre en `minuto`.
 *
 * Es UN reloj: `cuadro()` es la única fuente del instante reproducido; todo lo que se mueve lo lee de ahí. No
 * re-renderiza por cuadro: el estado vive en un ref y quien dibuja se suscribe con `alCuadro`. React se entera cuando
 * cambia el minuto que corre o el estado del reloj (`version`: ~una vez por minuto). El `requestAnimationFrame` corre
 * mientras hay minutos por reproducir; con la cola vacía solo queda un temporizador para pasar a «atrasado».
 *
 * «Reducir movimiento»: el conteo sigue avanzando pieza a pieza (es dato); `reloj.reducido` lo lee la UI para apagar
 * lo que es adorno.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMovimientoReducido } from './ampliarHooks'
import {
  MIN_MS, avanzar, cuadroRep, detenidaRep, minutoEn, minutosCerrados, posicion, proximoCambioMs, registrarSerie, repInicial,
  reproduciendo,
  type EntradaRep, type EstadoRep, type EstadoVivo, type MinutoMaq, type Tope,
} from './reproduccionMinuto'
import type { CuadroReloj, RelojDeDatos } from './useRelojDeDatos'

/** El minuto que se está reproduciendo, con sus horas en hora de planta. */
export interface MinutoVista {
  iniMs: number
  finMs: number
  maquinas: MinutoMaq[]
  /** El minuto anterior (si ya hubo uno en esta serie): la cinta de 60 s lo necesita para pasar de un minuto al otro sin corte. */
  previo: MinutoMaq[] | null
  /** Hora REAL (UTC) del último pulso que trajo un minuto nuevo. */
  pulsoAtMs: number | null
  /** El reloj se mueve (hay minutos en cola); con la cola vacía el minuto queda quieto en su total. */
  animado: boolean
}

export interface Reproduccion {
  /** Hay serie por minuto y contador vivo: la cifra grande y las reglas siguen a la reproducción. */
  activa: boolean
  /** Contrato del reloj de datos de siempre (cifra, punta de la curva), con `rep` en cada cuadro. */
  reloj: RelojDeDatos
  /** El minuto que corre; cambia con `reloj.version`. */
  minuto: MinutoVista | null
  /** Lo que registra el contador vivo ahora (el techo de la reproducción). */
  tope: Tope | null
}

/** La reproducción del monitor, para quien la dibuja sin recibirla por props (tarjetas, reglas, nota, TV, Duelo). */
export const ReproduccionCtx = createContext<Reproduccion | null>(null)
export const useReproduccion = () => useContext(ReproduccionCtx)

const SIN_CUADRO: CuadroReloj = { valor: null, frac: 1, previa: null, ultima: null, atrasada: false }
const claveDe = (c: CuadroReloj) => (c.rep ? `${c.rep.minutoIdx}|${c.rep.estado}` : '')

export function useReproduccionMinuto(entrada: EntradaRep | null, limite: Tope | null): Reproduccion {
  const reducido = useMovimientoReducido()
  const est = useRef<EstadoRep>(repInicial())
  const entradaRef = useRef(entrada)
  entradaRef.current = entrada
  const limiteRef = useRef(limite)
  limiteRef.current = limite
  const subs = useRef(new Set<(c: CuadroReloj) => void>())
  const raf = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const claveVista = useRef('')
  const [version, setVersion] = useState(0)

  /** El cuadro de este instante. Guarda el avance del reloj: dos lectores seguidos ven el mismo instante. */
  const cuadro = useCallback((): CuadroReloj => {
    const ahora = performance.now()
    const e = avanzar(est.current, ahora)
    est.current = e
    if (e.cerrados < 1 || e.desdeMs == null) return SIN_CUADRO
    const c = cuadroRep(e, limiteRef.current, ahora)
    const ini = e.desdeMs + c.minutoIdx * MIN_MS
    return {
      valor: c.total,
      frac: c.frac,
      previa: { valor: c.totalPiso, atMs: ini },
      ultima: { valor: c.totalFinal, atMs: ini + MIN_MS },
      atrasada: c.atrasada,
      rep: c,
    }
  }, [])

  const emitir = useCallback(() => {
    const c = cuadro()
    subs.current.forEach((fn) => fn(c))
    /* React se entera solo cuando cambia el minuto que corre o el estado: es lo que rehace la geometría (curva, barras, chip). */
    const clave = claveDe(c)
    if (clave !== claveVista.current) { claveVista.current = clave; setVersion((v) => v + 1) }
  }, [cuadro])

  const correr = useCallback(() => {
    cancelAnimationFrame(raf.current)
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const paso = () => {
      emitir()
      const ahora = performance.now()
      if (reproduciendo(est.current, ahora)) { raf.current = requestAnimationFrame(paso); return }
      /* Cola vacía: sin cuadros, pero el pase a «atrasado» llega por tiempo, no por un minuto nuevo. */
      const falta = proximoCambioMs(est.current, ahora)
      if (falta != null) timer.current = setTimeout(() => { timer.current = null; correr() }, falta + 5)
    }
    paso()
  }, [emitir])

  /* Un minuto cerrado nuevo: se registra ANTES de pintar y entra a la cola. Una lectura repetida no cambia nada. */
  const clave = entrada ? `${entrada.desdeMs}|${minutosCerrados(entrada)}|${entrada.maquinas.map((m) => m.id).join(',')}` : ''
  useLayoutEffect(() => {
    const en = entradaRef.current
    if (!en) {
      if (est.current.cerrados > 0) { est.current = repInicial(); claveVista.current = ''; setVersion((v) => v + 1); emitir() }
      return
    }
    const nuevo = registrarSerie(est.current, en, performance.now())
    if (nuevo === est.current) return
    est.current = nuevo
    claveVista.current = claveDe(cuadro())
    setVersion((v) => v + 1)
    correr()
  }, [clave, correr, emitir, cuadro])

  /* El contador vivo avanzó (tope nuevo): se vuelve a leer el cuadro. */
  const topeTotal = limite?.total ?? null
  useEffect(() => { emitir() }, [topeTotal, emitir])
  /* Al desmontar se cancela el rAF y el temporizador. Al MONTAR de nuevo (React StrictMode en desarrollo monta, desmonta y vuelve a montar)
     el efecto de la serie ve el estado ya registrado y no reanuda nada: si hay cola, el reloj se reanuda acá. */
  useEffect(() => {
    if (est.current.cerrados > 0) correr()
    return () => {
      cancelAnimationFrame(raf.current)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [correr])

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
    const { j } = posicion(e)
    const iniMs = e.desdeMs + j * MIN_MS
    return { iniMs, finMs: iniMs + MIN_MS, maquinas: minutoEn(e, j), previo: j >= 1 ? minutoEn(e, j - 1) : null, pulsoAtMs: e.pulsoAtMs, animado: e.tMs < e.desdeMs + e.cerrados * MIN_MS }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cambia con el minuto que corre y con cada serie registrada (`version`)
  }, [activa, version])

  /* El techo cambia con cada lectura nueva, no con cada render de la página: el contexto no se invalida por una identidad. */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- se rehace cuando cambia el total del contador vivo
  const tope = useMemo(() => limite, [topeTotal])
  return useMemo(() => ({ activa, reloj, minuto, tope }), [activa, reloj, minuto, tope])
}

/** ¿Está la reproducción atrasada ahora mismo? (lectura puntual; el cuadro por cuadro no lo necesita). */
export const reproduccionAtrasada = (r: Reproduccion): boolean => r.reloj.cuadro().atrasada

/** El estado del reloj ahora mismo, para quien no se suscribe (lectura puntual). null sin reproducción. */
export const estadoDelReloj = (r: Reproduccion | null | undefined): EstadoVivo | null => r?.reloj.cuadro().rep?.estado ?? null
