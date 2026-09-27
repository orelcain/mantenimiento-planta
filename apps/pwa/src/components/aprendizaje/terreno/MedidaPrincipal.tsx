/**
 * La cifra que se vino a buscar, primero (opción A del mockup aprobado).
 * Segmentado por especie arriba y el valor a 64 px: se lee con el teléfono en la mano
 * extendida, con sol. Es la única excepción a la escala de roles, aprobada para esta vista.
 */
import { ESPECIES, type EspecieId, type MedidaPrincipal as TMedidaPrincipal } from '@/data/baader200Terreno'
import { AlertTriangle } from 'lucide-react'
import { SegmentedControl } from '@/components/piel'
import { cn } from '@/lib/utils'
import { ANCLAS } from '@/utils/aprendizaje/terreno'
import { ConPuntos, FuenteLink, PosLink, type AbrirFuente, type VerPos } from './enlaces'

export function MedidaPrincipal({ medida, especie, onEspecie, onVerPos, onFuente }: {
  medida: TMedidaPrincipal
  especie: EspecieId
  onEspecie: (e: EspecieId) => void
  onVerPos: VerPos
  onFuente: AbrirFuente
}) {
  const actual = medida.porEspecie.find(p => p.especie === especie) ?? medida.porEspecie[0]
  if (!actual) return null
  const segmentos = ESPECIES
    .filter(e => medida.porEspecie.some(p => p.especie === e.id))
    .map(e => ({ value: e.id, label: e.corta }))
  const cubre = [actual.etiqueta, ...(actual.incluye ?? [])].join(', ')
  const planta = medida.valorPlanta
  const norm = (v: string) => v.replace(',', '.').replace(/\s+/g, ' ').trim()
  // Es discrepancia si planta da OTRO número (o un texto largo, como «0,5; por lo general más»).
  const difiere = !!planta && norm(planta.valor) !== norm(actual.valor)

  return (
    <section
      id={ANCLAS.medidaPrincipal}
      aria-label={medida.nombre}
      className="scroll-mt-4 rounded-card bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none"
    >
      {segmentos.length > 1 && (
        <SegmentedControl ariaLabel="Especie" value={actual.especie} onChange={onEspecie} segments={segmentos} />
      )}

      <p className={cn('flex items-baseline gap-2', segmentos.length > 1 ? 'mt-5' : 'mt-1')} aria-live="polite">
        {/* key: el número entra con un fundido corto al cambiar de especie. */}
        <span key={actual.especie} className="piel-fade-in text-[64px] font-bold leading-none tracking-[-0.02em] tabular-nums">
          {actual.valor}
        </span>
        <span className="text-title2 font-semibold text-muted-foreground">{medida.unidad}</span>
      </p>
      <h2 className="mt-2 text-headline">{medida.nombre}</h2>
      <p className="mt-1 text-footnote text-muted-foreground">
        {cubre}. Se ajusta con {medida.ajusteCon}{' '}
        <PosLink pos={medida.pos} onVer={onVerPos} />.
      </p>
      <p className="mt-3 text-footnote text-muted-foreground">
        <ConPuntos
          items={[
            <FuenteLink key="f" fuente={medida.fuente} onAbrir={onFuente} />,
            planta && !difiere && (
              <FuenteLink key="p" fuente={planta.fuente} onAbrir={onFuente} etiqueta={`Coincide con planta · pág. ${planta.fuente.pagina}`} />
            ),
          ]}
        />
      </p>
      {planta && difiere && (
        <div className="mt-3 flex items-start gap-2 rounded-ctl bg-muted px-3 py-2.5">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="min-w-0 text-footnote leading-snug">
            <span className="text-foreground">
              En planta se usa <b className="font-semibold tabular-nums">{planta.valor} {medida.unidad}</b>.
            </span>{' '}
            <span className="text-muted-foreground">
              Confirmar cuál rige antes de ajustar ·{' '}
              <FuenteLink fuente={planta.fuente} onAbrir={onFuente} />
            </span>
          </p>
        </div>
      )}
    </section>
  )
}
