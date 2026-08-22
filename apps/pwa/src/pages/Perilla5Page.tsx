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
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, CircleGauge, Copy,
  TrendingDown, TrendingUp, LineChart as LineChartIcon, Loader2, RotateCcw,
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
  incidenciasProtocolo, type IncidenciaProtocolo,
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

/** Nombre corto para el chip: el largo vive en el tooltip del gráfico. */
const CORTO: Record<string, string> = {
  stopc: '-C total', tclipc: 'Abraz.', e821c: 'Centraje', e822c: 'Cuchilla',
  e823c: 'Aspirador', e824c: 'Exc. A', e825c: 'Exc. B',
  stops: 'Paradas', tclip: 'Abraz.', anusi: 'Cuch. I', anuso: 'Cuch. O',
}

/** URL absoluta de esta vista con la máquina puesta — se pega en Telegram. */
function urlProtocoloMaquina(maquina: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}aprendizaje/perilla-5?vista=protocolo&maquina=${encodeURIComponent(maquina)}`
}

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
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** '2026-08-22' -> '22 ago' — el eje y el historial respiran con fechas cortas. */
function fechaCorta(f: string): string {
  const [, m, d] = f.split('-')
  return `${Number(d)} ${MESES_CORTOS[Number(m) - 1] ?? m}`
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
const SABER: Record<string, { titulo?: string; que: string; pasos: string[] }> = {
  stopc: {
    titulo: 'Mirar el desglose de correcciones',
    que: 'Fallas de cualquier herramienta que el control corrigió sin detener la máquina — el total de la degradación silenciosa. Invisible en piso: solo este contador la ve.',
    pasos: [
      'Mirar qué contador específico domina (abrazaderas, cuchilla de punta o un motor): el total solo dice cuánto, no dónde.',
    ],
  },
  tclipc: {
    titulo: 'Revisar las abrazaderas de cola',
    que: 'Fallas de las abrazaderas de cola corregidas por el control sin parar — el pescado no fue tomado por la primera abrazadera y lo recogió la segunda.',
    pasos: [
      'Revisar tensión y desgaste de las abrazaderas de cola — con la máquina parada.',
      'Verificar que la segunda abrazadera recoja el pescado que la primera no tomó.',
      'Si reincide tras la marcha de referencia, revisar los palpadores de entrada.',
    ],
  },
  tclip: {
    titulo: 'Revisar las abrazaderas de cola',
    que: 'Fallas de abrazaderas que SÍ detuvieron la máquina: el pescado no fue recogido ni con la segunda abrazadera.',
    pasos: [
      'Revisar tensión y desgaste de ambas abrazaderas de cola.',
      'Verificar la introducción del pescado (posición y tamaño fuera de rango).',
    ],
  },
  stops: {
    titulo: 'Mirar el desglose de paradas',
    que: 'Todas las fallas que hicieron que el ordenador detuviera la máquina. Cada una cuesta producción directa (~20 s de marcha de referencia + arranque).',
    pasos: [
      'Mirar qué contador de parada específico domina (abrazaderas o cuchilla de punta).',
    ],
  },
  anusi: {
    titulo: 'Revisar la cuchilla de punta',
    que: 'Fallas de la cuchilla de punta detectadas por el palpador interior (lado pared) que detuvieron la máquina.',
    pasos: [
      'Revisar la cuchilla de punta (filo, montaje) y el palpador del lado pared.',
      'Verificar el ajuste del palpador: distancia y limpieza.',
    ],
  },
  anuso: {
    titulo: 'Revisar la cuchilla de punta',
    que: 'Fallas de la cuchilla de punta detectadas por el palpador exterior (lado entrada) que detuvieron la máquina.',
    pasos: [
      'Revisar la cuchilla de punta (filo, montaje) y el palpador del lado entrada.',
      'Verificar el ajuste del palpador: distancia y limpieza.',
    ],
  },
  e821c: { titulo: 'Revisar el centraje (SM1)', que: 'Correcciones silenciosas del motor del centraje (SM1): perdió su posición cero y el control lo recuperó sin parar.', pasos: PAUTAS.e821c!.pasos },
  e822c: { titulo: 'Revisar la cuchilla hendedora (SM2)', que: 'Correcciones silenciosas del motor de la cuchilla hendedora (SM2).', pasos: PAUTAS.e822c!.pasos },
  e823c: { titulo: 'Revisar el aspirador (SM3)', que: 'Correcciones silenciosas del motor del aspirador (SM3).', pasos: PAUTAS.e823c!.pasos },
  e824c: { titulo: 'Revisar el excavador A (SM4)', que: 'Correcciones silenciosas del motor del excavador A (SM4).', pasos: PAUTAS.e824c!.pasos },
  e825c: { titulo: 'Revisar el excavador B (SM5)', que: 'Correcciones silenciosas del motor del excavador B (SM5). Fue el caso fundacional: 1 de cada 3 pescados sin que nadie lo viera.', pasos: PAUTAS.e825c!.pasos },
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
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-ctl border px-3.5 text-sm font-medium"
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
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-ctl border px-3.5 text-sm font-medium"
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
  // useTheme es estado LOCAL por instancia: el toggle de la toolbar cambia SU
  // copia y esta vista nunca se entera (el gráfico quedaba con los colores del
  // tema anterior hasta un remount). Se observa la clase del documento, que es
  // la fuente de verdad que todos comparten.
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
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
  const cambiarMetrica = (m: Metrica) => {
    setMetrica(m)
    guardarPrefs(maquina, { metrica: m })
  }
  const [borrador, setBorrador] = useState<BorradorVideo | null>(null)
  /** Cambia de máquina y deja la URL compartible (?maquina=n2). */
  const cambiarMaquina = (id: MaquinaBaader) => {
    setMaquina(id)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('maquina', id.replace('baader-', ''))
      return next
    }, { replace: true })
  }

  /** Veredicto de la última lectura válida de CADA máquina, para el selector,
   *  y sus filas (el mismo viaje alimenta la comparación del gráfico). */
  const [veredictos, setVeredictos] = useState<Partial<Record<MaquinaBaader, { label: string; color: string }>>>({})
  const [filasPorMaquina, setFilasPorMaquina] = useState<Partial<Record<MaquinaBaader, LecturaProtocolo[]>>>({})
  useEffect(() => {
    let vivo = true
    void Promise.all(MAQUINAS.map(async (m) => {
      const rows = await lecturasDeMaquina(m.id, 'chonchi', 6)
      const ult = rows.find((l) => muestraValida(l))
      return [m.id, rows, ult ? veredictoDe(ult) : null] as const
    })).then((tuplas) => {
      if (!vivo) return
      const vs: Partial<Record<MaquinaBaader, { label: string; color: string }>> = {}
      const fs: Partial<Record<MaquinaBaader, LecturaProtocolo[]>> = {}
      for (const [id, rows, v] of tuplas) {
        fs[id] = rows
        if (v) vs[id] = { label: v.label, color: v.color }
      }
      setVeredictos(vs)
      setFilasPorMaquina(fs)
    })
    return () => { vivo = false }
  }, [guardadoOk])   // se refresca al guardar una lectura nueva

  /** Superponer la serie visible en las OTRAS máquinas (solo con UNA encendida). */
  const [comparar, setComparar] = useState(false)
  /** P41: incidencias nacidas del lector (marcador [protocolo142 …]). */
  const [incidencias, setIncidencias] = useState<IncidenciaProtocolo[]>([])
  // P33: lo verde plegado en un chip; se expande solo si alguien lo pide.
  const [verdesAbiertos, setVerdesAbiertos] = useState(false)

  useEffect(() => {
    let cancelado = false
    incidenciasProtocolo(maquina)
      .then((filas) => { if (!cancelado) setIncidencias(filas) })
      .catch(() => { if (!cancelado) setIncidencias([]) })
    return () => { cancelado = true }
  }, [maquina])

  /**
   * Preferencias por máquina (métrica y series apagadas) en localStorage:
   * volver a la vista y encontrarla como la dejaste. La clave incluye la
   * máquina porque N2 con abrazaderas críticas y N3 sana se miran distinto.
   */
  const PREFS_KEY = 'perilla5-protocolo-prefs'
  const leerPrefs = useCallback((): Record<string, { metrica?: Metrica; apagadas?: string[] }> => {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') } catch { return {} }
  }, [])
  const guardarPrefs = useCallback((id: string, patch: { metrica?: Metrica; apagadas?: string[] }) => {
    try {
      const todo = leerPrefs()
      todo[id] = { ...todo[id], ...patch }
      localStorage.setItem(PREFS_KEY, JSON.stringify(todo))
    } catch { /* almacenamiento lleno o bloqueado: la vista funciona igual */ }
  }, [leerPrefs])

  // Registrar es semanal y el explicativo es de una sola vez: ambos plegados.
  const [mostrarForm, setMostrarForm] = useState(false)
  const [lecturaAbierta, setLecturaAbierta] = useState<string | null>(null)
  const [mostrarInfo, setMostrarInfo] = useState(false)

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
      // feedback inmediato y cierre del ciclo: el form se pliega, los campos
      // quedan limpios para la proxima, y la confirmacion vive junto a la celda
      setMostrarForm(false)
      setForm({ ...FORM_VACIO })
      setNotas('')
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

  const ultimaValida = useMemo(
    () => [...serie].reverse().find((l) => muestraValida(l)) ?? null,
    [serie],
  )

  /** Series apagadas del gráfico (por clave). */
  const [apagadas, setApagadas] = useState<Set<string>>(new Set())
  // Smart default: encendido solo lo que tiene algo que decir (nivel ≥ vigilar)
  // más el total. La N2 de hoy abre con 3 líneas, no 7 — menos es más (§63).
  useEffect(() => {
    setComparar(false)
    const pref = leerPrefs()[maquina]
    // metrica guardada de esta maquina (solo al entrar a la maquina)
    if (pref?.metrica && pref.metrica !== metrica) setMetrica(pref.metrica)
    if (pref?.apagadas) { setApagadas(new Set(pref.apagadas)); return }
    if (!ultimaValida) { setApagadas(new Set()); return }
    const off = new Set<string>()
    for (const s of seriesActivas) {
      const k = s.k as string
      const esTotal = k === 'stopc' || k === 'stops'
      const r = tasa1000(ultimaValida[s.k], ultimaValida.fish)
      const m = METRICA_DE[k] ?? 'correcciones'
      if (!esTotal && nivelTasa(r, m).label === 'normal') off.add(k)
    }
    setApagadas(off)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maquina, metrica, ultimaValida, seriesActivas])

  /** La lectura válida ANTERIOR a la última: el denominador de los deltas. */
  const penultimaValida = useMemo(() => {
    const validas = serie.filter((l) => muestraValida(l))
    return validas.length >= 2 ? (validas[validas.length - 2] ?? null) : null
  }, [serie])

  /** Chips-leyenda: cada serie con su valor actual; los motores sanos, plegados en uno. */
  const chips = useMemo(() => {
    type Chip = { id: string; label: string; color?: string; on: boolean; toggle: () => void; delta?: 'sube' | 'baja' }
    const alternar = (ks: string[], encender: boolean) =>
      setApagadas((prev) => {
        const n = new Set(prev)
        for (const k of ks) { if (encender) n.delete(k); else n.add(k) }
        guardarPrefs(maquina, { apagadas: [...n] })
        return n
      })
    const items: Chip[] = []
    // P33: TODO lo verde (motores o no) se pliega en un chip; la fila queda
    // para lo que tiene algo que decir. Expandir es reversible y no persiste.
    const verdes: typeof seriesActivas = []
    for (const s of seriesActivas) {
      const k = s.k as string
      const r = ultimaValida ? tasa1000(ultimaValida[s.k], ultimaValida.fish) : null
      const m = METRICA_DE[k] ?? 'correcciones'
      const sano = r !== null && nivelTasa(r, m).label === 'normal'
      if (sano && !verdesAbiertos) { verdes.push(s); continue }
      const rPrev = penultimaValida ? tasa1000(penultimaValida[s.k], penultimaValida.fish) : null
      items.push({
        id: k,
        label: r !== null ? `${CORTO[k] ?? s.label} ${r}` : (CORTO[k] ?? s.label),
        color: s.color,
        on: !apagadas.has(k),
        toggle: () => alternar([k], apagadas.has(k)),
        // direccion vs la lectura anterior: subir es malo en estas series
        delta: r !== null && rPrev !== null && r !== rPrev ? (r > rPrev ? 'sube' : 'baja') : undefined,
      })
    }
    if (verdes.length > 0) {
      items.push({
        id: 'verdes',
        label: `+${verdes.length} en verde`,
        on: false,
        toggle: () => setVerdesAbiertos(true),
      })
    } else if (verdesAbiertos) {
      items.push({ id: 'plegar', label: 'plegar verdes', on: false, toggle: () => setVerdesAbiertos(false) })
    }
    // Con UNA serie encendida se puede comparar contra las otras máquinas:
    // la brecha que el lector dice en texto, vista.
    const encendidas = seriesActivas.filter((s) => !apagadas.has(s.k as string))
    if (encendidas.length === 1) {
      items.push({
        id: 'comparar',
        label: 'Otras máquinas',
        on: comparar,
        toggle: () => setComparar((v) => !v),
      })
    }
    return items
  }, [seriesActivas, ultimaValida, penultimaValida, apagadas, comparar, maquina, guardarPrefs, verdesAbiertos])

  /** Veredicto de una lectura: el peor de los 11 contadores contra SU escala.
   *  Devuelve además QUIÉN lo causó — «crítico» a secas obligaba a expandir
   *  la fila para saber si era el mismo contador de siempre u otro nuevo. */
  const veredictoDe = (l: LecturaProtocolo) => {
    if (!muestraValida(l)) return { label: 'muestra insuf.', color: LC.warn, soft: LC.warnSoft, dominante: null as string | null }
    let peor: { label: string; color: string; exceso: number; dominante: string | null } =
      { label: 'normal', color: LC.ok, exceso: 0, dominante: null }
    for (const s of [...SERIES, ...SERIES_PARADAS]) {
      const m = METRICA_DE[s.k as string] ?? 'correcciones'
      const r = tasa1000(l[s.k], l.fish)
      const ex = r / UMBRALES[m].intervenir
      if (ex > peor.exceso) {
        const n = nivelTasa(r, m)
        peor = { label: n.label, color: n.color, exceso: ex,
                 dominante: ex >= 1 ? `${CORTO[s.k as string] ?? s.label} ${r}` : null }
      }
    }
    const soft = peor.label === 'crítico' ? LC.dangerSoft
      : peor.label === 'intervenir' ? LC.warnSoft
      : peor.label === 'vigilar' ? LC.prepSoft : LC.okSoft
    return { label: peor.label, color: peor.color, soft, dominante: peor.dominante }
  }

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
   * P42: el lazo del contador dominante. Una ABIERTA frena el duplicado; una
   * RESUELTA con la tasa más baja que cuando se registró es la frase que
   * cierra el círculo: se intervino y el número bajó.
   */
  const lazo = useMemo(() => {
    if (!queRevisar) return null
    const delContador = incidencias.filter((i) => i.contador === String(queRevisar.serie.k))
    const abierta = delContador.find((i) => ['pendiente', 'confirmada', 'en_proceso'].includes(i.status)) ?? null
    const resuelta = delContador.find((i) =>
      ['resuelta', 'cerrada'].includes(i.status)
      && i.lectura < queRevisar.lectura.fecha
      && i.tasa > queRevisar.tasa) ?? null
    return { abierta, resuelta }
  }, [incidencias, queRevisar])

  /**
   * Comparación entre máquinas para el lector: el mismo contador dominante en
   * las otras dos, con su última lectura válida. "La N3, con la misma pesca,
   * está en 31" enseña más que cualquier umbral.
   */
  // Derivada de filasPorMaquina — el fetch de veredictos ya trajo estas filas;
  // pedirlas de nuevo eran 2 reads de Firestore duplicados por cambio de máquina.
  const comparacion = useMemo(() => {
    if (!queRevisar) return []
    return MAQUINAS.filter((m) => m.id !== maquina)
      .map((m) => {
        const ult = (filasPorMaquina[m.id] ?? []).find((l) => muestraValida(l))
        return ult
          ? { maquina: m.label.replace('Baader 142 ', '').replace(' (antigua)', ''),
              tasa: tasa1000(ult[queRevisar.serie.k], ult.fish) }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [maquina, queRevisar, filasPorMaquina])

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
      '',
      urlProtocoloMaquina(maquina),
    ].filter(Boolean).join('\n')
    navigate(`/incidents?nueva=1&titulo=${encodeURIComponent(titulo)}&desc=${encodeURIComponent(desc)}`)
  }

  /** Resumen del lector en texto plano, listo para pegar al grupo del turno. */
  const [copiado, setCopiado] = useState(false)
  const copiarResumen = async () => {
    if (!queRevisar) return
    const q = queRevisar
    const etiqueta = MAQUINAS.find((m) => m.id === maquina)?.label ?? maquina
    const lineas = [
      `Protocolo ${etiqueta} — lectura ${q.lectura.fecha} (${q.lectura.fish} pescados)`,
      `${q.saber?.titulo ?? q.serie.label}: ${q.tasa}/1000 (${q.nivel.label})`,
      ...(q.tasaPrevia !== null ? [`Venía de ${q.tasaPrevia}/1000.`] : []),
      ...comparacion.map((c) => `${c.maquina} está en ${c.tasa}/1000.`),
      'Pauta:',
      ...(q.saber?.pasos ?? []).map((s, i) => `${i + 1}. ${s}`),
      urlProtocoloMaquina(maquina),
    ]
    const texto = lineas.join('\n')
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      // WebViews y permisos raros: fallback clásico con textarea temporal
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } finally { ta.remove() }
    }
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2500)
  }

  /**
   * P39: reinicio del protocolo entre lecturas. Los contadores del panel son
   * ACUMULATIVOS desde el último reset; si el crudo baja de una lectura a la
   * siguiente, alguien puso el protocolo en cero entre medio (pasó en la N2:
   * la tasa «mejoró» de 1026 a 341 con reset de por medio). La tasa /1000
   * sigue siendo comparable, pero el que lee tiene derecho a saberlo.
   */
  const huboReinicio = useMemo(() => {
    const marcas = new Set<string>()
    let previa: LecturaProtocolo | null = null
    for (const l of serie) {
      if (previa) {
        const bajaCrudo = ([...SERIES, ...SERIES_PARADAS] as const)
          .some((s) => l[s.k] < previa![s.k])
        if (l.fish < previa.fish || bajaCrudo) marcas.add(l.fecha)
      }
      previa = l
    }
    return marcas
  }, [serie])

  const ultimoIdxValido = useMemo(() => {
    for (let i = serie.length - 1; i >= 0; i--) {
      const l = serie[i]
      if (l && muestraValida(l)) return i
    }
    return -1
  }, [serie])

  /** La única serie encendida (o null): condición para poder comparar máquinas. */
  const serieUnica = useMemo(() => {
    const on = seriesActivas.filter((s) => !apagadas.has(s.k as string))
    return on.length === 1 ? (on[0] ?? null) : null
  }, [seriesActivas, apagadas])

  /** El gráfico en una frase, para lectores de pantalla (nunca solo imagen). */
  const resumenGrafico = useMemo(() => {
    if (!ultimaValida) return 'Sin lecturas para esta máquina.'
    const partes = seriesActivas
      .filter((s) => !apagadas.has(s.k as string))
      .map((s) => `${s.label} en ${tasa1000(ultimaValida[s.k], ultimaValida.fish)} por mil`)
    const etiqueta = MAQUINAS.find((m) => m.id === maquina)?.label ?? maquina
    const extras = [
      huboReinicio.size > 0 ? `${huboReinicio.size} lectura${huboReinicio.size > 1 ? 's' : ''} con reinicio del protocolo` : '',
      incidencias.length > 0 ? `${incidencias.length} intervención${incidencias.length > 1 ? 'es' : ''} registrada${incidencias.length > 1 ? 's' : ''}` : '',
    ].filter(Boolean).join('; ')
    return `Tendencia de ${metrica} de ${etiqueta}. Última lectura ${fechaCorta(ultimaValida.fecha)}: ${partes.join(', ')}.${extras ? ` ${extras}.` : ''}`
  }, [ultimaValida, seriesActivas, apagadas, maquina, metrica, huboReinicio, incidencias])

  // Comparando, el eje es la UNIÓN de fechas de todas las máquinas: alinear
  // por posición mentiría cuando una máquina saltó una semana.
  const fechasEje = useMemo(() => {
    const activo = comparar && serieUnica !== null
    return activo
      ? [...new Set([
          ...serie.map((l) => l.fecha),
          ...MAQUINAS.flatMap((m) => (m.id === maquina ? [] : (filasPorMaquina[m.id] ?? []).map((l) => l.fecha))),
        ])].sort()
      : serie.map((l) => l.fecha)
  }, [comparar, serieUnica, serie, maquina, filasPorMaquina])

  /** P43: índices del eje con intervención registrada / reinicio del protocolo.
   *  Va por CLOSURE al plugin y al tooltip: react-chartjs-2 solo sincroniza
   *  labels y datasets — una clave extra en data muere en el primer update. */
  const marcasGrafico = useMemo(() => ({
    ints: fechasEje
      .map((f, i) => (incidencias.some((inc) => inc.creada === f || inc.lectura === f) ? i : -1))
      .filter((i) => i >= 0),
    reins: fechasEje
      .map((f, i) => (huboReinicio.has(f) ? i : -1))
      .filter((i) => i >= 0),
  }), [fechasEje, incidencias, huboReinicio])

  const chartData = useMemo(() => {
    const activo = comparar && serieUnica !== null

    const porFecha = (rows: LecturaProtocolo[]) => {
      const idx = new Map(rows.map((l) => [l.fecha, l]))
      return (k: keyof ContadoresProtocolo) =>
        fechasEje.map((f) => {
          const l = idx.get(f)
          return l && muestraValida(l) ? tasa1000(l[k], l.fish) : null
        })
    }
    const propio = porFecha(serie)
    const idxUltimo = activo
      ? fechasEje.lastIndexOf(ultimaValida?.fecha ?? '')
      : ultimoIdxValido

    const propios = seriesActivas.map((s) => ({
      label: s.label,
      // null (no 0) en las muestras insuficientes: con spanGaps:false la línea se
      // CORTA ahí. Unirla diría "de 31 subió a 88", y eso no se sabe — el panel
      // todavía no calculaba la tasa.
      data: propio(s.k),
      borderColor: s.color,
      backgroundColor: s.color,
      // el ÚLTIMO punto válido va enfatizado: es el estado actual, el que
      // decide (dataviz: emphasized endpoint)
      pointRadius: fechasEje.map((_, i) => (i === idxUltimo ? 4.5 : 2.5)),
      pointHoverRadius: 6,
      pointBorderWidth: 1.5,
      pointBorderColor: isDark ? '#16242f' : '#ffffff',
      spanGaps: false,
      tension: 0.25,
      borderWidth: s.grosor ?? 1.75,
      borderDash: s.trazo ?? [],
      // los chips mandan: serie apagada = dataset oculto (y el eje recalcula)
      hidden: apagadas.has(s.k as string),
      // clave del contador para que el tooltip encuentre su ficha en SABER
      clave: s.k as string,
    }))

    // Las otras máquinas, en gris punteado: contexto, no protagonistas.
    const fantasmas = activo && serieUnica
      ? MAQUINAS.filter((m) => m.id !== maquina).map((m) => ({
          label: m.label.replace('Baader 142 ', '').replace(' (antigua)', ''),
          data: porFecha(filasPorMaquina[m.id] ?? [])(serieUnica.k),
          borderColor: ejeColor,
          backgroundColor: ejeColor,
          pointRadius: 2,
          pointHoverRadius: 5,
          spanGaps: false,
          tension: 0.25,
          borderWidth: 1.25,
          borderDash: [3, 3],
          clave: serieUnica.k as string,
        }))
      : []

    return { labels: fechasEje.map(fechaCorta), datasets: [...propios, ...fantasmas] }
  }, [serie, seriesActivas, apagadas, isDark, ultimoIdxValido, comparar, serieUnica,
      filasPorMaquina, maquina, ultimaValida, ejeColor, fechasEje])

  /**
   * Bandas de umbral pintadas DETRÁS de la serie, con etiqueta al borde.
   * El umbral deja de ser un texto al pie: el que mira aprende qué es "alto"
   * porque el punto cae en una zona de color.
   */
  /**
   * Líneas de umbral punteadas con etiqueta al borde. Las bandas de fondo del
   * primer intento quedaron pesadas ("muy bruto" — Orel): una línea por umbral
   * enseña lo mismo con una fracción de la tinta.
   */
  const umbralPlugin = useMemo(() => {
    const u = UMBRALES[metrica]
    const tinta = isDark
      ? { critico: '#F0716A', intervenir: '#EE8A55', vigilar: '#E0AC4E' }
      : { critico: '#A8201A', intervenir: '#B4501C', vigilar: '#875105' }
    const lineas = [
      { v: u.critico, ink: tinta.critico, label: `crítico ${u.critico}` },
      { v: u.intervenir, ink: tinta.intervenir, label: `intervenir ${u.intervenir}` },
      { v: u.vigilar, ink: tinta.vigilar, label: `vigilar ${u.vigilar}` },
    ]
    const plugin: Plugin<'line'> = {
      id: 'lineasUmbral',
      beforeDraw(chart) {
        const { ctx, chartArea, scales } = chart
        const y = scales.y as { getPixelForValue: (v: number) => number; max: number } | undefined
        if (!chartArea || !y) return
        ctx.save()
        /* P43: intervenciones como línea vertical aqua tenue (acá se actuó) y
           reinicios como marca ⟳ en el borde superior. Los índices vienen en
           el data del chart para no cerrar sobre estado stale. */
        const x = scales.x as { getPixelForValue: (v: number) => number } | undefined
        if (x) {
          for (const i of marcasGrafico.ints) {
            const px = x.getPixelForValue(i)
            ctx.strokeStyle = isDark ? '#5aa6e8' : '#2E75B6'
            ctx.globalAlpha = 0.35
            ctx.setLineDash([2, 3])
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.moveTo(px, chartArea.top)
            ctx.lineTo(px, chartArea.bottom)
            ctx.stroke()
            ctx.setLineDash([])
          }
        }
        if (x) {
          for (const i of marcasGrafico.reins) {
            const px = x.getPixelForValue(i)
            ctx.globalAlpha = 0.9
            ctx.fillStyle = isDark ? '#E0AC4E' : '#875105'
            ctx.font = '10px ui-monospace, monospace'
            ctx.textAlign = 'center'
            ctx.fillText('⟳', px, chartArea.top + 9)
          }
        }
        ctx.globalAlpha = 1
        for (const l of lineas) {
          if (l.v > y.max) continue          // fuera de escala: no dibujar en el borde
          const py = y.getPixelForValue(l.v)
          if (py < chartArea.top + 6 || py > chartArea.bottom - 2) continue
          ctx.strokeStyle = l.ink
          ctx.globalAlpha = 0.55
          ctx.setLineDash([5, 4])
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(chartArea.left, py)
          ctx.lineTo(chartArea.right, py)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.globalAlpha = 0.9
          ctx.fillStyle = l.ink
          ctx.font = '700 9px system-ui'
          ctx.textAlign = 'right'
          ctx.fillText(l.label, chartArea.right - 2, py - 3)
        }
        ctx.restore()
      },
    }
    return plugin
  }, [metrica, isDark, marcasGrafico])

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
      // La animación explica continuidad, no impresiona — y bajo
      // prefers-reduced-motion no existe (norma dura §7).
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? (false as const)
        : { duration: 400, easing: 'easeOutCubic' as const },
      // nearest (no index): el tooltip didáctico es de UN contador; con 7 series
      // el modo index apila las fichas de todas y no se puede leer ninguna
      interaction: { mode: 'nearest' as const, intersect: false },
      plugins: {
        legend: { display: false },   // los chips son la leyenda
        tooltip: {
          // El negro por defecto de Chart.js era una isla fuera del tema: va con
          // los mismos colores resueltos que ya usa el eje.
          backgroundColor: isDark ? '#1b2530' : '#ffffff',
          titleColor: isDark ? '#eef3f7' : '#0d141a',
          bodyColor: isDark ? '#a9b8c4' : '#43535f',
          borderColor: isDark ? 'rgba(138,160,180,0.25)' : 'rgba(74,85,94,0.25)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
          titleFont: { size: 12, weight: 600 as const },
          bodyFont: { size: 11 },
          displayColors: false,
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
              const idx = items[0]?.dataIndex ?? -1
              const marcas: string[] = []
              if (marcasGrafico.reins.includes(idx)) marcas.push('⟳ protocolo reiniciado antes de esta lectura')
              if (marcasGrafico.ints.includes(idx)) marcas.push('| ese día se registró una intervención')
              const s = SABER[clave]
              if (!s) return marcas.length > 0 ? ['', ...marcas] : []
              return [
                ...(marcas.length > 0 ? ['', ...marcas] : []),
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
          ticks: { color: ejeColor, font: { size: 10 }, maxTicksLimit: 5 },
          grid: { color: gridColor },
        },
      },
    }),
    [ejeColor, gridColor, isDark, marcasGrafico],
  )

  return (
    <div className="p5-protocolo mt-4 space-y-4">
      {/* Selector de máquina: cada una lleva el punto de su veredicto — las tres
          plantas de un vistazo sin cambiar de máquina. Color + posición, y el
          detalle con texto al entrar (nunca solo color). */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs tracking-wide" style={{ color: LC.inkLo }}>
          Máquina
        </span>
        {MAQUINAS.map((m) => {
          const v = veredictos[m.id]
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={maquina === m.id}
              onClick={() => cambiarMaquina(m.id)}
              title={v ? `${m.label}: ${v.label}` : m.hint}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-3.5 text-sm"
              style={
                maquina === m.id
                  ? { background: LC.aqua, borderColor: LC.aqua, color: '#fff' }
                  : { background: LC.surface, borderColor: LC.border, color: LC.inkMid }
              }
            >
              {v ? (
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{ background: maquina === m.id ? '#fff' : v.color }}
                />
              ) : null}
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Todo verde también es información: sin esta línea, "no hay tarjeta"
          y "no hay datos" se ven igual. */}
      {!queRevisar && ultimaValida ? (
        <p className="flex items-center gap-1.5 text-footnote" style={{ color: LC.ok }}>
          <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
          Al día · última lectura {fechaCorta(ultimaValida.fecha)} · todo bajo umbral de intervención
        </p>
      ) : null}

        {/* Qué revisar ahora — solo cuando la última lectura cruzó «intervenir».
            Orden por urgencia: la acción va antes que el gráfico. */}
        {queRevisar ? (
          <div
            className="min-w-0 rounded-card border p-4"
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
              <div className="min-w-[12rem] flex-1">
                {/* P31: el titular es el DATO en lenguaje de planta; el nombre
                    del contador y la lectura bajan al subtítulo. */}
                <h2 className="text-base font-semibold leading-tight tabular-nums">
                  {queRevisar.metrica === 'paradas' ? 'Una parada' : 'Una corrección'} cada{' '}
                  {Math.max(1, Math.round(1000 / Math.max(queRevisar.tasa, 1)))} pescados
                </h2>
                <p className="text-caption" style={{ color: LC.inkMid }}>
                  {queRevisar.serie.label} · lectura del {queRevisar.lectura.fecha} ·{' '}
                  {queRevisar.lectura.fish} pescados
                </p>
              </div>
              <span
                className="rounded-ctl px-2.5 py-1 text-footnote font-semibold tabular-nums"
                style={{ background: LC.dangerSoft, color: queRevisar.nivel.color }}
              >
                {queRevisar.tasa}/1000 · {queRevisar.nivel.label}
              </span>
            </div>

            {/* P31: lo glanceable en UNA línea (delta + otras máquinas); la
                definición docente y las frases largas, plegadas en un details.
                Nada se pierde — se gana el paso 1 arriba del pliegue. */}
            {(queRevisar.tasaPrevia !== null || comparacion.length > 0) ? (
              <p className="mt-2 text-caption tabular-nums" style={{ color: LC.inkMid }}>
                {queRevisar.tasaPrevia !== null && queRevisar.tasa !== queRevisar.tasaPrevia ? (
                  <strong style={{ color: queRevisar.tasa <= queRevisar.tasaPrevia ? LC.ok : LC.crit }}>
                    {queRevisar.tasa <= queRevisar.tasaPrevia ? '▾' : '▴'}
                    {Math.abs(queRevisar.tasa - queRevisar.tasaPrevia)} vs anterior
                    {huboReinicio.has(queRevisar.lectura.fecha) ? (
                      <span style={{ color: LC.inkMid }}> (con reinicio del protocolo entre medio)</span>
                    ) : null}
                  </strong>
                ) : null}
                {comparacion.map((c, i) => (
                  <span key={c.maquina}>
                    {queRevisar.tasaPrevia !== null && queRevisar.tasa !== queRevisar.tasaPrevia
                      ? ' · '
                      : i > 0 ? ' · ' : ''}
                    {c.maquina}{' '}
                    <strong style={{ color: nivelTasa(c.tasa, queRevisar.metrica).color }}>{c.tasa}</strong>
                  </span>
                ))}
              </p>
            ) : null}
            <details className="mt-1.5">
              <summary
                className="inline-flex min-h-[28px] cursor-pointer items-center text-caption font-medium"
                style={{ color: LC.aqua }}
              >
                ¿qué mide este contador?
              </summary>
              <div
                className="mt-1 space-y-1.5 border-l-2 pl-2.5 text-footnote"
                style={{ borderColor: LC.border, color: LC.inkMid }}
              >
                <p>{queRevisar.saber?.que ?? ''}</p>
                {queRevisar.tasaPrevia !== null ? (
                  <p>
                    Venía de {queRevisar.tasaPrevia}/1000
                    {queRevisar.tasa <= queRevisar.tasaPrevia ? ' — mejorando.' : ' — empeorando.'}
                  </p>
                ) : null}
                {comparacion.length > 0 ? (
                  <p>
                    En el mismo contador,{' '}
                    {comparacion.map((c, i) => (
                      <span key={c.maquina}>
                        {i > 0 ? ' y ' : ''}
                        <strong style={{ color: LC.ink }}>{c.maquina}</strong> está en{' '}
                        <strong className="tabular-nums">{c.tasa}/1000</strong>
                      </span>
                    ))}
                    .
                  </p>
                ) : null}
                {!queRevisar.esMotor && queRevisar.motoresSanos ? (
                  <p>
                    Los 5 motores paso a paso están sanos: el problema es{' '}
                    <strong style={{ color: LC.ink }}>mecánico</strong>, no de control.
                  </p>
                ) : null}
              </div>
            </details>

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

            {/* P42: el lazo a la vista. Abierta → no duplicar; resuelta con la
                tasa abajo → la evidencia de que la intervención funcionó. */}
            {lazo?.abierta ? (
              <button
                type="button"
                onClick={() => navigate('/incidents')}
                className="mt-2 flex min-h-[44px] w-full items-center gap-2 rounded-ctl px-3 text-left text-caption"
                style={{ background: LC.prepSoft, color: LC.prep }}
              >
                <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0">
                  Ya hay una incidencia abierta por este contador
                  {' '}({fechaCorta(lazo.abierta.creada)}, {lazo.abierta.status.replace('_', ' ')}) — revisala antes de registrar otra.
                </span>
              </button>
            ) : null}
            {!lazo?.abierta && lazo?.resuelta ? (
              <p
                className="mt-2 flex items-start gap-2 rounded-ctl px-3 py-2 text-caption"
                style={{ background: LC.okSoft, color: LC.ok }}
              >
                <CheckCircle2 aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  La intervención del {fechaCorta(lazo.resuelta.creada)} funcionó: este contador
                  venía de <strong className="tabular-nums">{lazo.resuelta.tasa}/1000</strong> y hoy
                  está en <strong className="tabular-nums">{queRevisar.tasa}/1000</strong>.
                </span>
              </p>
            ) : null}

            {/* P34: UN primario ancho; el resto compacto. El caption se fue —
                que la incidencia sale precargada se descubre al tocarla. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={registrarIncidencia}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-ctl px-4 text-footnote font-semibold"
                style={{ background: LC.aqua, color: '#fff' }}
              >
                Registrar incidencia
              </button>
              <button
                type="button"
                onClick={() => setSearchParams({ vista: 'herramienta' })}
                className="inline-flex min-h-[44px] items-center rounded-ctl px-3 text-caption font-medium"
                style={{ background: LC.aquaSoft, color: LC.aqua }}
              >
                Diagnóstico
              </button>
              <button
                type="button"
                onClick={() => void copiarResumen()}
                aria-label={copiado ? 'Resumen copiado' : 'Copiar resumen'}
                aria-live="polite"
                className="grid min-h-[44px] min-w-[44px] place-items-center rounded-ctl"
                style={copiado
                  ? { background: LC.okSoft, color: LC.ok }
                  : { background: LC.aquaSoft, color: LC.aqua }}
              >
                {copiado ? <CheckCircle2 aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
              </button>
            </div>
          </div>
        ) : null}


        {/* Tendencia */}
        <div className="min-w-0 rounded-card border p-4" style={{ background: LC.surface, borderColor: LC.border }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              Tendencia
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
                  onClick={() => cambiarMetrica(m)}
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
          {/* Chips de serie con su valor: leyenda tocable. Smart default: solo
              lo que tiene algo que decir; los motores sanos, plegados en uno. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={c.on}
                onClick={c.toggle}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 text-caption font-semibold"
                style={c.on
                  ? { background: LC.surface, boxShadow: `inset 0 0 0 1.5px ${LC.borderHi}`, color: LC.ink }
                  : { background: LC.bgPanel, color: LC.inkMid }}
              >
                {c.color ? (
                  <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: c.on ? c.color : LC.inkGhost }} />
                ) : null}
                {c.label}
                {c.delta === 'sube' ? (
                  <TrendingUp aria-label="subiendo" className="h-3 w-3" style={{ color: LC.crit }} />
                ) : c.delta === 'baja' ? (
                  <TrendingDown aria-label="bajando" className="h-3 w-3" style={{ color: LC.ok }} />
                ) : null}
              </button>
            ))}
          </div>
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
            /* Skeleton, no spinner (constitución): la forma de lo que viene,
               en gris de panel, con el pulso apagado bajo reduced-motion */
            <div className="mt-3 h-64 w-full" aria-hidden>
              <div className="flex h-full flex-col justify-between">
                <div className="flex gap-1.5">
                  {[88, 76, 64].map((w) => (
                    <div key={w} className="h-8 animate-pulse rounded-full motion-reduce:animate-none"
                         style={{ width: w, background: LC.bgPanel }} />
                  ))}
                </div>
                <div className="h-40 animate-pulse rounded-ctl motion-reduce:animate-none"
                     style={{ background: LC.bgPanel }} />
                <div className="h-3 w-1/3 animate-pulse rounded-full motion-reduce:animate-none"
                     style={{ background: LC.bgPanel }} />
              </div>
            </div>
          ) : serie.length === 0 ? (
            /* Empty state con acción (constitución): qué es, qué hacer, a un toque */
            <div className="mt-4 flex flex-col items-start gap-3 py-4">
              <span className="grid h-10 w-10 place-items-center rounded-ctl"
                    style={{ background: LC.aquaSoft, color: LC.aqua }}>
                <Video aria-hidden className="h-5 w-5" />
              </span>
              <p className="max-w-md text-footnote" style={{ color: LC.inkMid }}>
                Esta máquina aún no tiene lecturas. La forma fácil: grabar el barrido de las
                13 pantallas y subirlo al tema de Telegram — el resto es automático. También
                se puede tipear a mano.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarForm(true)}
                  className="inline-flex min-h-[44px] items-center rounded-ctl px-4 text-footnote font-semibold"
                  style={{ background: LC.aqua, color: '#fff' }}
                >
                  Registrar lectura
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarInfo(true)}
                  className="inline-flex min-h-[44px] items-center rounded-ctl px-4 text-footnote font-medium"
                  style={{ background: LC.aquaSoft, color: LC.aqua }}
                >
                  ¿Cómo funciona?
                </button>
              </div>
            </div>
          ) : serie.filter((l) => muestraValida(l)).length < 2 ? (
            /* P32: con una sola lectura válida no hay curva que dibujar — el
               canvas mostraba puntos flotando en 400px. Estado honesto: la
               foto de hoy; el gráfico aparece solo cuando puede enseñar. */
            <div className="mt-3 rounded-ctl p-3 text-footnote" style={{ background: LC.bgPanel }}>
              <p>
                <strong>Primera lectura registrada.</strong>{' '}
                <span style={{ color: LC.inkMid }}>La curva aparece con la segunda — por ahora, la foto:</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-footnote font-bold tabular-nums">
                {ultimaValida
                  ? seriesActivas
                      .map((s) => ({ s, r: tasa1000(ultimaValida[s.k], ultimaValida.fish) }))
                      .sort((a, b) => b.r - a.r)
                      .slice(0, 3)
                      .map(({ s, r }) => (
                        <span
                          key={s.k as string}
                          style={{ color: nivelTasa(r, METRICA_DE[s.k as string] ?? 'correcciones').color }}
                        >
                          {CORTO[s.k as string] ?? s.label} {r}
                        </span>
                      ))
                  : null}
              </div>
            </div>
          ) : (
            <div className="relative mt-3 h-64 w-full min-w-0">
              <Line data={chartData} options={chartOptions} plugins={[umbralPlugin]} role="img" aria-label={resumenGrafico} />
            </div>
          )}
        </div>

      {/* Historial compacto: fecha · pescados · origen · veredicto. El detalle
          numérico vive en el gráfico y su tooltip, no en una tabla de 8 columnas. */}
      <div className="min-w-0 rounded-card border p-4" style={{ background: LC.surface, borderColor: LC.border }}>
        <h2 className="text-base font-semibold">Lecturas</h2>
        {cargando ? (
          <div className="mt-2 space-y-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-ctl motion-reduce:animate-none"
                   style={{ background: LC.bgPanel }} />
            ))}
          </div>
        ) : lecturas.length === 0 ? (
          <p className="mt-2 text-footnote" style={{ color: LC.inkLo }}>Ninguna todavía.</p>
        ) : (
          <div className="mt-1">
            {lecturas.map((l) => {
              const v = veredictoDe(l)
              const esVideo = Boolean((l as unknown as { origen?: { video?: string } }).origen?.video)
              const abierta = lecturaAbierta === l.id
              return (
                <div key={l.id} className="border-t first:border-t-0" style={{ borderColor: LC.border }}>
                  {/* la fila completa es tocable (≥44px): progressive disclosure */}
                  <button
                    type="button"
                    aria-expanded={abierta}
                    onClick={() => setLecturaAbierta(abierta ? null : (l.id ?? null))}
                    className="flex min-h-[44px] w-full items-center gap-3 text-left"
                  >
                    <span className="w-16 shrink-0 font-mono text-footnote tabular-nums">
                      {fechaCorta(l.fecha)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-footnote" style={{ color: LC.inkMid }}>
                      {l.fish} pz · {esVideo ? 'video' : 'manual'}
                      {huboReinicio.has(l.fecha) ? (
                        <span style={{ color: LC.prep }}> · reinicio</span>
                      ) : null}
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold tabular-nums"
                      style={{ background: v.soft, color: v.color }}
                    >
                      {v.label}
                      {v.dominante ? ` · ${v.dominante}` : ''}
                    </span>
                    {abierta
                      ? <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color: LC.inkGhost }} />
                      : <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0" style={{ color: LC.inkGhost }} />}
                  </button>
                  {abierta ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 pb-3 pl-2 sm:grid-cols-3">
                      {[...SERIES, ...SERIES_PARADAS].map((s) => {
                        const m = METRICA_DE[s.k as string] ?? 'correcciones'
                        const r = tasa1000(l[s.k], l.fish)
                        const n = nivelTasa(r, m)
                        const valida = muestraValida(l)
                        return (
                          <div key={s.k} className="flex items-baseline justify-between gap-2 text-caption">
                            <span style={{ color: LC.inkMid }}>{s.label}</span>
                            {valida ? (
                              <span className="font-mono font-semibold tabular-nums" style={{ color: n.color }}>
                                {r}
                              </span>
                            ) : (
                              <span style={{ color: LC.inkLo }}>—</span>
                            )}
                          </div>
                        )
                      })}
                      <p className="col-span-2 mt-1 text-caption sm:col-span-3" style={{ color: LC.inkGhost }}>
                        Tasas por 1.000 pescados · el color es el semáforo de cada contador
                      </p>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Confirmación visible aunque el form se pliegue al guardar */}
      {guardadoOk && !mostrarForm ? (
        <p className="flex items-center gap-1.5 text-footnote" style={{ color: LC.ok }}>
          <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
          Lectura guardada — ya está en la tendencia y en el historial.
        </p>
      ) : null}

      {/* Registrar es semanal, y casi siempre lo llena el video: va plegado.
          Lo diario (lector + tendencia) manda arriba. */}
      <button
        type="button"
        aria-expanded={mostrarForm}
        onClick={() => setMostrarForm((v) => !v)}
        className="flex w-full items-center gap-3 rounded-card border p-4 text-left"
        style={{ background: LC.surface, borderColor: LC.border }}
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-ctl"
          style={{ background: LC.aquaSoft, color: LC.aqua }}
        >
          <Save className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold" style={{ color: LC.ink }}>
            Registrar lectura
          </span>
          <span className="block text-caption" style={{ color: LC.inkMid }}>
            {borrador
              ? `Hay un video transcrito del ${borrador.fecha} esperando`
              : 'Los 17 contadores del panel, a mano'}
          </span>
        </span>
        {mostrarForm
          ? <ChevronDown aria-hidden className="h-4 w-4 shrink-0" style={{ color: LC.inkLo }} />
          : <ChevronRight aria-hidden className="h-4 w-4 shrink-0" style={{ color: LC.inkLo }} />}
      </button>
      {mostrarForm ? (
        <div className="min-w-0 rounded-card border p-4" style={{ background: LC.surface, borderColor: LC.border }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Nueva lectura</h2>
            <div className="flex gap-2">
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

      ) : null}

      <button
        type="button"
        aria-expanded={mostrarInfo}
        onClick={() => setMostrarInfo((v) => !v)}
        className="mx-auto flex min-h-[44px] items-center gap-1 text-footnote"
        style={{ color: LC.inkMid }}
      >
        ¿Cómo funciona el protocolo?
        {mostrarInfo
          ? <ChevronDown aria-hidden className="h-3.5 w-3.5" />
          : <ChevronRight aria-hidden className="h-3.5 w-3.5" />}
      </button>
      {mostrarInfo ? (
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
        <p className="mt-2 text-caption" style={{ color: LC.inkGhost }}>
          Umbrales por 1000 pescados — correcciones: 5 vigilar · 30 intervenir · 100 crítico;
          paradas: 3 · 10 · 30 (criterio interno de Mantención ANTARFOOD, provisorio hasta
          juntar 4 semanas de registro). Fuente técnica: manual 1420000804 §22.4 (Upgrade Kit)
          y runbook E8xx. Las lecturas son evidencia histórica: se crean y se leen, no se editan.
        </p>
      </div>

      ) : null}
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
