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
import { ArrowLeft, ArrowLeftRight, Search, AlertTriangle, BookOpen, ChevronRight, Copy, Check, PackageSearch, Plus, Loader2, ClipboardCheck, TrendingUp } from 'lucide-react'
import { useAuthStore } from '@/store'
import { crearAporte, aportesDePosicion, type AporteVariador } from '@/services/variadoresAportes'
import { getIncidents, resolveIncident } from '@/services/incidents'
import {
  registrarCambio,
  resumenCambios,
  RANGOS_TIEMPO,
  ETIQUETA_MODO,
  type ModoConfiguracion,
  type RangoTiempoId,
  type ResumenCambios,
} from '@/services/variadoresCambios'
import type { Incident } from '@/types'
import { LC as C } from '@/data/learningTheme'
import { FOCO, tinte, chip as chipEstilo, panel as panelEstilo, aviso } from '@/data/variadoresUi'
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
  buscarParametro,
  equivalenciaDe,
  compararEquivalencia,
  traducirReceta,
  alternativasPara,
  EQUIVALENCIAS,
  COLUMNAS_EQUIVALENCIA,
  tensionFinalPSR,
  escalonBajadaPSR,
  type FichaVariador,
  type EstadoFicha,
  type FallaVariador,
  type EstadoValor,
  type PosicionReceta,
  type ValorReceta,
  type EquivalenciaParametro,
} from '@/data/variadores'

/** lowercase + sin acentos, para búsqueda tolerante (mismo criterio que el hub). */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** Ancla estable de una fila de parámetro. Los códigos traen `-`, `/` y espacios. */
const idParametro = (codigo: string) => codigo.toLowerCase().replace(/[^a-z0-9]+/g, '-')

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
      className="inline-flex items-center gap-2 rounded px-2 py-1 text-[11px] font-medium whitespace-nowrap"
      style={{ color, background: tinte.suave(color) }}
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
      className="flex flex-col gap-6 rounded-lg p-5"
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

      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))' }}>
        {POTENCIOMETROS_PSR.map((p) => (
          <div key={p.id} className="flex flex-col items-center gap-2 text-center">
            <Perilla valor={v(p.id)} min={p.min} max={p.max} />
            <span className="font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: '#8b9aa6' }}>
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
            <span className="font-mono text-[11px]" style={{ color: '#5d6b76' }}>{p.rango}</span>
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
          <div key={rotulo} className="flex flex-col gap-1 px-3 py-3" style={{ background: '#131a20' }}>
            <dt className="font-mono text-[11px] uppercase tracking-[0.09em]" style={{ color: '#6d7d8a' }}>
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
/** Un parámetro al que hay que llegar desde fuera (buscador o equivalencias). */
export interface DestinoParametro {
  menu?: string
  codigo: string
}

/** Abre una ficha; con `destino`, parada directamente en un parámetro. */
type AbrirFicha = (
  id: string,
  seccion?: 'parametros' | 'fallas',
  destino?: DestinoParametro,
) => void

function NavegadorParametros({
  ficha,
  destino,
  onComparar,
}: {
  ficha: FichaVariador
  destino?: DestinoParametro | null
  /** Salta a la comparación entre marcas de ese código. */
  onComparar: (codigo: string) => void
}) {
  const claves = useMemo(() => Object.keys(ficha.menus ?? {}), [ficha])
  const [menu, setMenu] = useState(claves[0] ?? '')
  const [q, setQ] = useState('')
  const [soloPlaca, setSoloPlaca] = useState(false)
  /** Código que se viene a buscar: se abre su menú y se deja marcado. */
  const [resaltado, setResaltado] = useState<string | null>(null)

  // Llegar a la ficha no basta: hay que quedar PARADO en el parámetro. Se abre su
  // menú, se limpian los filtros que lo esconderían y se deja marcado hasta que
  // el técnico haga otra cosa — si el resalte se apagara solo, se pierde de vista
  // justo lo que se vino a ver.
  useEffect(() => {
    if (!destino) return
    const suMenu =
      destino.menu && claves.includes(destino.menu)
        ? destino.menu
        : claves.find((k) =>
            (ficha.menus?.[k] ?? []).some(
              (r) => r.codigo.toLowerCase() === destino.codigo.toLowerCase(),
            ),
          )
    if (suMenu) setMenu(suMenu)
    setQ('')
    setSoloPlaca(false)
    setResaltado(destino.codigo)
    // El scroll espera al render de la tabla con el menú ya cambiado.
    const t = window.setTimeout(() => {
      document
        .getElementById(`param-${idParametro(destino.codigo)}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 60)
    return () => window.clearTimeout(t)
  }, [destino, claves, ficha])

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
        <div className="flex flex-wrap gap-2">
          {claves.map((k) => {
            const i = k.indexOf(' ')
            const codigo = i > 0 ? k.slice(0, i) : k
            const nombre = i > 0 ? k.slice(i + 1) : ''
            const on = k === activo
            return (
              <button
                key={k}
                onClick={() => {
                  setMenu(k)
                  setResaltado(null)
                }}
                aria-pressed={on}
                className={`rounded px-3 py-2 text-[13px] transition-colors ${FOCO}`}
                style={{
                  background: on ? tinte.suave(C.aqua) : C.bgPanel,
                  border: `1px solid ${on ? C.aqua : C.border}`,
                  color: C.ink,
                  fontWeight: on ? 600 : 400,
                }}
              >
                <span className="mr-2 font-mono text-xs opacity-85">{codigo}</span>
                {nombre}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: C.inkLo }} />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setResaltado(null)
            }}
            placeholder="Buscar: nCr, rampa, corriente…"
            aria-label="Buscar parámetro"
            className={`w-full rounded py-3 pl-9 pr-3 text-sm ${FOCO}`}
            style={{ background: C.bgPanel, border: `1px solid ${C.border}`, color: C.ink }}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSoloPlaca((v) => !v)}
            aria-pressed={soloPlaca}
            className={`rounded px-3 py-2 text-[13px] transition-colors ${FOCO}`}
            style={{
              background: soloPlaca ? tinte.suave(C.warn) : C.bgPanel,
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
        <table className="w-full border-collapse text-[14px]" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              {['Cód.', 'Descripción', 'Rango', 'Fábrica'].map((h, i) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-3 py-3 text-left text-[13px] font-semibold"
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
            {visibles.map((r) => {
              const marcado = resaltado !== null && r.codigo.toLowerCase() === resaltado.toLowerCase()
              return (
              <tr
                key={r.codigo + r.descripcion}
                id={`param-${idParametro(r.codigo)}`}
                style={{
                  background: marcado
                    ? tinte.suave(C.aqua)
                    : r.dePlaca ? tinte.fila(C.warn) : undefined,
                  borderBottom: `1px solid ${C.border}`,
                  // Marca persistente: el técnico llegó acá buscando ESTA fila.
                  ...(marcado
                    ? { outline: `2px solid ${C.aqua}`, outlineOffset: '-2px' }
                    : {}),
                }}
              >
                <td
                  className="whitespace-nowrap px-3 py-3 align-top font-mono font-semibold"
                  style={{
                    color: C.aquaBright, position: 'sticky', left: 0, zIndex: 1,
                    // Fondo OPACO: mezclar contra surface (no transparent) para que no se vea lo que pasa debajo.
                    background: marcado
                      ? tinte.opaco(C.aqua, C.surface)
                      : r.dePlaca ? tinte.opaco(C.warn, C.surface) : C.surface,
                    borderRight: `1px solid ${C.border}`,
                  }}
                >
                  {r.codigo}
                  {(global || marcado) && (
                    <span className="mt-1 block font-sans text-[11px] font-normal" style={{ color: C.inkLo }}>
                      {r.menu.split(' ')[0]}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 align-top" style={{ color: C.ink, lineHeight: 1.5 }}>
                  {r.descripcion}
                  {r.dePlaca && (
                    <span
                      className="ml-2 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium"
                      style={{ color: C.warn, background: tinte.suave(C.warn) }}
                    >
                      Placa
                    </span>
                  )}
                  {/* Si el parámetro tiene equivalente en otras marcas, se llega
                      desde acá: parado en la ficha es donde surge la pregunta. */}
                  {equivalenciaDe(r.codigo) && (
                    <button
                      onClick={() => onComparar(r.codigo)}
                      className={`ml-2 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium align-middle ${FOCO}`}
                      style={{
                        color: C.aquaBright,
                        background: tinte.suave(C.aqua),
                        border: `1px solid ${tinte.borde(C.aqua)}`,
                      }}
                      title={`Ver ${r.codigo} en las otras marcas`}
                    >
                      <ArrowLeftRight className="h-3 w-3" aria-hidden />
                      Otras marcas
                    </button>
                  )}
                  {r.nota && (
                    <span
                      className="mt-2 block max-w-[56ch] pl-2 text-[13px]"
                      style={{ color: C.inkMid, borderLeft: `2px solid ${C.border}`, lineHeight: 1.5 }}
                    >
                      {r.nota}
                    </span>
                  )}
                  {r.opciones && (
                    <ul className="mt-2 flex list-none flex-col gap-2 pl-0">
                      {r.opciones.map((o) => (
                        <li key={o.valor} className="text-[13px]" style={{ lineHeight: 1.5 }}>
                          <span className="mr-2 font-mono font-semibold" style={{ color: C.aquaBright }}>
                            {o.valor}
                          </span>
                          <span style={{ color: C.ink }}>{o.que}</span>
                          {o.cuando && <span style={{ color: C.inkMid }}> — {o.cuando}</span>}
                          {o.requiere && (
                            <span className="ml-2 whitespace-nowrap text-[11px]" style={{ color: C.inkLo }}>
                              ({o.requiere})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-top font-mono text-[13px] tabular-nums" style={{ color: C.inkMid }}>
                  {r.rango}
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-top font-mono text-[13px] tabular-nums" style={{ color: C.inkMid }}>
                  {r.fabrica}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <MetaText>
        <span
          className="mr-2 inline-flex items-center rounded px-2 py-1 text-[11px] font-medium"
          style={{ color: C.warn, background: tinte.suave(C.warn) }}
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
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: C.inkLo }} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Escribe el código que muestra el display: OLF, O-I, StF…"
          aria-label="Buscar código de falla"
          className={`w-full rounded py-3 pl-9 pr-3 text-sm ${FOCO}`}
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
          className="flex flex-col gap-3 rounded-lg p-4"
          style={panelEstilo}
        >
          <div className="flex flex-wrap items-baseline gap-3">
            <span
              className="rounded px-2 py-1 font-mono text-[15px] font-bold"
              style={{ color: C.crit, background: tinte.suave(C.crit) }}
            >
              {f.codigo}
            </span>
            <span className="text-[14px] font-semibold" style={{ color: C.ink }}>{f.nombre}</span>
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
      style={{ background: tinte.suave(C.aqua) }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          navigator.clipboard?.writeText(codigo)
          setCopiado(true)
          window.setTimeout(() => setCopiado(false), 1400)
        }}
        title="Copiar el código SAP"
        className={`inline-flex items-center gap-1 px-2 py-1 font-mono text-[12px] font-medium ${FOCO}`}
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
          className={`px-2 py-1 ${FOCO}`}
          style={{ color: C.aquaBright, borderLeft: `1px solid ${tinte.borde(C.aqua)}` }}
        >
          <PackageSearch className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  )
}

/**
 * Lo que el módulo demuestra. Aparece solo cuando hay cambios registrados: un
 * panel de ceros no dice nada y ocupa la pantalla que el técnico necesita.
 */
function PanelEvidencia() {
  const [r, setR] = useState<ResumenCambios | null>(null)
  useEffect(() => {
    let vivo = true
    resumenCambios().then((x) => { if (vivo) setR(x) })
    return () => { vivo = false }
  }, [])
  if (!r || r.total === 0) return null

  const ahorro = r.minutosClonado !== null && r.minutosManual !== null
    ? r.minutosManual - r.minutosClonado
    : null

  return (
    <div className="flex flex-col gap-3 rounded-lg p-4" style={panelEstilo}>
      <span className="inline-flex items-center gap-2 text-[14px] font-semibold" style={{ color: C.ink }}>
        <TrendingUp className="h-4 w-4" style={{ color: C.ok }} />
        Lo que llevamos medido
      </span>
      <div className="grid gap-px overflow-hidden rounded" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', background: C.border, border: `1px solid ${C.border}` }}>
        {[
          ['Cambios registrados', String(r.total), null],
          ['Mediana de intervención', `${r.medianaMinutos} min`, null],
          ['Clonando', r.minutosClonado !== null ? `${r.minutosClonado} min` : '—', `${r.clonados} cambios`],
          ['A mano', r.minutosManual !== null ? `${r.minutosManual} min` : '—', `${r.manuales} cambios`],
        ].map(([rot, val, pie]) => (
          <div key={rot as string} className="flex flex-col gap-1 px-3 py-3" style={{ background: C.surface }}>
            <span className="text-[12px]" style={{ color: C.inkMid }}>{rot}</span>
            <span className="font-mono text-[22px] font-semibold tabular-nums" style={{ color: C.ink }}>{val}</span>
            {pie && <span className="text-[11px]" style={{ color: C.inkLo }}>{pie}</span>}
          </div>
        ))}
      </div>
      {ahorro !== null && ahorro > 0 && (
        <span className="text-[13px]" style={{ color: C.inkMid }}>
          Clonar ahorra <strong style={{ color: C.ok }}>{ahorro} min</strong> por cambio frente a
          cargar a mano — el número que justifica tener el repuesto del mismo modelo en bodega.
        </span>
      )}
    </div>
  )
}

/**
 * Registrar el cambio de un variador — el paso que convierte el catálogo en evidencia.
 *
 * CIERRA una incidencia existente en vez de crear una nueva: en la vida real
 * alguien ya levantó «la cinta no arranca» antes de que llegara el técnico, y
 * crear otra haría que los KPIs contaran el mismo evento dos veces.
 *
 * No hay puente entre el slug del Centro de Aprendizaje y el equipmentId de
 * Firestore, así que no se filtra por equipo: se listan las incidencias
 * abiertas y el técnico elige la suya. Inventar un mapeo que no se puede
 * verificar sería peor que pedir un toque más.
 */
function RegistrarCambio({ posicion }: { posicion: PosicionReceta }) {
  const { isAuthenticated, user } = useAuthStore()
  const [abierto, setAbierto] = useState(false)
  const [incidencias, setIncidencias] = useState<Incident[] | null>(null)
  const [elegida, setElegida] = useState<string | null>(null)
  const [modo, setModo] = useState<ModoConfiguracion | null>(null)
  const [rango, setRango] = useState<RangoTiempoId | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fam = VARIADORES.find((f) => f.id === posicion.variadorId)

  const abrir = async () => {
    setAbierto(true)
    if (incidencias) return
    try {
      // Abiertas = todo lo que aún no se resolvió ni cerró.
      const todas = await Promise.all(
        (['pendiente', 'confirmada', 'en_proceso'] as const).map((st) =>
          getIncidents({ status: st, limit: 25 }),
        ),
      )
      setIncidencias(todas.flat())
    } catch {
      // Vacío + error a la vez diría «no hay incidencias», que es distinto de
      // «no las pude leer». El mensaje de error manda.
      setIncidencias([])
      setError('No se pudieron cargar las incidencias abiertas. Revisa la conexión o tus permisos.')
    }
  }

  const guardar = async () => {
    if (!elegida || !modo || !rango || guardando) return
    const inc = incidencias?.find((i) => i.id === elegida)
    const r = RANGOS_TIEMPO.find((x) => x.id === rango)
    if (!inc || !r) return
    setGuardando(true)
    setError(null)
    try {
      const resolucion =
        `Cambio de variador en ${posicion.equipo}. ` +
        `${fam?.nombre ?? 'Variador'} — ${ETIQUETA_MODO[modo].toLowerCase()}. ` +
        `Duración de la intervención: ${r.label}.`
      await resolveIncident(inc.id, resolucion, undefined, user?.id, user?.nombre)
      await registrarCambio({
        incidentId: inc.id,
        incidentTitulo: inc.titulo,
        posicionId: posicion.id,
        posicionEquipo: posicion.equipo,
        variadorId: posicion.variadorId ?? '',
        variadorNombre: fam?.nombre ?? '',
        modo,
        rango,
        minutosTrabajo: r.minutos,
        creadoPor: user?.id ?? '',
        creadoPorNombre: user?.nombre ?? undefined,
      })
      setListo(true)
    } catch {
      setError('No se pudo registrar. Revisa la conexión o tus permisos.')
    } finally {
      setGuardando(false)
    }
  }

  if (!isAuthenticated) return null

  if (listo) {
    return (
      <div
        className="mt-3 flex flex-col gap-2 rounded-lg px-4 py-3"
        style={{ background: tinte.suave(C.ok), border: `1px solid ${tinte.borde(C.ok)}` }}
      >
        <span className="text-[14px] font-semibold" style={{ color: C.ok }}>Registrado ✓</span>
        <span className="text-[13px]" style={{ color: C.inkMid }}>
          La incidencia quedó resuelta y el cambio anotado.
          {posicion.valores.some((v) => v.estado === 'pendiente') &&
            ' Si tienes la placa a la vista, es el momento de completar los datos que faltan arriba.'}
        </span>
      </div>
    )
  }

  if (!abierto) {
    return (
      <button
        onClick={abrir}
        className={`mt-3 inline-flex w-fit items-center gap-2 rounded px-3 py-2 text-[13px] font-medium ${FOCO}`}
        style={{ color: C.aquaBright, background: tinte.suave(C.aqua) }}
      >
        <ClipboardCheck className="h-3.5 w-3.5" />
        Registré este cambio
      </button>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg px-4 py-3" style={{ background: C.bgPanel, border: `1px solid ${C.border}` }}>
      <div className="flex flex-col gap-2">
        <MetaText>¿Qué incidencia resolvió este cambio?</MetaText>
        {incidencias === null ? (
          <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: C.inkMid }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando incidencias abiertas…
          </span>
        ) : incidencias.length === 0 && !error ? (
          <span className="text-[13px]" style={{ color: C.warn }}>
            No hay incidencias abiertas. El cambio se registra cerrando una existente,
            así los KPIs no cuentan el mismo evento dos veces — si esta falla no está
            levantada, créala primero desde Incidencias.
          </span>
        ) : (
          <div className="flex flex-col gap-1">
            {incidencias.slice(0, 8).map((i) => (
              <button
                key={i.id}
                onClick={() => setElegida(i.id)}
                aria-pressed={elegida === i.id}
                className={`rounded px-3 py-2 text-left text-[13px] ${FOCO}`}
                style={{
                  background: elegida === i.id ? tinte.suave(C.aqua) : C.surface,
                  border: `1px solid ${elegida === i.id ? C.aqua : C.border}`,
                  color: C.ink,
                }}
              >
                {i.titulo}
                {i.descripcion ? (
                  <span className="mt-1 block text-[12px]" style={{ color: C.inkMid }}>
                    {i.descripcion.slice(0, 90)}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      {elegida && (
        <>
          <div className="flex flex-col gap-2">
            <MetaText>¿Cómo lo configuraste?</MetaText>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ETIQUETA_MODO) as ModoConfiguracion[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setModo(m)}
                  aria-pressed={modo === m}
                  className={`rounded px-3 py-2 text-[13px] ${FOCO}`}
                  style={{
                    background: modo === m ? tinte.suave(C.aqua) : C.surface,
                    border: `1px solid ${modo === m ? C.aqua : C.border}`,
                    color: C.ink, fontWeight: modo === m ? 600 : 400,
                  }}
                >
                  {ETIQUETA_MODO[m]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <MetaText>¿Cuánto te tomó?</MetaText>
            <div className="flex flex-wrap gap-2">
              {RANGOS_TIEMPO.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRango(r.id)}
                  aria-pressed={rango === r.id}
                  className={`rounded px-3 py-2 font-mono text-[13px] ${FOCO}`}
                  style={{
                    background: rango === r.id ? tinte.suave(C.aqua) : C.surface,
                    border: `1px solid ${rango === r.id ? C.aqua : C.border}`,
                    color: C.ink, fontWeight: rango === r.id ? 600 : 400,
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {error && <span className="text-[13px]" style={{ color: C.crit }}>{error}</span>}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={guardar}
          disabled={!elegida || !modo || !rango || guardando}
          className={`inline-flex items-center gap-2 rounded px-3 py-2 text-[13px] font-semibold disabled:opacity-45 ${FOCO}`}
          style={{ color: C.ok, background: tinte.suave(C.ok) }}
        >
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Guardar
        </button>
        <button
          onClick={() => setAbierto(false)}
          className={`rounded px-3 py-2 text-[13px] ${FOCO}`}
          style={{ color: C.inkMid }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

/**
 * Aportar el valor de UN parámetro desde terreno.
 *
 * No edita el catálogo: registra una propuesta. Los datos viven en el repo y un
 * valor que fija la protección térmica de un motor no se cambia sin revisión.
 * Pero el aporte queda visible enseguida, así el siguiente que pase ya lo tiene
 * aunque todavía no esté oficializado.
 */
function AportarValor({
  posicion,
  valor,
  aportes,
  onAportado,
}: {
  posicion: PosicionReceta
  valor: ValorReceta
  aportes: AporteVariador[]
  onAportado: (a: AporteVariador) => void
}) {
  const { isAuthenticated, user } = useAuthStore()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mios = aportes.filter((a) => a.codigo === valor.codigo)
  const faltante = valor.estado === 'pendiente'

  const guardar = async () => {
    const v = texto.trim()
    if (!v || guardando) return
    setGuardando(true)
    setError(null)
    const aporte = {
      tipo: (faltante ? 'dato_faltante' : 'correccion') as AporteVariador['tipo'],
      posicionId: posicion.id,
      posicionEquipo: posicion.equipo,
      codigo: valor.codigo,
      valor: v,
      valorAnterior: valor.valor,
      creadoPor: user?.id ?? '',
      creadoPorNombre: user?.nombre ?? undefined,
    }
    try {
      await crearAporte(aporte)
      onAportado(aporte as AporteVariador)
      setTexto('')
      setAbierto(false)
    } catch {
      setError('No se pudo guardar. Revisa la conexión o tus permisos.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <>
      {mios.map((a, i) => (
        <span
          key={a.id ?? i}
          className="mt-1 block text-[12px]"
          style={{ color: C.ok }}
        >
          Aportado desde terreno: <span className="font-mono font-semibold">{a.valor}</span>
          {a.creadoPorNombre ? ` — ${a.creadoPorNombre}` : ''} · pendiente de incorporar al catálogo
        </span>
      ))}

      {isAuthenticated && !abierto && (
        <button
          onClick={() => setAbierto(true)}
          className={`mt-1 inline-flex w-fit items-center gap-1 rounded px-2 py-1 text-[12px] ${FOCO}`}
          style={{ color: C.aquaBright, background: tinte.suave(C.aqua) }}
        >
          <Plus className="h-3 w-3" />
          {faltante ? 'Tengo este dato' : 'No coincide'}
        </button>
      )}

      {abierto && (
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setAbierto(false) }}
            placeholder={faltante ? 'Valor de la placa…' : 'Valor real…'}
            aria-label={`Valor de ${valor.codigo}`}
            className={`rounded px-2 py-1 font-mono text-[13px] ${FOCO}`}
            style={{ background: C.bgPanel, border: `1px solid ${C.border}`, color: C.ink, width: 130 }}
          />
          <button
            onClick={guardar}
            disabled={guardando || !texto.trim()}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium disabled:opacity-50 ${FOCO}`}
            style={{ color: C.ok, background: tinte.suave(C.ok) }}
          >
            {guardando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Guardar
          </button>
          <button
            onClick={() => { setAbierto(false); setError(null) }}
            className={`rounded px-2 py-1 text-[12px] ${FOCO}`}
            style={{ color: C.inkMid }}
          >
            Cancelar
          </button>
          {error && <span className="text-[12px]" style={{ color: C.crit }}>{error}</span>}
        </span>
      )}
    </>
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
  // Los aportes se piden solo al expandir: no tiene sentido traer 17 consultas
  // para una tabla que se mira de reojo.
  const [aportes, setAportes] = useState<AporteVariador[]>([])

  useEffect(() => {
    if (!abierta) { setAportes([]); return }
    let vivo = true
    aportesDePosicion(abierta).then((a) => { if (vivo) setAportes(a) })
    return () => { vivo = false }
  }, [abierta])

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
      <p className="m-0 max-w-[70ch] text-[14px] leading-relaxed" style={{ color: C.inkMid }}>
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
            className={`w-full rounded py-3 pl-9 pr-3 text-sm ${FOCO}`}
            style={{ background: C.bgPanel, border: `1px solid ${C.border}`, color: C.ink }}
          />
        </div>
        <div className="flex flex-wrap gap-3 text-[12px]" style={{ color: C.inkMid }}>
          {(['confirmado', 'pendiente', 'sugerido'] as const).map((e) => (
            <span key={e} className="inline-flex items-center gap-2">
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
                  className={`whitespace-nowrap px-3 py-3 text-left text-[13px] font-semibold${
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
                      ...(expandida ? { background: tinte.fila(C.aqua) } : {}),
                    }}
                  >
                    <td
                      className="px-3 py-3 align-top sm:sticky sm:left-0 sm:z-[1] sm:min-w-[210px]"
                      style={{ background: C.surface, borderRight: `1px solid ${C.border}` }}
                    >
                      <span className="flex items-start gap-2">
                        <ChevronRight
                          className="mt-1 h-3.5 w-3.5 shrink-0 transition-transform"
                          style={{ color: C.inkLo, transform: expandida ? 'rotate(90deg)' : undefined }}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium leading-snug" style={{ color: C.ink }}>{p.equipo}</span>
                          <span className="block text-[12px]" style={{ color: C.inkMid }}>{p.zona}</span>
                          {/* En celular las columnas del medio se ocultan: su contenido reaparece acá. */}
                          <span className="mt-2 flex flex-col gap-1 sm:hidden">
                            <span className="text-[12px]" style={{ color: C.aquaBright }}>
                              {fam ? fam.nombre : 'Variador por identificar'}
                            </span>
                            <span className="font-mono text-[12px] leading-snug" style={{ color: C.inkMid }}>
                              {p.motor}
                            </span>
                            {p.sapMotor && (
                              <span className="font-mono text-[12px]" style={{ color: C.inkMid }}>
                                SAP {p.sapMotor}
                              </span>
                            )}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 align-top sm:table-cell" style={{ color: C.inkMid, minWidth: 160 }}>
                      {fam ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onAbrirFicha(fam.id) }}
                          className={`rounded text-left font-medium hover:underline ${FOCO}`}
                          style={{ color: C.aquaBright }}
                        >
                          {fam.nombre}
                        </button>
                      ) : (
                        <span style={{ color: C.warn }}>Por identificar</span>
                      )}
                      {p.variadorEtiqueta && (
                        <span className="mt-1 block text-[12px]" style={{ color: C.warn }}>{p.variadorEtiqueta}</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 align-top font-mono text-[12px] sm:table-cell" style={{ color: C.inkMid, minWidth: 200 }}>
                      {p.motor}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 align-top sm:table-cell"><ChipSap codigo={p.sapMotor} /></td>
                    <td className="hidden whitespace-nowrap px-3 py-3 align-top sm:table-cell"><ChipSap codigo={p.sapVariador} /></td>
                    <td className="whitespace-nowrap px-3 py-3 align-top">
                      <span
                        className="inline-flex items-center gap-2 rounded px-2 py-1 text-[12px] font-medium tabular-nums"
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
                        <div className="flex flex-col gap-3">
                          <ul className="m-0 flex list-none flex-col gap-2 p-0">
                            {p.valores.map((val) => (
                              <li key={val.codigo} className="flex flex-col gap-1">
                                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                  <span className="font-mono text-[13px] font-semibold" style={{ color: C.aquaBright }}>
                                    {val.codigo}
                                  </span>
                                  <span className="font-mono text-[13px] tabular-nums" style={{ color: C.ink }}>
                                    {val.valor}
                                  </span>
                                  <span
                                    className="rounded px-2 py-1 text-[11px]"
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
                                <AportarValor
                                  posicion={p}
                                  valor={val}
                                  aportes={aportes}
                                  onAportado={(a) => setAportes((prev) => [a, ...prev])}
                                />
                              </li>
                            ))}
                          </ul>
                          {p.nota && (
                            <span
                              className="block pl-2 text-[13px] leading-snug"
                              style={{ color: C.inkMid, borderLeft: `2px solid ${C.border}` }}
                            >
                              {p.nota}
                            </span>
                          )}
                          <ReemplazoOtraMarca posicion={p} onAbrirFicha={onAbrirFicha} />
                          <RegistrarCambio posicion={p} />
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

      <PanelEvidencia />

      <p className="m-0 text-[13px] tabular-nums" style={{ color: C.inkMid }}>
        {RESUMEN_RECETAS.posiciones} posiciones · {RESUMEN_RECETAS.confirmados} de{' '}
        {RESUMEN_RECETAS.total} valores confirmados. Los SAP de variador se agregan cuando se
        levanten; los de motor salen de la hoja «Motores nuevos planta» — confirmar que esa
        columna sea el SAP.
      </p>
    </div>
  )
}

// ── Reemplazo por otra marca ──────────────────────────────────────────────────
/**
 * La misma cinta, configurada con el variador que haya en bodega.
 *
 * El caso real: se quema el V20 del cuello de cisnes, no hay otro V20 y sí un
 * ATV312. Sin esto hay que traducir a mano, con la línea parada.
 *
 * Se muestran TRES bloques distintos a propósito, porque cambiar de marca no es
 * renombrar códigos: lo que se traduce, lo que el repuesto pide de más — ahí
 * está el peligro: si nadie lo carga, la cinta anda igual hasta que arranca sola
 * o se quema el motor — y lo que el repuesto no pide.
 */
function ReemplazoOtraMarca({
  posicion,
  onAbrirFicha,
}: {
  posicion: PosicionReceta
  onAbrirFicha: AbrirFicha
}) {
  const [destinoId, setDestinoId] = useState<string | null>(null)
  const alternativas = useMemo(() => alternativasPara(posicion), [posicion])
  const t = useMemo(
    () => (destinoId ? traducirReceta(posicion, destinoId) : null),
    [posicion, destinoId],
  )

  if (posicion.variadorId === null || alternativas.length === 0) return null

  return (
    <div className="flex flex-col gap-3 rounded-lg p-3" style={panelEstilo}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold" style={{ color: C.ink }}>
          Si hay que reemplazarlo, voy a poner un:
        </span>
        {alternativas.map((f) => {
          const on = f.id === destinoId
          return (
            <button
              key={f.id}
              onClick={() => setDestinoId(on ? null : f.id)}
              aria-pressed={on}
              className={`rounded px-3 py-2 text-[12px] transition-colors ${FOCO}`}
              style={{
                background: on ? tinte.suave(C.aqua) : C.bgPanel,
                border: `1px solid ${on ? C.aqua : C.border}`,
                color: on ? C.aquaBright : C.ink,
                fontWeight: on ? 600 : 400,
              }}
            >
              {f.nombre}
            </button>
          )
        })}
      </div>

      {t && (
        <div className="flex flex-col gap-3">
          {/* Un partidor suave no reemplaza al variador de una cinta. */}
          {!t.compatible && (
            <div
              className="rounded px-3 py-2 text-[13px] leading-snug"
              style={aviso(C.danger)}
            >
              <strong>No sirve para esta cinta.</strong> {t.motivo} Al revés sí se puede: un
              variador reemplaza a un partidor suave.
            </div>
          )}

          {t.compatible && (
            <>
              <div className="overflow-x-auto rounded" style={{ border: `1px solid ${C.border}` }}>
                <table className="w-full border-collapse text-[13px]" style={{ minWidth: 520 }}>
                  <thead>
                    <tr>
                      {['Qué es', 'Ahora', `En el ${t.destino.nombre}`, 'Valor'].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3 py-2 text-left text-[12px] font-semibold"
                          style={{ background: C.bgPanel, color: C.inkMid, borderBottom: `1px solid ${C.border}` }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.filas.map((f) => (
                      <tr key={f.codigoOrigen} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td className="px-3 py-2 align-top" style={{ color: C.ink, lineHeight: 1.5 }}>
                          {f.concepto}
                          {f.codigoDestino === null && (
                            <span className="mt-1 block text-[12px]" style={{ color: C.inkMid }}>
                              El {t.destino.nombre} no lo pide. No es un dato que falte.
                            </span>
                          )}
                          {f.codigoDestino !== null && !f.valorTransferible && (
                            <span className="mt-1 block text-[12px]" style={{ color: C.warn }}>
                              Mismo concepto, pero cada marca lo expresa distinto: NO copiar el
                              valor. Abrir el parámetro y cargarlo en las unidades del repuesto.
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-top font-mono" style={{ color: C.inkLo }}>
                          {f.codigoOrigen}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-top font-mono font-semibold">
                          {f.codigoDestino ? (
                            <button
                              onClick={() =>
                                onAbrirFicha(t.destino.id, 'parametros', { codigo: f.codigoDestino as string })
                              }
                              className={`rounded font-mono font-semibold underline decoration-dotted underline-offset-4 ${FOCO}`}
                              style={{ color: C.aquaBright }}
                            >
                              {f.codigoDestino}
                            </button>
                          ) : (
                            <span style={{ color: C.inkGhost }}>—</span>
                          )}
                        </td>
                        <td
                          className="whitespace-nowrap px-3 py-2 align-top font-mono tabular-nums"
                          style={{
                            color: f.codigoDestino && f.valorTransferible ? C.ink : C.inkGhost,
                            // Tachado cuando el valor NO se copia: que no se pueda
                            // leer la fila de corrido y transcribirlo por inercia.
                            textDecoration: f.codigoDestino && !f.valorTransferible ? 'line-through' : undefined,
                          }}
                        >
                          {f.valor}
                          <span
                            className="ml-2 rounded px-2 py-1 text-[11px] font-sans"
                            style={{
                              color: COLOR_VALOR[f.estado],
                              background: tinte.suave(COLOR_VALOR[f.estado]),
                            }}
                          >
                            {ROTULO_VALOR[f.estado]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* El punto ciego: lo que el repuesto pide y la receta no traía. */}
              {t.pideAdemas.length > 0 && (
                <div className="rounded px-3 py-2 text-[13px] leading-relaxed" style={aviso(C.warn)}>
                  <strong>
                    El {t.destino.nombre} pide {t.pideAdemas.length}{' '}
                    {t.pideAdemas.length === 1 ? 'parámetro' : 'parámetros'} que esta receta no
                    traía
                  </strong>{' '}
                  — el equipo anterior no los usaba. Hay que cargarlos igual:
                  <ul className="mt-2 flex list-none flex-col gap-2 pl-0">
                    {t.pideAdemas.map((x) => (
                      <li key={x.codigo}>
                        <button
                          onClick={() => onAbrirFicha(t.destino.id, 'parametros', { codigo: x.codigo })}
                          className={`rounded font-mono font-semibold underline decoration-dotted underline-offset-4 ${FOCO}`}
                          style={{ color: C.aquaBright }}
                        >
                          {x.codigo}
                        </button>{' '}
                        <span style={{ color: C.ink }}>{x.concepto}</span>
                        {x.menu && (
                          <span className="ml-2 font-mono text-[11px]" style={{ color: C.inkLo }}>
                            menú {x.menu.split(' ')[0]}
                            {x.rango && x.rango !== '—' ? ` · ${x.rango}` : ''}
                            {x.fabrica && x.fabrica !== '—' ? ` · fábrica ${x.fabrica}` : ''}
                          </span>
                        )}
                        {x.nota && (
                          <span className="mt-1 block text-[12px]" style={{ color: C.inkMid }}>
                            {x.nota}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {t.sinTraducir.length > 0 && (
                <MetaText>
                  Sin equivalencia conocida, van tal cual:{' '}
                  <span className="font-mono">
                    {t.sinTraducir.map((v) => v.codigo).join(' · ')}
                  </span>
                </MetaText>
              )}

              <MetaText>
                Antes de cargar nada: verificar que el calibre del repuesto aguante la corriente
                de este motor.
              </MetaText>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Buscador global de parámetros ─────────────────────────────────────────────
/**
 * Un parámetro, en las 8 familias a la vez.
 *
 * Responde las dos preguntas que se hacen con el variador enfrente:
 *   · ¿dónde está? — familia y menú de cada coincidencia
 *   · ¿cuál es el equivalente acá? — la fila de equivalencias del concepto,
 *     para pasar de «tengo nCr en el manual del Altivar» a «en este SEW es P-08»
 */
function BuscadorParametros({
  onAbrirFicha,
  comparar,
}: {
  onAbrirFicha: AbrirFicha
  /** Código que viene por ?comparar= desde la ficha de un equipo. */
  comparar?: string | null
}) {
  const [q, setQ] = useState(comparar ?? '')
  /** Concepto elegido a mano desde un resultado; manda sobre el detectado. */
  const [elegida, setElegida] = useState<EquivalenciaParametro | null>(null)

  // Llegar por ?comparar= deja la búsqueda ya hecha: se ve la comparación arriba
  // y abajo dónde vive ese código, sin tener que teclearlo de nuevo.
  useEffect(() => {
    if (comparar) {
      setQ(comparar)
      setElegida(null)
    }
  }, [comparar])

  const hallazgos = useMemo(() => buscarParametro(q), [q])
  /** Si lo buscado es un código o concepto conocido, su fila de equivalencias. */
  const detectada = useMemo(() => {
    if (q.trim().length < 2) return null
    const porCodigo = equivalenciaDe(q)
    if (porCodigo) return porCodigo
    const t = norm(q.trim())
    return EQUIVALENCIAS.find((e) => norm(e.concepto).includes(t)) ?? null
  }, [q])
  const equiv = elegida ?? detectada

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[70ch] text-[14px] leading-relaxed" style={{ color: C.inkMid }}>
        Escribe un código (<span className="font-mono">nCr</span>, <span className="font-mono">P-08</span>,{' '}
        <span className="font-mono">1-24</span>) o lo que quieres ajustar
        («corriente», «rampa»). Te dice <strong style={{ color: C.ink }}>en qué equipo y en qué
        menú vive</strong>, y cómo se llama lo mismo en las otras marcas.
      </p>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: C.inkLo }} />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setElegida(null)
          }}
          placeholder="nCr · P-08 · 1-24 · corriente · rampa · tensión…"
          aria-label="Buscar parámetro en todas las familias"
          className={`w-full rounded py-3 pl-9 pr-3 text-sm ${FOCO}`}
          style={{ background: C.bgPanel, border: `1px solid ${C.border}`, color: C.ink }}
        />
      </div>

      {/* Comparación marca a marca — la respuesta a «¿y en la otra marca?» */}
      {equiv && <PanelComparacion equiv={equiv} onAbrirFicha={onAbrirFicha} />}

      {/* Coincidencias concretas, con su menú */}
      {q.trim().length >= 2 && (
        <div className="flex flex-col gap-2">
          <MetaText>
            {hallazgos.length === 0
              ? 'Ningún parámetro coincide'
              : `${hallazgos.length} ${hallazgos.length === 1 ? 'parámetro' : 'parámetros'} en el catálogo`}
          </MetaText>
          {hallazgos.slice(0, 25).map((h, i) => {
            const suEquiv = equivalenciaDe(h.parametro.codigo)
            return (
              <div
                key={`${h.fichaId}-${h.menu}-${h.parametro.codigo}-${i}`}
                className="flex flex-col gap-2 rounded-lg px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                style={panelEstilo}
              >
                <button
                  onClick={() =>
                    onAbrirFicha(h.fichaId, 'parametros', { codigo: h.parametro.codigo, menu: h.menu })
                  }
                  className={`flex flex-1 flex-col gap-1 rounded text-left ${FOCO}`}
                >
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[14px] font-semibold" style={{ color: C.aquaBright }}>
                      {h.parametro.codigo}
                    </span>
                    <span className="text-[14px]" style={{ color: C.ink }}>{h.parametro.descripcion}</span>
                    {h.parametro.dePlaca && (
                      <span className="rounded px-2 py-1 text-[11px] font-medium" style={chipEstilo(C.warn)}>Placa</span>
                    )}
                  </span>
                  <span className="text-[12px]" style={{ color: C.inkMid }}>
                    {h.fichaNombre} · menú <span className="font-mono">{h.menu}</span>
                  </span>
                  {(h.parametro.rango !== '—' || h.parametro.fabrica !== '—') && (
                    <span className="font-mono text-[12px] tabular-nums" style={{ color: C.inkLo }}>
                      {h.parametro.rango !== '—' ? h.parametro.rango : ''}
                      {h.parametro.rango !== '—' && h.parametro.fabrica !== '—' ? '  ·  fábrica ' : ''}
                      {h.parametro.fabrica !== '—' ? h.parametro.fabrica : ''}
                    </span>
                  )}
                </button>
                {suEquiv && (
                  <button
                    onClick={() => setElegida(suEquiv)}
                    className={`shrink-0 self-start rounded px-3 py-2 text-[12px] font-medium sm:self-auto ${FOCO}`}
                    style={{
                      color: C.aquaBright,
                      background: tinte.suave(C.aqua),
                      border: `1px solid ${tinte.borde(C.aqua)}`,
                    }}
                  >
                    Comparar marcas
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * El mismo concepto, marca por marca, resuelto contra el catálogo real.
 *
 * La tabla de equivalencias sola dice que `nCr` es `1-24` en Danfoss — pero para
 * configurar el repuesto hace falta el menú, el rango y el valor de fábrica. Acá
 * cada marca trae su dato y se puede saltar al parámetro con un toque.
 */
function PanelComparacion({
  equiv,
  onAbrirFicha,
}: {
  equiv: EquivalenciaParametro
  onAbrirFicha: AbrirFicha
}) {
  const celdas = useMemo(() => compararEquivalencia(equiv), [equiv])

  return (
    <div className="flex flex-col gap-3 rounded-lg p-4" style={panelEstilo}>
      <span className="text-[15px] font-semibold" style={{ color: C.ink }}>
        {equiv.concepto}
        {equiv.dePlaca && (
          <span className="ml-2 rounded px-2 py-1 text-[11px] font-medium" style={chipEstilo(C.warn)}>
            Dato de placa
          </span>
        )}
      </span>

      <div className="overflow-x-auto rounded" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              {['Marca', 'Código', 'Menú', 'Rango', 'Fábrica'].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-3 py-2 text-left text-[12px] font-semibold"
                  style={{ background: C.bgPanel, color: C.inkMid, borderBottom: `1px solid ${C.border}` }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {celdas.map((c) => {
              const u = c.ubicacion
              return (
                <tr
                  key={c.columna}
                  onClick={
                    u ? () => onAbrirFicha(u.fichaId, 'parametros', { codigo: u.parametro.codigo, menu: u.menu }) : undefined
                  }
                  style={{
                    borderBottom: `1px solid ${C.border}`,
                    cursor: u ? 'pointer' : undefined,
                    // Sin código no es un vacío de datos: ese equipo no pide el parámetro.
                    opacity: c.codigo ? 1 : 0.55,
                  }}
                >
                  <td className="whitespace-nowrap px-3 py-2 align-top" style={{ color: C.ink }}>
                    {c.titulo}
                  </td>
                  <td
                    className="whitespace-nowrap px-3 py-2 align-top font-mono font-semibold"
                    style={{ color: c.codigo ? C.aquaBright : C.inkGhost }}
                  >
                    {c.codigo ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-[12px]" style={{ color: C.inkMid }}>
                    {u ? u.menu.split(' ')[0] : '—'}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-[12px] tabular-nums" style={{ color: C.inkMid }}>
                    {u?.parametro.rango ?? '—'}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-[12px] tabular-nums" style={{ color: C.inkMid }}>
                    {u?.parametro.fabrica ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <MetaText>Toca una marca para ir a ese parámetro en su ficha.</MetaText>

      {equiv.nota && (
        <span
          className="max-w-[70ch] pl-2 text-[13px] leading-relaxed"
          style={{ color: C.inkMid, borderLeft: `2px solid ${C.border}` }}
        >
          {equiv.nota}
        </span>
      )}
    </div>
  )
}

// ── Equivalencias entre marcas ────────────────────────────────────────────────
/** El mismo dato en el dialecto de cada fabricante — para cambiar de marca. */
function TablaEquivalencias({ onAbrirFicha }: { onAbrirFicha: AbrirFicha }) {
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

  // Se resuelve una vez para toda la tabla: cada código sabe a qué ficha y menú va.
  const celdasPorConcepto = useMemo(
    () => Object.fromEntries(EQUIVALENCIAS.map((e) => [e.concepto, compararEquivalencia(e)])),
    [],
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[68ch] text-[14px] leading-relaxed" style={{ color: C.inkMid }}>
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
          className={`w-full rounded py-3 pl-9 pr-3 text-sm ${FOCO}`}
          style={{ background: C.bgPanel, border: `1px solid ${C.border}`, color: C.ink }}
        />
      </div>

      <div className="overflow-x-auto rounded" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th
                className="whitespace-nowrap px-3 py-3 text-left text-[13px] font-semibold"
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
                  className="whitespace-nowrap px-3 py-3 text-left text-[13px] font-semibold"
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
                  background: e.dePlaca ? tinte.fila(C.warn) : undefined,
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <td
                  className="px-3 py-3 align-top"
                  style={{
                    color: C.ink, lineHeight: 1.5, minWidth: 190, maxWidth: 240,
                    position: 'sticky', left: 0, zIndex: 1,
                    background: e.dePlaca ? tinte.opaco(C.warn, C.bg) : C.bg,
                    borderRight: `1px solid ${C.border}`,
                  }}
                >
                  {e.concepto}
                  {e.dePlaca && (
                    <span
                      className="ml-2 inline-flex items-center rounded px-2 py-1 text-[11px] font-medium"
                      style={{ color: C.warn, background: tinte.suave(C.warn) }}
                    >
                      Placa
                    </span>
                  )}
                  {e.nota && (
                    <span
                      className="mt-2 block max-w-[62ch] pl-2 text-[13px]"
                      style={{ color: C.inkMid, borderLeft: `2px solid ${C.border}`, lineHeight: 1.5 }}
                    >
                      {e.nota}
                    </span>
                  )}
                </td>
                {(celdasPorConcepto[e.concepto] ?? []).map((c) => (
                  <td
                    key={c.columna}
                    className="whitespace-nowrap px-3 py-3 align-top font-mono text-[13px] font-semibold"
                    style={{ color: c.codigo ? C.aquaBright : C.inkGhost }}
                  >
                    {/* El código no es solo texto: lleva al parámetro en su ficha. */}
                    {c.ubicacion ? (
                      <button
                        onClick={() =>
                          onAbrirFicha(c.ubicacion!.fichaId, 'parametros', {
                            codigo: c.ubicacion!.parametro.codigo,
                            menu: c.ubicacion!.menu,
                          })
                        }
                        className={`rounded font-mono font-semibold underline decoration-dotted underline-offset-4 ${FOCO}`}
                        style={{ color: C.aquaBright }}
                        title={`Ir a ${c.codigo} · ${c.ubicacion.fichaNombre}`}
                      >
                        {c.codigo}
                      </button>
                    ) : (
                      (c.codigo ?? '—')
                    )}
                  </td>
                ))}
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
    : vistaParam === 'equivalencias' || vistaParam === 'recetas' || vistaParam === 'parametro'
      ? vistaParam
      : 'catalogo'
  const [q, setQ] = useState('')
  const [seccion, setSeccion] = useState<'parametros' | 'fallas'>(
    params.get('seccion') === 'fallas' ? 'fallas' : 'parametros',
  )

  const abrirFicha = (
    id: string | null,
    sec: 'parametros' | 'fallas' = 'parametros',
    destino?: DestinoParametro,
  ) => {
    const p = new URLSearchParams(params)
    if (id) p.set('ficha', id)
    else p.delete('ficha')
    p.delete('posicion')
    // ?p=<código>&menu=<menú>: el enlace no queda en la ficha, queda EN el parámetro.
    if (destino) {
      p.set('p', destino.codigo)
      if (destino.menu) p.set('menu', destino.menu)
      else p.delete('menu')
    } else {
      p.delete('p')
      p.delete('menu')
    }
    // Abrir hace push (atrás del celular vuelve al catálogo); cerrar REEMPLAZA,
    // para que atrás no re-abra la ficha recién cerrada.
    setParams(p, { replace: id === null })
    setSeccion(sec)
    window.scrollTo(0, 0)
  }

  const codigoDestino = params.get('p')
  const destino = useMemo<DestinoParametro | null>(
    () => (codigoDestino ? { codigo: codigoDestino, menu: params.get('menu') ?? undefined } : null),
    // Se reconstruye con cada cambio de destino para que el navegador reaccione
    // aunque se salte del mismo buscador a dos parámetros seguidos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [codigoDestino, params.get('menu')],
  )

  const cambiarVista = (v: 'catalogo' | 'equivalencias' | 'recetas' | 'parametro') => {
    const p = new URLSearchParams(params)
    if (v !== 'catalogo') p.set('vista', v)
    else p.delete('vista')
    p.delete('ficha')
    p.delete('p')
    p.delete('menu')
    p.delete('comparar')
    setParams(p, { replace: true })
  }

  /**
   * Desde la ficha, saltar a la comparación entre marcas de ese parámetro.
   *
   * Es push, no replace: la pregunta «¿y en la otra marca?» se hace estando en
   * la ficha, y con atrás se vuelve al parámetro donde se estaba.
   */
  const compararMarcas = (codigo: string) => {
    const p = new URLSearchParams(params)
    p.set('vista', 'parametro')
    p.set('comparar', codigo)
    p.delete('ficha')
    p.delete('p')
    p.delete('menu')
    p.delete('posicion')
    setParams(p)
    window.scrollTo(0, 0)
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
        <header className="flex flex-col gap-3">
          <button
            onClick={() => navigate('/aprendizaje')}
            className={`inline-flex w-fit items-center gap-2 rounded text-[14px] font-medium ${FOCO}`}
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
          <p className="m-0 max-w-[62ch] text-[15px] leading-relaxed" style={{ color: C.inkMid }}>
            Qué parámetros espera cada modelo y en qué menú están. Para cuando hay que
            reemplazar uno y configurarlo sin buscar el manual.
          </p>
        </header>

        {fichaRota && (
          <div
            className="flex gap-3 rounded px-4 py-3 text-[13px]"
            style={{
              color: C.inkMid,
              background: tinte.fila(C.crit),
              borderLeft: `3px solid ${C.crit}`,
            }}
          >
            <AlertTriangle className="mt-1 h-4 w-4 shrink-0" style={{ color: C.crit }} />
            <span>
              No existe la ficha «{abierta}» — puede ser un enlace viejo o un error de tipeo.
              Abajo está el catálogo completo.
            </span>
          </div>
        )}

        {/* Selector de vista — solo en el catálogo, no dentro de una ficha */}
        {ficha === null && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Vista">
            {([
              ['catalogo', 'Por modelo'],
              ['recetas', 'Por cinta / equipo'],
              ['parametro', 'Buscar parámetro'],
              ['equivalencias', 'Equivalencias entre marcas'],
            ] as const).map(([v, rotulo]) => {
              const on = vista === v
              return (
                <button
                  key={v}
                  onClick={() => cambiarVista(v)}
                  aria-pressed={on}
                  className={`rounded px-4 py-2 text-[13px] transition-colors ${FOCO}`}
                  style={{
                    background: on ? tinte.suave(C.aqua) : C.bgPanel,
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

        {ficha === null && vista === 'parametro' ? (
          <BuscadorParametros onAbrirFicha={abrirFicha} comparar={params.get('comparar')} />
        ) : ficha === null && vista === 'equivalencias' ? (
          <TablaEquivalencias onAbrirFicha={abrirFicha} />
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
                className={`w-full rounded-lg py-3 pl-10 pr-3 text-sm ${FOCO}`}
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
                  <div className="flex flex-col gap-2">
                    {fallas.slice(0, 6).map((r) => (
                      <button
                        key={`${r.fichaId}-${r.falla.codigo}`}
                        onClick={() => abrirFicha(r.fichaId, 'fallas')}
                        className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg px-4 py-3 text-left transition-colors ${FOCO}`}
                        style={panelEstilo}
                      >
                        <span
                          className="rounded px-2 py-1 font-mono text-[13px] font-bold"
                          style={{ color: C.crit, background: tinte.suave(C.crit) }}
                        >
                          {r.falla.codigo}
                        </span>
                        <span className="text-[14px] font-medium" style={{ color: C.ink }}>{r.falla.nombre}</span>
                        <span className="text-[13px]" style={{ color: C.inkMid }}>· {r.fichaNombre}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Familias */}
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {visibles.map((f) => {
                const r = resumenFicha(f)
                return (
                  <button
                    key={f.id}
                    onClick={() => abrirFicha(f.id)}
                    className={`flex flex-col gap-3 rounded-lg p-4 text-left transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-16px_rgba(0,0,0,0.55)] ${FOCO}`}
                    style={panelEstilo}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="block text-base font-semibold leading-tight tracking-[-0.014em]" style={{ color: C.ink }}>
                          {f.nombre}
                        </span>
                        <span className="mt-1 block text-xs" style={{ color: C.inkMid }}>{f.tipo}</span>
                      </div>
                      <EstadoChip estado={f.estado} />
                    </div>
                    <span className="text-[13px] leading-snug" style={{ color: C.inkMid }}>{f.donde}</span>
                    <span
                      className="mt-1 pt-2 text-xs tabular-nums"
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
              <p className="mb-4 mt-1 max-w-[62ch] text-[14px]" style={{ color: C.inkMid }}>
                Cuatro modelos cubren las ocho cintas. Potencia, reducción y rpm salen del código
                Sumitomo; los datos eléctricos hay que leerlos de la placa.
              </p>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
                {MOTORES_CINTAS.map((m) => (
                  <div
                    key={m.modelo}
                    className="flex flex-col gap-3 rounded-lg p-4"
                    style={panelEstilo}
                  >
                    <h3 className="m-0 font-mono text-sm font-semibold tracking-[-0.01em]" style={{ color: C.aquaBright }}>
                      {m.modelo}
                      {m.porConfirmar && <span className="ml-2" style={{ color: C.warn }}>⏳</span>}
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
                        <div key={rot} className="flex flex-col gap-1 px-3 py-2" style={{ background: C.surface }}>
                          <dt className="text-[11px]" style={{ color: C.inkMid }}>{rot}</dt>
                          <dd className="m-0 font-mono text-[14px] font-semibold tabular-nums" style={{ color: C.ink }}>
                            {val}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      {FALTAN_DE_PLACA.map((f) => (
                        <span
                          key={f}
                          className="inline-flex items-center rounded px-2 py-1 text-[11px] font-medium"
                          style={{ color: C.warn, background: tinte.suave(C.warn) }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                    <span className="text-[13px] leading-snug" style={{ color: C.inkMid }}>{m.usos}</span>
                  </div>
                ))}
              </div>
            </div>

            <footer className="mt-4 flex flex-col gap-2 pt-5" style={{ borderTop: `1px solid ${C.border}` }}>
              <h3 className="m-0 text-sm font-semibold" style={{ color: C.ink }}>Estado del contenido</h3>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14px]" style={{ color: C.inkMid }}>
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
              className={`inline-flex w-fit items-center gap-2 rounded text-[14px] font-medium ${FOCO}`}
              style={{ color: C.aquaBright }}
            >
              <ArrowLeft className="h-4 w-4" /> Volver al catálogo
            </button>

            <div className="overflow-hidden rounded-lg" style={panelEstilo}>
              <div
                className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-4"
                style={{ background: C.bgPanel, borderBottom: `1px solid ${C.border}` }}
              >
                <div>
                  <h2 className="m-0 text-[18px] font-semibold tracking-[-0.01em]" style={{ color: C.ink }}>
                    {ficha.nombre}
                  </h2>
                  <span className="mt-1 block text-[13px]" style={{ color: C.inkMid }}>
                    {ficha.tipo} · {ficha.donde}
                  </span>
                </div>
                <EstadoChip estado={ficha.estado} />
              </div>

              <div className="flex flex-col gap-4 p-5">
                {ficha.aviso && (
                  <div
                    className="flex gap-3 rounded px-4 py-3 text-[13px]"
                    style={{
                      color: C.inkMid,
                      background: tinte.fila(C.warn),
                      borderLeft: `3px solid ${C.warn}`,
                    }}
                  >
                    <AlertTriangle className="mt-1 h-4 w-4 shrink-0" style={{ color: C.warn }} />
                    <span><strong style={{ color: C.ink }}>Ojo: </strong>{ficha.aviso}</span>
                  </div>
                )}

                {/* Parámetros / Fallas — solo si la ficha tiene ambas cosas */}
                {ficha.fallas && ficha.menus && (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Sección de la ficha">
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
                          className={`rounded px-4 py-2 text-[13px] transition-colors ${FOCO}`}
                          style={{
                            background: on ? tinte.suave(C.aqua) : C.bgPanel,
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
                  <NavegadorParametros ficha={ficha} destino={destino} onComparar={compararMarcas} />
                )}

                <div
                  className="flex gap-3 rounded px-4 py-3 text-[13px]"
                  style={{
                    color: C.inkMid,
                    background: tinte.fila(C.aqua),
                    borderLeft: `3px solid ${C.aqua}`,
                  }}
                >
                  <BookOpen className="mt-1 h-4 w-4 shrink-0" style={{ color: C.aqua }} />
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
