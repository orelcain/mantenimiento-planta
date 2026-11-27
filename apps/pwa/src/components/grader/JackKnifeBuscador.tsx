/**
 * Buscador de componentes sobre el Jack-Knife (SPEC_BUSCADOR_JACK_KNIFE.md §4-5).
 * Solo en Bitácora (Chonchi): la búsqueda y la sección «sin aviso SAP» salen de `buscadorComponente`.
 * Todo texto y cifra sale de los datos; nada va escrito a mano.
 */
import { useEffect, useMemo, useState, useId } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Search } from 'lucide-react'
import { Button } from '@/components/piel'
import { db } from '@/services/firebase'
import { BITACORA_COLECCION } from '@/config/bitacora'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'
import { normalizarTexto, palabrasFrecuentes, type TurnoJK } from '@/services/shoplogix/jackKnife'
import {
  antesDespues,
  buscarComponente,
  cambiosSinAviso,
  fechaDeCambio,
  type FilaComponente,
} from '@/services/shoplogix/buscadorComponente'
import { RegistrarTrabajoJKSheet, type DetencionParaTrabajo } from './RegistrarTrabajoJKSheet'
import { cn } from '@/lib/utils'

const ddmm = (dk: string) => `${dk.slice(8, 10)}-${dk.slice(5, 7)}`
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

/** Trabajos de Bitácora de la planta. Una sola lectura; el filtro (con jkClave o componente) va en cliente. */
function useTrabajosBitacora(planta: string): EventoBitacora[] {
  const [trabajos, setTrabajos] = useState<EventoBitacora[]>([])
  useEffect(() => {
    let vivo = true
    getDocs(query(collection(db, BITACORA_COLECCION), where('plantId', '==', planta)))
      .then((snap) => {
        if (!vivo) return
        const lista = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<EventoBitacora, 'id'>) }) as EventoBitacora)
          .filter((e) => e.jkClave || e.componente)
        setTrabajos(lista)
      })
      .catch(() => {
        if (vivo) setTrabajos([])
      })
    return () => {
      vivo = false
    }
  }, [planta])
  return trabajos
}

/** Detención más cercana (misma causa) al instante de un comentario. */
function detencionCercana(turno: TurnoJK, causa: string, ms: number): DetencionParaTrabajo | null {
  let mejor: { ini: number; min: number; d: number } | null = null
  for (const [c, ini, min] of turno.resumen.eventos) {
    if (c !== causa) continue
    const d = Math.abs(ini - ms)
    if (!mejor || d < mejor.d) mejor = { ini, min, d }
  }
  if (!mejor) return null
  const comentario = turno.resumen.comentarios.find(([c, m]) => c === causa && m === ms)?.[2] ?? null
  return {
    turnoJkId: turno.id,
    dateKey: turno.dateKey,
    shiftId: turno.shiftId,
    inicioMs: mejor.ini,
    min: mejor.min,
    causa,
    comentario,
  }
}

function sugerenciasDeCausa(turnos: readonly TurnoJK[], causa: string): string[] {
  const textos = turnos.flatMap((t) => t.resumen.comentarios.filter(([c]) => c === causa).map(([, , x]) => x))
  const deLaCausa = new Set(normalizarTexto(causa).split(' '))
  return palabrasFrecuentes(textos, 20)
    .map((p) => p.palabra)
    .filter((w) => !deLaCausa.has(w) && !NO_COMPONENTE.has(w))
    .slice(0, 5)
}

/** Palabras frecuentes en los comentarios que describen el estado o la acción, no la pieza. */
const NO_COMPONENTE = new Set([
  'ciclo', 'adecuado', 'adecuadamente', 'realiza', 'trabado', 'trabada', 'atorado', 'atorada', 'roto', 'rota',
  'danado', 'danada', 'quebrado', 'quebrada', 'suelto', 'suelta', 'cambio', 'cambia', 'falla', 'error', 'ajuste',
  'ajusta', 'revision', 'limpieza', 'detencion', 'linea', 'maquina', 'problema', 'mal', 'estado', 'buen', 'se', 'no',
])

// ── Buscador ────────────────────────────────────────────────────────────────

export interface JackKnifeBuscadorProps {
  planta: string
  /** Turnos de la ventana que se está mirando. */
  turnos: readonly TurnoJK[]
  /** Abre el análisis de causa raíz de esa causa (mismo flujo que el ACR de la página). */
  onAnalizar?: (causa: string) => void
}

export function JackKnifeBuscador({ planta, turnos, onAnalizar }: JackKnifeBuscadorProps) {
  const id = useId()
  const [consulta, setConsulta] = useState('')
  const [registrar, setRegistrar] = useState<DetencionParaTrabajo | null>(null)
  const trabajos = useTrabajosBitacora(planta)
  const r = useMemo(() => buscarComponente(turnos, trabajos, consulta), [turnos, trabajos, consulta])
  const hay = r.terminos.length > 0
  const ad = useMemo(() => antesDespues(r.filas, fechaDeCambio(r.filas), 0), [r.filas])
  const maxMin = Math.max(1, ...r.filas.map((f) => f.detenciones.reduce((s, d) => s + d[2], 0)))
  const otrosTerminos = r.terminos.slice(1)
  const causaPrincipal = r.causas[0]?.causa ?? null

  return (
    <section aria-label="Buscar componente en el Jack-Knife" className="flex flex-col gap-4 rounded-card bg-card p-4 lg:p-6">
      <label htmlFor={`${id}-q`} className="flex min-h-[44px] max-w-[560px] items-center gap-2 rounded-full bg-muted px-4 focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          id={`${id}-q`}
          type="search"
          role="searchbox"
          aria-label="Buscar componente o repuesto"
          placeholder="Buscar componente o repuesto"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      {hay && (
        <p className="text-footnote text-muted-foreground">
          {otrosTerminos.length > 0 && <>También busca <b className="font-semibold text-foreground">{otrosTerminos.join(', ')}</b>. </>}
          {r.causas.length > 0 && <>Aparece en {r.causas.map((c, i) => (
            <span key={c.causa}>{i > 0 && (i === r.causas.length - 1 ? ' y ' : ', ')}<b className="font-semibold text-foreground">{c.causa}</b> ({c.turnos})</span>
          ))}. </>}
          Busca en los comentarios del operador y en los trabajos de Mantención.
        </p>
      )}

      {hay && (
        <h2 className="text-title2 font-semibold tabular-nums text-balance">
          {r.totalDetenciones > 0
            ? <>{r.totalDetenciones} {plural(r.totalDetenciones, 'detención', 'detenciones')} y {Math.round(r.totalMin)} min en {r.turnosConDetencion} {plural(r.turnosConDetencion, 'turno', 'turnos')}</>
            : <>Ninguna detención de «{consulta.trim()}» en esta ventana</>}
          {r.comentariosSinDetencion > 0 && <>, más {r.comentariosSinDetencion} {plural(r.comentariosSinDetencion, 'comentario', 'comentarios')} sin detención</>}
          {ad.fechaCambio && ad.despues.turnos > 0 && <>. Se repitió después del cambio del {ddmm(ad.fechaCambio)}</>}.
        </h2>
      )}

      {hay && r.filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-subhead max-[560px]:block">
            <caption className="sr-only">Línea de tiempo de «{consulta.trim()}»</caption>
            <thead className="max-[560px]:hidden">
              <tr className="text-footnote text-muted-foreground">
                <th scope="col" className="pb-2 pr-3 text-left font-semibold">Turno</th>
                <th scope="col" className="pb-2 pr-3 text-left font-semibold">Detención</th>
                <th scope="col" className="pb-2 pr-3 text-left font-semibold">Lo que anotó el operador</th>
                <th scope="col" className="pb-2 text-left font-semibold">Trabajo de Mantención</th>
              </tr>
            </thead>
            <tbody className="max-[560px]:block">
              {r.filas.map((f) => (
                <FilaTiempo key={f.turnoId} fila={f} turnos={turnos} maxMin={maxMin} onRegistrar={setRegistrar} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hay && r.filas.length > 0 && (
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
          <div>
            <p className="text-footnote text-muted-foreground">{ad.fechaCambio ? `Antes del cambio · hasta el ${ddmm(ad.fechaCambio)}` : 'Todo el período'}</p>
            <p className="text-title3 font-semibold tabular-nums">{ad.antes.turnos} {plural(ad.antes.turnos, 'turno', 'turnos')}</p>
            <p className="text-footnote text-muted-foreground tabular-nums">{Math.round(ad.antes.min)} min</p>
          </div>
          <div>
            {ad.fechaCambio && <p className="text-footnote text-muted-foreground">Después del cambio</p>}
            <p className="text-title3 font-semibold tabular-nums">{ad.despues.turnos} {plural(ad.despues.turnos, 'turno', 'turnos')}</p>
            <p className="text-footnote text-muted-foreground tabular-nums">{Math.round(ad.despues.min)} min</p>
          </div>
          <div className="flex flex-col items-start gap-2">
            <p className="text-footnote text-muted-foreground">Veredicto</p>
            <p className="text-subhead">Todavía no hay</p>
            {onAnalizar && causaPrincipal && (
              <Button variant="tinted" size="md" onClick={() => onAnalizar(causaPrincipal)}>Analizar causa raíz</Button>
            )}
          </div>
        </div>
      )}

      {hay && (
        <p className="text-footnote text-muted-foreground">
          Regla del cruce: cada comentario que nombra el componente se une a la detención más cercana de su misma causa (±5 min; 30 min como máximo).
        </p>
      )}

      <RegistrarTrabajoJKSheet
        open={registrar !== null}
        onClose={() => setRegistrar(null)}
        detencion={registrar}
        sugerencias={registrar ? sugerenciasDeCausa(turnos, registrar.causa) : []}
      />
    </section>
  )
}

function FilaTiempo({ fila, turnos, maxMin, onRegistrar }: {
  fila: FilaComponente
  turnos: readonly TurnoJK[]
  maxMin: number
  onRegistrar: (d: DetencionParaTrabajo) => void
}) {
  const turno = turnos.find((t) => t.id === fila.turnoId)
  const min = fila.detenciones.reduce((s, d) => s + d[2], 0)
  // La detención más larga del turno: es la que se registra como trabajo.
  const primera = fila.detenciones.reduce<(typeof fila.detenciones)[number] | undefined>((m, d) => (!m || d[2] > m[2] ? d : m), undefined)
  const registrable = turno && primera ? { turno, causa: primera[0], ini: primera[1] } : null
  return (
    <tr className="border-t border-border align-top max-[560px]:grid max-[560px]:grid-cols-[auto_1fr] max-[560px]:gap-x-3 max-[560px]:py-3">
      <td className="py-3 pr-3 whitespace-nowrap tabular-nums max-[560px]:p-0">
        {ddmm(fila.dateKey)} <span className="text-muted-foreground">{fila.shiftId}</span>
      </td>
      <td className="py-3 pr-3 max-[560px]:p-0">
        {fila.detenciones.length > 0 ? (
          <>
            <span className="tabular-nums">{Math.round(min)} min</span>
            <span aria-hidden className={cn('mt-1.5 block h-1.5 rounded-full bg-destructive')} style={{ width: `${Math.max(6, (min / maxMin) * 100)}%` }} />
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-3 pr-3 max-[560px]:col-span-2 max-[560px]:p-0 max-[560px]:pt-1">
        {fila.comentarios.length > 0 ? fila.comentarios.map(([causa, , texto], i) => (
          <span key={i} className="block">
            {texto} <span className="text-footnote text-muted-foreground">· {causa}</span>
          </span>
        )) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="py-3 max-[560px]:col-span-2 max-[560px]:p-0 max-[560px]:pt-2">
        {fila.trabajos.length > 0 && fila.trabajos.map((w) => (
          <span key={w.id} className="block">{w.descripcion}</span>
        ))}
        {fila.trabajos.length === 0 && registrable && (
          <Button variant="tinted" size="md" onClick={() => onRegistrar({
            turnoJkId: registrable.turno.id,
            dateKey: registrable.turno.dateKey,
            shiftId: registrable.turno.shiftId,
            inicioMs: registrable.ini,
            min: primera![2],
            causa: registrable.causa,
            comentario: fila.comentarios[0]?.[2] ?? null,
          })}>
            Registrar trabajo
          </Button>
        )}
      </td>
    </tr>
  )
}

// ── Trabajos sin aviso SAP ──────────────────────────────────────────────────

export interface JackKnifeSinAvisoProps {
  planta: string
  turnos: readonly TurnoJK[]
}

export function JackKnifeSinAviso({ planta, turnos }: JackKnifeSinAvisoProps) {
  const trabajos = useTrabajosBitacora(planta)
  const [registrar, setRegistrar] = useState<DetencionParaTrabajo | null>(null)
  const lista = useMemo(() => cambiosSinAviso(turnos, trabajos), [turnos, trabajos])

  return (
    <section aria-label="Trabajos sin aviso SAP" className="flex flex-col gap-4 rounded-card bg-card p-4 lg:p-6">
      <h2 className="text-title3 font-semibold tabular-nums text-balance">
        {lista.length} {plural(lista.length, 'cambio de pieza', 'cambios de pieza')} sin aviso SAP
      </h2>
      <p className="text-footnote text-muted-foreground">
        Son los comentarios del operador que nombran un cambio, y los trabajos registrados sin N° de aviso.
      </p>
      {lista.length === 0 && <p className="text-subhead text-muted-foreground">No hay cambios sin aviso en esta ventana.</p>}
      <ul className="flex flex-col">
        {lista.map((c, i) => {
          const turno = turnos.find((t) => t.id === c.turnoId)
          const comentario = c.tipo === 'comentario' && turno
            ? turno.resumen.comentarios.find(([causa, , texto]) => causa === c.causa && texto === c.texto)
            : undefined
          const det = comentario && turno ? detencionCercana(turno, comentario[0], comentario[1]) : null
          return (
            <li key={`${c.turnoId}-${i}`} className="flex flex-wrap items-center gap-3 border-t border-border py-3 first:border-t-0">
              <span className="w-16 shrink-0 tabular-nums text-footnote text-muted-foreground">{ddmm(c.dateKey)}</span>
              <span className="min-w-0 flex-1 text-subhead">
                {c.texto}
                {c.causa && <span className="text-footnote text-muted-foreground"> · {c.causa}</span>}
              </span>
              {c.tipo === 'comentario' && det && (
                <Button variant="tinted" size="md" onClick={() => setRegistrar(det)}>Registrar</Button>
              )}
            </li>
          )
        })}
      </ul>
      <RegistrarTrabajoJKSheet
        open={registrar !== null}
        onClose={() => setRegistrar(null)}
        detencion={registrar}
        sugerencias={registrar ? sugerenciasDeCausa(turnos, registrar.causa) : []}
      />
    </section>
  )
}
