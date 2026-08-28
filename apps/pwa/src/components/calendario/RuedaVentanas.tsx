import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, CloudOff, Loader2, Maximize2, Minimize2, RotateCcw, Settings2, Undo2, Eraser } from 'lucide-react'
import { ListGroup, ListCell, Pill } from '@/components/piel'
import { FranjaVentanas } from './FranjaVentanas'
import { CompartirRueda } from './CompartirRueda'
import { ResumenPlanta } from './ResumenPlanta'
import { RuedaPlanta } from './RuedaPlanta'
import { CargaTrabajo } from './CargaTrabajo'
import { EditorMaquinas } from './EditorMaquinas'
import { CargaRapida } from './CargaRapida'
import { SugerirIntervencion } from './SugerirIntervencion'
import { apilar, desapilar, restaurar, type PasoHistorial } from '@/services/historialRueda'
import { CONFIG_CARGA_POR_DEFECTO, tareasIniciales, type ConfigCarga, type TareaMantencion } from '@/services/ruedaCarga'
import { getCurrentUser } from '@/services/auth'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import {
  CONDICION_DETALLE,
  CONDICION_LABEL,
  DIAS_CORTOS,
  DIAS_SEMANA,
  OCUPANTES,
  agruparTramos,
  capaOportunidad,
  SLOTS_POR_DIA,
  baseDia,
  bloquesIntervencion,
  cargarRueda,
  contarDia,
  contarSemana,
  diaVacio,
  estadoInicial,
  guardarRueda,
  sinConfirmar,
  pintarSlot,
  slotAHora,
  slotsAHorasDecimal,
  slotsAHorasMinutos,
  type Condicion,
  type DiaRueda,
  type Ocupante,
  type RuedaState,
} from '@/services/ruedaVentanas'

/* ─────────────────────────────────────────────────────────────────────────────
   Geometría de la rueda. Tres anillos concéntricos que se leen de dentro afuera:
   quién ocupa el tramo → dónde entra Mantención → en qué condición entra.
   ──────────────────────────────────────────────────────────────────────────── */
const CX = 200
const CY = 200
const R_PARADA_IN = 96
const R_PARADA_OUT = 101
const R_AREA_IN = 104
const R_AREA_OUT = 150
const R_MANT_IN = 154
const R_MANT_OUT = 164
const R_COND_IN = 167
const R_COND_OUT = 179
const R_TURNO_IN = 183
const R_TURNO_OUT = 188
const PASO = 360 / SLOTS_POR_DIA
/* El viewBox tiene que dar cabida al ANCHO de las etiquetas de hora, no solo a su
   posición: con margen 14 las de 06/12/18 salían cortadas por el borde. */
const VB_MARGEN = 26
const VB_LADO = 400 + VB_MARGEN * 2

function punto(r: number, grados: number): [number, number] {
  const a = ((grados - 90) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

/** Sector de anillo que cubre `largo` tramos desde `inicio`. */
function sector(inicio: number, largo: number, rIn: number, rOut: number): string {
  const a0 = inicio * PASO
  const a1 = (inicio + largo) * PASO
  const barrido = a1 - a0
  // Un arco SVG de exactamente 360° no dibuja nada: se parte en dos mitades.
  if (barrido >= 359.999) {
    return `${sector(inicio, largo / 2, rIn, rOut)} ${sector(inicio + largo / 2, largo / 2, rIn, rOut)}`
  }
  const grande = barrido > 180 ? 1 : 0
  const [x1, y1] = punto(rOut, a0)
  const [x2, y2] = punto(rOut, a1)
  const [x3, y3] = punto(rIn, a1)
  const [x4, y4] = punto(rIn, a0)
  return (
    `M${x1.toFixed(2)},${y1.toFixed(2)}` +
    `A${rOut},${rOut} 0 ${grande} 1 ${x2.toFixed(2)},${y2.toFixed(2)}` +
    `L${x3.toFixed(2)},${y3.toFixed(2)}` +
    `A${rIn},${rIn} 0 ${grande} 0 ${x4.toFixed(2)},${y4.toFixed(2)}Z`
  )
}

/* Color: siempre por token del sistema, nunca hex. Las clases van literales
   porque Tailwind purga lo que no encuentra escrito (misma razón que en Tag). */
const FILL_OCUPANTE: Record<Ocupante, string> = {
  P: 'fill-cat-1-tint',
  H: 'fill-cat-7-tint',
  // Higiene-en-colación se pinta como higiene: para Mantención el efecto es el
  // mismo (agua encima). Que además sea colación lo dice el aro interior.
  X: 'fill-cat-7-tint',
  C: 'fill-cat-3-tint',
  '0': 'fill-muted-foreground',
}
const OPACIDAD_OCUPANTE: Record<Ocupante, number> = { P: 0.5, H: 0.62, X: 0.62, C: 0.45, '0': 0.14 }

const FILL_CONDICION: Record<Condicion, string> = {
  limpia: 'fill-cat-4-tint',
  colacion: 'fill-cat-4-tint',
  marcha: 'fill-cat-4-tint',
  agua: 'fill-destructive',
}
/** La condición se dice por saturación: mientras más libre, más presente el ámbar. */
const OPACIDAD_CONDICION: Record<Condicion, number> = { limpia: 1, colacion: 0.55, marcha: 0.25, agua: 1 }

type Brocha = { capa: 'areas'; valor: Ocupante } | { capa: 'mant'; valor: '1' | '0' }

const BROCHAS_AREA: Array<{ valor: Ocupante; label: string }> = [
  { valor: 'P', label: 'Proceso' },
  { valor: 'H', label: 'Higiene' },
  { valor: 'X', label: 'Higiene en colación' },
  { valor: 'C', label: 'Colación sola' },
  { valor: '0', label: 'Liberar' },
]

const ORDEN_CONDICION: Condicion[] = ['limpia', 'colacion', 'marcha', 'agua']

type EstadoSync = 'cargando' | 'guardado' | 'guardando' | 'error' | 'local'

export function RuedaVentanas() {
  const [state, setState] = useState<RuedaState>(() => estadoInicial())
  const [maquinaId, setMaquinaId] = useState<string>(() => estadoInicial().maquinas[0]?.id ?? '')
  const [diaIdx, setDiaIdx] = useState<number>(() => (new Date().getDay() + 6) % 7)
  const [brocha, setBrocha] = useState<Brocha>({ capa: 'mant', valor: '1' })
  /* Editar en la rueda, mostrar en la franja: son dos trabajos distintos y cada
     forma es buena en uno solo. Ver el comentario de FranjaVentanas. */
  const [modo, setModo] = useState<'editar' | 'comparar' | 'carga'>('editar')
  const [editandoMaquinas, setEditandoMaquinas] = useState(false)
  const [ampliada, setAmpliada] = useState(false)
  const [sync, setSync] = useState<EstadoSync>('cargando')
  const [errorTexto, setErrorTexto] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => new Date())

  const svgRef = useRef<SVGSVGElement | null>(null)
  const pintandoRef = useRef(false)
  const historialRef = useRef<PasoHistorial[]>([])
  const [puedeDeshacer, setPuedeDeshacer] = useState(false)
  const snapshotTomadoRef = useRef(false)
  const ultimoGuardadoRef = useRef<string>('')
  /* Payload cuyo guardado falló. Sin esto, el efecto vuelve a intentar el mismo
     payload en cuanto `sync` pasa a 'error', y un fallo permanente (por ejemplo
     sin permisos) se convierte en un bucle de escrituras contra Firestore. */
  const falloRef = useRef<string | null>(null)
  const guardarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Carga inicial ──────────────────────────────────────────────────────── */
  useEffect(() => {
    let vivo = true
    cargarRueda()
      .then((remoto) => {
        if (!vivo) return
        if (!remoto) {
          // Sin documento remoto: la base queda solo en pantalla. El documento
          // se crea cuando alguien edita, no por el hecho de abrir la pestaña.
          ultimoGuardadoRef.current = JSON.stringify(estadoInicial().maquinas)
        }
        if (remoto) {
          setState(remoto)
          setMaquinaId((actual) => (remoto.maquinas.some((m) => m.id === actual) ? actual : (remoto.maquinas[0]?.id ?? actual)))
          ultimoGuardadoRef.current = JSON.stringify(remoto.maquinas)
        }
        setSync('guardado')
      })
      .catch((e) => {
        if (!vivo) return
        logger.error('Rueda: no se pudo cargar', e instanceof Error ? e : new Error(String(e)))
        // Si no se pudo leer, tampoco hay que intentar escribir: sin esto el
        // autosave veía «cambios» (la base contra un ref vacío) y mandaba una
        // escritura que nadie pidió, condenada al mismo permission-denied.
        ultimoGuardadoRef.current = JSON.stringify(estadoInicial().maquinas)
        setSync('local')
      })
    return () => {
      vivo = false
    }
  }, [])

  /* ── La aguja de «ahora» ────────────────────────────────────────────────── */
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const maquina = useMemo(
    () => state.maquinas.find((m) => m.id === maquinaId) ?? state.maquinas[0],
    [state.maquinas, maquinaId],
  )
  const dia = maquina?.semana[diaIdx] ?? diaVacio()
  const resumen = useMemo(() => contarDia(dia), [dia])
  const semana = useMemo(() => (maquina ? contarSemana(maquina) : null), [maquina])
  const bloques = useMemo(
    () => bloquesIntervencion(dia).sort((a, b) => b.largo - a.largo),
    [dia],
  )

  /* ── Guardado con rebote. Compara el payload SERIALIZADO, no la identidad del
        objeto: con deps de identidad, cada render dispara una escritura. ───── */
  useEffect(() => {
    if (sync === 'cargando') return
    const serializado = JSON.stringify(state.maquinas)
    if (serializado === ultimoGuardadoRef.current) return
    if (serializado === falloRef.current) return // ya falló tal cual; espera un cambio

    setSync('guardando')
    if (guardarTimerRef.current) clearTimeout(guardarTimerRef.current)
    guardarTimerRef.current = setTimeout(() => {
      const uid = getCurrentUser()?.uid ?? null
      guardarRueda(state, uid)
        .then(() => {
          ultimoGuardadoRef.current = serializado
          falloRef.current = null
          setErrorTexto(null)
          setSync('guardado')
        })
        .catch((e) => {
          logger.error('Rueda: no se pudo guardar', e instanceof Error ? e : new Error(String(e)))
          falloRef.current = serializado
          setErrorTexto(e instanceof Error ? e.message : 'Error desconocido')
          setSync('error')
        })
    }, 900)

    return () => {
      if (guardarTimerRef.current) clearTimeout(guardarTimerRef.current)
    }
  }, [state, sync])

  /* ── Edición ────────────────────────────────────────────────────────────── */
  const aplicarADia = useCallback(
    (fn: (d: DiaRueda) => DiaRueda) => {
      setState((prev) => ({
        ...prev,
        maquinas: prev.maquinas.map((m) =>
          m.id !== maquinaId ? m : { ...m, semana: m.semana.map((d, i) => (i === diaIdx ? fn(d) : d)) },
        ),
      }))
    },
    [maquinaId, diaIdx],
  )

  /*
   * Se guarda la MÁQUINA COMPLETA, no el día que se está mirando: «copiar el día
   * a Lun-Vie» toca cuatro días y «copiar la semana de otra máquina» reemplaza
   * los siete. Guardando un día, deshacer restauraba ese y dejaba el resto
   * pisado — trabajo perdido en silencio, con el botón diciendo que ya lo hizo.
   */
  const tomarSnapshot = useCallback(() => {
    if (snapshotTomadoRef.current || !maquina) return
    historialRef.current = apilar(historialRef.current, maquina, diaIdx)
    snapshotTomadoRef.current = true
    setPuedeDeshacer(true)
  }, [maquina, diaIdx])

  /** Tramo bajo el puntero, desde el ángulo — sin 288 elementos que testear. */
  const slotDesdePunto = useCallback((clientX: number, clientY: number): number | null => {
    const svg = svgRef.current
    if (!svg) return null
    const r = svg.getBoundingClientRect()
    if (!r.width || !r.height) return null
    // El viewBox es cuadrado y el SVG mantiene proporción: basta una escala.
    const x = ((clientX - r.left) / r.width) * VB_LADO - VB_MARGEN
    const y = ((clientY - r.top) / r.height) * VB_LADO - VB_MARGEN
    const dx = x - CX
    const dy = y - CY
    const radio = Math.hypot(dx, dy)
    if (radio < R_AREA_IN || radio > R_COND_OUT) return null  // el aro de 'línea parada' no se pinta: es lectura
    const grados = (Math.atan2(dy, dx) * 180) / Math.PI + 90
    const norm = ((grados % 360) + 360) % 360
    const slot = Math.floor(norm / PASO)
    return slot >= 0 && slot < SLOTS_POR_DIA ? slot : null
  }, [])

  const pintarEn = useCallback(
    (clientX: number, clientY: number) => {
      const slot = slotDesdePunto(clientX, clientY)
      if (slot === null) return
      const actual = brocha.capa === 'areas' ? dia.areas[slot] : dia.mant[slot]
      if (actual === brocha.valor) return
      tomarSnapshot()
      aplicarADia((d) => ({ ...d, [brocha.capa]: pintarSlot(d[brocha.capa], slot, brocha.valor) }))
    },
    [slotDesdePunto, brocha, dia, tomarSnapshot, aplicarADia],
  )

  useEffect(() => {
    const mover = (e: PointerEvent) => {
      if (pintandoRef.current) pintarEn(e.clientX, e.clientY)
    }
    const soltar = () => {
      pintandoRef.current = false
      snapshotTomadoRef.current = false
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar)
    }
  }, [pintarEn])

  const marcarRevisada = useCallback((maquinaId: string, valor: boolean) => {
    setState((prev) => ({
      ...prev,
      maquinas: prev.maquinas.map((m) =>
        m.id === maquinaId ? { ...m, revisadoEnTerreno: valor } : m,
      ),
    }))
  }, [])

  const deshacer = useCallback(() => {
    const { historial, paso } = desapilar(historialRef.current)
    historialRef.current = historial
    setPuedeDeshacer(historial.length > 0)
    if (!paso) return
    // Se vuelve a donde estaba el foco al hacer el cambio: deshacer sin mostrar
    // QUÉ se deshizo deja a la persona sin saber si funcionó.
    setMaquinaId(paso.maquina.id)
    setDiaIdx(paso.dia)
    setState((prev) => ({ ...prev, maquinas: restaurar(prev.maquinas, paso) }))
  }, [])

  /* ── Dibujo ─────────────────────────────────────────────────────────────── */
  const gruposArea = useMemo(() => agruparTramos(dia.areas), [dia.areas])
  const gruposMant = useMemo(() => agruparTramos(dia.mant), [dia.mant])
  /* Dónde se PUEDE entrar y no hay nada puesto. Va en el mismo anillo que el
     plan pero como filo fino: si se pintara con el mismo peso, «lo que voy a
     hacer» y «lo que podría hacer» se leerían igual, que es justo lo que hay
     que distinguir. */
  const gruposOportunidad = useMemo(
    () => agruparTramos(capaOportunidad(dia)).filter((g) => g.valor === '1'),
    [dia],
  )

  const gruposCondicion = useMemo(() => {
    // La condición solo se dibuja donde Mantención entra: el anillo exterior
    // responde «cómo entro», no «cómo entraría si entrara».
    const capa = Array.from({ length: SLOTS_POR_DIA }, (_, i) =>
      dia.mant[i] === '1' ? dia.areas[i] : ' ',
    ).join('')
    return agruparTramos(capa)
  }, [dia.areas, dia.mant])

  const esHoy = (new Date().getDay() + 6) % 7 === diaIdx
  const anguloAhora = ((ahora.getHours() * 60 + ahora.getMinutes()) * 360) / 1440

  if (!maquina) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-card bg-card p-5">
        <p className="text-headline text-foreground">No hay máquinas en el plan</p>
        <p className="max-w-[46ch] text-footnote text-muted-foreground">
          Agrega al menos una para poder pintar su día y calcular las ventanas.
        </p>
        <EditorMaquinas
          maquinas={state.maquinas}
          tareas={state.tareas ?? []}
          // El autosave se dispara solo al cambiar `state`; no hay que avisarle.
          /* Sin snapshot a propósito: agregar y renombrar no destruyen nada, y
             eliminar ya pasa por su propia confirmación. El historial tampoco
             resucita una máquina borrada — deshacer un borrado deliberado es
             peor que no poder deshacerlo. */
          onCambiar={(maquinas) => setState((p) => ({ ...p, maquinas }))}
          onCerrar={() => setEditandoMaquinas(false)}
        />
      </div>
    )
  }

  const condicionDeChar = (c: string): Condicion =>
    c === 'H' ? 'agua' : c === 'C' ? 'colacion' : c === 'P' ? 'marcha' : 'limpia'

  return (
    <div className="flex flex-col gap-6">
      {/* ── Modo ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-1" role="tablist" aria-label="Modo de la vista">
        {([
          ['editar', 'Pintar el día'],
          ['comparar', 'Dónde hay tiempo'],
          ['carga', '¿Alcanza el tiempo?'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={modo === id}
            onClick={() => {
              setModo(id)
              if (id !== 'editar') setEditandoMaquinas(false)
            }}
            className={cn(
              'min-h-[44px] rounded-ctl px-3.5 text-footnote font-semibold transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none',
              modo === id ? 'bg-card text-foreground ring-1 ring-inset ring-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {sinConfirmar(state.maquinas).length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 px-1 text-footnote text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-cat-4-ink" />
          <span>
            {state.maquinas.length - sinConfirmar(state.maquinas).length} de {state.maquinas.length}{' '}
            máquinas con el horario confirmado en terreno.
          </span>
          <span className="text-caption">
            Sin confirmar: {sinConfirmar(state.maquinas).map((m) => m.nombre).join(', ')}
          </span>
        </p>
      )}

      {/* ── Selectores ─────────────────────────────────────────────────────── */}
      <div className={cn('flex flex-wrap items-end gap-4', modo === 'carga' && 'hidden')}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rueda-maquina" className="text-caption text-muted-foreground">
            Máquina
          </label>
          <select
            id="rueda-maquina"
            value={maquinaId}
            onChange={(e) => setMaquinaId(e.target.value)}
            className="h-11 min-w-[13rem] rounded-ctl border border-border bg-card px-3 text-body text-foreground"
          >
            {state.maquinas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setEditandoMaquinas((v) => !v)}
          aria-pressed={editandoMaquinas}
          className={cn(
            'flex min-h-[44px] items-center gap-2 rounded-ctl border border-border px-3 text-footnote font-medium',
            'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none',
            editandoMaquinas ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Settings2 className="h-4 w-4" />
          Máquinas y áreas
        </button>

        <div className="flex flex-col gap-1.5">
          <span className="text-caption text-muted-foreground">Día</span>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Día de la semana">
            {DIAS_CORTOS.map((d, i) => (
              <button
                key={d}
                role="tab"
                aria-selected={i === diaIdx}
                onClick={() => setDiaIdx(i)}
                className={cn(
                  'h-11 min-w-[3rem] rounded-ctl px-3 text-footnote font-semibold transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none',
                  i === diaIdx
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3 pb-1">
          <EstadoGuardado estado={sync} detalle={errorTexto} />
          <CompartirRueda maquinas={state.maquinas} />
        </div>
      </div>

      {editandoMaquinas && modo === 'editar' && (
        <EditorMaquinas
          maquinas={state.maquinas}
          tareas={state.tareas ?? []}
          // El autosave se dispara solo al cambiar `state`; no hay que avisarle.
          onCambiar={(maquinas) => setState((p) => ({ ...p, maquinas }))}
          onCerrar={() => setEditandoMaquinas(false)}
        />
      )}

      <div className={cn('grid grid-cols-1 gap-6',
        !ampliada && 'lg:grid-cols-[minmax(0,1fr)_20rem]', modo === 'comparar' && 'hidden')}>
        {/* ── Rueda ────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {/* La rueda es cuadrada, así que acotar el ANCHO por la altura de la ventana
              acota las dos medidas. Sin esto solo se limitaba por ancho: en una
              pantalla baja —o con el zoom del navegador subido, que deja el
              viewport igual de bajo— llenaba el 93% del alto y tapaba todo lo
              demás, obligando a scrollear para leer cualquier cifra. */}
          <div className="flex justify-end">
            <button
              onClick={() => setAmpliada((v) => !v)}
              aria-pressed={ampliada}
              className="flex min-h-[44px] items-center gap-1.5 rounded-ctl px-2.5 text-footnote font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {ampliada ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              {ampliada ? 'Reducir' : 'Ampliar'}
            </button>
          </div>

          {/* Ampliada usa el ancho completo y hasta el 85% del alto; el panel baja
              debajo. Los tramos son de 5 min: a tamaño normal, uno mide menos de
              un milímetro de arco, y pintar fino ahí es imposible. */}
          <div className={cn('mx-auto w-full', ampliada ? 'max-w-[min(60rem,85vh)]' : 'max-w-[min(30rem,60vh)]')}>
            <svg
              ref={svgRef}
              viewBox={`${-VB_MARGEN} ${-VB_MARGEN} ${VB_LADO} ${VB_LADO}`}
              className="w-full touch-none select-none"
              role="application"
              aria-label={`Rueda de 24 horas de ${maquina.nombre}, ${DIAS_SEMANA[diaIdx]}, tramos de 5 minutos`}
              onPointerDown={(e) => {
                pintandoRef.current = true
                snapshotTomadoRef.current = false
                pintarEn(e.clientX, e.clientY)
                e.preventDefault()
              }}
            >
              {/* Arcos de turno: tres bloques de 8 h */}
              {[0, 96, 192].map((inicio) => (
                <path
                  key={inicio}
                  d={sector(inicio, 95.2, R_TURNO_IN, R_TURNO_OUT)}
                  className="fill-muted-foreground"
                  fillOpacity={0.4}
                />
              ))}

              {/* Anillo 1 · quién ocupa */}
              {gruposArea.map((g) => {
                const oc = (OCUPANTES as string[]).includes(g.valor) ? (g.valor as Ocupante) : '0'
                return (
                  <path
                    key={`a${g.inicio}`}
                    d={sector(g.inicio, g.largo, R_AREA_IN, R_AREA_OUT)}
                    className={FILL_OCUPANTE[oc]}
                    fillOpacity={OPACIDAD_OCUPANTE[oc]}
                  />
                )
              })}

              {/* Aro interior · la línea parada, esté o no higiene encima. Es la
                  ventana en disputa, y por eso se marca aunque el anillo de
                  arriba ya la pinte de higiene. */}
              {gruposArea
                .filter((g) => g.valor === 'C' || g.valor === 'X')
                .map((g) => (
                  <path
                    key={`p${g.inicio}`}
                    d={sector(g.inicio, g.largo, R_PARADA_IN, R_PARADA_OUT)}
                    className="fill-cat-3-tint"
                    fillOpacity={0.8}
                  />
                ))}

              {/* Anillo 2 · dónde entra Mantención (rojo donde choca con higiene) */}
              {gruposMant
                .filter((g) => g.valor === '1')
                .map((g) => (
                  <path
                    key={`m${g.inicio}`}
                    d={sector(g.inicio, g.largo, R_MANT_IN, R_MANT_OUT)}
                    className="fill-cat-4-tint"
                  />
                ))}
              {gruposCondicion
                .filter((g) => g.valor === 'H' || g.valor === 'X')
                .map((g) => (
                  <path
                    key={`x${g.inicio}`}
                    d={sector(g.inicio, g.largo, R_MANT_IN, R_MANT_OUT)}
                    className="fill-destructive"
                  />
                ))}

              {/* Anillo 3a · dónde se PUEDE entrar y no hay nada planificado */}
              {gruposOportunidad.map((g) => (
                <path
                  key={`o${g.inicio}`}
                  d={sector(g.inicio, g.largo, R_COND_OUT - 3.5, R_COND_OUT)}
                  className="fill-cat-4-tint"
                  fillOpacity={0.5}
                  pointerEvents="none"
                />
              ))}

              {/* Anillo 3b · en qué condición se entra, donde SÍ hay plan */}
              {gruposCondicion
                .filter((g) => g.valor !== ' ')
                .map((g) => {
                  const cond = condicionDeChar(g.valor)
                  return (
                    <path
                      key={`c${g.inicio}`}
                      d={sector(g.inicio, g.largo, R_COND_IN, R_COND_OUT)}
                      className={FILL_CONDICION[cond]}
                      fillOpacity={OPACIDAD_CONDICION[cond]}
                    />
                  )
                })}

              {/* Marcas y horas */}
              {Array.from({ length: 24 }, (_, h) => {
                const grados = h * 15
                const mayor = h % 6 === 0
                const [x1, y1] = punto(R_TURNO_OUT + 1, grados)
                const [x2, y2] = punto(R_TURNO_OUT + (mayor ? 9 : 5), grados)
                const [lx, ly] = punto(R_TURNO_OUT + 22, grados)
                return (
                  <g key={h}>
                    <line
                      x1={x1} y1={y1} x2={x2} y2={y2}
                      className="stroke-muted-foreground"
                      strokeWidth={mayor ? 1.5 : 0.8}
                      strokeOpacity={mayor ? 0.9 : 0.45}
                    />
                    <text
                      x={lx} y={ly}
                      textAnchor="middle" dominantBaseline="central"
                      className={cn('font-mono tabular-nums', mayor ? 'fill-foreground' : 'fill-muted-foreground')}
                      fontSize={mayor ? 13 : 11}
                      fontWeight={mayor ? 600 : 400}
                    >
                      {String(h).padStart(2, '0')}
                    </text>
                  </g>
                )
              })}

              {/* Aguja de ahora, solo si el día que miras es hoy */}
              {esHoy && (
                <g>
                  <line
                    x1={punto(R_AREA_IN - 8, anguloAhora)[0]}
                    y1={punto(R_AREA_IN - 8, anguloAhora)[1]}
                    x2={punto(R_COND_OUT + 4, anguloAhora)[0]}
                    y2={punto(R_COND_OUT + 4, anguloAhora)[1]}
                    className="stroke-foreground"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                  <circle
                    cx={punto(R_COND_OUT + 4, anguloAhora)[0]}
                    cy={punto(R_COND_OUT + 4, anguloAhora)[1]}
                    r={3.4}
                    className="fill-foreground"
                  />
                </g>
              )}

              {/* Centro: la cifra que la rueda existe para dar */}
              <text
                x={CX} y={CY - 26} textAnchor="middle" dominantBaseline="central"
                className="fill-muted-foreground" fontSize={12}
              >
                {DIAS_SEMANA[diaIdx]}
              </text>
              <text
                x={CX} y={CY + 4} textAnchor="middle" dominantBaseline="central"
                className="fill-foreground font-mono tabular-nums"
                fontSize={44} fontWeight={700} letterSpacing="-0.03em"
              >
                {slotsAHorasDecimal(resumen.libres)}
              </text>
              <text
                x={CX} y={CY + 32} textAnchor="middle" dominantBaseline="central"
                className="fill-muted-foreground" fontSize={12}
              >
                horas sin nadie encima
              </text>
              {resumen.condicion.agua > 0 && (
                <text
                  x={CX} y={CY + 56} textAnchor="middle" dominantBaseline="central"
                  className="fill-destructive font-mono tabular-nums"
                  fontSize={13} fontWeight={600}
                >
                  {slotsAHorasDecimal(resumen.condicion.agua)} h con agua
                </text>
              )}
            </svg>
          </div>

          <Leyenda />
        </div>

        {/* ── Panel ────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6">
          <ListGroup title="Pintar" footer="Arrastra sobre la rueda. La capa de Mantención se pinta encima sin borrar la de abajo, para que el choque quede registrado.">
            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-2">
                <span className="text-caption text-muted-foreground">Quién ocupa el tramo</span>
                <div className="grid grid-cols-2 gap-2">
                  {BROCHAS_AREA.map((b) => (
                    <BotonBrocha
                      key={b.valor}
                      activo={brocha.capa === 'areas' && brocha.valor === b.valor}
                      onClick={() => setBrocha({ capa: 'areas', valor: b.valor })}
                      swatch={
                        <span
                          className={cn(
                            'h-3.5 w-3.5 shrink-0 rounded-[4px]',
                            b.valor === 'P' && 'bg-cat-1-tint',
                            b.valor === 'H' && 'bg-cat-7-tint',
                            b.valor === 'X' && 'bg-cat-7-tint ring-2 ring-inset ring-cat-3-tint',
                            b.valor === 'C' && 'bg-cat-3-tint',
                            b.valor === '0' && 'bg-muted-foreground/20',
                          )}
                        />
                      }
                      label={b.label}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-caption text-muted-foreground">Dónde entra Mantención</span>
                <div className="grid grid-cols-2 gap-2">
                  <BotonBrocha
                    activo={brocha.capa === 'mant' && brocha.valor === '1'}
                    onClick={() => setBrocha({ capa: 'mant', valor: '1' })}
                    swatch={<span className="h-3.5 w-3.5 shrink-0 rounded-full border-[3px] border-cat-4-tint" />}
                    label="Intervenir"
                  />
                  <BotonBrocha
                    activo={brocha.capa === 'mant' && brocha.valor === '0'}
                    onClick={() => setBrocha({ capa: 'mant', valor: '0' })}
                    swatch={<span className="h-3.5 w-3.5 shrink-0 rounded-full border border-dashed border-muted-foreground" />}
                    label="Quitar"
                  />
                </div>
              </div>
            </div>
          </ListGroup>

          <SugerirIntervencion
            maquina={maquina}
            onAplicar={(m) => {
              tomarSnapshot()
              snapshotTomadoRef.current = false
              setState((p) => ({ ...p, maquinas: p.maquinas.map((x) => (x.id === m.id ? m : x)) }))
            }}
          />

          <CargaRapida
            maquina={maquina}
            maquinas={state.maquinas}
            diaIdx={diaIdx}
            onCambiarMaquina={(m) => {
              tomarSnapshot()
              snapshotTomadoRef.current = false
              setState((p) => ({ ...p, maquinas: p.maquinas.map((x) => (x.id === m.id ? m : x)) }))
            }}
          />

          <ListGroup
        title="En qué condición entramos"
        footer={
          resumen.disponibleSinPlan > 0
            ? `Además quedan ${slotsAHorasMinutos(resumen.disponibleSinPlan)} en que se podría entrar y no hay nada puesto.`
            : undefined
        }
      >
            {resumen.intervencion === 0 ? (
              <div className="px-4 py-5 text-footnote text-muted-foreground">
                Todavía no hay intervenciones pintadas en este día.
              </div>
            ) : (
              ORDEN_CONDICION.map((c) => (
                <ListCell
                  key={c}
                  leading={<PuntoCondicion condicion={c} />}
                  title={CONDICION_LABEL[c]}
                  subtitle={CONDICION_DETALLE[c]}
                  value={
                    <span className={cn(c === 'agua' && resumen.condicion[c] > 0 && 'text-destructive')}>
                      {slotsAHorasMinutos(resumen.condicion[c])}
                    </span>
                  }
                  className={resumen.condicion[c] === 0 ? 'opacity-60' : undefined}
                />
              ))
            )}
          </ListGroup>

          <ListGroup
            title="Quién ocupa el día"
            footer="La línea parada es la única ventana sin producción: por eso Higiene y Mantención se la disputan."
          >
            <ListCell title="Sin nadie" subtitle="Ventana disponible" value={slotsAHorasMinutos(resumen.ocupacion['0'])} />
            <ListCell title="Proceso" subtitle="Línea corriendo" value={slotsAHorasMinutos(resumen.ocupacion.P)} />
            <ListCell
              title="Higiene"
              subtitle="Lavando, con la línea ya detenida"
              value={slotsAHorasMinutos(resumen.ocupacion.H)}
            />
            <ListCell
              title="Línea parada"
              subtitle="Colación de producción"
              value={slotsAHorasMinutos(resumen.ocupacion.C + resumen.ocupacion.X)}
            />
            <ListCell
              variant="child"
              title="La toma higiene"
              value={
                <span className={resumen.ocupacion.X > 0 ? 'text-destructive' : undefined}>
                  {slotsAHorasMinutos(resumen.ocupacion.X)}
                </span>
              }
              trailing={resumen.ocupacion.X > 0 ? <Pill tone="critical">En disputa</Pill> : undefined}
            />
            <ListCell
              variant="child"
              title="Queda para Mantención"
              value={slotsAHorasMinutos(resumen.ocupacion.C)}
            />
          </ListGroup>

          {bloques.length > 0 && (
            <ListGroup title="Bloques de intervención">
              {bloques.map((b) => (
                <ListCell
                  key={b.inicio}
                  title={
                    <span className="font-mono tabular-nums">
                      {slotAHora(b.inicio)} — {slotAHora(b.inicio + b.largo)}
                    </span>
                  }
                  subtitle={b.conAgua > 0 ? `${slotsAHorasMinutos(b.conAgua)} con agua encima` : undefined}
                  value={slotsAHorasMinutos(b.largo)}
                  trailing={b.conAgua > 0 ? <Pill tone="critical">Choque</Pill> : undefined}
                />
              ))}
            </ListGroup>
          )}

          <div className="flex flex-wrap gap-2">
            <BotonAccion onClick={deshacer} disabled={!puedeDeshacer} icon={<Undo2 className="h-4 w-4" />}>
              Deshacer
            </BotonAccion>
            <BotonAccion
              onClick={() => {
                tomarSnapshot()
                snapshotTomadoRef.current = false
                aplicarADia(() => baseDia('simple', diaIdx))
              }}
              icon={<RotateCcw className="h-4 w-4" />}
            >
              Volver a la base
            </BotonAccion>
            <BotonAccion
              onClick={() => {
                tomarSnapshot()
                snapshotTomadoRef.current = false
                aplicarADia(() => diaVacio())
              }}
              icon={<Eraser className="h-4 w-4" />}
            >
              Vaciar día
            </BotonAccion>
          </div>
        </div>
      </div>

      {modo === 'comparar' && (
        <>
          <RuedaPlanta
            maquinas={state.maquinas}
            diaIdx={diaIdx}
            maquinaActivaId={maquinaId}
            onSeleccionar={setMaquinaId}
          />
          <ResumenPlanta maquinas={state.maquinas} diaIdx={diaIdx} onVerMaquina={setMaquinaId} />
          <FranjaVentanas maquinas={state.maquinas} diaIdx={diaIdx} maquinaActivaId={maquinaId} />
        </>
      )}

      {modo === 'carga' && (
        <CargaTrabajo
          maquinas={state.maquinas}
          tareas={state.tareas ?? tareasIniciales()}
          config={state.configCarga ?? CONFIG_CARGA_POR_DEFECTO}
          anclajes={state.anclajes ?? []}
          onCambiarTareas={(tareas: TareaMantencion[]) => setState((p) => ({ ...p, tareas }))}
          onCambiarConfig={(configCarga: ConfigCarga) => setState((p) => ({ ...p, configCarga }))}
          onCambiarAnclajes={(anclajes) => setState((p) => ({ ...p, anclajes }))}
        />
      )}

      {/* ── Semana ───────────────────────────────────────────────────────────── */}
      {modo === 'editar' && semana && (
        <ListGroup title={`Semana completa · ${maquina.nombre}`}>
          <div className="flex flex-col gap-5 p-4">
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              <CifraSemana valor={slotsAHorasDecimal(semana.libres)} detalle="horas sin nadie encima, sobre 168 h" />
              <CifraSemana
                valor={slotsAHorasDecimal(semana.agua)}
                detalle="horas interviniendo con agua encima"
                alarma={semana.agua > 0}
              />
              <CifraSemana valor={slotsAHorasDecimal(semana.higiene)} detalle="horas que ocupa higiene" />
              <CifraSemana
                valor={slotsAHorasDecimal(semana.colacionTomada)}
                detalle="horas de línea parada que se lleva higiene"
                alarma={semana.colacionTomada > 0}
              />
            </div>

            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {semana.porDia.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setDiaIdx(i)}
                  aria-pressed={i === diaIdx}
                  className={cn(
                    'flex min-h-[5rem] flex-col gap-1.5 rounded-ctl border p-2.5 text-left transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none',
                    i === diaIdx ? 'border-primary bg-card' : 'border-transparent bg-muted/40 hover:bg-muted',
                  )}
                >
                  <span className="text-caption text-muted-foreground">{DIAS_CORTOS[i]}</span>
                  <span className="font-mono text-title3 tabular-nums text-foreground">
                    {slotsAHorasDecimal(r.libres)}
                  </span>
                  {r.condicion.agua > 0 && (
                    <span className="flex items-center gap-1 text-caption text-destructive">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span className="font-mono tabular-nums">{slotsAHorasDecimal(r.condicion.agua)} h</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </ListGroup>
      )}

      {modo === 'editar' && maquina.revisadoEnTerreno !== true && (
        <div className="flex gap-3 rounded-card border border-border bg-card p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-cat-4-ink" />
          <div className="flex flex-col gap-1">
            <p className="text-headline text-foreground">
              El horario de {maquina.nombre} es una base de ejemplo
            </p>
            <p className="text-footnote text-muted-foreground">
              Proceso, colación e higiene vienen de un patrón razonable para poder empezar, no de la
              operación real. Confírmalo en terreno antes de usar estas horas como evidencia.
            </p>
            <button
              onClick={() => marcarRevisada(maquina.id, true)}
              className="mt-1 self-start text-footnote font-semibold text-primary"
            >
              Confirmé el horario de {maquina.nombre}
            </button>
          </div>
        </div>
      )}

      {modo === 'editar' && maquina.revisadoEnTerreno === true && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-footnote text-muted-foreground">
          <Check className="h-3.5 w-3.5 shrink-0 text-cat-2-ink" />
          <span>Horario de {maquina.nombre} confirmado en terreno.</span>
          <button
            onClick={() => marcarRevisada(maquina.id, false)}
            className="font-medium text-primary"
          >
            Marcar como sin confirmar
          </button>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────── */

function BotonBrocha({
  activo,
  onClick,
  swatch,
  label,
}: {
  activo: boolean
  onClick: () => void
  swatch: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'flex min-h-[44px] items-center gap-2.5 rounded-ctl px-3 text-footnote font-semibold transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none',
        activo ? 'bg-primary/10 text-foreground ring-1 ring-inset ring-primary' : 'bg-muted/50 text-muted-foreground hover:text-foreground',
      )}
    >
      {swatch}
      {label}
    </button>
  )
}

function BotonAccion({
  onClick,
  disabled,
  icon,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-[44px] items-center gap-2 rounded-ctl border border-border bg-card px-3.5 text-footnote font-medium text-muted-foreground',
        'transition-colors duration-150 hover:text-foreground disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function PuntoCondicion({ condicion }: { condicion: Condicion }) {
  return (
    <span
      className={cn(
        'h-7 w-7 rounded-[9px]',
        condicion === 'agua' ? 'bg-destructive' : 'bg-cat-4-tint',
      )}
      style={condicion !== 'agua' ? { opacity: OPACIDAD_CONDICION[condicion] } : undefined}
    />
  )
}

function CifraSemana({ valor, detalle, alarma }: { valor: string; detalle: string; alarma?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          'font-mono text-title1 tabular-nums',
          alarma ? 'text-destructive' : 'text-foreground',
        )}
      >
        {valor}
      </span>
      <span className="max-w-[16rem] text-footnote text-muted-foreground">{detalle}</span>
    </div>
  )
}

function Leyenda() {
  const items: Array<{ clase: string; label: string; opacidad?: number }> = [
    { clase: 'bg-cat-1-tint', label: 'Proceso', opacidad: 0.5 },
    { clase: 'bg-cat-7-tint', label: 'Higiene', opacidad: 0.62 },
    { clase: 'bg-cat-3-tint', label: 'Línea parada', opacidad: 0.45 },
    { clase: 'bg-cat-4-tint', label: 'Mantención' },
    { clase: 'bg-destructive', label: 'Choque con higiene' },
  ]
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2 text-footnote text-muted-foreground">
          <span className={cn('h-3 w-3 rounded-[4px]', i.clase)} style={{ opacity: i.opacidad }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

function EstadoGuardado({ estado, detalle }: { estado: EstadoSync; detalle: string | null }) {
  if (estado === 'cargando')
    return (
      <span className="flex items-center gap-1.5 text-footnote text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
        Cargando
      </span>
    )
  if (estado === 'guardando')
    return (
      <span className="flex items-center gap-1.5 text-footnote text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
        Guardando
      </span>
    )
  if (estado === 'error')
    return (
      <span className="flex items-center gap-1.5 text-footnote text-destructive" title={detalle ?? undefined}>
        <AlertTriangle className="h-3.5 w-3.5" />
        No se pudo guardar
      </span>
    )
  if (estado === 'local')
    return (
      <span className="flex items-center gap-1.5 text-footnote text-muted-foreground">
        <CloudOff className="h-3.5 w-3.5" />
        Solo en este equipo
      </span>
    )
  return (
    <span className="flex items-center gap-1.5 text-footnote text-muted-foreground">
      <Check className="h-3.5 w-3.5" />
      Guardado
    </span>
  )
}
