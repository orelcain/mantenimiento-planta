/**
 * Centro de Aprendizaje en PC (forma B del lienzo, 10-11-2026): el título dice
 * cuánto material hay, las máquinas y los cursos van en tablas con filete que
 * cierran con su total, y los simuladores en una columna al lado. El celular
 * conserva sus listas (LearningHubPage).
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { LearningMachine } from '@/data/learningMachines'
import type { MachineContentMeta } from '@/services/learningContent'

export interface SimuladorPC {
  id: string
  titulo: string
  detalle: string
  enDesarrollo?: boolean
  onAbrir: () => void
}

interface Props {
  /** Áreas de planta (sin cursos), en orden de proceso. */
  areas: { nombre: string; maquinas: LearningMachine[] }[]
  cursos: LearningMachine[]
  metaMap: Record<string, MachineContentMeta>
  simuladores: SimuladorPC[]
  recientes: LearningMachine[]
  onMaquina: (m: LearningMachine) => void
}

const th = 'whitespace-nowrap border-b border-foreground/20 px-2.5 py-2 text-left text-[13px] font-medium text-muted-foreground'
const td = 'border-b border-foreground/10 px-2.5 py-2'
const num = 'text-right font-mono tabular-nums'
// La fecha se oculta cuando la tabla queda angosta (contenido < ~1.240 px).
const fecha = 'hidden min-[1464px]:table-cell'

const fmtFecha = (ms?: number | null): string => {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

function Fila({ nombre, celdas, apagada, onClick }: { nombre: ReactNode; celdas: ReactNode; apagada?: boolean; onClick: () => void }) {
  return (
    <tr className={cn('cursor-pointer hover:bg-foreground/[0.04]', apagada && 'text-muted-foreground')} onClick={onClick}>
      <td className={cn(td, 'whitespace-nowrap py-0')}>
        <button type="button" className="inline-flex min-h-[36px] items-center text-left text-[15px] hover:underline focus-visible:underline focus-visible:outline-none" onClick={e => { e.stopPropagation(); onClick() }}>
          {nombre}
        </button>
      </td>
      {celdas}
    </tr>
  )
}

export function HubAprendizajePC({ areas, cursos, metaMap, simuladores, recientes, onMaquina }: Props) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(260px,320px)] items-start gap-10 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <div className="flex min-w-0 flex-col gap-6">
        {areas.map(({ nombre, maquinas }) => {
          const total = (k: 'manual' | 'procedures' | 'flows' | 'diagnosis') =>
            maquinas.reduce((s, m) => s + (metaMap[m.slug]?.[k] ?? 0), 0)
          return (
            <section key={nombre} className="flex flex-col gap-2.5">
              <h2 className="text-[15px] font-semibold text-foreground">
                {nombre} <span className="font-mono text-[13px] font-normal text-muted-foreground">{maquinas.length}</span>
              </h2>
              <table className="w-full border-collapse text-[15px] text-foreground">
                <thead>
                  <tr>
                    <th className={th}>Máquina</th>
                    <th className={cn(th, 'text-right')}>Manual</th>
                    <th className={cn(th, 'text-right')}>Procedimientos</th>
                    <th className={cn(th, 'text-right')}>Flujos</th>
                    <th className={cn(th, 'text-right')}>Diagnóstico</th>
                    <th className={cn(th, 'text-right', fecha)}>Actualizada</th>
                  </tr>
                </thead>
                <tbody>
                  {maquinas.map(m => {
                    const meta = metaMap[m.slug]
                    const vacia = !!meta && meta.manual + meta.procedures + meta.flows + meta.diagnosis === 0
                    return (
                      <Fila
                        key={m.slug}
                        apagada={vacia}
                        onClick={() => onMaquina(m)}
                        nombre={vacia
                          ? <><span aria-hidden className="mr-2 inline-block size-[7px] rounded-full bg-ink-warn align-[1px]" />{m.name} · en preparación</>
                          : m.name}
                        celdas={<>
                          <td className={cn(td, num)}>{meta?.manual ?? '—'}</td>
                          <td className={cn(td, num)}>{meta?.procedures ?? '—'}</td>
                          <td className={cn(td, num)}>{meta?.flows ?? '—'}</td>
                          <td className={cn(td, num)}>{meta?.diagnosis ?? '—'}</td>
                          <td className={cn(td, num, fecha)}>{fmtFecha(meta?.lastUpdatedAt)}</td>
                        </>}
                      />
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="border-t border-foreground/20 px-2.5 py-2">{maquinas.length} máquinas</td>
                    <td className={cn('border-t border-foreground/20 px-2.5 py-2', num)}>{total('manual')}</td>
                    <td className={cn('border-t border-foreground/20 px-2.5 py-2', num)}>{total('procedures')}</td>
                    <td className={cn('border-t border-foreground/20 px-2.5 py-2', num)}>{total('flows')}</td>
                    <td className={cn('border-t border-foreground/20 px-2.5 py-2', num)}>{total('diagnosis')}</td>
                    <td className={cn('border-t border-foreground/20', fecha)} />
                  </tr>
                </tfoot>
              </table>
            </section>
          )
        })}

        {cursos.length > 0 && (() => {
          const v = (m: LearningMachine) => {
            const meta = metaMap[m.slug]
            return {
              lecciones: meta?.manual ?? 0,
              practica: meta?.procedures ?? 0,
              casos: (meta?.flows ?? 0) + (meta?.diagnosis ?? 0),
              examen: meta?.quiz ?? 0,
            }
          }
          const tot = cursos.map(v).reduce((a, b) => ({
            lecciones: a.lecciones + b.lecciones, practica: a.practica + b.practica, casos: a.casos + b.casos, examen: a.examen + b.examen,
          }), { lecciones: 0, practica: 0, casos: 0, examen: 0 })
          return (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[15px] font-semibold text-foreground">
                Capacitación y normativa <span className="font-mono text-[13px] font-normal text-muted-foreground">{cursos.length}</span>
              </h2>
              <table className="w-full border-collapse text-[15px] text-foreground">
                <thead>
                  <tr>
                    <th className={th}>Curso</th>
                    <th className={cn(th, 'text-right')}>Lecciones</th>
                    <th className={cn(th, 'text-right')}>Práctica</th>
                    <th className={cn(th, 'text-right')}>Casos</th>
                    <th className={cn(th, 'text-right')}>Examen</th>
                  </tr>
                </thead>
                <tbody>
                  {cursos.map(m => {
                    const x = v(m)
                    return (
                      <Fila
                        key={m.slug}
                        onClick={() => onMaquina(m)}
                        nombre={m.name}
                        celdas={<>
                          <td className={cn(td, num)}>{x.lecciones}</td>
                          <td className={cn(td, num)}>{x.practica}</td>
                          <td className={cn(td, num)}>{x.casos}</td>
                          <td className={cn(td, num)}>{x.examen}</td>
                        </>}
                      />
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="border-t border-foreground/20 px-2.5 py-2">{cursos.length} cursos</td>
                    <td className={cn('border-t border-foreground/20 px-2.5 py-2', num)}>{tot.lecciones}</td>
                    <td className={cn('border-t border-foreground/20 px-2.5 py-2', num)}>{tot.practica}</td>
                    <td className={cn('border-t border-foreground/20 px-2.5 py-2', num)}>{tot.casos}</td>
                    <td className={cn('border-t border-foreground/20 px-2.5 py-2', num)}>{tot.examen}</td>
                  </tr>
                </tfoot>
              </table>
            </section>
          )
        })()}
      </div>

      <aside className="flex min-w-0 flex-col gap-2.5">
        <h2 className="text-[15px] font-semibold text-foreground">
          Simuladores <span className="font-mono text-[13px] font-normal text-muted-foreground">{simuladores.length}</span>
        </h2>
        <div className="flex flex-col border-t border-foreground/20">
          {simuladores.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={s.onAbrir}
              className="flex min-h-[36px] flex-col items-start gap-px border-b border-foreground/10 py-1.5 text-left text-[15px] text-foreground hover:bg-foreground/[0.04]"
            >
              <span>{s.titulo}{s.enDesarrollo && <span className="text-muted-foreground"> · en desarrollo</span>}</span>
              <span className="text-[13px] leading-snug text-muted-foreground">{s.detalle}</span>
            </button>
          ))}
        </div>
        {recientes.length > 0 && (
          <>
            <h2 className="mt-2.5 text-[15px] font-semibold text-foreground">Abierta hace poco</h2>
            <div className="flex flex-col border-t border-foreground/20">
              {recientes.map(m => (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => onMaquina(m)}
                  className="flex min-h-[36px] items-center border-b border-foreground/10 py-1.5 text-left text-[15px] text-foreground hover:bg-foreground/[0.04]"
                >
                  {m.name}
                </button>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
