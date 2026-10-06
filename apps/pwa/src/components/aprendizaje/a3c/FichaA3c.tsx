/**
 * Ficha del elemento elegido y lista agrupada del buscador.
 * Las salidas se distinguen de los sensores en la Pill y en «Señal»: el LED de una salida
 * dice que la A3C la activa, no que el elemento se movió.
 */
import { ListCell, ListGroup, Pill } from '@/components/piel'
import { cn } from '@/lib/utils'
import {
  ETIQUETA_TIPO,
  lineaLed,
  regletaDe,
  type ClaveSel,
  type GrupoLista,
  type Idioma,
  type ItemA3c,
} from '@/utils/aprendizaje/a3c'

function listaBornes(ns: number[]): string {
  return ns.length > 3 ? `${ns[0]}–${ns[ns.length - 1]}` : ns.join(', ')
}

/**
 * `compacta` (PC): lo esencial primero —código, nombre, tipo, señal y borne— y debajo «Qué hace»,
 * «Cuándo prende» y la fuente, para que la ficha se lea en poco alto sin quitarle sitio a los dibujos.
 */
export function FichaA3c({ item, idioma, compacta = false }: { item: ItemA3c; idioma: Idioma; compacta?: boolean }) {
  const r = item.bornes[0] != null ? regletaDe(item.bornes[0]) : undefined
  const textos = (
    <>
      <section className={compacta ? 'mt-3' : 'mt-4'}>
        <h4 className="text-footnote font-semibold text-muted-foreground">Qué hace</h4>
        <p className={cn('text-subhead leading-snug', !item.queHace.conDatos && 'text-muted-foreground')}>{item.queHace.texto}</p>
        {item.preguntaTerreno && (
          <p className="mt-1.5 text-subhead leading-snug">Pendiente de confirmar en terreno: {item.preguntaTerreno}</p>
        )}
      </section>
      {item.cuandoLed && (
        <section className={compacta ? 'mt-3' : 'mt-4'}>
          <h4 className="text-footnote font-semibold text-muted-foreground">Cuándo prende el LED</h4>
          <p className="text-subhead leading-snug">{item.cuandoLed}</p>
        </section>
      )}
    </>
  )
  return (
    <div data-testid="ficha-a3c">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-title3 font-semibold">{item.codigo}</span>
        <span className={cn('text-headline', item.tipo === 'sin' && 'text-muted-foreground')}>{item.nombre}</span>
      </div>
      {item.nombreApoyo && <p className="text-footnote text-muted-foreground">{item.nombreApoyo}</p>}
      {(item.mostrarTipo || item.modulo) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.mostrarTipo && <Pill tone={item.tipo === 'salida' ? 'info' : 'neutral'}>{ETIQUETA_TIPO[item.tipo]}</Pill>}
          {item.modulo && <Pill>{item.modulo}</Pill>}
        </div>
      )}

      {!compacta && textos}

      <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-subhead">
        {item.tipoSensor && (
          <>
            <dt className="pt-0.5 text-footnote text-muted-foreground">Tipo</dt>
            <dd>
              {item.tipoSensor}
              {item.tipoSensorNota && <span className="mt-0.5 block text-footnote text-muted-foreground">{item.tipoSensorNota}</span>}
            </dd>
          </>
        )}
        <dt className="pt-0.5 text-footnote text-muted-foreground">Señal</dt>
        <dd>{item.senal}</dd>
        {item.bornes.length > 0 && (
          <>
            <dt className="pt-0.5 text-footnote text-muted-foreground">Borne</dt>
            <dd>
              <span className="font-mono tabular-nums">X5:{listaBornes(item.bornes)}</span>
              {r && <> · regleta {r.desde}–{r.hasta} ({idioma === 'or' ? r.original : r.es})</>}
            </dd>
          </>
        )}
        <dt className="pt-0.5 text-footnote text-muted-foreground">Ubicación</dt>
        <dd>
          {item.hotspots.length ? 'Marcado en el plano de la máquina' : item.tipo === 'led' ? 'En la tarjeta A3C' : 'No aparece en el plano de ubicación'}
        </dd>
        {item.enPlano && (
          <>
            <dt className="pt-0.5 text-footnote text-muted-foreground">En el plano</dt>
            <dd>
              <span className="font-mono text-footnote">{item.enPlano}</span>
              {item.nota && <span className="mt-0.5 block text-footnote text-muted-foreground">{item.nota}</span>}
            </dd>
          </>
        )}
      </dl>
      {compacta && textos}
      {item.fuentes.length > 0 && <p className="mt-4 text-caption text-muted-foreground">Fuente: {item.fuentes.join('; ')}</p>}
      <p className={cn('font-mono text-caption text-muted-foreground', item.fuentes.length ? 'mt-1' : 'mt-4')}>
        Plano 142.71.00.888, hoja 23/45{item.hotspots.length ? ' y 22/45' : ''}
      </p>
    </div>
  )
}

export function ListaA3c({ grupos, elegido, consulta, onElegir }: { grupos: GrupoLista[]; elegido: ClaveSel; consulta: string; onElegir: (c: ClaveSel) => void }) {
  if (!grupos.length) {
    return <p className="px-1 py-4 text-subhead text-muted-foreground">Nada coincide con «{consulta.trim()}».</p>
  }
  return (
    <div className="space-y-5">
      {grupos.map(g => (
        <ListGroup key={g.titulo} title={g.titulo}>
          {g.items.map(it => (
            <ListCell
              key={it.clave}
              aria-pressed={it.clave === elegido}
              onClick={() => onElegir(it.clave)}
              className={cn(it.clave === elegido && 'bg-primary/[0.08]')}
              title={
                <span>
                  <span className="mr-2 font-mono font-semibold">{it.codigo}</span>
                  {it.nombre}
                </span>
              }
              subtitle={lineaLed(it).grande}
              chevron={false}
            />
          ))}
        </ListGroup>
      ))}
    </div>
  )
}
