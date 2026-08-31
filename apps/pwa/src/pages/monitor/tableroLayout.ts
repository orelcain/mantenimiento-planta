/**
 * La LÓGICA del tablero personalizable del monitor público: layout, imán,
 * persistencia y el hook. El componente envoltorio (`TarjetaTablero`) vive en
 * `Tablero.tsx` — separados porque un archivo que exporta componentes y
 * funciones a la vez rompe el fast-refresh (y el lint del CI lo cobra).
 * El porqué de cada decisión está en `Tablero.tsx`.
 */
import { useEffect, useMemo, useState } from 'react'

export type TarjetaLayout = { id: string; w: number; h: number }

/* Techos del imán. w mínimo 2: a 1 columna ninguna tarjeta real se lee.
   h máximo 24 filas ≈ 1.600 px: más que eso es un error de arrastre. */
export const TABLERO_MIN_W = 2
export const TABLERO_MAX_W = 6
export const TABLERO_MIN_H = 2
export const TABLERO_MAX_H = 24

export const clampaTablero = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(v)))

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
      w: clampaTablero(t.w, TABLERO_MIN_W, TABLERO_MAX_W),
      h: clampaTablero(t.h, TABLERO_MIN_H, TABLERO_MAX_H),
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
        ? {
          ...t,
          w: clampaTablero(w, TABLERO_MIN_W, TABLERO_MAX_W),
          h: clampaTablero(h, TABLERO_MIN_H, TABLERO_MAX_H),
        }
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
