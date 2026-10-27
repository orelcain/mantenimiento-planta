/**
 * Hooks del patrón exprés / ampliado del monitor v2 (medios, cuenta de cifras, entrada escalonada, cierre de la
 * capa). Van aparte de AmpliarV2.tsx para que ese archivo exporte solo componentes (recarga en caliente).
 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

// ── Medios ───────────────────────────────────────────────────────────────────

export function useEsPc() {
  const q = '(min-width: 1024px)'
  const [pc, setPc] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setPc(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return pc
}

/** «Reducir movimiento» del sistema: sin resorte, sin desplazamiento, sin cuentas. */
export function useMovimientoReducido() {
  const q = '(prefers-reduced-motion: reduce)'
  const [r, setR] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches)
  useEffect(() => {
    const m = window.matchMedia?.(q)
    if (!m) return
    const f = () => setR(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return r
}

/** Cierra la capa (o la hoja) en la que está el contenido: «ver ›» en el gráfico del turno necesita bajar el telón. */
export const CapaCtx = createContext<(() => void) | null>(null)
export const useCerrarCapa = () => useContext(CapaCtx)

/** Abre el ampliado de la tarjeta en la que está el contenido (p. ej. «Turno ›» de la tira exprés). */
export const AbrirCtx = createContext<(() => void) | null>(null)
export const useAbrirAmpliado = () => useContext(AbrirCtx)

// ── Cifras que cuentan ───────────────────────────────────────────────────────

/**
 * La cifra a mostrar: cuenta de la anterior a la nueva en ~600 ms (ease-out cúbico), SOLO cuando el dato cambia
 * de verdad (nunca al montar, nunca en un refresco con el mismo valor). Con reducir movimiento cambia en seco.
 */
export function useCuentaCifra(valor: number, durMs = 600): number {
  const reducido = useMovimientoReducido()
  const [mostrado, setMostrado] = useState(valor)
  const mostradoRef = useRef(valor)
  const previo = useRef(valor)
  mostradoRef.current = mostrado
  useEffect(() => {
    if (previo.current === valor) return
    previo.current = valor
    const desde = mostradoRef.current
    if (reducido || !Number.isFinite(desde) || !Number.isFinite(valor)) { setMostrado(valor); return }
    const t0 = performance.now()
    let raf = 0
    const paso = (t: number) => {
      const p = Math.min(1, (t - t0) / durMs)
      setMostrado(Math.round(desde + (valor - desde) * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(paso)
    }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [valor, reducido, durMs])
  return mostrado
}


// ── Entrada escalonada ───────────────────────────────────────────────────────

/**
 * Las tarjetas entran una tras otra (opacity + translateY 8 px, 35 ms entre cada una, a lo más 5 escalones: DESIGN.md §8) al montar la
 * pestaña. La clase se quita sola: un refresco de datos no vuelve a animar nada. Sin reducir movimiento.
 */
export function useEntradaEscalonada(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const raiz = ref.current
    if (!raiz || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const items = Array.from(raiz.querySelectorAll<HTMLElement>('.v2-tarjeta, .v2-clasico > section, .v2-ritmo > section'))
    items.forEach((el, i) => {
      el.style.setProperty('--k', String(Math.min(i, 4)))
      el.classList.add('v2-entra')
    })
    const id = setTimeout(() => items.forEach((el) => { el.classList.remove('v2-entra'); el.style.removeProperty('--k') }), 1200)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar la pestaña
  }, [])
}

