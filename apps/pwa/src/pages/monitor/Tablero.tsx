/**
 * El TABLERO personalizable del monitor público (pestaña «El turno»).
 *
 * Pedido de Orel (30-08, tras el mockup «Monitor a tu orden»): poder MOVER
 * cada tarjeta y darle el ANCHO Y ALTO que uno requiera, con todo guardado.
 * Personalizar abierto a cualquiera que tenga el link.
 *
 * Decisiones (las mismas del mockup aprobado):
 * - Imán a grilla: 6 columnas × filas de 56 px. Se estira libre pero se pega
 *   al riel, así todo queda alineado (estilo Grafana). Sin posiciones x/y
 *   libres: el orden + el tamaño deciden el lugar y `grid-auto-flow: dense`
 *   rellena los huecos.
 * - Las filas son `minmax(56px, auto)`: el tamaño guardado es un MÍNIMO y el
 *   contenido puede empujar. Costo: el alto real puede quedar un poco más
 *   grande que el pedido; beneficio: NINGUNA tarjeta se corta nunca (el
 *   mockup demostró que el alto fijo aplastaba tarjetas a una fila).
 * - Se guarda POR APARATO (localStorage, clave por planta): tu teléfono, el
 *   PC de la oficina y el notebook del jefe de turno pueden tener cada uno su
 *   orden. «Restaurar orden de fábrica» siempre a mano.
 * - El celular hereda solo el ORDEN (contenedor flex-col: `order` vale, los
 *   spans no); dimensionar es de PC. La TV no pasa por acá.
 * - El orden de fábrica sigue siendo el curado y cambia con el estado del
 *   turno (vivo/cerrado), como hacían las dos ramas que este tablero
 *   reemplaza. La personalización del usuario vale para ambos estados.
 *
 * La lógica (layout, imán, persistencia, hook) vive en `tableroLayout.ts`:
 * un archivo que exporta componentes y funciones a la vez rompe el
 * fast-refresh, y el lint del CI (--max-warnings 30) lo cobra.
 */
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  TABLERO_MAX_H, TABLERO_MAX_W, TABLERO_MIN_H, TABLERO_MIN_W,
  clampaTablero, type Tablero,
} from './tableroLayout'

/* Alto en px de un span de filas (para el imán del arrastre). */
const FILA = 56
const HUECO = 12

/**
 * El envoltorio de cada tarjeta: aplica orden y tamaño, y en modo
 * personalizar se vuelve arrastrable con el asa de la esquina para estirar.
 * Con `t.activo === false` (la TV) devuelve la tarjeta pelada, sin envoltorio,
 * para que el CSS estructural del modo pantalla siga viendo el DOM de siempre.
 */
export function TarjetaTablero({ id, t, children }: { id: string; t: Tablero; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [medida, setMedida] = useState<string | null>(null)

  if (!t.activo) return <>{children}</>
  const item = t.mapa.get(id)
  if (!item) return <>{children}</>

  const empiezaEstirar = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!t.editando) return
    e.preventDefault()
    e.stopPropagation()
    const asa = e.currentTarget
    const cont = ref.current?.parentElement
    if (!cont) return
    const celda = (cont.getBoundingClientRect().width - HUECO * 5) / 6
    const { w: w0, h: h0 } = t.mapa.get(id)!
    const x0 = e.clientX
    const y0 = e.clientY
    asa.setPointerCapture(e.pointerId)
    const mueve = (ev: PointerEvent) => {
      const w = clampaTablero(w0 + (ev.clientX - x0) / (celda + HUECO), TABLERO_MIN_W, TABLERO_MAX_W)
      const h = clampaTablero(h0 + (ev.clientY - y0) / (FILA + HUECO), TABLERO_MIN_H, TABLERO_MAX_H)
      t.redimensionar(id, w, h)
      setMedida(`${w} de 6 · alto ${h}`)
    }
    const suelta = () => {
      asa.removeEventListener('pointermove', mueve)
      asa.removeEventListener('pointerup', suelta)
      setMedida(null)
    }
    asa.addEventListener('pointermove', mueve)
    asa.addEventListener('pointerup', suelta)
  }

  return (
    <div
      ref={ref}
      data-tarjeta={id}
      draggable={t.editando}
      onDragStart={(e) => {
        t.setArrastrando(id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => t.setArrastrando(null)}
      onDragOver={(e) => {
        if (t.arrastrando && t.arrastrando !== id) e.preventDefault()
      }}
      onDrop={(e) => {
        if (!t.arrastrando || t.arrastrando === id) return
        e.preventDefault()
        t.mover(t.arrastrando, id)
        t.setArrastrando(null)
      }}
      /* El primer hijo (la tarjeta) llena el envoltorio en PC: si el usuario
         estiró más que el contenido, la caja con borde crece hasta el tamaño
         pedido en vez de dejar un hueco transparente flotando debajo. Solo el
         primero: el escudo y el asa son absolutos y no deben estirarse. */
      className={`relative min-w-0 lg:[&>*:first-child]:h-full${t.editando ? ' cursor-grab outline-dashed outline-1 outline-offset-2 outline-primary/60 active:cursor-grabbing' : ''}${t.arrastrando === id ? ' opacity-40' : ''}`}
      style={{
        order: item.idx,
        gridColumn: `span ${item.w}`,
        gridRow: `span ${item.h}`,
      }}
    >
      {children}
      {t.editando && (
        <>
          {/* El escudo: arrastrar una tarjeta llena de botones sin dispararlos.
              Los controles internos vuelven a funcionar al salir de Personalizar. */}
          <div className="absolute inset-0 z-[5] rounded-card" aria-hidden />
          <button
            type="button"
            onPointerDown={empiezaEstirar}
            title="Estirar ancho y alto"
            className="absolute bottom-1 right-1 z-[6] flex h-7 w-7 touch-none items-end justify-end rounded-ctl text-primary"
            style={{ cursor: 'nwse-resize' }}
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
              <path d="M11 1v10H1z" fill="currentColor" />
            </svg>
          </button>
          {medida && (
            <span className="absolute left-1/2 top-1/2 z-[7] -translate-x-1/2 -translate-y-1/2 rounded-ctl border border-primary bg-background px-2 py-0.5 text-[11.5px] tabular-nums text-foreground">
              {medida}
            </span>
          )}
        </>
      )}
    </div>
  )
}
