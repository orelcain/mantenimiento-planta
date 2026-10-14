/**
 * Resultado de un código: lo que dice el manual, el aviso «verificar en terreno» si lo hay, el
 * aviso de seguridad (hay que confirmarlo antes de marcar pasos), los pasos en el orden del
 * manual y lo que el manual no indica, con su pregunta para terreno.
 */
import { CircleCheck, Cpu, Lock, TriangleAlert } from 'lucide-react'
import { Button, Pill } from '@/components/piel'
import { cn } from '@/lib/utils'
import { SEGURIDAD, type Diagnostico, type NoIndica, type PasoDiag } from '@/data/baader142Diagnostico'
import type { ModeloA3c } from '@/utils/aprendizaje/a3c'
import { claveMarca, pasosMarcables, revisados, type EstadoLocal, type Marca } from '@/utils/aprendizaje/a3cDiagnostico'
import { hechosDe } from './hechos'

export function AvisoTerreno({ texto }: { texto: string }) {
  const corte = texto.indexOf('. ')
  return (
    <div className="a3cd-aviso flex gap-3 rounded-card p-4" role="note">
      <TriangleAlert aria-hidden className="a3cd-ic mt-0.5 size-[22px] flex-none" />
      <p className="text-subhead leading-snug">
        {corte > 0 ? <><strong className="font-semibold">{texto.slice(0, corte + 1)}</strong>{texto.slice(corte + 1)}</> : texto}
      </p>
    </div>
  )
}

export function NoIndicaCaja({ x }: { x: NoIndica }) {
  return (
    <div className="rounded-card bg-muted p-4">
      <p className="text-subhead font-semibold leading-snug">{x.texto}</p>
      <p className="mt-1 text-subhead leading-snug text-muted-foreground">Pregunta para terreno: {x.pregunta}</p>
    </div>
  )
}

function Seguridad({ asegurada, onConfirmar }: { asegurada: boolean; onConfirmar: () => void }) {
  if (asegurada) {
    return (
      <div className="a3cd-asegurada flex gap-3 rounded-card p-4" data-testid="seguridad-ok">
        <CircleCheck aria-hidden className="a3cd-ic mt-0.5 size-[22px] flex-none" />
        <div>
          <p className="text-headline">Máquina parada y asegurada</p>
          <p className="text-footnote text-muted-foreground">Confirmado en este diagnóstico. Sin spray en cajas eléctricas (Manual 2005, p. 5).</p>
        </div>
      </div>
    )
  }
  return (
    <section className="a3cd-seguridad rounded-card p-4" aria-labelledby="a3cd-seg-titulo">
      <h3 id="a3cd-seg-titulo" className="flex items-center gap-2 text-headline">
        <Lock aria-hidden className="a3cd-ic size-[22px] flex-none" />
        Antes de tocar la máquina
      </h3>
      <ul className="mt-2 space-y-1.5 pl-1">
        {SEGURIDAD.map(s => (
          <li key={s.texto} className="text-subhead leading-snug">
            {s.texto} <span className="whitespace-nowrap text-footnote tabular-nums text-muted-foreground">({s.fuente})</span>
          </li>
        ))}
      </ul>
      <Button size="block" className="mt-3 h-[48px] rounded-full" onClick={onConfirmar}>
        Máquina parada y asegurada
      </Button>
    </section>
  )
}

function Paso({
  paso,
  i,
  modelo,
  marca,
  habilitado,
  elegido,
  onMarcar,
  onVer,
  onElegir,
}: {
  paso: PasoDiag
  i: number
  modelo: ModeloA3c
  marca: Marca | undefined
  habilitado: boolean
  elegido: boolean
  onMarcar: (m: Marca) => void
  onVer: (clave: string) => void
  onElegir?: () => void
}) {
  const h = paso.elemento ? hechosDe(modelo, paso.elemento) : null
  return (
    <article
      className={cn('rounded-card bg-card p-4', elegido && 'ring-2 ring-inset ring-primary')}
      data-testid="paso-diagnostico"
      onClick={onElegir}
      onFocusCapture={onElegir}
    >
      <div className="flex gap-3">
        <span aria-hidden className="grid size-[28px] flex-none place-items-center rounded-full bg-muted text-footnote font-semibold tabular-nums">{i + 1}</span>
        <div className="min-w-0 flex-1">
          <h4 className="text-headline">{paso.titulo}</h4>
          {paso.verificar && <Pill tone="warning" className="mt-1">Verificar en terreno</Pill>}
          <p className="mt-1 text-subhead leading-snug">{paso.porque}</p>
          <p className="mt-1 text-footnote tabular-nums text-muted-foreground">{paso.fuente}</p>
        </div>
      </div>
      {h && (
        <>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-subhead">
            <dt className="text-muted-foreground">LED</dt>
            <dd className="flex items-center gap-2 tabular-nums">
              {h.ledTexto ? (
                <>
                  <span aria-hidden className="a3cd-led" data-estado={h.estado} data-color={h.color} />
                  <span>{h.ledTexto}</span>
                </>
              ) : (
                'Sin LED en el plano'
              )}
            </dd>
            {h.medir && (
              <>
                <dt className="text-muted-foreground">Medir</dt>
                <dd className="font-mono tabular-nums">{h.medir}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Plano</dt>
            <dd className="tabular-nums">{h.plano}</dd>
            {h.tipo && (
              <>
                <dt className="text-muted-foreground">Tipo</dt>
                <dd>{h.tipo}</dd>
              </>
            )}
          </dl>
          <Button variant="tinted" size="block" className="mt-3 h-[48px] rounded-full" onClick={() => onVer(paso.elemento!)}>
            <Cpu aria-hidden />
            Ver {paso.elemento} en la tarjeta
          </Button>
        </>
      )}
      {paso.tipo !== 'info' && (
        <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={`Resultado del paso ${i + 1}`}>
          {(['descartado', 'sospechoso'] as const).map(v => (
            <button
              key={v}
              type="button"
              data-marca={v}
              aria-pressed={marca === v}
              disabled={!habilitado}
              title={habilitado ? undefined : 'Primero confirma que la máquina está parada y asegurada'}
              onClick={() => onMarcar(v)}
              className="a3cd-marca h-[48px] rounded-full bg-muted text-subhead font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
            >
              {v === 'descartado' ? 'Descartado' : 'Sospechoso'}
            </button>
          ))}
        </div>
      )}
    </article>
  )
}

export interface ResultadoCodigoProps {
  d: Diagnostico
  modelo: ModeloA3c
  local: EstadoLocal
  asegurada: boolean
  /** Índice del paso con elemento que se muestra en la regleta (PC). */
  elegido: number | null
  onConfirmar: () => void
  onMarcar: (i: number, m: Marca) => void
  onCerrar: () => void
  onVer: (clave: string) => void
  onElegir?: (i: number) => void
}

export function ResultadoCodigo({ d, modelo, local, asegurada, elegido, onConfirmar, onMarcar, onCerrar, onVer, onElegir }: ResultadoCodigoProps) {
  const total = pasosMarcables(d).length
  const hechos = revisados(local, d)
  const relacionados = d.motores
    .map(s => {
      const enc = hechosDe(modelo, s.encoder)
      const cable = (modelo.datos.elementos[s.sm]?.fuentes ?? []).filter(f => /^Plano/.test(f)).join(' · ')
      return `encoder ${s.encoder}${enc?.ledTexto ? ` (LED ${enc.ledTexto.replace(' · contorno, no se enciende', '')})` : ''}, LED 60V DC y Step ${s.sm} (estado)${cable ? `; cableado del motor: ${cable}` : ''}`
    })
    .join(' · ')
  return (
    <div className="flex flex-col gap-3" data-testid="resultado-codigo">
      <div className="rounded-card bg-card p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-mono text-title1 font-bold tabular-nums">{d.etiqueta}</h3>
          <span className="text-footnote text-muted-foreground">{d.modulo}</span>
        </div>
        <p className="mt-1 text-body leading-snug">«{d.titulo}»</p>
        <p className="mt-1 text-footnote tabular-nums text-muted-foreground">{d.fuente}</p>
      </div>
      {d.aviso && <AvisoTerreno texto={d.aviso} />}
      <Seguridad asegurada={asegurada} onConfirmar={onConfirmar} />
      {d.accion && (
        <div className="rounded-card bg-card p-4">
          <p className="text-footnote font-semibold text-muted-foreground">Lo que indica el manual</p>
          <p className="mt-1 text-body leading-snug">{d.accion}</p>
          <p className="mt-1 text-footnote tabular-nums text-muted-foreground">{d.fuente}</p>
        </div>
      )}
      {d.pasos.length > 0 && <p className="px-1 pt-1 text-footnote font-semibold text-muted-foreground">Revisar en este orden</p>}
      {d.pasos.map((p, i) => (
        <Paso
          key={`${d.etiqueta}-${i}`}
          paso={p}
          i={i}
          modelo={modelo}
          marca={local.marcas[claveMarca(d, i)]}
          habilitado={asegurada}
          elegido={elegido === i}
          onMarcar={m => onMarcar(i, m)}
          onVer={onVer}
          onElegir={onElegir && p.elemento ? () => onElegir(i) : undefined}
        />
      ))}
      {d.noIndica.map(x => <NoIndicaCaja key={x.texto} x={x} />)}
      {relacionados && <p className="px-1 text-footnote leading-snug text-muted-foreground">Relacionado, no se enciende: {relacionados}.</p>}
      {/* Se cierra también un código sin pasos que marcar (E 821, E 9xx…): el contador cuenta diagnósticos. */}
      <button
        type="button"
        onClick={onCerrar}
        disabled={!asegurada}
        className="h-[48px] w-full rounded-full bg-muted text-subhead font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
      >
        {total > 0 ? `Cerrar diagnóstico · ${hechos} de ${total} revisados` : 'Cerrar diagnóstico'}
      </button>
    </div>
  )
}
