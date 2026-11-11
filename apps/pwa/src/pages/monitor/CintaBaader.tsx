/**
 * La cinta de 60 s de una Baader (spec §5). Un canvas que se repinta con cada cuadro del reloj único (`reloj.alCuadro`):
 * sin render de React por cuadro. Lo que cambia con el estado del reloj lo dice el atributo `data-estado` (el CSS atenúa
 * la cinta al 45 % cuando Shoplogix está atrasado: el reloj está congelado y no se inventa nada).
 *
 * Qué se dibuja y por qué está en `cintaCanvas.ts`. Aquí solo: el tamaño (DPR), los colores del tema (se releen al cambiar
 * el tema) y la suscripción al reloj.
 */
import { memo, useEffect, useRef } from 'react'
import { dibujarCinta, datosCinta, leerColoresCinta, type DatosCinta } from './cintaCanvas'
import type { MinutoVista, Reproduccion } from './useReproduccionMinuto'
import type { CuadroReloj } from './useRelojDeDatos'

export const CintaBaader = memo(function CintaBaader({ rep, id, etiqueta }: { rep: Reproduccion; id: string; etiqueta: string }) {
  const cv = useRef<HTMLCanvasElement>(null)
  /* El minuto que corre cambia ~una vez por minuto; el canvas lo lee por ref (el efecto no se rehace por él). */
  const minutoRef = useRef<MinutoVista | null>(rep.minuto)
  minutoRef.current = rep.minuto
  const reducido = rep.reloj.reducido

  useEffect(() => {
    const el = cv.current
    if (!el) return
    let colores = leerColoresCinta(el)
    let datos: { minuto: MinutoVista; d: DatosCinta } | null = null
    let ultimo: CuadroReloj | null = null
    let estado = ''
    const pintar = (c: CuadroReloj) => {
      ultimo = c
      const minuto = minutoRef.current
      if (!c.rep || !minuto) return
      const est = c.rep.estado
      if (est !== estado) { estado = est; el.dataset.estado = est }
      if (!datos || datos.minuto !== minuto) datos = { minuto, d: datosCinta(minuto, id) }
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr) }
      const x = el.getContext('2d')
      if (!x) return
      x.setTransform(dpr, 0, 0, dpr, 0, 0)
      x.clearRect(0, 0, w, h)
      dibujarCinta(x, w, h, datos.d, c.rep.tMs, colores, reducido)
    }
    const off = rep.reloj.alCuadro(pintar)
    const redibujar = () => { if (ultimo) pintar(ultimo) }
    /* Un cambio de ancho o de tema no trae un cuadro nuevo si el reloj está quieto: se repinta el último. */
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(redibujar) : null
    ro?.observe(el)
    const mo = typeof MutationObserver === 'function'
      ? new MutationObserver(() => { colores = leerColoresCinta(el); redibujar() })
      : null
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    return () => { off(); ro?.disconnect(); mo?.disconnect() }
  }, [rep.reloj, id, reducido])

  return <canvas ref={cv} className="rm-cinta" role="img" aria-label={etiqueta} />
})
