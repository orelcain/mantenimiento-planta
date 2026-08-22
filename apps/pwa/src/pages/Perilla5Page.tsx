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
 * El iframe NO hereda la sesión de Firebase (storage particionado), así que esta
 * página actúa de PUENTE: la herramienta pide por postMessage listar/crear/editar/
 * borrar notas de figura y subir sus fotos, y acá se ejecuta contra Firestore y
 * Storage — mismo patrón que PlanosAguasPage. También se le manda el tema
 * (claro/oscuro) para que no sea una isla clara dentro de la app en oscuro.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, CircleGauge, LineChart as LineChartIcon, Loader2, RotateCcw,
  Save, Video,
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
  type Plugin,
  type TooltipItem,
} from 'chart.js'
import { useAuthStore } from '@/store'
import { useTheme } from '@/hooks/useTheme'
import { LC } from '@/data/learningTheme'
import {
  CONTADORES_KEYS,
  LECTURA_BASE_2026_08_08,
  MUESTRA_MINIMA_FISH,
  muestraValida,
  borradorDeVideo,
  type BorradorVideo,
  MAQUINAS,
  guardarLectura,
  lecturasDeMaquina,
  tasa1000,
  type ContadoresProtocolo,
  type LecturaProtocolo,
  type MaquinaBaader,
} from '@/services/baader142/perilla5Protocolo'
import {
  borrarNota,
  crearNota,
  editarNota,
  listarNotas,
  pathDeFoto,
  subirFoto,
  type NotaFigura,
} from '@/services/baader142/perilla5Notas'

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

/**
 * Series de la tendencia de CORRECCIONES.
 *
 * Además de los 5 motores lleva STOP-C (el total) y T-CLIP-C (abrazaderas):
 * el 22-08 la N2 estaba crítica en ambos (341 y 268/1000) con los 5 motores en
 * verde, y el gráfico decía "todo bien". Las series de sistema van más gruesas
 * y con trazo distinto para que no se confundan con una herramienta.
 */
const SERIES: { k: keyof ContadoresProtocolo; label: string; color: string;
                grosor?: number; trazo?: number[] }[] = [
  { k: 'stopc', label: 'Total correcciones', color: '#c8102e', grosor: 3 },
  { k: 'tclipc', label: 'Abrazaderas', color: '#b45309', grosor: 2.5, trazo: [6, 3] },
  { k: 'e821c', label: 'Centraje SM1', color: '#2E75B6' },
  { k: 'e822c', label: 'Cuchilla SM2', color: '#7d7f9e' },
  { k: 'e823c', label: 'Aspirador SM3', color: '#0f9d8f' },
  { k: 'e824c', label: 'Excavador A SM4', color: '#d97706' },
  { k: 'e825c', label: 'Excavador B SM5', color: '#8b5cf6' },
]

/**
 * Series de PARADAS: las que detienen la máquina de verdad.
 *
 * Van en su propia vista, no superpuestas a las -C. Correcciones llegan a 370/1000
 * y paradas a 128/1000: en un eje común las paradas quedan aplastadas contra el piso
 * y se leen como sanas, que es exactamente lo contrario de lo que pasa.
 */
const SERIES_PARADAS: typeof SERIES = [
  { k: 'stops', label: 'Total de paradas', color: '#c8102e', grosor: 3 },
  { k: 'tclip', label: 'Abrazaderas', color: '#b45309', trazo: [6, 3] },
  { k: 'anusi', label: 'Cuchilla punta I', color: '#2E75B6' },
  { k: 'anuso', label: 'Cuchilla punta O', color: '#0f9d8f' },
]

export type Metrica = 'correcciones' | 'paradas'

/**
 * Pauta de revisión por herramienta — extracto operativo del RUNBOOK E8xx (§2-§3)
 * y del manual 1420000804. La tarjeta «Qué revisar ahora» la muestra inline para
 * que el diagnóstico no obligue a saltar a otro documento; el detalle completo
 * sigue viviendo en la pestaña Herramienta.
 */
const PAUTAS: Record<string, { inductivo: string; pasos: string[] }> = {
  e821c: { inductivo: 'B1', pasos: [
    'Revisar inductivo B1 (posición cero del centraje), su cable y la distancia al tope — con la máquina parada.',
    'Verificar la correa del SM1 y buscar atasco en el recorrido del centrador.',
  ]},
  e822c: { inductivo: 'B2', pasos: [
    'Revisar inductivo B2 (posición cero de la cuchilla hendedora), su cable y la distancia al tope — con la máquina parada.',
    'Verificar la correa del SM2 y que la cuchilla no esté trabada ni mellada.',
  ]},
  e823c: { inductivo: 'B3', pasos: [
    'Revisar inductivo B3 (posición cero del aspirador), su cable y la distancia al tope — con la máquina parada.',
    'Verificar la correa del SM3 y que el tubo de aspiración no esté obstruido.',
  ]},
  e824c: { inductivo: 'B4', pasos: [
    'Revisar inductivo B4 (posición cero del excavador A), su cable y la distancia al tope — con la máquina parada.',
    'Verificar la correa del SM4 y buscar atasco mecánico en el recorrido del excavador.',
  ]},
  e825c: { inductivo: 'B5', pasos: [
    'Revisar inductivo B5 (posición cero del excavador B), su cable y la distancia al tope — con la máquina parada.',
    'Verificar la correa del SM5 y buscar atasco mecánico en el recorrido del excavador.',
  ]},
}
const PASO_FINAL =
  'Si tras la marcha de referencia (I → I) reincide, el problema es mecánico, no de control.'

/**
 * Lo que cada contador CUENTA, en lenguaje de planta, y su pauta.
 *
 * Es el contenido del tooltip didáctico y del lector del gráfico: el que mira
 * aprende qué significa el número sin salir a buscar el runbook. Fuentes:
 * manual 1420000804 (esquema de programas) y runbook E8xx.
 */
const SABER: Record<string, { que: string; pasos: string[] }> = {
  stopc: {
    que: 'Fallas de cualquier herramienta que el control corrigió sin detener la máquina — el total de la degradación silenciosa. Invisible en piso: solo este contador la ve.',
    pasos: [
      'Mirar qué contador específico domina (abrazaderas, cuchilla de punta o un motor): el total solo dice cuánto, no dónde.',
    ],
  },
  tclipc: {
    que: 'Fallas de las abrazaderas de cola corregidas por el control sin parar — el pescado no fue tomado por la primera abrazadera y lo recogió la segunda.',
    pasos: [
      'Revisar tensión y desgaste de las abrazaderas de cola — con la máquina parada.',
      'Verificar que la segunda abrazadera recoja el pescado que la primera no tomó.',
      'Si reincide tras la marcha de referencia, revisar los palpadores de entrada.',
    ],
  },
  tclip: {
    que: 'Fallas de abrazaderas que SÍ detuvieron la máquina: el pescado no fue recogido ni con la segunda abrazadera.',
    pasos: [
      'Revisar tensión y desgaste de ambas abrazaderas de cola.',
      'Verificar la introducción del pescado (posición y tamaño fuera de rango).',
    ],
  },
  stops: {
    que: 'Todas las fallas que hicieron que el ordenador detuviera la máquina. Cada una cuesta producción directa (~20 s de marcha de referencia + arranque).',
    pasos: [
      'Mirar qué contador de parada específico domina (abrazaderas o cuchilla de punta).',
    ],
  },
  anusi: {
    que: 'Fallas de la cuchilla de punta detectadas por el palpador interior (lado pared) que detuvieron la máquina.',
    pasos: [
      'Revisar la cuchilla de punta (filo, montaje) y el palpador del lado pared.',
      'Verificar el ajuste del palpador: distancia y limpieza.',
    ],
  },
  anuso: {
    que: 'Fallas de la cuchilla de punta detectadas por el palpador exterior (lado entrada) que detuvieron la máquina.',
    pasos: [
      'Revisar la cuchilla de punta (filo, montaje) y el palpador del lado entrada.',
      'Verificar el ajuste del palpador: distancia y limpieza.',
    ],
  },
  e821c: { que: 'Correcciones silenciosas del motor del centraje (SM1): perdió su posición cero y el control lo recuperó sin parar.', pasos: PAUTAS.e821c!.pasos },
  e822c: { que: 'Correcciones silenciosas del motor de la cuchilla hendedora (SM2).', pasos: PAUTAS.e822c!.pasos },
  e823c: { que: 'Correcciones silenciosas del motor del aspirador (SM3).', pasos: PAUTAS.e823c!.pasos },
  e824c: { que: 'Correcciones silenciosas del motor del excavador A (SM4).', pasos: PAUTAS.e824c!.pasos },
  e825c: { que: 'Correcciones silenciosas del motor del excavador B (SM5). Fue el caso fundacional: 1 de cada 3 pescados sin que nadie lo viera.', pasos: PAUTAS.e825c!.pasos },
}

/** Con qué escala de umbral se juzga cada contador. */
const METRICA_DE: Record<string, Metrica> = {
  stopc: 'correcciones', tclipc: 'correcciones', e821c: 'correcciones',
  e822c: 'correcciones', e823c: 'correcciones', e824c: 'correcciones',
  e825c: 'correcciones',
  stops: 'paradas', tclip: 'paradas', anusi: 'paradas', anuso: 'paradas',
}

/**
 * Umbrales provisorios (hasta tener 4 semanas de registro real).
 *
 * Paradas es ~3× más exigente que correcciones y no es arbitrario: una corrección
 * es invisible y no cuesta producción; una parada detiene la línea. A ~19 pz/min,
 * 1000 pescados son ~55 min, y si limpiar una parada toma ~20 s (marcha de
 * referencia + arranque), 30/1000 ≈ 18% del turno detenido. De ahí 3 · 10 · 30.
 * Dicho en planta: una parada cada 333 · cada 100 · cada 33 pescados.
 */
const UMBRALES: Record<Metrica, { vigilar: number; intervenir: number; critico: number }> = {
  correcciones: { vigilar: 5, intervenir: 30, critico: 100 },
  paradas: { vigilar: 3, intervenir: 10, critico: 30 },
}

function nivelTasa(r: number, metrica: Metrica = 'correcciones'): { label: string; color: string } {
  const u = UMBRALES[metrica]
  if (r >= u.critico) return { label: 'crítico', color: LC.crit }
  if (r >= u.intervenir) return { label: 'intervenir', color: LC.warn }
  if (r >= u.vigilar) return { label: 'vigilar', color: LC.prep }
  return { label: 'normal', color: LC.ok }
}

const FORM_VACIO: Record<keyof ContadoresProtocolo, string> = Object.fromEntries(
  CONTADORES_KEYS.map((k) => [k, '']),
) as Record<keyof ContadoresProtocolo, string>

export function Perilla5Page() {
  const [searchParams, setSearchParams] = useSearchParams()
  const vista: Vista = searchParams.get('vista') === 'protocolo' ? 'protocolo' : 'herramienta'
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { isDark } = useTheme()
  const { user } = useAuthStore()

  /* ---------- PUENTE con la herramienta embebida ----------
   * El iframe no tiene sesión de Firebase, así que nos pide a nosotros cada
   * operación sobre las notas y nosotros la ejecutamos. Todo mensaje se valida
   * por origen y por fuente antes de tocar nada. */
  useEffect(() => {
    const ORIGIN = window.location.origin
    const post = (msg: Record<string, unknown>) => {
      iframeRef.current?.contentWindow?.postMessage({ __p5: true, ...msg }, ORIGIN)
    }

    const enviarNotas = async () => {
      const notas = await listarNotas()
      post({ type: 'notas', notas, uid: user?.id ?? null, autor: user?.nombre ?? null })
    }

    const onMsg = (e: MessageEvent) => {
      if (e.origin !== ORIGIN) return
      if (e.source !== iframeRef.current?.contentWindow) return
      const m = e.data as Record<string, unknown>
      if (!m || m.__p5 !== true) return
      const reqId = m.reqId

      if (m.type === 'hello') {
        post({ type: 'tema', dark: isDark })
        void enviarNotas()
        return
      }
      if (!user?.id) {
        // Sin sesión la herramienta funciona igual, pero no puede compartir notas.
        post({ type: 'result', ok: false, code: 'sin-sesion', reqId })
        return
      }

      if (m.type === 'nota-crear') {
        const n = (m.nota ?? {}) as Partial<NotaFigura> & { fotoData?: string }
        ;(async () => {
          let fotoUrl: string | undefined
          let fotoPath: string | undefined
          if (n.fotoData && typeof n.fotoData === 'string' && n.fotoData.startsWith('data:image/')) {
            fotoPath = pathDeFoto(String(n.figura ?? 'fig'), user.id)
            fotoUrl = await subirFoto(n.fotoData, fotoPath)
          }
          await crearNota({
            plantId: 'chonchi',
            figura: String(n.figura ?? ''),
            tipo: (n.tipo as NotaFigura['tipo']) ?? 'nota',
            x: Number(n.x ?? 0),
            y: Number(n.y ?? 0),
            ...(n.texto ? { texto: String(n.texto).slice(0, 600) } : {}),
            ...(fotoUrl ? { fotoUrl, fotoPath } : {}),
            creadoPor: user.id,
            ...(user.nombre ? { creadoPorNombre: user.nombre } : {}),
          })
          await enviarNotas()
          post({ type: 'result', ok: true, reqId })
        })().catch((err) =>
          post({ type: 'result', ok: false, code: (err as { code?: string })?.code ?? 'error', reqId }),
        )
      } else if (m.type === 'nota-editar' && typeof m.id === 'string') {
        editarNota(m.id, {
          tipo: (m.tipo as NotaFigura['tipo']) ?? 'nota',
          texto: typeof m.texto === 'string' ? m.texto.slice(0, 600) : '',
        })
          .then(enviarNotas)
          .then(() => post({ type: 'result', ok: true, reqId }))
          .catch((err) =>
            post({ type: 'result', ok: false, code: (err as { code?: string })?.code ?? 'error', reqId }),
          )
      } else if (m.type === 'nota-borrar' && typeof m.id === 'string') {
        borrarNota(m.id, typeof m.fotoPath === 'string' ? m.fotoPath : undefined)
          .then(enviarNotas)
          .then(() => post({ type: 'result', ok: true, reqId }))
          .catch((err) =>
            post({ type: 'result', ok: false, code: (err as { code?: string })?.code ?? 'error', reqId }),
          )
      } else if (m.type === 'notas-refrescar') {
        void enviarNotas()
      }
    }

    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [user?.id, user?.nombre, isDark])

  // El tema puede cambiar con la herramienta ya abierta.
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { __p5: true, type: 'tema', dark: isDark },
      window.location.origin,
    )
  }, [isDark])

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
  // `embed=1` le dice que oculte su propia cabecera (esta página ya pone el
  // título) y `theme` evita el parpadeo claro antes del primer postMessage.
  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    const params = new URLSearchParams({ v, embed: '1' })
    const t = searchParams.get('t')
    const q = searchParams.get('q')
    if (t) params.set('t', t)
    if (q) params.set('q', q)
    params.set('theme', isDark ? 'dark' : 'light')
    return `${basePath}perilla5-baader142-embed.html?${params.toString()}`
    // El tema inicial se fija al montar; los cambios posteriores van por postMessage
    // (recargar el iframe perdería el zoom y la figura abierta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return (
    <div className="min-h-screen" style={{ background: LC.bg, color: LC.ink }}>
      {/* La herramienta es una superficie de lectura densa (tablas, figuras,
          buscador): encajonarla en max-w-5xl la hacía ver postiza en el monitor
          del taller. La vista de protocolo sí se queda angosta, que es un
          formulario. */}
      <div
        className={`mx-auto px-4 py-5 ${vista === 'herramienta' ? 'max-w-[1400px]' : 'max-w-5xl'}`}
      >
        <Link
          to="/aprendizaje"
          className="inline-flex items-center gap-1.5 text-sm"
          style={{ color: LC.inkMid }}
        >
          <ArrowLeft className="h-4 w-4" /> Centro de aprendizaje
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold leading-tight sm:text-2xl">
              Perilla 5 · Diagnóstico Baader 142
            </h1>
            {/* En el teléfono la herramienta necesita todo el alto posible: la
                descripción larga solo aparece de tablet para arriba. */}
            <p className="mt-1 hidden text-sm sm:block" style={{ color: LC.inkMid }}>
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
              className="inline-flex items-center gap-1.5 rounded-ctl border px-3 py-1.5 text-sm font-medium"
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
              className="inline-flex items-center gap-1.5 rounded-ctl border px-3 py-1.5 text-sm font-medium"
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
            className="mt-4 overflow-hidden rounded-card border"
            style={{ borderColor: LC.border }}
          >
            {/* El visor de figuras de la herramienta es position:fixed DENTRO del
                iframe, así que su "pantalla completa" es este alto: en el teléfono
                se le da todo lo que sobra para que el dibujo se vea grande. */}
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              title="Herramienta Perilla 5 · Diagnóstico BAADER 142"
              className="block h-[calc(100dvh-150px)] min-h-[520px] w-full sm:h-[calc(100dvh-200px)]"
              style={{ background: isDark ? '#0D1722' : '#EFF1F3' }}
              onLoad={() => {
                iframeRef.current?.contentWindow?.postMessage(
                  { __p5: true, type: 'tema', dark: isDark },
                  window.location.origin,
                )
              }}
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
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // El aviso de Telegram trae ?maquina=n2: el operador cae directo en SU maquina
  // en vez de aterrizar en N1 y tener que darse cuenta. Acepta n2 o baader-n2.
  const [maquina, setMaquina] = useState<MaquinaBaader>(() => {
    const q = (searchParams.get('maquina') ?? '').toLowerCase().replace('baader-', '')
    return q === 'n2' ? 'baader-n2' : q === 'n3' ? 'baader-n3' : 'baader-n1'
  })
  // Fecha LOCAL (no toISOString/UTC): la lectura semanal se hace al fin del turno
  // de la tarde, justo la ventana en que la fecha UTC ya saltó al día siguiente.
  const [fecha, setFecha] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [form, setForm] = useState<Record<keyof ContadoresProtocolo, string>>({ ...FORM_VACIO })
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  // Guard SÍNCRONO contra el doble-tap: el estado de React no alcanza a
  // re-renderizar entre dos taps rápidos y el 22-08 entraron lecturas duplicadas.
  const guardandoRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [guardadoOk, setGuardadoOk] = useState(false)

  const [lecturas, setLecturas] = useState<LecturaProtocolo[]>([])
  const [cargando, setCargando] = useState(true)
  const [metrica, setMetrica] = useState<Metrica>('correcciones')
  const [borrador, setBorrador] = useState<BorradorVideo | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const [rows, borr] = await Promise.all([
      lecturasDeMaquina(maquina),
      borradorDeVideo(maquina),
    ])
    setLecturas(rows)
    setBorrador(borr)
    setCargando(false)
  }, [maquina])

  // Guard de staleness: si el usuario cambia de máquina con una carga lenta en
  // vuelo, la respuesta vieja no debe pisar la lista de la máquina nueva.
  useEffect(() => {
    let vivo = true
    setCargando(true)
    void Promise.all([lecturasDeMaquina(maquina), borradorDeVideo(maquina)]).then(
      ([rows, borr]) => {
        if (!vivo) return
        setLecturas(rows)
        setBorrador(borr)
        setCargando(false)
      },
    )
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

  /**
   * Precarga los contadores que el watcher pudo leer del video.
   *
   * Los que faltan quedan VACÍOS a propósito (no en cero) y el aviso los nombra:
   * el operador tiene que ir al panel a buscarlos, no adivinarlos.
   */
  const rellenarDesdeVideo = () => {
    if (!borrador) return
    setFecha(borrador.fecha)
    setForm({
      ...FORM_VACIO,
      ...(Object.fromEntries(
        Object.entries(borrador.contadores).map(([k, v]) => [k, String(v)]),
      ) as Partial<Record<keyof ContadoresProtocolo, string>>),
    })
    setNotas(
      `Transcrito del video ${borrador.video ?? ''} (${borrador.fecha}). `
      + `Completar a mano: ${borrador.faltantes.join(', ') || '—'}.`,
    )
  }

  const limpiar = () => {
    setForm({ ...FORM_VACIO })
    setNotas('')
    setError(null)
    setGuardadoOk(false)
  }

  const guardar = async () => {
    if (guardando || guardandoRef.current) return
    guardandoRef.current = true
    try {
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
    // Un campo VACÍO no es un cero: guardarlo como 0 contamina la serie (un cero
    // inventado es indistinguible de uno real). Ya pasó con la lectura del 21-08.
    // Si el valor real es cero, hay que escribir 0 — eso es una afirmación.
    const vacios = CONTADORES_KEYS.filter((k) => form[k].trim() === '')
    if (vacios.length > 0) {
      setError(
        `Faltan ${vacios.length} contadores: ${vacios.join(', ')}. `
        + 'Si el valor real es cero, escribí 0; si no lo tenés, buscalo en el panel antes de guardar.',
      )
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
    } finally {
      guardandoRef.current = false
    }
  }

  /* --- tendencia: lecturas ascendentes por fecha --- */
  const serie = useMemo(() => [...lecturas].reverse(), [lecturas])
  const ejeColor = isDark ? '#8aa0b4' : '#4a555e'
  const gridColor = isDark ? 'rgba(138,160,180,0.15)' : 'rgba(74,85,94,0.15)'

  const seriesActivas = metrica === 'paradas' ? SERIES_PARADAS : SERIES
  const hayInsuficientes = serie.some((l) => !muestraValida(l))

  /**
   * Qué revisar ahora: la herramienta dominante de la ÚLTIMA lectura válida,
   * solo si cruzó «intervenir». Con todo verde no hay tarjeta — una alerta que
   * aparece siempre se deja de leer.
   */
  const queRevisar = useMemo(() => {
    const ultima = [...serie].reverse().find((l) => muestraValida(l))
    if (!ultima) return null
    // Los 11 contadores, cada uno contra SU escala (correcciones o paradas).
    // El 22-08 el dominante real de la N2 era STOP-C/T-CLIP-C con los motores
    // en verde: mirar solo motores decía "todo bien" con la máquina crítica.
    const todos = [...SERIES, ...SERIES_PARADAS].map((s) => {
      const m = METRICA_DE[s.k as string] ?? 'correcciones'
      const r = tasa1000(ultima[s.k], ultima.fish)
      const u = UMBRALES[m]
      return { s, r, m, exceso: r / u.intervenir }
    })
    // dominante = el que MÁS excede su propio umbral (370 correcciones no es
    // comparable con 23 paradas salvo normalizando por la escala)
    const dom = todos.reduce((a, b) => (b.exceso > a.exceso ? b : a))
    if (dom.exceso < 1) return null
    const previa = [...serie].reverse().find((l) => muestraValida(l) && l !== ultima)
    const saber = SABER[dom.s.k as string] ?? null
    // ¿los 5 motores están sanos? decide la frase "mecánico vs paso a paso"
    const motoresMax = Math.max(
      ...(['e821c', 'e822c', 'e823c', 'e824c', 'e825c'] as const)
        .map((k) => tasa1000(ultima[k], ultima.fish)),
    )
    return {
      lectura: ultima,
      serie: dom.s,
      metrica: dom.m,
      tasa: dom.r,
      nivel: nivelTasa(dom.r, dom.m),
      tasaPrevia: previa ? tasa1000(previa[dom.s.k], previa.fish) : null,
      saber,
      motoresSanos: motoresMax < UMBRALES.correcciones.vigilar,
      esMotor: String(dom.s.k).startsWith('e82'),
    }
  }, [serie])

  /**
   * Comparación entre máquinas para el lector: el mismo contador dominante en
   * las otras dos, con su última lectura válida. "La N3, con la misma pesca,
   * está en 31" enseña más que cualquier umbral.
   */
  const [comparacion, setComparacion] = useState<{ maquina: string; tasa: number }[]>([])
  useEffect(() => {
    let vivo = true
    if (!queRevisar) { setComparacion([]); return }
    const otras = MAQUINAS.filter((m) => m.id !== maquina)
    void Promise.all(otras.map(async (m) => {
      const rows = await lecturasDeMaquina(m.id, 'chonchi', 6)
      const ult = rows.find((l) => muestraValida(l))
      return ult
        ? { maquina: m.label.replace('Baader 142 ', '').replace(' (antigua)', ''),
            tasa: tasa1000(ult[queRevisar.serie.k], ult.fish) }
        : null
    })).then((r) => { if (vivo) setComparacion(r.filter((x): x is NonNullable<typeof x> => x !== null)) })
    return () => { vivo = false }
  }, [maquina, queRevisar])

  /**
   * Cierre del lazo: la incidencia sale precargada con máquina, código y pauta.
   * El marcador [protocolo142 …] en la descripción es lo que después permite
   * cruzar intervención ↔ lectura y mostrar que la tasa bajó.
   */
  const registrarIncidencia = () => {
    if (!queRevisar) return
    const q = queRevisar
    const unidadRuido = q.metrica === 'paradas' ? 'paradas' : 'correcciones'
    const titulo = `${q.serie.label}: ${q.tasa}/1000 ${unidadRuido} (protocolo ${MAQUINAS.find((m) => m.id === maquina)?.label ?? maquina})`
    const pasos = q.saber?.pasos ?? []
    const desc = [
      `[protocolo142 ${maquina} · ${q.serie.k} ${q.tasa}/1000 · lectura ${q.lectura.fecha}]`,
      q.tasaPrevia !== null ? `Venía de ${q.tasaPrevia}/1000 en la lectura anterior.` : '',
      ...comparacion.map((c) => `${c.maquina} está en ${c.tasa}/1000 en el mismo contador.`),
      '',
      'Pauta:',
      ...pasos.map((s, i) => `${i + 1}. ${s}`),
      ...(q.esMotor ? [`${pasos.length + 1}. ${PASO_FINAL}`] : []),
    ].filter(Boolean).join('\n')
    navigate(`/incidents?nueva=1&titulo=${encodeURIComponent(titulo)}&desc=${encodeURIComponent(desc)}`)
  }

  const chartData = useMemo(
    () => ({
      labels: serie.map((l) => l.fecha),
      datasets: seriesActivas.map((s) => ({
        label: s.label,
        // null (no 0) en las muestras insuficientes: con spanGaps:false la línea se
        // CORTA ahí. Unirla diría "de 31 subió a 88", y eso no se sabe — el panel
        // todavía no calculaba la tasa.
        data: serie.map((l) => (muestraValida(l) ? tasa1000(l[s.k], l.fish) : null)),
        borderColor: s.color,
        backgroundColor: s.color,
        pointRadius: 4,
        spanGaps: false,
        tension: 0.2,
        borderWidth: s.grosor ?? 2,
        borderDash: s.trazo ?? [],
        // clave del contador para que el tooltip encuentre su ficha en SABER
        clave: s.k as string,
      })),
    }),
    [serie, seriesActivas],
  )

  /**
   * Bandas de umbral pintadas DETRÁS de la serie, con etiqueta al borde.
   * El umbral deja de ser un texto al pie: el que mira aprende qué es "alto"
   * porque el punto cae en una zona de color.
   */
  const bandasPlugin = useMemo(() => {
    const u = UMBRALES[metrica]
    const bandas = isDark
      ? [
          { desde: u.critico, hasta: Infinity, fill: 'rgba(255,69,58,0.10)', ink: '#F0716A', label: `crítico ≥${u.critico}` },
          { desde: u.intervenir, hasta: u.critico, fill: 'rgba(255,140,10,0.09)', ink: '#EE8A55', label: `intervenir ≥${u.intervenir}` },
          { desde: u.vigilar, hasta: u.intervenir, fill: 'rgba(255,159,10,0.06)', ink: '#E0AC4E', label: `vigilar ≥${u.vigilar}` },
          { desde: 0, hasta: u.vigilar, fill: 'rgba(48,209,88,0.05)', ink: '#5DC9A2', label: 'normal' },
        ]
      : [
          { desde: u.critico, hasta: Infinity, fill: 'rgba(255,59,48,0.07)', ink: '#A8201A', label: `crítico ≥${u.critico}` },
          { desde: u.intervenir, hasta: u.critico, fill: 'rgba(255,105,0,0.08)', ink: '#B4501C', label: `intervenir ≥${u.intervenir}` },
          { desde: u.vigilar, hasta: u.intervenir, fill: 'rgba(255,149,0,0.07)', ink: '#875105', label: `vigilar ≥${u.vigilar}` },
          { desde: 0, hasta: u.vigilar, fill: 'rgba(52,199,89,0.07)', ink: '#127054', label: 'normal' },
        ]
    const plugin: Plugin<'line'> = {
      id: 'bandasUmbral',
      beforeDraw(chart) {
        const { ctx, chartArea, scales } = chart
        const y = scales.y as { getPixelForValue: (v: number) => number } | undefined
        if (!y) return
        if (!chartArea) return
        ctx.save()
        for (const b of bandas) {
          const yTop = b.hasta === Infinity ? chartArea.top
            : Math.max(chartArea.top, y.getPixelForValue(b.hasta))
          const yBot = Math.min(chartArea.bottom, y.getPixelForValue(b.desde))
          if (yBot <= yTop) continue
          ctx.fillStyle = b.fill
          ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBot - yTop)
          if (yBot - yTop > 14) {
            ctx.fillStyle = b.ink
            ctx.font = '700 9px system-ui'
            ctx.textAlign = 'right'
            ctx.fillText(b.label, chartArea.right - 4, Math.min(yTop + 11, yBot - 4))
          }
        }
        ctx.restore()
      },
    }
    return plugin
  }, [metrica, isDark])

  /** Corta un texto en líneas de tooltip (~46 caracteres): Chart.js no envuelve. */
  const envolver = (texto: string, ancho = 46): string[] => {
    const palabras = texto.split(' ')
    const lineas: string[] = []
    let linea = ''
    for (const p of palabras) {
      if ((linea + ' ' + p).trim().length > ancho) { lineas.push(linea.trim()); linea = p }
      else linea = linea + ' ' + p
    }
    if (linea.trim()) lineas.push(linea.trim())
    return lineas
  }

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      // nearest (no index): el tooltip didáctico es de UN contador; con 7 series
      // el modo index apila las fichas de todas y no se puede leer ninguna
      interaction: { mode: 'nearest' as const, intersect: false },
      plugins: {
        legend: { labels: { color: ejeColor, boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (item: TooltipItem<'line'>) => {
              const clave = (item.dataset as { clave?: string }).clave ?? ''
              const m = METRICA_DE[clave] ?? 'correcciones'
              const r = item.parsed.y ?? 0
              return `${item.dataset.label}: ${r}/1000 · ${nivelTasa(r, m).label}`
            },
            // La ficha del contador: qué cuenta + la pauta. El tooltip ES la clase.
            afterBody: (items: TooltipItem<'line'>[]) => {
              const clave = (items[0]?.dataset as { clave?: string })?.clave ?? ''
              const s = SABER[clave]
              if (!s) return []
              return [
                '',
                ...envolver(s.que),
                '',
                'Pauta:',
                ...s.pasos.flatMap((p, i) => envolver(`${i + 1}. ${p}`)),
              ]
            },
          },
        },
      },
      scales: {
        x: { ticks: { color: ejeColor, font: { size: 11 } }, grid: { color: gridColor } },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: metrica === 'paradas' ? 'paradas por 1000 pescados' : 'correcciones -C por 1000 pescados',
            color: ejeColor,
            font: { size: 11 },
          },
          ticks: { color: ejeColor, font: { size: 11 } },
          grid: { color: gridColor },
        },
      },
    }),
    [ejeColor, gridColor, metrica],
  )

  return (
    <div className="mt-4 space-y-4">
      {/* Qué es y por qué se registra */}
      <div
        className="rounded-card border p-4 text-sm leading-relaxed"
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
        <span className="text-xs tracking-wide" style={{ color: LC.inkLo }}>
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
        <div className="min-w-0 rounded-card border p-4" style={{ background: LC.surface, borderColor: LC.border }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Nueva lectura</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={precargarBase}
                className="rounded-ctl border px-2 py-1 text-xs"
                style={{ borderColor: LC.border, color: LC.inkMid }}
                title="Rellena el formulario con la lectura de terreno del 08-08-2026 (Baader antigua)"
              >
                Precargar base 08-08
              </button>
              <button
                type="button"
                onClick={limpiar}
                className="inline-flex items-center gap-1 rounded-ctl border px-2 py-1 text-xs"
                style={{ borderColor: LC.border, color: LC.inkMid }}
              >
                <RotateCcw className="h-3 w-3" /> Limpiar
              </button>
            </div>
          </div>

          {borrador ? (
            <div className="mt-3 rounded-ctl p-3" style={{ background: LC.aquaSoft }}>
              <p
                className="flex items-center gap-1.5 text-footnote font-medium"
                style={{ color: LC.aqua }}
              >
                <Video className="h-4 w-4 shrink-0" />
                Hay un video transcrito del {borrador.fecha}
              </p>
              <p className="mt-1 text-caption" style={{ color: LC.inkMid }}>
                {Object.keys(borrador.contadores).length} de {CONTADORES_KEYS.length} contadores
                leídos.{' '}
                {borrador.faltantes.length
                  ? `El barrido no alcanzó a mostrar ${borrador.faltantes.length}: hay que buscarlos en el panel.`
                  : 'Están todos.'}
              </p>
              <button
                type="button"
                onClick={rellenarDesdeVideo}
                className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-ctl px-3 text-footnote font-medium"
                style={{ background: LC.aqua, color: '#fff' }}
              >
                Rellenar el formulario
              </button>
            </div>
          ) : null}

          <label className="mt-3 block text-xs" style={{ color: LC.inkLo }}>
            Fecha de la lectura
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 block w-full rounded-ctl border px-2 py-1.5 font-mono text-sm"
              style={{ background: LC.surfaceHi, borderColor: LC.border, color: LC.ink }}
            />
          </label>

          <div className="mt-3 grid grid-cols-[1fr_92px_56px] items-center gap-x-2 gap-y-1.5">
            <span className="text-caption tracking-wide" style={{ color: LC.inkGhost }}>Contador</span>
            <span className="text-right text-caption tracking-wide" style={{ color: LC.inkGhost }}>Valor</span>
            <span className="text-right text-caption tracking-wide" style={{ color: LC.inkGhost }}>/1000</span>
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
              className="mt-1 block w-full rounded-ctl border px-2 py-1.5 text-sm"
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
            className="mt-3 inline-flex items-center gap-1.5 rounded-ctl px-4 py-2 text-sm font-semibold disabled:opacity-50"
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

        {/* Qué revisar ahora — solo cuando la última lectura cruzó «intervenir».
            Orden por urgencia: la acción va antes que el gráfico. */}
        {queRevisar ? (
          <div
            className="min-w-0 rounded-card border p-4 lg:col-span-2"
            style={{ background: LC.surface, borderColor: queRevisar.nivel.color }}
            role="region"
            aria-label="Qué revisar ahora"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-ctl"
                style={{ background: LC.dangerSoft, color: queRevisar.nivel.color }}
              >
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold leading-tight">
                  {queRevisar.serie.label} — qué revisar ahora
                </h2>
                <p className="text-caption" style={{ color: LC.inkMid }}>
                  Lectura del {queRevisar.lectura.fecha} · {queRevisar.lectura.fish} pescados
                </p>
              </div>
              <span
                className="rounded-ctl px-2.5 py-1 text-footnote font-semibold tabular-nums"
                style={{ background: LC.dangerSoft, color: queRevisar.nivel.color }}
              >
                {queRevisar.tasa}/1000 · {queRevisar.nivel.label}
              </span>
            </div>

            {/* El lector: qué dice el gráfico hoy, en lenguaje de planta */}
            <div className="mt-3 space-y-1.5 text-footnote" style={{ color: LC.ink }}>
              <p>
                {queRevisar.saber?.que ?? ''}{' '}
                <strong className="tabular-nums">
                  {queRevisar.metrica === 'paradas' ? 'Una parada' : 'Una corrección'} cada{' '}
                  {Math.max(1, Math.round(1000 / Math.max(queRevisar.tasa, 1)))} pescados.
                </strong>
                {queRevisar.tasaPrevia !== null
                  ? ` Venía de ${queRevisar.tasaPrevia}/1000 en la lectura anterior.`
                  : ''}
              </p>
              {comparacion.length > 0 ? (
                <p style={{ color: LC.inkMid }}>
                  En el mismo contador,{' '}
                  {comparacion.map((c, i) => (
                    <span key={c.maquina}>
                      {i > 0 ? ' y ' : ''}
                      <strong style={{ color: LC.ink }}>{c.maquina}</strong> está en{' '}
                      <strong
                        className="tabular-nums"
                        style={{ color: nivelTasa(c.tasa, queRevisar.metrica).color }}
                      >
                        {c.tasa}/1000
                      </strong>
                    </span>
                  ))}
                  .
                </p>
              ) : null}
              {!queRevisar.esMotor && queRevisar.motoresSanos ? (
                <p style={{ color: LC.inkMid }}>
                  Los 5 motores paso a paso están sanos: el problema es{' '}
                  <strong style={{ color: LC.ink }}>mecánico</strong>, no de control.
                </p>
              ) : null}
            </div>

            <ol className="mt-3 space-y-2 text-footnote" style={{ color: LC.ink }}>
              {(queRevisar.saber?.pasos ?? []).map((paso, i) => (
                <li key={paso} className="flex gap-2">
                  <span className="font-mono text-caption" style={{ color: LC.inkLo }}>{i + 1}</span>
                  <span>{paso}</span>
                </li>
              ))}
              {queRevisar.esMotor ? (
                <li className="flex gap-2">
                  <span className="font-mono text-caption" style={{ color: LC.inkLo }}>
                    {(queRevisar.saber?.pasos.length ?? 0) + 1}
                  </span>
                  <span>{PASO_FINAL}</span>
                </li>
              ) : null}
            </ol>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={registrarIncidencia}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-ctl px-4 text-footnote font-semibold"
                style={{ background: LC.aqua, color: '#fff' }}
              >
                Registrar incidencia con esto
              </button>
              <button
                type="button"
                onClick={() => setSearchParams({ vista: 'herramienta' })}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-ctl px-4 text-footnote font-medium"
                style={{ background: LC.aquaSoft, color: LC.aqua }}
              >
                Diagnóstico completo
              </button>
            </div>
            <p className="mt-2 text-caption" style={{ color: LC.inkLo }}>
              La incidencia sale precargada con la máquina, el código y estos pasos como pauta.
            </p>
          </div>
        ) : null}

        {/* Tendencia */}
        <div className="min-w-0 rounded-card border p-4" style={{ background: LC.surface, borderColor: LC.border }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              {metrica === 'paradas' ? 'Tendencia de paradas' : 'Tendencia de correcciones -C'}
            </h2>
            <div
              className="inline-flex gap-1 rounded-ctl p-0.5"
              role="tablist"
              aria-label="Métrica"
              style={{ background: LC.bgPanel }}
            >
              {(['correcciones', 'paradas'] as Metrica[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={metrica === m}
                  onClick={() => setMetrica(m)}
                  className="min-h-[44px] rounded-ctl px-3 text-footnote font-medium"
                  style={
                    metrica === m
                      ? { background: LC.surface, color: LC.aqua }
                      : { color: LC.inkMid }
                  }
                >
                  {m === 'paradas' ? 'Paradas' : 'Correcciones -C'}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs" style={{ color: LC.inkMid }}>
            {metrica === 'paradas' ? (
              <>
                Paradas por 1000 pescados. Estas SÍ detienen la línea, así que la escala es más
                exigente: {UMBRALES.paradas.vigilar} vigilar · {UMBRALES.paradas.intervenir}{' '}
                intervenir · {UMBRALES.paradas.critico} crítico — una parada cada 333, cada 100 y
                cada 33 pescados.
              </>
            ) : (
              <>
                Tasa /1000 pescados por herramienta. La serie que sube semana a semana marca el
                subconjunto a intervenir. Umbrales provisorios: {UMBRALES.correcciones.vigilar}{' '}
                vigilar · {UMBRALES.correcciones.intervenir} intervenir ·{' '}
                {UMBRALES.correcciones.critico} crítico
              </>
            )}
            <span style={{ color: LC.inkLo }}> (criterio interno de Mantención ANTARFOOD hasta
            juntar 4 semanas de registro real)</span>.
          </p>
          {hayInsuficientes ? (
            <p
              className="mt-2 flex items-start gap-1.5 text-xs"
              style={{ color: LC.warn }}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                La línea se corta en las lecturas con menos de {MUESTRA_MINIMA_FISH} pescados: el
                panel todavía no calcula /1000Fi y esas tasas no son comparables.
              </span>
            </p>
          ) : null}
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
            <div className="relative mt-3 h-64 w-full min-w-0">
              <Line data={chartData} options={chartOptions} plugins={[bandasPlugin]} />
            </div>
          )}
        </div>
      </div>

      {/* Historial */}
      <div className="rounded-card border p-4" style={{ background: LC.surface, borderColor: LC.border }}>
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
                  const valida = muestraValida(l)
                  const tasas = SERIES.map((s) => ({ s, r: tasa1000(l[s.k], l.fish) }))
                  const dom = tasas.reduce((a, b) => (b.r > a.r ? b : a))
                  const nivel = nivelTasa(dom.r)
                  return (
                    <tr key={l.id} style={{ borderTop: `1px solid ${LC.border}` }}>
                      <td className="py-1.5 pr-3 font-mono text-xs">
                        {l.fecha}
                        {valida ? null : (
                          <span
                            className="ml-1.5 rounded-ctl px-1.5 py-0.5 text-caption font-medium"
                            style={{ background: LC.warnSoft, color: LC.warn }}
                          >
                            muestra insuf.
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums">
                        {l.fish}
                      </td>
                      {/* Con muestra insuficiente se muestra "—", no el número en gris:
                          un valor atenuado igual se lee y se compara; una raya no. */}
                      <td className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums">
                        {valida ? tasa1000(l.stopc, l.fish) : <span style={{ color: LC.inkLo }}>—</span>}
                      </td>
                      {tasas.map(({ s, r }) => (
                        <td
                          key={s.k}
                          className="py-1.5 pr-3 text-right font-mono text-xs tabular-nums"
                        >
                          {valida ? r : <span style={{ color: LC.inkLo }}>—</span>}
                        </td>
                      ))}
                      <td className="py-1.5 text-xs">
                        {!valida ? (
                          <span style={{ color: LC.warn }}>
                            Sin tasas: menos de {MUESTRA_MINIMA_FISH} pescados
                          </span>
                        ) : dom.r > 0 ? (
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
        className="w-full rounded-ctl border px-2 py-1 text-right font-mono text-sm"
        style={{ background: LC.surfaceHi, borderColor: LC.border, color: LC.ink }}
      />
      <span className="text-right font-mono text-xs" style={{ color: tasaColor }}>
        {tasa !== null && tasa > 0 ? tasa : ''}
      </span>
    </>
  )
}
