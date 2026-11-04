/**
 * EditorPerilla — anotar la velocidad de la perilla de UNA Baader desde la franja «El turno completo» (solo admin).
 *
 * `MinutoTurnoV2` lo abre bajo el nombre de la máquina, dentro de su fila, como tarjeta sobre las barras. Guardar llama a
 * `setMonitorPerilla` con la línea (`plantSlug`) y quien anota (`por`), igual que el editor del set point. El historial con
 * `por` se lee de Firestore con la sesión de quien mira: el monitor público solo trae `{cpm, desde}`.
 *
 * Lo que la franja muestra de la perilla sale del dato publicado (`perillas`), no de un estado local. Después de guardar,
 * el editor dice «guardado · se aplica con el próximo dato» y lo sigue diciendo hasta que llega un dato publicado nuevo.
 */
import { useEffect, useState } from 'react'
import { leerPerillasHistorial, setMonitorPerilla, type PerillaHistorial } from '@/services/shoplogix/pinShiftEnd'
import { diaMesPerilla, horaPerilla, umbralARitmo, type PerillaPublica, type PerillasDeLinea } from './perilla'

/** A quién se le anota: la línea del monitor (`plantSlug`) y quien firma (`por`, el email de la sesión). */
export interface PerillaEditorDatos {
  plantSlug: string
  por: string | null
}

/** El rango que acepta el servicio: pz/min enteros de 5 a 30. */
const MIN_CPM = 5
const MAX_CPM = 30
/** Cuántas anotaciones del historial se muestran (la más reciente primero). */
const HISTORIAL_VISIBLE = 5

type Estado = 'listo' | 'guardando' | 'guardado' | 'error'

export function EditorPerilla({ machineId, nombre, datos, vigente, meta, perillas, onCerrar }: {
  machineId: string
  nombre: string
  datos: PerillaEditorDatos
  /** La perilla vigente al final del turno, tal como la muestra la franja (null = sin perilla anotada). */
  vigente: PerillaPublica | null
  /** Meta de Shoplogix de la máquina: sin perilla anotada, es el valor propuesto. */
  meta: number | null
  /** El dato publicado de perillas. Cada entrega nueva cambia esta referencia y el editor vuelve a «listo». */
  perillas: PerillasDeLinea | null | undefined
  onCerrar: () => void
}) {
  /* Sin perilla se propone la meta de Shoplogix si cae en el rango: es el número que la app ya muestra, no uno inventado. */
  const propuesto = meta != null && meta >= MIN_CPM && meta <= MAX_CPM ? Math.round(meta) : null
  const [valor, setValor] = useState<number | null>(vigente ? vigente.cpm : propuesto)
  const [estado, setEstado] = useState<Estado>('listo')
  const [historial, setHistorial] = useState<PerillaHistorial[] | null>(null)
  const [errorHistorial, setErrorHistorial] = useState(false)

  /* Historial de ESTA máquina, la más reciente primero. Se lee al abrir el editor. */
  useEffect(() => {
    let activo = true
    leerPerillasHistorial(datos.plantSlug)
      .then((todas) => {
        if (!activo) return
        const de = todas
          .filter((h) => h.machineId === machineId)
          .sort((a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : 0))
        setHistorial(de.slice(0, HISTORIAL_VISIBLE))
      })
      .catch(() => { if (activo) setErrorHistorial(true) })
    return () => { activo = false }
  }, [datos.plantSlug, machineId])

  /* Llegó un dato publicado: lo que la franja muestra ya es el del servidor, así que el «guardado» deja de aplicar. */
  useEffect(() => {
    setEstado((e) => (e === 'guardado' ? 'listo' : e))
  }, [perillas])

  /* Sin cambio no se guarda: con perilla anotada, Guardar exige un valor distinto del vigente. */
  const cambio = valor != null && valor !== (vigente ? vigente.cpm : null)
  const puedeGuardar = cambio && estado === 'listo'
  const mover = (delta: number) => setValor((v) => (v == null ? null : Math.min(MAX_CPM, Math.max(MIN_CPM, v + delta))))

  async function guardar() {
    if (valor == null || !puedeGuardar) return
    setEstado('guardando')
    try {
      await setMonitorPerilla({ plantSlug: datos.plantSlug, machineId, cpm: valor, por: datos.por })
      setEstado('guardado')
    } catch {
      setEstado('error')
    }
  }

  return (
    <div role="group" aria-label={`Perilla de la ${nombre}`} className="v2-subtarjeta mb-3 rounded-[26px] px-4 pb-3 pt-3.5">
      <p className="text-[15px] font-semibold leading-tight text-foreground">Perilla de la {nombre}</p>
      <div className="mt-2.5 flex items-center gap-3">
        <button
          type="button"
          aria-label="Bajar"
          disabled={valor == null || valor <= MIN_CPM}
          onClick={() => mover(-1)}
          className="tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-full text-[22px] font-medium leading-none text-foreground disabled:opacity-40"
          style={{ background: 'rgb(142 142 147 / 0.14)' }}
        >
          −
        </button>
        <span className="grid h-11 min-w-[76px] place-items-center rounded-[10px] border border-border bg-background px-3 text-[28px] font-semibold leading-[34px] tabular-nums text-foreground">
          {valor ?? '—'}
        </span>
        <button
          type="button"
          aria-label="Subir"
          disabled={valor == null || valor >= MAX_CPM}
          onClick={() => mover(1)}
          className="tap-44 grid h-11 w-11 shrink-0 place-items-center rounded-full text-[22px] font-medium leading-none text-foreground disabled:opacity-40"
          style={{ background: 'rgb(142 142 147 / 0.14)' }}
        >
          +
        </button>
        <span className="text-[15px] text-muted-foreground">pz/min</span>
      </div>
      <p className="mt-2.5 text-[13px] leading-snug tabular-nums text-muted-foreground">
        {valor != null
          ? <>Con {valor}: a ritmo con <b className="font-semibold text-foreground">{umbralARitmo(valor)} o más por minuto</b>{meta != null ? ` · meta Shoplogix ${Math.round(meta)}` : ''}</>
          : 'Sin valor propuesto: la máquina no tiene meta de Shoplogix.'}
      </p>
      <p className="mt-3.5 text-[13px] font-semibold leading-[18px] text-muted-foreground">Historial</p>
      {errorHistorial
        ? <p className="mt-1 text-[13px] text-muted-foreground">No se pudo leer el historial.</p>
        : historial == null
          ? <p className="mt-1 text-[13px] text-muted-foreground">Leyendo historial…</p>
          : historial.length === 0
            ? <p className="mt-1 text-[13px] text-muted-foreground">Sin anotaciones para esta máquina.</p>
            : (
              <ul className="mt-1">
                {historial.map((h, k) => (
                  <li key={`${h.desde}-${k}`} className="border-t border-border py-1.5 text-[13px] leading-[18px] tabular-nums text-muted-foreground first:border-t-0">
                    {`${h.cpm} pz/min · desde ${diaMesPerilla(h.desde)} ${horaPerilla(h.desde)} · ${h.por ?? 'sin registro'}`}
                  </li>
                ))}
              </ul>
            )}
      {estado === 'guardado' && <p className="mt-3 text-[13px] leading-[18px] text-muted-foreground">guardado · se aplica con el próximo dato</p>}
      {estado === 'error' && <p className="mt-3 text-[13px] leading-[18px]" style={{ color: 'var(--v2-mal-texto)' }}>No se pudo guardar. Intente de nuevo.</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className="tap-44 h-11 rounded-full px-4 text-[15px] font-semibold text-brand-ink">
          Cancelar
        </button>
        <button
          type="button"
          disabled={!puedeGuardar}
          onClick={() => void guardar()}
          className="tap-44 h-11 rounded-full px-5 text-[15px] font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--v2-acento)' }}
        >
          {estado === 'guardando' ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
