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
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type TarjetaLayout = { id: string; w: number; h: number }

/* Techos del imán. w mínimo 2: a 1 columna ninguna tarjeta real se lee.
   h máximo 24 filas ≈ 1.600 px: más que eso es un error de arrastre. */
export const TABLERO_MIN_W = 2
export const TABLERO_MAX_W = 6
export const TABLERO_MIN_H = 2
export const TABLERO_MAX_H = 24

const clampa = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v)))

/**
 * Mezcla lo guardado con la fábrica: manda el orden y el tamaño guardados,
 * las tarjetas que lo guardado no conoce (features nuevas) se insertan en su
 * posición de fábrica, y los ids que ya no existen se descartan.
 */
export function combinarTablero(guardado: TarjetaLayout[] | null, fabrica: TarjetaLayout[]): TarjetaLayout[] {
  const validas = new Map(fabrica.map((f, i) => [f.id, i]))
  const base = (guardado ?? [])
    .filter((t) => validas.has(t.id))
    .map((t) => ({
      id: t.id,
      w: clampa(t.w, TABLERO_MIN_W, TABLERO_MAX_W),
      h: clampa(t.h, TABLERO_MIN_H, TABLERO_MAX_H),
    }))
  if (base.length === 0) return fabrica.map((f) => ({ ...f }))
  const vistas = new Set(base.map((t) => t.id))
  for (const f of fabrica) {
    if (vistas.has(f.id)) continue
    /* En su posición de fábrica, no al final: si mañana aparece una tarjeta
       nueva importante, no puede nacer enterrada al fondo de un layout viejo. */
    base.splice(Math.min(validas.get(f.id)!, base.length), 0, { ...f })
  }
  return base
}

export function cargarTablero(clave: string): TarjetaLayout[] | null {
  try {
    const crudo = localStorage.getItem(clave)
    if (!crudo) return null
    const dato = JSON.parse(crudo) as { v?: number; tarjetas?: TarjetaLayout[] }
    if (dato?.v !== 1 || !Array.isArray(dato.tarjetas)) return null
    return dato.tarjetas.filter((t) => typeof t?.id === 'string' && Number.isFinite(t.w) && Number.isFinite(t.h))
  } catch {
    return null
  }
}

export function guardarTablero(clave: string, tarjetas: TarjetaLayout[]) {
  try { localStorage.setItem(clave, JSON.stringify({ v: 1, tarjetas })) } catch { /* privado/lleno: se pierde la preferencia, no la pantalla */ }
}

export function borrarTablero(clave: string) {
  try { localStorage.removeItem(clave) } catch { /* idem */ }
}

export type Tablero = {
  activo: boolean
  editando: boolean
  setEditando: (v: boolean) => void
  personalizado: boolean
  mapa: Map<string, { idx: number; w: number; h: number }>
  mover: (deId: string, aId: string) => void
  redimensionar: (id: string, w: number, h: number) => void
  restaurar: () => void
  arrastrando: string | null
  setArrastrando: (id: string | null) => void
}

export function useTablero(clave: string, fabrica: TarjetaLayout[], activo: boolean): Tablero {
  const [layout, setLayout] = useState<TarjetaLayout[]>(() => combinarTablero(cargarTablero(clave), fabrica))
  const [editando, setEditando] = useState(false)
  const [personalizado, setPersonalizado] = useState<boolean>(() => cargarTablero(clave) != null)
  const [arrastrando, setArrastrando] = useState<string | null>(null)

  /* Otro turno u otro estado (vivo→cerrado) cambia la fábrica vigente:
     recombinar conserva lo personalizado y reordena solo lo de fábrica. */
  useEffect(() => {
    setLayout(combinarTablero(cargarTablero(clave), fabrica))
    setPersonalizado(cargarTablero(clave) != null)
  }, [clave, fabrica])

  const mapa = useMemo(
    () => new Map(layout.map((t, idx) => [t.id, { idx, w: t.w, h: t.h }])),
    [layout],
  )

  const aplica = (nuevo: TarjetaLayout[]) => {
    setLayout(nuevo)
    guardarTablero(clave, nuevo)
    setPersonalizado(true)
  }

  return {
    activo,
    editando,
    setEditando,
    personalizado,
    mapa,
    arrastrando,
    setArrastrando,
    mover: (deId, aId) => {
      const de = layout.findIndex((t) => t.id === deId)
      const a = layout.findIndex((t) => t.id === aId)
      if (de < 0 || a < 0 || de === a) return
      const nuevo = [...layout]
      const [mov] = nuevo.splice(de, 1)
      nuevo.splice(a, 0, mov!)
      aplica(nuevo)
    },
    redimensionar: (id, w, h) => {
      const nuevo = layout.map((t) => t.id === id
        ? { ...t, w: clampa(w, TABLERO_MIN_W, TABLERO_MAX_W), h: clampa(h, TABLERO_MIN_H, TABLERO_MAX_H) }
        : t)
      aplica(nuevo)
    },
    restaurar: () => {
      borrarTablero(clave)
      setLayout(fabrica.map((f) => ({ ...f })))
      setPersonalizado(false)
      setArrastrando(null)
    },
  }
}

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
      const w = clampa(w0 + (ev.clientX - x0) / (celda + HUECO), TABLERO_MIN_W, TABLERO_MAX_W)
      const h = clampa(h0 + (ev.clientY - y0) / (FILA + HUECO), TABLERO_MIN_H, TABLERO_MAX_H)
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
