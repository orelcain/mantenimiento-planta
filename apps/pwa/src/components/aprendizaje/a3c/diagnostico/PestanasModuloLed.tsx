/**
 * Pestañas secundarias del diagnóstico. «Módulo»: se parte de la herramienta de la máquina (sus
 * elementos y sus códigos). «LED»: «veo este LED encendido / apagado» → borne → elemento.
 */
import { ListCell, ListGroup } from '@/components/piel'
import { cn } from '@/lib/utils'
import { MODULOS, PREGUNTAS_TERRENO, type ModuloDiag } from '@/data/baader142Diagnostico'
import { claveDeBorne, describir, lineaLed, regletaDe, type ModeloA3c } from '@/utils/aprendizaje/a3c'
import { codigosDeElemento, codigosDeModulo, etiquetaCodigo } from '@/utils/aprendizaje/a3cDiagnostico'
import { FranjaLed } from '../FranjaLed'
import { AvisoTerreno, NoIndicaCaja } from './ResultadoCodigo'
import { estadoFoto, hechosDe } from './hechos'

const chip = 'inline-flex h-[48px] items-center rounded-full bg-card px-4 text-subhead font-medium tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

function ChipsCodigos({ codigos, onCodigo }: { codigos: number[]; onCodigo: (n: number) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {codigos.map(n => (
        <button key={n} type="button" className={chip} onClick={() => onCodigo(n)}>
          {etiquetaCodigo(n)}{n >= 770 && n <= 777 ? '*' : ''}
        </button>
      ))}
    </div>
  )
}

export function ListaModulos({ elegido, onElegir }: { elegido: string | null; onElegir: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Módulos de la máquina">
      {MODULOS.map(mod => (
        <button
          key={mod.id}
          type="button"
          aria-pressed={elegido === mod.id}
          onClick={() => onElegir(mod.id)}
          className={cn(
            'flex min-h-[72px] flex-col items-start justify-between rounded-card bg-card px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            elegido === mod.id && 'ring-2 ring-inset ring-primary',
          )}
        >
          <span className="text-headline leading-tight">{mod.nombre}</span>
          <span className="mt-1 text-footnote tabular-nums text-muted-foreground">{mod.detalle}</span>
        </button>
      ))}
    </div>
  )
}

export function DetalleModulo({
  mod,
  modelo,
  onElemento,
  onCodigo,
}: {
  mod: ModuloDiag
  modelo: ModeloA3c
  onElemento: (clave: string) => void
  onCodigo: (n: number) => void
}) {
  const grupos = codigosDeModulo(mod)
  return (
    <div className="flex flex-col gap-3" data-testid="detalle-modulo">
      {mod.digitoEnDuda && (
        <AvisoTerreno texto={`${mod.nombre}: verificar en terreno. Las dos tablas del manual no coinciden en los dígitos 1 y 2 de E 8NX (p. 41 y p. 45). ${PREGUNTAS_TERRENO[0]}`} />
      )}
      <ListGroup title={mod.nombre} className="[&_h2]:normal-case">
        {mod.elementos.map(clave => {
          const h = hechosDe(modelo, clave)
          if (!h) return null
          const linea = lineaLed(h.item)
          return (
            <ListCell
              key={clave}
              onClick={() => onElemento(clave)}
              leading={<span aria-hidden className="a3cd-led" data-estado={h.ledTexto ? h.estado : 'contorno'} data-color={h.color} />}
              title={<span><span className="font-mono font-semibold">{clave}</span> · {h.item.nombre}</span>}
              subtitle={<span className="tabular-nums">{h.ledTexto ? `LED ${h.ledTexto}` : `${linea.grande} · ${linea.texto}`} · {h.plano}</span>}
              value={h.medir ? <span className="font-mono tabular-nums">{h.medir}</span> : undefined}
              aria-label={`${clave}, ${h.item.nombre}`}
            />
          )
        })}
      </ListGroup>
      {(mod.sm || mod.id === 'sm6') && (
        <NoIndicaCaja x={{ texto: 'El manual no trae un procedimiento para «el motor no se mueve» sin código en el display.', pregunta: 'Si el display muestra un código, entra por él. ¿Qué se revisó la última vez?' }} />
      )}
      {grupos.length > 0 && (
        <section>
          <p className="px-1 pb-2 text-footnote font-semibold text-muted-foreground">Códigos de este módulo</p>
          {grupos.map(g => (
            <div key={g.titulo ?? 'todos'} className="mb-2">
              {g.titulo && <p className="px-1 pb-1 text-footnote text-muted-foreground">{g.titulo}</p>}
              <ChipsCodigos codigos={g.codigos} onCodigo={onCodigo} />
            </div>
          ))}
          <p className="px-1 text-footnote tabular-nums text-muted-foreground">
            {grupos.some(g => g.codigos.some(n => n < 800)) ? '* solo con Upgrade Kit · ' : ''}Manual 2005, p. 41–42
          </p>
        </section>
      )}
      {mod.sinCodigo && <NoIndicaCaja x={{ texto: mod.sinCodigo, pregunta: '¿Qué código muestra el display cuando falla este módulo?' }} />}
    </div>
  )
}

export type Visto = 'encendido' | 'apagado'

export function DetalleLed({
  n,
  visto,
  modelo,
  onVer,
  onCodigo,
}: {
  n: number
  visto: Visto
  modelo: ModeloA3c
  onVer: (clave: string) => void
  onCodigo: (n: number) => void
}) {
  const b = modelo.bornes.get(n)
  if (!b) {
    return (
      <NoIndicaCaja x={{ texto: `La tarjeta no tiene borne X5.${n}.`, pregunta: 'Revisa el número: las regletas X5 van de 1 a 134 y de 136 a 145 (Plano 888, hoja 23).' }} />
    )
  }
  const clave = claveDeBorne(modelo, n)
  const item = describir(modelo, clave, 'es')
  if (!item) return null
  const r = regletaDe(n)
  const foto = b.led ? estadoFoto(n) : 'sin-foto'
  const elemento = clave.startsWith('e:') ? clave.slice(2) : null
  const codigos = elemento ? codigosDeElemento(elemento) : []
  const contorno = item.modoLed !== 'senal'
  return (
    <div className="flex flex-col gap-3" data-testid="detalle-led">
      <div className="rounded-card bg-card p-4">
        <p className="font-mono text-footnote tabular-nums text-muted-foreground">
          Borne X5.{n}{r ? ` · regleta ${r.desde}–${r.hasta} · ${r.es}` : ''}
        </p>
        <h3 className="mt-1 text-title3">
          <span className="font-mono">{item.codigo}</span> · {item.nombre}
        </h3>
        <p className="mt-1 text-subhead leading-snug">{item.queHace.texto}</p>
        {item.cuandoLed && <p className="mt-2 text-subhead leading-snug"><span className="text-muted-foreground">Cuándo prende: </span>{item.cuandoLed}</p>}
        {item.fuentes.length > 0 && <p className="mt-1 text-footnote tabular-nums text-muted-foreground">Fuente: {item.fuentes.join(' · ')}</p>}
      </div>
      <FranjaLed linea={lineaLed(item)} onVer={() => onVer(clave)} />
      {b.led && (
        <div className="rounded-card bg-card p-4" aria-live="polite">
          <p className="text-subhead leading-snug">
            {contorno && 'Este LED se marca con contorno: el plano no lo da como la señal sola del elemento. '}
            {foto === 'sin-foto'
              ? `Lo ves ${visto}. La foto de la N2 no muestra este LED.`
              : foto === visto
                ? `Lo ves ${visto}, igual que en la foto de la N2.`
                : `Lo ves ${visto}; en la foto de la N2 estaba ${foto}.`}
          </p>
        </div>
      )}
      <NoIndicaCaja x={{ texto: 'El manual no da el estado normal de cada LED en reposo ni en marcha.', pregunta: PREGUNTAS_TERRENO[6]! }} />
      <section>
        <p className="px-1 pb-2 text-footnote font-semibold text-muted-foreground">Códigos que revisan este elemento</p>
        {codigos.length ? (
          <ChipsCodigos codigos={codigos} onCodigo={onCodigo} />
        ) : (
          <p className="px-1 text-subhead text-muted-foreground">Ningún paso de la tabla de fallos (Manual 2005, p. 41–42) lo nombra.</p>
        )}
      </section>
    </div>
  )
}
