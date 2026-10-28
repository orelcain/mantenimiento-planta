/**
 * Hook del «reloj de datos» (reglas y porqué en `relojDeDatos.ts` y DESIGN.md §8).
 *
 * No re-renderiza por cuadro: el estado vive en un ref y quien dibuja (la cifra grande, la punta de la curva)
 * se suscribe con `alCuadro` y escribe SOLO `transform`/`opacity`/texto en su nodo. React se entera una vez por
 * lectura (`version`), que es cuando la geometría de la curva sí cambia.
 *
 * El cuadro por cuadro corre únicamente mientras hay una recta que recorrer (≤ 90 s por lectura); el resto
 * del tiempo no hay `requestAnimationFrame` pendiente.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMovimientoReducido } from './ampliarHooks'
import type { CuadroRep } from './reproduccionMinuto'
import {
  detenidaPorLecturas, fraccion, interpolando, lecturaAtrasada, registrarLectura, relojInicial, valorMostrado,
  type EstadoReloj, type Lectura,
} from './relojDeDatos'

export interface CuadroReloj {
  /** El valor de este instante, entre la lectura anterior y la última. null sin ninguna lectura. */
  valor: number | null
  /** Qué parte de la recta anterior → última ya corrió (0..1). */
  frac: number
  previa: Lectura | null
  ultima: Lectura | null
  /** La lectura siguiente se atrasó: todo está quieto en la última. */
  atrasada: boolean
  /** Solo con la reproducción del último minuto: el desglose por Baader de este instante (`useReproduccionMinuto`). */
  rep?: CuadroRep
}

export interface RelojDeDatos {
  /** Foto del instante actual (para leer fuera de un cuadro). */
  cuadro: () => CuadroReloj
  /** Cada cuadro de la recta y cada lectura nueva. Devuelve la baja. */
  alCuadro: (fn: (c: CuadroReloj) => void) => () => void
  /** Cambia una vez por lectura nueva: lo que se dibuja con geometría (curva) se rehace con él. */
  version: number
  /** Dos lecturas seguidas sin piezas. */
  detenida: boolean
  /** «reducir movimiento» del sistema: sin recta ni entradas. */
  reducido: boolean
}

/**
 * `turno` (opcional) identifica el turno que se está mirando. Al CAMBIAR (el usuario pasa con «Anterior» del turno en vivo a
 * uno cerrado) el reloj arranca de cero: la primera lectura del turno nuevo salta directo, sin recta desde la cifra del otro
 * turno (era una cuenta ascendente de ~6,5 s, 8.370 → 15.479, mientras las Baader ya mostraban el total). La recta queda solo
 * para lecturas nuevas del MISMO turno.
 */
export function useRelojDeDatos(lectura: Lectura | null, semilla?: number[], turno?: string | null): RelojDeDatos {
  const reducido = useMovimientoReducido()
  const reducidoRef = useRef(reducido)
  reducidoRef.current = reducido
  const est = useRef<EstadoReloj>(relojInicial(semilla))
  const subs = useRef(new Set<(c: CuadroReloj) => void>())
  const raf = useRef(0)
  const [version, setVersion] = useState(0)

  const cuadro = useCallback((): CuadroReloj => {
    const e = est.current
    const ahora = performance.now()
    return {
      valor: valorMostrado(e, ahora, reducidoRef.current),
      frac: fraccion(e, ahora, reducidoRef.current),
      previa: e.previa,
      ultima: e.ultima,
      atrasada: lecturaAtrasada(e, ahora),
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
      if (interpolando(est.current, performance.now(), reducidoRef.current)) raf.current = requestAnimationFrame(paso)
    }
    paso()
  }, [emitir])

  /* Una lectura nueva (valor u hora distintos): se registra ANTES de pintar y arranca la recta. */
  const valor = lectura?.valor ?? null
  const atMs = lectura?.atMs ?? null
  const turnoPrevio = useRef(turno)
  const semillaRef = useRef(semilla)
  semillaRef.current = semilla
  useLayoutEffect(() => {
    /* Otro turno: lo recordado (la cifra y la recta del turno anterior) no sirve de punto de partida. */
    if (turnoPrevio.current !== turno) {
      turnoPrevio.current = turno
      est.current = relojInicial(semillaRef.current)
      setVersion((v) => v + 1)
      if (valor == null) emitir()
    }
    if (valor == null) return
    const nuevo = registrarLectura(est.current, { valor, atMs }, performance.now())
    if (nuevo === est.current) return
    est.current = nuevo
    setVersion((v) => v + 1)
    correr()
  }, [valor, atMs, turno, correr, emitir])

  /* Al activar «reducir movimiento» en caliente, se salta a la última lectura. */
  useEffect(() => { emitir() }, [reducido, emitir])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const alCuadro = useCallback((fn: (c: CuadroReloj) => void) => {
    subs.current.add(fn)
    fn(cuadro())
    return () => { subs.current.delete(fn) }
  }, [cuadro])

  const detenida = detenidaPorLecturas(est.current.historial)
  return useMemo(
    () => ({ cuadro, alCuadro, version, detenida, reducido }),
    [cuadro, alCuadro, version, detenida, reducido],
  )
}
