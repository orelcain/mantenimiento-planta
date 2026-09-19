import { useId, useMemo, useState, type ReactNode } from 'react'
import { Loader2, Search } from 'lucide-react'
import { buscarEquipos, type OpcionEquipo } from '@/services/bitacora/buscarEquipos'

/**
 * Campo «Equipo o área» con sugerencias MIENTRAS SE ESCRIBE desde la jerarquía
 * de la app (equipos y áreas de todas las plantas).
 *
 * - Cada sugerencia dice planta y área: hay equipos con el mismo nombre en
 *   Chonchi y en Yal.
 * - Elegir una guarda también el id del nodo (para contar paradas por máquina);
 *   seguir escribiendo lo desvincula.
 * - Siempre se puede usar el texto tal cual (un equipo que no está en la
 *   jerarquía, "sala de calderas", "patio").
 * - La lista va EN FLUJO bajo el campo, no flotando: dentro del Sheet con
 *   scroll, un desplegable absoluto quedaba recortado.
 */

const plano = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Resalta cada palabra buscada dentro del nombre, sin importar tildes ni mayúsculas. */
function resaltar(nombre: string, texto: string): ReactNode {
  const chars = [...nombre]
  const base = chars.map((c) => plano(c).charAt(0) || c).join('')
  const marcas = new Array<boolean>(chars.length).fill(false)
  for (const t of plano(texto).split(/\s+/).filter(Boolean)) {
    let desde = 0
    let i = base.indexOf(t, desde)
    while (i >= 0) {
      for (let j = i; j < i + t.length && j < marcas.length; j++) marcas[j] = true
      desde = i + t.length
      i = base.indexOf(t, desde)
    }
  }
  const trozos: ReactNode[] = []
  let actual = ''
  let marcado = false
  const cerrar = (key: number) => {
    if (!actual) return
    trozos.push(marcado ? <mark key={key} className="rounded-[3px] bg-primary/25 text-inherit">{actual}</mark> : <span key={key}>{actual}</span>)
    actual = ''
  }
  chars.forEach((c, i) => {
    if (marcas[i] !== marcado) {
      cerrar(i)
      marcado = marcas[i] ?? false
    }
    actual += c
  })
  cerrar(chars.length)
  return trozos
}

export function BuscadorEquipo({
  texto,
  onChange,
  opciones,
  cargando,
  recientes,
  vinculado = false,
}: {
  texto: string
  /** `equipoId` null = texto libre (o se desvinculó al seguir escribiendo). */
  onChange: (texto: string, equipoId: string | null) => void
  opciones: readonly OpcionEquipo[]
  cargando: boolean
  /** Equipos ya usados (en este turno o en este teléfono): van arriba y se ofrecen al enfocar. */
  recientes: readonly string[]
  /** ¿El texto quedó atado a un equipo de la jerarquía? Si no, se avisa. */
  vinculado?: boolean
}) {
  const id = useId()
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)

  const resultados = useMemo(() => buscarEquipos(opciones, texto, { max: 8, usados: recientes }), [opciones, texto, recientes])
  const q = texto.trim()
  const coincideExacto = resultados.some((o) => plano(o.nombre) === plano(q))
  const mostrarRecientes = abierto && q.length < 2 && recientes.length > 0
  type Item = { tipo: 'opcion'; o: OpcionEquipo } | { tipo: 'libre' } | { tipo: 'reciente'; nombre: string }
  const items: Item[] = mostrarRecientes
    ? recientes.slice(0, 5).map((nombre) => ({ tipo: 'reciente' as const, nombre }))
    : abierto && q.length >= 2
      ? [...resultados.map((o) => ({ tipo: 'opcion' as const, o })), ...(coincideExacto ? [] : [{ tipo: 'libre' as const }])]
      : []

  const elegir = (item: Item) => {
    if (item.tipo === 'opcion') onChange(item.o.nombre, item.o.id)
    else if (item.tipo === 'reciente') onChange(item.nombre, null)
    else onChange(q, null)
    setAbierto(false)
  }

  return (
    <div>
      <label htmlFor={`${id}-input`} className="mb-1.5 block text-footnote text-muted-foreground">
        Máquina o área
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          autoComplete="off"
          maxLength={120}
          value={texto}
          // HIG «Searching»: el placeholder dice POR QUÉ campos se puede buscar.
          // Nombrar la planta sería falso: la jerarquía trae las dos.
          placeholder="Buscar equipo, área o código SAP"
          onFocus={() => setAbierto(true)}
          onBlur={() => setAbierto(false)}
          onChange={(e) => {
            onChange(e.target.value, null)
            setAbierto(true)
            setActivo(0)
          }}
          onKeyDown={(e) => {
            if (!items.length) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActivo((v) => Math.min(items.length - 1, v + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActivo((v) => Math.max(0, v - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const it = items[activo]
              if (it) elegir(it)
            } else if (e.key === 'Escape') {
              setAbierto(false)
            }
          }}
          className="h-[44px] w-full rounded-ctl border-0 bg-muted-foreground/10 pl-9 pr-9 text-[16px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
        />
        {cargando && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Cargando equipos" />}
      </div>

      {items.length > 0 && (
        <ul id={`${id}-lista`} role="listbox" className="mt-1.5 overflow-hidden rounded-card bg-muted-foreground/10">
          {mostrarRecientes && <li className="px-4 pb-1 pt-2 text-caption font-semibold text-muted-foreground">Usados recién</li>}
          {items.map((it, i) => (
            <li
              key={it.tipo === 'opcion' ? it.o.id : it.tipo === 'reciente' ? `r-${it.nombre}` : 'libre'}
              role="option"
              aria-selected={i === activo}
              // mousedown + preventDefault: elegir ANTES de que el blur cierre la lista.
              onMouseDown={(e) => {
                e.preventDefault()
                elegir(it)
              }}
              className={[
                'relative flex min-h-[52px] cursor-pointer flex-col justify-center px-4 py-2',
                'before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-border before:content-[""] first:before:hidden',
                i === activo ? 'bg-primary/15' : 'hover:bg-muted-foreground/10',
              ].join(' ')}
            >
              {it.tipo === 'opcion' ? (
                <>
                  <span className="text-body font-semibold leading-tight">{resaltar(it.o.nombre, q)}</span>
                  <span className="text-caption text-muted-foreground">
                    {[it.o.planta, it.o.area, it.o.tipo === 'area' ? 'Área' : it.o.codigo].filter(Boolean).join(' · ')}
                  </span>
                </>
              ) : it.tipo === 'reciente' ? (
                <span className="text-body">{it.nombre}</span>
              ) : (
                <>
                  <span className="text-body font-semibold leading-tight">Usar «{q}» tal cual</span>
                  <span className="text-caption text-muted-foreground">Texto libre, sin vincular a un equipo</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {abierto && q.length >= 2 && !cargando && opciones.length === 0 && (
        <p className="mt-1.5 text-footnote text-muted-foreground">Sin conexión a la lista de equipos: se guarda lo que escribas.</p>
      )}

      {/* El texto se guarda igual, pero sin vincular el evento no entra al
          historial de esa máquina. Pasó con «KNURO», que existe como N1, N2 y
          N3: de 12 eventos escritos a mano, ninguno quedó atado (18-09-2026).
          Se avisa cuando la lista está cerrada —ya se dejó de escribir— y hay
          equipos parecidos que elegir. */}
      {!abierto && !vinculado && q.length >= 2 && resultados.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 rounded-card bg-ink-warn/10 p-3">
          <p className="text-footnote text-foreground">
            «{q}» no quedó vinculado a un equipo. {resultados.length === 1 ? '¿Es este?' : '¿Es alguno de estos?'}
          </p>
          <div className="flex flex-wrap gap-2">
            {resultados.slice(0, 3).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onChange(o.nombre, o.id)}
                className="min-h-[44px] rounded-full bg-muted-foreground/10 px-4 text-footnote font-semibold text-foreground transition-colors hover:bg-muted-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {o.nombre}
                {o.codigo ? <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{o.codigo}</span> : null}
              </button>
            ))}
          </div>
          <p className="text-caption text-muted-foreground">Si no es ninguno, sigue: se guarda el texto tal cual.</p>
        </div>
      )}
    </div>
  )
}
