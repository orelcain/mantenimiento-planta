/**
 * EditorUmbral — la tarjeta «Minutos a ritmo de la línea» (A2-2b, solo admin): elegir el modo del umbral, Calibrado u Óptimo, y ver el
 * efecto por Baader antes de guardar. Lo abre el «Cambiar» de la cabecera de columnas de `MinutoTurnoV2`.
 *
 * Guardar llama a `setMonitorUmbralARitmo` (la línea, el modo y quien anota) y queda apagado sin cambio. Quién y cuándo se anotó lo
 * lee `leerUmbralARitmo`. Como `EditorPerilla`, «guardado» dura hasta que llega un dato publicado nuevo (`perillas`).
 * La tabla no calcula nada: `MinutoTurnoV2` le pasa el efecto por Baader ya calculado con `perilla.ts` y `pctARitmoFila`.
 */
import { useEffect, useState } from 'react'
import { leerUmbralARitmo, setMonitorUmbralARitmo, type UmbralARitmo } from '@/services/shoplogix/pinShiftEnd'
import { diaMesPerilla, horaPerilla, quienAnoto, type ModoUmbral, type PerillasDeLinea } from './perilla'

/** A quién se le anota: la línea del monitor (`plantSlug`) y quien firma (`por`, el email de la sesión). */
export interface UmbralEditorDatos {
  plantSlug: string
  por: string | null
}

/** Lo que la tabla muestra por Baader con cada modo: el umbral entero del último minuto y el % a ritmo de todo el turno. */
export interface EfectoBaader {
  nombre: string
  /** Velocidad de la perilla vigente; null = la Baader no tiene perilla (su vara no cambia con el modo). */
  perilla: number | null
  calibrado: { umbral: number | null; pct: number | null }
  optimo: { umbral: number | null; pct: number | null }
}

const MODOS: Array<{ id: ModoUmbral; texto: string }> = [
  { id: 'calibrado', texto: 'Calibrado' },
  { id: 'optimo', texto: 'Óptimo' },
]

type Estado = 'listo' | 'guardando' | 'guardado' | 'error'
/** Lo que se lee de Firestore para decir quién y cuándo: `cargando` mientras llega, `error` si no se pudo leer. */
type Quien = { vigente: UmbralARitmo | null } | 'cargando' | 'error'

const txtPct = (pct: number | null) => (pct == null ? '—' : `${pct} %`)
const txtUmbral = (umbral: number | null) => (umbral == null ? '—' : `${umbral} o más`)

export function EditorUmbral({ datos, modoVigente, perillas, efecto, onCerrar }: {
  datos: UmbralEditorDatos
  /** El modo publicado (`live.perillas.modo`); sin él, calibrado. Es el punto de partida y lo que Guardar compara. */
  modoVigente: ModoUmbral
  /** El dato publicado de perillas: cada entrega nueva lo cambia y el «guardado» deja de aplicar. */
  perillas: PerillasDeLinea | null | undefined
  efecto: EfectoBaader[]
  onCerrar: () => void
}) {
  const [modo, setModo] = useState<ModoUmbral>(modoVigente)
  const [estado, setEstado] = useState<Estado>('listo')
  const [quien, setQuien] = useState<Quien>('cargando')

  /* Quién y cuándo se anotó el modo. Se vuelve a leer después de guardar. */
  const leerQuien = (activo: () => boolean) => {
    leerUmbralARitmo(datos.plantSlug)
      .then((r) => { if (activo()) setQuien({ vigente: r.vigente }) })
      .catch(() => { if (activo()) setQuien('error') })
  }
  useEffect(() => {
    let activo = true
    leerQuien(() => activo)
    return () => { activo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cambia con la línea
  }, [datos.plantSlug])

  /* Llegó un dato publicado: lo que la franja muestra ya es el del servidor, así que el «guardado» deja de aplicar. */
  useEffect(() => {
    setEstado((e) => (e === 'guardado' ? 'listo' : e))
  }, [perillas])

  /* Sin cambio no se guarda: Guardar exige un modo distinto del vigente. */
  const cambio = modo !== modoVigente
  const puedeGuardar = cambio && estado === 'listo'

  async function guardar() {
    if (!puedeGuardar) return
    setEstado('guardando')
    try {
      await setMonitorUmbralARitmo({ plantSlug: datos.plantSlug, modo, por: datos.por })
      setEstado('guardado')
      leerQuien(() => true)
    } catch {
      setEstado('error')
    }
  }

  return (
    <div role="group" aria-label="Minutos a ritmo de la línea" className="v2-subtarjeta mb-3 rounded-[26px] px-4 pb-3 pt-3.5">
      <p className="text-[15px] font-semibold leading-tight text-foreground">Minutos a ritmo de la línea</p>
      <div role="radiogroup" aria-label="Umbral" className="mt-2.5 flex gap-1 rounded-full p-1" style={{ background: 'rgb(142 142 147 / 0.14)' }}>
        {MODOS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={modo === m.id}
            onClick={() => setModo(m.id)}
            className={`tap-44 h-[44px] flex-1 rounded-full px-3 text-[15px] font-semibold text-foreground ${modo === m.id ? 'bg-background shadow-sm' : ''}`}
          >
            {m.texto}
          </button>
        ))}
      </div>
      <table className="mt-3 w-full text-[13px] leading-[18px] tabular-nums">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pb-1 font-medium" />
            <th className="pb-1 text-right font-medium">calibrado</th>
            <th className="pb-1 text-right font-medium">óptimo</th>
          </tr>
        </thead>
        <tbody>
          {efecto.map((f) => (
            <tr key={f.nombre} className="border-t border-border align-top">
              <td className="py-1.5 pr-2 text-foreground">
                {f.nombre}
                <span className="block text-muted-foreground">{f.perilla == null ? 'sin perilla' : `perilla ${f.perilla}`}</span>
              </td>
              {f.perilla == null
                ? (
                  <td colSpan={2} className="py-1.5 text-right text-muted-foreground">
                    {`${txtUmbral(f.calibrado.umbral)} · ${txtPct(f.calibrado.pct)}, no cambia`}
                  </td>
                )
                : (
                  <>
                    <td className="py-1.5 text-right text-muted-foreground">
                      {txtUmbral(f.calibrado.umbral)}
                      <b className="block font-semibold text-foreground">{txtPct(f.calibrado.pct)}</b>
                    </td>
                    <td className="py-1.5 text-right text-muted-foreground">
                      {txtUmbral(f.optimo.umbral)}
                      <b className="block font-semibold text-foreground">{txtPct(f.optimo.pct)}</b>
                    </td>
                  </>
                )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2.5 text-[13px] leading-snug text-muted-foreground">
        Calibrado: la perilla menos 1. Óptimo: la perilla completa, y el rótulo dice «a ritmo óptimo». Queda anotado quién lo cambió y cuándo.
      </p>
      <p className="mt-2 text-[13px] leading-snug tabular-nums text-muted-foreground">
        {quien === 'cargando'
          ? 'Leyendo la última anotación…'
          : quien === 'error'
            ? 'No se pudo leer quién lo anotó.'
            : quien.vigente == null
              ? 'Sin anotación: el modo es el de omisión (calibrado).'
              : `Anotado: ${quien.vigente.modo === 'optimo' ? 'óptimo' : 'calibrado'} desde ${diaMesPerilla(quien.vigente.desde)} ${horaPerilla(quien.vigente.desde)} · ${quienAnoto(quien.vigente.por) ?? 'sin registro'}`}
      </p>
      {estado === 'guardado' && <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground">guardado · se aplica con el próximo dato</p>}
      {estado === 'error' && <p className="mt-2 text-[13px] leading-[18px]" style={{ color: 'var(--v2-mal-texto)' }}>No se pudo guardar. Intente de nuevo.</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className="tap-44 h-[44px] rounded-full px-4 text-[15px] font-semibold text-brand-ink">
          Cancelar
        </button>
        <button
          type="button"
          disabled={!puedeGuardar}
          onClick={() => void guardar()}
          className="tap-44 h-[44px] rounded-full px-5 text-[15px] font-semibold text-brand-foreground disabled:opacity-40"
          style={{ background: 'var(--v2-acento)' }}
        >
          {estado === 'guardando' ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
