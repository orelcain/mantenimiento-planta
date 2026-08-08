/**
 * Perilla5Page — módulo especial del Centro de Aprendizaje: "Perilla 5 ·
 * Diagnóstico BAADER 142".
 *
 * Dos vistas (por ?vista=):
 *  - herramienta (default): la herramienta de diagnóstico validada en terreno
 *    (08-08-2026, Planta Chonchi) embebida como HTML standalone — 14 secciones,
 *    interpretador de protocolo, buscador de 46 códigos con solución didáctica y
 *    55 figuras del manual 1420000804 incrustadas. Acepta deep-links ?t=/&q=
 *    (modo práctica desde los runbooks de la ficha baader-142).
 *  - protocolo: registro persistente de las lecturas del protocolo del Upgrade
 *    Kit (colección baader142Protocolo) + tendencia E82x-C /1000 por herramienta.
 *    Este es el aporte cuantificable del módulo: la tendencia muestra el desgaste
 *    que el kit corrige en silencio, para intervenir ANTES de la parada.
 *
 * El embed no necesita sesión (no escribe nada); la persistencia vive en esta
 * página React, que sí hereda la sesión de Firebase.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, CircleGauge, LineChart as LineChartIcon, Loader2, RotateCcw, Save,
} from 'lucide-react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  type TooltipItem,
} from 'chart.js'
import { useAuthStore } from '@/store'
import { useTheme } from '@/hooks/useTheme'
import { LC } from '@/data/learningTheme'
import {
  CONTADORES_KEYS,
  LECTURA_BASE_2026_08_08,
  MAQUINAS,
  guardarLectura,
  lecturasDeMaquina,
  tasa1000,
  type ContadoresProtocolo,
  type LecturaProtocolo,
  type MaquinaBaader,
} from '@/services/baader142/perilla5Protocolo'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

type Vista = 'herramienta' | 'protocolo'

/** Campos del formulario, en el orden del protocolo real (selector 4). */
const CAMPOS: { k: keyof ContadoresProtocolo; label: string; conTasa?: boolean }[] = [
  { k: 'fish', label: '∑ FISH / FI-TODAY' },
  { k: 'stops', label: '∑ STOPS', conTasa: true },
  { k: 'stopc', label: '∑ STOP-C', conTasa: true },
  { k: 'tclip', label: '∑ TAIL CLIP', conTasa: true },
  { k: 'tclipc', label: '∑ T-CLIP-C', conTasa: true },
  { k: 'anusi', label: '∑ ANUS-I', conTasa: true },
  { k: 'anuso', label: '∑ ANUS-O', conTasa: true },
  { k: 'e821', label: '∑ E821 · centraje' },
  { k: 'e821c', label: '∑ E821-C', conTasa: true },
  { k: 'e822', label: '∑ E822 · cuchilla' },
  { k: 'e822c', label: '∑ E822-C', conTasa: true },
  { k: 'e823', label: '∑ E823 · aspirador' },
  { k: 'e823c', label: '∑ E823-C', conTasa: true },
  { k: 'e824', label: '∑ E824 · excavador A' },
  { k: 'e824c', label: '∑ E824-C', conTasa: true },
  { k: 'e825', label: '∑ E825 · excavador B' },
  { k: 'e825c', label: '∑ E825-C', conTasa: true },
]

/** Series de la tendencia: las 5 tasas -C /1000 (indicador adelantado de desgaste). */
const SERIES: { k: keyof ContadoresProtocolo; label: string; color: string }[] = [
  { k: 'e821c', label: 'Centraje SM1', color: '#2E75B6' },
  { k: 'e822c', label: 'Cuchilla SM2', color: '#7d7f9e' },
  { k: 'e823c', label: 'Aspirador SM3', color: '#0f9d8f' },
  { k: 'e824c', label: 'Excavador A SM4', color: '#d97706' },
  { k: 'e825c', label: 'Excavador B SM5', color: '#c8102e' },
]

/** Umbrales provisorios de la herramienta (hasta tener 4 semanas de registro real). */
function nivelTasa(r: number): { label: string; color: string } {
  if (r >= 100) return { label: 'crítico', color: LC.crit }
  if (r >= 30) return { label: 'intervenir', color: LC.warn }
  if (r >= 5) return { label: 'vigilar', color: LC.prep }
  return { label: 'normal', color: LC.ok }
}

const FORM_VACIO: Record<keyof ContadoresProtocolo, string> = Object.fromEntries(
  CONTADORES_KEYS.map((k) => [k, '']),
) as Record<keyof ContadoresProtocolo, string>

export function Perilla5Page() {
  const [searchParams, setSearchParams] = useSearchParams()
  const vista: Vista = searchParams.get('vista') === 'protocolo' ? 'protocolo' : 'herramienta'

  const setVista = useCallback(
    (v: Vista) => {
      const next = new URLSearchParams(searchParams)
      if (v === 'herramienta') next.delete('vista')
      else next.set('vista', v)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  // El embed recibe los deep-links del modo práctica tal cual (?t=px&q=825).
  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    const params = new URLSearchParams({ v })
    const t = searchParams.get('t')
    const q = searchParams.get('q')
    if (t) params.set('t', t)
    if (q) params.set('q', q)
    return `${basePath}perilla5-baader142-embed.html?${params.toString()}`
  }, [searchParams])

  return (
    <div className="min-h-screen" style={{ background: LC.bg, color: LC.ink }}>
      <div className="mx-auto max-w-5xl px-4 py-5">
        <Link
          to="/aprendizaje"
          className="inline-flex items-center gap-1.5 text-sm"
          style={{ color: LC.inkMid }}
        >
          <ArrowLeft className="h-4 w-4" /> Centro de aprendizaje
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold leading-tight">
              Perilla 5 · Diagnóstico Baader 142
            </h1>
            <p className="mt-1 text-sm" style={{ color: LC.inkMid }}>
              Todo lo que la máquina cuenta antes de fallar: las 10 posiciones del selector 5,
              el protocolo del Upgrade Kit y los 46 códigos E con su solución. Validada en
              terreno el 08-08-2026.
            </p>
          </div>

          <div className="flex gap-2" role="tablist" aria-label="Vista">
            <button
              type="button"
              role="tab"
              aria-selected={vista === 'herramienta'}
              onClick={() => setVista('herramienta')}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
              style={
                vista === 'herramienta'
                  ? { background: LC.aqua, borderColor: LC.aqua, color: '#fff' }
                  : { background: LC.surface, borderColor: LC.border, color: LC.inkMid }
              }
            >
              <CircleGauge className="h-4 w-4" /> Herramienta
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vista === 'protocolo'}
              onClick={() => setVista('protocolo')}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium"
              style={
                vista === 'protocolo'
                  ? { background: LC.aqua, borderColor: LC.aqua, color: '#fff' }
                  : { background: LC.surface, borderColor: LC.border, color: LC.inkMid }
              }
            >
              <LineChartIcon className="h-4 w-4" /> Protocolo · registro y tendencia
            </button>
          </div>
        </div>

        {vista === 'herramienta' ? (
          <div
            className="mt-4 overflow-hidden rounded-lg border"
            style={{ borderColor: LC.border }}
          >
            <iframe
              src={iframeSrc}
              title="Herramienta Perilla 5 · Diagnóstico BAADER 142"
              className="block h-[calc(100vh-230px)] min-h-[560px] w-full"
              style={{ background: '#EFF1F3' }}
            />
          </div>
        ) : (
          <VistaProtocolo />
        )}
      </div>
    </div>
  )
}

/* ============================================================
 * Vista Protocolo: registro de lecturas + tendencia E82x-C
 * ============================================================ */

function VistaProtocolo() {
  const { isAuthenticated, user } = useAuthStore()
  const { isDark } = useTheme()

  const [maquina, setMaquina] = useState<MaquinaBaader>('baader-n1')
  // Fecha LOCAL (no toISOString/UTC): la lectura semanal se hace al fin del turno
  // de la tarde, justo la ventana en que la fecha UTC ya saltó al día siguiente.
  const [fecha, setFecha] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [form, setForm] = useState<Record<keyof ContadoresProtocolo, string>>({ ...FORM_VACIO })
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardadoOk, setGuardadoOk] = useState(false)

  const [lecturas, setLecturas] = useState<LecturaProtocolo[]>([])
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    const rows = await lecturasDeMaquina(maquina)
    setLecturas(rows)
    setCargando(false)
  }, [maquina])

  // Guard de staleness: si el usuario cambia de máquina con una carga lenta en
  // vuelo, la respuesta vieja no debe pisar la lista de la máquina nueva.
  useEffect(() => {
    let vivo = true
    setCargando(true)
    void lecturasDeMaquina(maquina).then((rows) => {
      if (!vivo) return
      setLecturas(rows)
      setCargando(false)
    })
    // Los mensajes de la máquina anterior no aplican a la nueva.
    setError(null)
    setGuardadoOk(false)
    return () => {
      vivo = false
    }
  }, [maquina])

  const num = (k: keyof ContadoresProtocolo): number => {
    const v = Number.parseInt(form[k], 10)
    return Number.isFinite(v) && v >= 0 ? v : 0
  }
  const fish = num('fish')

  const precargarBase = () => {
    setMaquina('baader-n1')
    setFecha('2026-08-08')
    setForm(
      Object.fromEntries(
        CONTADORES_KEYS.map((k) => [k, String(LECTURA_BASE_2026_08_08[k])]),
      ) as Record<keyof ContadoresProtocolo, string>,
    )
    setNotas('Lectura base de terreno 08-08-2026, Baader 142 N1 antigua (1299 pescados). E825-C=452: el excavador B perdía pasos en 1 de cada 3 pescados.')
  }

  const limpiar = () => {
    setForm({ ...FORM_VACIO })
    setNotas('')
    setError(null)
    setGuardadoOk(false)
  }

  const guardar = async () => {
    if (guardando) return
    setError(null)
    setGuardadoOk(false)
    if (!isAuthenticated || !user?.id) {
      setError('Iniciá sesión para guardar lecturas.')
      return
    }
    if (fish <= 0) {
      setError('∑ FISH (o ∑ FI-TODAY) es obligatorio: sin pescados no hay tasas.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      setError('La fecha debe ser válida (AAAA-MM-DD).')
      return
    }
    setGuardando(true)
    try {
      const contadores = Object.fromEntries(
        CONTADORES_KEYS.map((k) => [k, num(k)]),
      ) as unknown as ContadoresProtocolo
      await guardarLectura({
        ...contadores,
        plantId: 'chonchi',
        maquina,
        fecha,
        ...(notas.trim() ? { notas: notas.trim() } : {}),
        creadoPor: user.id,
        ...(user.nombre ? { creadoPorNombre: user.nombre } : {}),
      })
      setGuardadoOk(true)
      await cargar()
    } catch {
      setError('No se pudo guardar. Revisá la conexión o tus permisos.')
    } finally {
      setGuardando(false)
    }
  }

  /* --- tendencia: lecturas ascendentes por fecha --- */
  const serie = useMemo(() => [...lecturas].reverse(), [lecturas])
  const ejeColor = isDark ? '#8aa0b4' : '#4a555e'
  const gridColor = isDark ? 'rgba(138,160,180,0.15)' : 'rgba(74,85,94,0.15)'

  const chartData = useMemo(
    () => ({
      labels: serie.map((l) => l.fecha),
      datasets: SERIES.map((s) => ({
        label: s.label,
        data: serie.map((l) => tasa1000(l[s.k], l.fish)),
        borderColor: s.color,
        backgroundColor: s.color,
        pointRadius: 4,
        tension: 0.2,
      })),
    }),
    [serie],
  )

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: { labels: { color: ejeColor, boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (item: TooltipItem<'line'>) =>
              `${item.dataset.label}: ${item.parsed.y ?? 0} /1000 pescados`,
          },
        },
      },
      scales: {
        x: { ticks: { color: ejeColor, font: { size: 11 } }, grid: { color: gridColor } },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'correcciones -C por 1000 pescados', color: ejeColor, font: { size: 11 } },
          ticks: { color: ejeColor, font: { size: 11 } },
          grid: { color: gridColor },
        },
      },
    }),
    [ejeColor, gridColor],
  )

  return (
    <div className="mt-4 space-y-4">
      {/* Qué es y por qué se registra */}
      <div
        className="rounded-lg border p-4 text-sm leading-relaxed"
        style={{ background: LC.surface, borderColor: LC.border, color: LC.inkMid }}
      >
        <p>
          Con Upgrade Kit, el control corrige en silencio los pasos perdidos de cada motor y los
          anota en los contadores <span className="font-mono">∑E82x-C</span> (perilla 5 → posición 1,
          se navega con la perilla 4). Registrar la lectura <strong style={{ color: LC.ink }}>semanal
          (viernes, fin de turno)</strong> y <strong style={{ color: LC.ink }}>siempre antes de
          resetear</strong> deja visible el desgaste antes de que pare la máquina.
        </p>
        <p className="mt-2" style={{ color: LC.ink }}>
          Regla de planta: <strong>no resetear el protocolo sin registrar primero los valores</strong>.
          Para el conteo del turno usar <span className="font-mono">∑ FI-TODAY</span>, no el reset.
        </p>
      </div>

      {/* Selector de máquina */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide" style={{ color: LC.inkLo }}>
          Máquina
        </span>
        {MAQUINAS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMaquina(m.id)}
            title={m.hint}
            className="rounded-full border px-3 py-1 text-sm"
            style={
              maquina === m.id
                ? { background: LC.aqua, borderColor: LC.aqua, color: '#fff' }
                : { background: LC.surface, borderColor: LC.border, color: LC.inkMid }
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Formulario */}
        <div className="rounded-lg border p-4" style={{ background: LC.surface, borderColor: LC.border }}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Nueva lectura</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={precargarBase}
                className="rounded border px-2 py-1 text-xs"
                style={{ borderColor: LC.border, color: LC.inkMid }}
                title="Rellena el formulario con la lectura de terreno del 08-08-2026 (Baader antigua)"
              >
                Precargar base 08-08
              </button>
              <button
                type="button"
                onClick={limpiar}
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                style={{ borderColor: LC.border, color: LC.inkMid }}
              >
                <RotateCcw className="h-3 w-3" /> Limpiar
              </button>
            </div>
          </div>

          <label className="mt-3 block text-xs" style={{ color: LC.inkLo }}>
            Fecha de la lectura
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 block w-full rounded border px-2 py-1.5 font-mono text-sm"
              style={{ background: LC.surfaceHi, borderColor: LC.border, color: LC.ink }}
            />
          </label>

          <div className="mt-3 grid grid-cols-[1fr_92px_56px] items-center gap-x-2 gap-y-1.5">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: LC.inkGhost }}>Contador</span>
            <span className="text-right text-[10px] uppercase tracking-wide" style={{ color: LC.inkGhost }}>Valor</span>
            <span className="text-right text-[10px] uppercase tracking-wide" style={{ color: LC.inkGhost }}>/1000</span>
            {CAMPOS.map((c) => {
              const r = c.conTasa && fish > 0 ? tasa1000(num(c.k), fish) : null
              const nivel = r !== null && r > 0 ? nivelTasa(r) : null
              return (
                <FilaContador
                  key={c.k}
                  label={c.label}
                  value={form[c.k]}
                  onChange={(v) =>
                    setForm((prev) => ({ ...prev, [c.k]: v.replace(/[^\d]/g, '') }))
                  }
                  tasa={r}
                  tasaColor={nivel?.color ?? LC.inkLo}
                />
              )
            })}
          </div>

          <label className="mt-3 block text-xs" style={{ color: LC.inkLo }}>
            Notas (código exacto visto en display, intervención hecha, etc.)
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1 block w-full rounded border px-2 py-1.5 text-sm"
              style={{ background: LC.surfaceHi, borderColor: LC.border, color: LC.ink }}
            />
          </label>

          {error && (
            <p className="mt-2 text-sm" style={{ color: LC.danger }}>{error}</p>
          )}
          {guardadoOk && (
            <p className="mt-2 text-sm" style={{ color: LC.ok }}>
              Lectura guardada. Ya está en la tendencia.
            </p>
          )}

          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || !isAuthenticated}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: LC.aqua, color: '#fff' }}
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar lectura
          </button>
          {!isAuthenticated && (
            <p className="mt-2 text-xs" style={{ color: LC.inkLo }}>
              Iniciá sesión para guardar. La herramienta de diagnóstico funciona igual sin sesión.
            </p>
          )}
        </div>

        {/* Tendencia */}
        <div className="rounded-lg border p-4" style={{ background: LC.surface, borderColor: LC.border }}>
          <h2 className="text-base font-semibold">Tendencia de correcciones -C</h2>
          <p className="mt-1 text-xs" style={{ color: LC.inkMid }}>
            Tasa /1000 pescados por herramienta. La serie que sube semana a semana marca el
            subconjunto a intervenir. Umbrales provisorios: 5 vigilar · 30 intervenir · 100 crítico
            <span style={{ color: LC.inkLo }}> (criterio interno de Mantención ANTARFOOD hasta
            juntar 4 semanas de registro real)</span>.
          </p>
          {cargando ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: LC.inkLo }} />
            </div>
          ) : serie.length === 0 ? (
            <p className="mt-6 text-sm" style={{ color: LC.inkLo }}>
              Sin lecturas guardadas para esta máquina todavía. Guardá la primera con el
              formulario — podés partir precargando la lectura base del 08-08.
            </p>
          ) : (
            <div className="mt-3 h-64">
              <Line data={chartData} options={chartOptions} />
            </div>
          )}
        </div>
      </div>

      {/* Historial */}
      <div className="rounded-lg border p-4" style={{ background: LC.surface, borderColor: LC.border }}>
        <h2 className="text-base font-semibold">Lecturas registradas</h2>
        {cargando ? null : lecturas.length === 0 ? (
          <p className="mt-2 text-sm" style={{ color: LC.inkLo }}>Ninguna todavía.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr style={{ color: LC.inkLo }}>
                  <th className="py-1.5 pr-3 text-left font-medium">Fecha</th>
                  <th className="py-1.5 pr-3 text-right font-medium">∑ FISH</th>
                  <th className="py-1.5 pr-3 text-right font-medium">STOP-C</th>
                  {SERIES.map((s) => (
                    <th key={s.k} className="py-1.5 pr-3 text-right font-medium" title={s.label}>
                      {s.label.split(' ').pop()}
                    </th>
                  ))}
                  <th className="py-1.5 text-left font-medium">Dominante</th>
                </tr>
              </thead>
              <tbody>
                {lecturas.map((l) => {
                  const tasas = SERIES.map((s) => ({ s, r: tasa1000(l[s.k], l.fish) }))
                  const dom = tasas.reduce((a, b) => (b.r > a.r ? b : a))
                  const nivel = nivelTasa(dom.r)
                  return (
                    <tr key={l.id} style={{ borderTop: `1px solid ${LC.border}` }}>
                      <td className="py-1.5 pr-3 font-mono text-xs">{l.fecha}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-xs">{l.fish}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-xs">
                        {tasa1000(l.stopc, l.fish)}
                      </td>
                      {tasas.map(({ s, r }) => (
                        <td key={s.k} className="py-1.5 pr-3 text-right font-mono text-xs">
                          {r}
                        </td>
                      ))}
                      <td className="py-1.5 text-xs">
                        {dom.r > 0 ? (
                          <span style={{ color: nivel.color }}>
                            {dom.s.label} · {dom.r}/1000 ({nivel.label})
                          </span>
                        ) : (
                          <span style={{ color: LC.inkLo }}>sin correcciones</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs" style={{ color: LC.inkGhost }}>
          Fuente técnica: manual 1420000804 §22.4 (Upgrade Kit) y runbook E8xx de planta.
          Las lecturas son evidencia histórica: se crean y se leen, no se editan.
        </p>
      </div>
    </div>
  )
}

function FilaContador({
  label, value, onChange, tasa, tasaColor,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  tasa: number | null
  tasaColor: string
}) {
  return (
    <>
      <label className="font-mono text-xs" style={{ color: LC.inkMid }}>{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full rounded border px-2 py-1 text-right font-mono text-sm"
        style={{ background: LC.surfaceHi, borderColor: LC.border, color: LC.ink }}
      />
      <span className="text-right font-mono text-xs" style={{ color: tasaColor }}>
        {tasa !== null && tasa > 0 ? tasa : ''}
      </span>
    </>
  )
}
