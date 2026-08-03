/**
 * VariadoresPage — Catálogo de variadores y partidores suaves (/aprendizaje/variadores)
 *
 * Para qué: cuando se quema un variador y hay que poner otro, esta página dice qué
 * parámetros espera cada familia y en qué menú están, sin ir a buscar el manual.
 *
 * Tres vistas:
 *   · Catálogo — tarjetas por familia + los 4 perfiles de motor de las cintas.
 *   · Equivalencias — el mismo dato en el dialecto de cada marca, para cuando el
 *     repuesto que hay a mano no es de la misma marca que el que se quemó.
 *   · Ficha — navegador de parámetros por menú, con buscador y filtro «solo datos
 *     de placa» (que es, en la práctica, la lista de lo que hay que levantar en terreno).
 *
 * La vista y la ficha abierta viven en la URL (`?vista=`, `?ficha=`), así el enlace
 * de un equipo se puede mandar por Telegram y quien lo abra cae directo en su ficha.
 *
 * El ABB PSR60 no tiene teclado: se ajusta con 3 potenciómetros. Su ficha es un
 * simulador de perillas con los valores derivados que el catálogo deja implícitos.
 * Ese panel va oscuro a propósito (replica el equipo real), igual que los clones HMI.
 *
 * Los datos y su trazabilidad viven en `@/data/variadores`.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Search, AlertTriangle, BookOpen, ChevronRight, Copy, Check, PackageSearch } from 'lucide-react'
import { useAuthStore } from '@/store'
import { LC as C } from '@/data/learningTheme'
import { MetaText } from '@/components/learning/primitives'
import {
  VARIADORES,
  MOTORES_CINTAS,
  POTENCIOMETROS_PSR,
  FALTAN_DE_PLACA,
  TOTAL_PARAMETROS,
  TOTAL_FALLAS,
  POSICIONES,
  RESUMEN_RECETAS,
  buscarFalla,
  EQUIVALENCIAS,
  COLUMNAS_EQUIVALENCIA,
  tensionFinalPSR,
  escalonBajadaPSR,
  type FichaVariador,
  type EstadoFicha,
  type FallaVariador,
  type EstadoValor,
} from '@/data/variadores'

/** lowercase + sin acentos, para búsqueda tolerante (mismo criterio que el hub). */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

const ETIQUETA_ESTADO: Record<EstadoFicha, string> = {
  listo: 'Con manual',
  parcial: 'Falta ubicar',
  bloqueado: 'Falta modelo',
}

const COLOR_ESTADO: Record<EstadoFicha, string> = {
  listo: C.ok,
  parcial: C.warn,
  bloqueado: C.crit,
}

function EstadoChip({ estado }: { estado: EstadoFicha }) {
  const color = COLOR_ESTADO[estado]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {ETIQUETA_ESTADO[estado]}
    </span>
  )
}

/** Cuenta parámetros y cuántos vienen de la placa del motor. */
function resumenFicha(f: FichaVariador) {
  const menus = Object.values(f.menus ?? {})
  const total = menus.reduce((n, filas) => n + filas.length, 0)
  const dePlaca = menus.reduce((n, filas) => n + filas.filter((r) => r.dePlaca).length, 0)
  return { menus: menus.length, total, dePlaca }
}

// ── Perilla del ABB PSR60 ─────────────────────────────────────────────────────
/** Aguja con 270° de recorrido: −135° en el mínimo, +135° en el máximo. */
const angulo = (valor: number, min: number, max: number) =>
  -135 + ((valor - min) / (max - min)) * 270

function Perilla({ valor, min, max }: { valor: number; min: number; max: number }) {
  const marcas = [-135, -67, 0, 67, 135]
  return (
    <svg viewBox="0 0 100 100" className="h-[100px] w-[100px]" aria-hidden="true">
      <circle cx="50" cy="50" r="34" fill="#1a2128" stroke="#39424a" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="27" fill="none" stroke="#2a333b" strokeWidth="1" />
      <g stroke="#4a555f" strokeWidth="1.5" strokeLinecap="round">
        {marcas.map((a) => (
          <line key={a} x1="50" y1="10" x2="50" y2="16" transform={`rotate(${a} 50 50)`} />
        ))}
      </g>
      <line
        x1="50" y1="50" x2="50" y2="22"
        stroke="#f5a623" strokeWidth="3.5" strokeLinecap="round"
        transform={`rotate(${angulo(valor, min, max)} 50 50)`}
      />
      <circle cx="50" cy="50" r="5" fill="#39424a" />
    </svg>
  )
}

function SimuladorPSR() {
  const [valores, setValores] = useState<Record<string, number>>(() =>
    Object.fromEntries(POTENCIOMETROS_PSR.map((p) => [p.id, p.inicial])),
  )
  /** Lectura segura: el estado siempre trae las 3 claves, pero el índice es opcional en TS. */
  const v = (id: string): number => valores[id] ?? 0

  return (
    <div
      className="flex flex-col gap-5 rounded-md p-5"
      style={{ background: '#0f1418', border: '1px solid #2b3238' }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="font-mono text-[13px] font-bold tracking-[0.22em]" style={{ color: '#e8422e' }}>
          ABB
        </span>
        <span className="font-mono text-[11px]" style={{ color: '#6d7d8a' }}>
          PSR60-600-70 · Ue 208…600 V · Uc 100…240 V AC
        </span>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))' }}>
        {POTENCIOMETROS_PSR.map((p) => (
          <div key={p.id} className="flex flex-col items-center gap-2 text-center">
            <Perilla valor={v(p.id)} min={p.min} max={p.max} />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.1em]" style={{ color: '#8b9aa6' }}>
              {p.nombre}
            </span>
            <span className="font-mono text-lg font-semibold tabular-nums" style={{ color: '#f0f4f7' }}>
              {v(p.id)}{p.unidad}
            </span>
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={1}
              value={v(p.id)}
              aria-label={p.nombre}
              className="w-[100px]"
              style={{ accentColor: '#f5a623' }}
              onChange={(e) => setValores((v) => ({ ...v, [p.id]: Number(e.target.value) }))}
            />
            <span className="font-mono text-[10px]" style={{ color: '#5d6b76' }}>{p.rango}</span>
          </div>
        ))}
      </div>

      <dl
        className="grid gap-px overflow-hidden rounded"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', background: '#232a30', border: '1px solid #232a30' }}
      >
        {[
          ['Tensión final (Uend)', `${tensionFinalPSR(v('uini'))} %`],
          ['Escalón de bajada', `${escalonBajadaPSR(v('stop'))} %`],
          ['Corriente nominal', '60 A'],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="flex flex-col gap-0.5 px-3 py-2.5" style={{ background: '#131a20' }}>
            <dt className="font-mono text-[10px] uppercase tracking-[0.09em]" style={{ color: '#6d7d8a' }}>
              {rotulo}
            </dt>
            <dd className="m-0 font-mono text-[15px] font-semibold tabular-nums" style={{ color: '#e6ecf1' }}>
              {valor}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-xs" style={{ color: '#8b9aa6', borderTop: '1px solid #232a30', paddingTop: 12 }}>
        Del catálogo ABB: <span className="font-mono">Uini 40…70 % da Uend 30…60 %</span>, y el escalón
        baja <span className="font-mono">2 %</span> por cada segundo de rampa de parada.
      </p>
    </div>
  )
}

// ── Navegador de parámetros ───────────────────────────────────────────────────
function NavegadorParametros({ ficha }: { ficha: FichaVariador }) {
  const claves = useMemo(() => Object.keys(ficha.menus ?? {}), [ficha])
  const [menu, setMenu] = useState(claves[0] ?? '')
  const [q, setQ] = useState('')
  const [soloPlaca, setSoloPlaca] = useState(false)

  const activo: string = claves.includes(menu) ? menu : (claves[0] ?? '')
  const filas = useMemo(() => ficha.menus?.[activo] ?? [], [ficha, activo])

  // Con búsqueda o filtro de placa activos se busca en TODA la ficha, no solo en el
  // menú abierto: el técnico conoce el código («nCr») pero no en qué menú vive — que
  // es justamente lo que viene a averiguar. Sin búsqueda, manda el chip de menú.
  const global = q.trim() !== '' || soloPlaca
  const todas = useMemo(
    () =>
      Object.entries(ficha.menus ?? {}).flatMap(([m, fs]) =>
        fs.map((r) => ({ ...r, menu: m })),
      ),
    [ficha],
  )

  const visibles = useMemo(() => {
    const term = norm(q.trim())
    const base = global ? todas : filas.map((r) => ({ ...r, menu: activo }))
    return base.filter(
      (r) =>
        (!soloPlaca || r.dePlaca) &&
        (!term || norm(r.codigo).includes(term) || norm(r.descripcion).includes(term)),
    )
  }, [global, todas, filas, activo, q, soloPlaca])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <MetaText>Menú:</MetaText>
        <div className="flex flex-wrap gap-1.5">
          {claves.map((k) => {
            const i = k.indexOf(' ')
            const codigo = i > 0 ? k.slice(0, i) : k
            const nombre = i > 0 ? k.slice(i + 1) : ''
            const on = k === activo
            return (
              <button
                key={k}
                onClick={() => setMenu(k)}
                aria-pressed={on}
                className="rounded px-3 py-1.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
                style={{
                  background: on ? `color-mix(in srgb, ${C.aqua} 20%, transparent)` : C.bgPanel,
                  border: `1px solid ${on ? C.aqua : C.border}`,
                  color: C.ink,
                  fontWeight: on ? 600 : 400,
                }}
              >
                <span className="mr-1.5 font-mono text-xs opacity-85">{codigo}</span>
                {nombre}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid items-center gap-2.5 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: C.inkLo }} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar: nCr, rampa, corriente…"
            aria-label="Buscar parámetro"
            className="w-full rounded py-2.5 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
            style={{ background: C.bgPanel, border: `1px solid ${C.border}`, color: C.ink }}
          />
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setSoloPlaca((v) => !v)}
            aria-pressed={soloPlaca}
            className="rounded px-3 py-1.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
            style={{
              background: soloPlaca ? `color-mix(in srgb, ${C.warn} 20%, transparent)` : C.bgPanel,
              border: `1px solid ${soloPlaca ? C.warn : C.border}`,
              color: C.ink,
              fontWeight: soloPlaca ? 600 : 400,
            }}
          >
            Solo datos de placa
          </button>
          <MetaText mono>
            {global
              ? `${visibles.length} de ${todas.length} en toda la ficha`
              : `${filas.length} parámetros`}
          </MetaText>
        </div>
      </div>

      <div className="overflow-x-auto rounded" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full border-collapse text-[13.5px]" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              {['Cód.', 'Descripción', 'Rango', 'Fábrica'].map((h, i) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-3 py-2.5 text-left text-[12.5px] font-semibold"
                  style={{
                    background: C.bgPanel, color: C.inkMid, borderBottom: `1px solid ${C.border}`,
                    // Columna fija: en un celular la tabla scrollea y el código no puede perderse de vista.
                    ...(i === 0 ? { position: 'sticky' as const, left: 0, zIndex: 2, borderRight: `1px solid ${C.border}` } : {}),
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-[13px]" style={{ color: C.inkMid }}>
                  {q.trim() ? `Nada con «${q.trim()}» en esta ficha.` : 'Esta ficha no tiene datos de placa.'}
                </td>
              </tr>
            )}
            {visibles.map((r) => (
              <tr
                key={r.codigo + r.descripcion}
                style={{
                  background: r.dePlaca ? `color-mix(in srgb, ${C.warn} 7%, transparent)` : undefined,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <td
                  className="whitespace-nowrap px-3 py-2.5 align-top font-mono font-semibold"
                  style={{
                    color: C.aquaBright, position: 'sticky', left: 0, zIndex: 1,
                    // Fondo OPACO: mezclar contra surface (no transparent) para que no se vea lo que pasa debajo.
                    background: r.dePlaca ? `color-mix(in srgb, ${C.warn} 7%, ${C.surface})` : C.surface,
                    borderRight: `1px solid ${C.border}`,
                  }}
                >
                  {r.codigo}
                  {global && (
                    <span className="mt-0.5 block font-sans text-[10.5px] font-normal" style={{ color: C.inkLo }}>
                      {r.menu.split(' ')[0]}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top" style={{ color: C.ink, lineHeight: 1.5 }}>
                  {r.descripcion}
                  {r.dePlaca && (
                    <span
                      className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
                      style={{ color: C.warn, background: `color-mix(in srgb, ${C.warn} 16%, transparent)` }}
                    >
                      Placa
                    </span>
                  )}
                  {r.nota && (
                    <span
                      className="mt-1.5 block max-w-[56ch] pl-2 text-[12.5px]"
                      style={{ color: C.inkMid, borderLeft: `2px solid ${C.border}`, lineHeight: 1.5 }}
                    >
                      {r.nota}
                    </span>
                  )}
                  {r.opciones && (
                    <ul className="mt-2 flex list-none flex-col gap-1.5 pl-0">
                      {r.opciones.map((o) => (
                        <li key={o.valor} className="text-[12.5px]" style={{ lineHeight: 1.5 }}>
                          <span className="mr-1.5 font-mono font-semibold" style={{ color: C.aquaBright }}>
                            {o.valor}
                          </span>
                          <span style={{ color: C.ink }}>{o.que}</span>
                          {o.cuando && <span style={{ color: C.inkMid }}> — {o.cuando}</span>}
                          {o.requiere && (
                            <span className="ml-1.5 whitespace-nowrap text-[11px]" style={{ color: C.inkLo }}>
                              ({o.requiere})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 align-top font-mono text-[12.5px] tabular-nums" style={{ color: C.inkMid }}>
                  {r.rango}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 align-top font-mono text-[12.5px] tabular-nums" style={{ color: C.inkMid }}>
                  {r.fabrica}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MetaText>
        <span
          className="mr-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
          style={{ color: C.warn, background: `color-mix(in srgb, ${C.warn} 16%, transparent)` }}
        >
          Placa
        </span>
        el valor lo dicta la placa del motor
      </MetaText>
    </div>
  )
}

// ── Fallas del equipo ─────────────────────────────────────────────────────────
/** Qué muestra el display, por qué pasa y qué hacer. */
function ListaFallas({ fallas }: { fallas: FallaVariador[] }) {
  const [q, setQ] = useState('')

  const visibles = useMemo(() => {
    const term = norm(q.trim())
    if (!term) return fallas
    return fallas.filter(
      (f) =>
        norm(f.codigo).includes(term) ||
        norm(f.nombre).includes(term) ||
        f.causas.some((c) => norm(c).includes(term)),
    )
  }, [fallas, q])

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: C.inkLo }} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Escribe el código que muestra el display: OLF, O-I, StF…"
          aria-label="Buscar código de falla"
          className="w-full rounded py-2.5 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
          style={{ background: C.bgPanel, border: `1px solid ${C.border}`, color: C.ink }}
        />
      </div>

      {visibles.length === 0 && (
        <p className="py-6 text-center text-[13px]" style={{ color: C.inkMid }}>
          Nada con «{q.trim()}». Puede ser un código de otro menú, o de comunicación.
        </p>
      )}

      {visibles.map((f) => (
        <div
          key={f.codigo}
          className="flex flex-col gap-2.5 rounded-lg p-4"
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
        >
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span
              className="rounded px-2 py-0.5 font-mono text-[15px] font-bold"
              style={{ color: C.crit, background: `color-mix(in srgb, ${C.crit} 16%, transparent)` }}
            >
              {f.codigo}
            </span>
            <span className="text-[14.5px] font-semibold" style={{ color: C.ink }}>{f.nombre}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <MetaText>Por qué pasa</MetaText>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-[13px]" style={{ color: C.inkMid, lineHeight: 1.5 }}>
                {f.causas.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
            <div className="flex flex-col gap-1">
              <MetaText>Qué hacer</MetaText>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4 text-[13px]" style={{ color: C.ink, lineHeight: 1.5 }}>
                {f.soluciones.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}


// ── Recetas por posición ──────────────────────────────────────────────────────
const COLOR_VALOR: Record<EstadoValor, string> = {
  confirmado: C.ok,
  pendiente: C.warn,
  sugerido: C.crit,
}
const ROTULO_VALOR: Record<EstadoValor, string> = {
  confirmado: 'Confirmado',
  pendiente: 'Pendiente',
  sugerido: 'Sugerido',
}

/**
 * Chip de código SAP: copia al portapapeles y ofrece abrirlo en Repuestos.
 * La pregunta que sigue a «se quemó» no es qué parámetros lleva — es si hay
 * repuesto y dónde está. El deep-link ?q=<SAP> ya lo usa MachineLearningPage.
 */
function ChipSap({ codigo }: { codigo?: string }) {
  const navigate = useNavigate()
  // /repuestos es ruta protegida y esta página es pública: sin sesión el botón
  // rebotaría a /login. Mejor no ofrecer la acción que no se puede cumplir.
  const { isAuthenticated } = useAuthStore()
  const [copiado, setCopiado] = useState(false)
  if (!codigo) return <span className="font-mono text-[12px]" style={{ color: C.inkGhost }}>—</span>
  return (
    <span
      className="inline-flex items-center overflow-hidden rounded"
      style={{ background: `color-mix(in srgb, ${C.aqua} 14%, transparent)` }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          navigator.clipboard?.writeText(codigo)
          setCopiado(true)
          window.setTimeout(() => setCopiado(false), 1400)
        }}
        title="Copiar el código SAP"
        className="inline-flex items-center gap-1 px-1.5 py-1 font-mono text-[11.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
        style={{ color: C.aquaBright }}
      >
        {codigo}
        {copiado ? <Check className="h-3 w-3" style={{ color: C.ok }} /> : <Copy className="h-3 w-3" />}
      </button>
      {isAuthenticated && (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/repuestos?q=${encodeURIComponent(codigo)}`) }}
          title="Ver stock y ubicación en Repuestos"
          aria-label={`Ver ${codigo} en Repuestos`}
          className="px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
          style={{ color: C.aquaBright, borderLeft: `1px solid color-mix(in srgb, ${C.aqua} 30%, transparent)` }}
        >
          <PackageSearch className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  )
}

/**
 * Cada cinta/equipo con SU variador y SU motor — sin generalizar por familia.
 * Tabla densa: una fila por posición, se expande para ver los valores.
 */
function RecetasPorEquipo({
  onAbrirFicha,
  posicionInicial,
}: {
  onAbrirFicha: (id: string) => void
  /** Viene de ?posicion=<id>: abre esa fila ya expandida y la deja a la vista. */
  posicionInicial?: string | null
}) {
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState<string | null>(posicionInicial ?? null)

  useEffect(() => {
    if (!posicionInicial) return
    setAbierta(posicionInicial)
    // La fila puede quedar bajo el pliegue en una tabla de 17: llevarla a la vista.
    const t = window.setTimeout(() => {
      document.getElementById(`pos-${posicionInicial}`)?.scrollIntoView({ block: 'center' })
    }, 120)
    return () => window.clearTimeout(t)
  }, [posicionInicial])

  const visibles = useMemo(() => {
    const term = norm(q.trim())
    if (!term) return POSICIONES
    return POSICIONES.filter((p) =>
      norm(`${p.equipo} ${p.zona} ${p.motor} ${p.sapMotor ?? ''} ${p.variadorEtiqueta ?? ''}`).includes(term),
    )
  }, [q])

  const COLS = ['Equipo', 'Variador', 'Motor', 'SAP motor', 'SAP variador', 'Seteos']

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[70ch] text-[13.5px] leading-relaxed" style={{ color: C.inkMid }}>
        La ficha del modelo dice qué parámetros existen; <strong style={{ color: C.ink }}>esta
        tabla dice qué valor va en cada cinta con su motor</strong>. Clic en una fila para ver
        los seteos. Ámbar es lo que falta levantar en terreno; rojo queda sugerido hasta
        verificarlo con la carga real.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: C.inkLo }} />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cinta, zona, motor o código SAP…"
            aria-label="Buscar posición"
            className="w-full rounded py-2.5 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
            style={{ background: C.bgPanel, border: `1px solid ${C.border}`, color: C.ink }}
          />
        </div>
        <div className="flex flex-wrap gap-3 text-[12px]" style={{ color: C.inkMid }}>
          {(['confirmado', 'pendiente', 'sugerido'] as const).map((e) => (
            <span key={e} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: COLOR_VALOR[e] }} />
              {ROTULO_VALOR[e]}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full border-collapse text-[13px] sm:min-w-[860px]">
          <thead>
            <tr>
              {COLS.map((h, k) => (
                <th
                  key={h}
                  className={`whitespace-nowrap px-3 py-2.5 text-left text-[12.5px] font-semibold${
                    k > 0 && k < COLS.length - 1 ? ' hidden sm:table-cell' : ''
                  }`}
                  style={{
                    background: C.bgPanel, color: C.inkMid, borderBottom: `1px solid ${C.border}`,
                    ...(k === 0 ? { position: 'sticky' as const, left: 0, zIndex: 2, borderRight: `1px solid ${C.border}` } : {}),
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={COLS.length} className="px-3 py-6 text-center text-[13px]" style={{ color: C.inkMid }}>
                  Ninguna posición coincide con «{q.trim()}».
                </td>
              </tr>
            )}
            {visibles.map((p) => {
              const fam = p.variadorId ? VARIADORES.find((f) => f.id === p.variadorId) : null
              const conf = p.valores.filter((v) => v.estado === 'confirmado').length
              const completo = conf === p.valores.length
              const expandida = abierta === p.id
              return (
                <Fragment key={p.id}>
                  <tr
                    id={`pos-${p.id}`}
                    onClick={() => setAbierta(expandida ? null : p.id)}
                    className="cursor-pointer"
                    style={{
                      borderBottom: `1px solid ${C.border}`,
                      ...(expandida ? { background: `color-mix(in srgb, ${C.aqua} 7%, transparent)` } : {}),
                    }}
                  >
                    <td
                      className="px-3 py-2.5 align-top sm:sticky sm:left-0 sm:z-[1] sm:min-w-[210px]"
                      style={{ background: C.surface, borderRight: `1px solid ${C.border}` }}
                    >
                      <span className="flex items-start gap-1.5">
                        <ChevronRight
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform"
                          style={{ color: C.inkLo, transform: expandida ? 'rotate(90deg)' : undefined }}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium leading-snug" style={{ color: C.ink }}>{p.equipo}</span>
                          <span className="block text-[11.5px]" style={{ color: C.inkMid }}>{p.zona}</span>
                          {/* En celular las columnas del medio se ocultan: su contenido reaparece acá. */}
                          <span className="mt-1.5 flex flex-col gap-0.5 sm:hidden">
                            <span className="text-[12px]" style={{ color: C.aquaBright }}>
                              {fam ? fam.nombre : 'Variador por identificar'}
                            </span>
                            <span className="font-mono text-[11.5px] leading-snug" style={{ color: C.inkMid }}>
                              {p.motor}
                            </span>
                            {p.sapMotor && (
                              <span className="font-mono text-[11.5px]" style={{ color: C.inkMid }}>
                                SAP {p.sapMotor}
                              </span>
                            )}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 align-top sm:table-cell" style={{ color: C.inkMid, minWidth: 160 }}>
                      {fam ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onAbrirFicha(fam.id) }}
                          className="rounded text-left font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
                          style={{ color: C.aquaBright }}
                        >
                          {fam.nombre}
                        </button>
                      ) : (
                        <span style={{ color: C.warn }}>Por identificar</span>
                      )}
                      {p.variadorEtiqueta && (
                        <span className="mt-0.5 block text-[11.5px]" style={{ color: C.warn }}>{p.variadorEtiqueta}</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2.5 align-top font-mono text-[12px] sm:table-cell" style={{ color: C.inkMid, minWidth: 200 }}>
                      {p.motor}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 align-top sm:table-cell"><ChipSap codigo={p.sapMotor} /></td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 align-top sm:table-cell"><ChipSap codigo={p.sapVariador} /></td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-top">
                      <span
                        className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11.5px] font-medium tabular-nums"
                        style={{
                          color: completo ? C.ok : C.warn,
                          background: `color-mix(in srgb, ${completo ? C.ok : C.warn} 16%, transparent)`,
                        }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: completo ? C.ok : C.warn }} />
                        {conf}/{p.valores.length}
                      </span>
                    </td>
                  </tr>

                  {expandida && (
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td colSpan={COLS.length} className="px-3 py-3" style={{ background: C.bgPanel }}>
                        <div className="flex flex-col gap-2.5">
                          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                            {p.valores.map((val) => (
                              <li key={val.codigo} className="flex flex-col gap-0.5">
                                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <span className="font-mono text-[12.5px] font-semibold" style={{ color: C.aquaBright }}>
                                    {val.codigo}
                                  </span>
                                  <span className="font-mono text-[12.5px] tabular-nums" style={{ color: C.ink }}>
                                    {val.valor}
                                  </span>
                                  <span
                                    className="rounded px-1.5 py-0.5 text-[11px]"
                                    style={{
                                      color: COLOR_VALOR[val.estado],
                                      background: `color-mix(in srgb, ${COLOR_VALOR[val.estado]} 16%, transparent)`,
                                    }}
                                  >
                                    {ROTULO_VALOR[val.estado]}
                                  </span>
                                </span>
                                {val.nota && (
                                  <span className="max-w-[70ch] text-[12px] leading-snug" style={{ color: C.inkMid }}>
                                    {val.nota}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                          {p.nota && (
                            <span
                              className="block pl-2 text-[12.5px] leading-snug"
                              style={{ color: C.inkMid, borderLeft: `2px solid ${C.border}` }}
                            >
                              {p.nota}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="m-0 text-[12.5px] tabular-nums" style={{ color: C.inkMid }}>
        {RESUMEN_RECETAS.posiciones} posiciones · {RESUMEN_RECETAS.confirmados} de{' '}
        {RESUMEN_RECETAS.total} valores confirmados. Los SAP de variador se agregan cuando se
        levanten; los de motor salen de la hoja «Motores nuevos planta» — confirmar que esa
        columna sea el SAP.
      </p>
    </div>
  )
}

// ── Equivalencias entre marcas ────────────────────────────────────────────────
/** El mismo dato en el dialecto de cada fabricante — para cambiar de marca. */
function TablaEquivalencias() {
  const [q, setQ] = useState('')

  const visibles = useMemo(() => {
    const term = norm(q.trim())
    if (!term) return EQUIVALENCIAS
    return EQUIVALENCIAS.filter(
      (e) =>
        norm(e.concepto).includes(term) ||
        Object.values(e.codigos).some((c) => c && norm(c).includes(term)),
    )
  }, [q])

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[68ch] text-[13.5px] leading-relaxed" style={{ color: C.inkMid }}>
        Para cuando el repuesto es de otra marca. Los guiones no son datos que falten:
        son equipos que <strong style={{ color: C.ink }}>no piden ese parámetro</strong> —
        la nota de cada fila explica por qué.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: C.inkLo }} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por concepto o por código: corriente, nCr, P-08…"
          aria-label="Buscar equivalencia"
          className="w-full rounded py-2.5 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
          style={{ background: C.bgPanel, border: `1px solid ${C.border}`, color: C.ink }}
        />
      </div>

      <div className="overflow-x-auto rounded" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th
                className="whitespace-nowrap px-3 py-2.5 text-left text-[12.5px] font-semibold"
                style={{
                  background: C.bgPanel, color: C.inkMid, borderBottom: `1px solid ${C.border}`,
                  position: 'sticky', left: 0, zIndex: 2, borderRight: `1px solid ${C.border}`,
                }}
              >
                Qué es
              </th>
              {COLUMNAS_EQUIVALENCIA.map((col) => (
                <th
                  key={col.id}
                  className="whitespace-nowrap px-3 py-2.5 text-left text-[12.5px] font-semibold"
                  style={{ background: C.bgPanel, color: C.inkMid, borderBottom: `1px solid ${C.border}` }}
                >
                  {col.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={COLUMNAS_EQUIVALENCIA.length + 1} className="px-3 py-6 text-center text-[13px]" style={{ color: C.inkMid }}>
                  Nada con «{q.trim()}».
                </td>
              </tr>
            )}
            {visibles.map((e) => (
              <tr
                key={e.concepto}
                style={{
                  background: e.dePlaca ? `color-mix(in srgb, ${C.warn} 7%, transparent)` : undefined,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <td
                  className="px-3 py-2.5 align-top"
                  style={{
                    color: C.ink, lineHeight: 1.5, minWidth: 190, maxWidth: 240,
                    position: 'sticky', left: 0, zIndex: 1,
                    background: e.dePlaca ? `color-mix(in srgb, ${C.warn} 7%, ${C.bg})` : C.bg,
                    borderRight: `1px solid ${C.border}`,
                  }}
                >
                  {e.concepto}
                  {e.dePlaca && (
                    <span
                      className="ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
                      style={{ color: C.warn, background: `color-mix(in srgb, ${C.warn} 16%, transparent)` }}
                    >
                      Placa
                    </span>
                  )}
                  {e.nota && (
                    <span
                      className="mt-1.5 block max-w-[62ch] pl-2 text-[12.5px]"
                      style={{ color: C.inkMid, borderLeft: `2px solid ${C.border}`, lineHeight: 1.5 }}
                    >
                      {e.nota}
                    </span>
                  )}
                </td>
                {COLUMNAS_EQUIVALENCIA.map((col) => {
                  const cod = e.codigos[col.id]
                  return (
                    <td
                      key={col.id}
                      className="whitespace-nowrap px-3 py-2.5 align-top font-mono text-[13px] font-semibold"
                      style={{ color: cod ? C.aquaBright : C.inkGhost }}
                    >
                      {cod ?? '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────
export function VariadoresPage() {
  const navigate = useNavigate()
  // La ficha abierta va en la URL: así se puede compartir el enlace de un equipo
  // por Telegram y quien lo abra cae directo en su ficha.
  const [params, setParams] = useSearchParams()
  const abierta = params.get('ficha')
  const vistaParam = params.get('vista')
  // ?posicion=<id> implica la vista de recetas: viene de la ficha de una máquina.
  const vista = params.get('posicion')
    ? 'recetas'
    : vistaParam === 'equivalencias' || vistaParam === 'recetas' ? vistaParam : 'catalogo'
  const [q, setQ] = useState('')
  const [seccion, setSeccion] = useState<'parametros' | 'fallas'>(
    params.get('seccion') === 'fallas' ? 'fallas' : 'parametros',
  )

  const abrirFicha = (id: string | null, sec: 'parametros' | 'fallas' = 'parametros') => {
    const p = new URLSearchParams(params)
    if (id) p.set('ficha', id)
    else p.delete('ficha')
    p.delete('posicion')
    // Abrir hace push (atrás del celular vuelve al catálogo); cerrar REEMPLAZA,
    // para que atrás no re-abra la ficha recién cerrada.
    setParams(p, { replace: id === null })
    setSeccion(sec)
    window.scrollTo(0, 0)
  }

  const cambiarVista = (v: 'catalogo' | 'equivalencias' | 'recetas') => {
    const p = new URLSearchParams(params)
    if (v !== 'catalogo') p.set('vista', v)
    else p.delete('vista')
    p.delete('ficha')
    setParams(p, { replace: true })
  }

  const ficha = abierta ? VARIADORES.find((f) => f.id === abierta) ?? null : null
  // Deep-link roto (typo, ficha renombrada, enlace viejo): avisar, no fallar en silencio.
  const fichaRota = abierta !== null && ficha === null

  const visibles = useMemo(() => {
    const term = norm(q.trim())
    if (!term) return VARIADORES
    return VARIADORES.filter((f) => norm(`${f.nombre} ${f.tipo} ${f.donde}`).includes(term))
  }, [q])

  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 pb-20 pt-7">
        {/* Cabecera */}
        <header className="flex flex-col gap-2.5">
          <button
            onClick={() => navigate('/aprendizaje')}
            className="inline-flex w-fit items-center gap-1.5 rounded text-[13.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
            style={{ color: C.aquaBright }}
          >
            <ArrowLeft className="h-4 w-4" /> Centro de Aprendizaje
          </button>
          <h1
            className="m-0 text-[clamp(1.55rem,4vw,2.1rem)] font-semibold leading-tight tracking-[-0.021em]"
            style={{ color: C.ink, textWrap: 'balance' }}
          >
            Variadores y partidores suaves
          </h1>
          <p className="m-0 max-w-[62ch] text-[15.5px] leading-relaxed" style={{ color: C.inkMid }}>
            Qué parámetros espera cada modelo y en qué menú están. Para cuando hay que
            reemplazar uno y configurarlo sin buscar el manual.
          </p>
        </header>

        {fichaRota && (
          <div
            className="flex gap-2.5 rounded-r px-4 py-3 text-[13px]"
            style={{
              color: C.inkMid,
              background: `color-mix(in srgb, ${C.crit} 9%, transparent)`,
              borderLeft: `3px solid ${C.crit}`,
            }}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.crit }} />
            <span>
              No existe la ficha «{abierta}» — puede ser un enlace viejo o un error de tipeo.
              Abajo está el catálogo completo.
            </span>
          </div>
        )}

        {/* Selector de vista — solo en el catálogo, no dentro de una ficha */}
        {ficha === null && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Vista">
            {([
              ['catalogo', 'Por modelo'],
              ['recetas', 'Por cinta / equipo'],
              ['equivalencias', 'Equivalencias entre marcas'],
            ] as const).map(([v, rotulo]) => {
              const on = vista === v
              return (
                <button
                  key={v}
                  onClick={() => cambiarVista(v)}
                  aria-pressed={on}
                  className="rounded px-3.5 py-1.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
                  style={{
                    background: on ? `color-mix(in srgb, ${C.aqua} 20%, transparent)` : C.bgPanel,
                    border: `1px solid ${on ? C.aqua : C.border}`,
                    color: C.ink,
                    fontWeight: on ? 600 : 400,
                  }}
                >
                  {rotulo}
                </button>
              )
            })}
          </div>
        )}

        {ficha === null && vista === 'equivalencias' ? (
          <TablaEquivalencias />
        ) : ficha === null && vista === 'recetas' ? (
          <RecetasPorEquipo onAbrirFicha={abrirFicha} posicionInicial={params.get('posicion')} />
        ) : ficha === null ? (
          <>
            {/* Buscador */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: C.inkLo }} />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar marca, modelo o dónde se usa…"
                aria-label="Buscar familia de variador"
                className="w-full rounded-md py-2.5 pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
                style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink }}
              />
            </div>

            {/* Fallas que coinciden con lo buscado — el display no dice la marca */}
            {(() => {
              const fallas = buscarFalla(q)
              if (!fallas.length) return null
              return (
                <div className="flex flex-col gap-2">
                  <MetaText>
                    {fallas.length} {fallas.length === 1 ? 'código de falla coincide' : 'códigos de falla coinciden'}
                  </MetaText>
                  <div className="flex flex-col gap-1.5">
                    {fallas.slice(0, 6).map((r) => (
                      <button
                        key={`${r.fichaId}-${r.falla.codigo}`}
                        onClick={() => abrirFicha(r.fichaId, 'fallas')}
                        className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-lg px-3.5 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
                        style={{ background: C.surface, border: `1px solid ${C.border}` }}
                      >
                        <span
                          className="rounded px-1.5 py-0.5 font-mono text-[13px] font-bold"
                          style={{ color: C.crit, background: `color-mix(in srgb, ${C.crit} 16%, transparent)` }}
                        >
                          {r.falla.codigo}
                        </span>
                        <span className="text-[13.5px] font-medium" style={{ color: C.ink }}>{r.falla.nombre}</span>
                        <span className="text-[12.5px]" style={{ color: C.inkMid }}>· {r.fichaNombre}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Familias */}
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {visibles.map((f) => {
                const r = resumenFicha(f)
                return (
                  <button
                    key={f.id}
                    onClick={() => abrirFicha(f.id)}
                    className="flex flex-col gap-2.5 rounded-lg p-4 text-left outline-none transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-16px_rgba(0,0,0,0.55)] focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
                    style={{ background: C.surface, border: `1px solid ${C.border}` }}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div>
                        <span className="block text-base font-semibold leading-tight tracking-[-0.014em]" style={{ color: C.ink }}>
                          {f.nombre}
                        </span>
                        <span className="mt-0.5 block text-xs" style={{ color: C.inkMid }}>{f.tipo}</span>
                      </div>
                      <EstadoChip estado={f.estado} />
                    </div>
                    <span className="text-[13px] leading-snug" style={{ color: C.inkMid }}>{f.donde}</span>
                    <span
                      className="mt-0.5 pt-2 text-xs tabular-nums"
                      style={{ color: C.inkMid, borderTop: `1px solid ${C.border}` }}
                    >
                      {f.menus
                        ? `${r.total} parámetros · ${r.menus} menús · ${r.dePlaca} de placa`
                        : f.resumen ?? '—'}
                    </span>
                  </button>
                )
              })}
              {visibles.length === 0 && (
                <p className="py-6 text-center text-[13px]" style={{ color: C.inkMid }}>
                  Ninguna familia coincide con esa búsqueda.
                </p>
              )}
            </div>

            {/* Motores */}
            <div className="mt-4">
              <h2 className="m-0 text-lg font-semibold tracking-[-0.014em]" style={{ color: C.ink }}>
                Motores de las cintas
              </h2>
              <p className="mb-3.5 mt-1 max-w-[62ch] text-[13.5px]" style={{ color: C.inkMid }}>
                Cuatro modelos cubren las ocho cintas. Potencia, reducción y rpm salen del código
                Sumitomo; los datos eléctricos hay que leerlos de la placa.
              </p>
              <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {MOTORES_CINTAS.map((m) => (
                  <div
                    key={m.modelo}
                    className="flex flex-col gap-2.5 rounded-lg p-4"
                    style={{ background: C.surface, border: `1px solid ${C.border}` }}
                  >
                    <h3 className="m-0 font-mono text-sm font-semibold tracking-[-0.01em]" style={{ color: C.aquaBright }}>
                      {m.modelo}
                      {m.porConfirmar && <span className="ml-1.5" style={{ color: C.warn }}>⏳</span>}
                    </h3>
                    <dl
                      className="grid grid-cols-3 gap-px overflow-hidden rounded"
                      style={{ background: C.border, border: `1px solid ${C.border}` }}
                    >
                      {[
                        ['Potencia', m.potencia],
                        ['Reducción', m.reduccion],
                        ['RPM salida', m.rpmSalida],
                      ].map(([rot, val]) => (
                        <div key={rot} className="flex flex-col gap-0.5 px-2.5 py-2" style={{ background: C.surface }}>
                          <dt className="text-[10.5px]" style={{ color: C.inkMid }}>{rot}</dt>
                          <dd className="m-0 font-mono text-[14.5px] font-semibold tabular-nums" style={{ color: C.ink }}>
                            {val}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <div className="flex flex-wrap gap-1.5">
                      {FALTAN_DE_PLACA.map((f) => (
                        <span
                          key={f}
                          className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
                          style={{ color: C.warn, background: `color-mix(in srgb, ${C.warn} 16%, transparent)` }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                    <span className="text-[12.5px] leading-snug" style={{ color: C.inkMid }}>{m.usos}</span>
                  </div>
                ))}
              </div>
            </div>

            <footer className="mt-4 flex flex-col gap-2 pt-5" style={{ borderTop: `1px solid ${C.border}` }}>
              <h3 className="m-0 text-sm font-semibold" style={{ color: C.ink }}>Estado del contenido</h3>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[13.5px]" style={{ color: C.inkMid }}>
                <li>
                  Las <strong style={{ color: C.ink }}>{VARIADORES.length} fichas</strong> con manual
                  descargado — {TOTAL_PARAMETROS} parámetros y {TOTAL_FALLAS} códigos de falla con
                  causa y acción.
                </li>
                <li>Los rangos que dicen «según calibre» se resuelven con la placa del variador instalado.</li>
                <li>
                  Red de planta confirmada en <strong style={{ color: C.ink }}>380 V</strong>: revisar que
                  la tensión cargada en cada variador sea 380 y no los 400 V nominales de la placa del motor.
                </li>
              </ul>
            </footer>
          </>
        ) : (
          <>
            <button
              onClick={() => abrirFicha(null)}
              className="inline-flex w-fit items-center gap-1.5 rounded text-[13.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
              style={{ color: C.aquaBright }}
            >
              <ArrowLeft className="h-4 w-4" /> Volver al catálogo
            </button>

            <div className="overflow-hidden rounded-md" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div
                className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-4"
                style={{ background: C.bgPanel, borderBottom: `1px solid ${C.border}` }}
              >
                <div>
                  <h2 className="m-0 text-[17.5px] font-semibold tracking-[-0.01em]" style={{ color: C.ink }}>
                    {ficha.nombre}
                  </h2>
                  <span className="mt-0.5 block text-[12.5px]" style={{ color: C.inkMid }}>
                    {ficha.tipo} · {ficha.donde}
                  </span>
                </div>
                <EstadoChip estado={ficha.estado} />
              </div>

              <div className="flex flex-col gap-4 p-5">
                {ficha.aviso && (
                  <div
                    className="flex gap-2.5 rounded-r px-4 py-3 text-[13px]"
                    style={{
                      color: C.inkMid,
                      background: `color-mix(in srgb, ${C.warn} 9%, transparent)`,
                      borderLeft: `3px solid ${C.warn}`,
                    }}
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.warn }} />
                    <span><strong style={{ color: C.ink }}>Ojo: </strong>{ficha.aviso}</span>
                  </div>
                )}

                {/* Parámetros / Fallas — solo si la ficha tiene ambas cosas */}
                {ficha.fallas && ficha.menus && (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sección de la ficha">
                    {([
                      ['parametros', 'Parámetros'],
                      ['fallas', `Fallas (${ficha.fallas.length})`],
                    ] as const).map(([s, rotulo]) => {
                      const on = seccion === s
                      return (
                        <button
                          key={s}
                          onClick={() => setSeccion(s)}
                          aria-pressed={on}
                          className="rounded px-3.5 py-1.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#5aa6e8]"
                          style={{
                            background: on ? `color-mix(in srgb, ${C.aqua} 20%, transparent)` : C.bgPanel,
                            border: `1px solid ${on ? C.aqua : C.border}`,
                            color: C.ink,
                            fontWeight: on ? 600 : 400,
                          }}
                        >
                          {rotulo}
                        </button>
                      )
                    })}
                  </div>
                )}

                {ficha.perillas ? (
                  <SimuladorPSR />
                ) : seccion === 'fallas' && ficha.fallas ? (
                  <ListaFallas fallas={ficha.fallas} />
                ) : (
                  <NavegadorParametros ficha={ficha} />
                )}

                <div
                  className="flex gap-2.5 rounded-r px-4 py-3 text-[12.5px]"
                  style={{
                    color: C.inkMid,
                    background: `color-mix(in srgb, ${C.aqua} 8%, transparent)`,
                    borderLeft: `3px solid ${C.aqua}`,
                  }}
                >
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.aqua }} />
                  <span><strong style={{ color: C.ink }}>Fuente: </strong>{ficha.fuente}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default VariadoresPage
